import { assert, describe, test } from "@rezi-ui/testkit";
import { parseDrawTextCommands, parseInternedStrings } from "../../__tests__/drawlistDecode.js";
import { createDrawlistBuilder } from "../../index.js";

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
  encodedStringCacheCap?: number;
}>;

const FACTORIES: readonly Readonly<{
  name: string;
  create(opts?: BuilderOpts): BuilderLike;
}>[] = [{ name: "current", create: (opts?: BuilderOpts) => createDrawlistBuilder(opts) }];

type DrawTextEntry = Readonly<{ stringId: number; byteLen: number }>;

function readDrawTextEntries(bytes: Uint8Array): DrawTextEntry[] {
  return parseDrawTextCommands(bytes).map((cmd) => ({
    stringId: cmd.stringId,
    byteLen: cmd.byteLen,
  }));
}

function buildOk(builder: BuilderLike, label: string): Uint8Array {
  const res = builder.build();
  if (!res.ok) {
    throw new Error(`${label}: build should succeed (${res.error.code}: ${res.error.detail})`);
  }
  return res.bytes;
}

describe("drawlist string interning", () => {
  test("duplicate strings share the same string table index", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "dup");
      b.drawText(0, 1, "dup");

      const bytes = buildOk(b, `${factory.name} duplicate strings`);
      const drawText = readDrawTextEntries(bytes);
      const strings = parseInternedStrings(bytes);

      assert.equal(drawText.length, 2, `${factory.name}: expected 2 drawText commands`);
      assert.equal(drawText[0]?.stringId, 1, `${factory.name}: first string id`);
      assert.equal(drawText[1]?.stringId, 1, `${factory.name}: duplicate string id`);
      assert.deepEqual(strings, ["dup"], `${factory.name}: string table should dedupe`);
    }
  });

  test("distinct strings get distinct indices", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "alpha");
      b.drawText(0, 1, "beta");

      const bytes = buildOk(b, `${factory.name} distinct strings`);
      const drawText = readDrawTextEntries(bytes);
      const strings = parseInternedStrings(bytes);

      assert.equal(drawText[0]?.stringId, 1, `${factory.name}: alpha id`);
      assert.equal(drawText[1]?.stringId, 2, `${factory.name}: beta id`);
      assert.deepEqual(strings, ["alpha", "beta"], `${factory.name}: expected two strings`);
    }
  });

  test("interning is based on text value only (style and coordinates do not matter)", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(10, 20, "same", { bold: true });
      b.drawText(-1, 999, "same", { underline: true, fg: { r: 1, g: 2, b: 3 } });

      const bytes = buildOk(b, `${factory.name} value-based interning`);
      const drawText = readDrawTextEntries(bytes);
      assert.equal(drawText[0]?.stringId, 1, `${factory.name}: first id`);
      assert.equal(drawText[1]?.stringId, 1, `${factory.name}: second id`);
      assert.deepEqual(
        parseInternedStrings(bytes),
        ["same"],
        `${factory.name}: one interned string`,
      );
    }
  });

  test("empty string interns once with zero byte length", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "");
      b.drawText(0, 1, "");

      const bytes = buildOk(b, `${factory.name} empty string`);
      const drawText = readDrawTextEntries(bytes);
      const strings = parseInternedStrings(bytes);

      assert.equal(drawText[0]?.stringId, 1, `${factory.name}: first empty id`);
      assert.equal(drawText[1]?.stringId, 1, `${factory.name}: second empty id`);
      assert.equal(drawText[0]?.byteLen, 0, `${factory.name}: empty byte len in command`);
      assert.deepEqual(strings, [""], `${factory.name}: one empty string in table`);
    }
  });

  test("very long strings (10k+) are interned and round-trip correctly", () => {
    const longText = "L".repeat(10_123);
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, longText);

      const bytes = buildOk(b, `${factory.name} long string`);
      const drawText = readDrawTextEntries(bytes);
      const strings = parseInternedStrings(bytes);

      assert.equal(drawText[0]?.stringId, 1, `${factory.name}: long string id`);
      assert.equal(drawText[0]?.byteLen, longText.length, `${factory.name}: long byte len`);
      assert.equal(strings[0], longText, `${factory.name}: long round-trip text`);
    }
  });

  test("unicode string with emoji/combining marks/CJK round-trips with correct UTF-8 length", () => {
    const text = "emoji😀 + combining e\u0301 + CJK漢字";
    const expectedByteLen = new TextEncoder().encode(text).byteLength;

    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, text);

      const bytes = buildOk(b, `${factory.name} unicode round-trip`);
      const drawText = readDrawTextEntries(bytes);
      const strings = parseInternedStrings(bytes);

      assert.equal(drawText[0]?.byteLen, expectedByteLen, `${factory.name}: utf8 byte len`);
      assert.equal(strings[0], text, `${factory.name}: unicode round-trip`);
    }
  });

  test("normalization variants are treated as distinct keys", () => {
    const nfc = "\u00E9";
    const nfd = "e\u0301";

    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, nfc);
      b.drawText(0, 1, nfd);

      const bytes = buildOk(b, `${factory.name} unicode normalization`);
      const drawText = readDrawTextEntries(bytes);
      const strings = parseInternedStrings(bytes);

      assert.equal(drawText[0]?.stringId, 1, `${factory.name}: nfc id`);
      assert.equal(drawText[1]?.stringId, 2, `${factory.name}: nfd id`);
      assert.deepEqual(strings, [nfc, nfd], `${factory.name}: both forms are preserved`);
    }
  });

  test("string table decode round-trips unique values in first-seen order", () => {
    const input = ["", "hello", "😀", "漢字", "hello", "world", "😀", "e\u0301"];
    const expectedUnique = ["", "hello", "😀", "漢字", "world", "e\u0301"];
    const expectedIndices = [0, 1, 2, 3, 1, 4, 2, 5];

    for (const factory of FACTORIES) {
      const b = factory.create();
      for (let i = 0; i < input.length; i++) {
        b.drawText(0, i, input[i] ?? "");
      }

      const bytes = buildOk(b, `${factory.name} round-trip decode`);
      const drawText = readDrawTextEntries(bytes);
      const actualIds = drawText.map((entry) => entry.stringId);
      const actualIndices = actualIds.map((id) => id - 1);

      assert.deepEqual(actualIndices, expectedIndices, `${factory.name}: index assignment`);
      assert.deepEqual(
        parseInternedStrings(bytes),
        expectedUnique,
        `${factory.name}: unique decode`,
      );
    }
  });

  test("many unique strings produce sequential indices and full string table", () => {
    const unique = Array.from({ length: 256 }, (_, i) => `u-${i.toString().padStart(3, "0")}`);

    for (const factory of FACTORIES) {
      const b = factory.create();
      for (let i = 0; i < unique.length; i++) {
        b.drawText(0, i, unique[i] ?? "");
      }

      const bytes = buildOk(b, `${factory.name} many unique strings`);
      const drawText = readDrawTextEntries(bytes);
      assert.equal(drawText.length, unique.length, `${factory.name}: drawText count`);
      for (let i = 0; i < drawText.length; i++) {
        assert.equal(drawText[i]?.stringId, i + 1, `${factory.name}: id ${i + 1}`);
      }
      assert.deepEqual(
        parseInternedStrings(bytes),
        unique,
        `${factory.name}: decoded string table`,
      );
    }
  });

  test("reset starts a new frame with a fresh string table and reindexed strings", () => {
    for (const factory of FACTORIES) {
      const b = factory.create();
      b.drawText(0, 0, "first");
      b.drawText(0, 1, "second");
      const frame1 = buildOk(b, `${factory.name} frame 1`);

      b.reset();
      b.drawText(0, 0, "second");
      const frame2 = buildOk(b, `${factory.name} frame 2`);

      const frame1Ids = readDrawTextEntries(frame1).map((entry) => entry.stringId);
      const frame2Ids = readDrawTextEntries(frame2).map((entry) => entry.stringId);

      assert.deepEqual(frame1Ids, [1, 2], `${factory.name}: frame 1 ids`);
      assert.deepEqual(frame2Ids, [1], `${factory.name}: frame 2 ids restart`);
      assert.deepEqual(
        parseInternedStrings(frame2),
        ["second"],
        `${factory.name}: no stale strings`,
      );
    }
  });

  test("maxStrings cap rejects too many unique interned strings", () => {
    for (const factory of FACTORIES) {
      const b = factory.create({ maxStrings: 3 });
      b.drawText(0, 0, "a");
      b.drawText(0, 1, "b");
      b.drawText(0, 2, "c");
      b.drawText(0, 3, "d");

      const res = b.build();
      assert.equal(res.ok, false, `${factory.name}: should fail when maxStrings exceeded`);
      if (res.ok) continue;
      assert.equal(res.error.code, "ZRDL_TOO_LARGE", `${factory.name}: error code`);
    }
  });
});
