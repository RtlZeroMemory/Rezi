import { assert, describe, test } from "@rezi-ui/testkit";
import {
  OP_CLEAR,
  OP_DEF_BLOB,
  OP_DEF_STRING,
  OP_DRAW_TEXT_RUN,
  parseBlobById,
  parseCommandHeaders,
  parseInternedStrings,
} from "../../__tests__/drawlistDecode.js";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1, createDrawlistBuilder } from "../../index.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt32(off, true);
}

describe("DrawlistBuilder (ZRDL v1) - DRAW_TEXT_RUN", () => {
  test("emits DEF_STRING/DEF_BLOB resources and DRAW_TEXT_RUN references blob id", () => {
    const b = createDrawlistBuilder();

    const blobIndex = b.addTextRunBlob([
      { text: "ABC", style: { fg: (255 << 16) | (0 << 8) | 0, bold: true } },
      { text: "DEF", style: { fg: (0 << 16) | (255 << 8) | 0, underline: true } },
    ]);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) return;

    b.clear();
    b.drawTextRun(1, 2, blobIndex);

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const bytes = res.bytes;

    assert.equal(u32(bytes, 0), ZRDL_MAGIC);
    assert.equal(u32(bytes, 4), ZR_DRAWLIST_VERSION_V1);
    assert.equal(u32(bytes, 8), 64);
    assert.equal(u32(bytes, 12), bytes.byteLength);
    assert.equal(u32(bytes, 16), 64);
    assert.equal(u32(bytes, 24), 5);
    assert.equal(u32(bytes, 28), 0);
    assert.equal(u32(bytes, 32), 0);
    assert.equal(u32(bytes, 44), 0);
    assert.equal(u32(bytes, 48), 0);

    const headers = parseCommandHeaders(bytes);
    assert.deepEqual(
      headers.map((h) => h.opcode),
      [OP_DEF_STRING, OP_DEF_STRING, OP_DEF_BLOB, OP_CLEAR, OP_DRAW_TEXT_RUN],
    );

    const drawTextRun = headers.find((h) => h.opcode === OP_DRAW_TEXT_RUN);
    assert.equal(drawTextRun !== undefined, true);
    if (!drawTextRun) return;
    assert.equal(i32(bytes, drawTextRun.offset + 8), 1);
    assert.equal(i32(bytes, drawTextRun.offset + 12), 2);
    assert.equal(u32(bytes, drawTextRun.offset + 16), 1);
    assert.equal(u32(bytes, drawTextRun.offset + 20), 0);

    assert.deepEqual(parseInternedStrings(bytes), ["ABC", "DEF"]);

    const blob = parseBlobById(bytes, 1);
    assert.equal(blob !== null, true);
    if (!blob) return;
    assert.equal(u32(blob, 0), 2);

    const seg0 = 4;
    assert.equal(u32(blob, seg0 + 0), 0x00ff_0000);
    assert.equal(u32(blob, seg0 + 4), 0);
    assert.equal(u32(blob, seg0 + 8), 1);
    assert.equal(u32(blob, seg0 + 12), 0);
    assert.equal(u32(blob, seg0 + 16), 0);
    assert.equal(u32(blob, seg0 + 20), 0);
    assert.equal(u32(blob, seg0 + 24), 0);
    assert.equal(u32(blob, seg0 + 28), 1);
    assert.equal(u32(blob, seg0 + 32), 0);
    assert.equal(u32(blob, seg0 + 36), 3);

    const seg1 = seg0 + 40;
    assert.equal(u32(blob, seg1 + 0), 0x0000_ff00);
    assert.equal(u32(blob, seg1 + 4), 0);
    assert.equal(u32(blob, seg1 + 8), 1 << 2);
    assert.equal(u32(blob, seg1 + 12), 0);
    assert.equal(u32(blob, seg1 + 16), 0);
    assert.equal(u32(blob, seg1 + 20), 0);
    assert.equal(u32(blob, seg1 + 24), 0);
    assert.equal(u32(blob, seg1 + 28), 2);
    assert.equal(u32(blob, seg1 + 32), 0);
    assert.equal(u32(blob, seg1 + 36), 3);
  });
});
