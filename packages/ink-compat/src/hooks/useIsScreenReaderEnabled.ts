import { useInkContext } from "../runtime/context.js";

export function useIsScreenReaderEnabled(): boolean {
  const ctx = useInkContext();
  return ctx.isScreenReaderEnabled;
}
