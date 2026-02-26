import { assert, describe, test } from "@rezi-ui/testkit";
import { createDrawlistBuilder } from "../../index.js";

const OP_DRAW_TEXT = 3;

type BuildResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; error: Readonly<{ code: string; detail: string }> }>;

type BuilderLike = Readonly<{
  drawText(x: number, y: number, text: string, style?: unknown): void;
  build(): BuildResult;
  reset(): void;
}>;

type BuilderOpts = Readonly<{
  maxStrings?: number;
  maxStringBytes?: number;
}>;

const FACTORIES: readonly Readonly<{
  name: string;
  create(opts?: BuilderOpts): BuilderLike;
}>[] = [{ name: "current", create: (opts?: BuilderOpts) => createDrawlistBuilder(opts) }];

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

type Header = Readonly<{
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringsSpanOffset: number;
  stringsCount: number;
  stringsBytesOffset: number;
  stringsBytesLen: number;
}>;

type DrawTextEntry = Readonly<{ stringIndex: number; byteOff: number; byteLen: number }>;

function readHeader(bytes: Uint8Array): Header {
  return {
    cmdOffset: u32(bytes, 16),
    cmdBytes: u32(bytes, 20),
    cmdCount: u32(bytes, 24),
    stringsSpanOffset: u32(bytes, 28),
    stringsCount: u32(bytes, 32),
    stringsBytesOffset: u32(bytes, 36),
    stringsBytesLen: u32(bytes, 40),
  };
}

function readArenaSpan(bytes: Uint8Array, h: Header): Readonly<{ off: number; len: number }> {
  if (h.stringsCount === 0) return Object.freeze({ off: 0, len: 0 });
  return Object.freeze({
    off: u32(bytes, h.stringsSpanOffset),
    len: u32(bytes, h.stringsSpanOffset + 4),
  });
}

function decodeArenaSlice(bytes: Uint8Array, h: Header, byteOff: number, byteLen: number): string {
  if (byteLen === 0) return "";
  assert.equal(h.stringsCount > 0, true, "arena span required when byteLen > 0");

  const arena = readArenaSpan(bytes, h);
  assert.equal(byteOff + byteLen <= arena.len, true, "arena slice bounds");

  const start = h.stringsBytesOffset + arena.off + byteOff;
  const end = start + byteLen;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

function readDrawTextEntries(bytes: Uint8Array): DrawTextEntry[] {
  const h = readHeader(bytes);
  const out: DrawTextEntry[] = [];

  let off = h.cmdOffset;
  for (let i = 0; i < h.cmdCount; i++) {
    const opcode = u16(bytes, off + 0);
    const size = u32(bytes, off + 4);
    if (opcode === OP_DRAW_TEXT) {
      out.push(
        Object.freeze({
          stringIndex: u32(bytes, off + 16),
          byteOff: u32(bytes, off + 20),
          byteLen: u32(bytes, off + 24),
        }),
      );
    }
    off += size;
  }

  assert.equal(off, h.cmdOffset + h.cmdBytes, "command stream should end at cmdOffset + cmdBytes");
  return out;
}

function buildOk(builder: BuilderLike, label: string): Uint8Array {
  const res = builder.build();
  if (!res.ok) {
    throw new Error(`${label}: build should succeed (${res.error.code}: ${res.error.detail})`);
  }
  return res.bytes;
}

describe("drawlist text arena slices", () => {
  test("duplicate strings emit distinct arena slices (no per-frame interning)", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "dup");
      b.drawText(0, 1, "dup");

      const bytes = buildOk(b, `${factory.name} duplicate strings`);
      const h = readHeader(bytes);
      const drawText = readDrawTextEntries(bytes);

      assert.equal(h.stringsCount, 1, `${factory.name}: one arena span`);
      assert.equal(drawText.length, 2, `${factory.name}: expected 2 drawText commands`);
      assert.equal(drawText[0]?.stringIndex, 0, `${factory.name}: first string index`);
      assert.equal(drawText[1]?.stringIndex, 0, `${factory.name}: second string index`);
      assert.equal(drawText[0]?.byteOff, 0, `${factory.name}: first byte off`);
      assert.equal(drawText[1]?.byteOff, 3, `${factory.name}: second byte off`);
      assert.equal(decodeArenaSlice(bytes, h, 0, 3), "dup", `${factory.name}: first decode`);
      assert.equal(decodeArenaSlice(bytes, h, 3, 3), "dup", `${factory.name}: second decode`);
    }
  });

  test("distinct strings get sequential arena slices", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "alpha");
      b.drawText(0, 1, "beta");

      const bytes = buildOk(b, `${factory.name} distinct strings`);
      const h = readHeader(bytes);
      const drawText = readDrawTextEntries(bytes);

      assert.equal(drawText[0]?.byteOff, 0, `${factory.name}: alpha offset`);
      assert.equal(drawText[0]?.byteLen, 5, `${factory.name}: alpha len`);
      assert.equal(drawText[1]?.byteOff, 5, `${factory.name}: beta offset`);
      assert.equal(drawText[1]?.byteLen, 4, `${factory.name}: beta len`);
      assert.equal(decodeArenaSlice(bytes, h, 0, 5), "alpha", `${factory.name}: alpha decode`);
      assert.equal(decodeArenaSlice(bytes, h, 5, 4), "beta", `${factory.name}: beta decode`);
    }
  });

  test("empty string keeps zero-length slices and still emits an arena span", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "");
      b.drawText(0, 1, "");

      const bytes = buildOk(b, `${factory.name} empty string`);
      const h = readHeader(bytes);
      const drawText = readDrawTextEntries(bytes);
      const arena = readArenaSpan(bytes, h);

      assert.equal(h.stringsCount, 1, `${factory.name}: empty text still has arena span`);
      assert.equal(arena.off, 0, `${factory.name}: arena off`);
      assert.equal(arena.len, 0, `${factory.name}: arena len`);
      assert.equal(h.stringsBytesLen, 0, `${factory.name}: aligned bytes len`);
      assert.equal(drawText[0]?.byteOff, 0, `${factory.name}: first byte off`);
      assert.equal(drawText[1]?.byteOff, 0, `${factory.name}: second byte off`);
      assert.equal(drawText[0]?.byteLen, 0, `${factory.name}: first byte len`);
      assert.equal(drawText[1]?.byteLen, 0, `${factory.name}: second byte len`);
    }
  });

  test("unicode strings preserve UTF-8 byte lengths and decode from slices", () => {
    const text = "emoji😀 + combining e\u0301 + CJK漢字";
    const expectedByteLen = new TextEncoder().encode(text).byteLength;

    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, text);

      const bytes = buildOk(b, `${factory.name} unicode round-trip`);
      const h = readHeader(bytes);
      const drawText = readDrawTextEntries(bytes);

      assert.equal(drawText[0]?.byteLen, expectedByteLen, `${factory.name}: utf8 byte len`);
      assert.equal(
        decodeArenaSlice(bytes, h, drawText[0]?.byteOff ?? 0, drawText[0]?.byteLen ?? 0),
        text,
        `${factory.name}: unicode round-trip`,
      );
    }
  });

  test("normalization variants are preserved as distinct slices", () => {
    const nfc = "\u00E9";
    const nfd = "e\u0301";

    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, nfc);
      b.drawText(0, 1, nfd);

      const bytes = buildOk(b, `${factory.name} unicode normalization`);
      const h = readHeader(bytes);
      const drawText = readDrawTextEntries(bytes);

      const d0 = drawText[0];
      const d1 = drawText[1];
      if (!d0 || !d1) throw new Error("missing drawText entries");

      assert.equal(decodeArenaSlice(bytes, h, d0.byteOff, d0.byteLen), nfc, `${factory.name}: nfc`);
      assert.equal(decodeArenaSlice(bytes, h, d1.byteOff, d1.byteLen), nfd, `${factory.name}: nfd`);
      assert.equal(d0.byteOff !== d1.byteOff, true, `${factory.name}: distinct offsets`);
    }
  });

  test("many strings preserve deterministic slice ordering", () => {
    const unique = Array.from({ length: 256 }, (_, i) => `u-${i.toString().padStart(3, "0")}`);

    for (const factory of FACTORIES) {
      const b = factory.create();
      for (let i = 0; i < unique.length; i++) {
        b.drawText(0, i, unique[i] ?? "");
      }

      const bytes = buildOk(b, `${factory.name} many strings`);
      const h = readHeader(bytes);
      const drawText = readDrawTextEntries(bytes);

      assert.equal(drawText.length, unique.length, `${factory.name}: drawText count`);
      for (let i = 0; i < drawText.length; i++) {
        const cmd = drawText[i];
        if (!cmd) continue;
        assert.equal(cmd.stringIndex, 0, `${factory.name}: string index ${i}`);
        assert.equal(
          decodeArenaSlice(bytes, h, cmd.byteOff, cmd.byteLen),
          unique[i],
          `${factory.name}: decode ${i}`,
        );
      }
    }
  });

  test("reset starts a new frame with a fresh arena", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "first");
      b.drawText(0, 1, "second");
      buildOk(b, `${factory.name} frame 1`);

      b.reset();
      b.drawText(0, 0, "second");
      const frame2 = buildOk(b, `${factory.name} frame 2`);

      const h2 = readHeader(frame2);
      const entries = readDrawTextEntries(frame2);
      const first = entries[0];
      if (!first) throw new Error("missing drawText entry");

      assert.equal(first.byteOff, 0, `${factory.name}: frame2 starts at offset 0`);
      assert.equal(decodeArenaSlice(frame2, h2, first.byteOff, first.byteLen), "second");
    }
  });

  test("maxStrings cap does not block transient arena text", () => {
    for (const factory of FACTORIES) {
      const b = factory.create({ maxStrings: 1 });
      b.drawText(0, 0, "a");
      b.drawText(0, 1, "b");

      const res = b.build();
      assert.equal(res.ok, true, `${factory.name}: transient text bypasses maxStrings`);
    }
  });

  test("maxStringBytes cap does not block transient arena text", () => {
    for (const factory of FACTORIES) {
      const b = factory.create({ maxStringBytes: 1 });
      b.drawText(0, 0, "ab");

      const res = b.build();
      assert.equal(res.ok, true, `${factory.name}: transient text bypasses maxStringBytes`);
    }
  });
});
