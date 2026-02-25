import { useInkContext } from "../runtime/context.js";

export function useStderr() {
  const ctx = useInkContext();
  return {
    stderr: ctx.stderr,
    write: (data: string) => {
      ctx.writeStderr(data);
    },
  };
}
