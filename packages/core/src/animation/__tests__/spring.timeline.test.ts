import { assert, describe, test } from "@rezi-ui/testkit";
import { isSpringAtRest, normalizeSpringConfig, stepSpring } from "../spring.js";
import { normalizeSequence, sampleSequence } from "../timeline.js";

describe("animation/spring", () => {
  test("normalizeSpringConfig applies defaults and safety clamps", () => {
    const normalized = normalizeSpringConfig({
      stiffness: -10,
      damping: -3,
      mass: 0,
      restDelta: -1,
      restSpeed: -2,
      maxDeltaMs: 0.4,
    });

    assert.equal(normalized.stiffness, 0);
    assert.equal(normalized.damping, 0);
    assert.equal(normalized.mass, 0.0001);
    assert.equal(normalized.restDelta, 0);
    assert.equal(normalized.restSpeed, 0);
    assert.equal(normalized.maxDeltaMs, 1);
    assert.equal(Object.isFrozen(normalized), true);
  });

  test("isSpringAtRest checks both velocity and displacement thresholds", () => {
    const cfg = normalizeSpringConfig({ restDelta: 0.1, restSpeed: 0.2 });
    assert.equal(isSpringAtRest(10.04, 10, 0.19, cfg), true);
    assert.equal(isSpringAtRest(10.2, 10, 0.19, cfg), false);
    assert.equal(isSpringAtRest(10.04, 10, 0.21, cfg), false);
  });

  test("stepSpring snaps on invalid input", () => {
    const cfg = normalizeSpringConfig(undefined);
    const next = stepSpring({ value: Number.NaN, velocity: 0 }, 10, 1 / 60, cfg);
    assert.equal(next.value, 10);
    assert.equal(next.velocity, 0);
    assert.equal(next.done, true);
  });

  test("stepSpring snaps when spring cannot simulate", () => {
    const cfg = normalizeSpringConfig({ stiffness: 0 });
    const next = stepSpring({ value: 0, velocity: 0 }, 10, 1 / 60, cfg);
    assert.equal(next.value, 10);
    assert.equal(next.velocity, 0);
    assert.equal(next.done, true);
  });

  test("stepSpring converges toward target over repeated steps", () => {
    const cfg = normalizeSpringConfig({
      stiffness: 220,
      damping: 24,
      mass: 1,
      restDelta: 0.001,
      restSpeed: 0.001,
    });

    let value = 0;
    let velocity = 0;
    let done = false;
    for (let i = 0; i < 400; i++) {
      const next = stepSpring({ value, velocity }, 1, 1 / 60, cfg);
      value = next.value;
      velocity = next.velocity;
      done = next.done;
      if (done) break;
    }

    assert.equal(done, true);
    assert.ok(Math.abs(value - 1) <= 0.01);
    assert.ok(Math.abs(velocity) <= 0.01);
  });
});

describe("animation/timeline", () => {
  test("normalizeSequence handles empty and single-keyframe inputs", () => {
    const empty = normalizeSequence([]);
    assert.equal(empty.initialValue, 0);
    assert.equal(empty.finalValue, 0);
    assert.equal(empty.segments.length, 0);
    assert.equal(empty.totalDurationMs, 0);

    const single = normalizeSequence([42]);
    assert.equal(single.initialValue, 42);
    assert.equal(single.finalValue, 42);
    assert.equal(single.segments.length, 0);
    assert.equal(single.totalDurationMs, 0);
  });

  test("normalizeSequence respects per-keyframe duration/easing overrides", () => {
    const seq = normalizeSequence(
      [0, { value: 10, duration: 80, easing: "easeInQuad" }, { value: 20 }],
      { duration: 50, easing: "linear" },
    );
    assert.equal(seq.segments.length, 2);
    assert.equal(seq.segments[0]?.durationMs, 50);
    assert.equal(seq.segments[1]?.durationMs, 80);
    assert.equal(seq.totalDurationMs, 130);
  });

  test("sampleSequence interpolates non-looping timelines and marks completion", () => {
    const seq = normalizeSequence([0, { value: 10, duration: 100 }, { value: 20, duration: 50 }], {
      duration: 50,
      easing: "linear",
    });
    const at0 = sampleSequence(seq, 0, false);
    const at50 = sampleSequence(seq, 50, false);
    const at125 = sampleSequence(seq, 125, false);
    const at200 = sampleSequence(seq, 200, false);
    assert.equal(at0.value, 0);
    assert.ok(Math.abs(at50.value - 10) <= 0.0001);
    assert.ok(Math.abs(at125.value - 17.5) <= 0.0001);
    assert.equal(at200.done, true);
    assert.ok(Math.abs(at200.value - 20) <= 0.0001);
  });

  test("sampleSequence loops and wraps elapsed time", () => {
    const seq = normalizeSequence([0, 10], { duration: 100, easing: "linear" });
    const at10 = sampleSequence(seq, 10, true);
    const at110 = sampleSequence(seq, 110, true);
    const at210 = sampleSequence(seq, 210, true);
    assert.ok(Math.abs(at10.value - at110.value) <= 0.0001);
    assert.ok(Math.abs(at10.value - at210.value) <= 0.0001);
    assert.equal(at110.done, false);
  });

  test("sampleSequence handles degenerate and invalid elapsed values", () => {
    const zeroDuration = normalizeSequence([{ value: 0, duration: 0 }, { value: 10 }], {
      duration: 0,
      easing: "linear",
    });
    const sampledZero = sampleSequence(zeroDuration, 50, false);
    assert.equal(sampledZero.value, 10);
    assert.equal(sampledZero.done, true);

    const seq = normalizeSequence([5, 15], { duration: 60, easing: "linear" });
    const sampledInvalid = sampleSequence(seq, Number.NaN, false);
    assert.equal(sampledInvalid.value, 5);
    assert.equal(sampledInvalid.done, true);
  });
});
