import { useInkContext } from "../runtime/context.js";

export function useApp() {
  const ctx = useInkContext();
  return { exit: ctx.exit, rerender: ctx.rerender };
}
