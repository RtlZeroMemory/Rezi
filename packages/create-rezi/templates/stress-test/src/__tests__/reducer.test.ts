import assert from "node:assert/strict";
import test from "node:test";
import { reduceStressExampleState } from "../helpers/test-examples.js";

test("stress example reducer advances and rewinds phase", () => {
  const start = { phase: 2, turbo: false } as const;
  const up = reduceStressExampleState(start, { type: "advance-phase" });
  const down = reduceStressExampleState(up, { type: "rewind-phase" });
  assert.equal(up.phase, 3);
  assert.equal(down.phase, 2);
});
