import { useRequiredStdioContext } from "../context/StdioContext.js";

/**
 * Ink-compatible `useStdout()` hook.
 *
 * Note: direct writes bypass Rezi's renderer and may interfere with UI output.
 */
export default function useStdout() {
  const ctx = useRequiredStdioContext();
  return {
    stdout: ctx.stdout,
    write: (data: string): void => {
      ctx.internal_writeToStdout(data);
    },
  };
}
