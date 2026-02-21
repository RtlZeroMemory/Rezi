/**
 * packages/core/src/animation/interpolate.ts — Primitive interpolation helpers.
 */

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
