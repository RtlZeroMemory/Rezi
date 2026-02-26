import { assert, describe, test } from "@rezi-ui/testkit";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1, createDrawlistBuilder } from "../../index.js";

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt32(off, true);
}

describe("DrawlistBuilder (ZRDL v1) - DRAW_TEXT_RUN", () => {
  test("emits blob span + DRAW_TEXT_RUN command referencing it", () => {
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

    // Header fields (see docs-user/abi/drawlist-v1.md)
    assert.equal(u32(bytes, 0), ZRDL_MAGIC);
    assert.equal(u32(bytes, 4), ZR_DRAWLIST_VERSION_V1);
    assert.equal(u32(bytes, 8), 64);
    assert.equal(u32(bytes, 12), 188);
    assert.equal(u32(bytes, 16), 64); // cmd_offset
    assert.equal(u32(bytes, 20), 32); // cmd_bytes
    assert.equal(u32(bytes, 24), 2); // cmd_count
    assert.equal(u32(bytes, 28), 96); // strings_span_offset
    assert.equal(u32(bytes, 32), 2); // strings_count
    assert.equal(u32(bytes, 36), 112); // strings_bytes_offset
    assert.equal(u32(bytes, 40), 8); // strings_bytes_len (4-byte aligned)
    assert.equal(u32(bytes, 44), 120); // blobs_span_offset
    assert.equal(u32(bytes, 48), 1); // blobs_count
    assert.equal(u32(bytes, 52), 128); // blobs_bytes_offset
    assert.equal(u32(bytes, 56), 60); // blobs_bytes_len
    assert.equal(u32(bytes, 60), 0); // reserved0

    // Command 0: CLEAR at offset 64
    assert.equal(u16(bytes, 64 + 0), 1);
    assert.equal(u16(bytes, 64 + 2), 0);
    assert.equal(u32(bytes, 64 + 4), 8);

    // Command 1: DRAW_TEXT_RUN at offset 72
    assert.equal(u16(bytes, 72 + 0), 6);
    assert.equal(u16(bytes, 72 + 2), 0);
    assert.equal(u32(bytes, 72 + 4), 24);
    assert.equal(i32(bytes, 72 + 8), 1); // x
    assert.equal(i32(bytes, 72 + 12), 2); // y
    assert.equal(u32(bytes, 72 + 16), 0); // blob_index
    assert.equal(u32(bytes, 72 + 20), 0); // reserved0

    // String spans: two entries at offset 96
    assert.equal(u32(bytes, 96 + 0), 0);
    assert.equal(u32(bytes, 96 + 4), 3);
    assert.equal(u32(bytes, 104 + 0), 3);
    assert.equal(u32(bytes, 104 + 4), 3);

    // String bytes: "ABCDEF" at offset 112 (padded to 4-byte alignment).
    assert.equal(String.fromCharCode(...bytes.subarray(112, 118)), "ABCDEF");

    // Blob span: single entry at offset 120
    assert.equal(u32(bytes, 120 + 0), 0);
    assert.equal(u32(bytes, 120 + 4), 60);

    // Blob bytes: seg_count=2 + two segments (28 bytes each)
    const blobOff = 128;
    assert.equal(u32(bytes, blobOff + 0), 2);

    // Segment 0
    assert.equal(u32(bytes, blobOff + 4 + 0), 0x00ff0000); // fg
    assert.equal(u32(bytes, blobOff + 4 + 4), 0); // bg
    assert.equal(u32(bytes, blobOff + 4 + 8), 1); // attrs (bold)
    assert.equal(u32(bytes, blobOff + 4 + 12), 0); // reserved0
    assert.equal(u32(bytes, blobOff + 4 + 16), 0); // string_index
    assert.equal(u32(bytes, blobOff + 4 + 20), 0); // byte_off
    assert.equal(u32(bytes, blobOff + 4 + 24), 3); // byte_len

    // Segment 1
    const seg1 = blobOff + 4 + 28;
    assert.equal(u32(bytes, seg1 + 0), 0x0000ff00); // fg
    assert.equal(u32(bytes, seg1 + 4), 0); // bg
    assert.equal(u32(bytes, seg1 + 8), 1 << 2); // attrs (underline)
    assert.equal(u32(bytes, seg1 + 12), 0); // reserved0
    assert.equal(u32(bytes, seg1 + 16), 1); // string_index
    assert.equal(u32(bytes, seg1 + 20), 0); // byte_off
    assert.equal(u32(bytes, seg1 + 24), 3); // byte_len
  });
});
