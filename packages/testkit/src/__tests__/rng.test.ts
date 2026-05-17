import { assert, test } from "../nodeTest.js";
import { createRng } from "../rng.js";

test("createRng: same seed => same u32 sequence", () => {
  const a = createRng(123);
  const b = createRng(123);

  const aa = [a.u32(), a.u32(), a.u32(), a.u32(), a.u32()];
  const bb = [b.u32(), b.u32(), b.u32(), b.u32(), b.u32()];
  assert.deepEqual(aa, bb);
});

test("createRng: seed must be a uint32 integer", () => {
  assert.throws(() => createRng(-1), /seed must be a uint32 integer/u);
  assert.throws(() => createRng(1.5), /seed must be a uint32 integer/u);
  assert.throws(() => createRng(0x1_0000_0000), /seed must be a uint32 integer/u);
});

test("createRng: bytes() is deterministic and little-endian from u32()", () => {
  const r1 = createRng(1);
  const r2 = createRng(1);

  const b1 = r1.bytes(9);
  const b2 = r2.bytes(9);
  assert.deepEqual(Array.from(b1), Array.from(b2));

  const r3 = createRng(1);
  const x = r3.u32();
  const y = r3.u32();
  const expected = [
    x & 0xff,
    (x >>> 8) & 0xff,
    (x >>> 16) & 0xff,
    (x >>> 24) & 0xff,
    y & 0xff,
    (y >>> 8) & 0xff,
    (y >>> 16) & 0xff,
    (y >>> 24) & 0xff,
    // next u32 least-significant byte
    r3.u32() & 0xff,
  ];
  assert.deepEqual(Array.from(b1), expected);
});
