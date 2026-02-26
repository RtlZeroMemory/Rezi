import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveEasing } from "../easing.js";
import {
  clamp01,
  interpolateNumber,
  interpolateRgb,
  interpolateRgbArray,
  normalizeDurationMs,
} from "../interpolate.js";

describe("animation/interpolate", () => {
  test("clamp01 clamps non-finite and out-of-range values", () => {
    assert.equal(clamp01(Number.NaN), 0);
    assert.equal(clamp01(Number.POSITIVE_INFINITY), 0);
    assert.equal(clamp01(Number.NEGATIVE_INFINITY), 0);
    assert.equal(clamp01(-0.5), 0);
    assert.equal(clamp01(0.25), 0.25);
    assert.equal(clamp01(2), 1);
  });

  test("normalizeDurationMs applies fallback, truncation, and lower bound", () => {
    assert.equal(normalizeDurationMs(undefined, 120), 120);
    assert.equal(normalizeDurationMs(Number.NaN, 120), 120);
    assert.equal(normalizeDurationMs(Number.POSITIVE_INFINITY, 120), 120);
    assert.equal(normalizeDurationMs(-10.9, 120), 0);
    assert.equal(normalizeDurationMs(48.9, 120), 48);
  });

  test("interpolateNumber clamps progress before interpolating", () => {
    assert.equal(interpolateNumber(10, 30, -1), 10);
    assert.equal(interpolateNumber(10, 30, 0.5), 20);
    assert.equal(interpolateNumber(10, 30, 2), 30);
  });

  test("interpolateRgb interpolates channel values", () => {
    assert.equal(
      interpolateRgb((0 << 16) | (0 << 8) | 0, (255 << 16) | (255 << 8) | 255, 0.5),
      (128 << 16) | (128 << 8) | 128,
    );
  });

  test("interpolateRgb returns endpoints at t=0 and t=1", () => {
    const from = (3 << 16) | (40 << 8) | 200;
    const to = (250 << 16) | (100 << 8) | 0;
    assert.deepEqual(interpolateRgb(from, to, 0), from);
    assert.deepEqual(interpolateRgb(from, to, 1), to);
  });

  test("interpolateRgb rounds channel interpolation to byte integers", () => {
    assert.equal(
      interpolateRgb((0 << 16) | (0 << 8) | 0, (1 << 16) | (1 << 8) | 1, 0.5),
      (1 << 16) | (1 << 8) | 1,
    );
    assert.equal(
      interpolateRgb((0 << 16) | (0 << 8) | 0, (2 << 16) | (2 << 8) | 2, 0.5),
      (1 << 16) | (1 << 8) | 1,
    );
  });

  test("interpolateRgbArray returns the requested number of steps", () => {
    const steps = interpolateRgbArray((0 << 16) | (0 << 8) | 0, (255 << 16) | (0 << 8) | 0, 4);
    assert.equal(steps.length, 4);
    assert.deepEqual(steps[0], (0 << 16) | (0 << 8) | 0);
    assert.deepEqual(steps[3], (255 << 16) | (0 << 8) | 0);
  });
});

describe("animation/easing", () => {
  test("undefined easing resolves to linear", () => {
    const easing = resolveEasing(undefined);
    assert.equal(easing(0), 0);
    assert.equal(easing(0.5), 0.5);
    assert.equal(easing(1), 1);
  });

  test("named easing presets resolve deterministically", () => {
    assert.equal(resolveEasing("easeInQuad")(0.5), 0.25);
    assert.equal(resolveEasing("easeOutQuad")(0.5), 0.75);
    assert.equal(resolveEasing("easeInOutCubic")(0), 0);
    assert.equal(resolveEasing("easeInOutCubic")(1), 1);
  });

  test("unknown easing name falls back to linear", () => {
    const easing = resolveEasing("not-a-real-easing" as unknown as never);
    assert.equal(easing(0.25), 0.25);
    assert.equal(easing(0.75), 0.75);
  });

  test("custom easing receives clamped input and produces clamped output", () => {
    const seenInputs: number[] = [];
    const easing = resolveEasing((t) => {
      seenInputs.push(t);
      return t * 2 - 0.25;
    });

    assert.equal(easing(-3), 0);
    assert.equal(easing(0.5), 0.75);
    assert.equal(easing(10), 1);
    assert.deepEqual(seenInputs, [0, 0.5, 1]);
  });
});
