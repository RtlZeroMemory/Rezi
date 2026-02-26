import { assert, describe, test } from "@rezi-ui/testkit";
import { ZRDL_MAGIC, createDrawlistBuilder } from "../../index.js";

const OP_DRAW_TEXT = 3;
const OP_DRAW_TEXT_RUN = 6;
const OP_DRAW_CANVAS = 8;
const OP_DRAW_IMAGE = 9;

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

function i8(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt8(off);
}

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

function decodeString(bytes: Uint8Array, h: Header, stringIndex: number): string {
  const spanOff = h.stringsSpanOffset + stringIndex * 8;
  const byteOff = u32(bytes, spanOff);
  const byteLen = u32(bytes, spanOff + 4);
  const start = h.stringsBytesOffset + byteOff;
  const end = start + byteLen;
  return new TextDecoder().decode(bytes.subarray(start, end));
}

function assertBadParams(
  result: ReturnType<ReturnType<typeof createDrawlistBuilder>["build"]>,
): void {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "ZRDL_BAD_PARAMS");
}

describe("DrawlistBuilder graphics/link commands", () => {
  test("encodes v5 header with DRAW_CANVAS and DRAW_IMAGE (links via style ext)", () => {
    const builder = createDrawlistBuilder();
    builder.setLink("https://example.com", "docs");
    builder.drawText(0, 0, "Docs");

    const canvasBlob = builder.addBlob(new Uint8Array(2 * 4 * 1 * 2 * 4));
    assert.equal(canvasBlob, 0);
    if (canvasBlob === null) throw new Error("canvas blob was null");
    builder.drawCanvas(1, 2, 2, 1, canvasBlob, "braille");

    const imageBlob = builder.addBlob(new Uint8Array(2 * 2 * 4));
    assert.equal(imageBlob, 1);
    if (imageBlob === null) throw new Error("image blob was null");
    builder.drawImage(5, 6, 2, 2, imageBlob, "rgba", "auto", 0, "contain", 42, 2, 2);

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");

    assert.equal(u32(built.bytes, 0), ZRDL_MAGIC);
    assert.equal(u32(built.bytes, 4), 5);
    assert.deepEqual(
      parseCommands(built.bytes).map((cmd) => cmd.opcode),
      [OP_DRAW_TEXT, OP_DRAW_CANVAS, OP_DRAW_IMAGE],
    );
  });

  test("setLink state is encoded into drawText style ext references", () => {
    const builder = createDrawlistBuilder();
    builder.setLink("https://example.com", "docs");
    builder.drawText(1, 2, "Docs");
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const h = readHeader(built.bytes);
    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing drawText command");
    assert.equal(cmd.opcode, OP_DRAW_TEXT);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 60);
    assert.equal(i32(built.bytes, cmd.payloadOff + 0), 1);
    assert.equal(i32(built.bytes, cmd.payloadOff + 4), 2);

    const linkUriRef = u32(built.bytes, cmd.payloadOff + 40);
    const linkIdRef = u32(built.bytes, cmd.payloadOff + 44);
    assert.equal(linkUriRef > 0, true);
    assert.equal(linkIdRef > 0, true);
    assert.equal(decodeString(built.bytes, h, linkUriRef - 1), "https://example.com");
    assert.equal(decodeString(built.bytes, h, linkIdRef - 1), "docs");
  });

  test("setLink(null) clears hyperlink refs for subsequent text", () => {
    const builder = createDrawlistBuilder();
    builder.setLink("https://example.com", "docs");
    builder.drawText(0, 0, "A");
    builder.setLink(null);
    builder.drawText(0, 1, "B");

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const commands = parseCommands(built.bytes).filter((cmd) => cmd.opcode === OP_DRAW_TEXT);
    const first = commands[0];
    const second = commands[1];
    if (!first || !second) throw new Error("expected 2 drawText commands");
    assert.equal(u32(built.bytes, first.payloadOff + 40) > 0, true);
    assert.equal(u32(built.bytes, first.payloadOff + 44) > 0, true);
    assert.equal(u32(built.bytes, second.payloadOff + 40), 0);
    assert.equal(u32(built.bytes, second.payloadOff + 44), 0);
  });

  test("encodes DRAW_CANVAS payload fields and blob offset/length", () => {
    const builder = createDrawlistBuilder();
    const blob0 = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
    const blob1 = builder.addBlob(new Uint8Array(6 * 6 * 4));
    assert.equal(blob0, 0);
    assert.equal(blob1, 1);
    if (blob1 === null) throw new Error("blob1 was null");

    builder.drawCanvas(10, 20, 3, 2, blob1, "sextant", 6, 6);
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const h = readHeader(built.bytes);
    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");

    assert.equal(cmd.opcode, OP_DRAW_CANVAS);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 32);
    assert.equal(u16(built.bytes, cmd.payloadOff + 0), 10);
    assert.equal(u16(built.bytes, cmd.payloadOff + 2), 20);
    assert.equal(u16(built.bytes, cmd.payloadOff + 4), 3);
    assert.equal(u16(built.bytes, cmd.payloadOff + 6), 2);
    assert.equal(u16(built.bytes, cmd.payloadOff + 8), 6);
    assert.equal(u16(built.bytes, cmd.payloadOff + 10), 6);
    assert.equal(u32(built.bytes, cmd.payloadOff + 12), 4);
    assert.equal(u32(built.bytes, cmd.payloadOff + 16), 6 * 6 * 4);
    assert.equal(u8(built.bytes, cmd.payloadOff + 20), 3);
    assert.equal(u8(built.bytes, cmd.payloadOff + 21), 0);
    assert.equal(u16(built.bytes, cmd.payloadOff + 22), 0);

    assert.equal(h.blobsCount, 2);
    assert.equal(u32(built.bytes, h.blobsSpanOffset + 8), 4);
    assert.equal(u32(built.bytes, h.blobsSpanOffset + 12), 6 * 6 * 4);
  });

  test("encodes DRAW_IMAGE payload fields", () => {
    const builder = createDrawlistBuilder();
    const blobIndex = builder.addBlob(new Uint8Array(2 * 2 * 4));
    assert.equal(blobIndex, 0);
    if (blobIndex === null) throw new Error("blob index was null");

    builder.drawImage(5, 6, 7, 8, blobIndex, "rgba", "kitty", -1, "cover", 42, 2, 2);
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");

    assert.equal(cmd.opcode, OP_DRAW_IMAGE);
    assert.equal(cmd.flags, 0);
    assert.equal(cmd.size, 40);
    assert.equal(u16(built.bytes, cmd.payloadOff + 0), 5);
    assert.equal(u16(built.bytes, cmd.payloadOff + 2), 6);
    assert.equal(u16(built.bytes, cmd.payloadOff + 4), 7);
    assert.equal(u16(built.bytes, cmd.payloadOff + 6), 8);
    assert.equal(u16(built.bytes, cmd.payloadOff + 8), 2);
    assert.equal(u16(built.bytes, cmd.payloadOff + 10), 2);
    assert.equal(u32(built.bytes, cmd.payloadOff + 12), 0);
    assert.equal(u32(built.bytes, cmd.payloadOff + 16), 16);
    assert.equal(u32(built.bytes, cmd.payloadOff + 20), 42);
    assert.equal(u8(built.bytes, cmd.payloadOff + 24), 0);
    assert.equal(u8(built.bytes, cmd.payloadOff + 25), 1);
    assert.equal(i8(built.bytes, cmd.payloadOff + 26), -1);
    assert.equal(u8(built.bytes, cmd.payloadOff + 27), 2);
    assert.equal(u8(built.bytes, cmd.payloadOff + 28), 0);
    assert.equal(u8(built.bytes, cmd.payloadOff + 29), 0);
    assert.equal(u16(built.bytes, cmd.payloadOff + 30), 0);
  });

  test("rejects invalid params for setLink, drawCanvas, drawImage, and addBlob", () => {
    {
      const builder = createDrawlistBuilder();
      // @ts-expect-error runtime invalid param coverage
      builder.setLink(123, "id");
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      // @ts-expect-error runtime invalid param coverage
      builder.setLink(null, 123);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      const blobIndex = builder.addBlob(new Uint8Array(8));
      if (blobIndex === null) throw new Error("blob index was null");
      builder.drawCanvas(0, 0, 1, 1, blobIndex, "braille");
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      const blobIndex = builder.addBlob(new Uint8Array(8));
      if (blobIndex === null) throw new Error("blob index was null");
      builder.drawImage(0, 0, 1, 1, blobIndex, "rgba", "auto", 0, "contain", 0);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      const blobIndex = builder.addBlob(new Uint8Array([1, 2, 3, 4]));
      if (blobIndex === null) throw new Error("blob index was null");
      // @ts-expect-error runtime invalid param coverage
      builder.drawCanvas(0, 0, 1, 1, blobIndex, "unknown");
      assertBadParams(builder.build());
    }

    {
      const invalidZLayers: readonly unknown[] = [2, -2, Number.NaN, "0"];
      for (const invalidZLayer of invalidZLayers) {
        const builder = createDrawlistBuilder();
        const blobIndex = builder.addBlob(new Uint8Array(4));
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
          1,
          1,
        );
        assertBadParams(builder.build());
      }
    }

    {
      const builder = createDrawlistBuilder();
      const blobIndex = builder.addBlob(new Uint8Array(4));
      if (blobIndex === null) throw new Error("blob index was null");
      builder.drawImage(0, 0, 1, 1, blobIndex, "rgba", "blitter", 0, "contain", 0, 1, 1);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      const blobIndex = builder.addBlob(new Uint8Array(4));
      if (blobIndex === null) throw new Error("blob index was null");
      // @ts-expect-error runtime invalid param coverage
      builder.drawImage(0, 0, 1, 1, blobIndex, "rgba", "unknown", 0, "contain", 0, 1, 1);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      const blobIndex = builder.addBlob(new Uint8Array(4));
      if (blobIndex === null) throw new Error("blob index was null");
      // @ts-expect-error runtime invalid param coverage
      builder.drawImage(0, 0, 1, 1, blobIndex, "rgba", "auto", 0, "unknown", 0, 1, 1);
      assertBadParams(builder.build());
    }

    {
      const builder = createDrawlistBuilder();
      assert.equal(builder.addBlob(new Uint8Array([1, 2, 3])), null);
      assertBadParams(builder.build());
    }
  });

  test("encodes underline style + underline RGB in drawText v3 style fields", () => {
    const builder = createDrawlistBuilder();
    builder.drawText(0, 0, "x", {
      underline: true,
      underlineStyle: "curly",
      underlineColor: "#ff0000",
    });
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");
    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");
    const reserved = u32(built.bytes, cmd.payloadOff + 32);
    const underlineRgb = u32(built.bytes, cmd.payloadOff + 36);
    assert.equal(reserved & 0x7, 3);
    assert.equal(underlineRgb, 0xff0000);
  });

  test("non-hex underlineColor token string is treated as unset", () => {
    const builder = createDrawlistBuilder();
    builder.drawText(0, 0, "x", {
      underline: true,
      underlineStyle: "curly",
      underlineColor: "diagnostic.warning",
    });
    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");
    const cmd = parseCommands(built.bytes)[0];
    if (!cmd) throw new Error("missing command");
    const underlineRgb = u32(built.bytes, cmd.payloadOff + 36);
    assert.equal(underlineRgb, 0);
  });

  test("encodes underline style/color in DRAW_TEXT_RUN segment v3 style", () => {
    const builder = createDrawlistBuilder();
    const blobIndex = builder.addTextRunBlob([
      {
        text: "x",
        style: {
          underlineStyle: "dashed",
          underlineColor: (1 << 16) | (2 << 8) | 3,
        },
      },
    ]);
    assert.equal(blobIndex, 0);
    if (blobIndex === null) throw new Error("blob index was null");
    builder.drawTextRun(0, 0, blobIndex);

    const built = builder.build();
    assert.equal(built.ok, true);
    if (!built.ok) throw new Error("build failed");

    const h = readHeader(built.bytes);
    const blobOffset = u32(built.bytes, h.blobsSpanOffset);
    const segmentOff = h.blobsBytesOffset + blobOffset + 4;
    const reserved = u32(built.bytes, segmentOff + 12);
    const underlineRgb = u32(built.bytes, segmentOff + 16);
    assert.equal(reserved & 0x7, 5);
    assert.equal(underlineRgb, 0x010203);
  });
});
