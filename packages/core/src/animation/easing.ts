/**
 * packages/core/src/animation/easing.ts — Easing curve helpers.
 */

import { clamp01 } from "./interpolate.js";
import type { EasingFunction, EasingInput, EasingName } from "./types.js";

const EASE_IN_BACK_OVERSHOOT = 1.70158;
const EASE_IN_OUT_BACK_OVERSHOOT = EASE_IN_BACK_OVERSHOOT * 1.525;

const easeOutBounce = (t: number): number => {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 2 / 2.75) {
    const shifted = t - 1.5 / 2.75;
    return 7.5625 * shifted * shifted + 0.75;
  }
  if (t < 2.5 / 2.75) {
    const shifted = t - 2.25 / 2.75;
    return 7.5625 * shifted * shifted + 0.9375;
  }
  const shifted = t - 2.625 / 2.75;
  return 7.5625 * shifted * shifted + 0.984375;
};

const EASING_PRESETS: Readonly<Record<EasingName, EasingFunction>> = Object.freeze({
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => 1 - (1 - t) ** 3,
  easeInOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  easeInExpo: (t: number): number => (t === 0 ? 0 : 2 ** (10 * (t - 1))),
  easeOutExpo: (t: number): number => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  easeInOutExpo: (t: number): number => {
    if (t === 0 || t === 1) return t;
    return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
  },
  easeInBack: (t: number): number =>
    t * t * ((EASE_IN_BACK_OVERSHOOT + 1) * t - EASE_IN_BACK_OVERSHOOT),
  easeOutBack: (t: number): number => {
    const shifted = t - 1;
    return (
      shifted * shifted * ((EASE_IN_BACK_OVERSHOOT + 1) * shifted + EASE_IN_BACK_OVERSHOOT) + 1
    );
  },
  easeInOutBack: (t: number): number => {
    const scaled = t * 2;
    if (scaled < 1) {
      return (
        (scaled *
          scaled *
          ((EASE_IN_OUT_BACK_OVERSHOOT + 1) * scaled - EASE_IN_OUT_BACK_OVERSHOOT)) /
        2
      );
    }
    const shifted = scaled - 2;
    return (
      (shifted *
        shifted *
        ((EASE_IN_OUT_BACK_OVERSHOOT + 1) * shifted + EASE_IN_OUT_BACK_OVERSHOOT) +
        2) /
      2
    );
  },
  easeOutBounce,
  easeInBounce: (t: number): number => 1 - easeOutBounce(1 - t),
});

/** Resolve user-provided easing value to a safe function. */
export function resolveEasing(input: EasingInput | undefined): EasingFunction {
  if (typeof input === "function") {
    return (t: number): number => clamp01(input(clamp01(t)));
  }
  if (!input) return EASING_PRESETS.linear;
  return EASING_PRESETS[input] ?? EASING_PRESETS.linear;
}
