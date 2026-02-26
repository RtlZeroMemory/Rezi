import { HEATMAP_SCALE_ANCHORS } from "../theme/heatmapPalettes.js";
import { type Rgb24, rgb, rgbB, rgbG, rgbR } from "./style.js";
import type { HeatmapColorScale } from "./types.js";

type ScaleStop = Readonly<{ t: number; rgb: Rgb24 }>;

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function buildScaleTable(stops: readonly ScaleStop[]): readonly Rgb24[] {
  const table: Rgb24[] = [];
  for (let index = 0; index < 256; index++) {
    const t = index / 255;
    let left = stops[0] ?? { t: 0, rgb: rgb(0, 0, 0) };
    let right = stops[stops.length - 1] ?? left;
    for (let stopIndex = 0; stopIndex < stops.length - 1; stopIndex++) {
      const a = stops[stopIndex];
      const b = stops[stopIndex + 1];
      if (!a || !b) continue;
      if (t < a.t || t > b.t) continue;
      left = a;
      right = b;
      break;
    }
    const span = Math.max(1e-9, right.t - left.t);
    const localT = clamp01((t - left.t) / span);
    table.push(
      rgb(
        Math.round(lerp(rgbR(left.rgb), rgbR(right.rgb), localT)),
        Math.round(lerp(rgbG(left.rgb), rgbG(right.rgb), localT)),
        Math.round(lerp(rgbB(left.rgb), rgbB(right.rgb), localT)),
      ),
    );
  }
  for (const stop of stops) {
    const stopIndex = Math.round(clamp01(stop.t) * 255);
    table[stopIndex] = stop.rgb;
  }
  return Object.freeze(table);
}

const SCALE_TABLES: Readonly<Record<HeatmapColorScale, readonly Rgb24[]>> = Object.freeze({
  viridis: buildScaleTable(HEATMAP_SCALE_ANCHORS.viridis),
  plasma: buildScaleTable(HEATMAP_SCALE_ANCHORS.plasma),
  inferno: buildScaleTable(HEATMAP_SCALE_ANCHORS.inferno),
  magma: buildScaleTable(HEATMAP_SCALE_ANCHORS.magma),
  turbo: buildScaleTable(HEATMAP_SCALE_ANCHORS.turbo),
  grayscale: buildScaleTable(HEATMAP_SCALE_ANCHORS.grayscale),
});

export function getHeatmapColorTable(scale: HeatmapColorScale): readonly Rgb24[] {
  return SCALE_TABLES[scale];
}

export function normalizeHeatmapScale(scale: HeatmapColorScale | undefined): HeatmapColorScale {
  switch (scale) {
    case "viridis":
    case "plasma":
    case "inferno":
    case "magma":
    case "turbo":
    case "grayscale":
      return scale;
    default:
      return "viridis";
  }
}

export function getHeatmapRange(
  matrix: readonly (readonly number[])[],
  min: number | undefined,
  max: number | undefined,
): Readonly<{ min: number; max: number }> {
  const explicitMin = readFinite(min);
  const explicitMax = readFinite(max);
  if (explicitMin !== undefined && explicitMax !== undefined && explicitMax > explicitMin) {
    return Object.freeze({ min: explicitMin, max: explicitMax });
  }
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const row of matrix) {
    for (const raw of row) {
      if (!Number.isFinite(raw)) continue;
      if (raw < lo) lo = raw;
      if (raw > hi) hi = raw;
    }
  }
  const autoValid = Number.isFinite(lo) && Number.isFinite(hi) && hi > lo;
  const autoRange = autoValid ? Object.freeze({ min: lo, max: hi }) : null;
  lo = explicitMin ?? autoRange?.min ?? 0;
  hi = explicitMax ?? autoRange?.max ?? 1;
  if (hi > lo) return Object.freeze({ min: lo, max: hi });
  if (autoRange !== null) return autoRange;
  return Object.freeze({ min: 0, max: 1 });
}

export function colorForHeatmapValue(
  value: number,
  range: Readonly<{ min: number; max: number }>,
  scale: HeatmapColorScale,
): Rgb24 {
  const table = getHeatmapColorTable(scale);
  const ratio = clamp01((value - range.min) / Math.max(1e-9, range.max - range.min));
  const index = Math.round(ratio * 255);
  return table[index] ?? table[0] ?? rgb(0, 0, 0);
}
