import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilderV1 } from "../builder_v1.js";
import type { DrawlistBuildErrorCode, DrawlistBuildResult } from "../types.js";

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

const SPAN_SIZE = 8;
const CMD_SIZE_CLEAR = 8;
const CMD_SIZE_DRAW_TEXT = 8 + 40;

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

function expectError(result: DrawlistBuildResult, code: DrawlistBuildErrorCode): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected build() to fail");
  assert.equal(result.error.code, code);
}

describe("DrawlistBuilderV1 - limits boundaries", () => {
  test("maxCmdCount: exactly at limit succeeds", () => {
    const b = createDrawlistBuilderV1({ maxCmdCount: 2 });
    b.clear();
    b.clear();
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.cmdCount, 2);
    assert.equal(h.cmdBytes, 16);
  });

  test("maxCmdCount: overflow fails", () => {
    const b = createDrawlistBuilderV1({ maxCmdCount: 2 });
    b.clear();
    b.clear();
    b.clear();

    expectError(b.build(), "ZRDL_TOO_LARGE");
  });

  test("maxStrings: exactly at limit with unique strings succeeds", () => {
    const b = createDrawlistBuilderV1({ maxStrings: 2 });
    b.drawText(0, 0, "a");
    b.drawText(0, 1, "b");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.stringsCount, 2);
    assert.equal(h.cmdCount, 2);
  });

  test("maxStrings: interned duplicates do not consume extra slots", () => {
    const b = createDrawlistBuilderV1({ maxStrings: 1 });
    b.drawText(0, 0, "same");
    b.drawText(2, 0, "same");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.stringsCount, 1);
    assert.equal(h.cmdCount, 2);
  });

  test("maxStrings: overflow on next unique string fails", () => {
    const b = createDrawlistBuilderV1({ maxStrings: 1 });
    b.drawText(0, 0, "a");
    b.drawText(0, 1, "b");

    expectError(b.build(), "ZRDL_TOO_LARGE");
  });

  test("maxStringBytes: exactly-at-limit ASCII payload succeeds", () => {
    const b = createDrawlistBuilderV1({ maxStringBytes: 3 });
    b.drawText(0, 0, "abc");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const spanLen = dv.getUint32(h.stringsSpanOffset + 4, true);

    assert.equal(h.stringsCount, 1);
    assert.equal(spanLen, 3);
    assert.equal(h.stringsBytesLen, 4);
  });

  test("maxStringBytes: exactly-at-limit UTF-8 payload succeeds", () => {
    const text = "éa";
    const utf8Len = new TextEncoder().encode(text).byteLength;
    const b = createDrawlistBuilderV1({ maxStringBytes: utf8Len });
    b.drawText(0, 0, text);
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);
    const dv = toView(bytes);
    const spanLen = dv.getUint32(h.stringsSpanOffset + 4, true);

    assert.equal(utf8Len, 3);
    assert.equal(spanLen, utf8Len);
    assert.equal(h.stringsBytesLen, 4);
  });

  test("maxStringBytes: overflow fails", () => {
    const b = createDrawlistBuilderV1({ maxStringBytes: 3 });
    b.drawText(0, 0, "abcd");

    expectError(b.build(), "ZRDL_TOO_LARGE");
  });

  test("maxDrawlistBytes: exactly-at-limit clear-only payload succeeds", () => {
    const exactLimit = HEADER.SIZE + CMD_SIZE_CLEAR;
    const b = createDrawlistBuilderV1({ maxDrawlistBytes: exactLimit });
    b.clear();
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.totalSize, exactLimit);
    assert.equal(h.cmdBytes, CMD_SIZE_CLEAR);
  });

  test("maxDrawlistBytes: one byte below minimum clear payload fails", () => {
    const b = createDrawlistBuilderV1({ maxDrawlistBytes: HEADER.SIZE + CMD_SIZE_CLEAR - 1 });
    b.clear();

    expectError(b.build(), "ZRDL_TOO_LARGE");
  });

  test("maxDrawlistBytes: exact text drawlist boundary succeeds", () => {
    const textBytes = 3;
    const exactLimit = HEADER.SIZE + CMD_SIZE_DRAW_TEXT + SPAN_SIZE + align4(textBytes);
    const b = createDrawlistBuilderV1({ maxDrawlistBytes: exactLimit });
    b.drawText(0, 0, "abc");
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.totalSize, exactLimit);
    assert.equal(h.cmdBytes, CMD_SIZE_DRAW_TEXT);
    assert.equal(h.stringsBytesLen, 4);
  });

  test("maxDrawlistBytes: one byte below text drawlist boundary fails", () => {
    const textBytes = 3;
    const exactLimit = HEADER.SIZE + CMD_SIZE_DRAW_TEXT + SPAN_SIZE + align4(textBytes);
    const b = createDrawlistBuilderV1({ maxDrawlistBytes: exactLimit - 1 });
    b.drawText(0, 0, "abc");

    expectError(b.build(), "ZRDL_TOO_LARGE");
  });

  test("zero limit values are rejected for each configured cap", () => {
    const cases: readonly Readonly<{ opts: Parameters<typeof createDrawlistBuilderV1>[0] }>[] = [
      { opts: { maxDrawlistBytes: 0 } },
      { opts: { maxCmdCount: 0 } },
      { opts: { maxStringBytes: 0 } },
      { opts: { maxStrings: 0 } },
    ];

    for (const { opts } of cases) {
      const b = createDrawlistBuilderV1(opts);
      expectError(b.build(), "ZRDL_BAD_PARAMS");
    }
  });

  test("large-limit smoke: realistic batch stays within limits", () => {
    const b = createDrawlistBuilderV1({
      maxDrawlistBytes: 1_000_000,
      maxCmdCount: 10_000,
      maxStringBytes: 100_000,
      maxStrings: 10_000,
    });

    for (let i = 0; i < 64; i++) {
      b.drawText(i, 0, `row-${i}`);
    }

    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.cmdCount, 64);
    assert.equal(h.stringsCount, 64);
    assert.equal(h.totalSize <= 1_000_000, true);
    assert.equal((h.totalSize & 3) === 0, true);
  });
});
