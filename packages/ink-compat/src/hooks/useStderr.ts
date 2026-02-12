import { useRequiredStdioContext } from "../context/StdioContext.js";

/**
 * Ink-compatible `useStderr()` hook.
 *
 * Note: direct writes bypass Rezi's renderer and may interfere with UI output.
 */
export default function useStderr() {
  const ctx = useRequiredStdioContext();
  return {
    stderr: ctx.stderr,
    write: (data: string): void => {
      ctx.internal_writeToStderr(data);
    },
  };
}
