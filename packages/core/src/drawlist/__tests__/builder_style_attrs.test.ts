import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilderV1, createDrawlistBuilderV2 } from "../../index.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function textRunAttrs(bytes: Uint8Array, segmentIndex: number): number {
  const blobsBytesOffset = u32(bytes, 52);
  return u32(bytes, blobsBytesOffset + 4 + segmentIndex * 28 + 8);
}

function firstCommandOffset(bytes: Uint8Array): number {
  return u32(bytes, 16);
}

function drawTextAttrs(bytes: Uint8Array): number {
  return u32(bytes, firstCommandOffset(bytes) + 36);
}

describe("drawlist style attrs encode dim", () => {
  test("v1 drawText attrs include dim without shifting existing bits", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "dim", { dim: true });
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(drawTextAttrs(res.bytes), 1 << 4);
  });

  test("v2 drawText attrs include dim without shifting existing bits", () => {
    const b = createDrawlistBuilderV2();
    b.drawText(0, 0, "dim", { dim: true });
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(drawTextAttrs(res.bytes), 1 << 4);
  });

  test("v1 text-run attrs include dim without shifting existing bits", () => {
    const b = createDrawlistBuilderV1();
    const blobIndex = b.addTextRunBlob([
      { text: "dim", style: { dim: true } },
      { text: "base", style: { bold: true, italic: true, underline: true, inverse: true } },
    ]);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) return;

    b.drawTextRun(0, 0, blobIndex);
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(textRunAttrs(res.bytes, 0), 1 << 4);
    assert.equal(textRunAttrs(res.bytes, 1), (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3));
  });

  test("v2 text-run attrs include dim without shifting existing bits", () => {
    const b = createDrawlistBuilderV2();
    const blobIndex = b.addTextRunBlob([
      { text: "dim", style: { dim: true } },
      { text: "base", style: { bold: true, italic: true, underline: true, inverse: true } },
    ]);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) return;

    b.drawTextRun(0, 0, blobIndex);
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(textRunAttrs(res.bytes, 0), 1 << 4);
    assert.equal(textRunAttrs(res.bytes, 1), (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3));
  });
});
