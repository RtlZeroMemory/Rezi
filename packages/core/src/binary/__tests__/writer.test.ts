import { assert, describe, test } from "@rezi-ui/testkit";
import { ZrBinaryError } from "../parseError.js";
import { BinaryWriter } from "../writer.js";

describe("BinaryWriter", () => {
  test("constructor rejects invalid capacity with ZrBinaryError", () => {
    assert.throws(
      () => new BinaryWriter(-1),
      (err: unknown) => {
        assert.ok(err instanceof ZrBinaryError);
        assert.equal(err.code, "ZR_LIMIT");
        assert.equal(err.offset, 0);
        assert.equal(
          err.message,
          "ZR_LIMIT at 0: capacity must be a non-negative integer (got -1)",
        );
        return true;
      },
    );

    assert.throws(
      () => new BinaryWriter(1.5),
      (err: unknown) => {
        assert.ok(err instanceof ZrBinaryError);
        assert.equal(err.code, "ZR_LIMIT");
        assert.equal(err.offset, 0);
        assert.equal(
          err.message,
          "ZR_LIMIT at 0: capacity must be a non-negative integer (got 1.5)",
        );
        return true;
      },
    );
  });

  test("constructor rejects excessive capacity before allocation", () => {
    assert.throws(
      () => new BinaryWriter(Number.MAX_SAFE_INTEGER),
      (err: unknown) => {
        assert.ok(err instanceof ZrBinaryError);
        assert.equal(err.code, "ZR_LIMIT");
        assert.equal(err.offset, 0);
        assert.equal(
          err.message,
          "ZR_LIMIT at 0: capacity 9007199254740991 exceeds maximum 16777216",
        );
        return true;
      },
    );
  });

  test("padTo4 writes 0x00 bytes only", () => {
    const w = new BinaryWriter(16);
    w.writeU8(0xff);
    w.padTo4();
    w.writeU32(0x11223344);

    const out = w.finish();
    assert.deepEqual(Array.from(out), [0xff, 0x00, 0x00, 0x00, 0x44, 0x33, 0x22, 0x11]);
  });

  test("writeU32 enforces alignment deterministically", () => {
    const w = new BinaryWriter(16);
    w.writeU8(0x01);
    assert.throws(
      () => w.writeU32(0),
      (err: unknown) => {
        assert.ok(err instanceof ZrBinaryError);
        assert.equal(err.code, "ZR_MISALIGNED");
        assert.equal(err.offset, 1);
        assert.equal(err.message, "ZR_MISALIGNED at 1: offset must be 4-byte aligned");
        return true;
      },
    );
  });

  test("capacity overflow fails deterministically", () => {
    const w = new BinaryWriter(4);
    w.writeU32(0);
    assert.throws(
      () => w.writeU8(0),
      (err: unknown) => {
        assert.ok(err instanceof ZrBinaryError);
        assert.equal(err.code, "ZR_LIMIT");
        assert.equal(err.offset, 4);
        assert.equal(err.message, "ZR_LIMIT at 4: write of 1 byte(s) exceeds capacity 4");
        return true;
      },
    );
  });
});
