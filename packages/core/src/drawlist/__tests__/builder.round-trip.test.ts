import { assert, describe, test } from "@rezi-ui/testkit";
import {
  ZRDL_MAGIC,
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,
  createDrawlistBuilderV1,
  createDrawlistBuilderV2,
} from "../../index.js";

const HEADER_SIZE = 64;
const INT32_MAX = 2147483647;

const OP_CLEAR = 1;
const OP_FILL_RECT = 2;
const OP_DRAW_TEXT = 3;
const OP_PUSH_CLIP = 4;
const OP_POP_CLIP = 5;
const OP_DRAW_TEXT_RUN = 6;
const OP_SET_CURSOR = 7;

const decoder = new TextDecoder();

type Header = Readonly<{
  magic: number;
  version: number;
  headerSize: number;
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
  reserved0: number;
}>;

type CmdHeader = Readonly<{
  off: number;
  opcode: number;
  flags: number;
  size: number;
  payloadOff: number;
}>;

type PackedStyle = Readonly<{ fg: number; bg: number; attrs: number; reserved0: number }>;

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

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

function align4(n: number): number {
  return (n + 3) & ~3;
}

function readHeader(bytes: Uint8Array): Header {
  return {
    magic: u32(bytes, 0),
    version: u32(bytes, 4),
    headerSize: u32(bytes, 8),
    totalSize: u32(bytes, 12),
    cmdOffset: u32(bytes, 16),
    cmdBytes: u32(bytes, 20),
    cmdCount: u32(bytes, 24),
    stringsSpanOffset: u32(bytes, 28),
    stringsCount: u32(bytes, 32),
    stringsBytesOffset: u32(bytes, 36),
    stringsBytesLen: u32(bytes, 40),
    blobsSpanOffset: u32(bytes, 44),
    blobsCount: u32(bytes, 48),
    blobsBytesOffset: u32(bytes, 52),
    blobsBytesLen: u32(bytes, 56),
    reserved0: u32(bytes, 60),
  };
}

function assertAligned4(label: string, value: number): void {
  assert.equal(value % 4, 0, `${label} must be 4-byte aligned`);
}

function assertHeaderLayout(bytes: Uint8Array, h: Header): void {
  assert.equal(h.headerSize, HEADER_SIZE);
  assert.equal(h.totalSize, bytes.byteLength);
  assert.equal(h.reserved0, 0);

  let cursor = HEADER_SIZE;

  if (h.cmdCount === 0) {
    assert.equal(h.cmdOffset, 0);
    assert.equal(h.cmdBytes, 0);
  } else {
    assert.equal(h.cmdOffset, cursor);
    assertAligned4("cmdOffset", h.cmdOffset);
    assertAligned4("cmdBytes", h.cmdBytes);
    cursor += h.cmdBytes;
  }

  if (h.stringsCount === 0) {
    assert.equal(h.stringsSpanOffset, 0);
    assert.equal(h.stringsBytesOffset, 0);
    assert.equal(h.stringsBytesLen, 0);
  } else {
    assert.equal(h.stringsSpanOffset, cursor);
    assertAligned4("stringsSpanOffset", h.stringsSpanOffset);
    cursor += h.stringsCount * 8;

    assert.equal(h.stringsBytesOffset, cursor);
    assertAligned4("stringsBytesOffset", h.stringsBytesOffset);
    assertAligned4("stringsBytesLen", h.stringsBytesLen);
    cursor += h.stringsBytesLen;
  }

  if (h.blobsCount === 0) {
    assert.equal(h.blobsSpanOffset, 0);
    assert.equal(h.blobsBytesOffset, 0);
    assert.equal(h.blobsBytesLen, 0);
  } else {
    assert.equal(h.blobsSpanOffset, cursor);
    assertAligned4("blobsSpanOffset", h.blobsSpanOffset);
    cursor += h.blobsCount * 8;

    assert.equal(h.blobsBytesOffset, cursor);
    assertAligned4("blobsBytesOffset", h.blobsBytesOffset);
    assertAligned4("blobsBytesLen", h.blobsBytesLen);
    cursor += h.blobsBytesLen;
  }

  assert.equal(cursor, h.totalSize);
}

function parseCommands(bytes: Uint8Array): readonly CmdHeader[] {
  const h = readHeader(bytes);
  if (h.cmdCount === 0) return [];

  const out: CmdHeader[] = [];
  let off = h.cmdOffset;

  for (let i = 0; i < h.cmdCount; i++) {
    const size = u32(bytes, off + 4);
    out.push({
      off,
      opcode: u16(bytes, off),
      flags: u16(bytes, off + 2),
      size,
      payloadOff: off + 8,
    });
    off += size;
  }

  assert.equal(off, h.cmdOffset + h.cmdBytes);
  return out;
}

function readStyle(bytes: Uint8Array, off: number): PackedStyle {
  return {
    fg: u32(bytes, off),
    bg: u32(bytes, off + 4),
    attrs: u32(bytes, off + 8),
    reserved0: u32(bytes, off + 12),
  };
}

function decodeStringSlice(
  bytes: Uint8Array,
  h: Header,
  stringIndex: number,
  byteOff: number,
  byteLen: number,
): string {
  const spanOff = h.stringsSpanOffset + stringIndex * 8;
  const strOff = u32(bytes, spanOff);
  const strLen = u32(bytes, spanOff + 4);
  assert.equal(byteOff + byteLen <= strLen, true);

  const start = h.stringsBytesOffset + strOff + byteOff;
  return decoder.decode(bytes.subarray(start, start + byteLen));
}

function readSetCursorCommand(bytes: Uint8Array, cmd: CmdHeader) {
  assert.equal(cmd.opcode, OP_SET_CURSOR);
  assert.equal(cmd.size, 20);
  return {
    x: i32(bytes, cmd.payloadOff),
    y: i32(bytes, cmd.payloadOff + 4),
    shape: u8(bytes, cmd.payloadOff + 8),
    visible: u8(bytes, cmd.payloadOff + 9),
    blink: u8(bytes, cmd.payloadOff + 10),
    reserved0: u8(bytes, cmd.payloadOff + 11),
  };
}

function simulateV1CommandReader(
  bytes: Uint8Array,
): Readonly<{ ok: true } | { ok: false; unsupportedOpcode: number }> {
  const cmds = parseCommands(bytes);
  for (const cmd of cmds) {
    switch (cmd.opcode) {
      case OP_CLEAR:
      case OP_FILL_RECT:
      case OP_DRAW_TEXT:
      case OP_PUSH_CLIP:
      case OP_POP_CLIP:
      case OP_DRAW_TEXT_RUN:
        break;
      default:
        return { ok: false, unsupportedOpcode: cmd.opcode };
    }
  }
  return { ok: true };
}

describe("DrawlistBuilder round-trip binary readback", () => {
  test("v1 header magic/version/counts/offsets/byte sizes are exact for mixed commands", () => {
    const b = createDrawlistBuilderV1();
    b.clear();
    b.fillRect(1, 2, 3, 4, {
      fg: { r: 0x11, g: 0x22, b: 0x33 },
      bg: { r: 0x44, g: 0x55, b: 0x66 },
      bold: true,
      italic: true,
    });
    b.pushClip(0, 0, 10, 10);
    b.drawText(7, 8, "hey", { underline: true, dim: true });
    b.popClip();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    assert.equal(h.magic, ZRDL_MAGIC);
    assert.equal(h.version, ZR_DRAWLIST_VERSION_V1);
    assert.equal(h.cmdOffset, 64);
    assert.equal(h.cmdBytes, 128);
    assert.equal(h.cmdCount, 5);
    assert.equal(h.stringsSpanOffset, 192);
    assert.equal(h.stringsCount, 1);
    assert.equal(h.stringsBytesOffset, 200);
    assert.equal(h.stringsBytesLen, 4);
    assert.equal(h.blobsSpanOffset, 0);
    assert.equal(h.blobsCount, 0);
    assert.equal(h.blobsBytesOffset, 0);
    assert.equal(h.blobsBytesLen, 0);
    assert.equal(h.totalSize, 204);

    assertHeaderLayout(res.bytes, h);
  });

  test("v1 fillRect command readback preserves geometry and packed style", () => {
    const b = createDrawlistBuilderV1();
    b.fillRect(-3, 9, 11, 13, {
      fg: { r: 1, g: 2, b: 3 },
      bg: { r: 4, g: 5, b: 6 },
      bold: true,
      underline: true,
      dim: true,
    });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmds = parseCommands(res.bytes);
    assert.equal(cmds.length, 1);
    const cmd = cmds[0];
    if (!cmd) return;

    assert.equal(cmd.opcode, OP_FILL_RECT);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 40);
    assert.equal(i32(res.bytes, cmd.payloadOff + 0), -3);
    assert.equal(i32(res.bytes, cmd.payloadOff + 4), 9);
    assert.equal(i32(res.bytes, cmd.payloadOff + 8), 11);
    assert.equal(i32(res.bytes, cmd.payloadOff + 12), 13);

    const style = readStyle(res.bytes, cmd.payloadOff + 16);
    assert.equal(style.fg, 0x0001_0203);
    assert.equal(style.bg, 0x0004_0506);
    assert.equal(style.attrs, (1 << 0) | (1 << 2) | (1 << 4));
    assert.equal(style.reserved0, 0);
  });

  test("v1 drawText command readback resolves string span and style fields", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(7, 9, "hello", {
      fg: { r: 255, g: 128, b: 1 },
      bg: { r: 2, g: 3, b: 4 },
      italic: true,
      inverse: true,
    });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    const cmds = parseCommands(res.bytes);
    assert.equal(cmds.length, 1);

    const cmd = cmds[0];
    if (!cmd) return;
    assert.equal(cmd.opcode, OP_DRAW_TEXT);
    assert.equal(cmd.size, 48);

    const x = i32(res.bytes, cmd.payloadOff + 0);
    const y = i32(res.bytes, cmd.payloadOff + 4);
    const stringIndex = u32(res.bytes, cmd.payloadOff + 8);
    const byteOff = u32(res.bytes, cmd.payloadOff + 12);
    const byteLen = u32(res.bytes, cmd.payloadOff + 16);
    const style = readStyle(res.bytes, cmd.payloadOff + 20);
    const reserved0 = u32(res.bytes, cmd.payloadOff + 36);

    assert.equal(x, 7);
    assert.equal(y, 9);
    assert.equal(stringIndex, 0);
    assert.equal(byteOff, 0);
    assert.equal(byteLen, 5);
    assert.equal(style.fg, 0x00ff_8001);
    assert.equal(style.bg, 0x0002_0304);
    assert.equal(style.attrs, (1 << 1) | (1 << 3));
    assert.equal(style.reserved0, 0);
    assert.equal(reserved0, 0);
    assert.equal(decodeStringSlice(res.bytes, h, stringIndex, byteOff, byteLen), "hello");
  });

  test("v1 clip push/pop commands round-trip with exact payload sizes", () => {
    const b = createDrawlistBuilderV1();
    b.pushClip(2, 3, 4, 5);
    b.popClip();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmds = parseCommands(res.bytes);
    assert.equal(cmds.length, 2);
    const push = cmds[0];
    const pop = cmds[1];
    if (!push || !pop) return;

    assert.equal(push.opcode, OP_PUSH_CLIP);
    assert.equal(push.size, 24);
    assert.equal(i32(res.bytes, push.payloadOff + 0), 2);
    assert.equal(i32(res.bytes, push.payloadOff + 4), 3);
    assert.equal(i32(res.bytes, push.payloadOff + 8), 4);
    assert.equal(i32(res.bytes, push.payloadOff + 12), 5);

    assert.equal(pop.opcode, OP_POP_CLIP);
    assert.equal(pop.size, 8);
  });

  test("v1 repeated text uses interned string indices deterministically", () => {
    const b = createDrawlistBuilderV1();
    b.drawText(0, 0, "same");
    b.drawText(0, 1, "same");
    b.drawText(0, 2, "other");

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    assert.equal(h.stringsCount, 2);
    assert.equal(h.cmdCount, 3);
    assert.equal(h.cmdBytes, 144);
    assert.equal(h.stringsSpanOffset, 208);
    assert.equal(h.stringsBytesOffset, 224);
    assert.equal(h.stringsBytesLen, 12);
    assert.equal(h.totalSize, 236);
    assertHeaderLayout(res.bytes, h);

    const cmds = parseCommands(res.bytes);
    const c0 = cmds[0];
    const c1 = cmds[1];
    const c2 = cmds[2];
    if (!c0 || !c1 || !c2) return;

    const idx0 = u32(res.bytes, c0.payloadOff + 8);
    const idx1 = u32(res.bytes, c1.payloadOff + 8);
    const idx2 = u32(res.bytes, c2.payloadOff + 8);
    assert.equal(idx0, 0);
    assert.equal(idx1, 0);
    assert.equal(idx2, 1);
    assert.equal(decodeStringSlice(res.bytes, h, idx0, 0, 4), "same");
    assert.equal(decodeStringSlice(res.bytes, h, idx2, 0, 5), "other");
  });

  test("v2 header uses version 2 and correct cmd byte/count totals", () => {
    const b = createDrawlistBuilderV2();
    b.clear();
    b.setCursor({ x: 10, y: 5, shape: 1, visible: true, blink: false });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    assert.equal(h.magic, ZRDL_MAGIC);
    assert.equal(h.version, ZR_DRAWLIST_VERSION_V2);
    assert.equal(h.cmdOffset, 64);
    assert.equal(h.cmdBytes, 28);
    assert.equal(h.cmdCount, 2);
    assert.equal(h.totalSize, 92);
    assertHeaderLayout(res.bytes, h);
  });

  test("v2 setCursor readback preserves payload fields and reserved byte", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: -1, y: 123, shape: 2, visible: false, blink: true });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmds = parseCommands(res.bytes);
    assert.equal(cmds.length, 1);
    const cmd = cmds[0];
    if (!cmd) return;
    const cursor = readSetCursorCommand(res.bytes, cmd);

    assert.equal(cursor.x, -1);
    assert.equal(cursor.y, 123);
    assert.equal(cursor.shape, 2);
    assert.equal(cursor.visible, 0);
    assert.equal(cursor.blink, 1);
    assert.equal(cursor.reserved0, 0);
  });

  test("v2 multiple cursor commands are emitted in-order", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 1, y: 2, shape: 0, visible: true, blink: true });
    b.setCursor({ x: 3, y: 4, shape: 1, visible: true, blink: false });
    b.hideCursor();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    assert.equal(h.cmdCount, 3);
    assert.equal(h.cmdBytes, 60);

    const cmds = parseCommands(res.bytes);
    const c0 = cmds[0];
    const c1 = cmds[1];
    const c2 = cmds[2];
    if (!c0 || !c1 || !c2) return;

    const s0 = readSetCursorCommand(res.bytes, c0);
    const s1 = readSetCursorCommand(res.bytes, c1);
    const s2 = readSetCursorCommand(res.bytes, c2);

    assert.equal(s0.x, 1);
    assert.equal(s0.y, 2);
    assert.equal(s0.shape, 0);
    assert.equal(s0.visible, 1);
    assert.equal(s0.blink, 1);

    assert.equal(s1.x, 3);
    assert.equal(s1.y, 4);
    assert.equal(s1.shape, 1);
    assert.equal(s1.visible, 1);
    assert.equal(s1.blink, 0);

    assert.equal(s2.x, -1);
    assert.equal(s2.y, -1);
    assert.equal(s2.shape, 0);
    assert.equal(s2.visible, 0);
    assert.equal(s2.blink, 0);
  });

  test("v2 cursor edge position (0,0) round-trips exactly", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 0, y: 0, shape: 0, visible: true, blink: true });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmd = parseCommands(res.bytes)[0];
    if (!cmd) return;
    const cursor = readSetCursorCommand(res.bytes, cmd);
    assert.equal(cursor.x, 0);
    assert.equal(cursor.y, 0);
    assert.equal(cursor.shape, 0);
    assert.equal(cursor.visible, 1);
    assert.equal(cursor.blink, 1);
  });

  test("v2 cursor edge position (large int32) round-trips exactly", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: INT32_MAX, y: INT32_MAX, shape: 2, visible: true, blink: false });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmd = parseCommands(res.bytes)[0];
    if (!cmd) return;
    const cursor = readSetCursorCommand(res.bytes, cmd);
    assert.equal(cursor.x, INT32_MAX);
    assert.equal(cursor.y, INT32_MAX);
    assert.equal(cursor.shape, 2);
    assert.equal(cursor.visible, 1);
    assert.equal(cursor.blink, 0);
  });

  test("backward-compat expectation: v1 command reader accepts v1 opcode set in v2 frame", () => {
    const b = createDrawlistBuilderV2();
    b.clear();
    b.fillRect(0, 0, 5, 6);
    b.drawText(2, 3, "compat");
    b.pushClip(0, 0, 10, 10);
    b.popClip();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const legacy = simulateV1CommandReader(res.bytes);
    assert.equal(legacy.ok, true);
  });

  test("backward-compat expectation: v1 command reader rejects SET_CURSOR opcode", () => {
    const b = createDrawlistBuilderV2();
    b.clear();
    b.setCursor({ x: 2, y: 2, shape: 0, visible: true, blink: true });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const legacy = simulateV1CommandReader(res.bytes);
    assert.equal(legacy.ok, false);
    if (legacy.ok) return;
    assert.equal(legacy.unsupportedOpcode, OP_SET_CURSOR);
  });

  test("v2 mixed frame keeps aligned sections and expected total byte size", () => {
    const b = createDrawlistBuilderV2();
    b.clear();
    b.pushClip(0, 0, 80, 24);
    b.fillRect(1, 1, 5, 2, { bg: { r: 7, g: 8, b: 9 }, inverse: true });
    b.drawText(2, 2, "rt");
    b.setCursor({ x: 2, y: 2, shape: 1, visible: true, blink: false });
    b.popClip();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    assert.equal(h.version, ZR_DRAWLIST_VERSION_V2);
    assert.equal(h.cmdCount, 6);
    assert.equal(
      h.cmdBytes,
      8 + // clear
        24 + // push clip
        40 + // fill rect
        48 + // draw text
        20 + // set cursor
        8, // pop clip
    );
    assert.equal(h.stringsCount, 1);
    assert.equal(h.stringsBytesLen, align4(2));
    assertHeaderLayout(res.bytes, h);
  });
});
