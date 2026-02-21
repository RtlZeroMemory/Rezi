import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, reduceDashboardState } from "../helpers/state.js";

test("dashboard reducer toggles pause state", () => {
  const initial = createInitialState(0);
  const next = reduceDashboardState(initial, { type: "toggle-pause" });
  assert.equal(next.paused, true);
  const resumed = reduceDashboardState(next, { type: "toggle-pause" });
  assert.equal(resumed.paused, false);
});

test("dashboard reducer tick updates counters and services", () => {
  const initial = createInitialState(0);
  const next = reduceDashboardState(initial, { type: "tick", nowMs: 1000 });
  assert.equal(next.tick, 1);
  assert.equal(next.lastUpdatedMs, 1000);
  assert.notDeepEqual(next.services, initial.services);
});
