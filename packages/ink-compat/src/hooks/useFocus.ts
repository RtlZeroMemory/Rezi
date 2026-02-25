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

  return { isFocused: ctx.getFocusedId() === focusId };
}
