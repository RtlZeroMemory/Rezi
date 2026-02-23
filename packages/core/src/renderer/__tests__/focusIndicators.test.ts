import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { DrawlistBuildResult, DrawlistBuilderV1, TextStyle, VNode } from "../../index.js";
import { ui } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import type { Theme } from "../../theme/theme.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

type DrawOp =
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>
  | Readonly<{ kind: "clear" }>;

type DrawTextOp = Readonly<{ x: number; y: number; text: string; style?: TextStyle }>;

class RecordingBuilder implements DrawlistBuilderV1 {
  readonly ops: DrawOp[] = [];

  clear(): void {
    this.ops.push({ kind: "clear" });
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    this.ops.push({ kind: "clearTo", cols, rows, ...(style ? { style } : {}) });
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    this.ops.push({ kind: "fillRect", x, y, w, h, ...(style ? { style } : {}) });
  }

  drawText(x: number, y: number, text: string, style?: TextStyle): void {
    this.ops.push({ kind: "drawText", x, y, text, ...(style ? { style } : {}) });
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this.ops.push({ kind: "pushClip", x, y, w, h });
  }

  popClip(): void {
    this.ops.push({ kind: "popClip" });
  }

  addBlob(_bytes: Uint8Array): number | null {
    return null;
  }

  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    return null;
  }

  drawTextRun(_x: number, _y: number, _blobIndex: number): void {}

  build(): DrawlistBuildResult {
    return { ok: true, bytes: new Uint8Array() };
  }

  reset(): void {
    this.ops.length = 0;
  }
}

function renderOps(
  vnode: VNode,
  focusedId: string | null,
  theme: Theme,
  viewport: Readonly<{ cols: number; rows: number }> = Object.freeze({ cols: 80, rows: 24 }),
): readonly DrawOp[] {
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return Object.freeze([]);

  const layoutRes = layout(
    committed.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return Object.freeze([]);

  const builder = new RecordingBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    theme,
    focusState: Object.freeze({ focusedId }),
    pressedId: null,
    builder,
  });
  return Object.freeze(builder.ops.slice());
}

function drawTextOps(ops: readonly DrawOp[]): readonly DrawTextOp[] {
  const out: DrawTextOp[] = [];
  for (const op of ops) {
    if (op.kind !== "drawText") continue;
    out.push({ x: op.x, y: op.y, text: op.text, ...(op.style ? { style: op.style } : {}) });
  }
  return Object.freeze(out);
}

function findDrawTextByToken(ops: readonly DrawTextOp[], token: string): DrawTextOp | null {
  for (const op of ops) {
    if (op.text.includes(token)) return op;
  }
  return null;
}

describe("focus indicator rendering contracts", () => {
  test("interactive widgets render focus indicators when focused", () => {
    const legacy = defaultTheme;
    const cases = Object.freeze([
      {
        name: "checkbox",
        vnode: ui.checkbox({ id: "cb", checked: false, label: "Choice" }),
        focusedId: "cb",
        token: "[ ]",
        expectUnderline: true,
      },
      {
        name: "radioGroup",
        vnode: ui.radioGroup({
          id: "rg",
          value: "a",
          options: Object.freeze([
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ]),
        }),
        focusedId: "rg",
        token: "(o)",
        expectUnderline: true,
      },
      {
        name: "select",
        vnode: ui.select({
          id: "sel",
          value: "one",
          options: Object.freeze([{ value: "one", label: "One" }]),
        }),
        focusedId: "sel",
        token: "One",
        expectUnderline: true,
      },
      {
        name: "slider",
        vnode: ui.slider({ id: "sld", value: 50, min: 0, max: 100 }),
        focusedId: "sld",
        token: "●",
        expectUnderline: true,
      },
      {
        name: "link",
        vnode: ui.link({ id: "lnk", url: "https://example.com" }),
        focusedId: "lnk",
        token: "example.com",
        expectUnderline: true,
      },
      {
        name: "virtualList",
        vnode: ui.virtualList({
          id: "vl",
          items: Object.freeze(["alpha"]),
          renderItem: (item) => ui.text(item),
        }),
        focusedId: "vl",
        token: "alpha",
        expectUnderline: true,
      },
      {
        name: "table",
        vnode: ui.table({
          id: "tbl",
          columns: Object.freeze([{ key: "name", header: "Name" }]),
          data: Object.freeze([{ id: "1", name: "alpha" }]),
          getRowKey: (row) => row.id,
        }),
        focusedId: "tbl",
        token: "alpha",
        expectUnderline: true,
      },
    ]);

    for (const c of cases) {
      const focusedOps = drawTextOps(renderOps(c.vnode, c.focusedId, legacy));
      const focusedOp = findDrawTextByToken(focusedOps, c.token);
      assert.ok(focusedOp !== null, `${c.name}: expected focused draw op`);
      if (!focusedOp) continue;
      assert.equal(focusedOp.style?.bold === true, true, `${c.name}: bold focus`);
      if (c.expectUnderline) {
        assert.equal(focusedOp.style?.underline === true, true, `${c.name}: underline focus`);
      }
    }

    const codeEditor = ui.codeEditor({
      id: "ce",
      lines: Object.freeze(["alpha"]),
      cursor: Object.freeze({ line: 0, column: 0 }),
      selection: null,
      scrollTop: 0,
      scrollLeft: 0,
      onChange: () => {},
      onSelectionChange: () => {},
      onScroll: () => {},
    });
    const focusedEditorOps = drawTextOps(renderOps(codeEditor, "ce", legacy));
    const unfocusedEditorOps = drawTextOps(renderOps(codeEditor, null, legacy));
    const cursorCell = focusedEditorOps.find((op) => op.text === "a" && op.style?.bold === true);
    assert.ok(
      cursorCell !== undefined,
      "codeEditor: highlighted focused cursor cell should render",
    );
    assert.equal(
      focusedEditorOps.length > unfocusedEditorOps.length,
      true,
      "codeEditor: focused rendering should add cursor-cell overlay",
    );
  });

  test("dark theme focus uses focus.ring color", () => {
    const theme = coerceToLegacyTheme(darkTheme);
    const textOps = drawTextOps(
      renderOps(ui.link({ id: "lnk", url: "https://example.com" }), "lnk", theme),
    );
    const op = findDrawTextByToken(textOps, "example.com");
    assert.ok(op !== null, "focused link should render");
    if (!op?.style?.fg || typeof op.style.fg === "string") return;
    assert.deepEqual(op.style.fg, darkTheme.colors.focus.ring);
  });

  test("legacy theme falls back to underline + bold focus", () => {
    const focusedOps = drawTextOps(
      renderOps(ui.checkbox({ id: "cb", checked: false, label: "Legacy" }), "cb", defaultTheme),
    );
    const unfocusedOps = drawTextOps(
      renderOps(ui.checkbox({ id: "cb", checked: false, label: "Legacy" }), null, defaultTheme),
    );
    const focusedOp = findDrawTextByToken(focusedOps, "[ ]");
    const unfocusedOp = findDrawTextByToken(unfocusedOps, "[ ]");
    assert.ok(focusedOp !== null, "focused checkbox should render");
    assert.ok(unfocusedOp !== null, "unfocused checkbox should render");
    if (!focusedOp?.style?.fg || typeof focusedOp.style.fg === "string") return;
    if (!unfocusedOp?.style?.fg || typeof unfocusedOp.style.fg === "string") return;
    assert.equal(focusedOp.style.bold, true);
    assert.equal(focusedOp.style.underline, true);
    assert.deepEqual(focusedOp.style.fg, unfocusedOp.style.fg);
  });

  test("disabled focused widgets do not render focus indicators", () => {
    const textOps = drawTextOps(
      renderOps(
        ui.checkbox({ id: "cb", checked: false, label: "Disabled", disabled: true }),
        "cb",
        defaultTheme,
      ),
    );
    const op = findDrawTextByToken(textOps, "[ ]");
    assert.ok(op !== null, "disabled checkbox should render");
    assert.equal(op?.style?.bold === true, false);
    assert.equal(op?.style?.underline === true, false);
  });

  test("checkbox focusConfig indicator:none suppresses focus styling", () => {
    const textOps = drawTextOps(
      renderOps(
        ui.checkbox({
          id: "cb-none",
          checked: false,
          label: "No focus",
          focusConfig: Object.freeze({ indicator: "none" }),
        }),
        "cb-none",
        defaultTheme,
      ),
    );
    const op = findDrawTextByToken(textOps, "[ ]");
    assert.ok(op !== null, "checkbox should render");
    assert.equal(op?.style?.bold === true, false);
    assert.equal(op?.style?.underline === true, false);
  });

  test("slider focusConfig indicator:none suppresses focus styling", () => {
    const focusedDefault = drawTextOps(
      renderOps(
        ui.slider({
          id: "sld-default",
          value: 50,
          min: 0,
          max: 100,
        }),
        "sld-default",
        defaultTheme,
      ),
    );
    const focusedNone = drawTextOps(
      renderOps(
        ui.slider({
          id: "sld-none",
          value: 50,
          min: 0,
          max: 100,
          focusConfig: Object.freeze({ indicator: "none" }),
        }),
        "sld-none",
        defaultTheme,
      ),
    );
    const defaultOp = findDrawTextByToken(focusedDefault, "●");
    const noneOp = findDrawTextByToken(focusedNone, "●");
    assert.ok(defaultOp !== null, "default focused slider should render");
    assert.ok(noneOp !== null, "focusConfig:none slider should render");
    assert.equal(defaultOp?.style?.underline === true, true);
    assert.equal(noneOp?.style?.underline === true, false);
  });

  test("FocusConfig.style overrides design-system focus defaults", () => {
    const customRing = Object.freeze({ r: 255, g: 0, b: 128 });
    const theme = coerceToLegacyTheme(darkTheme);
    const textOps = drawTextOps(
      renderOps(
        ui.table({
          id: "tbl",
          columns: Object.freeze([{ key: "name", header: "Name" }]),
          data: Object.freeze([{ id: "1", name: "alpha" }]),
          getRowKey: (row) => row.id,
          focusConfig: Object.freeze({ style: Object.freeze({ fg: customRing }) }),
        }),
        "tbl",
        theme,
      ),
    );
    const op = findDrawTextByToken(textOps, "alpha");
    assert.ok(op !== null, "focused table row should render");
    if (!op?.style?.fg || typeof op.style.fg === "string") return;
    assert.deepEqual(op.style.fg, customRing);
  });
});
