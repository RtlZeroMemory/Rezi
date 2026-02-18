import type { ZrevEvent } from "../../events.js";
import {
  getPaginationControlId,
  getPaginationPageId,
  getPaginationZoneId,
  movePaginationPage,
  parsePaginationId,
} from "../../widgets/pagination.js";
import { computeZoneMovement } from "../focus.js";
import type { FocusZone } from "../focus.js";
import type { EnabledById, RoutedAction, RoutingResultWithZones } from "./types.js";

const ZR_KEY_HOME = 12;
const ZR_KEY_END = 13;
const ZR_KEY_LEFT = 22;
const ZR_KEY_RIGHT = 23;

function isEnabled(enabledById: EnabledById, id: string): boolean {
  return enabledById.get(id) === true;
}

function canPressId(
  enabledById: EnabledById,
  id: string,
  pressableIds?: ReadonlySet<string>,
): boolean {
  return isEnabled(enabledById, id) && (pressableIds === undefined || pressableIds.has(id));
}

function inferTotalPagesFromZone(zone: FocusZone): number | null {
  let maxPage = 0;
  for (const id of zone.focusableIds) {
    const parsed = parsePaginationId(id);
    if (parsed?.kind === "page" && parsed.page > maxPage) {
      maxPage = parsed.page;
    }
  }
  return maxPage > 0 ? maxPage : null;
}

function findZoneForId(zones: ReadonlyMap<string, FocusZone>, id: string): string | null {
  for (const [zoneId, zone] of zones) {
    if (zone.focusableIds.includes(id)) return zoneId;
  }
  return null;
}

export type PaginationRoutingCtx = Readonly<{
  focusedId: string | null;
  activeZoneId: string | null;
  zones: ReadonlyMap<string, FocusZone>;
  enabledById: EnabledById;
  pressableIds?: ReadonlySet<string>;
}>;

/**
 * Route Pagination-specific keyboard behavior.
 *
 * Returns:
 * - `null` when event is unrelated to pagination.
 * - routing object (possibly empty) when pagination handled/consumed the event.
 */
export function routePaginationKey(
  event: ZrevEvent,
  ctx: PaginationRoutingCtx,
): RoutingResultWithZones | null {
  if (event.kind !== "key" || event.action !== "down") return null;
  if (ctx.focusedId === null) return null;

  const parsed = parsePaginationId(ctx.focusedId);
  if (parsed === null) return null;

  const zoneId = getPaginationZoneId(parsed.paginationId);
  const zone = ctx.zones.get(zoneId);
  if (!zone) return Object.freeze({});

  if (event.key === ZR_KEY_LEFT || event.key === ZR_KEY_RIGHT) {
    const direction = event.key === ZR_KEY_LEFT ? "prev" : "next";

    if (parsed.kind === "page") {
      const totalPages = inferTotalPagesFromZone(zone) ?? parsed.page;
      const targetPage = movePaginationPage(parsed.page, totalPages, direction);
      if (targetPage === parsed.page) return Object.freeze({});

      const targetPageId = getPaginationPageId(parsed.paginationId, targetPage);
      if (
        zone.focusableIds.includes(targetPageId) &&
        canPressId(ctx.enabledById, targetPageId, ctx.pressableIds)
      ) {
        const action: RoutedAction = Object.freeze({ id: targetPageId, action: "press" });
        return Object.freeze({
          nextFocusedId: targetPageId,
          nextZoneId: zoneId,
          action,
        });
      }

      const stepControlId = getPaginationControlId(parsed.paginationId, direction);
      if (
        zone.focusableIds.includes(stepControlId) &&
        canPressId(ctx.enabledById, stepControlId, ctx.pressableIds)
      ) {
        const action: RoutedAction = Object.freeze({ id: stepControlId, action: "press" });
        return Object.freeze({
          nextFocusedId: ctx.focusedId,
          nextZoneId: zoneId,
          action,
        });
      }

      return Object.freeze({});
    }

    const nextFocusedId = computeZoneMovement(
      zone,
      ctx.focusedId,
      event.key === ZR_KEY_LEFT ? "left" : "right",
    );

    if (nextFocusedId === null) return Object.freeze({});
    if (nextFocusedId === ctx.focusedId) {
      return Object.freeze({ nextFocusedId, nextZoneId: zoneId });
    }

    const canPress = canPressId(ctx.enabledById, nextFocusedId, ctx.pressableIds);

    const action: RoutedAction | undefined = canPress
      ? Object.freeze({ id: nextFocusedId, action: "press" })
      : undefined;

    return Object.freeze({
      nextFocusedId,
      nextZoneId: zoneId,
      ...(action ? { action } : {}),
    });
  }

  if (event.key === ZR_KEY_HOME || event.key === ZR_KEY_END) {
    const controllingZoneId = ctx.activeZoneId ?? findZoneForId(ctx.zones, ctx.focusedId);
    if (controllingZoneId === null || controllingZoneId !== zoneId) return Object.freeze({});

    const controlId = getPaginationControlId(
      parsed.paginationId,
      event.key === ZR_KEY_HOME ? "first" : "last",
    );

    if (!zone.focusableIds.includes(controlId)) return Object.freeze({});
    if (!isEnabled(ctx.enabledById, controlId)) return Object.freeze({});
    if (ctx.pressableIds !== undefined && !ctx.pressableIds.has(controlId)) {
      return Object.freeze({});
    }

    const action: RoutedAction = Object.freeze({ id: controlId, action: "press" });

    return Object.freeze({
      nextFocusedId: controlId,
      nextZoneId: zoneId,
      action,
    });
  }

  return null;
}
