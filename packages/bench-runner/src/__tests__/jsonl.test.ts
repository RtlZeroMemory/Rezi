import assert from "node:assert/strict";
import test from "node:test";

import { readRecordNumber } from "../jsonl.js";

test("readRecordNumber preserves numeric-string artifact compatibility", () => {
  assert.equal(readRecordNumber({ renderTotalMs: 12.5 }, "renderTotalMs"), 12.5);
  assert.equal(readRecordNumber({ renderTotalMs: "12.5" }, "renderTotalMs"), 12.5);
  assert.equal(readRecordNumber({ renderTotalMs: " 42 " }, "renderTotalMs"), 42);
  assert.equal(readRecordNumber({ renderTotalMs: "" }, "renderTotalMs"), null);
  assert.equal(readRecordNumber({ renderTotalMs: "not-a-number" }, "renderTotalMs"), null);
});
