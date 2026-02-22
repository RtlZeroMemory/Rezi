import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type DrawlistBuilderV1,
  type Theme,
  type VNode,
  createDrawlistBuilderV1,
  createDrawlistBuilderV3,
  createTheme,
} from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
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

type DrawTextCommand = Readonly<{
  text: string;
  fg: number;
  bg: number;
  attrs: number;
  underlineStyle: number;
  underlineColorRgb: number;
  linkUriRef: number;
  linkIdRef: number;
}>;

function parseDrawTextCommands(bytes: Uint8Array): readonly DrawTextCommand[] {
  const strings = parseInternedStrings(bytes);
  const cmdOffset = u32(bytes, 16);
  const cmdBytes = u32(bytes, 20);
  const end = cmdOffset + cmdBytes;

  const out: DrawTextCommand[] = [];
  let off = cmdOffset;
  while (off < end) {
    const opcode = u16(bytes, off);
    const size = u32(bytes, off + 4);
    if (opcode === 3 && size >= 48) {
      const stringIndex = u32(bytes, off + 16);
      const isV3 = size >= 60;
      const reserved = u32(bytes, off + 40);
      out.push({
        text: strings[stringIndex] ?? "",
        fg: u32(bytes, off + 28),
        bg: u32(bytes, off + 32),
        attrs: u32(bytes, off + 36),
        underlineStyle: reserved & 0x7,
        underlineColorRgb: isV3 ? u32(bytes, off + 44) : 0,
        linkUriRef: isV3 ? u32(bytes, off + 48) : 0,
        linkIdRef: isV3 ? u32(bytes, off + 52) : 0,
      });
    }
    off += size;
  }
  return Object.freeze(out);
}

function packRgb(color: Readonly<{ r: number; g: number; b: number }>): number {
  return ((color.r & 0xff) << 16) | ((color.g & 0xff) << 8) | (color.b & 0xff);
}

const ATTR_BOLD = 1 << 0;
const ATTR_UNDERLINE = 1 << 2;

function renderBytes(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 64, rows: 20 },
  opts: Readonly<{
    focusedId?: string | null;
    theme?: Theme;
    focusAnnouncement?: string | null;
  }> = {},
): Uint8Array {
  return renderBytesWithBuilder(vnode, () => createDrawlistBuilderV1(), viewport, opts);
}

function renderBytesV3(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 64, rows: 20 },
  opts: Readonly<{
    focusedId?: string | null;
    theme?: Theme;
    focusAnnouncement?: string | null;
  }> = {},
): Uint8Array {
  return renderBytesWithBuilder(vnode, () => createDrawlistBuilderV3(), viewport, opts);
}

function renderBytesWithBuilder(
  vnode: VNode,
  createBuilder: () => DrawlistBuilderV1,
  viewport: Readonly<{ cols: number; rows: number }>,
  opts: Readonly<{
    focusedId?: string | null;
    theme?: Theme;
    focusAnnouncement?: string | null;
  }> = {},
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

  const builder = createBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: opts.focusedId ?? null }),
    builder,
    ...(opts.theme ? { theme: opts.theme } : {}),
    ...(opts.focusAnnouncement !== undefined ? { focusAnnouncement: opts.focusAnnouncement } : {}),
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

  test("focusAnnouncer renders focus summary and empty fallback", () => {
    const announced = parseInternedStrings(
      renderBytes(
        ui.focusAnnouncer({ emptyText: "No focus" }),
        { cols: 40, rows: 4 },
        {
          focusAnnouncement: "Email input — Required — Invalid format",
        },
      ),
    );
    assert.equal(announced.includes("Email input — Required — Invalid format"), true);

    const fallback = parseInternedStrings(
      renderBytes(ui.focusAnnouncer({ emptyText: "No focus" }), { cols: 40, rows: 4 }, {}),
    );
    assert.equal(fallback.includes("No focus"), true);
  });

  test("input renders placeholder text when value is empty", () => {
    const strings = parseInternedStrings(
      renderBytes(
        ui.input({
          id: "search",
          value: "",
          placeholder: "Type here...",
        }),
        { cols: 40, rows: 4 },
      ),
    );
    assert.equal(
      strings.some((s) => s.includes("Type here...")),
      true,
    );
  });

  test("design-system button rows keep full labels at md size", () => {
    const tones = ["default", "primary", "danger", "success", "warning"] as const;
    const strings = parseInternedStrings(
      renderBytes(
        ui.row(
          { gap: 2 },
          tones.map((tone) =>
            ui.button({
              id: `btn-${tone}`,
              label: tone,
              dsVariant: "solid",
              dsTone: tone,
              dsSize: "md",
            }),
          ),
        ),
        { cols: 80, rows: 4 },
      ),
    );
    for (const tone of tones) {
      assert.equal(strings.includes(tone), true, `expected full label for ${tone}`);
    }
    assert.equal(
      strings.some((s) => s.includes("…")),
      false,
      "unexpected ellipsis in button labels",
    );
  });

  test("design-system solid button label keeps filled background under text", () => {
    const theme = createTheme(defaultTheme);
    const bytes = renderBytes(
      ui.button({
        id: "scene-tab",
        label: "Buttons",
        dsVariant: "solid",
        dsSize: "sm",
      }),
      { cols: 24, rows: 4 },
      { theme },
    );
    const drawText = parseDrawTextCommands(bytes).find((cmd) => cmd.text === "Buttons");
    assert.ok(drawText, "expected drawText command for button label");
    assert.notEqual(
      drawText.bg,
      packRgb(theme.colors.bg),
      "label background should match filled button surface, not parent background",
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

  test("callout without title keeps full first-line message with icon prefix", () => {
    const message = "12345678901234567890";
    const strings = parseInternedStrings(
      renderBytes(
        ui.callout(message, {
          variant: "info",
          icon: "*",
        }),
        { cols: 80, rows: 8 },
      ),
    );
    assert.equal(
      strings.some((s) => s.includes(`* ${message}`)),
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

  test("link default style uses theme primary + underline", () => {
    const bytes = renderBytes(
      ui.link({ id: "docs-link", url: "https://example.com", label: "Docs" }),
      { cols: 40, rows: 4 },
    );
    const styles = parseDrawTextCommands(bytes);
    const docs = styles.find((style) => style.text === "Docs");
    assert.ok(docs);
    if (!docs) return;
    assert.equal((docs.attrs & ATTR_UNDERLINE) !== 0, true);
    assert.equal((docs.attrs & ATTR_BOLD) !== 0, false);
    assert.equal(docs.fg, packRgb(defaultTheme.colors.primary));
  });

  test("focused link adds bold style", () => {
    const bytes = renderBytes(
      ui.link({ id: "docs-link", url: "https://example.com", label: "Docs" }),
      { cols: 40, rows: 4 },
      { focusedId: "docs-link" },
    );
    const styles = parseDrawTextCommands(bytes);
    const docs = styles.find((style) => style.text === "Docs");
    assert.ok(docs);
    if (!docs) return;
    assert.equal((docs.attrs & ATTR_UNDERLINE) !== 0, true);
    assert.equal((docs.attrs & ATTR_BOLD) !== 0, true);
  });

  test("link underlineColor theme token resolves on v3", () => {
    const theme = createTheme({
      colors: {
        "diagnostic.info": { r: 1, g: 2, b: 3 },
      },
    });
    const bytes = renderBytesV3(
      ui.link({
        id: "docs-link",
        url: "https://example.com",
        label: "Docs",
        style: {
          underline: true,
          underlineStyle: "double",
          underlineColor: "diagnostic.info",
        },
      }),
      { cols: 40, rows: 4 },
      { theme },
    );
    const styles = parseDrawTextCommands(bytes);
    const docs = styles.find((style) => style.text === "Docs");
    assert.ok(docs);
    if (!docs) return;
    assert.equal(docs.underlineColorRgb, 0x010203);
  });

  test("link encodes hyperlink refs on v3 and degrades on v1", () => {
    const v3 = renderBytesV3(ui.link("https://example.com", "Docs"), { cols: 40, rows: 4 });
    const v1 = renderBytes(ui.link("https://example.com", "Docs"), { cols: 40, rows: 4 });
    assert.equal(parseOpcodes(v3).includes(8), false);
    assert.equal(parseOpcodes(v1).includes(8), false);
    assert.equal(parseInternedStrings(v3).includes("https://example.com"), true);
    const v3Docs = parseDrawTextCommands(v3).find((cmd) => cmd.text === "Docs");
    const v1Docs = parseDrawTextCommands(v1).find((cmd) => cmd.text === "Docs");
    assert.equal((v3Docs?.linkUriRef ?? 0) > 0, true);
    assert.equal(v1Docs?.linkUriRef ?? 0, 0);
  });

  test("codeEditor diagnostics use curly underline + token color on v3", () => {
    const theme = createTheme({
      colors: {
        "diagnostic.warning": { r: 1, g: 2, b: 3 },
      },
    });
    const vnode = ui.codeEditor({
      id: "editor",
      lines: ["warn"],
      cursor: { line: 0, column: 0 },
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      lineNumbers: false,
      diagnostics: [{ line: 0, startColumn: 0, endColumn: 4, severity: "warning" }],
      onChange: () => undefined,
      onSelectionChange: () => undefined,
      onScroll: () => undefined,
    });
    const v3 = renderBytesV3(vnode, { cols: 30, rows: 4 }, { theme });
    const v1 = renderBytes(vnode, { cols: 30, rows: 4 }, { theme });

    const v3WarnStyles = parseDrawTextCommands(v3).filter((cmd) => cmd.text === "warn");
    assert.equal(
      v3WarnStyles.some((cmd) => {
        return (
          (cmd.attrs & ATTR_UNDERLINE) !== 0 &&
          cmd.underlineStyle === 3 &&
          cmd.underlineColorRgb === 0x010203
        );
      }),
      true,
    );

    const v1WarnStyles = parseDrawTextCommands(v1).filter((cmd) => cmd.text === "warn");
    assert.equal(
      v1WarnStyles.some((cmd) => (cmd.attrs & ATTR_UNDERLINE) !== 0),
      true,
    );
    assert.equal(
      v1WarnStyles.some(
        (cmd) =>
          cmd.underlineStyle !== 0 ||
          cmd.underlineColorRgb !== 0 ||
          cmd.linkUriRef !== 0 ||
          cmd.linkIdRef !== 0,
      ),
      false,
    );
  });

  test("codeEditor applies syntax token colors for mainstream language presets", () => {
    const theme = createTheme({
      colors: {
        "syntax.keyword": { r: 10, g: 20, b: 30 },
        "syntax.function": { r: 30, g: 40, b: 50 },
        "syntax.string": { r: 60, g: 70, b: 80 },
      },
    });
    const vnode = ui.codeEditor({
      id: "editor",
      lines: ['func greet(name string) { return "ok"; }'],
      cursor: { line: 0, column: 0 },
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      lineNumbers: false,
      syntaxLanguage: "go",
      onChange: () => undefined,
      onSelectionChange: () => undefined,
      onScroll: () => undefined,
    });

    const v3 = renderBytesV3(vnode, { cols: 80, rows: 4 }, { theme });
    const commands = parseDrawTextCommands(v3);
    const keyword = commands.find((cmd) => cmd.text === "func");
    const fn = commands.find((cmd) => cmd.text === "greet");
    const literal = commands.find((cmd) => cmd.text === '"ok"');
    assert.ok(keyword);
    assert.ok(fn);
    assert.ok(literal);
    assert.equal(keyword?.fg, 0x0a141e);
    assert.equal(fn?.fg, 0x1e2832);
    assert.equal(literal?.fg, 0x3c4650);
  });

  test("codeEditor draws a highlighted cursor cell for focused editor", () => {
    const theme = createTheme({
      colors: {
        "syntax.cursor.bg": { r: 1, g: 2, b: 3 },
        "syntax.cursor.fg": { r: 4, g: 5, b: 6 },
      },
    });
    const vnode = ui.codeEditor({
      id: "editor",
      lines: ["abc"],
      cursor: { line: 0, column: 1 },
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      lineNumbers: false,
      syntaxLanguage: "plain",
      onChange: () => undefined,
      onSelectionChange: () => undefined,
      onScroll: () => undefined,
    });

    const v3 = renderBytesV3(vnode, { cols: 20, rows: 4 }, { focusedId: "editor", theme });
    const styles = parseDrawTextCommands(v3);
    const highlightedB = styles.find(
      (cmd) => cmd.text === "b" && cmd.bg === 0x010203 && cmd.fg === 0x040506,
    );
    assert.ok(highlightedB);
  });

  test("canvas emits DRAW_CANVAS opcode with v3 builder", () => {
    const bytes = renderBytesV3(
      ui.canvas({
        width: 20,
        height: 6,
        draw: (ctx) => {
          ctx.line(0, 0, ctx.width - 1, ctx.height - 1, "#ffffff");
        },
      }),
      { cols: 40, rows: 10 },
    );
    const opcodes = parseOpcodes(bytes);
    assert.equal(opcodes.includes(8), true);
  });

  test("image emits DRAW_IMAGE opcode with v3 builder", () => {
    const bytes = renderBytesV3(
      ui.image({
        src: new Uint8Array([0, 0, 0, 0]),
        width: 8,
        height: 4,
        alt: "Logo",
      }),
      { cols: 20, rows: 8 },
    );
    const opcodes = parseOpcodes(bytes);
    assert.equal(opcodes.includes(9), true);
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
