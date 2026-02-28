import type { RouteId } from "../types.js";

export type ResponsiveLayout = Readonly<{
  width: number;
  height: number;
  wide: boolean;
  stackRightRail: boolean;
  compactSidebar: boolean;
  hideNonCritical: boolean;
}>;

export type ViewportSnapshot = Readonly<{
  width: number;
  height: number;
}>;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toPositiveInt(value: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  if (value >= 0) return Math.floor(value);
  return Math.ceil(value);
}

export function resolveLayout(viewport: ViewportSnapshot): ResponsiveLayout {
  const width = clamp(toPositiveInt(viewport.width, 96), 40, 500);
  const height = clamp(toPositiveInt(viewport.height, 32), 18, 200);
  const wide = width >= 120;
  const stackRightRail = width < 120;
  const compactSidebar = width < 90;
  const hideNonCritical = width < 80 || height < 26;

  return Object.freeze({
    width,
    height,
    wide,
    stackRightRail,
    compactSidebar,
    hideNonCritical,
  });
}

const COMPACT_ROUTE_LABEL: Readonly<Record<RouteId, string>> = Object.freeze({
  bridge: "Br",
  engineering: "Eng",
  crew: "Crew",
  comms: "Com",
  cargo: "Cargo",
  settings: "Set",
});

export function routeLabel(routeId: RouteId, title: string, compact: boolean): string {
  if (!compact) return title;
  return COMPACT_ROUTE_LABEL[routeId] ?? title;
}

export function padLabel(label: string, width: number): string {
  return label.length >= width ? label.slice(0, width) : label.padEnd(width, " ");
}
