import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, reduceCliState } from "../helpers/state.js";
import { DEFAULT_THEME_NAME, THEME_OPTIONS } from "../theme.js";

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

test("cli theme defaults and options remain aligned", () => {
  const initial = createInitialState(0);
  assert.equal(initial.themeName, DEFAULT_THEME_NAME);
  assert.ok(THEME_OPTIONS.some((option) => option.value === DEFAULT_THEME_NAME));
});
