import { useCallback, useEffect, useRef, useState } from "react";

import type { CursorPosition } from "../runtime/context.js";
import { useInkContext } from "../runtime/context.js";

export function useCursor() {
  const ctx = useInkContext();
  const positionRef = useRef<CursorPosition | undefined>(undefined);
  const [, setVersion] = useState(0);

  const setCursorPosition = useCallback((position: CursorPosition | undefined): void => {
    positionRef.current = position;
    ctx.setCursorPosition(position);
    setVersion((value) => value + 1);
  }, [ctx]);

  useEffect(() => {
    return () => {
      ctx.setCursorPosition(undefined);
    };
  }, [ctx]);

  return { setCursorPosition };
}
