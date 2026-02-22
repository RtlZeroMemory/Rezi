import { assert, describe, test } from "@rezi-ui/testkit";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V5, createDrawlistBuilderV3 } from "../../index.js";
import type { EncodedStyle } from "../builder_v3.js";
import {
  CLEAR_SIZE,
  DRAW_CANVAS_SIZE,
  DRAW_IMAGE_SIZE,
  DRAW_TEXT_RUN_SIZE,
  DRAW_TEXT_SIZE,
  FILL_RECT_SIZE,
  POP_CLIP_SIZE,
  PUSH_CLIP_SIZE,
  SET_CURSOR_SIZE,
  writeClear,
  writeDrawCanvas,
  writeDrawImage,
  writeDrawText,
  writeDrawTextRun,
  writeFillRect,
  writePopClip,
  writePushClip,
  writeSetCursor,
} from "../writers.gen.js";

const HEADER_SIZE = 64;

const ZERO_STYLE: EncodedStyle = Object.freeze({
  fg: 0,
  bg: 0,
  attrs: 0,
  reserved: 0,
  underlineRgb: 0,
  linkUriRef: 0,
  linkIdRef: 0,
});

function align4(n: number): number {
  return (n + 3) & ~3;
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

function i8(bytes: Uint8Array, off: number): number {
  return view(bytes).getInt8(off);
}

function u16(bytes: Uint8Array, off: number): number {
  return view(bytes).getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  return view(bytes).getUint32(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  return view(bytes).getInt32(off, true);
}

function writeLegacyHeader(dv: DataView, pos: number, opcode: number, size: number): void {
  dv.setUint16(pos + 0, opcode & 0xffff, true);
  dv.setUint16(pos + 2, 0, true);
  dv.setUint32(pos + 4, size >>> 0, true);
}

function legacyWriteClear(_buf: Uint8Array, dv: DataView, pos: number): number {
  writeLegacyHeader(dv, pos, 1, CLEAR_SIZE);
  return pos + CLEAR_SIZE;
}

function legacyWriteFillRect(
  _buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  w: number,
  h: number,
  style: EncodedStyle,
): number {
  writeLegacyHeader(dv, pos, 2, FILL_RECT_SIZE);
  dv.setInt32(pos + 8, x | 0, true);
  dv.setInt32(pos + 12, y | 0, true);
  dv.setInt32(pos + 16, w | 0, true);
  dv.setInt32(pos + 20, h | 0, true);
  dv.setUint32(pos + 24, style.fg >>> 0, true);
  dv.setUint32(pos + 28, style.bg >>> 0, true);
  dv.setUint32(pos + 32, style.attrs >>> 0, true);
  dv.setUint32(pos + 36, style.reserved >>> 0, true);
  dv.setUint32(pos + 40, style.underlineRgb >>> 0, true);
  dv.setUint32(pos + 44, style.linkUriRef >>> 0, true);
  dv.setUint32(pos + 48, style.linkIdRef >>> 0, true);
  return pos + FILL_RECT_SIZE;
}

function legacyWriteDrawText(
  _buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  stringIndex: number,
  byteOff: number,
  byteLen: number,
  style: EncodedStyle,
  reserved0: number,
): number {
  writeLegacyHeader(dv, pos, 3, DRAW_TEXT_SIZE);
  dv.setInt32(pos + 8, x | 0, true);
  dv.setInt32(pos + 12, y | 0, true);
  dv.setUint32(pos + 16, stringIndex >>> 0, true);
  dv.setUint32(pos + 20, byteOff >>> 0, true);
  dv.setUint32(pos + 24, byteLen >>> 0, true);
  dv.setUint32(pos + 28, style.fg >>> 0, true);
  dv.setUint32(pos + 32, style.bg >>> 0, true);
  dv.setUint32(pos + 36, style.attrs >>> 0, true);
  dv.setUint32(pos + 40, style.reserved >>> 0, true);
  dv.setUint32(pos + 44, style.underlineRgb >>> 0, true);
  dv.setUint32(pos + 48, style.linkUriRef >>> 0, true);
  dv.setUint32(pos + 52, style.linkIdRef >>> 0, true);
  dv.setUint32(pos + 56, reserved0 >>> 0, true);
  return pos + DRAW_TEXT_SIZE;
}

function legacyWritePushClip(
  _buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  writeLegacyHeader(dv, pos, 4, PUSH_CLIP_SIZE);
  dv.setInt32(pos + 8, x | 0, true);
  dv.setInt32(pos + 12, y | 0, true);
  dv.setInt32(pos + 16, w | 0, true);
  dv.setInt32(pos + 20, h | 0, true);
  return pos + PUSH_CLIP_SIZE;
}

function legacyWritePopClip(_buf: Uint8Array, dv: DataView, pos: number): number {
  writeLegacyHeader(dv, pos, 5, POP_CLIP_SIZE);
  return pos + POP_CLIP_SIZE;
}

function legacyWriteDrawTextRun(
  _buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  blobIndex: number,
  reserved0: number,
): number {
  writeLegacyHeader(dv, pos, 6, DRAW_TEXT_RUN_SIZE);
  dv.setInt32(pos + 8, x | 0, true);
  dv.setInt32(pos + 12, y | 0, true);
  dv.setUint32(pos + 16, blobIndex >>> 0, true);
  dv.setUint32(pos + 20, reserved0 >>> 0, true);
  return pos + DRAW_TEXT_RUN_SIZE;
}

function legacyWriteSetCursor(
  buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  shape: number,
  visible: number,
  blink: number,
  reserved0: number,
): number {
  writeLegacyHeader(dv, pos, 7, SET_CURSOR_SIZE);
  dv.setInt32(pos + 8, x | 0, true);
  dv.setInt32(pos + 12, y | 0, true);
  buf[pos + 16] = shape & 0xff;
  buf[pos + 17] = visible & 0xff;
  buf[pos + 18] = blink & 0xff;
  buf[pos + 19] = reserved0 & 0xff;
  return pos + SET_CURSOR_SIZE;
}

function legacyWriteDrawCanvas(
  buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  w: number,
  h: number,
  pxWidth: number,
  pxHeight: number,
  blobOff: number,
  blobLen: number,
  blitterCode: number,
  reserved0: number,
  reserved1: number,
): number {
  writeLegacyHeader(dv, pos, 8, DRAW_CANVAS_SIZE);
  dv.setUint16(pos + 8, x & 0xffff, true);
  dv.setUint16(pos + 10, y & 0xffff, true);
  dv.setUint16(pos + 12, w & 0xffff, true);
  dv.setUint16(pos + 14, h & 0xffff, true);
  dv.setUint16(pos + 16, pxWidth & 0xffff, true);
  dv.setUint16(pos + 18, pxHeight & 0xffff, true);
  dv.setUint32(pos + 20, blobOff >>> 0, true);
  dv.setUint32(pos + 24, blobLen >>> 0, true);
  buf[pos + 28] = blitterCode & 0xff;
  buf[pos + 29] = reserved0 & 0xff;
  dv.setUint16(pos + 30, reserved1 & 0xffff, true);
  return pos + DRAW_CANVAS_SIZE;
}

function legacyWriteDrawImage(
  buf: Uint8Array,
  dv: DataView,
  pos: number,
  x: number,
  y: number,
  w: number,
  h: number,
  pxWidth: number,
  pxHeight: number,
  blobOff: number,
  blobLen: number,
  imageId: number,
  formatCode: number,
  protocolCode: number,
  zLayer: number,
  fitCode: number,
  reserved0: number,
  reserved1: number,
  reserved2: number,
): number {
  writeLegacyHeader(dv, pos, 9, DRAW_IMAGE_SIZE);
  dv.setUint16(pos + 8, x & 0xffff, true);
  dv.setUint16(pos + 10, y & 0xffff, true);
  dv.setUint16(pos + 12, w & 0xffff, true);
  dv.setUint16(pos + 14, h & 0xffff, true);
  dv.setUint16(pos + 16, pxWidth & 0xffff, true);
  dv.setUint16(pos + 18, pxHeight & 0xffff, true);
  dv.setUint32(pos + 20, blobOff >>> 0, true);
  dv.setUint32(pos + 24, blobLen >>> 0, true);
  dv.setUint32(pos + 28, imageId >>> 0, true);
  buf[pos + 32] = formatCode & 0xff;
  buf[pos + 33] = protocolCode & 0xff;
  buf[pos + 34] = zLayer & 0xff;
  buf[pos + 35] = fitCode & 0xff;
  buf[pos + 36] = reserved0 & 0xff;
  buf[pos + 37] = reserved1 & 0xff;
  dv.setUint16(pos + 38, reserved2 & 0xffff, true);
  return pos + DRAW_IMAGE_SIZE;
}

type WriterFn = (buf: Uint8Array, dv: DataView, pos: number) => number;

function assertWriterIdentity(size: number, legacy: WriterFn, generated: WriterFn): void {
  const refBytes = new Uint8Array(size + 16);
  const genBytes = new Uint8Array(size + 16);
  refBytes.fill(0xcc);
  genBytes.fill(0xcc);
  const refDv = view(refBytes);
  const genDv = view(genBytes);

  const refEnd = legacy(refBytes, refDv, 0);
  const genEnd = generated(genBytes, genDv, 0);
  assert.equal(refEnd, size);
  assert.equal(genEnd, size);
  assert.deepEqual(Array.from(genBytes.subarray(0, size)), Array.from(refBytes.subarray(0, size)));
  assert.deepEqual(Array.from(genBytes.subarray(size)), Array.from(refBytes.subarray(size)));
}

function parseCommands(
  bytes: Uint8Array,
): ReadonlyArray<Readonly<{ off: number; opcode: number; size: number }>> {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const cmdCount = u32(bytes, 24);
  const out: Array<Readonly<{ off: number; opcode: number; size: number }>> = [];
  let off = cmdOffset;
  for (let i = 0; i < cmdCount; i++) {
    const size = u32(bytes, off + 4);
    out.push(Object.freeze({ off, opcode: u16(bytes, off), size }));
    off += size;
  }
  assert.equal(off, cmdOffset + cmdBytes);
  return out;
}

function buildReferenceDrawlist(): Uint8Array {
  const stringBytes = new TextEncoder().encode("OK");
  const blobBytes = new Uint8Array([1, 2, 3, 4]);

  const cmdBytes =
    CLEAR_SIZE +
    FILL_RECT_SIZE +
    DRAW_TEXT_SIZE +
    DRAW_TEXT_RUN_SIZE +
    SET_CURSOR_SIZE +
    DRAW_CANVAS_SIZE +
    DRAW_IMAGE_SIZE +
    PUSH_CLIP_SIZE +
    POP_CLIP_SIZE;
  const stringsCount = 1;
  const stringsSpanBytes = stringsCount * 8;
  const stringsBytesLen = align4(stringBytes.byteLength);
  const blobsCount = 1;
  const blobsSpanBytes = blobsCount * 8;
  const blobsBytesLen = align4(blobBytes.byteLength);

  const cmdOffset = HEADER_SIZE;
  const stringsSpanOffset = cmdOffset + cmdBytes;
  const stringsBytesOffset = stringsSpanOffset + stringsSpanBytes;
  const blobsSpanOffset = stringsBytesOffset + stringsBytesLen;
  const blobsBytesOffset = blobsSpanOffset + blobsSpanBytes;
  const totalSize = blobsBytesOffset + blobsBytesLen;

  const out = new Uint8Array(totalSize);
  const dv = view(out);

  dv.setUint32(0, ZRDL_MAGIC, true);
  dv.setUint32(4, ZR_DRAWLIST_VERSION_V5, true);
  dv.setUint32(8, HEADER_SIZE, true);
  dv.setUint32(12, totalSize, true);
  dv.setUint32(16, cmdOffset, true);
  dv.setUint32(20, cmdBytes, true);
  dv.setUint32(24, 9, true);
  dv.setUint32(28, stringsSpanOffset, true);
  dv.setUint32(32, stringsCount, true);
  dv.setUint32(36, stringsBytesOffset, true);
  dv.setUint32(40, stringsBytesLen, true);
  dv.setUint32(44, blobsSpanOffset, true);
  dv.setUint32(48, blobsCount, true);
  dv.setUint32(52, blobsBytesOffset, true);
  dv.setUint32(56, blobsBytesLen, true);
  dv.setUint32(60, 0, true);

  let pos = cmdOffset;
  pos = legacyWriteClear(out, dv, pos);
  pos = legacyWriteFillRect(out, dv, pos, 1, 2, 3, 4, ZERO_STYLE);
  pos = legacyWriteDrawText(out, dv, pos, 5, 6, 0, 0, stringBytes.byteLength, ZERO_STYLE, 0);
  pos = legacyWriteDrawTextRun(out, dv, pos, 7, 8, 0, 0);
  pos = legacyWriteSetCursor(out, dv, pos, 9, 10, 2, 1, 0, 0);
  pos = legacyWriteDrawCanvas(out, dv, pos, 11, 12, 1, 1, 1, 1, 0, blobBytes.byteLength, 6, 0, 0);
  pos = legacyWriteDrawImage(
    out,
    dv,
    pos,
    13,
    14,
    1,
    1,
    1,
    1,
    0,
    blobBytes.byteLength,
    99,
    0,
    1,
    -1,
    1,
    0,
    0,
    0,
  );
  pos = legacyWritePushClip(out, dv, pos, 0, 0, 20, 10);
  pos = legacyWritePopClip(out, dv, pos);
  assert.equal(pos, cmdOffset + cmdBytes);

  dv.setUint32(stringsSpanOffset + 0, 0, true);
  dv.setUint32(stringsSpanOffset + 4, stringBytes.byteLength, true);
  out.set(stringBytes, stringsBytesOffset);

  dv.setUint32(blobsSpanOffset + 0, 0, true);
  dv.setUint32(blobsSpanOffset + 4, blobBytes.byteLength, true);
  out.set(blobBytes, blobsBytesOffset);

  return out;
}

describe("writers.gen - byte identity", () => {
  const styleSample: EncodedStyle = Object.freeze({
    fg: 0x0011_2233,
    bg: 0x0044_5566,
    attrs: 0xaa,
    reserved: 5,
    underlineRgb: 0x0077_8899,
    linkUriRef: 33,
    linkIdRef: 44,
  });

  test("clear", () => {
    assertWriterIdentity(CLEAR_SIZE, legacyWriteClear, writeClear);
  });

  test("fillRect", () => {
    assertWriterIdentity(
      FILL_RECT_SIZE,
      (buf, dv, pos) => legacyWriteFillRect(buf, dv, pos, -123, 456, 789, 1011, styleSample),
      (buf, dv, pos) => writeFillRect(buf, dv, pos, -123, 456, 789, 1011, styleSample),
    );
  });

  test("drawText", () => {
    assertWriterIdentity(
      DRAW_TEXT_SIZE,
      (buf, dv, pos) =>
        legacyWriteDrawText(buf, dv, pos, -40, 22, 7, 3, 19, styleSample, 0xdead_beef),
      (buf, dv, pos) => writeDrawText(buf, dv, pos, -40, 22, 7, 3, 19, styleSample, 0xdead_beef),
    );
  });

  test("pushClip", () => {
    assertWriterIdentity(
      PUSH_CLIP_SIZE,
      (buf, dv, pos) => legacyWritePushClip(buf, dv, pos, 11, -12, 13, 14),
      (buf, dv, pos) => writePushClip(buf, dv, pos, 11, -12, 13, 14),
    );
  });

  test("popClip", () => {
    assertWriterIdentity(POP_CLIP_SIZE, legacyWritePopClip, writePopClip);
  });

  test("drawTextRun", () => {
    assertWriterIdentity(
      DRAW_TEXT_RUN_SIZE,
      (buf, dv, pos) => legacyWriteDrawTextRun(buf, dv, pos, -300, 200, 33, 0x1234_5678),
      (buf, dv, pos) => writeDrawTextRun(buf, dv, pos, -300, 200, 33, 0x1234_5678),
    );
  });

  test("setCursor", () => {
    assertWriterIdentity(
      SET_CURSOR_SIZE,
      (buf, dv, pos) => legacyWriteSetCursor(buf, dv, pos, -1, 2, 3, 1, 0, 0xaa),
      (buf, dv, pos) => writeSetCursor(buf, dv, pos, -1, 2, 3, 1, 0, 0xaa),
    );
  });

  test("drawCanvas", () => {
    assertWriterIdentity(
      DRAW_CANVAS_SIZE,
      (buf, dv, pos) =>
        legacyWriteDrawCanvas(buf, dv, pos, 1, 2, 3, 4, 5, 6, 1024, 2048, 6, 7, 0xabcd),
      (buf, dv, pos) => writeDrawCanvas(buf, dv, pos, 1, 2, 3, 4, 5, 6, 1024, 2048, 6, 7, 0xabcd),
    );
  });

  test("drawImage", () => {
    assertWriterIdentity(
      DRAW_IMAGE_SIZE,
      (buf, dv, pos) =>
        legacyWriteDrawImage(
          buf,
          dv,
          pos,
          11,
          12,
          13,
          14,
          15,
          16,
          2048,
          4096,
          77,
          2,
          3,
          -1,
          1,
          0x44,
          0x55,
          0xbeef,
        ),
      (buf, dv, pos) =>
        writeDrawImage(
          buf,
          dv,
          pos,
          11,
          12,
          13,
          14,
          15,
          16,
          2048,
          4096,
          77,
          2,
          3,
          -1,
          1,
          0x44,
          0x55,
          0xbeef,
        ),
    );
  });
});

describe("writers.gen - size constants", () => {
  test("CLEAR_SIZE", () => assert.equal(CLEAR_SIZE, 8));
  test("FILL_RECT_SIZE", () => assert.equal(FILL_RECT_SIZE, 52));
  test("DRAW_TEXT_SIZE", () => assert.equal(DRAW_TEXT_SIZE, 60));
  test("PUSH_CLIP_SIZE", () => assert.equal(PUSH_CLIP_SIZE, 24));
  test("POP_CLIP_SIZE", () => assert.equal(POP_CLIP_SIZE, 8));
  test("DRAW_TEXT_RUN_SIZE", () => assert.equal(DRAW_TEXT_RUN_SIZE, 24));
  test("SET_CURSOR_SIZE", () => assert.equal(SET_CURSOR_SIZE, 20));
  test("DRAW_CANVAS_SIZE", () => assert.equal(DRAW_CANVAS_SIZE, 32));
  test("DRAW_IMAGE_SIZE", () => assert.equal(DRAW_IMAGE_SIZE, 40));
});

describe("writers.gen - alignment", () => {
  test("sequential writes keep positions 4-byte aligned", () => {
    const bytes = new Uint8Array(512);
    const dv = view(bytes);
    let pos = 0;
    pos = writeClear(bytes, dv, pos);
    assert.equal(pos % 4, 0);
    pos = writeSetCursor(bytes, dv, pos, 1, 2, 0, 1, 0, 0);
    assert.equal(pos % 4, 0);
    pos = writeDrawTextRun(bytes, dv, pos, 3, 4, 5, 0);
    assert.equal(pos % 4, 0);
    pos = writeDrawImage(bytes, dv, pos, 1, 2, 3, 4, 5, 6, 0, 16, 7, 0, 1, -1, 2, 0, 0, 0);
    assert.equal(pos % 4, 0);
  });

  test("writes correctly at a non-zero aligned start offset", () => {
    const bytes = new Uint8Array(128);
    bytes.fill(0xaa);
    const dv = view(bytes);
    const start = 64;
    const end = writeFillRect(bytes, dv, start, 10, 20, 30, 40, ZERO_STYLE);
    assert.equal(end, start + FILL_RECT_SIZE);
    assert.equal(u8(bytes, start - 1), 0xaa);
    assert.equal(i32(bytes, start + 8), 10);
    assert.equal(i32(bytes, start + 20), 40);
  });

  test("reserved bytes are explicitly zero-filled when passed as zero", () => {
    const bytes = new Uint8Array(96);
    const dv = view(bytes);
    let pos = 0;
    pos = writeDrawCanvas(bytes, dv, pos, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0);
    assert.equal(u8(bytes, 1), 0);
    assert.equal(u8(bytes, 2), 0);
    assert.equal(u8(bytes, 3), 0);
    assert.equal(u8(bytes, 29), 0);
    assert.equal(u16(bytes, 30), 0);

    writeDrawImage(bytes, dv, pos, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, -1, 2, 0, 0, 0);
    assert.equal(u8(bytes, pos + 1), 0);
    assert.equal(u8(bytes, pos + 2), 0);
    assert.equal(u8(bytes, pos + 3), 0);
    assert.equal(u8(bytes, pos + 36), 0);
    assert.equal(u8(bytes, pos + 37), 0);
    assert.equal(u16(bytes, pos + 38), 0);
  });
});

describe("writers.gen - style encoding", () => {
  test("fillRect style attrs preserve all bit positions", () => {
    const bytes = new Uint8Array(FILL_RECT_SIZE);
    const dv = view(bytes);
    const style: EncodedStyle = {
      fg: 0x0001_0203,
      bg: 0x0004_0506,
      attrs: 0xff,
      reserved: 5,
      underlineRgb: 0x000a_0b0c,
      linkUriRef: 11,
      linkIdRef: 12,
    };

    writeFillRect(bytes, dv, 0, 0, 0, 1, 1, style);
    const attrs = u32(bytes, 32);
    for (let bit = 0; bit <= 7; bit++) {
      assert.equal((attrs & (1 << bit)) !== 0, true, `expected attr bit ${String(bit)} set`);
    }
  });

  test("drawText stores linkUriRef and linkIdRef at expected offsets", () => {
    const bytes = new Uint8Array(DRAW_TEXT_SIZE);
    const dv = view(bytes);
    const style: EncodedStyle = {
      fg: 0,
      bg: 0,
      attrs: 0,
      reserved: 0,
      underlineRgb: 0,
      linkUriRef: 1234,
      linkIdRef: 5678,
    };

    writeDrawText(bytes, dv, 0, 1, 2, 3, 0, 4, style, 0);
    assert.equal(u32(bytes, 48), 1234);
    assert.equal(u32(bytes, 52), 5678);
  });

  test("underlineRgb lands at the underline color slot", () => {
    const bytes = new Uint8Array(DRAW_TEXT_SIZE);
    const dv = view(bytes);
    const style: EncodedStyle = {
      fg: 0,
      bg: 0,
      attrs: 0,
      reserved: 0,
      underlineRgb: 0x0000_ff11,
      linkUriRef: 0,
      linkIdRef: 0,
    };

    writeDrawText(bytes, dv, 0, 0, 0, 0, 0, 0, style, 0);
    assert.equal(u32(bytes, 44), 0x0000_ff11);
  });
});

describe("writers.gen - round trip integration", () => {
  test("builder output matches reference encoding and header offsets stay valid", () => {
    const b = createDrawlistBuilderV3({ drawlistVersion: 5 });
    const blobIndex = b.addBlob(new Uint8Array([1, 2, 3, 4]));
    assert.equal(blobIndex, 0);
    if (blobIndex === null) throw new Error("blob index was null");

    b.clear();
    b.fillRect(1, 2, 3, 4);
    b.drawText(5, 6, "OK");
    b.drawTextRun(7, 8, blobIndex);
    b.setCursor({ x: 9, y: 10, shape: 2, visible: true, blink: false });
    b.drawCanvas(11, 12, 1, 1, blobIndex, "ascii", 1, 1);
    b.drawImage(13, 14, 1, 1, blobIndex, "rgba", "kitty", -1, "contain", 99, 1, 1);
    b.pushClip(0, 0, 20, 10);
    b.popClip();

    const built = b.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const bytes = built.bytes;
    assert.equal(u32(bytes, 0), ZRDL_MAGIC);
    assert.equal(u32(bytes, 4), ZR_DRAWLIST_VERSION_V5);
    assert.equal(u32(bytes, 8), HEADER_SIZE);
    assert.equal(u32(bytes, 12), bytes.byteLength);
    assert.equal(u32(bytes, 24), 9);

    const cmds = parseCommands(bytes);
    assert.deepEqual(
      cmds.map((c) => c.size),
      [
        CLEAR_SIZE,
        FILL_RECT_SIZE,
        DRAW_TEXT_SIZE,
        DRAW_TEXT_RUN_SIZE,
        SET_CURSOR_SIZE,
        DRAW_CANVAS_SIZE,
        DRAW_IMAGE_SIZE,
        PUSH_CLIP_SIZE,
        POP_CLIP_SIZE,
      ],
    );

    const expected = buildReferenceDrawlist();
    assert.deepEqual(Array.from(bytes), Array.from(expected));
  });
});

describe("writers.gen - edge cases", () => {
  test("clear writes only a header and does not touch trailing bytes", () => {
    const bytes = new Uint8Array(24);
    bytes.fill(0xbb);
    const dv = view(bytes);
    const end = writeClear(bytes, dv, 0);
    assert.equal(end, CLEAR_SIZE);
    assert.equal(u8(bytes, 0), 1);
    assert.equal(u32(bytes, 4), CLEAR_SIZE);
    assert.equal(u8(bytes, 8), 0xbb);
  });

  test("drawImage handles mixed u16/u32/u8/i8 field widths correctly", () => {
    const bytes = new Uint8Array(DRAW_IMAGE_SIZE);
    const dv = view(bytes);
    writeDrawImage(
      bytes,
      dv,
      0,
      0xffff,
      0xfffe,
      0x0123,
      0x0456,
      0x0789,
      0x0abc,
      0x1020_3040,
      0x5060_7080,
      0xa0b0_c0d0,
      0x7f,
      0x80,
      -1,
      0x42,
      0,
      0,
      0,
    );

    assert.equal(u16(bytes, 8), 0xffff);
    assert.equal(u16(bytes, 10), 0xfffe);
    assert.equal(u32(bytes, 20), 0x1020_3040);
    assert.equal(u32(bytes, 28), 0xa0b0_c0d0);
    assert.equal(u8(bytes, 32), 0x7f);
    assert.equal(u8(bytes, 33), 0x80);
    assert.equal(i8(bytes, 34), -1);
    assert.equal(u8(bytes, 35), 0x42);
  });

  test("setCursor writes shape/visible/blink as exact bytes", () => {
    const bytes = new Uint8Array(SET_CURSOR_SIZE);
    const dv = view(bytes);
    writeSetCursor(bytes, dv, 0, -10, 20, 255, 128, 1, 254);
    assert.equal(i32(bytes, 8), -10);
    assert.equal(i32(bytes, 12), 20);
    assert.equal(u8(bytes, 16), 255);
    assert.equal(u8(bytes, 17), 128);
    assert.equal(u8(bytes, 18), 1);
    assert.equal(u8(bytes, 19), 254);
  });
});
