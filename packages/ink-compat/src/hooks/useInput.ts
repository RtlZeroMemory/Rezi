import { useEffect } from "react";

import { useInkContext, type Key } from "../runtime/context.js";

export type { Key };

export function useInput(
  handler: (input: string, key: Key) => void,
  options?: { isActive?: boolean },
): void {
  const ctx = useInkContext();

  useEffect(() => {
    if (options?.isActive === false) return;
    if (!ctx.isRawModeSupported) return;
    ctx.setRawMode(true);
    return () => {
      ctx.setRawMode(false);
    };
  }, [ctx, options?.isActive]);

  useEffect(() => {
    if (options?.isActive === false) return;
    return ctx.onKeyEvent(handler);
  }, [ctx, handler, options?.isActive]);
}
