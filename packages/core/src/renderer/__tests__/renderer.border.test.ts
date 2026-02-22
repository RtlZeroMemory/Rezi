import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type {
  BorderStyle,
  DrawlistBuildResult,
  DrawlistBuilderV1,
  TextStyle,
  VNode,
} from "../../index.js";
import { getBorderGlyphs, measureTextCells, truncateWithEllipsis, ui } from "../../index.js";
import { layout } from "../../layout/layout.js";
import type { Axis } from "../../layout/types.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { renderToDrawlist } from "../renderToDrawlist.js";

type DrawOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

type DrawTextOp = Readonly<{ index: number; x: number; y: number; text: string }>;

class RecordingBuilder implements DrawlistBuilderV1 {
  readonly ops: DrawOp[] = [];

  clear(): void {
    this.ops.push({ kind: "clear" });
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    this.ops.push(style ? { kind: "clearTo", cols, rows, style } : { kind: "clearTo", cols, rows });
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    this.ops.push(
      style ? { kind: "fillRect", x, y, w, h, style } : { kind: "fillRect", x, y, w, h },
    );
  }

  drawText(x: number, y: number, text: string, style?: TextStyle): void {
    this.ops.push(
      style ? { kind: "drawText", x, y, text, style } : { kind: "drawText", x, y, text },
    );
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
    // Force deterministic drawText fallback in tests.
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
  viewport: Readonly<{ cols: number; rows: number }>,
  axis: Axis,
  opts: Readonly<{ focusedId?: string | null; pressedId?: string | null }> = {},
): readonly DrawOp[] {
  const committed = commitVNodeTree(null, vnode, { allocator: createInstanceIdAllocator(1) });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return Object.freeze([]);

  const layoutRes = layout(committed.value.root.vnode, 0, 0, viewport.cols, viewport.rows, axis);
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return Object.freeze([]);

  const builder = new RecordingBuilder();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: opts.focusedId ?? null }),
    pressedId: opts.pressedId ?? null,
    builder,
  });
  return Object.freeze(builder.ops.slice());
}

function drawTextOps(ops: readonly DrawOp[]): readonly DrawTextOp[] {
  const out: DrawTextOp[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || op.kind !== "drawText") continue;
    out.push({ index: i, x: op.x, y: op.y, text: op.text });
  }
  return Object.freeze(out);
}

function containsShadeGlyph(text: string): boolean {
  return text.includes("░") || text.includes("▒") || text.includes("▓");
}

function renderBorderBox(
  props: Readonly<{
    border: BorderStyle;
    width: number;
    height: number;
    borderTop?: boolean;
    borderRight?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    title?: string;
    titleAlign?: "left" | "center" | "right";
    shadow?: true;
  }>,
): readonly DrawTextOp[] {
  const viewport = {
    cols: Math.max(120, props.width + 16),
    rows: Math.max(60, props.height + 16),
  };
  const vnode = ui.box(props, []);
  return drawTextOps(renderOps(vnode, viewport, "column"));
}

const BORDER_STYLES: readonly BorderStyle[] = Object.freeze([
  "none",
  "single",
  "double",
  "rounded",
  "heavy",
  "dashed",
  "heavy-dashed",
]);

const BORDER_SIZES = Object.freeze([
  Object.freeze({ w: 1, h: 1 }),
  Object.freeze({ w: 2, h: 2 }),
  Object.freeze({ w: 10, h: 5 }),
  Object.freeze({ w: 100, h: 50 }),
]);

describe("renderer border rendering (deterministic)", () => {
  for (const style of BORDER_STYLES) {
    for (const size of BORDER_SIZES) {
      test(`${style} border at ${String(size.w)}x${String(size.h)} emits deterministic frame geometry`, () => {
        const drawOps = renderBorderBox({
          border: style,
          width: size.w,
          height: size.h,
        });

        if (style === "none" || size.w < 2 || size.h < 2) {
          assert.equal(drawOps.length, 0);
          return;
        }

        const glyphs = getBorderGlyphs(style);
        assert.ok(glyphs !== null, "glyphs should exist for non-none style");
        if (!glyphs) return;

        const innerW = Math.max(0, size.w - 2);
        const expectedTop = `${glyphs.TL}${glyphs.H.repeat(innerW)}${glyphs.TR}`;
        const expectedBottom = `${glyphs.BL}${glyphs.H.repeat(innerW)}${glyphs.BR}`;

        assert.equal(
          drawOps.some((op) => op.x === 0 && op.y === 0 && op.text === expectedTop),
          true,
        );
        assert.equal(
          drawOps.some((op) => op.x === 0 && op.y === size.h - 1 && op.text === expectedBottom),
          true,
        );

        const expectedCount = size.h <= 2 ? 2 : 2 + (size.h - 2) * 2;
        assert.equal(drawOps.length, expectedCount);

        if (size.h > 2) {
          for (let y = 1; y < size.h - 1; y++) {
            assert.equal(
              drawOps.some((op) => op.x === 0 && op.y === y && op.text === glyphs.V),
              true,
            );
            assert.equal(
              drawOps.some((op) => op.x === size.w - 1 && op.y === y && op.text === glyphs.V),
              true,
            );
          }
        }
      });
    }
  }

  test("title alignment: left places title at x=2", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 20,
      height: 5,
      title: "Title",
      titleAlign: "left",
    });
    const titleOp = drawOps.find((op) => op.text === "Title");
    assert.ok(titleOp !== undefined, "title draw should exist");
    if (!titleOp) return;
    assert.equal(titleOp.x, 2);
    assert.equal(titleOp.y, 0);
  });

  test("title alignment: center uses deterministic centering", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 20,
      height: 5,
      title: "Title",
      titleAlign: "center",
    });
    const titleOp = drawOps.find((op) => op.text === "Title");
    assert.ok(titleOp !== undefined, "title draw should exist");
    if (!titleOp) return;
    assert.equal(titleOp.x, 1 + Math.floor((20 - 2 - measureTextCells("Title")) / 2));
    assert.equal(titleOp.y, 0);
  });

  test("title alignment: right places title near right corner", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 20,
      height: 5,
      title: "Title",
      titleAlign: "right",
    });
    const titleOp = drawOps.find((op) => op.text === "Title");
    assert.ok(titleOp !== undefined, "title draw should exist");
    if (!titleOp) return;
    assert.equal(titleOp.x, 19 - measureTextCells("Title") - 1);
    assert.equal(titleOp.y, 0);
  });

  test("title truncation: long title is ellipsized to available width", () => {
    const title = "abcdefghijklmnopqrstuvwxyz";
    const clipped = truncateWithEllipsis(title, 8 - 4);
    const drawOps = renderBorderBox({
      border: "single",
      width: 8,
      height: 4,
      title,
      titleAlign: "left",
    });
    const titleOp = drawOps.find((op) => op.text === clipped);
    assert.ok(titleOp !== undefined, "clipped title should be drawn");
    if (!titleOp) return;
    assert.equal(titleOp.x, 2);
  });

  test("title truncation with center alignment uses clipped title width", () => {
    const title = "very-long-title";
    const clipped = truncateWithEllipsis(title, 10 - 4);
    const drawOps = renderBorderBox({
      border: "single",
      width: 10,
      height: 4,
      title,
      titleAlign: "center",
    });
    const titleOp = drawOps.find((op) => op.text === clipped);
    assert.ok(titleOp !== undefined, "clipped center title should be drawn");
    if (!titleOp) return;
    const clippedWidth = measureTextCells(clipped);
    assert.equal(titleOp.x, 1 + Math.floor((10 - 2 - clippedWidth) / 2));
  });

  test("title is skipped when box width is too narrow", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 3,
      height: 4,
      title: "Title",
      titleAlign: "left",
    });
    assert.equal(
      drawOps.some((op) => op.text.includes("Title")),
      false,
    );
  });

  test("shadow glyphs are emitted before border frame text", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 8,
      height: 4,
      shadow: true,
    });

    const shadowIndex = drawOps.findIndex((op) => containsShadeGlyph(op.text));
    const borderTopIndex = drawOps.findIndex((op) => op.text === `┌${"─".repeat(6)}┐`);

    assert.equal(shadowIndex >= 0, true);
    assert.equal(borderTopIndex >= 0, true);
    if (shadowIndex < 0 || borderTopIndex < 0) return;
    assert.equal(shadowIndex < borderTopIndex, true);
  });

  test("shadow glyphs are absent when shadow is disabled", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 8,
      height: 4,
    });
    assert.equal(
      drawOps.some((op) => containsShadeGlyph(op.text)),
      false,
    );
  });

  test("per-side: top-only border draws one horizontal line", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 6,
      height: 4,
      borderTop: true,
      borderRight: false,
      borderBottom: false,
      borderLeft: false,
    });
    assert.equal(drawOps.length, 1);
    assert.equal(drawOps[0]?.y, 0);
    assert.equal(drawOps[0]?.text, "─".repeat(6));
  });

  test("per-side: right-only border draws only right vertical edge", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 6,
      height: 4,
      borderTop: false,
      borderRight: true,
      borderBottom: false,
      borderLeft: false,
    });
    assert.equal(drawOps.length, 4);
    for (let y = 0; y < 4; y++) {
      assert.equal(
        drawOps.some((op) => op.x === 5 && op.y === y && op.text === "│"),
        true,
      );
    }
  });

  test("per-side: bottom-only border draws one horizontal line", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 6,
      height: 4,
      borderTop: false,
      borderRight: false,
      borderBottom: true,
      borderLeft: false,
    });
    assert.equal(drawOps.length, 1);
    assert.equal(drawOps[0]?.y, 3);
    assert.equal(drawOps[0]?.text, "─".repeat(6));
  });

  test("per-side: left-only border draws only left vertical edge", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 6,
      height: 4,
      borderTop: false,
      borderRight: false,
      borderBottom: false,
      borderLeft: true,
    });
    assert.equal(drawOps.length, 4);
    for (let y = 0; y < 4; y++) {
      assert.equal(
        drawOps.some((op) => op.x === 0 && op.y === y && op.text === "│"),
        true,
      );
    }
  });

  test("per-side: top+bottom only use horizontal caps with no vertical edges", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 6,
      height: 4,
      borderTop: true,
      borderRight: false,
      borderBottom: true,
      borderLeft: false,
    });
    assert.equal(drawOps.length, 2);
    assert.equal(
      drawOps.some((op) => op.y === 0 && op.text === "─".repeat(6)),
      true,
    );
    assert.equal(
      drawOps.some((op) => op.y === 3 && op.text === "─".repeat(6)),
      true,
    );
    assert.equal(
      drawOps.some((op) => op.text === "│"),
      false,
    );
  });

  test("per-side: left+right only draw vertical edges across full height", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 6,
      height: 4,
      borderTop: false,
      borderRight: true,
      borderBottom: false,
      borderLeft: true,
    });
    assert.equal(drawOps.length, 8);
    for (let y = 0; y < 4; y++) {
      assert.equal(
        drawOps.some((op) => op.x === 0 && op.y === y && op.text === "│"),
        true,
      );
      assert.equal(
        drawOps.some((op) => op.x === 5 && op.y === y && op.text === "│"),
        true,
      );
    }
  });

  test("per-side: title is not rendered when top side is disabled", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 12,
      height: 4,
      title: "Title",
      borderTop: false,
      borderRight: true,
      borderBottom: true,
      borderLeft: true,
    });
    assert.equal(
      drawOps.some((op) => op.text === "Title"),
      false,
    );
  });

  test("0 width box emits no border draw text", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 0,
      height: 5,
    });
    assert.equal(drawOps.length, 0);
  });

  test("0 height box emits no border draw text", () => {
    const drawOps = renderBorderBox({
      border: "single",
      width: 5,
      height: 0,
    });
    assert.equal(drawOps.length, 0);
  });

  test("box opacity blends merged own style against parent backdrop", () => {
    const backdrop = { r: 32, g: 48, b: 64 };
    const childFg = { r: 250, g: 180, b: 110 };
    const childBg = { r: 10, g: 20, b: 30 };
    const ops = renderOps(
      ui.column({ id: "root", style: { bg: backdrop } }, [
        ui.box(
          {
            id: "fading-box",
            width: 8,
            height: 4,
            border: "single",
            opacity: 0,
            style: { fg: childFg, bg: childBg },
          },
          [],
        ),
      ]),
      { cols: 20, rows: 8 },
      "column",
    );

    const childFillMatchesBackdrop = ops.some(
      (op) =>
        op.kind === "fillRect" &&
        op.w === 8 &&
        op.h === 4 &&
        op.style !== undefined &&
        op.style.fg !== undefined &&
        op.style.bg !== undefined &&
        op.style.fg.r === backdrop.r &&
        op.style.fg.g === backdrop.g &&
        op.style.fg.b === backdrop.b &&
        op.style.bg.r === backdrop.r &&
        op.style.bg.g === backdrop.g &&
        op.style.bg.b === backdrop.b,
    );
    assert.equal(childFillMatchesBackdrop, true, "faded fill should match parent backdrop");

    const topBorder = ops.find(
      (op) => op.kind === "drawText" && op.x === 0 && op.y === 0 && op.text.includes("┌"),
    );
    assert.ok(topBorder !== undefined, "top border should exist");
    if (!topBorder || topBorder.kind !== "drawText" || !topBorder.style) return;
    assert.deepEqual(topBorder.style.fg, backdrop);
    assert.deepEqual(topBorder.style.bg, backdrop);
  });

  test("button pressedStyle is applied when pressedId matches", () => {
    const pressedFg = Object.freeze({ r: 255, g: 64, b: 64 });
    const ops = renderOps(
      ui.button({
        id: "btn",
        label: "Run",
        pressedStyle: { fg: pressedFg, inverse: true },
      }),
      { cols: 20, rows: 4 },
      "column",
      { pressedId: "btn" },
    );

    const label = ops.find(
      (op) => op.kind === "drawText" && op.text.includes("Run") && op.style !== undefined,
    );
    assert.ok(label !== undefined, "button label should be drawn with style");
    if (!label || label.kind !== "drawText" || !label.style) return;
    assert.deepEqual(label.style.fg, pressedFg);
    assert.equal(label.style.inverse, true);
  });
});
