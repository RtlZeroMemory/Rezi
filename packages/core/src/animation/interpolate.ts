/**
 * packages/core/src/animation/interpolate.ts — Primitive interpolation helpers.
 */

import type { Rgb } from "../widgets/style.js";

/** Clamp a number into [0, 1]. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Clamp an animation duration to a safe, non-negative integer in milliseconds. */
export function normalizeDurationMs(durationMs: number | undefined, fallbackMs: number): number {
  if (durationMs === undefined) return fallbackMs;
  if (!Number.isFinite(durationMs)) return fallbackMs;
  return Math.max(0, Math.trunc(durationMs));
}

/** Linear interpolation between two numeric values. */
export function interpolateNumber(from: number, to: number, t: number): number {
  return from + (to - from) * clamp01(t);
}

function clampRgbChannel(channel: number): number {
  if (!Number.isFinite(channel)) return 0;
  if (channel <= 0) return 0;
  if (channel >= 255) return 255;
  return Math.round(channel);
}

/** Linear interpolation between two RGB colors. */
export function interpolateRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return Object.freeze({
    r: clampRgbChannel(interpolateNumber(from.r, to.r, t)),
    g: clampRgbChannel(interpolateNumber(from.g, to.g, t)),
    b: clampRgbChannel(interpolateNumber(from.b, to.b, t)),
  });
}

/** Generate `steps` RGB samples between two colors (inclusive endpoints). */
export function interpolateRgbArray(from: Rgb, to: Rgb, steps: number): readonly Rgb[] {
  const count = Math.max(0, Math.trunc(steps));
  if (count <= 0) return Object.freeze([]);
  if (count === 1) return Object.freeze([interpolateRgb(from, to, 0)]);
  const samples: Rgb[] = new Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = interpolateRgb(from, to, i / (count - 1));
  }
  return Object.freeze(samples);
}
