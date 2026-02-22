import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistBuildResult, DrawlistBuilderV1 } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { TextStyle, VNode } from "../../index.js";
import { ui } from "../../index.js";
import { type LayoutTree, layout } from "../../layout/layout.js";
import { type RuntimeInstance, commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { indexIdRects, indexLayoutRects } from "../renderToDrawlist/indices.js";
import { renderTree } from "../renderToDrawlist/renderTree.js";
import { DEFAULT_BASE_STYLE } from "../renderToDrawlist/textStyle.js";
import {
  SCROLLBAR_CLASSIC,
  SCROLLBAR_CONFIGS,
  SCROLLBAR_DOTS,
  SCROLLBAR_MINIMAL,
  SCROLLBAR_MODERN,
  SCROLLBAR_THIN,
  calculateThumb,
  getScrollbarGlyphs,
  renderHorizontalScrollbar,
  renderVerticalScrollbar,
} from "../scrollbar.js";

type Viewport = Readonly<{ cols: number; rows: number }>;

type RecordedOp =
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

type DrawTextOp = Extract<RecordedOp, { kind: "drawText" }>;

type Scene = Readonly<{
  tree: RuntimeInstance;
  layout: LayoutTree;
  idRects: ReadonlyMap<string, { x: number; y: number; w: number; h: number }>;
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

class RecordingBuilder implements DrawlistBuilderV1 {
  private readonly ops: RecordedOp[] = [];

  getOps(): readonly RecordedOp[] {
    return this.ops.slice();
  }

  clear(): void {}

  clearTo(_cols: number, _rows: number, _style?: TextStyle): void {}

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

function renderScene(
  vnode: VNode,
  viewport: Viewport,
  opts: Readonly<{ rootMeta?: OverflowMeta }> = {},
): readonly RecordedOp[] {
  const rawScene = buildScene(vnode, viewport);
  const scene = opts.rootMeta ? withRootOverflowMeta(rawScene, opts.rootMeta) : rawScene;
  const builder = new RecordingBuilder();

  renderTree(
    builder,
    Object.freeze({ focusedId: null }),
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
    undefined,
    undefined,
    undefined,
    undefined,
  );

  return builder.getOps();
}

function drawTextOps(ops: readonly RecordedOp[]): readonly DrawTextOp[] {
  return Object.freeze(ops.filter((op): op is DrawTextOp => op.kind === "drawText"));
}

function minimalGlyphOps(ops: readonly RecordedOp[]): readonly DrawTextOp[] {
  return drawTextOps(ops).filter(
    (op) => op.text === SCROLLBAR_MINIMAL.track || op.text === SCROLLBAR_MINIMAL.thumb,
  );
}

function verticalOnlyScroller(): VNode {
  const lines: VNode[] = [];
  for (let i = 0; i < 6; i++) lines.push(ui.text("abcd"));
  return ui.box(
    {
      width: 6,
      height: 4,
      border: "none",
      overflow: "scroll",
    },
    lines,
  );
}

function horizontalOnlyScroller(): VNode {
  return ui.box(
    {
      width: 6,
      height: 4,
      border: "none",
      overflow: "scroll",
    },
    [ui.text("abcdefgh"), ui.text("abcdefgh")],
  );
}

function bothScrollbarsScroller(): VNode {
  const lines: VNode[] = [];
  for (let i = 0; i < 6; i++) lines.push(ui.text("abcdefgh"));
  return ui.box(
    {
      width: 6,
      height: 4,
      border: "none",
      overflow: "scroll",
    },
    lines,
  );
}

describe("renderer scrollbar primitives", () => {
  test("minimal glyph set preset is stable", () => {
    assert.deepEqual(getScrollbarGlyphs("minimal"), SCROLLBAR_MINIMAL);
  });

  test("classic glyph set preset is stable", () => {
    assert.deepEqual(getScrollbarGlyphs("classic"), SCROLLBAR_CLASSIC);
  });

  test("modern glyph set preset is stable", () => {
    assert.deepEqual(getScrollbarGlyphs("modern"), SCROLLBAR_MODERN);
  });

  test("dots glyph set preset is stable", () => {
    assert.deepEqual(getScrollbarGlyphs("dots"), SCROLLBAR_DOTS);
  });

  test("thin glyph set preset is stable", () => {
    assert.deepEqual(getScrollbarGlyphs("thin"), SCROLLBAR_THIN);
  });

  test("calculateThumb position 0%", () => {
    assert.deepEqual(calculateThumb(10, { position: 0, viewportRatio: 0.2 }), {
      start: 0,
      size: 2,
    });
  });

  test("calculateThumb position 50%", () => {
    assert.deepEqual(calculateThumb(10, { position: 0.5, viewportRatio: 0.2 }), {
      start: 4,
      size: 2,
    });
  });

  test("calculateThumb position 100%", () => {
    assert.deepEqual(calculateThumb(10, { position: 1, viewportRatio: 0.2 }), {
      start: 8,
      size: 2,
    });
  });

  test("calculateThumb enforces minThumbSize", () => {
    assert.deepEqual(
      calculateThumb(10, { position: 0.5, viewportRatio: 0.05 }, { minThumbSize: 3 }),
      { start: 3, size: 3 },
    );
  });

  test("calculateThumb reserves arrow cells and offsets start", () => {
    assert.deepEqual(
      calculateThumb(10, { position: 0.5, viewportRatio: 0.25 }, { showArrows: true }),
      { start: 4, size: 2 },
    );
  });

  test("calculateThumb fills full track when viewportRatio >= 1", () => {
    assert.deepEqual(calculateThumb(10, { position: 0.9, viewportRatio: 1 }), {
      start: 0,
      size: 10,
    });
  });

  test("calculateThumb falls back to full effective track when min thumb exceeds effective", () => {
    assert.deepEqual(
      calculateThumb(4, { position: 0.7, viewportRatio: 0.2 }, { minThumbSize: 5 }),
      { start: 0, size: 4 },
    );
  });

  test("classic preset min thumb + arrows are honored", () => {
    assert.deepEqual(
      calculateThumb(10, { position: 0.5, viewportRatio: 0.1 }, SCROLLBAR_CONFIGS.classic),
      { start: 4, size: 2 },
    );
  });

  test("renderVerticalScrollbar returns empty for non-positive height", () => {
    assert.deepEqual(renderVerticalScrollbar(0, { position: 0, viewportRatio: 0.5 }), []);
  });

  test("renderHorizontalScrollbar returns empty for non-positive width", () => {
    assert.deepEqual(renderHorizontalScrollbar(0, { position: 0, viewportRatio: 0.5 }), []);
  });

  test("renderVerticalScrollbar with arrows places arrow, thumb, track, arrow", () => {
    assert.deepEqual(
      renderVerticalScrollbar(
        5,
        { position: 0, viewportRatio: 0.4 },
        { showArrows: true, glyphs: SCROLLBAR_MINIMAL },
      ),
      ["▲", "┃", "│", "│", "▼"],
    );
  });

  test("renderHorizontalScrollbar with arrows places arrow, thumb, track, arrow", () => {
    assert.deepEqual(
      renderHorizontalScrollbar(
        5,
        { position: 0, viewportRatio: 0.4 },
        { showArrows: true, glyphs: SCROLLBAR_MINIMAL },
      ),
      ["◀", "┃", "│", "│", "▶"],
    );
  });

  test("renderVerticalScrollbar supports 1-row minimal space without arrows", () => {
    assert.deepEqual(
      renderVerticalScrollbar(
        1,
        { position: 0.3, viewportRatio: 0.1 },
        { glyphs: SCROLLBAR_MINIMAL },
      ),
      ["┃"],
    );
  });

  test("renderHorizontalScrollbar supports 1-col minimal space without arrows", () => {
    assert.deepEqual(
      renderHorizontalScrollbar(
        1,
        { position: 0.3, viewportRatio: 0.1 },
        { glyphs: SCROLLBAR_MINIMAL },
      ),
      ["┃"],
    );
  });

  test("renderVerticalScrollbar uses top arrow when height is 1 and arrows are enabled", () => {
    assert.deepEqual(
      renderVerticalScrollbar(
        1,
        { position: 1, viewportRatio: 0.1 },
        { showArrows: true, glyphs: SCROLLBAR_MINIMAL },
      ),
      ["▲"],
    );
  });

  test("renderHorizontalScrollbar uses left arrow when width is 1 and arrows are enabled", () => {
    assert.deepEqual(
      renderHorizontalScrollbar(
        1,
        { position: 1, viewportRatio: 0.1 },
        { showArrows: true, glyphs: SCROLLBAR_MINIMAL },
      ),
      ["◀"],
    );
  });
});

describe("renderer scroll container integration", () => {
  const viewport: Viewport = { cols: 20, rows: 10 };

  test("vertical-only scroll container draws gutter glyphs and shrinks clip width", () => {
    const ops = renderScene(verticalOnlyScroller(), viewport, {
      rootMeta: {
        scrollX: 0,
        scrollY: 2,
        contentWidth: 4,
        contentHeight: 10,
        viewportWidth: 4,
        viewportHeight: 4,
      },
    });
    const glyphs = minimalGlyphOps(ops);
    const gutterGlyphs = glyphs.filter((op) => op.x === 5);
    assert.equal(gutterGlyphs.length, 4);
    assert.equal(
      gutterGlyphs.some((op) => op.text === SCROLLBAR_MINIMAL.thumb),
      true,
    );
    assert.equal(
      ops.some(
        (op) => op.kind === "pushClip" && op.x === 0 && op.y === 0 && op.w === 5 && op.h === 4,
      ),
      true,
    );
  });

  test("horizontal-only scroll container draws bottom glyph row and shrinks clip height", () => {
    const ops = renderScene(horizontalOnlyScroller(), viewport, {
      rootMeta: {
        scrollX: 3,
        scrollY: 0,
        contentWidth: 10,
        contentHeight: 2,
        viewportWidth: 6,
        viewportHeight: 2,
      },
    });
    const glyphs = minimalGlyphOps(ops);
    const bottomGlyphs = glyphs.filter((op) => op.y === 3);
    assert.equal(bottomGlyphs.length, 6);
    assert.equal(
      bottomGlyphs.some((op) => op.text === SCROLLBAR_MINIMAL.thumb),
      true,
    );
    assert.equal(
      ops.some(
        (op) => op.kind === "pushClip" && op.x === 0 && op.y === 0 && op.w === 6 && op.h === 3,
      ),
      true,
    );
  });

  test("two-axis scroll container draws corner track cell and shrinks clip on both axes", () => {
    const ops = renderScene(bothScrollbarsScroller(), viewport, {
      rootMeta: {
        scrollX: 2,
        scrollY: 3,
        contentWidth: 10,
        contentHeight: 8,
        viewportWidth: 6,
        viewportHeight: 4,
      },
    });
    assert.equal(
      ops.some(
        (op) =>
          op.kind === "drawText" && op.x === 5 && op.y === 3 && op.text === SCROLLBAR_MINIMAL.track,
      ),
      true,
    );
    assert.equal(
      ops.some(
        (op) => op.kind === "pushClip" && op.x === 0 && op.y === 0 && op.w === 5 && op.h === 3,
      ),
      true,
    );
  });

  test("scrollbarVariant overrides glyph set for overflow scrollbars", () => {
    const lines: VNode[] = [];
    for (let i = 0; i < 6; i++) lines.push(ui.text("abcd"));
    const vnode = ui.box(
      {
        width: 6,
        height: 4,
        border: "none",
        overflow: "scroll",
        scrollbarVariant: "classic",
      },
      lines,
    );
    const ops = renderScene(vnode, viewport, {
      rootMeta: {
        scrollX: 0,
        scrollY: 2,
        contentWidth: 4,
        contentHeight: 10,
        viewportWidth: 4,
        viewportHeight: 4,
      },
    });
    const gutterGlyphs = drawTextOps(ops).filter((op) => op.x === 5);
    assert.equal(
      gutterGlyphs.some(
        (op) =>
          op.text === SCROLLBAR_CLASSIC.track ||
          op.text === SCROLLBAR_CLASSIC.thumb ||
          op.text === SCROLLBAR_CLASSIC.arrowUp ||
          op.text === SCROLLBAR_CLASSIC.arrowDown,
      ),
      true,
    );
  });

  test("scrollbarStyle overrides rendered scrollbar draw style", () => {
    const lines: VNode[] = [];
    for (let i = 0; i < 6; i++) lines.push(ui.text("abcd"));
    const customFg = Object.freeze({ r: 1, g: 2, b: 3 });
    const vnode = ui.box(
      {
        width: 6,
        height: 4,
        border: "none",
        overflow: "scroll",
        scrollbarStyle: { fg: customFg },
      },
      lines,
    );
    const ops = renderScene(vnode, viewport, {
      rootMeta: {
        scrollX: 0,
        scrollY: 2,
        contentWidth: 4,
        contentHeight: 10,
        viewportWidth: 4,
        viewportHeight: 4,
      },
    });
    const styledScrollbarGlyph = drawTextOps(ops).find(
      (op) =>
        op.x === 5 &&
        (op.text === SCROLLBAR_MINIMAL.track || op.text === SCROLLBAR_MINIMAL.thumb) &&
        op.style?.fg !== undefined,
    );
    assert.ok(styledScrollbarGlyph !== undefined);
    if (!styledScrollbarGlyph?.style?.fg || typeof styledScrollbarGlyph.style.fg === "string")
      return;
    assert.deepEqual(styledScrollbarGlyph.style.fg, customFg);
  });
});
