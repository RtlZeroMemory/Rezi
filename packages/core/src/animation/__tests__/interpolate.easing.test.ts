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
    assert.deepEqual(interpolateRgb({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }, 0.5), {
      r: 128,
      g: 128,
      b: 128,
    });
  });

  test("interpolateRgb returns endpoints at t=0 and t=1", () => {
    const from = { r: 3, g: 40, b: 200 };
    const to = { r: 250, g: 100, b: 0 };
    assert.deepEqual(interpolateRgb(from, to, 0), from);
    assert.deepEqual(interpolateRgb(from, to, 1), to);
  });

  test("interpolateRgb clamps output channels to byte range integers", () => {
    assert.deepEqual(
      interpolateRgb({ r: -10, g: 400.4, b: Number.NaN }, { r: -10, g: 400.4, b: Number.NaN }, 1),
      { r: 0, g: 255, b: 0 },
    );
  });

  test("interpolateRgbArray returns the requested number of steps", () => {
    const steps = interpolateRgbArray({ r: 0, g: 0, b: 0 }, { r: 255, g: 0, b: 0 }, 4);
    assert.equal(steps.length, 4);
    assert.deepEqual(steps[0], { r: 0, g: 0, b: 0 });
    assert.deepEqual(steps[3], { r: 255, g: 0, b: 0 });
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
