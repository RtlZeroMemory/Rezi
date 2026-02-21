import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveEasing } from "../easing.js";
import { clamp01, interpolateNumber, normalizeDurationMs } from "../interpolate.js";

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
