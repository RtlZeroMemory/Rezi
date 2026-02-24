import type { Rgb } from "../widgets/style.js";

function blendChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Blend two RGB colors using `t` in [0..1].
 */
export function blendRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const clampedT = Math.max(0, Math.min(1, t));
  return Object.freeze({
    r: blendChannel(a.r, b.r, clampedT),
    g: blendChannel(a.g, b.g, clampedT),
    b: blendChannel(a.b, b.b, clampedT),
  });
}
