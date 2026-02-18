import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuildResult, DrawlistBuilderV1 } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { TextStyle, VNode } from "../../index.js";
import { ui } from "../../index.js";
import { type LayoutTree, layout } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import { type RuntimeInstance, commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { indexIdRects, indexLayoutRects } from "../renderToDrawlist/indices.js";
import { renderTree } from "../renderToDrawlist/renderTree.js";
import { DEFAULT_BASE_STYLE } from "../renderToDrawlist/textStyle.js";

type Viewport = Readonly<{ cols: number; rows: number }>;
type FocusId = string | null;

type RecordedOp =
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

type DrawTextOp = Extract<RecordedOp, { kind: "drawText" }>;

type Scene = Readonly<{
  tree: RuntimeInstance;
  layout: LayoutTree;
  idRects: ReadonlyMap<string, Rect>;
  viewport: Viewport;
}>;

type OverflowMeta = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

type Framebuffer = Readonly<{
  cols: number;
  rows: number;
  chars: string[];
  styles: string[];
}>;

class RecordingBuilder implements DrawlistBuilderV1 {
  private readonly ops: RecordedOp[] = [];

  getOps(): readonly RecordedOp[] {
    return this.ops.slice();
  }

  clear(): void {}

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
    return { ok: true, bytes: new Uint8Array([0]) };
  }

  reset(): void {}
}

function colorKey(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return `s:${value}`;
  if (typeof value === "object") {
    const rgb = value as { r?: unknown; g?: unknown; b?: unknown };
    if (
      typeof rgb.r === "number" &&
      Number.isFinite(rgb.r) &&
      typeof rgb.g === "number" &&
      Number.isFinite(rgb.g) &&
      typeof rgb.b === "number" &&
      Number.isFinite(rgb.b)
    ) {
      return `rgb:${String(rgb.r)},${String(rgb.g)},${String(rgb.b)}`;
    }
  }
  return "?";
}

function styleKey(style: TextStyle | undefined): string {
  if (!style) return "";
  return [
    style.bold ? "b1" : "b0",
    style.dim ? "d1" : "d0",
    style.italic ? "i1" : "i0",
    style.underline ? "u1" : "u0",
    style.inverse ? "v1" : "v0",
    style.strikethrough ? "s1" : "s0",
    style.overline ? "o1" : "o0",
    style.blink ? "k1" : "k0",
    `fg:${colorKey(style.fg)}`,
    `bg:${colorKey(style.bg)}`,
  ].join("|");
}

function createFramebuffer(viewport: Viewport): Framebuffer {
  const cells = viewport.cols * viewport.rows;
  return {
    cols: viewport.cols,
    rows: viewport.rows,
    chars: new Array(cells).fill(" "),
    styles: new Array(cells).fill(""),
  };
}

function cloneFramebuffer(framebuffer: Framebuffer): Framebuffer {
  return {
    cols: framebuffer.cols,
    rows: framebuffer.rows,
    chars: framebuffer.chars.slice(),
    styles: framebuffer.styles.slice(),
  };
}

function applyOps(framebuffer: Framebuffer, ops: readonly RecordedOp[]): Framebuffer {
  const out = cloneFramebuffer(framebuffer);
  const clipStack: Array<Readonly<{ x: number; y: number; w: number; h: number }>> = [];

  const inViewport = (x: number, y: number): boolean =>
    x >= 0 && x < out.cols && y >= 0 && y < out.rows;

  const inClip = (x: number, y: number): boolean => {
    for (const clip of clipStack) {
      if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
    }
    return true;
  };

  const writeCell = (x: number, y: number, ch: string, style: string): void => {
    if (!inViewport(x, y) || !inClip(x, y)) return;
    const idx = y * out.cols + x;
    out.chars[idx] = ch;
    out.styles[idx] = style;
  };

  const fillViewport = (cols: number, rows: number, style: string): void => {
    const w = Math.min(cols, out.cols);
    const h = Math.min(rows, out.rows);
    for (let y = 0; y < h; y++) {
      const rowOffset = y * out.cols;
      for (let x = 0; x < w; x++) {
        out.chars[rowOffset + x] = " ";
        out.styles[rowOffset + x] = style;
      }
    }
  };

  for (const op of ops) {
    switch (op.kind) {
      case "clearTo":
        fillViewport(op.cols, op.rows, styleKey(op.style));
        break;
      case "fillRect": {
        const key = styleKey(op.style);
        for (let y = op.y; y < op.y + op.h; y++) {
          for (let x = op.x; x < op.x + op.w; x++) {
            writeCell(x, y, " ", key);
          }
        }
        break;
      }
      case "drawText": {
        const key = styleKey(op.style);
        for (let i = 0; i < op.text.length; i++) {
          writeCell(op.x + i, op.y, op.text[i] ?? " ", key);
        }
        break;
      }
      case "pushClip":
        clipStack.push({ x: op.x, y: op.y, w: op.w, h: op.h });
        break;
      case "popClip":
        if (clipStack.length > 0) clipStack.pop();
        break;
    }
  }

  return out;
}

function assertFramebuffersEqual(actual: Framebuffer, expected: Framebuffer): void {
  assert.equal(actual.cols, expected.cols);
  assert.equal(actual.rows, expected.rows);
  assert.equal(actual.chars.length, expected.chars.length);
  assert.equal(actual.styles.length, expected.styles.length);

  for (let i = 0; i < actual.chars.length; i++) {
    assert.equal(actual.chars[i], expected.chars[i], `char mismatch at cell ${String(i)}`);
    assert.equal(actual.styles[i], expected.styles[i], `style mismatch at cell ${String(i)}`);
  }
}

function diffCellIndices(a: Framebuffer, b: Framebuffer): readonly number[] {
  const changed: number[] = [];
  assert.equal(a.cols, b.cols);
  assert.equal(a.rows, b.rows);
  for (let i = 0; i < a.chars.length; i++) {
    if (a.chars[i] !== b.chars[i] || a.styles[i] !== b.styles[i]) {
      changed.push(i);
    }
  }
  return Object.freeze(changed);
}

function assertChangedCellsWithinRect(
  changedCells: readonly number[],
  rect: Rect,
  viewport: Viewport,
): void {
  for (const cellIndex of changedCells) {
    const x = cellIndex % viewport.cols;
    const y = Math.floor(cellIndex / viewport.cols);
    assert.equal(
      x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h,
      true,
      `cell (${String(x)},${String(y)}) must be inside damage rect`,
    );
  }
}

function unionRect(a: Rect, b: Rect): Rect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function buildScene(vnode: VNode, viewport: Viewport): Scene {
  const allocator = createInstanceIdAllocator(1);
  const commitRes = commitVNodeTree(null, vnode, { allocator });
  if (!commitRes.ok) {
    assert.fail(`commit failed: ${commitRes.fatal.code}: ${commitRes.fatal.detail}`);
  }
  const tree = commitRes.value.root;

  const layoutRes = layout(tree.vnode, 0, 0, viewport.cols, viewport.rows, "column");
  if (!layoutRes.ok) {
    assert.fail(`layout failed: ${layoutRes.fatal.code}: ${layoutRes.fatal.detail}`);
  }

  const layoutTree = layoutRes.value;
  const layoutIndex = indexLayoutRects(layoutTree, tree);
  const idRects = indexIdRects(tree, layoutIndex);
  return { tree, layout: layoutTree, idRects, viewport };
}

function focusState(focusedId: FocusId): Readonly<{ focusedId: FocusId }> {
  return Object.freeze({ focusedId });
}

function drawTextOps(ops: readonly RecordedOp[]): readonly DrawTextOp[] {
  return Object.freeze(ops.filter((op): op is DrawTextOp => op.kind === "drawText"));
}

function getRectById(scene: Scene, id: string): Rect {
  const rect = scene.idRects.get(id);
  assert.ok(rect, `missing rect for id=${id}`);
  return rect ?? { x: 0, y: 0, w: 0, h: 0 };
}

function renderScene(
  scene: Scene,
  focusedId: FocusId,
  opts: Readonly<{
    clear?: boolean;
    damageRect?: Rect;
    clipToDamage?: boolean;
  }> = {},
): readonly RecordedOp[] {
  const builder = new RecordingBuilder();
  if (opts.clear) {
    builder.clearTo(scene.viewport.cols, scene.viewport.rows, DEFAULT_BASE_STYLE);
  }
  if (opts.clipToDamage && opts.damageRect) {
    builder.pushClip(opts.damageRect.x, opts.damageRect.y, opts.damageRect.w, opts.damageRect.h);
  }

  renderTree(
    builder,
    focusState(focusedId),
    scene.layout,
    scene.idRects,
    scene.viewport,
    defaultTheme,
    0,
    DEFAULT_BASE_STYLE,
    scene.tree,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    opts.damageRect ? { damageRect: opts.damageRect } : undefined,
  );

  if (opts.clipToDamage && opts.damageRect) {
    builder.popClip();
  }
  return builder.getOps();
}

function withRootOverflowMeta(scene: Scene, meta: OverflowMeta): Scene {
  return {
    tree: scene.tree,
    idRects: scene.idRects,
    viewport: scene.viewport,
    layout: {
      vnode: scene.layout.vnode,
      rect: scene.layout.rect,
      children: scene.layout.children,
      meta,
    },
  };
}

function makeTextStack(values: readonly string[]): VNode {
  return ui.column(
    { id: "root", width: 24, height: 8, p: 0 },
    values.map((value, i) => ui.text(value, { id: `line-${String(i)}` })),
  );
}

function makeScrollableBox(): VNode {
  const children: VNode[] = [];
  for (let i = 0; i < 10; i++) {
    children.push(ui.text(`row-${String(i)}`, { id: `row-${String(i)}` }));
  }
  return ui.box(
    {
      id: "scroll-root",
      width: 14,
      height: 6,
      border: "none",
      overflow: "scroll",
    },
    children,
  );
}

describe("renderer damage rect behavior", () => {
  const viewport: Viewport = { cols: 40, rows: 12 };

  test("first render without damage rect emits clear + all text nodes", () => {
    const scene = buildScene(makeTextStack(["one", "two", "three"]), viewport);
    const ops = renderScene(scene, null, { clear: true });
    const texts = drawTextOps(ops).map((op) => op.text);
    assert.equal(
      ops.some((op) => op.kind === "clearTo"),
      true,
    );
    assert.equal(texts.includes("one"), true);
    assert.equal(texts.includes("two"), true);
    assert.equal(texts.includes("three"), true);
  });

  test("full viewport damage behaves like no damage", () => {
    const scene = buildScene(makeTextStack(["alpha", "beta", "gamma"]), viewport);
    const noDamageOps = renderScene(scene, null);
    const fullDamageOps = renderScene(scene, null, { damageRect: { x: 0, y: 0, w: 40, h: 12 } });
    assert.deepEqual(fullDamageOps, noDamageOps);
  });

  test("damage rect fully outside root emits no operations", () => {
    const scene = buildScene(makeTextStack(["outside"]), viewport);
    const ops = renderScene(scene, null, { damageRect: { x: 35, y: 10, w: 4, h: 2 } });
    assert.equal(ops.length, 0);
  });

  test("zero-area damage rect emits no operations", () => {
    const scene = buildScene(makeTextStack(["zero"]), viewport);
    const ops = renderScene(scene, null, { damageRect: { x: 0, y: 0, w: 0, h: 4 } });
    assert.equal(ops.length, 0);
  });

  test("column damage rect intersects only one text child", () => {
    const vnode = ui.column({ width: 16, height: 5 }, [
      ui.text("A", { id: "a" }),
      ui.text("B", { id: "b" }),
      ui.text("C", { id: "c" }),
    ]);
    const scene = buildScene(vnode, viewport);
    const bRect = getRectById(scene, "b");
    const texts = drawTextOps(renderScene(scene, null, { damageRect: bRect })).map((op) => op.text);
    assert.deepEqual(texts, ["B"]);
  });

  test("row damage rect intersects only one text child", () => {
    const vnode = ui.row({ width: 16, height: 2 }, [
      ui.text("X", { id: "x" }),
      ui.text("Y", { id: "y" }),
      ui.text("Z", { id: "z" }),
    ]);
    const scene = buildScene(vnode, viewport);
    const yRect = getRectById(scene, "y");
    const texts = drawTextOps(renderScene(scene, null, { damageRect: yRect })).map((op) => op.text);
    assert.deepEqual(texts, ["Y"]);
  });

  test("damage in stack gap does not redraw neighboring children", () => {
    const vnode = ui.column({ width: 16, height: 8, gap: 1 }, [
      ui.text("Top", { id: "top" }),
      ui.text("Bottom", { id: "bottom" }),
    ]);
    const scene = buildScene(vnode, viewport);
    const gapDamage = { x: 0, y: 1, w: 8, h: 1 };
    const texts = drawTextOps(renderScene(scene, null, { damageRect: gapDamage })).map(
      (op) => op.text,
    );
    assert.equal(texts.length, 0);
  });

  test("shadow expands node damage bounds beyond box rect", () => {
    const withShadow = buildScene(
      ui.box({
        width: 6,
        height: 3,
        border: "none",
        shadow: true,
        style: { bg: { r: 30, g: 30, b: 30 } },
      }),
      viewport,
    );
    const withoutShadow = buildScene(
      ui.box({
        width: 6,
        height: 3,
        border: "none",
        style: { bg: { r: 30, g: 30, b: 30 } },
      }),
      viewport,
    );
    const shadowOnlyDamage = { x: 7, y: 3, w: 1, h: 1 };
    const shadowOps = renderScene(withShadow, null, { damageRect: shadowOnlyDamage });
    const plainOps = renderScene(withoutShadow, null, { damageRect: shadowOnlyDamage });
    assert.equal(drawTextOps(shadowOps).length > 0, true);
    assert.equal(plainOps.length, 0);
  });

  test("visible-overflow ancestors do not drop shadow-only incremental damage outside parent rect", () => {
    const visibleAncestor = buildScene(
      ui.row({ width: 4, height: 2, overflow: "visible" }, [
        ui.box({
          width: 4,
          height: 2,
          border: "none",
          shadow: true,
          style: { bg: { r: 20, g: 20, b: 20 } },
        }),
      ]),
      viewport,
    );
    const hiddenAncestor = buildScene(
      ui.row({ width: 4, height: 2, overflow: "hidden" }, [
        ui.box({
          width: 4,
          height: 2,
          border: "none",
          shadow: true,
          style: { bg: { r: 20, g: 20, b: 20 } },
        }),
      ]),
      viewport,
    );

    const shadowOnlyDamage = { x: 4, y: 1, w: 1, h: 1 };
    const visibleOps = renderScene(visibleAncestor, null, { damageRect: shadowOnlyDamage });
    const hiddenOps = renderScene(hiddenAncestor, null, { damageRect: shadowOnlyDamage });

    assert.equal(
      drawTextOps(visibleOps).some((op) => op.text.includes("▒")),
      true,
    );
    assert.equal(drawTextOps(hiddenOps).length, 0);
  });

  test("text update with encapsulating damage rect matches full render", () => {
    const beforeScene = buildScene(makeTextStack(["alpha", "bravo", "charlie"]), viewport);
    const afterScene = buildScene(makeTextStack(["alpha", "BRAVO!", "charlie"]), viewport);
    const damageRect = getRectById(afterScene, "line-1");

    const beforeFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(beforeScene, null, { clear: true }),
    );
    const expectedFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(afterScene, null, { clear: true }),
    );
    const partialOps = renderScene(afterScene, null, { damageRect, clipToDamage: true });
    const partialFramebuffer = applyOps(beforeFramebuffer, partialOps);
    assertFramebuffersEqual(partialFramebuffer, expectedFramebuffer);
  });

  test("text update changes only cells inside damage rect", () => {
    const beforeScene = buildScene(makeTextStack(["alpha", "bravo", "charlie"]), viewport);
    const afterScene = buildScene(makeTextStack(["alpha", "BRAVO!", "charlie"]), viewport);
    const damageRect = getRectById(afterScene, "line-1");

    const beforeFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(beforeScene, null, { clear: true }),
    );
    const partialFramebuffer = applyOps(
      beforeFramebuffer,
      renderScene(afterScene, null, { damageRect, clipToDamage: true }),
    );
    const changed = diffCellIndices(beforeFramebuffer, partialFramebuffer);
    assert.equal(changed.length > 0, true);
    assertChangedCellsWithinRect(changed, damageRect, viewport);
  });

  test("identity no-change with empty damage leaves framebuffer unchanged", () => {
    const scene = buildScene(makeTextStack(["same", "content", "frame"]), viewport);
    const baseFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, null, { clear: true }),
    );
    const partialOps = renderScene(scene, null, {
      damageRect: { x: 0, y: 0, w: 0, h: 0 },
      clipToDamage: true,
    });
    const nextFramebuffer = applyOps(baseFramebuffer, partialOps);
    assert.equal(drawTextOps(partialOps).length, 0);
    assertFramebuffersEqual(nextFramebuffer, baseFramebuffer);
  });

  test("identity no-change with unrelated damage leaves framebuffer unchanged", () => {
    const scene = buildScene(makeTextStack(["same", "content", "frame"]), viewport);
    const baseFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, null, { clear: true }),
    );
    const partialOps = renderScene(scene, null, {
      damageRect: { x: 38, y: 11, w: 2, h: 1 },
      clipToDamage: true,
    });
    const nextFramebuffer = applyOps(baseFramebuffer, partialOps);
    assert.equal(drawTextOps(partialOps).length, 0);
    assertFramebuffersEqual(nextFramebuffer, baseFramebuffer);
  });

  test("focus update null -> first button matches full render", () => {
    const vnode = ui.column({ width: 20, height: 6 }, [
      ui.button("a", "Alpha"),
      ui.button("b", "Beta"),
    ]);
    const scene = buildScene(vnode, viewport);
    const aRect = getRectById(scene, "a");
    const baseFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, null, { clear: true }),
    );
    const expectedFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, "a", { clear: true }),
    );
    const partialFramebuffer = applyOps(
      baseFramebuffer,
      renderScene(scene, "a", { damageRect: aRect, clipToDamage: true }),
    );
    assertFramebuffersEqual(partialFramebuffer, expectedFramebuffer);
  });

  test("focus update a -> b with union damage matches full render", () => {
    const vnode = ui.column({ width: 20, height: 6 }, [
      ui.button("a", "Alpha"),
      ui.button("b", "Beta"),
    ]);
    const scene = buildScene(vnode, viewport);
    const aRect = getRectById(scene, "a");
    const bRect = getRectById(scene, "b");
    const damageRect = unionRect(aRect, bRect);

    const beforeFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, "a", { clear: true }),
    );
    const expectedFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, "b", { clear: true }),
    );
    const partialFramebuffer = applyOps(
      beforeFramebuffer,
      renderScene(scene, "b", { damageRect, clipToDamage: true }),
    );
    assertFramebuffersEqual(partialFramebuffer, expectedFramebuffer);
  });

  test("focus update a -> b only mutates cells inside focus damage union", () => {
    const vnode = ui.column({ width: 20, height: 6 }, [
      ui.button("a", "Alpha"),
      ui.button("b", "Beta"),
    ]);
    const scene = buildScene(vnode, viewport);
    const aRect = getRectById(scene, "a");
    const bRect = getRectById(scene, "b");
    const damageRect = unionRect(aRect, bRect);

    const beforeFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(scene, "a", { clear: true }),
    );
    const partialFramebuffer = applyOps(
      beforeFramebuffer,
      renderScene(scene, "b", { damageRect, clipToDamage: true }),
    );
    const changed = diffCellIndices(beforeFramebuffer, partialFramebuffer);
    assert.equal(changed.length > 0, true);
    assertChangedCellsWithinRect(changed, damageRect, viewport);
  });

  test("scroll-like update with container damage matches full render", () => {
    const base = buildScene(makeScrollableBox(), viewport);
    const beforeScene = withRootOverflowMeta(base, {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 10,
      contentHeight: 18,
      viewportWidth: 14,
      viewportHeight: 6,
    });
    const afterScene = withRootOverflowMeta(base, {
      scrollX: 0,
      scrollY: 6,
      contentWidth: 10,
      contentHeight: 18,
      viewportWidth: 14,
      viewportHeight: 6,
    });
    const damageRect = getRectById(afterScene, "scroll-root");

    const beforeFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(beforeScene, null, { clear: true }),
    );
    const expectedFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(afterScene, null, { clear: true }),
    );
    const partialFramebuffer = applyOps(
      beforeFramebuffer,
      renderScene(afterScene, null, { damageRect, clipToDamage: true }),
    );
    assertFramebuffersEqual(partialFramebuffer, expectedFramebuffer);
  });

  test("scroll-like update only mutates cells inside scroll container damage", () => {
    const base = buildScene(makeScrollableBox(), viewport);
    const beforeScene = withRootOverflowMeta(base, {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 10,
      contentHeight: 18,
      viewportWidth: 14,
      viewportHeight: 6,
    });
    const afterScene = withRootOverflowMeta(base, {
      scrollX: 0,
      scrollY: 6,
      contentWidth: 10,
      contentHeight: 18,
      viewportWidth: 14,
      viewportHeight: 6,
    });
    const damageRect = getRectById(afterScene, "scroll-root");

    const beforeFramebuffer = applyOps(
      createFramebuffer(viewport),
      renderScene(beforeScene, null, { clear: true }),
    );
    const partialFramebuffer = applyOps(
      beforeFramebuffer,
      renderScene(afterScene, null, { damageRect, clipToDamage: true }),
    );
    const changed = diffCellIndices(beforeFramebuffer, partialFramebuffer);
    assert.equal(changed.length > 0, true);
    assertChangedCellsWithinRect(changed, damageRect, viewport);
  });
});
