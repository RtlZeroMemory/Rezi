import type { ChartAxis, LineChartSeries } from "./types.js";

export type ChartRange = Readonly<{
  min: number;
  max: number;
}>;

export type Point2D = Readonly<{
  x: number;
  y: number;
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

function computeAutoRange(series: readonly LineChartSeries[]): ChartRange | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const entry of series) {
    for (const raw of entry.data) {
      const value = readFinite(raw);
      if (value === undefined) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
  return Object.freeze({ min, max });
}

export function getLineChartRange(
  series: readonly LineChartSeries[],
  axis: ChartAxis | undefined,
): ChartRange {
  const explicitMin = readFinite(axis?.min);
  const explicitMax = readFinite(axis?.max);
  if (explicitMin !== undefined && explicitMax !== undefined && explicitMax > explicitMin) {
    return Object.freeze({ min: explicitMin, max: explicitMax });
  }
  const autoRange = computeAutoRange(series);
  const min = explicitMin ?? autoRange?.min ?? 0;
  const max = explicitMax ?? autoRange?.max ?? 1;
  if (max > min) return Object.freeze({ min, max });
  if (autoRange !== null) return autoRange;
  return Object.freeze({ min: 0, max: 1 });
}

export function mapSeriesToPoints(
  data: readonly number[],
  widthPx: number,
  heightPx: number,
  range: ChartRange,
): readonly Point2D[] {
  if (data.length === 0 || widthPx <= 0 || heightPx <= 0) return Object.freeze([]);
  const out: Point2D[] = [];
  const denomX = Math.max(1, data.length - 1);
  const denomY = range.max - range.min;
  for (let index = 0; index < data.length; index++) {
    const value = readFinite(data[index]) ?? range.min;
    const tX = index / denomX;
    const tY = denomY <= 0 ? 0 : clamp01((value - range.min) / denomY);
    const x = Math.round(tX * Math.max(0, widthPx - 1));
    const y = Math.round((1 - tY) * Math.max(0, heightPx - 1));
    out.push(Object.freeze({ x, y }));
  }
  return Object.freeze(out);
}

export function getLegendLabels(series: readonly LineChartSeries[]): readonly string[] {
  const labels = series.map((entry, index) => {
    const label = entry.label;
    if (typeof label === "string" && label.trim().length > 0) return label;
    return `Series ${String(index + 1)}`;
  });
  return Object.freeze(labels);
}
