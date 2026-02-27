import { assert, describe, test } from "@rezi-ui/testkit";
import { parseInternedStrings } from "../../__tests__/drawlistDecode.js";
import { createDrawlistBuilder } from "../../index.js";

const HEADER_SIZE = 64;
const INT32_MAX = 2147483647;

const OP_CLEAR = 1;
const OP_FILL_RECT = 2;
const OP_DRAW_TEXT = 3;
const OP_SET_CURSOR = 7;
const OP_FREE_STRING = 11;
const OP_FREE_BLOB = 13;

type Header = Readonly<{
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

type CmdHeader = Readonly<{
  off: number;
  opcode: number;
  flags: number;
  size: number;
  payloadOff: number;
}>;

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
  };
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

describe("DrawlistBuilder reset behavior", () => {
  test("v1 reset clears prior commands/strings/blobs for next frame", () => {
    const b = createDrawlistBuilder();
    const blobIndex = b.addTextRunBlob([{ text: "A" }, { text: "B" }]);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) return;

    b.drawTextRun(1, 2, blobIndex);
    b.drawText(0, 0, "frame0");
    const first = b.build();
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const h1 = readHeader(first.bytes);
    assert.equal(h1.cmdCount, 6);
    assert.deepEqual(parseInternedStrings(first.bytes), ["A", "B", "frame0"]);

    b.reset();
    b.clear();
    const second = b.build();
    assert.equal(second.ok, true);
    if (!second.ok) return;

    const h2 = readHeader(second.bytes);
    assert.equal(h2.cmdCount, 5);
    assert.equal(h2.cmdBytes, 56);
    assert.equal(h2.stringsCount, 0);
    assert.equal(h2.blobsCount, 0);
    assert.equal(h2.totalSize, 120);

    const opcodes = parseCommands(second.bytes).map((cmd) => cmd.opcode);
    assert.deepEqual(opcodes, [
      OP_CLEAR,
      OP_FREE_STRING,
      OP_FREE_STRING,
      OP_FREE_STRING,
      OP_FREE_BLOB,
    ]);
  });

  test("v2 reset drops cursor and string state before next frame", () => {
    const b = createDrawlistBuilder();
    b.setCursor({ x: 12, y: 4, shape: 1, visible: true, blink: false });
    b.drawText(0, 0, "persist");
    const first = b.build();
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const h1 = readHeader(first.bytes);
    assert.equal(h1.cmdCount, 3);
    assert.deepEqual(parseInternedStrings(first.bytes), ["persist"]);

    b.reset();
    b.fillRect(0, 0, 1, 1);
    const second = b.build();
    assert.equal(second.ok, true);
    if (!second.ok) return;

    const h2 = readHeader(second.bytes);
    assert.equal(h2.cmdCount, 2);
    assert.equal(h2.stringsCount, 0);
    assert.equal(h2.blobsCount, 0);

    const cmds = parseCommands(second.bytes);
    assert.deepEqual(
      cmds.map((cmd) => cmd.opcode),
      [OP_FILL_RECT, OP_FREE_STRING],
    );
  });

  test("v1 reset clears sticky failure state and restores successful builds", () => {
    const b = createDrawlistBuilder({ maxStrings: 1 });
    b.drawText(0, 0, "a");
    b.drawText(0, 1, "b");
    const failed = b.build();
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.equal(failed.error.code, "ZRDL_TOO_LARGE");

    b.reset();
    b.drawText(0, 0, "ok");
    const recovered = b.build();
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;
    assert.equal(readHeader(recovered.bytes).cmdCount, 2);
    assert.deepEqual(parseInternedStrings(recovered.bytes), ["ok"]);
  });

  test("v2 reset clears sticky failure state and allows cursor commands again", () => {
    const b = createDrawlistBuilder({ maxCmdCount: 1 });
    b.setCursor({ x: 1, y: 1, shape: 0, visible: true, blink: true });
    b.setCursor({ x: 2, y: 2, shape: 1, visible: true, blink: false });
    const failed = b.build();
    assert.equal(failed.ok, false);
    if (failed.ok) return;
    assert.equal(failed.error.code, "ZRDL_TOO_LARGE");

    b.reset();
    b.setCursor({ x: 3, y: 4, shape: 2, visible: false, blink: true });
    const recovered = b.build();
    assert.equal(recovered.ok, true);
    if (!recovered.ok) return;

    const cmd = parseCommands(recovered.bytes)[0];
    if (!cmd) return;
    assert.equal(cmd.opcode, OP_SET_CURSOR);
    assert.equal(i32(recovered.bytes, cmd.payloadOff + 0), 3);
    assert.equal(i32(recovered.bytes, cmd.payloadOff + 4), 4);
  });

  test("v1 reset reuse remains stable across many frames", () => {
    const b = createDrawlistBuilder();

    for (let frame = 0; frame < 128; frame++) {
      const text = `f${frame}`;
      b.reset();
      b.clear();
      b.drawText(frame % 7, frame % 5, text, { bold: (frame & 1) === 1 });

      const res = b.build();
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const h = readHeader(res.bytes);
      assert.equal(h.cmdCount, 3);
      assert.equal(h.cmdBytes, 88);
      assert.equal(h.stringsCount, 0);
      assert.equal(h.blobsCount, 0);
      assert.equal(h.totalSize, HEADER_SIZE + 88);

      const cmds = parseCommands(res.bytes);
      const clear = cmds.find((cmd) => cmd.opcode === OP_CLEAR);
      const draw = cmds.find((cmd) => cmd.opcode === OP_DRAW_TEXT);
      assert.equal(clear !== undefined, true);
      assert.equal(draw !== undefined, true);
      if (!clear || !draw) return;
      assert.equal(draw.flags, 0);
      assert.equal(draw.size, 60);

      const stringIndex = u32(res.bytes, draw.payloadOff + 8);
      const byteLen = u32(res.bytes, draw.payloadOff + 16);
      assert.equal(stringIndex, 1);
      assert.equal(byteLen, text.length);
      assert.equal(parseInternedStrings(res.bytes).includes(text), true);
    }
  });

  test("v2 reset reuse across many frames keeps cursor correctness stable", () => {
    const b = createDrawlistBuilder();

    for (let frame = 0; frame < 128; frame++) {
      const origin = frame % 2 === 0;
      const x = origin ? 0 : INT32_MAX - frame;
      const y = origin ? 0 : INT32_MAX - frame;
      const shape = origin ? 0 : 2;
      const blink = origin;

      b.reset();
      b.clear();
      b.setCursor({ x, y, shape, visible: true, blink });

      const res = b.build();
      assert.equal(res.ok, true);
      if (!res.ok) return;

      const h = readHeader(res.bytes);
      assert.equal(h.cmdCount, 2);
      assert.equal(h.cmdBytes, 28);
      assert.equal(h.stringsCount, 0);
      assert.equal(h.blobsCount, 0);
      assert.equal(h.totalSize, 92);

      const cmds = parseCommands(res.bytes);
      const clear = cmds[0];
      const cursor = cmds[1];
      if (!clear || !cursor) return;

      assert.equal(clear.opcode, OP_CLEAR);
      assert.equal(cursor.opcode, OP_SET_CURSOR);
      assert.equal(cursor.size, 20);
      assert.equal(i32(res.bytes, cursor.payloadOff + 0), x);
      assert.equal(i32(res.bytes, cursor.payloadOff + 4), y);
      assert.equal(res.bytes[cursor.payloadOff + 8], shape);
      assert.equal(res.bytes[cursor.payloadOff + 9], 1);
      assert.equal(res.bytes[cursor.payloadOff + 10], blink ? 1 : 0);
      assert.equal(res.bytes[cursor.payloadOff + 11], 0);
    }
  });
});
