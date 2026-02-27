import { assert, describe, test } from "@rezi-ui/testkit";
import {
  OP_DRAW_TEXT,
  OP_DRAW_TEXT_RUN,
  parseBlobById,
  parseCommandHeaders,
} from "../../__tests__/drawlistDecode.js";
import { type TextStyle, createDrawlistBuilder } from "../../index.js";
import { DEFAULT_BASE_STYLE, mergeTextStyle } from "../../renderer/renderToDrawlist/textStyle.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function firstOpcodeOffset(bytes: Uint8Array, opcode: number): number {
  const cmd = parseCommandHeaders(bytes).find((entry) => entry.opcode === opcode);
  assert.equal(cmd !== undefined, true, `missing opcode ${String(opcode)}`);
  if (!cmd) return 0;
  return cmd.offset;
}

function drawTextFg(bytes: Uint8Array): number {
  return u32(bytes, firstOpcodeOffset(bytes, OP_DRAW_TEXT) + 28);
}

function drawTextBg(bytes: Uint8Array): number {
  return u32(bytes, firstOpcodeOffset(bytes, OP_DRAW_TEXT) + 32);
}

function drawTextAttrs(bytes: Uint8Array): number {
  return u32(bytes, firstOpcodeOffset(bytes, OP_DRAW_TEXT) + 36);
}

function firstTextRunBlob(bytes: Uint8Array): Uint8Array {
  const drawTextRunOff = firstOpcodeOffset(bytes, OP_DRAW_TEXT_RUN);
  const blobId = u32(bytes, drawTextRunOff + 16);
  const blob = parseBlobById(bytes, blobId);
  assert.equal(blob !== null, true, `missing blob id ${String(blobId)} for DRAW_TEXT_RUN`);
  return blob ?? new Uint8Array();
}

function textRunField(bytes: Uint8Array, segmentIndex: number, fieldOffset: number): number {
  const blob = firstTextRunBlob(bytes);
  return u32(blob, 4 + segmentIndex * 40 + fieldOffset);
}

function textRunFg(bytes: Uint8Array, segmentIndex: number): number {
  return textRunField(bytes, segmentIndex, 0);
}

function textRunBg(bytes: Uint8Array, segmentIndex: number): number {
  return textRunField(bytes, segmentIndex, 4);
}

function textRunAttrs(bytes: Uint8Array, segmentIndex: number): number {
  return textRunField(bytes, segmentIndex, 8);
}

const ATTRS = [
  "bold",
  "italic",
  "underline",
  "inverse",
  "dim",
  "strikethrough",
  "overline",
  "blink",
] as const;

type AttrName = (typeof ATTRS)[number];

const ATTR_BITS: ReadonlyArray<readonly [AttrName, number]> = ATTRS.map((attr, bit) => [attr, bit]);

const BUILDERS: ReadonlyArray<
  Readonly<{
    name: "current";
    create: typeof createDrawlistBuilder;
  }>
> = [{ name: "current", create: createDrawlistBuilder }];

function singleAttrStyle(attr: AttrName): TextStyle {
  return { [attr]: true } as TextStyle;
}

function attrAt(index: number): AttrName {
  const attr = ATTRS[index];
  if (!attr) throw new Error(`missing attr at index ${String(index)}`);
  return attr;
}

function attrMaskStyle(mask: number): TextStyle {
  const out: Partial<Record<AttrName, boolean>> = {};
  for (let bit = 0; bit < ATTRS.length; bit++) {
    const attr = attrAt(bit);
    if ((mask & (1 << bit)) !== 0) out[attr] = true;
  }
  return out;
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function encodeViaDrawText(
  create: typeof createDrawlistBuilder,
  style: TextStyle | undefined,
): Readonly<{ fg: number; bg: number; attrs: number }> {
  const b = create();
  b.drawText(0, 0, "x", style);
  const res = b.build();
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("build failed");
  return {
    fg: drawTextFg(res.bytes),
    bg: drawTextBg(res.bytes),
    attrs: drawTextAttrs(res.bytes),
  };
}

function encodeViaTextRun(
  create: typeof createDrawlistBuilder,
  style: TextStyle | undefined,
): Readonly<{ fg: number; bg: number; attrs: number }> {
  const b = create();
  const segment: { text: string; style?: TextStyle } =
    style === undefined ? { text: "x" } : { text: "x", style };
  const blobIndex = b.addTextRunBlob([segment]);
  assert.equal(blobIndex, 0);
  if (blobIndex === null) throw new Error("addTextRunBlob failed");

  b.drawTextRun(0, 0, blobIndex);
  const res = b.build();
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("build failed");

  return {
    fg: textRunFg(res.bytes, 0),
    bg: textRunBg(res.bytes, 0),
    attrs: textRunAttrs(res.bytes, 0),
  };
}

describe("drawlist style attrs bit mapping", () => {
  for (const builder of BUILDERS) {
    for (const [attr, bit] of ATTR_BITS) {
      test(`${builder.name} drawText maps ${attr} to exactly bit ${bit}`, () => {
        const encoded = encodeViaDrawText(builder.create, singleAttrStyle(attr));
        assert.equal(encoded.attrs, 1 << bit);
      });

      test(`${builder.name} text-run maps ${attr} to exactly bit ${bit}`, () => {
        const encoded = encodeViaTextRun(builder.create, singleAttrStyle(attr));
        assert.equal(encoded.attrs, 1 << bit);
      });
    }
  }
});

describe("drawlist style attrs combination encoding", () => {
  for (const builder of BUILDERS) {
    test(`${builder.name} drawText encodes all attrs as 0xff`, () => {
      const encoded = encodeViaDrawText(builder.create, attrMaskStyle(0xff));
      assert.equal(encoded.attrs, 0xff);
    });

    test(`${builder.name} drawText encodes mixed attr combinations`, () => {
      const mask = (1 << 0) | (1 << 2) | (1 << 5) | (1 << 7);
      const encoded = encodeViaDrawText(builder.create, attrMaskStyle(mask));
      assert.equal(encoded.attrs, mask);
    });

    test(`${builder.name} text-run encodes all attrs as 0xff`, () => {
      const encoded = encodeViaTextRun(builder.create, attrMaskStyle(0xff));
      assert.equal(encoded.attrs, 0xff);
    });
  }
});

describe("drawlist style fg/bg and undefined fg/bg encoding", () => {
  for (const builder of BUILDERS) {
    test(`${builder.name} drawText encodes fg/bg with attrs`, () => {
      const encoded = encodeViaDrawText(builder.create, {
        fg: (10 << 16) | (20 << 8) | 30,
        bg: (40 << 16) | (50 << 8) | 60,
        bold: true,
        inverse: true,
      });
      assert.equal(encoded.fg, packRgb(10, 20, 30));
      assert.equal(encoded.bg, packRgb(40, 50, 60));
      assert.equal(encoded.attrs, (1 << 0) | (1 << 3));
    });

    test(`${builder.name} drawText keeps fg/bg zero when undefined`, () => {
      const encoded = encodeViaDrawText(builder.create, {
        underline: true,
        overline: true,
      });
      assert.equal(encoded.fg, 0);
      assert.equal(encoded.bg, 0);
      assert.equal(encoded.attrs, (1 << 2) | (1 << 6));
    });

    test(`${builder.name} text-run encodes fg/bg with attrs`, () => {
      const encoded = encodeViaTextRun(builder.create, {
        fg: (1 << 16) | (2 << 8) | 3,
        bg: (4 << 16) | (5 << 8) | 6,
        dim: true,
        blink: true,
      });
      assert.equal(encoded.fg, packRgb(1, 2, 3));
      assert.equal(encoded.bg, packRgb(4, 5, 6));
      assert.equal(encoded.attrs, (1 << 4) | (1 << 7));
    });

    test(`${builder.name} text-run keeps fg/bg zero when undefined`, () => {
      const encoded = encodeViaTextRun(builder.create, {
        italic: true,
        strikethrough: true,
      });
      assert.equal(encoded.fg, 0);
      assert.equal(encoded.bg, 0);
      assert.equal(encoded.attrs, (1 << 1) | (1 << 5));
    });
  }
});

describe("drawlist extended underline degradation", () => {
  for (const builder of BUILDERS) {
    test(`${builder.name} drawText treats underlineStyle variant as underline attr`, () => {
      const encoded = encodeViaDrawText(builder.create, {
        underlineStyle: "dashed",
      });
      assert.equal(encoded.attrs, 1 << 2);
    });

    test(`${builder.name} text-run treats underlineStyle variant as underline attr`, () => {
      const encoded = encodeViaTextRun(builder.create, {
        underlineStyle: "double",
      });
      assert.equal(encoded.attrs, 1 << 2);
    });

    test(`${builder.name} underlineStyle=none does not set underline attr`, () => {
      const encoded = encodeViaDrawText(builder.create, {
        underlineStyle: "none",
      });
      assert.equal(encoded.attrs, 0);
    });
  }
});

describe("drawlist style attrs exhaustive 256-mask encoding", () => {
  for (const builder of BUILDERS) {
    for (let mask = 0; mask < 256; mask++) {
      const hex = mask.toString(16).padStart(2, "0");
      test(`${builder.name} drawText attr mask 0x${hex} encodes exactly`, () => {
        const encoded = encodeViaDrawText(builder.create, attrMaskStyle(mask));
        assert.equal(encoded.attrs, mask);
      });
    }
  }
});

describe("style merge stress encodes fg/bg/attrs bytes deterministically", () => {
  test("many merged styles produce expected drawText style payloads", () => {
    const b = createDrawlistBuilder();
    const expected: Array<Readonly<{ fg: number; bg: number; attrs: number }>> = [];

    let resolved = DEFAULT_BASE_STYLE;
    for (let i = 0; i < 192; i++) {
      const override: TextStyle = {
        ...(i % 3 === 0 ? { fg: packRgb((i * 17) & 0xff, (i * 29) & 0xff, (i * 43) & 0xff) } : {}),
        ...(i % 5 === 0 ? { bg: packRgb((i * 11) & 0xff, (i * 7) & 0xff, (i * 13) & 0xff) } : {}),
        ...(i % 2 === 0 ? { bold: true } : {}),
        ...(i % 4 === 0 ? { italic: true } : {}),
        ...(i % 6 === 0 ? { underline: true } : {}),
        ...(i % 8 === 0 ? { inverse: true } : {}),
        ...(i % 10 === 0 ? { dim: true } : {}),
        ...(i % 12 === 0 ? { strikethrough: true } : {}),
        ...(i % 14 === 0 ? { overline: true } : {}),
        ...(i % 16 === 0 ? { blink: true } : {}),
      };
      resolved = mergeTextStyle(resolved, override);
      expected.push({
        fg: resolved.fg >>> 0,
        bg: resolved.bg >>> 0,
        attrs: resolved.attrs >>> 0,
      });
      b.drawText(i, 0, "x", resolved);
    }

    const res = b.build();
    assert.equal(res.ok, true);
    if (!res.ok) throw new Error("build failed");

    const drawTextCommands = parseCommandHeaders(res.bytes).filter(
      (cmd) => cmd.opcode === OP_DRAW_TEXT,
    );
    assert.equal(drawTextCommands.length, expected.length);

    for (let i = 0; i < expected.length; i++) {
      const exp = expected[i];
      const cmd = drawTextCommands[i];
      if (!exp || !cmd) continue;
      const off = cmd.offset;
      assert.equal(u32(res.bytes, off + 28), exp.fg, `fg mismatch at cmd #${String(i)}`);
      assert.equal(u32(res.bytes, off + 32), exp.bg, `bg mismatch at cmd #${String(i)}`);
      assert.equal(u32(res.bytes, off + 36), exp.attrs, `attrs mismatch at cmd #${String(i)}`);
    }
  });
});
