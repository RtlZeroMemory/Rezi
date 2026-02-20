import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuilderV1, VNode } from "../../index.js";
import { createDrawlistBuilderV1, createDrawlistBuilderV3 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
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

function blobLength(bytes: Uint8Array, blobIndex: number): number {
  const spanOffset = u32(bytes, 44);
  const blobsCount = u32(bytes, 48);
  assert.equal(blobIndex >= 0 && blobIndex < blobsCount, true);
  return u32(bytes, spanOffset + blobIndex * 8 + 4);
}

function blobBytes(bytes: Uint8Array, blobIndex: number): Uint8Array {
  const spanOffset = u32(bytes, 44);
  const blobsCount = u32(bytes, 48);
  const blobsBytesOffset = u32(bytes, 52);
  const blobsBytesLen = u32(bytes, 56);
  assert.equal(blobIndex >= 0 && blobIndex < blobsCount, true);
  const blobOff = u32(bytes, spanOffset + blobIndex * 8);
  const blobLen = u32(bytes, spanOffset + blobIndex * 8 + 4);
  const start = blobsBytesOffset + blobOff;
  const end = start + blobLen;
  assert.equal(end <= blobsBytesOffset + blobsBytesLen, true);
  return bytes.subarray(start, end);
}

function packRgb(r: number, g: number, b: number): number {
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function renderBytes(
  vnode: VNode,
  createBuilder: () => DrawlistBuilderV1,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 80, rows: 30 },
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
  });
  const built = builder.build();
  assert.equal(built.ok, true);
  if (!built.ok) throw new Error("build failed");
  return built.bytes;
}

describe("graphics widgets", () => {
  test("link emits SET_LINK in v3 and degrades to text in v1", () => {
    const vnode = ui.link({ url: "https://example.com", label: "Docs", id: "docs-link" });
    const v3 = renderBytes(vnode, () => createDrawlistBuilderV3());
    const v1 = renderBytes(vnode, () => createDrawlistBuilderV1());
    assert.equal(parseOpcodes(v3).includes(8), true);
    assert.equal(parseOpcodes(v1).includes(8), false);
    assert.equal(parseStrings(v3).includes("Docs"), true);
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
    assert.equal(parseOpcodes(bytes).includes(9), true);
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

  test("canvas auto blitter resolves to braille and blob size matches subcell resolution", () => {
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
    const payloadOff = findCommandPayload(bytes, 9);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    const blobIndex = u32(bytes, payloadOff + 16);
    const blitterCode = u8(bytes, payloadOff + 20);
    assert.equal(blitterCode, 1);
    assert.equal(blobLength(bytes, blobIndex), width * 2 * height * 4 * 4);
  });

  test("image route detects PNG format for DRAW_IMAGE", () => {
    const pngLike = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const bytes = renderBytes(
      ui.image({ src: pngLike, width: 10, height: 4, fit: "contain" }),
      () => createDrawlistBuilderV3(),
    );
    const payloadOff = findCommandPayload(bytes, 10);
    assert.equal(payloadOff !== null, true);
    if (payloadOff !== null) {
      const format = u8(bytes, payloadOff + 20);
      assert.equal(format, 1);
    }
  });

  test("image forwards protocol/fit/z-layer/imageId fields to DRAW_IMAGE", () => {
    const src = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 8, 9, 10]);
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
    const payloadOff = findCommandPayload(bytes, 10);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u8(bytes, payloadOff + 21), 2);
    assert.equal(u8(bytes, payloadOff + 22), 2);
    assert.equal(u8(bytes, payloadOff + 23), 0);
    assert.equal(u32(bytes, payloadOff + 24), 0x0102_0304);
  });

  test("image defaults protocol/fit/z-layer/imageId when omitted", () => {
    const src = new Uint8Array([1, 2, 3, 4]);
    const bytes = renderBytes(ui.image({ src, width: 10, height: 4 }), () =>
      createDrawlistBuilderV3(),
    );
    const payloadOff = findCommandPayload(bytes, 10);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u8(bytes, payloadOff + 20), 0);
    assert.equal(u8(bytes, payloadOff + 21), 0);
    assert.equal(u8(bytes, payloadOff + 22), 1);
    assert.equal(u8(bytes, payloadOff + 23), 1);
    assert.equal(u32(bytes, payloadOff + 24), hashImageBytes(src));
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
    assert.equal(parseOpcodes(bytes).includes(10), false);
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
    const canvasCount = parseOpcodes(bytes).filter((opcode) => opcode === 9).length;
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
    const canvasCount = parseOpcodes(bytes).filter((opcode) => opcode === 9).length;
    assert.equal(canvasCount >= 2, true);
  });

  test("sparkline highRes draws pixels for single-point series", () => {
    const bytes = renderBytes(
      ui.sparkline([5], { width: 6, min: 0, max: 10, highRes: true }),
      () => createDrawlistBuilderV3(),
      { cols: 10, rows: 4 },
    );
    const payloadOff = findCommandPayload(bytes, 9);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    const blobIndex = u32(bytes, payloadOff + 16);
    const rgba = blobBytes(bytes, blobIndex);
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
    const payloadOff = findCommandPayload(bytes, 9);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u8(bytes, payloadOff + 20), 3);
  });
});
