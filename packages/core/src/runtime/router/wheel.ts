import type { ZrevEvent } from "../../protocol/types.js";

export type WheelRoutingCtx = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

export type WheelRoutingResult = Readonly<{
  nextScrollX?: number;
  nextScrollY?: number;
}>;

const SCROLL_LINES = 3;

export function routeWheel(event: ZrevEvent, ctx: WheelRoutingCtx): WheelRoutingResult {
  if (event.kind !== "mouse" || event.mouseKind !== 5) return Object.freeze({});

  const deltaY = event.wheelY * SCROLL_LINES;
  const deltaX = event.wheelX * SCROLL_LINES;

  const maxScrollY = Math.max(0, ctx.contentHeight - ctx.viewportHeight);
  const maxScrollX = Math.max(0, ctx.contentWidth - ctx.viewportWidth);

  const nextScrollY = Math.max(0, Math.min(maxScrollY, ctx.scrollY + deltaY));
  const nextScrollX = Math.max(0, Math.min(maxScrollX, ctx.scrollX + deltaX));

  const changed = nextScrollY !== ctx.scrollY || nextScrollX !== ctx.scrollX;
  if (!changed) return Object.freeze({});

  return Object.freeze({ nextScrollX, nextScrollY });
}
