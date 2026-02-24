import assert from "node:assert/strict";
import test from "node:test";
import { readDebugBytesWithRetry } from "../backend/nodeBackendInline.js";

test("readDebugBytesWithRetry retries when first read exactly fills the buffer", () => {
  let callCount = 0;
  const bytes = readDebugBytesWithRetry(
    (out) => {
      callCount++;
      if (callCount === 1) {
        out.fill(0xaa);
        return out.byteLength;
      }
      out[0] = 0x11;
      out[1] = 0x22;
      out[2] = 0x33;
      return 3;
    },
    4,
    null,
    "testDebugRead",
  );

  assert.equal(callCount, 2);
  assert.equal(bytes instanceof Uint8Array, true);
  assert.deepEqual(Array.from(bytes ?? []), [0x11, 0x22, 0x33]);
});

test("readDebugBytesWithRetry returns empty value when native returns <= 0", () => {
  const empty = readDebugBytesWithRetry(() => 0, 4, null, "testEmpty");
  assert.equal(empty, null);
});

test("readDebugBytesWithRetry throws when native returns invalid byte count", () => {
  assert.throws(
    () => readDebugBytesWithRetry(() => 999, 4, new Uint8Array(0), "testInvalid"),
    /invalid byte count/,
  );
});
