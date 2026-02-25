import { useCallback, useEffect } from "react";

import type { CursorPosition } from "../runtime/context.js";
import { useInkContext } from "../runtime/context.js";

export function useCursor() {
  const ctx = useInkContext();

  const setCursorPosition = useCallback(
    (position: CursorPosition | undefined): void => {
      ctx.setCursorPosition(position);
    },
    [ctx],
  );

  useEffect(() => {
    return () => {
      ctx.setCursorPosition(undefined);
    };
  }, [ctx]);

  return { setCursorPosition };
}
