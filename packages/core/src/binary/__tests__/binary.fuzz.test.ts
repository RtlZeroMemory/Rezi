import { assert, type Rng, chance, pick, randomInt, runFuzz, test } from "@rezi-ui/testkit";
import { ZrBinaryError } from "../parseError.js";
import { BinaryReader } from "../reader.js";
import { BinaryWriter } from "../writer.js";

type WriteOp =
  | Readonly<{ kind: "u8"; value: number }>
  | Readonly<{ kind: "u32"; value: number }>
  | Readonly<{ kind: "i32"; value: number }>
  | Readonly<{ kind: "bytes"; bytes: Uint8Array }>
  | Readonly<{ kind: "pad4" }>;

type SuccessfulRead =
  | Readonly<{ kind: "u8"; value: number }>
  | Readonly<{ kind: "u32"; value: number }>
  | Readonly<{ kind: "i32"; value: number }>
  | Readonly<{ kind: "bytes"; bytes: Uint8Array }>
  | Readonly<{ kind: "skip"; len: number }>;

function randomOp(rng: Rng): WriteOp {
  const kind = pick(rng, ["u8", "u32", "i32", "bytes", "pad4"] as const);
  if (kind === "u8") return { kind, value: rng.u32() };
  if (kind === "u32") return { kind, value: rng.u32() };
  if (kind === "i32") return { kind, value: rng.u32() | 0 };
  if (kind === "pad4") return { kind };
  return { kind, bytes: rng.bytes(randomInt(rng, 0, 12)) };
}

function expectedFailure(
  op: WriteOp,
  offset: number,
  capacity: number,
): "ZR_MISALIGNED" | "ZR_LIMIT" | null {
  const size = op.kind === "u8" ? 1 : op.kind === "u32" || op.kind === "i32" ? 4 : 0;
  if ((op.kind === "u32" || op.kind === "i32") && (offset & 3) !== 0) return "ZR_MISALIGNED";
  if (op.kind === "bytes") return offset + op.bytes.byteLength > capacity ? "ZR_LIMIT" : null;
  if (op.kind === "pad4") {
    const aligned = (offset + 3) & ~3;
    return aligned > capacity ? "ZR_LIMIT" : null;
  }
  return offset + size > capacity ? "ZR_LIMIT" : null;
}

function appendLeU32(out: number[], value: number): void {
  out.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function appendLeI32(out: number[], value: number): void {
  appendLeU32(out, value >>> 0);
}

function applyExpected(op: WriteOp, expected: number[], reads: SuccessfulRead[]): void {
  if (op.kind === "u8") {
    expected.push(op.value & 0xff);
    reads.push({ kind: "u8", value: op.value & 0xff });
    return;
  }
  if (op.kind === "u32") {
    appendLeU32(expected, op.value);
    reads.push({ kind: "u32", value: op.value >>> 0 });
    return;
  }
  if (op.kind === "i32") {
    appendLeI32(expected, op.value);
    reads.push({ kind: "i32", value: op.value | 0 });
    return;
  }
  if (op.kind === "bytes") {
    expected.push(...op.bytes);
    reads.push({ kind: "bytes", bytes: op.bytes });
    return;
  }

  const before = expected.length;
  const aligned = (before + 3) & ~3;
  while (expected.length < aligned) expected.push(0);
  if (aligned > before) reads.push({ kind: "skip", len: aligned - before });
}

function applyWriter(writer: BinaryWriter, op: WriteOp): void {
  if (op.kind === "u8") {
    writer.writeU8(op.value);
    return;
  }
  if (op.kind === "u32") {
    writer.writeU32(op.value);
    return;
  }
  if (op.kind === "i32") {
    writer.writeI32(op.value);
    return;
  }
  if (op.kind === "bytes") {
    writer.writeBytes(op.bytes);
    return;
  }
  writer.padTo4();
}

function assertBinaryError(err: unknown, code: "ZR_MISALIGNED" | "ZR_LIMIT"): boolean {
  assert.ok(err instanceof ZrBinaryError);
  assert.equal(err.code, code);
  return true;
}

function assertReaderRoundTrip(bytes: Uint8Array, reads: readonly SuccessfulRead[]): void {
  const reader = new BinaryReader(bytes);
  for (const read of reads) {
    if (read.kind === "u8") {
      assert.equal(reader.readU8(), read.value);
      continue;
    }
    if (read.kind === "u32") {
      assert.equal(reader.readU32(), read.value);
      continue;
    }
    if (read.kind === "i32") {
      assert.equal(reader.readI32(), read.value);
      continue;
    }
    if (read.kind === "bytes") {
      assert.deepEqual(Array.from(reader.readBytes(read.bytes.byteLength)), Array.from(read.bytes));
      continue;
    }
    reader.skip(read.len);
  }
  assert.equal(reader.remaining, 0);
}

function assertTruncatedReadsFail(bytes: Uint8Array, reads: readonly SuccessfulRead[]): void {
  if (bytes.byteLength === 0) return;
  const truncated = bytes.subarray(0, bytes.byteLength - 1);
  const reader = new BinaryReader(truncated);
  let sawFailure = false;

  for (const read of reads) {
    try {
      if (read.kind === "u8") reader.readU8();
      else if (read.kind === "u32") reader.readU32();
      else if (read.kind === "i32") reader.readI32();
      else if (read.kind === "bytes") reader.readBytes(read.bytes.byteLength);
      else reader.skip(read.len);
    } catch (err: unknown) {
      assert.ok(err instanceof ZrBinaryError);
      assert.equal(err.code, "ZR_TRUNCATED");
      sawFailure = true;
      break;
    }
  }

  assert.equal(sawFailure, true);
}

test("BinaryReader/BinaryWriter fuzz: bounded programs preserve bytes and failure atomicity", async () => {
  await runFuzz(
    {
      seed: 0xb16a_0001,
      iterations: 2048,
      label: "binary reader/writer",
    },
    (ctx) => {
      const capacity = randomInt(ctx.rng, 0, 160);
      const opCount = randomInt(ctx.rng, 1, 80);
      const writer = new BinaryWriter(capacity);
      const expected: number[] = [];
      const reads: SuccessfulRead[] = [];
      ctx.note(`capacity=${String(capacity)} ops=${String(opCount)}`);

      for (let i = 0; i < opCount; i++) {
        const op = randomOp(ctx.rng);
        const failure = expectedFailure(op, expected.length, capacity);
        const offsetBefore = writer.offset;

        if (failure !== null) {
          assert.throws(
            () => applyWriter(writer, op),
            (err: unknown) => assertBinaryError(err, failure),
          );
          assert.equal(writer.offset, offsetBefore, "failed writes must not advance the cursor");
          if (
            chance(ctx.rng, 45) &&
            expectedFailure({ kind: "pad4" }, expected.length, capacity) === null
          ) {
            applyWriter(writer, { kind: "pad4" });
            applyExpected({ kind: "pad4" }, expected, reads);
          }
          continue;
        }

        applyWriter(writer, op);
        applyExpected(op, expected, reads);
        assert.equal(writer.offset, expected.length);
      }

      const bytes = writer.finish();
      assert.deepEqual(Array.from(bytes), expected);
      assertReaderRoundTrip(bytes, reads);
      assertTruncatedReadsFail(bytes, reads);
    },
  );
});
