import { useInkContext } from "../runtime/context.js";

export function useStdout() {
  const ctx = useInkContext();
  return {
    stdout: ctx.stdout,
    write: (data: string) => {
      ctx.writeStdout(data);
    },
  };
}
