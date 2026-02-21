/**
 * packages/core/src/testing/renderer.ts — High-level widget test renderer.
 *
 * Why: Widget tests should not manually wire commit -> layout -> drawlist.
 * This helper runs the full pipeline and exposes semantic query helpers.
 */

import type {
  DrawlistBuildResult,
  DrawlistBuilderV1,
  DrawlistTextRunSegment,
} from "../drawlist/types.js";
import type { LayoutTree } from "../layout/layout.js";
import { layout } from "../layout/layout.js";
import { measureTextCells } from "../layout/textMeasure.js";
import type { Rect } from "../layout/types.js";
import { renderToDrawlist } from "../renderer/renderToDrawlist.js";
import { type RuntimeInstance, commitVNodeTree } from "../runtime/commit.js";
import { type InstanceIdAllocator, createInstanceIdAllocator } from "../runtime/instance.js";
import { defaultTheme as coreDefaultTheme } from "../theme/defaultTheme.js";
import type { Theme } from "../theme/theme.js";
import type { TextStyle } from "../widgets/style.js";
import type { VNode } from "../widgets/types.js";

export type TestViewport = Readonly<{ cols: number; rows: number }>;
type TestNodeProps = Readonly<Record<string, unknown> & { id?: unknown; label?: unknown }>;

export type TestRendererOptions = Readonly<{
  viewport?: TestViewport;
  theme?: Theme;
  focusedId?: string | null;
  tick?: number;
}>;

export type TestRenderOptions = Readonly<{
  viewport?: TestViewport;
  theme?: Theme;
  focusedId?: string | null;
  tick?: number;
}>;

export type TestRenderNode = Readonly<{
  kind: VNode["kind"];
  rect: Rect;
  props: TestNodeProps;
  id: string | null;
  path: readonly number[];
  text?: string;
}>;

export type TestRenderResult = Readonly<{
  viewport: TestViewport;
  focusedId: string | null;
  nodes: readonly TestRenderNode[];
  findText: (text: string) => TestRenderNode | null;
  findById: (id: string) => TestRenderNode | null;
  findAll: (kind: VNode["kind"] | string) => readonly TestRenderNode[];
  toText: () => string;
}>;

export type TestRenderer = Readonly<{
  render: (vnode: VNode, opts?: TestRenderOptions) => TestRenderResult;
  reset: () => void;
}>;

type RecordedOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

type ClipRect = Readonly<{ x: number; y: number; w: number; h: number }>;

function normalizeViewport(viewport: TestViewport | undefined): TestViewport {
  const cols = viewport?.cols ?? 80;
  const rows = viewport?.rows ?? 24;
  const safeCols = Number.isFinite(cols) ? Math.max(0, Math.trunc(cols)) : 0;
  const safeRows = Number.isFinite(rows) ? Math.max(0, Math.trunc(rows)) : 0;
  return Object.freeze({ cols: safeCols, rows: safeRows });
}

function asPropsRecord(value: unknown): TestNodeProps {
  if (typeof value !== "object" || value === null) return Object.freeze({});
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

class RecordingDrawlistBuilder implements DrawlistBuilderV1 {
  private readonly ops: RecordedOp[] = [];
  private readonly textRunBlobs: Array<readonly DrawlistTextRunSegment[]> = [];

  clear(): void {
    this.ops.push({ kind: "clear" });
  }

  clearTo(cols: number, rows: number, _style?: TextStyle): void {
    this.ops.push({ kind: "clearTo", cols, rows });
  }

  fillRect(x: number, y: number, w: number, h: number, _style?: TextStyle): void {
    this.ops.push({ kind: "fillRect", x, y, w, h });
  }

  drawText(x: number, y: number, text: string, _style?: TextStyle): void {
    this.ops.push({ kind: "drawText", x, y, text });
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

  addTextRunBlob(segments: readonly DrawlistTextRunSegment[]): number | null {
    const index = this.textRunBlobs.length;
    this.textRunBlobs.push(segments.slice());
    return index;
  }

  drawTextRun(x: number, y: number, blobIndex: number): void {
    const blob = this.textRunBlobs[blobIndex];
    if (!blob) return;

    let cursorX = x;
    for (const segment of blob) {
      const text = segment.text;
      if (text.length > 0) {
        this.ops.push({ kind: "drawText", x: cursorX, y, text });
        cursorX += measureTextCells(text);
      }
    }
  }

  build(): DrawlistBuildResult {
    return { ok: true, bytes: new Uint8Array(0) };
  }

  reset(): void {
    this.ops.length = 0;
    this.textRunBlobs.length = 0;
  }

  snapshotOps(): readonly RecordedOp[] {
    return Object.freeze(this.ops.slice());
  }
}

function collectNodes(layoutTree: LayoutTree): readonly TestRenderNode[] {
  const out: TestRenderNode[] = [];

  const walk = (node: LayoutTree, path: readonly number[]): void => {
    const props = asPropsRecord((node.vnode as { props?: unknown }).props);
    const rawId = props.id;
    const id = typeof rawId === "string" ? rawId : null;

    const base: TestRenderNode = Object.freeze({
      kind: node.vnode.kind,
      rect: node.rect,
      props,
      id,
      path: Object.freeze(path.slice()),
      ...(node.vnode.kind === "text"
        ? { text: (node.vnode as Readonly<{ text: string }>).text }
        : {}),
    });
    out.push(base);

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      walk(child, Object.freeze([...path, i]));
    }
  };

  walk(layoutTree, Object.freeze([]));
  return Object.freeze(out);
}

function inClipStack(x: number, y: number, clipStack: readonly ClipRect[]): boolean {
  for (const clip of clipStack) {
    if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
  }
  return true;
}

function drawTextToGrid(
  grid: string[][],
  viewport: TestViewport,
  clipStack: readonly ClipRect[],
  x0: number,
  y: number,
  text: string,
): void {
  if (y < 0 || y >= viewport.rows) return;
  let x = x0;
  for (const glyph of text) {
    const width = measureTextCells(glyph);
    if (width <= 0) continue;

    if (x >= 0 && x < viewport.cols && inClipStack(x, y, clipStack)) {
      const row = grid[y];
      if (row) row[x] = glyph;
    }

    for (let i = 1; i < width; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= viewport.cols || !inClipStack(xx, y, clipStack)) continue;
      const row = grid[y];
      if (row) row[xx] = " ";
    }

    x += width;
  }
}

function fillGridRect(
  grid: string[][],
  viewport: TestViewport,
  clipStack: readonly ClipRect[],
  rect: Rect,
): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    if (y < 0 || y >= viewport.rows) continue;
    const row = grid[y];
    if (!row) continue;
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (x < 0 || x >= viewport.cols || !inClipStack(x, y, clipStack)) continue;
      row[x] = " ";
    }
  }
}

function opsToText(ops: readonly RecordedOp[], viewport: TestViewport): string {
  const grid: string[][] = [];
  for (let y = 0; y < viewport.rows; y++) {
    grid.push(new Array(viewport.cols).fill(" "));
  }
  const clipStack: ClipRect[] = [];

  for (const op of ops) {
    if (op.kind === "clear") {
      fillGridRect(
        grid,
        viewport,
        clipStack,
        Object.freeze({ x: 0, y: 0, w: viewport.cols, h: viewport.rows }),
      );
      continue;
    }

    if (op.kind === "clearTo") {
      fillGridRect(
        grid,
        viewport,
        clipStack,
        Object.freeze({ x: 0, y: 0, w: op.cols, h: op.rows }),
      );
      continue;
    }

    if (op.kind === "fillRect") {
      fillGridRect(grid, viewport, clipStack, op);
      continue;
    }

    if (op.kind === "drawText") {
      drawTextToGrid(grid, viewport, clipStack, op.x, op.y, op.text);
      continue;
    }

    if (op.kind === "pushClip") {
      clipStack.push({ x: op.x, y: op.y, w: op.w, h: op.h });
      continue;
    }

    if (op.kind === "popClip") {
      clipStack.pop();
    }
  }

  const lines = grid.map((row) => row.join("").replace(/\s+$/u, ""));
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

function findById(nodes: readonly TestRenderNode[], id: string): TestRenderNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
  }
  return null;
}

function findText(nodes: readonly TestRenderNode[], text: string): TestRenderNode | null {
  let partial: TestRenderNode | null = null;
  for (const node of nodes) {
    if (node.kind !== "text" || node.text === undefined) continue;
    if (node.text === text) return node;
    if (partial === null && node.text.includes(text)) partial = node;
  }
  return partial;
}

function findAll(
  nodes: readonly TestRenderNode[],
  kind: VNode["kind"] | string,
): readonly TestRenderNode[] {
  const out: TestRenderNode[] = [];
  for (const node of nodes) {
    if (node.kind === kind) out.push(node);
  }
  return Object.freeze(out);
}

function layoutRootOrThrow(root: RuntimeInstance, viewport: TestViewport): LayoutTree {
  const layoutRes = layout(root.vnode, 0, 0, viewport.cols, viewport.rows, "column");
  if (layoutRes.ok) return layoutRes.value;
  throw new Error(
    `createTestRenderer: layout failed: ${layoutRes.fatal.code}: ${layoutRes.fatal.detail}`,
  );
}

/**
 * Create a high-level renderer for deterministic widget tests.
 *
 * Repeated `render(...)` calls reuse committed runtime state so tests can model
 * real update sequences without manual commit/layout plumbing.
 */
export function createTestRenderer(opts: TestRendererOptions = {}): TestRenderer {
  let prevRoot: RuntimeInstance | null = null;
  let allocator: InstanceIdAllocator = createInstanceIdAllocator(1);
  const defaultViewport = normalizeViewport(opts.viewport);
  const rendererTheme = opts.theme ?? coreDefaultTheme;
  const defaultFocusedId = opts.focusedId ?? null;
  const defaultTick = opts.tick ?? 0;

  const render = (vnode: VNode, renderOpts: TestRenderOptions = {}): TestRenderResult => {
    const viewport = normalizeViewport(renderOpts.viewport ?? defaultViewport);
    const focusedId = renderOpts.focusedId === undefined ? defaultFocusedId : renderOpts.focusedId;
    const tick = renderOpts.tick ?? defaultTick;
    const theme = renderOpts.theme ?? rendererTheme;

    const committed = commitVNodeTree(prevRoot, vnode, { allocator });
    if (!committed.ok) {
      throw new Error(
        `createTestRenderer: commit failed: ${committed.fatal.code}: ${committed.fatal.detail}`,
      );
    }
    prevRoot = committed.value.root;

    const layoutTree = layoutRootOrThrow(prevRoot, viewport);
    const builder = new RecordingDrawlistBuilder();
    renderToDrawlist({
      tree: prevRoot,
      layout: layoutTree,
      viewport,
      focusState: Object.freeze({ focusedId }),
      builder,
      theme,
      tick,
    });

    const nodes = collectNodes(layoutTree);
    const screenText = opsToText(builder.snapshotOps(), viewport);
    return Object.freeze({
      viewport,
      focusedId,
      nodes,
      findText: (text: string) => findText(nodes, text),
      findById: (id: string) => findById(nodes, id),
      findAll: (kind: VNode["kind"] | string) => findAll(nodes, kind),
      toText: () => screenText,
    });
  };

  const reset = (): void => {
    prevRoot = null;
    allocator = createInstanceIdAllocator(1);
  };

  return Object.freeze({ render, reset });
}
