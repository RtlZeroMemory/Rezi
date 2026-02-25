import { useInkContext } from "../runtime/context.js";

export function useFocusManager() {
  const ctx = useInkContext();
  return {
    enableFocus: () => ctx.setFocusEnabled(true),
    disableFocus: () => ctx.setFocusEnabled(false),
    focusNext: () => ctx.focusNext(),
    focusPrevious: () => ctx.focusPrevious(),
    focus: (id: string) => ctx.focusById(id),
    activeId: ctx.getFocusedId(),
  };
}
