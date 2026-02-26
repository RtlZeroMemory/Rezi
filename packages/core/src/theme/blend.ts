import { rgb, rgbB, rgbG, rgbR, type Rgb24 } from "../widgets/style.js";

function blendChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Blend two RGB colors using `t` in [0..1].
 */
export function blendRgb(a: Rgb24, b: Rgb24, t: number): Rgb24 {
  const clampedT = Math.max(0, Math.min(1, t));
  return rgb(
    blendChannel(rgbR(a), rgbR(b), clampedT),
    blendChannel(rgbG(a), rgbG(b), clampedT),
    blendChannel(rgbB(a), rgbB(b), clampedT),
  );
}
