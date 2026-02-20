import { assert, assertBytesEqual, describe, readFixture, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV3, ui } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { DEFAULT_TERMINAL_PROFILE, type TerminalProfile } from "../../terminalProfile.js";

const OP_DRAW_TEXT = 3;
const OP_DRAW_TEXT_RUN = 6;
const OP_DRAW_CANVAS = 8;
const OP_DRAW_IMAGE = 9;

function u16(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint16(off, true);
}

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
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

function decodeStyleV3(
  reserved: number,
  underlineColorRgb: number,
): Readonly<{
  underlineStyle: number;
  underlineColorRgb: number;
}> {
  return Object.freeze({
    underlineStyle: reserved & 0x7,
    underlineColorRgb,
  });
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

  const builder = createDrawlistBuilderV3();
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

async function load(rel: string): Promise<Uint8Array> {
  return readFixture(`zrdl-v3/widgets/${rel}`);
}

describe("graphics/widgets/style (locked) - zrdl-v3 golden fixtures", () => {
  test("link_docs.bin", async () => {
    const expected = await load("link_docs.bin");
    const actual = renderBytes(
      ui.link({
        id: "docs-link",
        url: "https://example.com/docs",
        label: "Rezi Docs",
        style: { underline: true, underlineStyle: "straight" },
      }),
      { cols: 80, rows: 8 },
    );
    assertBytesEqual(actual, expected, "link_docs.bin");
    const payloadOff = findCommandPayload(actual, OP_DRAW_TEXT);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    assert.equal(u32(actual, payloadOff + 40) > 0, true);
    assert.equal(u32(actual, payloadOff + 44) > 0, true);
  });

  test("canvas_primitives.bin", async () => {
    const expected = await load("canvas_primitives.bin");
    const actual = renderBytes(
      ui.canvas({
        width: 18,
        height: 6,
        blitter: "braille",
        draw: (ctx) => {
          ctx.clear("#101820");
          ctx.line(0, 0, ctx.width - 1, ctx.height - 1, "#ffffff");
          ctx.fillRect(3, 2, 4, 3, "#ff5a5f");
          ctx.strokeRect(8, 1, 6, 4, "#00ffaa");
          ctx.text(4, 3, "A", "#ffd166");
        },
      }),
      { cols: 40, rows: 10 },
    );
    assertBytesEqual(actual, expected, "canvas_primitives.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_CANVAS), true);
    const textPayloadOff = findCommandPayload(actual, OP_DRAW_TEXT);
    assert.equal(textPayloadOff !== null, true);
    if (textPayloadOff === null) return;
    assert.equal(u32(actual, textPayloadOff + 20), packRgb(0xff, 0xd1, 0x66));
  });

  test("image_png_contain.bin", async () => {
    const expected = await load("image_png_contain.bin");
    const actual = renderBytes(
      ui.image({
        src: makePngHeader(2, 1),
        width: 12,
        height: 5,
        fit: "contain",
        alt: "logo",
      }),
      { cols: 40, rows: 10 },
      ITERM2_TERMINAL_PROFILE,
    );
    assertBytesEqual(actual, expected, "image_png_contain.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_IMAGE), true);
  });

  test("image_rgba_sixel_cover.bin", async () => {
    const expected = await load("image_rgba_sixel_cover.bin");
    const actual = renderBytes(
      ui.image({
        src: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
        width: 12,
        height: 5,
        protocol: "sixel",
        fit: "cover",
        zLayer: -1,
        imageId: 0x0102_0304,
        alt: "raw",
      }),
      { cols: 40, rows: 10 },
    );
    assertBytesEqual(actual, expected, "image_rgba_sixel_cover.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_IMAGE), true);
  });

  test("line_chart.bin", async () => {
    const expected = await load("line_chart.bin");
    const actual = renderBytes(
      ui.lineChart({
        width: 30,
        height: 8,
        series: [
          { label: "cpu", color: "#4ecdc4", data: [1, 3, 2, 5, 4, 6] },
          { label: "mem", color: "#ff6b6b", data: [2, 2, 3, 3, 4, 4] },
        ],
        showLegend: true,
        axes: { y: { min: 0, max: 6 } },
      }),
      { cols: 50, rows: 14 },
    );
    assertBytesEqual(actual, expected, "line_chart.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_CANVAS), true);
  });

  test("scatter_plot.bin", async () => {
    const expected = await load("scatter_plot.bin");
    const actual = renderBytes(
      ui.scatter({
        width: 30,
        height: 8,
        points: [
          { x: 0, y: 0, color: "#ffd166" },
          { x: 3, y: 4 },
          { x: 8, y: 2, color: "#06d6a0" },
          { x: 10, y: 6, color: "#ef476f" },
        ],
        axes: { x: { min: 0, max: 10 }, y: { min: 0, max: 6 } },
        color: "#4ecdc4",
      }),
      { cols: 50, rows: 14 },
    );
    assertBytesEqual(actual, expected, "scatter_plot.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_CANVAS), true);
  });

  test("heatmap_plasma.bin", async () => {
    const expected = await load("heatmap_plasma.bin");
    const actual = renderBytes(
      ui.heatmap({
        width: 24,
        height: 8,
        data: [
          [0, 0.25, 0.5, 0.75],
          [0.1, 0.4, 0.7, 1.0],
        ],
        colorScale: "plasma",
        min: 0,
        max: 1,
      }),
      { cols: 50, rows: 14 },
    );
    assertBytesEqual(actual, expected, "heatmap_plasma.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_CANVAS), true);
  });

  test("sparkline_highres.bin", async () => {
    const expected = await load("sparkline_highres.bin");
    const actual = renderBytes(
      ui.sparkline([1, 4, 2, 6, 3, 5], { highRes: true, width: 12, blitter: "quadrant" }),
      { cols: 30, rows: 8 },
    );
    assertBytesEqual(actual, expected, "sparkline_highres.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_CANVAS), true);
  });

  test("barchart_highres.bin", async () => {
    const expected = await load("barchart_highres.bin");
    const actual = renderBytes(
      ui.barChart(
        [
          { label: "A", value: 2 },
          { label: "B", value: 5 },
          { label: "C", value: 3 },
        ],
        {
          highRes: true,
          orientation: "horizontal",
          maxBarLength: 12,
          showLabels: true,
          showValues: true,
          blitter: "braille",
        },
      ),
      { cols: 40, rows: 12 },
    );
    assertBytesEqual(actual, expected, "barchart_highres.bin");
    assert.equal(parseOpcodes(actual).includes(OP_DRAW_CANVAS), true);
  });

  test("richtext_underline_ext.bin", async () => {
    const expected = await load("richtext_underline_ext.bin");
    const actual = renderBytes(
      ui.richText([
        {
          text: "err",
          style: {
            bold: true,
            underline: true,
            underlineStyle: "curly",
            underlineColor: "#ff3366",
          },
        },
        { text: " -> " },
        {
          text: "warn",
          style: {
            underlineStyle: "dashed",
            underlineColor: { r: 0, g: 170, b: 255 },
          },
        },
      ]),
      { cols: 40, rows: 8 },
    );
    assertBytesEqual(actual, expected, "richtext_underline_ext.bin");

    const payloadOff = findCommandPayload(actual, OP_DRAW_TEXT_RUN);
    assert.equal(payloadOff !== null, true);
    if (payloadOff === null) return;
    const blobIndex = u32(actual, payloadOff + 8);
    const blobsSpanOffset = u32(actual, 44);
    const blobsBytesOffset = u32(actual, 52);
    const blobByteOff = u32(actual, blobsSpanOffset + blobIndex * 8);
    const firstSegmentReserved = u32(actual, blobsBytesOffset + blobByteOff + 4 + 12);
    const firstSegmentUnderlineRgb = u32(actual, blobsBytesOffset + blobByteOff + 4 + 16);
    const thirdSegmentReserved = u32(actual, blobsBytesOffset + blobByteOff + 4 + 12 + 40 * 2);
    const thirdSegmentUnderlineRgb = u32(actual, blobsBytesOffset + blobByteOff + 4 + 16 + 40 * 2);
    const firstDecoded = decodeStyleV3(firstSegmentReserved, firstSegmentUnderlineRgb);
    const thirdDecoded = decodeStyleV3(thirdSegmentReserved, thirdSegmentUnderlineRgb);
    assert.deepEqual(firstDecoded, {
      underlineStyle: 3,
      underlineColorRgb: 0xff3366,
    });
    assert.deepEqual(thirdDecoded, {
      underlineStyle: 5,
      underlineColorRgb: 0x00aaff,
    });
  });
});
