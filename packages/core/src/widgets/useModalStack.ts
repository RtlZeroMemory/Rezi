/**
 * packages/core/src/widgets/useModalStack.ts — LIFO modal stack helper.
 */

import type { WidgetContext } from "./composition.js";
import type { ModalProps, VNode } from "./types.js";
import { ui } from "./ui.js";

export type ModalStackEntry = Readonly<{
  id: string;
  keyVersion: number;
  focusTarget: string | null;
  props: Omit<ModalProps, "id">;
}>;

export type UseModalStack = Readonly<{
  push: (id: string, props: Omit<ModalProps, "id">) => void;
  pop: () => void;
  clear: () => void;
  current: () => string | null;
  size: number;
  render: () => readonly VNode[];
}>;

function firstActionFocusTarget(actions: readonly VNode[] | undefined): string | null {
  if (!actions) return null;
  for (const action of actions) {
    if (action.kind !== "button") continue;
    const id = (action.props as { id?: unknown }).id;
    if (typeof id === "string" && id.length > 0) {
      return id;
    }
  }
  return null;
}

function resolveFocusTarget(props: Omit<ModalProps, "id">): string | null {
  if (typeof props.initialFocus === "string" && props.initialFocus.length > 0) {
    return props.initialFocus;
  }
  return firstActionFocusTarget(props.actions);
}

export function useModalStack<State = void>(ctx: WidgetContext<State>): UseModalStack {
  const [stack, setStack] = ctx.useState<readonly ModalStackEntry[]>(() => Object.freeze([]));

  const push = ctx.useCallback((id: string, props: Omit<ModalProps, "id">) => {
    setStack((prev) => {
      const previousTop = prev[prev.length - 1];
      const returnFocusTo = props.returnFocusTo ?? previousTop?.focusTarget ?? undefined;
      const mergedProps =
        returnFocusTo !== undefined
          ? Object.freeze({ ...props, returnFocusTo })
          : Object.freeze({ ...props });
      const entry: ModalStackEntry = Object.freeze({
        id,
        keyVersion: 0,
        focusTarget: resolveFocusTarget(mergedProps),
        props: mergedProps,
      });
      return Object.freeze([...prev, entry]);
    });
  }, []);

  const pop = ctx.useCallback(() => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      if (prev.length === 1) return Object.freeze([]);

      const remaining = prev.slice(0, -1);
      const topIndex = remaining.length - 1;
      const top = remaining[topIndex];
      if (!top) return Object.freeze(remaining);

      // When revealing the previous modal, bump key so initialFocus is reapplied.
      const nextTop: ModalStackEntry = Object.freeze({
        ...top,
        keyVersion: top.keyVersion + 1,
        props: Object.freeze({
          ...top.props,
          ...(top.focusTarget ? { initialFocus: top.focusTarget } : {}),
        }),
      });
      const next = remaining.slice(0, topIndex).concat(nextTop);
      return Object.freeze(next);
    });
  }, []);

  const clear = ctx.useCallback(() => {
    setStack((prev) => (prev.length === 0 ? prev : Object.freeze([])));
  }, []);

  const current = ctx.useCallback(() => {
    const top = stack[stack.length - 1];
    return top?.id ?? null;
  }, [stack]);

  const render = ctx.useCallback(() => {
    return Object.freeze(
      stack.map((entry, index) => {
        const isTop = index === stack.length - 1;
        const userOnClose = entry.props.onClose;
        return ui.modal({
          ...entry.props,
          id: entry.id,
          key: `${entry.id}-${String(entry.keyVersion)}`,
          onClose: () => {
            userOnClose?.();
            if (isTop) {
              pop();
              return;
            }
            setStack((prev) => {
              const removeIndex = prev.findIndex((candidate) => candidate.id === entry.id);
              if (removeIndex < 0) return prev;
              const next = prev.slice(0, removeIndex).concat(prev.slice(removeIndex + 1));
              return Object.freeze(next);
            });
          },
        });
      }),
    );
  }, [stack, pop]);

  return Object.freeze({
    push,
    pop,
    clear,
    current,
    size: stack.length,
    render,
  });
}
