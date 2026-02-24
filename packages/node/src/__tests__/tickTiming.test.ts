import assert from "node:assert/strict";
import test from "node:test";
import { computeNextIdleDelay, computeTickTiming } from "../worker/tickTiming.js";

test("computeTickTiming keeps 60fps polling interval above 1ms and bounded", () => {
  const timing = computeTickTiming(60);
  assert.equal(timing.tickIntervalMs > 1, true);
  assert.equal(timing.tickIntervalMs <= 8, true);
  assert.equal(timing.maxIdleDelayMs >= 16, true);
});

test("computeTickTiming keeps high-fps active polling low-latency", () => {
  const timing = computeTickTiming(1000);
  assert.equal(timing.tickIntervalMs, 1);
  assert.equal(timing.maxIdleDelayMs >= 16, true);
});

test("computeNextIdleDelay backs off beyond base interval when idle", () => {
  const timing = computeTickTiming(60);
  let delay = timing.tickIntervalMs;
  for (let i = 0; i < 4; i++) {
    delay = computeNextIdleDelay(delay, timing.tickIntervalMs, timing.maxIdleDelayMs);
  }
  assert.equal(delay > timing.tickIntervalMs, true);
  assert.equal(delay <= timing.maxIdleDelayMs, true);
});
