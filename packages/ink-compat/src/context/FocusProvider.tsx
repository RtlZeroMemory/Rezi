import type { UiEvent } from "@rezi-ui/core";
import { ZR_KEY_ESCAPE, ZR_KEY_TAB, ZR_MOD_SHIFT } from "@rezi-ui/core/keybindings";
import React from "react";
import { runWithSyncPriority } from "../reconciler.js";
import FocusContext from "./FocusContext.js";
import { useRequiredStdioContext } from "./StdioContext.js";

type Focusable = Readonly<{ id: string; isActive: boolean }>;

type FocusState = Readonly<{
  isFocusEnabled: boolean;
  activeId: string | undefined;
  focusables: readonly Focusable[];
}>;

function findNextFocusable(state: FocusState): string | undefined {
  const activeIndex = state.focusables.findIndex((f) => f.id === state.activeId);
  for (let i = activeIndex + 1; i < state.focusables.length; i++) {
    const f = state.focusables[i];
    if (f?.isActive) return f.id;
  }
  return undefined;
}

function findPreviousFocusable(state: FocusState): string | undefined {
  const activeIndex = state.focusables.findIndex((f) => f.id === state.activeId);
  for (let i = activeIndex - 1; i >= 0; i--) {
    const f = state.focusables[i];
    if (f?.isActive) return f.id;
  }
  return undefined;
}

export default function FocusProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { internal_eventEmitter } = useRequiredStdioContext();

  const [state, setState] = React.useState<FocusState>({
    isFocusEnabled: true,
    activeId: undefined,
    focusables: [],
  });

  const setStateSync = React.useCallback((updater: (previousState: FocusState) => FocusState) => {
    runWithSyncPriority(() => {
      setState(updater);
    });
  }, []);

  // Avoid re-subscribing to input events on every focus change.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const add = React.useCallback(
    (id: string, options: Readonly<{ autoFocus: boolean }>) => {
      setStateSync((previousState) => {
        let nextActiveId = previousState.activeId;
        if (!nextActiveId && options.autoFocus) nextActiveId = id;

        return {
          ...previousState,
          activeId: nextActiveId,
          focusables: [...previousState.focusables, { id, isActive: true }],
        };
      });
    },
    [setStateSync],
  );

  const remove = React.useCallback(
    (id: string) => {
      setStateSync((previousState) => ({
        ...previousState,
        activeId: previousState.activeId === id ? undefined : previousState.activeId,
        focusables: previousState.focusables.filter((f) => f.id !== id),
      }));
    },
    [setStateSync],
  );

  const activate = React.useCallback(
    (id: string) => {
      setStateSync((previousState) => ({
        ...previousState,
        focusables: previousState.focusables.map((f) => (f.id === id ? { id, isActive: true } : f)),
      }));
    },
    [setStateSync],
  );

  const deactivate = React.useCallback(
    (id: string) => {
      setStateSync((previousState) => ({
        ...previousState,
        activeId: previousState.activeId === id ? undefined : previousState.activeId,
        focusables: previousState.focusables.map((f) =>
          f.id === id ? { id, isActive: false } : f,
        ),
      }));
    },
    [setStateSync],
  );

  const enableFocus = React.useCallback(() => {
    setStateSync((previousState) => ({ ...previousState, isFocusEnabled: true }));
  }, [setStateSync]);

  const disableFocus = React.useCallback(() => {
    setStateSync((previousState) => ({ ...previousState, isFocusEnabled: false }));
  }, [setStateSync]);

  const focus = React.useCallback(
    (id: string) => {
      setStateSync((previousState) => {
        const found = previousState.focusables.some((f) => f.id === id);
        return found ? { ...previousState, activeId: id } : previousState;
      });
    },
    [setStateSync],
  );

  const focusNext = React.useCallback(() => {
    setStateSync((previousState) => {
      const firstActiveId = previousState.focusables.find((f) => f.isActive)?.id;
      const nextId = findNextFocusable(previousState);
      return { ...previousState, activeId: nextId ?? firstActiveId };
    });
  }, [setStateSync]);

  const focusPrevious = React.useCallback(() => {
    setStateSync((previousState) => {
      let lastActiveId: string | undefined = undefined;
      for (let i = previousState.focusables.length - 1; i >= 0; i--) {
        const f = previousState.focusables[i];
        if (f?.isActive) {
          lastActiveId = f.id;
          break;
        }
      }
      const prevId = findPreviousFocusable(previousState);
      return { ...previousState, activeId: prevId ?? lastActiveId };
    });
  }, [setStateSync]);

  React.useEffect(() => {
    const onInput = (ev: UiEvent) => {
      if (ev.kind !== "engine") return;
      const e = ev.event;
      if (e.kind !== "key") return;
      if (e.action !== "down") return;

      const s = stateRef.current;

      // Mirror Ink: ESC clears focus if there is an active focused component.
      if (e.key === ZR_KEY_ESCAPE && s.activeId !== undefined) {
        setStateSync((prev) =>
          prev.activeId === undefined ? prev : { ...prev, activeId: undefined },
        );
        return;
      }

      if (!s.isFocusEnabled || s.focusables.length === 0) return;

      // Mirror Ink: TAB cycles focus; SHIFT+TAB reverses.
      if (e.key === ZR_KEY_TAB) {
        if ((e.mods & ZR_MOD_SHIFT) !== 0) focusPrevious();
        else focusNext();
      }
    };

    internal_eventEmitter.on("input", onInput);
    return () => {
      internal_eventEmitter.removeListener("input", onInput);
    };
  }, [focusNext, focusPrevious, internal_eventEmitter, setStateSync]);

  const value = React.useMemo(
    () => ({
      activeId: state.activeId,
      add,
      remove,
      activate,
      deactivate,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
    }),
    [
      state.activeId,
      add,
      remove,
      activate,
      deactivate,
      enableFocus,
      disableFocus,
      focusNext,
      focusPrevious,
      focus,
    ],
  );

  return <FocusContext.Provider value={value}>{children}</FocusContext.Provider>;
}
