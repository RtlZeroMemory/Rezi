import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, reduceCliState } from "../helpers/state.js";

test("cli reducer toggles auto-refresh", () => {
  const initial = createInitialState(0);
  const paused = reduceCliState(initial, { type: "toggle-refresh" });
  assert.equal(paused.autoRefresh, false);
  const resumed = reduceCliState(paused, { type: "toggle-refresh" });
  assert.equal(resumed.autoRefresh, true);
});

test("cli reducer tick appends a log entry", () => {
  const initial = createInitialState(0);
  const next = reduceCliState(initial, { type: "tick", nowMs: 1_000 });
  assert.equal(next.tick, initial.tick + 1);
  assert.equal(next.logs.length, initial.logs.length + 1);
});
