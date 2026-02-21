/**
 * packages/core/src/animation/timeline.ts — Sequence timeline helpers.
 */

import { resolveEasing } from "./easing.js";
import { clamp01, interpolateNumber, normalizeDurationMs } from "./interpolate.js";
import type { EasingFunction, EasingInput, SequenceKeyframe } from "./types.js";

type SequenceSegment = Readonly<{
  from: number;
  to: number;
  durationMs: number;
  easing: EasingFunction;
}>;

export type NormalizedSequence = Readonly<{
  initialValue: number;
  finalValue: number;
  segments: readonly SequenceSegment[];
  totalDurationMs: number;
}>;

export type SequenceSample = Readonly<{
  value: number;
  done: boolean;
}>;

const DEFAULT_SEQUENCE_SEGMENT_DURATION_MS = 160;

function readKeyframeValue(frame: SequenceKeyframe): number {
  return typeof frame === "number" ? frame : frame.value;
}

function readKeyframeDuration(frame: SequenceKeyframe): number | undefined {
  return typeof frame === "number" ? undefined : frame.duration;
}

function readKeyframeEasing(frame: SequenceKeyframe): EasingInput | undefined {
  return typeof frame === "number" ? undefined : frame.easing;
}

export function normalizeSequence(
  keyframes: readonly SequenceKeyframe[],
  defaults: Readonly<{ duration?: number; easing?: EasingInput }> = {},
): NormalizedSequence {
  if (keyframes.length === 0) {
    return Object.freeze({
      initialValue: 0,
      finalValue: 0,
      segments: Object.freeze([]),
      totalDurationMs: 0,
    });
  }

  const values: number[] = [];
  for (const frame of keyframes) {
    values.push(readKeyframeValue(frame));
  }

  const segments: SequenceSegment[] = [];
  let totalDurationMs = 0;
  const fallbackDurationMs = normalizeDurationMs(
    defaults.duration,
    DEFAULT_SEQUENCE_SEGMENT_DURATION_MS,
  );

  for (let i = 0; i < keyframes.length - 1; i++) {
    const frame = keyframes[i];
    if (frame === undefined) continue;
    const durationMs = normalizeDurationMs(readKeyframeDuration(frame), fallbackDurationMs);
    const easingInput = readKeyframeEasing(frame) ?? defaults.easing;
    segments.push(
      Object.freeze({
        from: values[i] ?? 0,
        to: values[i + 1] ?? 0,
        durationMs,
        easing: resolveEasing(easingInput),
      }),
    );
    totalDurationMs += durationMs;
  }

  return Object.freeze({
    initialValue: values[0] ?? 0,
    finalValue: values[values.length - 1] ?? 0,
    segments: Object.freeze(segments),
    totalDurationMs,
  });
}

export function sampleSequence(
  sequence: NormalizedSequence,
  elapsedMs: number,
  loop: boolean,
): SequenceSample {
  if (!Number.isFinite(elapsedMs) || sequence.segments.length === 0) {
    return Object.freeze({
      value: sequence.initialValue,
      done: true,
    });
  }

  const total = sequence.totalDurationMs;
  if (total <= 0) {
    return Object.freeze({
      value: sequence.finalValue,
      done: true,
    });
  }

  const normalizedElapsedMs = loop
    ? ((Math.max(0, elapsedMs) % total) + total) % total
    : Math.max(0, elapsedMs);

  let cursor = 0;
  for (let i = 0; i < sequence.segments.length; i++) {
    const seg = sequence.segments[i];
    if (!seg) continue;
    const segEnd = cursor + seg.durationMs;
    if (normalizedElapsedMs <= segEnd || i === sequence.segments.length - 1) {
      const localT =
        seg.durationMs <= 0 ? 1 : clamp01((normalizedElapsedMs - cursor) / seg.durationMs);
      return Object.freeze({
        value: interpolateNumber(seg.from, seg.to, seg.easing(localT)),
        done: !loop && elapsedMs >= total,
      });
    }
    cursor = segEnd;
  }

  return Object.freeze({
    value: sequence.finalValue,
    done: true,
  });
}
