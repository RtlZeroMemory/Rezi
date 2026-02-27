import { assert, describe, test } from "@rezi-ui/testkit";
import {
  OP_DRAW_TEXT,
  OP_DRAW_TEXT_RUN,
  parseBlobById,
  parseCommandHeaders,
} from "../../__tests__/drawlistDecode.js";
import { createDrawlistBuilder } from "../../index.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function textRunAttrs(bytes: Uint8Array, segmentIndex: number): number {
  const drawTextRun = parseCommandHeaders(bytes).find((cmd) => cmd.opcode === OP_DRAW_TEXT_RUN);
  assert.equal(drawTextRun !== undefined, true);
  if (!drawTextRun) return 0;
  const blobId = u32(bytes, drawTextRun.offset + 16);
  const blob = parseBlobById(bytes, blobId);
  assert.equal(blob !== null, true);
  if (!blob) return 0;
  return u32(blob, 4 + segmentIndex * 40 + 8);
}

function firstDrawTextOffset(bytes: Uint8Array): number {
  const drawText = parseCommandHeaders(bytes).find((cmd) => cmd.opcode === OP_DRAW_TEXT);
  assert.equal(drawText !== undefined, true);
  if (!drawText) return 0;
  return drawText.offset;
}

function drawTextAttrs(bytes: Uint8Array): number {
  return u32(bytes, firstDrawTextOffset(bytes) + 36);
}

describe("drawlist style attrs encode dim", () => {
  test("drawText attrs include dim without shifting existing bits", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "dim", { dim: true });
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(drawTextAttrs(res.bytes), 1 << 4);
  });

  test("drawText attrs include dim without shifting existing bits (repeat)", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "dim", { dim: true });
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(drawTextAttrs(res.bytes), 1 << 4);
  });

  test("v1 text-run attrs include dim without shifting existing bits", () => {
    const b = createDrawlistBuilder();
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
    const b = createDrawlistBuilder();
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
