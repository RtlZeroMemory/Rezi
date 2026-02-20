import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type TextStyle,
  createDrawlistBuilderV1,
  createDrawlistBuilderV2,
  createDrawlistBuilderV3,
} from "../../index.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function firstCommandOffset(bytes: Uint8Array): number {
  return u32(bytes, 16);
}

function drawTextFg(bytes: Uint8Array): number {
  return u32(bytes, firstCommandOffset(bytes) + 28);
}

function drawTextBg(bytes: Uint8Array): number {
  return u32(bytes, firstCommandOffset(bytes) + 32);
}

function drawTextAttrs(bytes: Uint8Array): number {
  return u32(bytes, firstCommandOffset(bytes) + 36);
}

function textRunField(bytes: Uint8Array, segmentIndex: number, fieldOffset: number): number {
  const blobsBytesOffset = u32(bytes, 52);
  return u32(bytes, blobsBytesOffset + 4 + segmentIndex * 28 + fieldOffset);
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
    name: "v1" | "v2" | "v3";
    create: typeof createDrawlistBuilderV1;
  }>
> = [
  { name: "v1", create: createDrawlistBuilderV1 },
  { name: "v2", create: createDrawlistBuilderV2 },
  { name: "v3", create: createDrawlistBuilderV3 },
];

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
  create: typeof createDrawlistBuilderV1,
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
  create: typeof createDrawlistBuilderV1,
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
        fg: { r: 10, g: 20, b: 30 },
        bg: { r: 40, g: 50, b: 60 },
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
        fg: { r: 1, g: 2, b: 3 },
        bg: { r: 4, g: 5, b: 6 },
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
