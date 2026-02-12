import type { ZrevEvent } from "../../events.js";
import type { FocusDirection, FocusMove, FocusZone } from "../focus.js";
import { computeMovedFocusId, computeZoneMovement, computeZoneTraversal } from "../focus.js";
import type {
  EnabledById,
  KeyRoutingCtxWithZones,
  RoutedAction,
  RoutingResultWithZones,
} from "./types.js";

/* --- Key Codes and Modifier Bits (locked by engine ABI) --- */
/* MUST match packages/core/src/keybindings/keyCodes.ts */
const ZR_KEY_ENTER = 2;
const ZR_KEY_TAB = 3;
const ZR_KEY_UP = 20;
const ZR_KEY_DOWN = 21;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;
const ZR_KEY_SPACE = 32; /* Space as ASCII codepoint in ZREV key events */
const ZR_MOD_SHIFT = 1 << 0;

function isEnabled(enabledById: EnabledById, id: string): boolean {
  return enabledById.get(id) === true;
}

/**
 * Find which zone contains a given focusable id.
 */
function findZoneForId(zones: ReadonlyMap<string, FocusZone>, focusedId: string): string | null {
  for (const [zoneId, zone] of zones) {
    if (zone.focusableIds.includes(focusedId)) {
      return zoneId;
    }
  }
  return null;
}

/**
 * Map key code to focus direction.
 */
function keyToDirection(key: number): FocusDirection | null {
  switch (key) {
    case ZR_KEY_UP:
      return "up";
    case ZR_KEY_DOWN:
      return "down";
    case ZR_KEY_LEFT:
      return "left";
    case ZR_KEY_RIGHT:
      return "right";
    default:
      return null;
  }
}

/**
 * Zone and trap-aware KEY routing.
 *
 * Routing logic:
 * 1. TAB/Shift+TAB:
 *    - If in active trap → wrap within trap
 *    - Else if zones exist → move to next/prev zone
 *    - Else → use existing computeMovedFocusId
 * 2. Arrow keys:
 *    - If focused widget is in a zone with navigation !== "none" → compute zone movement
 * 3. Enter/Space: Unchanged press action
 */
export function routeKeyWithZones(
  event: ZrevEvent,
  ctx: KeyRoutingCtxWithZones,
): RoutingResultWithZones {
  if (event.kind !== "key") return Object.freeze({});
  if (event.action !== "down") return Object.freeze({});

  const {
    focusedId,
    activeZoneId,
    zones,
    lastFocusedByZone,
    traps,
    trapStack,
    focusList,
    enabledById,
    pressableIds,
  } = ctx;

  // Check if we're in an active trap
  const activeTrapIdMaybe = trapStack.length > 0 ? trapStack[trapStack.length - 1] : undefined;
  const activeTrapId = activeTrapIdMaybe ?? null;
  const activeTrap = activeTrapId !== null ? traps.get(activeTrapId) : undefined;
  const inActiveTrap = activeTrap?.active === true;

  // TAB handling
  if (event.key === ZR_KEY_TAB) {
    const move: FocusMove = (event.mods & ZR_MOD_SHIFT) !== 0 ? "prev" : "next";

    // If in active trap, wrap within trap
    if (inActiveTrap && activeTrap) {
      const trapFocusables = activeTrap.focusableIds;
      if (trapFocusables.length === 0) {
        return Object.freeze({});
      }
      const nextFocusedId = computeMovedFocusId(trapFocusables, focusedId, move);
      return Object.freeze({ nextFocusedId });
    }

    // If zones exist, do zone-to-zone traversal
    if (zones.size > 0) {
      const result = computeZoneTraversal(
        zones,
        activeZoneId,
        move,
        trapStack,
        traps,
        lastFocusedByZone,
      );
      return Object.freeze({
        nextFocusedId: result.nextFocusedId,
        nextZoneId: result.nextZoneId,
      });
    }

    // Fall back to standard linear traversal
    const nextFocusedId = computeMovedFocusId(focusList, focusedId, move);
    return Object.freeze({ nextFocusedId });
  }

  // Arrow key handling
  const direction = keyToDirection(event.key);
  if (direction !== null && focusedId !== null) {
    // Find the zone containing the focused element
    const containingZoneId = activeZoneId ?? findZoneForId(zones, focusedId);
    if (containingZoneId !== null) {
      const zone = zones.get(containingZoneId);
      if (zone && zone.navigation !== "none") {
        const nextFocusedId = computeZoneMovement(zone, focusedId, direction);
        if (nextFocusedId !== null) {
          return Object.freeze({ nextFocusedId, nextZoneId: containingZoneId });
        }
      }
    }
    return Object.freeze({});
  }

  // Enter/Space handling (unchanged)
  if (event.key === ZR_KEY_ENTER || event.key === ZR_KEY_SPACE) {
    if (focusedId !== null && isEnabled(enabledById, focusedId)) {
      if (pressableIds && !pressableIds.has(focusedId)) return Object.freeze({});
      const action: RoutedAction = Object.freeze({ id: focusedId, action: "press" });
      return Object.freeze({ action });
    }
    return Object.freeze({});
  }

  return Object.freeze({});
}
