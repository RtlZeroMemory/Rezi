/**
 * packages/core/src/theme/contrast.ts — WCAG contrast calculations.
 *
 * Why: Shared utility for deterministic accessibility checks against
 * foreground/background color pairs.
 */

import { type Rgb24, rgbB, rgbG, rgbR } from "../widgets/style.js";

function srgbToLinear(channel: number): number {
  const srgb = channel / 255;
  if (srgb <= 0.04045) return srgb / 12.92;
  return ((srgb + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgb24): number {
  const r = srgbToLinear(rgbR(color));
  const g = srgbToLinear(rgbG(color));
  const b = srgbToLinear(rgbB(color));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Compute WCAG 2.x contrast ratio between two colors.
 * Returns a value in the range [1, 21], independent of argument order.
 */
export function contrastRatio(fg: Rgb24, bg: Rgb24): number {
  const fgLum = relativeLuminance(fg);
  const bgLum = relativeLuminance(bg);
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}
