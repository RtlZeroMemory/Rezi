import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilderV1 } from "../builder_v1.js";
import type { DrawlistBuildResult } from "../types.js";

const HEADER = {
  TOTAL_SIZE: 12,
  CMD_OFFSET: 16,
  CMD_BYTES: 20,
  CMD_COUNT: 24,
  STRINGS_SPAN_OFFSET: 28,
  STRINGS_COUNT: 32,
  STRINGS_BYTES_OFFSET: 36,
  STRINGS_BYTES_LEN: 40,
  BLOBS_SPAN_OFFSET: 44,
  BLOBS_COUNT: 48,
  BLOBS_BYTES_OFFSET: 52,
  BLOBS_BYTES_LEN: 56,
  SIZE: 64,
} as const;

const CMD = {
  SIZE: 4,
  HEADER_SIZE: 8,
} as const;

const SPAN_SIZE = 8;

type ParsedHeader = Readonly<{
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
}>;

function align4(n: number): number {
  return (n + 3) & ~3;
}

function toView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function parseHeader(bytes: Uint8Array): ParsedHeader {
  const dv = toView(bytes);
  return {
    totalSize: dv.getUint32(HEADER.TOTAL_SIZE, true),
    cmdOffset: dv.getUint32(HEADER.CMD_OFFSET, true),
    cmdBytes: dv.getUint32(HEADER.CMD_BYTES, true),
    cmdCount: dv.getUint32(HEADER.CMD_COUNT, true),
    stringsSpanOffset: dv.getUint32(HEADER.STRINGS_SPAN_OFFSET, true),
    stringsCount: dv.getUint32(HEADER.STRINGS_COUNT, true),
    stringsBytesOffset: dv.getUint32(HEADER.STRINGS_BYTES_OFFSET, true),
    stringsBytesLen: dv.getUint32(HEADER.STRINGS_BYTES_LEN, true),
    blobsSpanOffset: dv.getUint32(HEADER.BLOBS_SPAN_OFFSET, true),
    blobsCount: dv.getUint32(HEADER.BLOBS_COUNT, true),
    blobsBytesOffset: dv.getUint32(HEADER.BLOBS_BYTES_OFFSET, true),
    blobsBytesLen: dv.getUint32(HEADER.BLOBS_BYTES_LEN, true),
  };
}

function expectOk(result: DrawlistBuildResult): Uint8Array {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected build() to succeed");
  return result.bytes;
}

function readStringSpan(
  dv: DataView,
  stringsSpanOffset: number,
  index: number,
): { off: number; len: number } {
  const spanOff = stringsSpanOffset + index * SPAN_SIZE;
  return {
    off: dv.getUint32(spanOff, true),
    len: dv.getUint32(spanOff + 4, true),
  };
}

function commandStarts(bytes: Uint8Array, h: ParsedHeader): readonly number[] {
  const dv = toView(bytes);
  if (h.cmdCount === 0) return [];

  let cursor = h.cmdOffset;
  const starts: number[] = [];
  for (let i = 0; i < h.cmdCount; i++) {
    starts.push(cursor);
    const size = dv.getUint32(cursor + CMD.SIZE, true);
    assert.equal(size >= CMD.HEADER_SIZE, true, `command ${i} has invalid size`);
    cursor += align4(size);
  }
  assert.equal(cursor, h.cmdOffset + h.cmdBytes);
  return starts;
}

describe("DrawlistBuilderV1 - alignment and padding", () => {
  test("empty drawlist has aligned total size and zero section offsets", () => {
    const bytes = expectOk(createDrawlistBuilderV1().build());
    const h = parseHeader(bytes);

    assert.equal(h.totalSize, HEADER.SIZE);
    assert.equal((h.totalSize & 3) === 0, true);
    assert.equal(h.cmdOffset, 0);
    assert.equal(h.cmdBytes, 0);
    assert.equal(h.cmdCount, 0);
    assert.equal(h.stringsSpanOffset, 0);
    assert.equal(h.stringsBytesOffset, 0);
    assert.equal(h.blobsSpanOffset, 0);
    assert.equal(h.blobsBytesOffset, 0);
  });

  test("near-empty clear drawlist keeps command start and section layout aligned", () => {
    const b = createDrawlistBuilderV1();
    b.clear();
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.cmdOffset, HEADER.SIZE);
    assert.equal((h.cmdOffset & 3) === 0, true);
    assert.equal((h.cmdBytes & 3) === 0, true);
    assert.equal(h.cmdCount, 1);
    assert.equal(h.stringsCount, 0);
    assert.equal(h.blobsCount, 0);
  });

  test("all command starts are 4-byte aligned in a mixed stream", () => {
    const b = createDrawlistBuilderV1();
    b.clear();
    b.fillRect(0, 0, 3, 2);
    b.drawText(1, 1, "abc");
    b.pushClip(0, 0, 3, 2);
    b.popClip();
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const starts = commandStarts(bytes, h);

    assert.equal(starts.length, h.cmdCount);
    for (const start of starts) {
      assert.equal((start & 3) === 0, true);
    }
  });

  test("walking command sizes lands exactly on cmdOffset + cmdBytes", () => {
    const b = createDrawlistBuilderV1();
    const blobIndex = b.addBlob(new Uint8Array([1, 2, 3, 4]));
    assert.equal(blobIndex, 0);
    b.clear();
    b.drawText(0, 0, "x");
    b.drawTextRun(2, 1, 0);
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const starts = commandStarts(bytes, h);

    assert.equal(starts.length, 3);
    assert.equal(starts[0], HEADER.SIZE);
  });

  test("section offsets are aligned and ordered when strings and blobs exist", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "abc");
    const blobIndex = b.addBlob(new Uint8Array([9, 8, 7, 6]));
    assert.equal(blobIndex, 0);
    b.drawTextRun(1, 0, 0);
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal((h.cmdOffset & 3) === 0, true);
    assert.equal((h.stringsSpanOffset & 3) === 0, true);
    assert.equal((h.stringsBytesOffset & 3) === 0, true);
    assert.equal((h.blobsSpanOffset & 3) === 0, true);
    assert.equal((h.blobsBytesOffset & 3) === 0, true);

    assert.equal(h.stringsSpanOffset, HEADER.SIZE + h.cmdBytes);
    assert.equal(h.stringsBytesOffset, h.stringsSpanOffset + h.stringsCount * SPAN_SIZE);
    assert.equal(h.blobsSpanOffset, h.stringsBytesOffset + h.stringsBytesLen);
    assert.equal(h.blobsBytesOffset, h.blobsSpanOffset + h.blobsCount * SPAN_SIZE);
  });

  test("odd-length text: 1-byte string gets 3 zero padding bytes", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "a");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const span = readStringSpan(dv, h.stringsSpanOffset, 0);

    assert.equal(span.off, 0);
    assert.equal(span.len, 1);
    assert.equal(h.stringsBytesLen, 4);
    assert.equal(bytes[h.stringsBytesOffset], 0x61);
    assert.equal(bytes[h.stringsBytesOffset + 1], 0);
    assert.equal(bytes[h.stringsBytesOffset + 2], 0);
    assert.equal(bytes[h.stringsBytesOffset + 3], 0);
  });

  test("odd-length text: 2-byte string gets 2 zero padding bytes", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "ab");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const span = readStringSpan(dv, h.stringsSpanOffset, 0);

    assert.equal(span.off, 0);
    assert.equal(span.len, 2);
    assert.equal(h.stringsBytesLen, 4);
    assert.equal(bytes[h.stringsBytesOffset], 0x61);
    assert.equal(bytes[h.stringsBytesOffset + 1], 0x62);
    assert.equal(bytes[h.stringsBytesOffset + 2], 0);
    assert.equal(bytes[h.stringsBytesOffset + 3], 0);
  });

  test("odd-length text: 3-byte string gets 1 zero padding byte", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "abc");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const span = readStringSpan(dv, h.stringsSpanOffset, 0);

    assert.equal(span.off, 0);
    assert.equal(span.len, 3);
    assert.equal(h.stringsBytesLen, 4);
    assert.equal(bytes[h.stringsBytesOffset], 0x61);
    assert.equal(bytes[h.stringsBytesOffset + 1], 0x62);
    assert.equal(bytes[h.stringsBytesOffset + 2], 0x63);
    assert.equal(bytes[h.stringsBytesOffset + 3], 0);
  });

  test("empty string still has aligned string section with zero raw bytes", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const span = readStringSpan(dv, h.stringsSpanOffset, 0);

    assert.equal(h.stringsCount, 1);
    assert.equal((h.stringsSpanOffset & 3) === 0, true);
    assert.equal((h.stringsBytesOffset & 3) === 0, true);
    assert.equal(h.stringsBytesOffset, h.stringsSpanOffset + SPAN_SIZE);
    assert.equal(span.off, 0);
    assert.equal(span.len, 0);
    assert.equal(h.stringsBytesLen, 0);
  });

  test("multiple odd-length strings keep contiguous raw spans and aligned tail padding", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "a");
    b.drawText(0, 1, "bb");
    b.drawText(0, 2, "ccc");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const s0 = readStringSpan(dv, h.stringsSpanOffset, 0);
    const s1 = readStringSpan(dv, h.stringsSpanOffset, 1);
    const s2 = readStringSpan(dv, h.stringsSpanOffset, 2);

    assert.equal(s0.off, 0);
    assert.equal(s0.len, 1);
    assert.equal(s1.off, 1);
    assert.equal(s1.len, 2);
    assert.equal(s2.off, 3);
    assert.equal(s2.len, 3);

    assert.equal(h.stringsBytesLen, 8);
    assert.equal(bytes[h.stringsBytesOffset + 6], 0);
    assert.equal(bytes[h.stringsBytesOffset + 7], 0);
  });

  test("reuseOutputBuffer keeps odd-string padding zeroed across reset/build cycles", () => {
    const b = createDrawlistBuilderV1({ reuseOutputBuffer: true });

    b.drawText(0, 0, "abcd");
    expectOk(b.build());

    b.reset();
    b.drawText(0, 0, "a");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.stringsBytesLen, 4);
    assert.equal(bytes[h.stringsBytesOffset], 0x61);
    assert.equal(bytes[h.stringsBytesOffset + 1], 0);
    assert.equal(bytes[h.stringsBytesOffset + 2], 0);
    assert.equal(bytes[h.stringsBytesOffset + 3], 0);
  });
});
