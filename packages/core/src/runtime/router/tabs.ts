import type { ZrevEvent } from "../../events.js";
import {
  getTabsBarZoneId,
  parseTabsContentZoneId,
  parseTabsTriggerId,
} from "../../widgets/tabs.js";
import { computeZoneMovement } from "../focus.js";
import type { FocusZone } from "../focus.js";
import type { EnabledById, RoutedAction, RoutingResultWithZones } from "./types.js";

const ZR_KEY_ESCAPE = 1;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;

function isEnabled(enabledById: EnabledById, id: string): boolean {
  return enabledById.get(id) === true;
}

function findZoneForId(zones: ReadonlyMap<string, FocusZone>, id: string): string | null {
  for (const [zoneId, zone] of zones) {
    if (zone.focusableIds.includes(id)) return zoneId;
  }
  return null;
}

function resolveTabsIdFromZone(
  zones: ReadonlyMap<string, FocusZone>,
  startZoneId: string,
): string | null {
  const visited = new Set<string>();
  let cursor: string | null = startZoneId;

  while (cursor !== null) {
    if (visited.has(cursor)) return null;
    visited.add(cursor);

    const tabsId = parseTabsContentZoneId(cursor);
    if (tabsId !== null) return tabsId;

    const parentId: string | null = zones.get(cursor)?.parentZoneId ?? null;
    cursor = parentId;
  }

  return null;
}

export type TabsRoutingCtx = Readonly<{
  focusedId: string | null;
  activeZoneId: string | null;
  zones: ReadonlyMap<string, FocusZone>;
  lastFocusedByZone?: ReadonlyMap<string, string>;
  enabledById: EnabledById;
  pressableIds?: ReadonlySet<string>;
}>;

/**
 * Route Tabs-specific keyboard behavior.
 *
 * Returns:
 * - `null` when event is unrelated to tabs (let generic routing continue)
 * - routing object (possibly empty) when tabs handled/consumed the event.
 */
export function routeTabsKey(event: ZrevEvent, ctx: TabsRoutingCtx): RoutingResultWithZones | null {
  if (event.kind !== "key" || event.action !== "down") return null;
  if (ctx.focusedId === null) return null;

  const focusedId = ctx.focusedId;
  const parsedTrigger = parseTabsTriggerId(focusedId);

  if (parsedTrigger && (event.key === ZR_KEY_LEFT || event.key === ZR_KEY_RIGHT)) {
    const zoneId = getTabsBarZoneId(parsedTrigger.tabsId);
    const zone = ctx.zones.get(zoneId);
    if (!zone) return Object.freeze({});

    const nextFocusedId = computeZoneMovement(
      zone,
      focusedId,
      event.key === ZR_KEY_LEFT ? "left" : "right",
    );

    if (nextFocusedId === null) return Object.freeze({});
    if (nextFocusedId === focusedId) {
      return Object.freeze({ nextFocusedId, nextZoneId: zoneId });
    }

    const canPress =
      isEnabled(ctx.enabledById, nextFocusedId) &&
      (ctx.pressableIds === undefined || ctx.pressableIds.has(nextFocusedId));

    const action: RoutedAction | undefined = canPress
      ? Object.freeze({ id: nextFocusedId, action: "press" })
      : undefined;

    return Object.freeze({
      nextFocusedId,
      nextZoneId: zoneId,
      ...(action ? { action } : {}),
    });
  }

  if (event.key === ZR_KEY_ESCAPE) {
    const zoneId = ctx.activeZoneId ?? findZoneForId(ctx.zones, focusedId);
    if (zoneId === null) return null;

    const tabsId = resolveTabsIdFromZone(ctx.zones, zoneId);
    if (tabsId === null) return null;

    const barZoneId = getTabsBarZoneId(tabsId);
    const barZone = ctx.zones.get(barZoneId);
    if (!barZone) return Object.freeze({});

    let target = ctx.lastFocusedByZone?.get(barZoneId) ?? null;
    if (target !== null && !barZone.focusableIds.includes(target)) {
      target = null;
    }
    if (target === null) {
      target = barZone.focusableIds[0] ?? null;
    }

    return Object.freeze({
      nextFocusedId: target,
      nextZoneId: barZoneId,
    });
  }

  return null;
}
