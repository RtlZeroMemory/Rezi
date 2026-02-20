import { assert, describe, test } from "@rezi-ui/testkit";
import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V3, createDrawlistBuilderV3 } from "../../index.js";

const OP_SET_LINK = 8;
const OP_DRAW_CANVAS = 9;
const OP_DRAW_IMAGE = 10;

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function i32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt32(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

type Header = Readonly<{
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

type Command = Readonly<{
  off: number;
  opcode: number;
  flags: number;
  size: number;
  payloadOff: number;
}>;

function readHeader(bytes: Uint8Array): Header {
  return {
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

function parseCommands(bytes: Uint8Array): readonly Command[] {
  const h = readHeader(bytes);
  if (h.cmdCount === 0) return Object.freeze([]);

  const out: Command[] = [];
  let off = h.cmdOffset;
  for (let i = 0; i < h.cmdCount; i++) {
    const size = u32(bytes, off + 4);
    assert.equal(size >= 8, true, `invalid command size at index ${String(i)}`);
    out.push(
      Object.freeze({
        off,
        opcode: u16(bytes, off),
        flags: u16(bytes, off + 2),
        size,
        payloadOff: off + 8,
      }),
    );
    off += size;
  }
  assert.equal(off, h.cmdOffset + h.cmdBytes);
  return Object.freeze(out);
}

function parseOpcodes(bytes: Uint8Array): readonly number[] {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;
  const out: number[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    out.push(opcode);
    off += size;
  }
  return Object.freeze(out);
}

function decodeString(bytes: Uint8Array, h: Header, stringIndex: number): string {
  const spanOff = h.stringsSpanOffset + stringIndex * 8;
  const byteOff = u32(bytes, spanOff);
  const byteLen = u32(bytes, spanOff + 4);
  const start = h.stringsBytesOffset + byteOff;
  const end = start + byteLen;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

function assertBadParams(
  result: ReturnType<ReturnType<typeof createDrawlistBuilderV3>["build"]>,
): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "ZRDL_BAD_PARAMS");
}

function decodeExt(ext: number): Readonly<{
  underlineStyle: number;
  hasUnderlineColor: number;
  underlineColorRgb: number;
}> {
  return Object.freeze({
    underlineStyle: ext & 0x7,
    hasUnderlineColor: (ext >> 3) & 0x1,
    underlineColorRgb: (ext >> 8) & 0x00ff_ffff,
  });
}

describe("DrawlistBuilderV3 graphics/link commands", () => {
  test("encodes v3 header with SET_LINK, DRAW_CANVAS and DRAW_IMAGE opcodes", () => {
    const builder = createDrawlistBuilderV3();
    builder.setLink("https://example.com", "docs");
    const canvasBlob = builder.addBlob(new Uint8Array(4 * 4 * 4));
    assert.equal(canvasBlob, 0);
    if (canvasBlob === null) throw new Error("canvas blob was null");
    builder.drawCanvas(1, 2, 3, 4, canvasBlob, "braille");

    const imageBlob = builder.addBlob(new Uint8Array(8));
    assert.equal(imageBlob, 1);
    if (imageBlob === null) throw new Error("image blob was null");
    builder.drawImage(5, 6, 7, 8, imageBlob, "rgba", "auto", 0, "contain", 42);

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");

    assert.equal(u32(built.bytes, 0), ZRDL_MAGIC);
    assert.equal(u32(built.bytes, 4), ZR_DRAWLIST_VERSION_V3);
    assert.deepEqual(parseOpcodes(built.bytes), [OP_SET_LINK, OP_DRAW_CANVAS, OP_DRAW_IMAGE]);
  });

  test("encodes SET_LINK payload fields and string indices", () => {
    const builder = createDrawlistBuilderV3();
    builder.setLink("https://example.com", "docs");
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const h = readHeader(built.bytes);
    const commands = parseCommands(built.bytes);
    const cmd = commands[0];
    if (!cmd) throw new Error("missing command");

    assert.equal(cmd.opcode, OP_SET_LINK);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 20);
    assert.equal(u32(built.bytes, cmd.payloadOff + 0), 0);
    assert.equal(u32(built.bytes, cmd.payloadOff + 4), 1);
    assert.equal(u32(built.bytes, cmd.payloadOff + 8), 0);
    assert.equal(h.stringsCount, 2);
    assert.equal(decodeString(built.bytes, h, 0), "https://example.com");
    assert.equal(decodeString(built.bytes, h, 1), "docs");
  });

  test("setLink(null) encodes clear-link sentinel values", () => {
    const builder = createDrawlistBuilderV3();
    builder.setLink(null, "ignored");
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const h = readHeader(built.bytes);
    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");

    assert.equal(cmd.opcode, OP_SET_LINK);
    assert.equal(u32(built.bytes, cmd.payloadOff + 0), 0xffff_ffff);
    assert.equal(u32(built.bytes, cmd.payloadOff + 4), 0xffff_ffff);
    assert.equal(u32(built.bytes, cmd.payloadOff + 8), 0);
    assert.equal(h.stringsCount, 0);
  });

  test("encodes DRAW_CANVAS payload fields and blob span table", () => {
    const builder = createDrawlistBuilderV3();
    const blob0 = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
    const blob1 = builder.addBlob(new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12]));
    assert.equal(blob0, 0);
    assert.equal(blob1, 1);
    if (blob1 === null) throw new Error("blob1 was null");

    builder.drawCanvas(10, 20, 30, 40, blob1, "sextant");
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const h = readHeader(built.bytes);
    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");

    assert.equal(cmd.opcode, OP_DRAW_CANVAS);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 36);
    assert.equal(i32(built.bytes, cmd.payloadOff + 0), 10);
    assert.equal(i32(built.bytes, cmd.payloadOff + 4), 20);
    assert.equal(i32(built.bytes, cmd.payloadOff + 8), 30);
    assert.equal(i32(built.bytes, cmd.payloadOff + 12), 40);
    assert.equal(u32(built.bytes, cmd.payloadOff + 16), 1);
    assert.equal(u8(built.bytes, cmd.payloadOff + 20), 2);
    assert.equal(u8(built.bytes, cmd.payloadOff + 21), 0);
    assert.equal(u16(built.bytes, cmd.payloadOff + 22), 0);
    assert.equal(u32(built.bytes, cmd.payloadOff + 24), 0);

    assert.equal(h.blobsCount, 2);
    assert.equal(u32(built.bytes, h.blobsSpanOffset + 0), 0);
    assert.equal(u32(built.bytes, h.blobsSpanOffset + 4), 4);
    assert.equal(u32(built.bytes, h.blobsSpanOffset + 8), 4);
    assert.equal(u32(built.bytes, h.blobsSpanOffset + 12), 8);
    assert.deepEqual(
      Array.from(built.bytes.subarray(h.blobsBytesOffset, h.blobsBytesOffset + 12)),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  });

  test("encodes DRAW_IMAGE payload fields", () => {
    const builder = createDrawlistBuilderV3();
    const blobIndex = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
    assert.equal(blobIndex, 0);
    if (blobIndex === null) throw new Error("blob index was null");

    builder.drawImage(5, 6, 7, 8, blobIndex, "png", "kitty", -1, "cover", 42);
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");

    assert.equal(cmd.opcode, OP_DRAW_IMAGE);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 40);
    assert.equal(i32(built.bytes, cmd.payloadOff + 0), 5);
    assert.equal(i32(built.bytes, cmd.payloadOff + 4), 6);
    assert.equal(i32(built.bytes, cmd.payloadOff + 8), 7);
    assert.equal(i32(built.bytes, cmd.payloadOff + 12), 8);
    assert.equal(u32(built.bytes, cmd.payloadOff + 16), 0);
    assert.equal(u8(built.bytes, cmd.payloadOff + 20), 1);
    assert.equal(u8(built.bytes, cmd.payloadOff + 21), 1);
    assert.equal(u8(built.bytes, cmd.payloadOff + 22), 2);
    assert.equal(u8(built.bytes, cmd.payloadOff + 23), 0);
    assert.equal(u32(built.bytes, cmd.payloadOff + 24), 42);
    assert.equal(u32(built.bytes, cmd.payloadOff + 28), 0);
  });

  test("rejects invalid params for setLink, drawCanvas, drawImage, and addBlob", () => {
    {
      const builder = createDrawlistBuilderV3();
      // @ts-expect-error runtime invalid param coverage
      builder.setLink(123, "id");
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilderV3();
      // @ts-expect-error runtime invalid param coverage
      builder.setLink(null, 123);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilderV3();
      builder.drawCanvas(0, 0, 1, 1, 0, "braille");
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilderV3();
      const blobIndex = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
      if (blobIndex === null) throw new Error("blob index was null");
      // @ts-expect-error runtime invalid param coverage
      builder.drawCanvas(0, 0, 1, 1, blobIndex, "unknown");
      assertBadParams(builder.build());
    }

    {
      const invalidZLayers: readonly unknown[] = [2, -2, Number.NaN, "0"];
      for (const invalidZLayer of invalidZLayers) {
        const builder = createDrawlistBuilderV3();
        const blobIndex = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
        if (blobIndex === null) throw new Error("blob index was null");
        builder.drawImage(
          0,
          0,
          1,
          1,
          blobIndex,
          "rgba",
          "auto",
          invalidZLayer as -1 | 0 | 1,
          "contain",
          0,
        );
        assertBadParams(builder.build());
      }
    }

    {
      const builder = createDrawlistBuilderV3();
      const blobIndex = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
      if (blobIndex === null) throw new Error("blob index was null");
      // @ts-expect-error runtime invalid param coverage
      builder.drawImage(0, 0, 1, 1, blobIndex, "rgba", "unknown", 0, "contain", 0);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilderV3();
      const blobIndex = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
      if (blobIndex === null) throw new Error("blob index was null");
      // @ts-expect-error runtime invalid param coverage
      builder.drawImage(0, 0, 1, 1, blobIndex, "rgba", "auto", 0, "unknown", 0);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilderV3();
      assert.equal(builder.addBlob(new Uint8Array([1, 2, 3])), null);
      assertBadParams(builder.build());
    }
  });

  test("encodes extended underline style/color in drawText style ext word", () => {
    const builder = createDrawlistBuilderV3();
    builder.drawText(0, 0, "x", {
      underline: true,
      underlineStyle: "curly",
      underlineColor: "#ff0000",
    });
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");
    const cmdOffset = u32(built.bytes, 16);
    const payloadOff = cmdOffset + 8;
    const ext = decodeExt(u32(built.bytes, payloadOff + 32));
    assert.equal(ext.underlineStyle, 3);
    assert.equal(ext.hasUnderlineColor, 1);
    assert.equal(ext.underlineColorRgb, 0xff0000);
  });

  test("encodes extended underline style/color in DRAW_TEXT_RUN blob segments", () => {
    const builder = createDrawlistBuilderV3();
    const blobIndex = builder.addTextRunBlob([
      {
        text: "x",
        style: {
          underlineStyle: "dashed",
          underlineColor: { r: 1, g: 2, b: 3 },
        },
      },
    ]);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) throw new Error("blob index was null");
    builder.drawTextRun(0, 0, blobIndex);

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");

    const blobBytesOffset = u32(built.bytes, 52);
    const ext = decodeExt(u32(built.bytes, blobBytesOffset + 4 + 12));
    assert.equal(ext.underlineStyle, 5);
    assert.equal(ext.hasUnderlineColor, 1);
    assert.equal(ext.underlineColorRgb, 0x010203);
  });
});
