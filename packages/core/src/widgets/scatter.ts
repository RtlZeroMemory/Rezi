import type { ChartAxis, ScatterPoint } from "./types.js";

export type ScatterRange = Readonly<{
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}>;

export type ScatterPixelPoint = Readonly<{
  x: number;
  y: number;
  color?: string;
}>;

function readFinite(value: number | undefined): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function computeAutoRange(
  values: readonly number[],
): Readonly<{ min: number; max: number }> | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const next = readFinite(value);
    if (next === undefined) continue;
    if (next < min) min = next;
    if (next > max) max = next;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return Object.freeze({ min, max });
}

function computeAxisRange(
  values: readonly number[],
  axis: ChartAxis | undefined,
): Readonly<{ min: number; max: number }> {
  const explicitMin = readFinite(axis?.min);
  const explicitMax = readFinite(axis?.max);
  if (explicitMin !== undefined && explicitMax !== undefined && explicitMax > explicitMin) {
    return Object.freeze({ min: explicitMin, max: explicitMax });
  }
  const autoRange = computeAutoRange(values);
  const min = explicitMin ?? autoRange?.min ?? 0;
  const max = explicitMax ?? autoRange?.max ?? 1;
  if (max > min) return Object.freeze({ min, max });
  if (autoRange !== null) return autoRange;
  return Object.freeze({ min: 0, max: 1 });
}

export function getScatterRange(
  points: readonly ScatterPoint[],
  axes: Readonly<{ x?: ChartAxis; y?: ChartAxis }> | undefined,
): ScatterRange {
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const xRange = computeAxisRange(xValues, axes?.x);
  const yRange = computeAxisRange(yValues, axes?.y);
  return Object.freeze({
    xMin: xRange.min,
    xMax: xRange.max,
    yMin: yRange.min,
    yMax: yRange.max,
  });
}

export function mapScatterPointsToPixels(
  points: readonly ScatterPoint[],
  widthPx: number,
  heightPx: number,
  range: ScatterRange,
): readonly ScatterPixelPoint[] {
  if (widthPx <= 0 || heightPx <= 0 || points.length === 0) return Object.freeze([]);
  const xDenom = Math.max(1e-9, range.xMax - range.xMin);
  const yDenom = Math.max(1e-9, range.yMax - range.yMin);
  const out: ScatterPixelPoint[] = [];
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
    const nx = clamp01((point.x - range.xMin) / xDenom);
    const ny = clamp01((point.y - range.yMin) / yDenom);
    const x = Math.round(nx * Math.max(0, widthPx - 1));
    const y = Math.round((1 - ny) * Math.max(0, heightPx - 1));
    out.push(Object.freeze({ x, y, ...(point.color ? { color: point.color } : {}) }));
  }
  return Object.freeze(out);
}
