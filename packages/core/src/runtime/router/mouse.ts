import type { ZrevEvent } from "../../events.js";
import { ZR_MOUSE_DOWN, ZR_MOUSE_UP } from "../../protocol/mouseKinds.js";
import type { EnabledById, MouseRoutingCtx, RoutedAction, RoutingResult } from "./types.js";

function isEnabled(enabledById: EnabledById, id: string): boolean {
  return enabledById.get(id) === true;
}

/**
 * Deterministic MOUSE routing rules (docs/10 "Routing").
 *
 * pressedId is runtime-local and MUST be maintained by the caller.
 */
export function routeMouse(event: ZrevEvent, ctx: MouseRoutingCtx): RoutingResult {
  if (event.kind !== "mouse") return Object.freeze({});

  const targetId = ctx.hitTestTargetId;

  if (event.mouseKind === ZR_MOUSE_DOWN) {
    if (targetId !== null && isEnabled(ctx.enabledById, targetId)) {
      const pressable = ctx.pressableIds ? ctx.pressableIds.has(targetId) : true;
      return Object.freeze({ nextFocusedId: targetId, nextPressedId: pressable ? targetId : null });
    }
    return Object.freeze({ nextPressedId: null });
  }

  if (event.mouseKind === ZR_MOUSE_UP) {
    const pressedId = ctx.pressedId;
    if (
      pressedId !== null &&
      targetId !== null &&
      targetId === pressedId &&
      isEnabled(ctx.enabledById, pressedId) &&
      (ctx.pressableIds ? ctx.pressableIds.has(pressedId) : true)
    ) {
      const action: RoutedAction = Object.freeze({ id: pressedId, action: "press" });
      return Object.freeze({ nextPressedId: null, action });
    }
    return Object.freeze({ nextPressedId: null });
  }

  // move/drag/wheel ignored in MVP; do not modify pressedId.
  return Object.freeze({});
}
