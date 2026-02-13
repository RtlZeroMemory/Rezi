/**
 * packages/core/src/widgets/slider.ts — Slider widget utilities.
 *
 * Why: Centralizes slider range/step/value normalization so rendering and
 * keyboard routing share deterministic behavior.
 */

import type { SliderProps, VNode } from "./types.js";

export const DEFAULT_SLIDER_MIN = 0;
export const DEFAULT_SLIDER_MAX = 100;
export const DEFAULT_SLIDER_STEP = 1;
export const DEFAULT_SLIDER_TRACK_WIDTH = 10;

export type SliderRange = Readonly<{
  min: number;
  max: number;
}>;

export type NormalizedSliderState = Readonly<{
  min: number;
  max: number;
  step: number;
  value: number;
}>;

export type SliderAdjustment =
  | "decrease"
  | "increase"
  | "decreasePage"
  | "increasePage"
  | "toMin"
  | "toMax";

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(value).toLowerCase();
  const expIndex = text.indexOf("e-");
  if (expIndex >= 0) {
    const frac = Number.parseInt(text.slice(expIndex + 2), 10);
    return Number.isFinite(frac) ? frac : 0;
  }
  const dotIndex = text.indexOf(".");
  if (dotIndex < 0) return 0;
  return text.length - dotIndex - 1;
}

function roundToPrecision(value: number, precision: number): number {
  if (precision <= 0) return Math.round(value);
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

export function normalizeSliderRange(min?: number, max?: number): SliderRange {
  const safeMin = isFiniteNumber(min) ? min : DEFAULT_SLIDER_MIN;
  const safeMax = isFiniteNumber(max) ? max : DEFAULT_SLIDER_MAX;
  if (safeMin <= safeMax) return { min: safeMin, max: safeMax };
  return { min: safeMax, max: safeMin };
}

export function clampSliderValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

export function normalizeSliderStep(step: number | undefined, range: SliderRange): number {
  const span = range.max - range.min;
  if (span <= 0) return 0;
  const rawStep = isFiniteNumber(step) ? Math.abs(step) : DEFAULT_SLIDER_STEP;
  const safeStep = rawStep > 0 ? rawStep : DEFAULT_SLIDER_STEP;
  return Math.min(safeStep, span);
}

export function quantizeSliderValue(value: number, range: SliderRange, step: number): number {
  const span = range.max - range.min;
  if (span <= 0) return range.min;

  const safeStep = step > 0 && Number.isFinite(step) ? Math.min(step, span) : span;
  const clamped = clampSliderValue(value, range.min, range.max);
  if (clamped === range.min || clamped === range.max) return clamped;
  const offset = clamped - range.min;
  const snapped = range.min + Math.round(offset / safeStep) * safeStep;
  const precision = Math.min(
    8,
    Math.max(decimalPlaces(range.min), decimalPlaces(range.max), decimalPlaces(safeStep)),
  );
  return clampSliderValue(roundToPrecision(snapped, precision), range.min, range.max);
}

export function normalizeSliderState(
  props: Readonly<{
    value: number;
    min?: number | undefined;
    max?: number | undefined;
    step?: number | undefined;
  }>,
): NormalizedSliderState {
  const range = normalizeSliderRange(props.min, props.max);
  const step = normalizeSliderStep(props.step, range);
  const rawValue = isFiniteNumber(props.value) ? props.value : range.min;
  const value = step <= 0 ? range.min : quantizeSliderValue(rawValue, range, step);
  return { min: range.min, max: range.max, step, value };
}

export function adjustSliderValue(
  currentValue: number,
  state: Readonly<{ min: number; max: number; step: number }>,
  adjustment: SliderAdjustment,
): number {
  const range = normalizeSliderRange(state.min, state.max);
  const step = normalizeSliderStep(state.step, range);
  if (step <= 0) return range.min;
  if (adjustment === "toMin") return range.min;
  if (adjustment === "toMax") return range.max;

  const deltaMultiplier =
    adjustment === "decrease"
      ? -1
      : adjustment === "increase"
        ? 1
        : adjustment === "decreasePage"
          ? -10
          : 10;
  const base = quantizeSliderValue(currentValue, range, step);
  return quantizeSliderValue(base + step * deltaMultiplier, range, step);
}

export function formatSliderValue(value: number, step: number): string {
  const clampedPrecision = Math.min(
    8,
    step > 0 ? decimalPlaces(step) : Math.max(0, decimalPlaces(value)),
  );
  const rounded = roundToPrecision(value, clampedPrecision);
  if (clampedPrecision <= 0) return String(rounded);
  const fixed = rounded.toFixed(clampedPrecision);
  return fixed.replace(/\.?0+$/, "");
}

export function createSliderVNode(props: SliderProps): VNode {
  return {
    kind: "slider",
    props,
  };
}
