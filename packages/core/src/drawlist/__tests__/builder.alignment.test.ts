import { assert, describe, test } from "@rezi-ui/testkit";
import {
  OP_DRAW_TEXT,
  OP_DRAW_TEXT_RUN,
  OP_DEF_BLOB,
  OP_DEF_STRING,
  parseCommandHeaders,
} from "../../__tests__/drawlistDecode.js";
import { createDrawlistBuilder } from "../builder.js";
import type { DrawlistBuildResult } from "../types.js";

const HEADER = {
  TOTAL_SIZE: 12,
  CMD_OFFSET: 16,
  CMD_BYTES: 20,
  CMD_COUNT: 24,
  STRINGS_SPAN_OFFSET: 28,
  STRINGS_BYTES_OFFSET: 36,
  BLOBS_SPAN_OFFSET: 44,
  BLOBS_BYTES_OFFSET: 52,
  SIZE: 64,
} as const;

type ParsedHeader = Readonly<{
  totalSize: number;
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringsSpanOffset: number;
  stringsBytesOffset: number;
  blobsSpanOffset: number;
  blobsBytesOffset: number;
}>;

type DefString = Readonly<{
  offset: number;
  size: number;
  id: number;
  byteLen: number;
  payloadStart: number;
}>;

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
    stringsBytesOffset: dv.getUint32(HEADER.STRINGS_BYTES_OFFSET, true),
    blobsSpanOffset: dv.getUint32(HEADER.BLOBS_SPAN_OFFSET, true),
    blobsBytesOffset: dv.getUint32(HEADER.BLOBS_BYTES_OFFSET, true),
  };
}

function expectOk(result: DrawlistBuildResult): Uint8Array {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected build() to succeed");
  return result.bytes;
}

function readDefStrings(bytes: Uint8Array): readonly DefString[] {
  const headers = parseCommandHeaders(bytes);
  return headers
    .filter((cmd) => cmd.opcode === OP_DEF_STRING)
    .map((cmd) => {
      const dv = toView(bytes);
      return {
        offset: cmd.offset,
        size: cmd.size,
        id: dv.getUint32(cmd.offset + 8, true),
        byteLen: dv.getUint32(cmd.offset + 12, true),
        payloadStart: cmd.offset + 16,
      };
    });
}

describe("DrawlistBuilder - alignment and padding", () => {
  test("empty drawlist has aligned total size and zero section offsets", () => {
    const bytes = expectOk(createDrawlistBuilder().build());
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

  test("near-empty clear drawlist keeps command section aligned", () => {
    const b = createDrawlistBuilder();
    b.clear();
    const bytes = expectOk(b.build());
    const h = parseHeader(bytes);

    assert.equal(h.cmdOffset, HEADER.SIZE);
    assert.equal((h.cmdOffset & 3) === 0, true);
    assert.equal((h.cmdBytes & 3) === 0, true);
    assert.equal(h.cmdCount, 1);
  });

  test("all command starts are 4-byte aligned in a mixed stream", () => {
    const b = createDrawlistBuilder();
    b.clear();
    b.fillRect(0, 0, 3, 2);
    b.drawText(1, 1, "abc");
    b.pushClip(0, 0, 3, 2);
    b.popClip();

    const bytes = expectOk(b.build());
    const headers = parseCommandHeaders(bytes);
    for (const cmd of headers) {
      assert.equal((cmd.offset & 3) === 0, true);
      assert.equal((cmd.size & 3) === 0, true);
    }
  });

  test("mixed text/blob frame emits DEF_STRING and DEF_BLOB before draw commands", () => {
    const b = createDrawlistBuilder();
    const blobIndex = b.addBlob(new Uint8Array([9, 8, 7, 6]));
    assert.equal(blobIndex, 0);
    b.clear();
    b.drawText(0, 0, "x");
    b.drawTextRun(2, 1, 0);

    const bytes = expectOk(b.build());
    const headers = parseCommandHeaders(bytes);
    const opcodes = headers.map((cmd) => cmd.opcode);

    assert.equal(opcodes.indexOf(OP_DEF_STRING) >= 0, true);
    assert.equal(opcodes.indexOf(OP_DEF_BLOB) >= 0, true);
    assert.equal(opcodes.indexOf(OP_DEF_STRING) < opcodes.lastIndexOf(OP_DRAW_TEXT), true);
    assert.equal(opcodes.indexOf(OP_DEF_BLOB) < opcodes.lastIndexOf(OP_DRAW_TEXT_RUN), true);
  });

  test("odd-length text: 1-byte string gets 3 zero padding bytes", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "a");
    const bytes = expectOk(b.build());
    const def = readDefStrings(bytes)[0];
    if (!def) throw new Error("missing DEF_STRING");

    assert.equal(def.id, 1);
    assert.equal(def.byteLen, 1);
    assert.equal(def.size, 20);
    assert.equal(bytes[def.payloadStart], 0x61);
    assert.equal(bytes[def.payloadStart + 1], 0);
    assert.equal(bytes[def.payloadStart + 2], 0);
    assert.equal(bytes[def.payloadStart + 3], 0);
  });

  test("odd-length text: 2-byte string gets 2 zero padding bytes", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "ab");
    const bytes = expectOk(b.build());
    const def = readDefStrings(bytes)[0];
    if (!def) throw new Error("missing DEF_STRING");

    assert.equal(def.byteLen, 2);
    assert.equal(def.size, 20);
    assert.equal(bytes[def.payloadStart], 0x61);
    assert.equal(bytes[def.payloadStart + 1], 0x62);
    assert.equal(bytes[def.payloadStart + 2], 0);
    assert.equal(bytes[def.payloadStart + 3], 0);
  });

  test("odd-length text: 3-byte string gets 1 zero padding byte", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "abc");
    const bytes = expectOk(b.build());
    const def = readDefStrings(bytes)[0];
    if (!def) throw new Error("missing DEF_STRING");

    assert.equal(def.byteLen, 3);
    assert.equal(def.size, 20);
    assert.equal(bytes[def.payloadStart], 0x61);
    assert.equal(bytes[def.payloadStart + 1], 0x62);
    assert.equal(bytes[def.payloadStart + 2], 0x63);
    assert.equal(bytes[def.payloadStart + 3], 0);
  });

  test("empty string emits DEF_STRING with zero payload bytes", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "");
    const bytes = expectOk(b.build());
    const def = readDefStrings(bytes)[0];
    if (!def) throw new Error("missing DEF_STRING");

    assert.equal(def.byteLen, 0);
    assert.equal(def.size, 16);
  });

  test("multiple odd-length strings keep per-command payload and tail padding correct", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "a");
    b.drawText(0, 1, "bb");
    b.drawText(0, 2, "ccc");
    const bytes = expectOk(b.build());
    const defs = readDefStrings(bytes);

    assert.equal(defs.length, 3);
    const d0 = defs[0];
    const d1 = defs[1];
    const d2 = defs[2];
    if (!d0 || !d1 || !d2) return;

    assert.equal(d0.byteLen, 1);
    assert.equal(d0.size, 20);
    assert.equal(bytes[d0.payloadStart + 1], 0);
    assert.equal(bytes[d0.payloadStart + 2], 0);
    assert.equal(bytes[d0.payloadStart + 3], 0);

    assert.equal(d1.byteLen, 2);
    assert.equal(d1.size, 20);
    assert.equal(bytes[d1.payloadStart + 2], 0);
    assert.equal(bytes[d1.payloadStart + 3], 0);

    assert.equal(d2.byteLen, 3);
    assert.equal(d2.size, 20);
    assert.equal(bytes[d2.payloadStart + 3], 0);
  });

  test("reuseOutputBuffer keeps odd-string padding zeroed across reset/build cycles", () => {
    const b = createDrawlistBuilder({ reuseOutputBuffer: true });
    b.drawText(0, 0, "abcd");
    expectOk(b.build());

    b.reset();
    b.drawText(0, 0, "a");
    const bytes = expectOk(b.build());
    const def = readDefStrings(bytes)[0];
    if (!def) throw new Error("missing DEF_STRING");

    assert.equal(def.byteLen, 1);
    assert.equal(bytes[def.payloadStart], 0x61);
    assert.equal(bytes[def.payloadStart + 1], 0);
    assert.equal(bytes[def.payloadStart + 2], 0);
    assert.equal(bytes[def.payloadStart + 3], 0);
  });
});
