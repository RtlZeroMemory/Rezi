import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuilderV1, VNode } from "../../index.js";
import { createDrawlistBuilderV1, createDrawlistBuilderV3 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { DEFAULT_TERMINAL_PROFILE, type TerminalProfile } from "../../terminalProfile.js";
import { hashImageBytes } from "../image.js";
import { ui } from "../ui.js";

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function u8(bytes: Uint8Array, off: number): number {
  return bytes[off] ?? 0;
}

function i8(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getInt8(off);
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

function parseStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);
  if (count === 0) return Object.freeze([]);
  const tableEnd = bytesOffset + bytesLen;
  const decoder = new TextDecoder();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const off = u32(bytes, spanOffset + i * 8);
    const len = u32(bytes, spanOffset + i * 8 + 4);
    const start = bytesOffset + off;
    const end = start + len;
    assert.equal(end <= tableEnd, true);
    out.push(decoder.decode(bytes.subarray(start, end)));
  }
  return Object.freeze(out);
}

function findCommandPayload(bytes: Uint8Array, opcode: number): number | null {
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;
  let off = cmdOffset;
  while (off < end) {
    const nextOpcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    if (nextOpcode === opcode) return off + 8;
    off += size;
  }
  return null;
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function makePngHeader(width: number, height: number): Uint8Array {
  const out = new Uint8Array(24);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  out.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  out[16] = (width >>> 24) & 0xff;
  out[17] = (width >>> 16) & 0xff;
  out[18] = (width >>> 8) & 0xff;
  out[19] = width & 0xff;
  out[20] = (height >>> 24) & 0xff;
  out[21] = (height >>> 16) & 0xff;
  out[22] = (height >>> 8) & 0xff;
  out[23] = height & 0xff;
  return out;
}

const ITERM2_TERMINAL_PROFILE: TerminalProfile = Object.freeze({
  ...DEFAULT_TERMINAL_PROFILE,
  id: "iterm2",
  supportsIterm2Images: true,
});

function renderBytes(
  vnode: VNode,
  createBuilder: () => DrawlistBuilderV1,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 80, rows: 30 },
  terminalProfile: TerminalProfile | undefined = undefined,
): Uint8Array {
  const allocator = createInstanceIdAllocator(1);
  const committed = commitVNodeTree(null, vnode, { allocator });
  assert.equal(committed.ok, true);
  if (!committed.ok) throw new Error("commit failed");
  const layoutRes = layout(
    committed.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true);
  if (!layoutRes.ok) throw new Error("layout failed");
  const builder = createBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
    terminalProfile,
  });
  const built = builder.build();
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build failed");
  return built.bytes;
}

describe("graphics widgets", () => {
  test("link encodes hyperlink refs in v3 and degrades to text in v1", () => {
    const vnode = ui.link({ url: "https://example.com", label: "Docs", id: "docs-link" });
    const v3 = renderBytes(vnode, () => createDrawlistBuilderV3());
    const v1 = renderBytes(vnode, () => createDrawlistBuilderV1());
    assert.equal(parseOpcodes(v3).includes(8), false);
    assert.equal(parseOpcodes(v1).includes(8), false);
    assert.equal(parseStrings(v3).includes("Docs"), true);
    assert.equal(parseStrings(v1).includes("https://example.com"), false);
    const v3TextPayload = findCommandPayload(v3, 3);
    assert.equal(v3TextPayload !== null, true);
    if (v3TextPayload === null) return;
    assert.equal(u32(v3, v3TextPayload + 40) > 0, true);
  });

  test("canvas emits DRAW_CANVAS", () => {
    const bytes = renderBytes(
      ui.canvas({
        width: 20,
        height: 8,
        draw: (ctx) => {
          ctx.line(0, 0, ctx.width - 1, ctx.height - 1, "#ffffff");
          ctx.fillRect(2, 2, 4, 3, "#ff0000");
        },
      }),
      () => createDrawlistBuilderV3(),
    );
    assert.equal(parseOpcodes(bytes).includes(8), true);
  });

  test("canvas text overlay preserves explicit hex color", () => {
    const bytes = renderBytes(
      ui.canvas({
        width: 10,
        height: 4,
        draw: (ctx) => {
          ctx.text(1, 1, "A", "#ffd166");
        },
      }),
      () => createDrawlistBuilderV3(),
      { cols: 20, rows: 8 },
    );
    const payloadOff = findCommandPayload(bytes, 3);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    const fg = u32(bytes, payloadOff + 20);
    assert.equal(fg, packRgb(0xff, 0xd1, 0x66));
  });

  test("canvas auto blitter resolves to braille and blob span matches payload", () => {
    const width = 4;
    const height = 2;
    const bytes = renderBytes(
      ui.canvas({
        width,
        height,
        blitter: "auto",
        draw: (ctx) => {
          ctx.clear("#112233");
        },
      }),
      () => createDrawlistBuilderV3(),
    );
    const payloadOff = findCommandPayload(bytes, 8);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    const blobOff = u32(bytes, payloadOff + 12);
    const blobLen = u32(bytes, payloadOff + 16);
    const blitterCode = u8(bytes, payloadOff + 20);
    assert.equal(blitterCode, 2);
    assert.equal(blobLen, width * 2 * height * 4 * 4);
    const blobsBytesOffset = u32(bytes, 52);
    const blobsBytesLen = u32(bytes, 56);
    assert.equal(blobOff + blobLen <= blobsBytesLen, true);
    assert.equal(blobsBytesOffset + blobOff + blobLen <= bytes.byteLength, true);
  });

  test("image route detects PNG format for DRAW_IMAGE", () => {
    const pngLike = makePngHeader(2, 1);
    const bytes = renderBytes(
      ui.image({ src: pngLike, width: 10, height: 4, fit: "contain" }),
      () => createDrawlistBuilderV3(),
      { cols: 80, rows: 30 },
      ITERM2_TERMINAL_PROFILE,
    );
    const payloadOff = findCommandPayload(bytes, 9);
    assert.equal(payloadOff !== null, true);
    if (payloadOff !== null) {
      const format = u8(bytes, payloadOff + 24);
      assert.equal(format, 1);
    }
  });

  test("image PNG auto degrades without iTerm2 profile support", () => {
    const pngLike = makePngHeader(2, 1);
    const bytes = renderBytes(
      ui.image({ src: pngLike, width: 10, height: 4, fit: "contain", alt: "Logo" }),
      () => createDrawlistBuilderV3(),
    );
    assert.equal(parseOpcodes(bytes).includes(9), false);
    assert.equal(
      parseStrings(bytes).some((value) => value.includes("Logo")),
      true,
    );
  });

  test("image forwards protocol/fit/z-layer/imageId fields to DRAW_IMAGE", () => {
    const src = new Uint8Array(10 * 4 * 4).fill(255);
    const bytes = renderBytes(
      ui.image({
        src,
        width: 10,
        height: 4,
        protocol: "sixel",
        fit: "cover",
        zLayer: -1,
        imageId: 0x0102_0304,
      }),
      () => createDrawlistBuilderV3(),
    );
    const payloadOff = findCommandPayload(bytes, 9);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u8(bytes, payloadOff + 24), 0);
    assert.equal(u8(bytes, payloadOff + 25), 2);
    assert.equal(i8(bytes, payloadOff + 26), -1);
    assert.equal(u8(bytes, payloadOff + 27), 2);
    assert.equal(u32(bytes, payloadOff + 20), 0x0102_0304);
  });

  test("image defaults protocol/fit/z-layer/imageId when omitted", () => {
    const src = new Uint8Array([1, 2, 3, 4]);
    const bytes = renderBytes(ui.image({ src, width: 10, height: 4 }), () =>
      createDrawlistBuilderV3(),
    );
    const payloadOff = findCommandPayload(bytes, 9);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u8(bytes, payloadOff + 24), 0);
    assert.equal(u8(bytes, payloadOff + 25), 0);
    assert.equal(i8(bytes, payloadOff + 26), 0);
    assert.equal(u8(bytes, payloadOff + 27), 1);
    assert.equal(u32(bytes, payloadOff + 20), hashImageBytes(src));
  });

  test("image protocol=blitter routes RGBA source through DRAW_CANVAS", () => {
    const src = new Uint8Array(2 * 2 * 4).fill(255);
    const bytes = renderBytes(
      ui.image({
        src,
        width: 2,
        height: 2,
        protocol: "blitter",
      }),
      () => createDrawlistBuilderV3(),
    );
    assert.equal(parseOpcodes(bytes).includes(8), true);
    assert.equal(parseOpcodes(bytes).includes(9), false);
    const payloadOff = findCommandPayload(bytes, 8);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u16(bytes, payloadOff + 8), 2);
    assert.equal(u16(bytes, payloadOff + 10), 2);
    assert.equal(u8(bytes, payloadOff + 20), 2);
  });

  test("image protocol=blitter honors explicit source dimensions", () => {
    const src = new Uint8Array(96 * 48 * 4).fill(255);
    const bytes = renderBytes(
      ui.image({
        src,
        width: 58,
        height: 8,
        protocol: "blitter",
        sourceWidth: 96,
        sourceHeight: 48,
      }),
      () => createDrawlistBuilderV3(),
    );
    const payloadOff = findCommandPayload(bytes, 8);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u16(bytes, payloadOff + 8), 96);
    assert.equal(u16(bytes, payloadOff + 10), 48);
  });

  test("image rejects partial explicit source dimensions", () => {
    const src = new Uint8Array(96 * 48 * 4).fill(255);
    const bytes = renderBytes(
      ui.image({
        src,
        width: 58,
        height: 8,
        protocol: "blitter",
        sourceWidth: 96,
      }),
      () => createDrawlistBuilderV3(),
    );
    assert.equal(parseOpcodes(bytes).includes(8), false);
    assert.equal(parseOpcodes(bytes).includes(9), false);
    assert.equal(
      parseStrings(bytes).some((value) => value.includes("sourceWidth/sourceHeight")),
      true,
    );
  });

  test("image protocol=blitter degrades PNG source to placeholder", () => {
    const src = makePngHeader(2, 1);
    const bytes = renderBytes(
      ui.image({
        src,
        width: 10,
        height: 4,
        protocol: "blitter",
        alt: "Logo",
      }),
      () => createDrawlistBuilderV3(),
    );
    assert.equal(parseOpcodes(bytes).includes(8), false);
    assert.equal(parseOpcodes(bytes).includes(9), false);
    assert.equal(
      parseStrings(bytes).some((value) => value.includes("Logo")),
      true,
    );
  });

  test("image degrades to placeholder on v1", () => {
    const bytes = renderBytes(
      ui.image({ src: new Uint8Array([0, 0, 0, 0]), width: 20, height: 4, alt: "Logo" }),
      () => createDrawlistBuilderV1(),
    );
    const strings = parseStrings(bytes);
    assert.equal(
      strings.some((value) => value.includes("Image")),
      true,
    );
    assert.equal(
      strings.some((value) => value.includes("Logo")),
      true,
    );
  });

  test("image invalid source falls back without DRAW_IMAGE", () => {
    const bytes = renderBytes(
      {
        kind: "image",
        props: {
          src: "bad-bytes" as unknown as Uint8Array,
          width: 20,
          height: 4,
          alt: "Broken image",
        },
      },
      () => createDrawlistBuilderV3(),
    );
    assert.equal(parseOpcodes(bytes).includes(9), false);
    assert.equal(
      parseStrings(bytes).some((value) => value.includes("Broken image")),
      true,
    );
  });

  test("lineChart/scatter/heatmap use canvas command in v3", () => {
    const bytes = renderBytes(
      ui.column({}, [
        ui.lineChart({ width: 30, height: 8, series: [{ data: [1, 2, 3], color: "#4ecdc4" }] }),
        ui.scatter({
          width: 30,
          height: 8,
          points: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        }),
        ui.heatmap({
          width: 30,
          height: 8,
          data: [
            [0, 1],
            [0.5, 0.25],
          ],
        }),
      ]),
      () => createDrawlistBuilderV3(),
      { cols: 40, rows: 30 },
    );
    const canvasCount = parseOpcodes(bytes).filter((opcode) => opcode === 8).length;
    assert.equal(canvasCount >= 3, true);
  });

  test("sparkline/barChart highRes emit canvas command in v3", () => {
    const bytes = renderBytes(
      ui.column({}, [
        ui.sparkline([1, 2, 3, 2, 1], { highRes: true }),
        ui.barChart(
          [
            { label: "A", value: 1 },
            { label: "B", value: 2 },
          ],
          { highRes: true },
        ),
      ]),
      () => createDrawlistBuilderV3(),
      { cols: 40, rows: 12 },
    );
    const canvasCount = parseOpcodes(bytes).filter((opcode) => opcode === 8).length;
    assert.equal(canvasCount >= 2, true);
  });

  test("sparkline highRes draws pixels for single-point series", () => {
    const bytes = renderBytes(
      ui.sparkline([5], { width: 6, min: 0, max: 10, highRes: true }),
      () => createDrawlistBuilderV3(),
      { cols: 10, rows: 4 },
    );
    const payloadOff = findCommandPayload(bytes, 8);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    const blobOff = u32(bytes, payloadOff + 12);
    const blobLen = u32(bytes, payloadOff + 16);
    const blobsBytesOffset = u32(bytes, 52);
    const rgba = bytes.subarray(blobsBytesOffset + blobOff, blobsBytesOffset + blobOff + blobLen);
    const hasVisiblePixel = rgba.some((value, index) => index % 4 === 3 && value !== 0);
    assert.equal(hasVisiblePixel, true);
  });

  test("barChart highRes forwards explicit blitter", () => {
    const bytes = renderBytes(
      ui.barChart(
        [
          { label: "A", value: 1 },
          { label: "B", value: 2 },
        ],
        { highRes: true, showLabels: false, showValues: false, blitter: "quadrant" },
      ),
      () => createDrawlistBuilderV3(),
      { cols: 20, rows: 8 },
    );
    const payloadOff = findCommandPayload(bytes, 8);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u8(bytes, payloadOff + 20), 4);
  });
});
