/**
 * Unit tests for DrawlistBuilderV2 SET_CURSOR command encoding.
 *
 * Verifies:
 *   - Correct v2 header version
 *   - SET_CURSOR command byte layout matches C struct
 *   - Reserved bytes are zero
 *   - Little-endian encoding
 *   - 4-byte alignment
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1 } from "../../abi.js";
import { createDrawlistBuilderV2 } from "../builder_v2.js";

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

const HEADER_SIZE = 64;
const OP_SET_CURSOR = 7;

describe("DrawlistBuilderV2 - SET_CURSOR encoding", () => {
  test("basic cursor set produces v2 header", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 10, y: 5, shape: 0, visible: true, blink: true });
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Verify v2 header
    assert.equal(u32(res.bytes, 0), ZRDL_MAGIC, "magic");
    assert.equal(u32(res.bytes, 4), ZR_DRAWLIST_VERSION_V1, "version");
    assert.equal(u32(res.bytes, 8), HEADER_SIZE, "header_size");
  });

  test("SET_CURSOR command byte layout matches C struct", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 42, y: 17, shape: 2, visible: true, blink: false });
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Command starts at offset 64 (after header)
    const cmdStart = HEADER_SIZE;

    // Command header: opcode (u16) + flags (u16) + size (u32)
    assert.equal(u16(res.bytes, cmdStart), OP_SET_CURSOR, "opcode");
    assert.equal(u16(res.bytes, cmdStart + 2), 0, "flags");
    assert.equal(u32(res.bytes, cmdStart + 4), 20, "size"); // 8 header + 12 payload

    // Payload: x (i32), y (i32), shape (u8), visible (u8), blink (u8), reserved (u8)
    const payloadStart = cmdStart + 8;
    assert.equal(i32(res.bytes, payloadStart), 42, "x");
    assert.equal(i32(res.bytes, payloadStart + 4), 17, "y");
    assert.equal(u8(res.bytes, payloadStart + 8), 2, "shape");
    assert.equal(u8(res.bytes, payloadStart + 9), 1, "visible");
    assert.equal(u8(res.bytes, payloadStart + 10), 0, "blink");
    assert.equal(u8(res.bytes, payloadStart + 11), 0, "reserved0");
  });

  test("cursor shape values: block=0, underline=1, bar=2", () => {
    for (const shape of [0, 1, 2] as const) {
      const b = createDrawlistBuilderV2();
      b.setCursor({ x: 0, y: 0, shape, visible: true, blink: false });
      const res = b.build();

      assert.equal(res.ok, true, `shape=${shape} should build successfully`);
      if (!res.ok) continue;

      const payloadStart = HEADER_SIZE + 8;
      assert.equal(u8(res.bytes, payloadStart + 8), shape, `shape=${shape}`);
    }
  });

  test("x=-1 and y=-1 for 'leave unchanged' semantics", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: -1, y: -1, shape: 0, visible: true, blink: true });
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    const payloadStart = HEADER_SIZE + 8;
    assert.equal(i32(res.bytes, payloadStart), -1, "x=-1");
    assert.equal(i32(res.bytes, payloadStart + 4), -1, "y=-1");
  });

  test("hideCursor emits SET_CURSOR with visible=0", () => {
    const b = createDrawlistBuilderV2();
    b.hideCursor();
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    const cmdStart = HEADER_SIZE;
    assert.equal(u16(res.bytes, cmdStart), OP_SET_CURSOR, "opcode");

    const payloadStart = cmdStart + 8;
    assert.equal(u8(res.bytes, payloadStart + 9), 0, "visible=0");
  });

  test("reserved byte is always zero", () => {
    const testCases = [
      { x: 0, y: 0, shape: 0 as const, visible: true, blink: true },
      { x: 100, y: 50, shape: 1 as const, visible: false, blink: false },
      { x: -1, y: -1, shape: 2 as const, visible: true, blink: false },
    ];

    for (const tc of testCases) {
      const b = createDrawlistBuilderV2();
      b.setCursor(tc);
      const res = b.build();

      assert.equal(res.ok, true);
      if (!res.ok) continue;

      const payloadStart = HEADER_SIZE + 8;
      assert.equal(u8(res.bytes, payloadStart + 11), 0, "reserved0 must be 0");
    }
  });

  test("SET_CURSOR is 4-byte aligned (total cmd size 20 -> already aligned)", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 1, y: 2, shape: 0, visible: true, blink: true });
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Command bytes should be 20 (8 + 12), which is 4-byte aligned
    assert.equal(u32(res.bytes, 20), 20, "cmdBytes");
  });

  test("multiple SET_CURSOR commands", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 0, y: 0, shape: 0, visible: true, blink: true });
    b.setCursor({ x: 10, y: 5, shape: 2, visible: true, blink: false });
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Two commands: 2 * 20 = 40 bytes
    assert.equal(u32(res.bytes, 20), 40, "cmdBytes");
    assert.equal(u32(res.bytes, 24), 2, "cmdCount");

    // First command
    const cmd1Start = HEADER_SIZE;
    assert.equal(u16(res.bytes, cmd1Start), OP_SET_CURSOR, "cmd1 opcode");
    assert.equal(i32(res.bytes, cmd1Start + 8), 0, "cmd1 x");
    assert.equal(i32(res.bytes, cmd1Start + 12), 0, "cmd1 y");

    // Second command
    const cmd2Start = HEADER_SIZE + 20;
    assert.equal(u16(res.bytes, cmd2Start), OP_SET_CURSOR, "cmd2 opcode");
    assert.equal(i32(res.bytes, cmd2Start + 8), 10, "cmd2 x");
    assert.equal(i32(res.bytes, cmd2Start + 12), 5, "cmd2 y");
    assert.equal(u8(res.bytes, cmd2Start + 16), 2, "cmd2 shape");
  });

  test("SET_CURSOR mixed with other commands", () => {
    const b = createDrawlistBuilderV2();
    b.clear();
    b.setCursor({ x: 5, y: 3, shape: 1, visible: true, blink: true });
    b.fillRect(0, 0, 10, 10);
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // 3 commands: CLEAR(8) + SET_CURSOR(20) + FILL_RECT(40) = 68 bytes
    assert.equal(u32(res.bytes, 24), 3, "cmdCount");

    // CLEAR at offset 64
    const clearStart = HEADER_SIZE;
    assert.equal(u16(res.bytes, clearStart), 1, "CLEAR opcode");

    // SET_CURSOR at offset 72
    const cursorStart = HEADER_SIZE + 8;
    assert.equal(u16(res.bytes, cursorStart), OP_SET_CURSOR, "SET_CURSOR opcode");
    assert.equal(i32(res.bytes, cursorStart + 8), 5, "cursor x");
    assert.equal(i32(res.bytes, cursorStart + 12), 3, "cursor y");
    assert.equal(u8(res.bytes, cursorStart + 16), 1, "cursor shape");

    // FILL_RECT at offset 92
    const fillStart = HEADER_SIZE + 8 + 20;
    assert.equal(u16(res.bytes, fillStart), 2, "FILL_RECT opcode");
  });

  test("invalid shape value fails with validation enabled", () => {
    const b = createDrawlistBuilderV2({ validateParams: true });
    // @ts-expect-error - Testing invalid shape
    b.setCursor({ x: 0, y: 0, shape: 5, visible: true, blink: true });
    const res = b.build();

    assert.equal(res.ok, false, "should fail with invalid shape");
    if (res.ok) return;
    assert.equal(res.error.code, "ZRDL_BAD_PARAMS");
  });

  test("reset clears state for reuse", () => {
    const b = createDrawlistBuilderV2();
    b.setCursor({ x: 10, y: 20, shape: 0, visible: true, blink: true });
    b.reset();
    b.setCursor({ x: 1, y: 2, shape: 1, visible: false, blink: false });
    const res = b.build();

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Only one command after reset
    assert.equal(u32(res.bytes, 24), 1, "cmdCount after reset");

    const payloadStart = HEADER_SIZE + 8;
    assert.equal(i32(res.bytes, payloadStart), 1, "x after reset");
    assert.equal(i32(res.bytes, payloadStart + 4), 2, "y after reset");
  });
});
