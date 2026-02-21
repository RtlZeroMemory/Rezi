import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, reduceMinimalState } from "../helpers/state.js";

test("minimal reducer increments and decrements", () => {
  const initial = createInitialState();
  const inc = reduceMinimalState(initial, { type: "increment" });
  assert.equal(inc.count, 1);
  const dec = reduceMinimalState(inc, { type: "decrement" });
  assert.equal(dec.count, 0);
});

test("minimal reducer stores error messages", () => {
  const initial = createInitialState();
  const errored = reduceMinimalState(initial, {
    type: "set-error",
    message: "boom",
  });
  assert.equal(errored.lastError, "boom");
});
