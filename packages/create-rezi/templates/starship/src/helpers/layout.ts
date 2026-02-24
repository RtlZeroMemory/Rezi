import type { RouteId } from "../types.js";

export type ResponsiveLayout = Readonly<{
  width: number;
  height: number;
  wide: boolean;
  stackRightRail: boolean;
  compactSidebar: boolean;
  hideNonCritical: boolean;
  sidebarWidth: number;
  crewMasterWidth: number;
  chartWidth: number;
  canvasWidth: number;
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

export function resolveLayout(viewport: ViewportSnapshot): ResponsiveLayout {
  const width = Math.max(40, Math.floor(viewport.width));
  const height = Math.max(18, Math.floor(viewport.height));
  const wide = width >= 120;
  const stackRightRail = width < 120;
  const compactSidebar = width < 90;
  const hideNonCritical = width < 80 || height < 26;
  const sidebarWidth = compactSidebar ? 18 : 34;

  return Object.freeze({
    width,
    height,
    wide,
    stackRightRail,
    compactSidebar,
    hideNonCritical,
    sidebarWidth,
    crewMasterWidth: wide ? 60 : 100,
    chartWidth: clamp(Math.floor(width * (wide ? 0.5 : 0.9)), 28, 132),
    canvasWidth: clamp(Math.floor(width * (wide ? 0.48 : 0.9)), 26, 116),
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
