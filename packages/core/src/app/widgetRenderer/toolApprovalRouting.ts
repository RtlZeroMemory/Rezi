import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_TAB,
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import type { ToolApprovalDialogProps } from "../../widgets/types.js";

export type ToolApprovalAction = "allow" | "deny" | "allowSession";

export function routeToolApprovalDialogKeyDown(
  event: ZrevEvent,
  toolDialog: ToolApprovalDialogProps,
  focusedActionById: Map<string, ToolApprovalAction>,
): boolean {
  if (event.kind !== "key" || event.action !== "down") return false;
  if (toolDialog.open !== true) return false;

  const keyCode = event.key;
  const Y = 89;
  const N = 78;
  const S = 83;

  const actions: readonly ToolApprovalAction[] = toolDialog.onAllowForSession
    ? Object.freeze(["allow", "deny", "allowSession"])
    : Object.freeze(["allow", "deny"]);

  const focusedAction =
    focusedActionById.get(toolDialog.id) ?? toolDialog.focusedAction ?? actions[0] ?? "allow";

  if (keyCode === ZR_KEY_ESCAPE) {
    toolDialog.onPress("deny");
    toolDialog.onClose();
    return true;
  }

  if (keyCode === ZR_KEY_TAB) {
    const dir = (event.mods & ZR_MOD_SHIFT) !== 0 ? -1 : 1;
    const curIdx = actions.indexOf(focusedAction);
    const startIdx = curIdx >= 0 ? curIdx : 0;
    const nextIdx = (startIdx + dir + actions.length) % actions.length;
    const next = actions[nextIdx] ?? actions[0] ?? "allow";
    focusedActionById.set(toolDialog.id, next);
    return true;
  }

  if (keyCode === Y) {
    toolDialog.onPress("allow");
    toolDialog.onClose();
    return true;
  }
  if (keyCode === N) {
    toolDialog.onPress("deny");
    toolDialog.onClose();
    return true;
  }
  if (keyCode === S && toolDialog.onAllowForSession) {
    toolDialog.onAllowForSession();
    toolDialog.onClose();
    return true;
  }
  if (keyCode === ZR_KEY_ENTER) {
    if (focusedAction === "deny") toolDialog.onPress("deny");
    else if (focusedAction === "allowSession" && toolDialog.onAllowForSession)
      toolDialog.onAllowForSession();
    else toolDialog.onPress("allow");
    toolDialog.onClose();
    return true;
  }

  return false;
}
