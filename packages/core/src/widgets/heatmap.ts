import { rgb, rgbB, rgbG, rgbR, type Rgb24 } from "./style.js";
import type { HeatmapColorScale } from "./types.js";

type ScaleStop = Readonly<{ t: number; rgb: Rgb24 }>;

const SCALE_ANCHORS: Readonly<Record<HeatmapColorScale, readonly ScaleStop[]>> = Object.freeze({
  viridis: Object.freeze([
    { t: 0, rgb: rgb(68, 1, 84) },
    { t: 0.25, rgb: rgb(59, 82, 139) },
    { t: 0.5, rgb: rgb(33, 145, 140) },
    { t: 0.75, rgb: rgb(94, 201, 98) },
    { t: 1, rgb: rgb(253, 231, 37) },
  ]),
  plasma: Object.freeze([
    { t: 0, rgb: rgb(13, 8, 135) },
    { t: 0.25, rgb: rgb(126, 3, 168) },
    { t: 0.5, rgb: rgb(203, 71, 119) },
    { t: 0.75, rgb: rgb(248, 149, 64) },
    { t: 1, rgb: rgb(240, 249, 33) },
  ]),
  inferno: Object.freeze([
    { t: 0, rgb: rgb(0, 0, 4) },
    { t: 0.25, rgb: rgb(87, 15, 109) },
    { t: 0.5, rgb: rgb(187, 55, 84) },
    { t: 0.75, rgb: rgb(249, 142, 8) },
    { t: 1, rgb: rgb(252, 255, 164) },
  ]),
  magma: Object.freeze([
    { t: 0, rgb: rgb(0, 0, 4) },
    { t: 0.25, rgb: rgb(79, 18, 123) },
    { t: 0.5, rgb: rgb(182, 54, 121) },
    { t: 0.75, rgb: rgb(251, 140, 60) },
    { t: 1, rgb: rgb(252, 253, 191) },
  ]),
  turbo: Object.freeze([
    { t: 0, rgb: rgb(48, 18, 59) },
    { t: 0.25, rgb: rgb(63, 128, 234) },
    { t: 0.5, rgb: rgb(34, 201, 169) },
    { t: 0.75, rgb: rgb(246, 189, 39) },
    { t: 1, rgb: rgb(122, 4, 3) },
  ]),
  grayscale: Object.freeze([
    { t: 0, rgb: rgb(0, 0, 0) },
    { t: 1, rgb: rgb(255, 255, 255) },
  ]),
});

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
  viridis: buildScaleTable(SCALE_ANCHORS.viridis),
  plasma: buildScaleTable(SCALE_ANCHORS.plasma),
  inferno: buildScaleTable(SCALE_ANCHORS.inferno),
  magma: buildScaleTable(SCALE_ANCHORS.magma),
  turbo: buildScaleTable(SCALE_ANCHORS.turbo),
  grayscale: buildScaleTable(SCALE_ANCHORS.grayscale),
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
