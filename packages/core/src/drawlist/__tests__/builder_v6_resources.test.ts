import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder } from "../../index.js";

function u32(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(off, true);
}

function expectOk(
  result: ReturnType<ReturnType<typeof createDrawlistBuilder>["build"]>,
): Uint8Array {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("drawlist build failed");
  return result.bytes;
}

describe("DrawlistBuilder resource inputs", () => {
  test("accepts blob resources for canvas commands", () => {
    const b = createDrawlistBuilder();
    const blobIndex = b.addBlob(new Uint8Array([1, 2, 3, 4]));
    assert.equal(blobIndex !== null, true);
    if (blobIndex === null) throw new Error("missing blob index");

    b.clear();
    b.drawCanvas(0, 0, 1, 1, blobIndex, "ascii", 1, 1);
    const bytes = expectOk(b.build());
    assert.equal(bytes.byteLength > 0, true);
  });

  test("keeps DEF_BLOB byteLen/data exact for non-4-byte blob payloads", () => {
    const b = createDrawlistBuilder();
    const payload = new Uint8Array([0xde, 0xad, 0xbe]);
    const blobIndex = b.addBlob(payload);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) throw new Error("missing blob index");

    const bytes = expectOk(b.build());
    const cmdOffset = u32(bytes, 16);
    const cmdCount = u32(bytes, 24);
    assert.equal(cmdCount >= 1, true);

    assert.equal(bytes[cmdOffset], 12); // DEF_BLOB
    assert.equal(u32(bytes, cmdOffset + 4), 20); // 16-byte header + 3-byte payload + 1 pad
    assert.equal(u32(bytes, cmdOffset + 8), 1);
    assert.equal(u32(bytes, cmdOffset + 12), 3);
    assert.deepEqual(
      Array.from(bytes.subarray(cmdOffset + 16, cmdOffset + 19)),
      [0xde, 0xad, 0xbe],
    );
    assert.equal(bytes[cmdOffset + 19], 0);
  });

  test("accepts text-run blobs", () => {
    const b = createDrawlistBuilder();
    const blobIndex = b.addTextRunBlob([
      { text: "left", style: { bold: true } },
      { text: "right", style: { italic: true } },
    ]);
    assert.equal(blobIndex !== null, true);
    if (blobIndex === null) throw new Error("missing text-run blob index");

    b.clear();
    b.drawTextRun(0, 0, blobIndex);
    const bytes = expectOk(b.build());
    assert.equal(bytes.byteLength > 0, true);
  });

  test("reset clears transient command state but builder remains reusable", () => {
    const b = createDrawlistBuilder();
    b.clear();
    expectOk(b.build());

    b.reset();
    b.clearTo(10, 2);
    const bytes = expectOk(b.build());
    assert.equal(bytes.byteLength > 0, true);
  });
});
