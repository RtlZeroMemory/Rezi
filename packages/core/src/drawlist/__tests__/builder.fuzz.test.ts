import { assert, test } from "@rezi-ui/testkit";
import { chance, pick, randomAsciiString, randomInt, runFuzz } from "@rezi-ui/testkit";
import {
  OP_CLEAR,
  OP_DEF_STRING,
  OP_DRAW_TEXT,
  OP_FILL_RECT,
  OP_POP_CLIP,
  OP_PUSH_CLIP,
  OP_SET_CURSOR,
  parseCommandHeaders,
  u32,
} from "../../__tests__/drawlistDecode.js";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1 } from "../../abi.js";
import { createDrawlistBuilder } from "../builder.js";
import type { DrawlistBuildErrorCode, DrawlistBuildResult } from "../types.js";

const HEADER_SIZE = 64;
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

type Header = Readonly<{
  magic: number;
  version: number;
  headerSize: number;
  totalSize: number;
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringsCount: number;
  stringsBytesLen: number;
  blobsCount: number;
  blobsBytesLen: number;
}>;

function readHeader(bytes: Uint8Array): Header {
  return {
    magic: u32(bytes, 0),
    version: u32(bytes, 4),
    headerSize: u32(bytes, 8),
    totalSize: u32(bytes, 12),
    cmdOffset: u32(bytes, 16),
    cmdBytes: u32(bytes, 20),
    cmdCount: u32(bytes, 24),
    stringsCount: u32(bytes, 32),
    stringsBytesLen: u32(bytes, 40),
    blobsCount: u32(bytes, 48),
    blobsBytesLen: u32(bytes, 56),
  };
}

function expectOk(result: DrawlistBuildResult): Uint8Array {
  if (!result.ok) throw new Error(`expected drawlist build to succeed: ${result.error.detail}`);
  assert.equal(result.ok, true);
  return result.bytes;
}

function expectError(result: DrawlistBuildResult, codes: readonly DrawlistBuildErrorCode[]): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected drawlist build to fail");
  assert.ok(codes.includes(result.error.code), result.error.detail);
  assert.equal(typeof result.error.detail, "string");
  assert.ok(result.error.detail.length > 0);
}

test("DrawlistBuilder fuzz: valid command programs produce well-formed bounded ZRDL", async () => {
  await runFuzz({ label: "drawlist-valid-programs", seed: 0x5a19_d117, iterations: 220 }, (ctx) => {
    const b = createDrawlistBuilder({
      maxCmdCount: 96,
      maxDrawlistBytes: 32_768,
      maxStringBytes: 4096,
      maxStrings: 128,
      maxBlobBytes: 4096,
      maxBlobs: 32,
    });
    const uniqueTexts = new Set<string>();
    const expectedVisibleOpcodes: number[] = [];
    let openClips = 0;

    const commandCount = randomInt(ctx.rng, 1, 48);
    for (let i = 0; i < commandCount; i++) {
      const op = pick(ctx.rng, [
        "clear",
        "fillRect",
        "drawText",
        "pushClip",
        "popClip",
        "setCursor",
        "hideCursor",
      ] as const);

      switch (op) {
        case "clear":
          b.clear();
          expectedVisibleOpcodes.push(OP_CLEAR);
          break;
        case "fillRect":
          b.fillRect(
            randomInt(ctx.rng, -30, 160),
            randomInt(ctx.rng, -10, 80),
            randomInt(ctx.rng, 0, 40),
            randomInt(ctx.rng, 0, 20),
            chance(ctx.rng, 50)
              ? { bold: chance(ctx.rng, 50), fg: randomInt(ctx.rng, 0, 0xffffff) }
              : undefined,
          );
          expectedVisibleOpcodes.push(OP_FILL_RECT);
          break;
        case "drawText": {
          const text = randomAsciiString(ctx.rng, {
            minLength: chance(ctx.rng, 20) ? 0 : 1,
            maxLength: 24,
            alphabet: "abcXYZ012 -_/.:",
          });
          b.drawText(randomInt(ctx.rng, -30, 160), randomInt(ctx.rng, -10, 80), text, {
            underline: chance(ctx.rng, 35),
            italic: chance(ctx.rng, 35),
          });
          uniqueTexts.add(text);
          expectedVisibleOpcodes.push(OP_DRAW_TEXT);
          break;
        }
        case "pushClip":
          b.pushClip(
            randomInt(ctx.rng, -20, 120),
            randomInt(ctx.rng, -10, 60),
            randomInt(ctx.rng, 0, 80),
            randomInt(ctx.rng, 0, 30),
          );
          openClips += 1;
          expectedVisibleOpcodes.push(OP_PUSH_CLIP);
          break;
        case "popClip":
          if (openClips > 0 || chance(ctx.rng, 20)) {
            b.popClip();
            openClips = Math.max(0, openClips - 1);
            expectedVisibleOpcodes.push(OP_POP_CLIP);
          }
          break;
        case "setCursor":
          b.setCursor({
            x: randomInt(ctx.rng, -1, 160),
            y: randomInt(ctx.rng, -1, 80),
            shape: pick(ctx.rng, [0, 1, 2] as const),
            visible: chance(ctx.rng, 80),
            blink: chance(ctx.rng, 50),
          });
          expectedVisibleOpcodes.push(OP_SET_CURSOR);
          break;
        case "hideCursor":
          b.hideCursor();
          expectedVisibleOpcodes.push(OP_SET_CURSOR);
          break;
      }
    }

    const bytes = expectOk(b.build());
    const header = readHeader(bytes);
    const commands = parseCommandHeaders(bytes);
    const visibleOpcodes = commands
      .map((cmd) => cmd.opcode)
      .filter((opcode) => opcode !== 10 && opcode !== 11 && opcode !== 12 && opcode !== 13);

    assert.equal(header.magic, ZRDL_MAGIC);
    assert.equal(header.version, ZR_DRAWLIST_VERSION_V1);
    assert.equal(header.headerSize, HEADER_SIZE);
    assert.equal(header.totalSize, bytes.byteLength);
    assert.equal((header.totalSize & 3) === 0, true);
    assert.equal(header.cmdOffset === 0 || header.cmdOffset === HEADER_SIZE, true);
    assert.equal(header.cmdBytes % 4, 0);
    assert.equal(header.stringsBytesLen % 4, 0);
    assert.equal(header.blobsBytesLen % 4, 0);
    assert.equal(commands.length, header.cmdCount);
    assert.deepEqual(visibleOpcodes, expectedVisibleOpcodes);
    assert.equal(commands.filter((cmd) => cmd.opcode === OP_DEF_STRING).length, uniqueTexts.size);
    assert.equal(header.stringsCount, 0);
    assert.equal(header.stringsBytesLen, 0);
    assert.equal(header.blobsCount, 0);
  });
});

test("DrawlistBuilder fuzz: invalid public inputs produce structured errors without throwing", async () => {
  await runFuzz({ label: "drawlist-invalid-inputs", seed: 0xbad_d117, iterations: 160 }, (ctx) => {
    const b = createDrawlistBuilder();
    const invalidNumber = pick(ctx.rng, [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      INT32_MAX + 1,
      INT32_MIN - 1,
      1.25,
    ]);
    const op = pick(ctx.rng, [
      "fillRectNegativeSize",
      "drawTextBadX",
      "drawTextBadText",
      "clipBadWidth",
      "cursorBadShape",
      "blobBadInput",
      "textRunBadBlob",
      "canvasBadBlob",
    ] as const);

    assert.doesNotThrow(() => {
      switch (op) {
        case "fillRectNegativeSize":
          b.fillRect(0, 0, -1, randomInt(ctx.rng, 0, 10));
          break;
        case "drawTextBadX":
          b.drawText(invalidNumber, 0, "x");
          break;
        case "drawTextBadText":
          b.drawText(0, 0, 42 as unknown as string);
          break;
        case "clipBadWidth":
          b.pushClip(0, 0, invalidNumber, 1);
          break;
        case "cursorBadShape":
          b.setCursor({ x: 0, y: 0, shape: 99 as 0, visible: true, blink: false });
          break;
        case "blobBadInput":
          b.addBlob("not bytes" as unknown as Uint8Array);
          break;
        case "textRunBadBlob":
          b.drawTextRun(0, 0, 0);
          break;
        case "canvasBadBlob":
          b.drawCanvas(0, 0, 1, 1, 0, "braille");
          break;
      }
    });

    expectError(b.build(), ["ZRDL_BAD_PARAMS"]);
    b.reset();
    const bytes = expectOk(b.build());
    const header = readHeader(bytes);
    assert.equal(header.magic, ZRDL_MAGIC);
    assert.equal(header.cmdCount, 0);
  });
});
