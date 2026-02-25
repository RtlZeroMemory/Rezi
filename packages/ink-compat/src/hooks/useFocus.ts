import { useEffect, useId, useState } from "react";

import { type InkContextValue, useInkContext } from "../runtime/context.js";

const rawModeRefCounts = new WeakMap<InkContextValue, number>();

function retainRawMode(ctx: InkContextValue): void {
  const count = rawModeRefCounts.get(ctx) ?? 0;
  if (count === 0) {
    ctx.setRawMode(true);
  }
  rawModeRefCounts.set(ctx, count + 1);
}

function releaseRawMode(ctx: InkContextValue): void {
  const count = rawModeRefCounts.get(ctx) ?? 0;
  if (count <= 0) {
    return;
  }
  if (count === 1) {
    rawModeRefCounts.delete(ctx);
    ctx.setRawMode(false);
    return;
  }
  rawModeRefCounts.set(ctx, count - 1);
}

export function useFocus(options?: { autoFocus?: boolean; isActive?: boolean; id?: string }) {
  const autoId = useId();
  const focusId = options?.id ?? autoId;
  const ctx = useInkContext();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (options?.isActive === false) return;
    const registerOptions =
      options?.autoFocus === undefined ? undefined : { autoFocus: options.autoFocus };
    ctx.registerFocusable(focusId, registerOptions);
    // Force re-render so the component picks up the focus state
    // (focusedId lives on the bridge, not in React state)
    setTick((t) => t + 1);
    return () => ctx.unregisterFocusable(focusId);
  }, [ctx, focusId, options?.autoFocus, options?.isActive]);

  useEffect(() => {
    if (options?.isActive === false) return;
    if (!ctx.isRawModeSupported) return;
    retainRawMode(ctx);
    return () => {
      releaseRawMode(ctx);
    };
  }, [ctx, options?.isActive]);

  return {
    isFocused: ctx.getFocusedId() === focusId,
    focus: () => {
      ctx.focusById(focusId);
      ctx.rerender();
    },
  };
}
