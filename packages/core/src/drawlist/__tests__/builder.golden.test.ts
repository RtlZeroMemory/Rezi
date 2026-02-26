import { assert, assertBytesEqual, describe, readFixture, test } from "@rezi-ui/testkit";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1, createDrawlistBuilder } from "../../index.js";

async function load(rel: string): Promise<Uint8Array> {
  return readFixture(`zrdl-v1/golden/${rel}`);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function assertHeader(
  bytes: Uint8Array,
  expected: Readonly<{
    totalSize: number;
    cmdOffset: number;
    cmdBytes: number;
    cmdCount: number;
    stringsSpanOffset: number;
    stringsCount: number;
    stringsBytesOffset: number;
    stringsBytesLen: number;
    blobsSpanOffset: number;
    blobsCount: number;
    blobsBytesOffset: number;
    blobsBytesLen: number;
  }>,
): void {
  assert.equal(u32(bytes, 0), ZRDL_MAGIC);
  assert.equal(u32(bytes, 4), ZR_DRAWLIST_VERSION_V1);
  assert.equal(u32(bytes, 8), 64);
  assert.equal(u32(bytes, 12), expected.totalSize);

  assert.equal(u32(bytes, 16), expected.cmdOffset);
  assert.equal(u32(bytes, 20), expected.cmdBytes);
  assert.equal(u32(bytes, 24), expected.cmdCount);

  assert.equal(u32(bytes, 28), expected.stringsSpanOffset);
  assert.equal(u32(bytes, 32), expected.stringsCount);
  assert.equal(u32(bytes, 36), expected.stringsBytesOffset);
  assert.equal(u32(bytes, 40), expected.stringsBytesLen);

  assert.equal(u32(bytes, 44), expected.blobsSpanOffset);
  assert.equal(u32(bytes, 48), expected.blobsCount);
  assert.equal(u32(bytes, 52), expected.blobsBytesOffset);
  assert.equal(u32(bytes, 56), expected.blobsBytesLen);

  assert.equal(u32(bytes, 60), 0);
}

describe("DrawlistBuilder (ZRDL v1) - golden byte fixtures", () => {
  test("clear_only.bin", async () => {
    const expected = await load("clear_only.bin");

    const b = createDrawlistBuilder();
    b.clear();
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assertBytesEqual(res.bytes, expected, "clear_only.bin");
    assertHeader(res.bytes, {
      totalSize: 72,
      cmdOffset: 64,
      cmdBytes: 8,
      cmdCount: 1,
      stringsSpanOffset: 0,
      stringsCount: 0,
      stringsBytesOffset: 0,
      stringsBytesLen: 0,
      blobsSpanOffset: 0,
      blobsCount: 0,
      blobsBytesOffset: 0,
      blobsBytesLen: 0,
    });
  });

  test("fill_rect.bin", async () => {
    const expected = await load("fill_rect.bin");

    const b = createDrawlistBuilder();
    b.fillRect(1, 2, 3, 4, { fg: ((0 << 16) | (255 << 8) | 0), bold: true, underline: true });
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assertBytesEqual(res.bytes, expected, "fill_rect.bin");
    assertHeader(res.bytes, {
      totalSize: 104,
      cmdOffset: 64,
      cmdBytes: 40,
      cmdCount: 1,
      stringsSpanOffset: 0,
      stringsCount: 0,
      stringsBytesOffset: 0,
      stringsBytesLen: 0,
      blobsSpanOffset: 0,
      blobsCount: 0,
      blobsBytesOffset: 0,
      blobsBytesLen: 0,
    });
  });

  test("draw_text_interned.bin", async () => {
    const expected = await load("draw_text_interned.bin");

    const b = createDrawlistBuilder();
    b.drawText(0, 0, "hello", { fg: ((255 << 16) | (255 << 8) | 255) });
    b.drawText(0, 1, "hello");
    b.drawText(0, 2, "world", { bg: ((0 << 16) | (0 << 8) | 255), inverse: true });
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assertBytesEqual(res.bytes, expected, "draw_text_interned.bin");
    assertHeader(res.bytes, {
      totalSize: 236,
      cmdOffset: 64,
      cmdBytes: 144,
      cmdCount: 3,
      stringsSpanOffset: 208,
      stringsCount: 2,
      stringsBytesOffset: 224,
      stringsBytesLen: 12,
      blobsSpanOffset: 0,
      blobsCount: 0,
      blobsBytesOffset: 0,
      blobsBytesLen: 0,
    });
  });

  test("clip_nested.bin", async () => {
    const expected = await load("clip_nested.bin");

    const b = createDrawlistBuilder();
    b.pushClip(0, 0, 10, 10);
    b.pushClip(1, 1, 8, 8);
    b.fillRect(2, 2, 3, 4, { bg: ((255 << 16) | (0 << 8) | 0), inverse: true });
    b.popClip();
    b.popClip();
    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    assertBytesEqual(res.bytes, expected, "clip_nested.bin");
    assertHeader(res.bytes, {
      totalSize: 168,
      cmdOffset: 64,
      cmdBytes: 104,
      cmdCount: 5,
      stringsSpanOffset: 0,
      stringsCount: 0,
      stringsBytesOffset: 0,
      stringsBytesLen: 0,
      blobsSpanOffset: 0,
      blobsCount: 0,
      blobsBytesOffset: 0,
      blobsBytesLen: 0,
    });
  });
});
