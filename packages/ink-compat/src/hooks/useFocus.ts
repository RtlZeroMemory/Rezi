import { useEffect, useId, useState } from "react";

import { useInkContext } from "../runtime/context.js";

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
    ctx.setRawMode(true);
    return () => {
      ctx.setRawMode(false);
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
