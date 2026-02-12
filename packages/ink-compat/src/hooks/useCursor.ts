import { useCallback, useContext, useInsertionEffect, useRef } from "react";
import CursorContext from "../context/CursorContext.js";
import type { CursorPosition } from "../logUpdate.js";

/**
 * `useCursor` is a React hook that lets you control the terminal cursor position.
 *
 * Mirrors Ink v6.7.0 semantics: cursor position is propagated during commit
 * (via `useInsertionEffect`) to avoid leaking cursor state from abandoned
 * concurrent renders.
 */
export default function useCursor() {
  const context = useContext(CursorContext);
  const positionRef = useRef<CursorPosition | undefined>(undefined);

  const setCursorPosition = useCallback((position: CursorPosition | undefined) => {
    positionRef.current = position;
  }, []);

  useInsertionEffect(() => {
    context.setCursorPosition(positionRef.current);
    return () => {
      context.setCursorPosition(undefined);
    };
  });

  return { setCursorPosition };
}

