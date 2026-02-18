import { assert, describe, test } from "@rezi-ui/testkit";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { DrawlistBuildResult, DrawlistBuilderV1, TextStyle, VNode } from "../../index.js";
import { ui } from "../../index.js";
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

type ClipRect = Readonly<{ x: number; y: number; w: number; h: number }>;

type Framebuffer = Readonly<{
  cols: number;
  rows: number;
  cells: string[];
}>;

type DrawDepth = Readonly<{
  index: number;
  x: number;
  y: number;
  text: string;
  depth: number;
}>;

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
    focusState: Object.freeze({ focusedId: null }),
    builder,
  });
  return Object.freeze(builder.ops.slice());
}

function frameFromOps(
  ops: readonly DrawOp[],
  viewport: Readonly<{ cols: number; rows: number }>,
): Framebuffer {
  const cells = new Array(viewport.cols * viewport.rows).fill(" ");
  const clipStack: ClipRect[] = [];

  const inViewport = (x: number, y: number): boolean =>
    x >= 0 && x < viewport.cols && y >= 0 && y < viewport.rows;

  const inClip = (x: number, y: number): boolean => {
    for (const clip of clipStack) {
      if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
    }
    return true;
  };

  const writeCell = (x: number, y: number, ch: string): void => {
    if (!inViewport(x, y) || !inClip(x, y)) return;
    cells[y * viewport.cols + x] = ch;
  };

  const fillSpace = (x: number, y: number, w: number, h: number): void => {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        writeCell(xx, yy, " ");
      }
    }
  };

  for (const op of ops) {
    switch (op.kind) {
      case "clear":
        cells.fill(" ");
        break;
      case "clearTo":
        fillSpace(0, 0, Math.min(viewport.cols, op.cols), Math.min(viewport.rows, op.rows));
        break;
      case "fillRect":
        fillSpace(op.x, op.y, op.w, op.h);
        break;
      case "drawText":
        for (let i = 0; i < op.text.length; i++) {
          const ch = op.text[i] ?? " ";
          writeCell(op.x + i, op.y, ch);
        }
        break;
      case "pushClip":
        clipStack.push({ x: op.x, y: op.y, w: op.w, h: op.h });
        break;
      case "popClip":
        clipStack.pop();
        break;
    }
  }

  return { cols: viewport.cols, rows: viewport.rows, cells };
}

function cellAt(frame: Framebuffer, x: number, y: number): string {
  if (x < 0 || x >= frame.cols || y < 0 || y >= frame.rows) return " ";
  return frame.cells[y * frame.cols + x] ?? " ";
}

function rowText(frame: Framebuffer, y: number): string {
  if (y < 0 || y >= frame.rows) return "";
  const start = y * frame.cols;
  return frame.cells.slice(start, start + frame.cols).join("");
}

function collectPushClips(ops: readonly DrawOp[]): readonly ClipRect[] {
  return Object.freeze(
    ops.flatMap((op) => (op.kind === "pushClip" ? [{ x: op.x, y: op.y, w: op.w, h: op.h }] : [])),
  );
}

function countPops(ops: readonly DrawOp[]): number {
  return ops.filter((op) => op.kind === "popClip").length;
}

function maxClipDepth(ops: readonly DrawOp[]): number {
  let depth = 0;
  let max = 0;
  for (const op of ops) {
    if (op.kind === "pushClip") {
      depth++;
      if (depth > max) max = depth;
      continue;
    }
    if (op.kind === "popClip") {
      depth = Math.max(0, depth - 1);
    }
  }
  return max;
}

function drawDepths(ops: readonly DrawOp[]): readonly DrawDepth[] {
  const out: DrawDepth[] = [];
  let depth = 0;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op) continue;
    if (op.kind === "pushClip") {
      depth++;
      continue;
    }
    if (op.kind === "popClip") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (op.kind === "drawText") {
      out.push({ index: i, x: op.x, y: op.y, text: op.text, depth });
    }
  }

  return Object.freeze(out);
}

function makeDeepNestedRows(levels: number, step: number, leaf: VNode): VNode {
  let node = leaf;
  for (let i = 0; i < levels; i++) {
    node = ui.row({ width: 12, height: 1, ml: step, overflow: "hidden" }, [node]);
  }
  return ui.row({ width: 12, height: 1, overflow: "hidden" }, [node]);
}

describe("renderer clipping (deterministic)", () => {
  test("row overflow visible does not clip child hidden content to parent bounds", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.row({ width: 4, height: 1, overflow: "visible" }, [
      ui.row({ width: 4, height: 1, ml: 2, overflow: "hidden" }, [ui.text("ABCD")]),
    ]);

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);
    const pushes = collectPushClips(ops);

    assert.equal(
      pushes.some((clip) => clip.x === 0 && clip.y === 0 && clip.w === 4 && clip.h === 1),
      false,
    );
    assert.equal(
      pushes.some((clip) => clip.x === 2 && clip.y === 0 && clip.w === 2 && clip.h === 1),
      true,
    );
    assert.equal(cellAt(frame, 2, 0), "A");
    assert.equal(cellAt(frame, 3, 0), "B");
  });

  test("box overflow visible does not clip child hidden content to parent bounds", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.box({ width: 4, height: 1, border: "none", overflow: "visible" }, [
      ui.row({ width: 4, height: 1, ml: 2, overflow: "hidden" }, [ui.text("ABCD")]),
    ]);

    const ops = renderOps(vnode, viewport, "column");
    const frame = frameFromOps(ops, viewport);
    const pushes = collectPushClips(ops);

    assert.equal(
      pushes.some((clip) => clip.x === 0 && clip.y === 0 && clip.w === 4 && clip.h === 1),
      false,
    );
    assert.equal(
      pushes.some((clip) => clip.x === 2 && clip.y === 0 && clip.w === 2 && clip.h === 1),
      true,
    );
    assert.equal(cellAt(frame, 2, 0), "A");
    assert.equal(cellAt(frame, 3, 0), "B");
  });

  test("two-level nested clips constrain overflow to overlap", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.row({ width: 8, height: 1, overflow: "hidden" }, [
      ui.row({ width: 6, height: 1, ml: 6, overflow: "hidden" }, [ui.text("ABCD")]),
    ]);

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);

    assert.equal(cellAt(frame, 6, 0), "A");
    assert.equal(cellAt(frame, 7, 0), "B");
    assert.equal(cellAt(frame, 8, 0), " ");
    assert.equal(collectPushClips(ops).length >= 2, true);
  });

  test("right clip boundary is exclusive at overlap edge", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.row({ width: 8, height: 1, overflow: "hidden" }, [
      ui.row({ width: 3, height: 1, ml: 7, overflow: "hidden" }, [ui.text("XYZ")]),
    ]);

    const frame = frameFromOps(renderOps(vnode, viewport, "row"), viewport);
    assert.equal(cellAt(frame, 7, 0), "X");
    assert.equal(cellAt(frame, 8, 0), " ");
  });

  test("triple nested clips keep only one-cell overlap visible", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.row({ width: 10, height: 1, overflow: "hidden" }, [
      ui.row({ width: 8, height: 1, ml: 2, overflow: "hidden" }, [
        ui.row({ width: 6, height: 1, ml: 7, overflow: "hidden" }, [ui.text("XYZ")]),
      ]),
    ]);

    const frame = frameFromOps(renderOps(vnode, viewport, "row"), viewport);
    assert.equal(cellAt(frame, 9, 0), "X");
    assert.equal(cellAt(frame, 10, 0), " ");
  });

  test("box border and padding move the child clip origin deterministically", () => {
    const viewport = { cols: 20, rows: 8 };
    const vnode = ui.row({ width: 12, height: 5, overflow: "hidden" }, [
      ui.box({ width: 8, height: 5, border: "single", p: 1, overflow: "hidden" }, [ui.text("L")]),
    ]);

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);
    const pushes = collectPushClips(ops);

    assert.equal(
      pushes.some((clip) => clip.x === 2 && clip.y === 2 && clip.w === 4 && clip.h === 1),
      true,
    );
    assert.equal(cellAt(frame, 2, 2), "L");
  });

  test("text overflow clip uses maxWidth boundary", () => {
    const viewport = { cols: 10, rows: 2 };
    const vnode = ui.text("ABCDEFG", { textOverflow: "clip", maxWidth: 3 });

    const ops = renderOps(vnode, viewport, "column");
    const frame = frameFromOps(ops, viewport);
    const pushes = collectPushClips(ops);

    assert.equal(
      pushes.some((clip) => clip.x === 0 && clip.y === 0 && clip.w === 3 && clip.h === 1),
      true,
    );
    assert.equal(cellAt(frame, 2, 0), "C");
    assert.equal(cellAt(frame, 3, 0), " ");
  });

  test("inner clip pop restores parent depth before sibling draw", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.row({ width: 12, height: 1, overflow: "hidden" }, [
      ui.row({ width: 4, height: 1, overflow: "hidden" }, [ui.text("123456")]),
      ui.text("ZZ"),
    ]);

    const ops = renderOps(vnode, viewport, "row");
    const depths = drawDepths(ops);
    const inner = depths.find((d) => d.text.includes("123456"));
    const sibling = depths.find((d) => d.text.includes("ZZ"));

    assert.ok(inner !== undefined, "inner draw exists");
    assert.ok(sibling !== undefined, "sibling draw exists");
    if (!inner || !sibling) return;

    const hasPopBetween = ops
      .slice(inner.index + 1, sibling.index)
      .some((op) => op.kind === "popClip");

    assert.equal(inner.depth > sibling.depth, true);
    assert.equal(hasPopBetween, true);
    assert.equal(cellAt(frameFromOps(ops, viewport), 4, 0), "Z");
  });

  test("later sibling text remains visible after deeper nested clipping", () => {
    const viewport = { cols: 24, rows: 4 };
    const vnode = ui.row({ width: 14, height: 1, overflow: "hidden" }, [
      ui.row({ width: 5, height: 1, overflow: "hidden" }, [
        ui.row({ width: 5, height: 1, ml: 3, overflow: "hidden" }, [ui.text("ABCDE")]),
      ]),
      ui.text("OK"),
    ]);

    const frame = frameFromOps(renderOps(vnode, viewport, "row"), viewport);
    assert.equal(rowText(frame, 0).includes("OK"), true);
  });

  test("push and pop operations remain balanced in mixed clip trees", () => {
    const viewport = { cols: 30, rows: 12 };
    const vnode = ui.column({ width: 20, height: 8, overflow: "hidden" }, [
      ui.box({ width: 10, height: 5, border: "single", p: 1, overflow: "hidden" }, [
        ui.text("abcdef", { textOverflow: "clip", maxWidth: 2 }),
      ]),
      ui.row({ width: 5, height: 1, overflow: "hidden" }, [ui.text("x")]),
    ]);

    const ops = renderOps(vnode, viewport, "column");
    const pushes = collectPushClips(ops).length;
    const pops = countPops(ops);

    assert.equal(pushes, pops);
    assert.equal(maxClipDepth(ops) >= 3, true);
  });

  test("empty 0-width content clip hides children in a bordered 2-cell box", () => {
    const viewport = { cols: 20, rows: 6 };
    const vnode = ui.box({ width: 2, height: 4, border: "single", overflow: "hidden" }, [
      ui.text("HIDDEN"),
    ]);

    const ops = renderOps(vnode, viewport, "column");
    const frame = frameFromOps(ops, viewport);

    assert.equal(
      collectPushClips(ops).some((clip) => clip.w === 0),
      true,
    );
    assert.equal(frame.cells.includes("H"), false);
  });

  test("empty 0-height content clip hides children in a bordered 2-row box", () => {
    const viewport = { cols: 20, rows: 6 };
    const vnode = ui.box({ width: 6, height: 2, border: "single", overflow: "hidden" }, [
      ui.text("T"),
    ]);

    const ops = renderOps(vnode, viewport, "column");
    const frame = frameFromOps(ops, viewport);

    assert.equal(
      collectPushClips(ops).some((clip) => clip.h === 0),
      true,
    );
    assert.equal(frame.cells.includes("T"), false);
  });

  test("padding can create a 0-width row clip deterministically", () => {
    const viewport = { cols: 12, rows: 4 };
    const vnode = ui.row({ width: 1, height: 1, p: 1, overflow: "hidden" }, [ui.text("Q")]);

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);

    assert.equal(
      collectPushClips(ops).some((clip) => clip.w === 0),
      true,
    );
    assert.equal(frame.cells.includes("Q"), false);
  });

  test("nested clips can collapse to an empty intersection", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = ui.row({ width: 3, height: 1, overflow: "hidden" }, [
      ui.row({ width: 4, height: 1, ml: 2, overflow: "hidden" }, [ui.text("QWER")]),
    ]);

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);

    const pushes = collectPushClips(ops);
    assert.equal(pushes.length >= 2, true);
    assert.equal(cellAt(frame, 2, 0), "Q");
    assert.equal(cellAt(frame, 3, 0), " ");
  });

  test("deep nesting (12 levels) keeps leaf visible and tracks max depth", () => {
    const viewport = { cols: 20, rows: 4 };
    const vnode = makeDeepNestedRows(11, 1, ui.text("Z"));

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);

    assert.equal(maxClipDepth(ops) >= 12, true);
    assert.equal(cellAt(frame, 11, 0), "Z");
  });

  test("deep nesting (12 levels) can fully clip the leaf by cumulative offsets", () => {
    const viewport = { cols: 24, rows: 4 };
    const vnode = makeDeepNestedRows(
      11,
      1,
      ui.row({ width: 12, height: 1, ml: 12, overflow: "hidden" }, [ui.text("Z")]),
    );

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);

    assert.equal(maxClipDepth(ops) >= 12, true);
    assert.equal(frame.cells.includes("Z"), false);
  });

  test("deep nesting plus leaf overflow clip remains balanced", () => {
    const viewport = { cols: 24, rows: 4 };
    const vnode = makeDeepNestedRows(11, 1, ui.text("LONG", { textOverflow: "clip", maxWidth: 1 }));

    const ops = renderOps(vnode, viewport, "row");
    const frame = frameFromOps(ops, viewport);

    assert.equal(collectPushClips(ops).length, countPops(ops));
    assert.equal(maxClipDepth(ops) >= 13, true);
    assert.equal(frame.cells.includes("L"), true);
  });

  test("bottom boundary stays exclusive for content shifted below a one-row clip", () => {
    const viewport = { cols: 16, rows: 6 };
    const vnode = ui.box({ width: 6, height: 3, border: "single", overflow: "hidden" }, [
      ui.row({ width: 4, height: 1, mt: 1, overflow: "hidden" }, [ui.text("B")]),
    ]);

    const ops = renderOps(vnode, viewport, "column");
    const frame = frameFromOps(ops, viewport);

    assert.equal(
      collectPushClips(ops).some(
        (clip) => clip.x === 1 && clip.y === 1 && clip.w === 4 && clip.h === 1,
      ),
      true,
    );
    assert.equal(frame.cells.includes("B"), false);
  });
});
