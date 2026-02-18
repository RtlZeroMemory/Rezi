import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { ui } from "../ui.js";

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

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);

  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table in bounds");

  const decoder = new TextDecoder();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const strOff = u32(bytes, span);
    const strLen = u32(bytes, span + 4);
    const start = bytesOffset + strOff;
    const end = start + strLen;
    assert.ok(end <= tableEnd, "string span in bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }

  return Object.freeze(out);
}

function renderBytes(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 64, rows: 20 },
): Uint8Array {
  const allocator = createInstanceIdAllocator(1);
  const committed = commitVNodeTree(null, vnode, { allocator });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return new Uint8Array();

  const layoutRes = layout(
    committed.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return new Uint8Array();

  const builder = createDrawlistBuilderV1();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
  });
  const built = builder.build();
  assert.equal(built.ok, true, "drawlist should build");
  if (!built.ok) return new Uint8Array();
  return built.bytes;
}

describe("basic widgets render to drawlist", () => {
  test("richText uses DRAW_TEXT_RUN and interns span strings", () => {
    const bytes = renderBytes(
      ui.richText([
        { text: "const ", style: { fg: { r: 90, g: 160, b: 255 } } },
        { text: "x", style: { bold: true } },
      ]),
    );
    const opcodes = parseOpcodes(bytes);
    const strings = parseInternedStrings(bytes);
    assert.equal(opcodes.includes(6), true, "should include DRAW_TEXT_RUN");
    assert.equal(strings.includes("const "), true);
    assert.equal(strings.includes("x"), true);
  });

  test("badge, spinner, icon, kbd, status, tag render expected text fragments", () => {
    const vnode = ui.column({ gap: 1 }, [
      ui.badge("Live", { variant: "success" }),
      ui.spinner({ variant: "line", label: "Loading" }),
      ui.icon("status.check"),
      ui.icon("ui.pause"),
      ui.kbd(["Ctrl", "S"]),
      ui.status("online", { label: "Ready" }),
      ui.tag("beta", { removable: true }),
    ]);
    const strings = parseInternedStrings(renderBytes(vnode));
    assert.equal(
      strings.some((s) => s.includes("Live")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("Loading")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("✓")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("||")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("⏸")),
      false,
    );
    assert.equal(strings.includes("Ctrl"), true);
    assert.equal(
      strings.some((s) => s.includes("Ready")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("beta")),
      true,
    );
  });

  test("progress and gauge render bars and percentages", () => {
    const vnode = ui.column({ gap: 1 }, [
      ui.progress(0.6, { label: "Build", showPercent: true, width: 10 }),
      ui.gauge(0.42, { label: "CPU", variant: "compact" }),
    ]);
    const strings = parseInternedStrings(renderBytes(vnode));
    assert.equal(
      strings.some((s) => s.includes("Build")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("%")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("CPU")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("▓") || s.includes("█")),
      true,
    );
  });

  test("slider renders track and clamps displayed value to range", () => {
    const strings = parseInternedStrings(
      renderBytes(
        ui.slider({
          id: "slider",
          label: "Volume",
          value: 999,
          min: 0,
          max: 10,
          step: 2,
          showValue: true,
          width: 8,
        }),
      ),
    );
    assert.equal(
      strings.some((s) => s.includes("Volume")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("10")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("●")),
      true,
    );
  });

  test("skeleton emits placeholder glyphs", () => {
    const strings = parseInternedStrings(renderBytes(ui.skeleton(8, { variant: "rect" })));
    assert.equal(
      strings.some((s) => s.includes("░") || s.includes("▒")),
      true,
    );
  });

  test("skeleton width 0 renders no skeleton glyphs", () => {
    const strings = parseInternedStrings(renderBytes(ui.skeleton(0, { variant: "rect" })));
    assert.equal(
      strings.some((s) => s.includes("░") || s.includes("▒")),
      false,
    );
  });

  test("empty, errorDisplay, callout render expected labels", () => {
    const vnode = ui.column({ gap: 1 }, [
      ui.empty("No Data", {
        icon: "status.info",
        description: "Nothing to show",
      }),
      ui.errorDisplay("Operation failed", {
        title: "Network Error",
        stack: "line1\nline2",
        showStack: true,
      }),
      ui.callout("Check configuration", {
        variant: "warning",
        title: "Warning",
      }),
    ]);
    const strings = parseInternedStrings(renderBytes(vnode, { cols: 80, rows: 25 }));
    assert.equal(
      strings.some((s) => s.includes("No Data")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("Nothing to show")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("Network Error")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("Operation failed")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("Warning")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("Check configuration")),
      true,
    );
  });

  test("sparkline, barChart, miniChart render chart glyphs and labels", () => {
    const vnode = ui.column({ gap: 1 }, [
      ui.sparkline([1, 3, 2, 5, 4, 2, 1], { width: 7 }),
      ui.barChart([
        { label: "A", value: 2 },
        { label: "B", value: 4, variant: "warning" },
      ]),
      ui.miniChart([
        { label: "CPU", value: 40, max: 100 },
        { label: "MEM", value: 70, max: 100 },
      ]),
    ]);
    const strings = parseInternedStrings(renderBytes(vnode, { cols: 80, rows: 20 }));
    assert.equal(
      strings.some((s) => /[▁▂▃▄▅▆▇█]/.test(s)),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("A") || s.includes("B")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("CPU") || s.includes("MEM")),
      true,
    );
    assert.equal(
      strings.some((s) => s.includes("%")),
      true,
    );
  });

  test("tag emits fill rect for pill background", () => {
    const opcodes = parseOpcodes(renderBytes(ui.tag("beta")));
    assert.equal(opcodes.includes(2), true, "should include FILL_RECT");
  });

  test("vertical barChart respects maxBarLength", () => {
    const bytes = renderBytes(
      ui.barChart([{ label: "A", value: 10 }], {
        orientation: "vertical",
        showLabels: false,
        showValues: false,
        maxBarLength: 1,
      }),
      { cols: 3, rows: 8 },
    );
    const opcodes = parseOpcodes(bytes);
    const drawTextCount = opcodes.filter((op) => op === 3).length;
    assert.equal(drawTextCount <= 3, true, "maxBarLength should cap vertical bar draw calls");
  });
});
