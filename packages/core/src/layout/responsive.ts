/**
 * packages/core/src/layout/responsive.ts — Viewport breakpoint helpers.
 */

export type ViewportBreakpoint = "sm" | "md" | "lg" | "xl";
export type ResponsiveValue<T> = T | Readonly<Partial<Record<ViewportBreakpoint, T>>>;

export type ResponsiveBreakpointThresholds = Readonly<{
  smMax: number;
  mdMax: number;
  lgMax: number;
}>;

export type ResponsiveViewportSnapshot = Readonly<{
  width: number;
  height: number;
  breakpoint: ViewportBreakpoint;
}>;

const DEFAULT_THRESHOLDS: ResponsiveBreakpointThresholds = Object.freeze({
  smMax: 79,
  mdMax: 119,
  lgMax: 159,
});

let activeThresholds: ResponsiveBreakpointThresholds = DEFAULT_THRESHOLDS;
let activeViewport: ResponsiveViewportSnapshot = Object.freeze({
  width: 0,
  height: 0,
  breakpoint: "sm",
});

function normalizeThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  return n <= 0 ? fallback : n;
}

export function normalizeBreakpointThresholds(
  value: Partial<ResponsiveBreakpointThresholds> | undefined,
): ResponsiveBreakpointThresholds {
  const smMax = normalizeThreshold(value?.smMax, DEFAULT_THRESHOLDS.smMax);
  const mdMax = normalizeThreshold(value?.mdMax, DEFAULT_THRESHOLDS.mdMax);
  const lgMax = normalizeThreshold(value?.lgMax, DEFAULT_THRESHOLDS.lgMax);
  const sorted = [smMax, mdMax, lgMax].sort((a, b) => a - b);
  return Object.freeze({
    smMax: sorted[0] ?? DEFAULT_THRESHOLDS.smMax,
    mdMax: sorted[1] ?? DEFAULT_THRESHOLDS.mdMax,
    lgMax: sorted[2] ?? DEFAULT_THRESHOLDS.lgMax,
  });
}

export function resolveViewportBreakpoint(
  width: number,
  thresholds: ResponsiveBreakpointThresholds,
): ViewportBreakpoint {
  const w = Number.isFinite(width) ? Math.max(0, Math.trunc(width)) : 0;
  if (w <= thresholds.smMax) return "sm";
  if (w <= thresholds.mdMax) return "md";
  if (w <= thresholds.lgMax) return "lg";
  return "xl";
}

export function setResponsiveViewport(
  width: number,
  height: number,
  thresholds: ResponsiveBreakpointThresholds = activeThresholds,
): void {
  activeThresholds = thresholds;
  activeViewport = Object.freeze({
    width: Math.max(0, Math.trunc(width)),
    height: Math.max(0, Math.trunc(height)),
    breakpoint: resolveViewportBreakpoint(width, thresholds),
  });
}

export function getResponsiveViewport(): ResponsiveViewportSnapshot {
  return activeViewport;
}

function isResponsiveMap(value: unknown): value is Partial<Record<ViewportBreakpoint, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return "sm" in obj || "md" in obj || "lg" in obj || "xl" in obj;
}

function breakpointPriority(breakpoint: ViewportBreakpoint): readonly ViewportBreakpoint[] {
  switch (breakpoint) {
    case "sm":
      return ["sm", "md", "lg", "xl"];
    case "md":
      return ["md", "sm", "lg", "xl"];
    case "lg":
      return ["lg", "md", "xl", "sm"];
    case "xl":
      return ["xl", "lg", "md", "sm"];
    default:
      return ["md", "sm", "lg", "xl"];
  }
}

export function resolveResponsiveValue(value: unknown): unknown {
  if (!isResponsiveMap(value)) return value;
  const order = breakpointPriority(activeViewport.breakpoint);
  for (const key of order) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const selected = (value as Record<ViewportBreakpoint, unknown>)[key];
      if (selected !== undefined) return selected;
    }
  }
  return value;
}
