/**
 * packages/core/src/animation/easing.ts — Easing curve helpers.
 */

import type { EasingFunction, EasingInput, EasingName } from "./types.js";
import { clamp01 } from "./interpolate.js";

const EASING_PRESETS: Readonly<Record<EasingName, EasingFunction>> = Object.freeze({
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number): number =>
    t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
});

/** Resolve user-provided easing value to a safe function. */
export function resolveEasing(input: EasingInput | undefined): EasingFunction {
  if (typeof input === "function") {
    return (t: number): number => clamp01(input(clamp01(t)));
  }
  if (!input) return EASING_PRESETS.linear;
  return EASING_PRESETS[input] ?? EASING_PRESETS.linear;
}

