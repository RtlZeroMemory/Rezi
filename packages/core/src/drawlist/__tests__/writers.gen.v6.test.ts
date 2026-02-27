import { assert, describe, test } from "@rezi-ui/testkit";
import type { EncodedStyle } from "../types.js";
import {
  DEF_BLOB_BASE_SIZE,
  DEF_STRING_BASE_SIZE,
  DRAW_CANVAS_SIZE,
  DRAW_IMAGE_SIZE,
  DRAW_TEXT_SIZE,
  FREE_BLOB_SIZE,
  FREE_STRING_SIZE,
  writeDefBlob,
  writeDefString,
  writeDrawCanvas,
  writeDrawImage,
  writeDrawText,
  writeFreeBlob,
  writeFreeString,
} from "../writers.gen.js";

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

function u16(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(off, true);
}

function i8(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt8(off);
}

function u32(bytes: Uint8Array, off: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(off, true);
}

const ZERO_STYLE: EncodedStyle = Object.freeze({
  fg: 0,
  bg: 0,
  attrs: 0,
  reserved: 0,
  underlineRgb: 0,
  linkUriRef: 0,
  linkIdRef: 0,
});

describe("writers.gen v6", () => {
  test("size constants match v1 layouts", () => {
    assert.equal(DRAW_TEXT_SIZE, 60);
    assert.equal(DRAW_CANVAS_SIZE, 32);
    assert.equal(DRAW_IMAGE_SIZE, 40);
    assert.equal(DEF_STRING_BASE_SIZE, 16);
    assert.equal(DEF_BLOB_BASE_SIZE, 16);
    assert.equal(FREE_STRING_SIZE, 12);
    assert.equal(FREE_BLOB_SIZE, 12);
  });

  test("DEF_STRING writes dynamic payload size and zero pad", () => {
    const bytes = new Uint8Array(64);
    bytes.fill(0xcc);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const payload = new Uint8Array([0x41, 0x42, 0x43]);
    const end = writeDefString(bytes, dv, 0, 9, payload.byteLength, payload);

    assert.equal(end, 20);
    assert.equal(u8(bytes, 0), 10);
    assert.equal(u32(bytes, 4), 20);
    assert.equal(u32(bytes, 8), 9);
    assert.equal(u32(bytes, 12), 3);
    assert.deepEqual(Array.from(bytes.subarray(16, 19)), [0x41, 0x42, 0x43]);
    assert.equal(u8(bytes, 19), 0);
  });

  test("DEF_STRING honors declared byteLen (does not force bytes.byteLength)", () => {
    const bytes = new Uint8Array(64);
    bytes.fill(0xcc);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const payload = new Uint8Array([0x41, 0x42, 0x43, 0x44, 0x45]);
    const end = writeDefString(bytes, dv, 0, 9, 3, payload);

    assert.equal(end, 20);
    assert.equal(u32(bytes, 4), 20);
    assert.equal(u32(bytes, 12), 3);
    assert.deepEqual(Array.from(bytes.subarray(16, 19)), [0x41, 0x42, 0x43]);
    assert.equal(u8(bytes, 19), 0);
    assert.equal(u8(bytes, 20), 0xcc);
  });

  test("FREE_* write id payload only", () => {
    const bytes = new Uint8Array(32);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    const p1 = writeFreeString(bytes, dv, 0, 44);
    const p2 = writeFreeBlob(bytes, dv, p1, 55);

    assert.equal(p1, FREE_STRING_SIZE);
    assert.equal(p2, FREE_STRING_SIZE + FREE_BLOB_SIZE);

    assert.equal(u8(bytes, 0), 11);
    assert.equal(u32(bytes, 4), FREE_STRING_SIZE);
    assert.equal(u32(bytes, 8), 44);

    assert.equal(u8(bytes, p1 + 0), 13);
    assert.equal(u32(bytes, p1 + 4), FREE_BLOB_SIZE);
    assert.equal(u32(bytes, p1 + 8), 55);
  });

  test("DRAW_TEXT/DRAW_CANVAS/DRAW_IMAGE use resource ids", () => {
    const bytes = new Uint8Array(160);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let pos = 0;
    pos = writeDrawText(bytes, dv, pos, 1, 2, 123, 4, 5, ZERO_STYLE, 0);
    pos = writeDrawCanvas(bytes, dv, pos, 3, 4, 5, 6, 10, 12, 88, 777, 6, 0, 0);
    pos = writeDrawImage(bytes, dv, pos, 7, 8, 9, 10, 11, 12, 99, 888, 321, 1, 3, -1, 2, 0, 0, 0);

    assert.equal(u32(bytes, 16), 123);
    assert.equal(u32(bytes, 20), 4);
    assert.equal(u32(bytes, 24), 5);

    const canvasOff = DRAW_TEXT_SIZE;
    assert.equal(u32(bytes, canvasOff + 20), 88);
    assert.equal(u32(bytes, canvasOff + 24), 777);
    assert.equal(u8(bytes, canvasOff + 28), 6);

    const imageOff = DRAW_TEXT_SIZE + DRAW_CANVAS_SIZE;
    assert.equal(u32(bytes, imageOff + 20), 99);
    assert.equal(u32(bytes, imageOff + 24), 888);
    assert.equal(u32(bytes, imageOff + 28), 321);
    assert.equal(u16(bytes, imageOff + 16), 11);
    assert.equal(i8(bytes, imageOff + 34), -1);

    assert.equal(pos, DRAW_TEXT_SIZE + DRAW_CANVAS_SIZE + DRAW_IMAGE_SIZE);
  });

  test("DEF_BLOB handles already aligned payload sizes", () => {
    const bytes = new Uint8Array(64);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payload = new Uint8Array([1, 2, 3, 4]);
    const end = writeDefBlob(bytes, dv, 0, 7, payload.byteLength, payload);

    assert.equal(end, 20);
    assert.equal(u8(bytes, 0), 12);
    assert.equal(u32(bytes, 8), 7);
    assert.equal(u32(bytes, 12), 4);
    assert.deepEqual(Array.from(bytes.subarray(16, 20)), [1, 2, 3, 4]);
  });

  test("DEF_BLOB zeroes trailing padding at non-zero write positions", () => {
    const bytes = new Uint8Array(64);
    bytes.fill(0xcc);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payload = new Uint8Array([1, 2, 3]);

    const end = writeDefBlob(bytes, dv, 8, 7, payload.byteLength, payload);

    assert.equal(end, 28);
    assert.equal(u8(bytes, 8), 12);
    assert.equal(u32(bytes, 12), 20);
    assert.equal(u32(bytes, 16), 7);
    assert.equal(u32(bytes, 20), 3);
    assert.deepEqual(Array.from(bytes.subarray(24, 27)), [1, 2, 3]);
    assert.equal(u8(bytes, 27), 0);
  });

  test("DEF_BLOB honors declared byteLen (does not force bytes.byteLength)", () => {
    const bytes = new Uint8Array(64);
    bytes.fill(0xcc);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const payload = new Uint8Array([1, 2, 3, 4, 5]);

    const end = writeDefBlob(bytes, dv, 0, 7, 3, payload);

    assert.equal(end, 20);
    assert.equal(u8(bytes, 0), 12);
    assert.equal(u32(bytes, 4), 20);
    assert.equal(u32(bytes, 8), 7);
    assert.equal(u32(bytes, 12), 3);
    assert.deepEqual(Array.from(bytes.subarray(16, 19)), [1, 2, 3]);
    assert.equal(u8(bytes, 19), 0);
    assert.equal(u8(bytes, 20), 0xcc);
  });
});
