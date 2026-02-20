import type { Rgb } from "./style.js";
import type { HeatmapColorScale } from "./types.js";

type ScaleStop = Readonly<{ t: number; rgb: Rgb }>;

const SCALE_ANCHORS: Readonly<Record<HeatmapColorScale, readonly ScaleStop[]>> = Object.freeze({
  viridis: Object.freeze([
    { t: 0, rgb: Object.freeze({ r: 68, g: 1, b: 84 }) },
    { t: 0.25, rgb: Object.freeze({ r: 59, g: 82, b: 139 }) },
    { t: 0.5, rgb: Object.freeze({ r: 33, g: 145, b: 140 }) },
    { t: 0.75, rgb: Object.freeze({ r: 94, g: 201, b: 98 }) },
    { t: 1, rgb: Object.freeze({ r: 253, g: 231, b: 37 }) },
  ]),
  plasma: Object.freeze([
    { t: 0, rgb: Object.freeze({ r: 13, g: 8, b: 135 }) },
    { t: 0.25, rgb: Object.freeze({ r: 126, g: 3, b: 168 }) },
    { t: 0.5, rgb: Object.freeze({ r: 203, g: 71, b: 119 }) },
    { t: 0.75, rgb: Object.freeze({ r: 248, g: 149, b: 64 }) },
    { t: 1, rgb: Object.freeze({ r: 240, g: 249, b: 33 }) },
  ]),
  inferno: Object.freeze([
    { t: 0, rgb: Object.freeze({ r: 0, g: 0, b: 4 }) },
    { t: 0.25, rgb: Object.freeze({ r: 87, g: 15, b: 109 }) },
    { t: 0.5, rgb: Object.freeze({ r: 187, g: 55, b: 84 }) },
    { t: 0.75, rgb: Object.freeze({ r: 249, g: 142, b: 8 }) },
    { t: 1, rgb: Object.freeze({ r: 252, g: 255, b: 164 }) },
  ]),
  magma: Object.freeze([
    { t: 0, rgb: Object.freeze({ r: 0, g: 0, b: 4 }) },
    { t: 0.25, rgb: Object.freeze({ r: 79, g: 18, b: 123 }) },
    { t: 0.5, rgb: Object.freeze({ r: 182, g: 54, b: 121 }) },
    { t: 0.75, rgb: Object.freeze({ r: 251, g: 140, b: 60 }) },
    { t: 1, rgb: Object.freeze({ r: 252, g: 253, b: 191 }) },
  ]),
  turbo: Object.freeze([
    { t: 0, rgb: Object.freeze({ r: 48, g: 18, b: 59 }) },
    { t: 0.25, rgb: Object.freeze({ r: 63, g: 128, b: 234 }) },
    { t: 0.5, rgb: Object.freeze({ r: 34, g: 201, b: 169 }) },
    { t: 0.75, rgb: Object.freeze({ r: 246, g: 189, b: 39 }) },
    { t: 1, rgb: Object.freeze({ r: 122, g: 4, b: 3 }) },
  ]),
  grayscale: Object.freeze([
    { t: 0, rgb: Object.freeze({ r: 0, g: 0, b: 0 }) },
    { t: 1, rgb: Object.freeze({ r: 255, g: 255, b: 255 }) },
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

function buildScaleTable(stops: readonly ScaleStop[]): readonly Rgb[] {
  const table: Rgb[] = [];
  for (let index = 0; index < 256; index++) {
    const t = index / 255;
    let left = stops[0] ?? { t: 0, rgb: { r: 0, g: 0, b: 0 } };
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
      Object.freeze({
        r: Math.round(lerp(left.rgb.r, right.rgb.r, localT)),
        g: Math.round(lerp(left.rgb.g, right.rgb.g, localT)),
        b: Math.round(lerp(left.rgb.b, right.rgb.b, localT)),
      }),
    );
  }
  for (const stop of stops) {
    const stopIndex = Math.round(clamp01(stop.t) * 255);
    table[stopIndex] = stop.rgb;
  }
  return Object.freeze(table);
}

const SCALE_TABLES: Readonly<Record<HeatmapColorScale, readonly Rgb[]>> = Object.freeze({
  viridis: buildScaleTable(SCALE_ANCHORS.viridis),
  plasma: buildScaleTable(SCALE_ANCHORS.plasma),
  inferno: buildScaleTable(SCALE_ANCHORS.inferno),
  magma: buildScaleTable(SCALE_ANCHORS.magma),
  turbo: buildScaleTable(SCALE_ANCHORS.turbo),
  grayscale: buildScaleTable(SCALE_ANCHORS.grayscale),
});

export function getHeatmapColorTable(scale: HeatmapColorScale): readonly Rgb[] {
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
): Rgb {
  const table = getHeatmapColorTable(scale);
  const ratio = clamp01((value - range.min) / Math.max(1e-9, range.max - range.min));
  const index = Math.round(ratio * 255);
  return table[index] ?? table[0] ?? Object.freeze({ r: 0, g: 0, b: 0 });
}
