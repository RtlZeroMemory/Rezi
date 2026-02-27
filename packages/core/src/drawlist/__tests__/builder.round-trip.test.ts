import { assert, describe, test } from "@rezi-ui/testkit";
import {
  OP_CLEAR,
  OP_DEF_STRING,
  OP_DRAW_TEXT,
  OP_FILL_RECT,
  OP_POP_CLIP,
  OP_PUSH_CLIP,
  OP_SET_CURSOR,
  parseCommandHeaders,
  parseDrawTextCommands,
  parseInternedStrings,
} from "../../__tests__/drawlistDecode.js";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1, createDrawlistBuilder } from "../../index.js";

const HEADER_SIZE = 64;
const INT32_MAX = 2147483647;

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

type PackedStyle = Readonly<{
  fg: number;
  bg: number;
  attrs: number;
  reserved0: number;
  underlineRgb: number;
  linkUriRef: number;
  linkIdRef: number;
}>;

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

function parseCommands(bytes: Uint8Array): readonly CmdHeader[] {
  return parseCommandHeaders(bytes).map((cmd) => ({
    off: cmd.offset,
    opcode: cmd.opcode,
    flags: u16(bytes, cmd.offset + 2),
    size: cmd.size,
    payloadOff: cmd.payloadOffset,
  }));
}

function readStyle(bytes: Uint8Array, off: number): PackedStyle {
  return {
    fg: u32(bytes, off),
    bg: u32(bytes, off + 4),
    attrs: u32(bytes, off + 8),
    reserved0: u32(bytes, off + 12),
    underlineRgb: u32(bytes, off + 16),
    linkUriRef: u32(bytes, off + 20),
    linkIdRef: u32(bytes, off + 24),
  };
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

describe("DrawlistBuilder round-trip binary readback", () => {
  test("header and command stream layout are exact for mixed commands", () => {
    const b = createDrawlistBuilder();
    b.clear();
    b.fillRect(1, 2, 3, 4, {
      fg: (0x11 << 16) | (0x22 << 8) | 0x33,
      bg: (0x44 << 16) | (0x55 << 8) | 0x66,
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
    assert.equal(h.headerSize, HEADER_SIZE);
    assert.equal(h.totalSize, res.bytes.byteLength);
    assert.equal(h.cmdOffset, HEADER_SIZE);
    assert.equal(h.cmdCount, 6);
    assert.equal(h.stringsSpanOffset, 0);
    assert.equal(h.stringsCount, 0);
    assert.equal(h.stringsBytesOffset, 0);
    assert.equal(h.stringsBytesLen, 0);
    assert.equal(h.blobsSpanOffset, 0);
    assert.equal(h.blobsCount, 0);
    assert.equal(h.blobsBytesOffset, 0);
    assert.equal(h.blobsBytesLen, 0);
    assert.equal(h.reserved0, 0);

    const cmds = parseCommands(res.bytes);
    assert.equal(cmds.length, h.cmdCount);
    assert.equal(
      cmds.reduce((acc, cmd) => acc + cmd.size, 0),
      h.cmdBytes,
    );
    assert.deepEqual(
      cmds.map((cmd) => cmd.opcode),
      [OP_DEF_STRING, OP_CLEAR, OP_FILL_RECT, OP_PUSH_CLIP, OP_DRAW_TEXT, OP_POP_CLIP],
    );
  });

  test("fillRect command readback preserves geometry and packed style", () => {
    const b = createDrawlistBuilder();
    b.fillRect(-3, 9, 11, 13, {
      fg: (1 << 16) | (2 << 8) | 3,
      bg: (4 << 16) | (5 << 8) | 6,
      bold: true,
      underline: true,
      dim: true,
    });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmd = parseCommands(res.bytes)[0];
    if (!cmd) return;

    assert.equal(cmd.opcode, OP_FILL_RECT);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 52);
    assert.equal(i32(res.bytes, cmd.payloadOff + 0), -3);
    assert.equal(i32(res.bytes, cmd.payloadOff + 4), 9);
    assert.equal(i32(res.bytes, cmd.payloadOff + 8), 11);
    assert.equal(i32(res.bytes, cmd.payloadOff + 12), 13);

    const style = readStyle(res.bytes, cmd.payloadOff + 16);
    assert.equal(style.fg, 0x0001_0203);
    assert.equal(style.bg, 0x0004_0506);
    assert.equal(style.attrs, (1 << 0) | (1 << 2) | (1 << 4));
    assert.equal(style.reserved0, 0);
    assert.equal(style.underlineRgb, 0);
    assert.equal(style.linkUriRef, 0);
    assert.equal(style.linkIdRef, 0);
  });

  test("drawText command readback resolves interned text and style payload", () => {
    const b = createDrawlistBuilder();
    b.drawText(7, 9, "hello", {
      fg: (255 << 16) | (128 << 8) | 1,
      bg: (2 << 16) | (3 << 8) | 4,
      italic: true,
      inverse: true,
    });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmd = parseCommands(res.bytes).find((entry) => entry.opcode === OP_DRAW_TEXT);
    assert.equal(cmd !== undefined, true);
    if (!cmd) return;

    assert.equal(cmd.size, 60);
    assert.equal(i32(res.bytes, cmd.payloadOff + 0), 7);
    assert.equal(i32(res.bytes, cmd.payloadOff + 4), 9);
    assert.equal(u32(res.bytes, cmd.payloadOff + 8), 1);
    assert.equal(u32(res.bytes, cmd.payloadOff + 12), 0);
    assert.equal(u32(res.bytes, cmd.payloadOff + 16), 5);

    const style = readStyle(res.bytes, cmd.payloadOff + 20);
    assert.equal(style.fg, 0x00ff_8001);
    assert.equal(style.bg, 0x0002_0304);
    assert.equal(style.attrs, (1 << 1) | (1 << 3));
    assert.equal(style.reserved0, 0);
    assert.equal(style.underlineRgb, 0);
    assert.equal(style.linkUriRef, 0);
    assert.equal(style.linkIdRef, 0);
    assert.equal(u32(res.bytes, cmd.payloadOff + 48), 0);

    assert.deepEqual(parseInternedStrings(res.bytes), ["hello"]);
    const drawText = parseDrawTextCommands(res.bytes)[0];
    assert.equal(drawText?.stringId, 1);
    assert.equal(drawText?.byteLen, 5);
    assert.equal(drawText?.text, "hello");
  });

  test("clip push/pop commands round-trip with exact payload sizes", () => {
    const b = createDrawlistBuilder();
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

  test("repeated text uses deterministic 1-based string ids", () => {
    const b = createDrawlistBuilder();
    b.drawText(0, 0, "same");
    b.drawText(0, 1, "same");
    b.drawText(0, 2, "other");

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const drawText = parseDrawTextCommands(res.bytes);
    assert.deepEqual(
      drawText.map((cmd) => cmd.stringId),
      [1, 1, 2],
    );
    assert.deepEqual(parseInternedStrings(res.bytes), ["same", "other"]);
  });

  test("setCursor readback preserves payload fields and reserved byte", () => {
    const b = createDrawlistBuilder();
    b.setCursor({ x: -1, y: 123, shape: 2, visible: false, blink: true });

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmd = parseCommands(res.bytes)[0];
    if (!cmd) return;
    const cursor = readSetCursorCommand(res.bytes, cmd);

    assert.equal(cursor.x, -1);
    assert.equal(cursor.y, 123);
    assert.equal(cursor.shape, 2);
    assert.equal(cursor.visible, 0);
    assert.equal(cursor.blink, 1);
    assert.equal(cursor.reserved0, 0);
  });

  test("multiple cursor commands are emitted in order", () => {
    const b = createDrawlistBuilder();
    b.setCursor({ x: 1, y: 2, shape: 0, visible: true, blink: true });
    b.setCursor({ x: 3, y: 4, shape: 1, visible: true, blink: false });
    b.hideCursor();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmds = parseCommands(res.bytes);
    assert.equal(cmds.length, 3);
    const s0 = readSetCursorCommand(res.bytes, cmds[0] as CmdHeader);
    const s1 = readSetCursorCommand(res.bytes, cmds[1] as CmdHeader);
    const s2 = readSetCursorCommand(res.bytes, cmds[2] as CmdHeader);

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

  test("cursor edge positions round-trip exactly", () => {
    const b0 = createDrawlistBuilder();
    b0.setCursor({ x: 0, y: 0, shape: 0, visible: true, blink: true });
    const r0 = b0.build();
    assert.equal(r0.ok, true);
    if (!r0.ok) return;
    const c0 = readSetCursorCommand(r0.bytes, parseCommands(r0.bytes)[0] as CmdHeader);
    assert.equal(c0.x, 0);
    assert.equal(c0.y, 0);

    const b1 = createDrawlistBuilder();
    b1.setCursor({ x: INT32_MAX, y: INT32_MAX, shape: 2, visible: true, blink: false });
    const r1 = b1.build();
    assert.equal(r1.ok, true);
    if (!r1.ok) return;
    const c1 = readSetCursorCommand(r1.bytes, parseCommands(r1.bytes)[0] as CmdHeader);
    assert.equal(c1.x, INT32_MAX);
    assert.equal(c1.y, INT32_MAX);
  });

  test("mixed frame keeps aligned command stream and expected opcodes", () => {
    const b = createDrawlistBuilder();
    b.clear();
    b.pushClip(0, 0, 80, 24);
    b.fillRect(1, 1, 5, 2, { bg: (7 << 16) | (8 << 8) | 9, inverse: true });
    b.drawText(2, 2, "rt");
    b.setCursor({ x: 2, y: 2, shape: 1, visible: true, blink: false });
    b.popClip();

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const h = readHeader(res.bytes);
    const cmds = parseCommands(res.bytes);
    assert.equal(h.version, ZR_DRAWLIST_VERSION_V1);
    assert.equal(h.cmdCount, 7);
    assert.equal(cmds.length, 7);
    assert.equal(
      cmds.reduce((acc, cmd) => acc + cmd.size, 0),
      h.cmdBytes,
    );
    assert.deepEqual(
      cmds.map((cmd) => cmd.opcode),
      [
        OP_DEF_STRING,
        OP_CLEAR,
        OP_PUSH_CLIP,
        OP_FILL_RECT,
        OP_DRAW_TEXT,
        OP_SET_CURSOR,
        OP_POP_CLIP,
      ],
    );
    for (const cmd of cmds) {
      assert.equal((cmd.off & 3) === 0, true);
      assert.equal((cmd.size & 3) === 0, true);
    }
  });
});
