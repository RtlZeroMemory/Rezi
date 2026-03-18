import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readRecordNumber, safeReadJsonl } from "../jsonl.js";

test("readRecordNumber preserves numeric-string artifact compatibility", () => {
  assert.equal(readRecordNumber({ renderTotalMs: 12.5 }, "renderTotalMs"), 12.5);
  assert.equal(readRecordNumber({ renderTotalMs: "12.5" }, "renderTotalMs"), 12.5);
  assert.equal(readRecordNumber({ renderTotalMs: " 42 " }, "renderTotalMs"), 42);
  assert.equal(readRecordNumber({ renderTotalMs: "" }, "renderTotalMs"), null);
  assert.equal(readRecordNumber({ renderTotalMs: "not-a-number" }, "renderTotalMs"), null);
});

test("safeReadJsonl skips blank, malformed, and non-record rows", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "rezi-jsonl-"));
  const file = path.join(dir, "frames.jsonl");

  try {
    writeFileSync(
      file,
      '{"renderTotalMs":"12"}\r\n\r\n42\r\n{"stdoutBytes":5}\n{"bad"\nnull\n[]\n{"scheduleWaitMs":7}\n',
    );

    assert.deepEqual(safeReadJsonl(file), [
      { renderTotalMs: "12" },
      { stdoutBytes: 5 },
      { scheduleWaitMs: 7 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
