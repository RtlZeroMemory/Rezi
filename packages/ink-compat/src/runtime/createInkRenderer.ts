/**
 * packages/ink-compat/src/runtime/createInkRenderer.ts — Optimized production renderer.
 *
 * Replaces createTestRenderer with a renderer that mirrors widgetRenderer's
 * optimizations: layout stability signatures, measure/tree caches, pooled
 * collections, and no unnecessary work.
 */

import {
  type DrawlistBuildResult,
  type DrawlistBuilder,
  type TextStyle,
  type Theme,
  type VNode,
  defaultTheme as coreDefaultTheme,
  measureTextCells,
} from "@rezi-ui/core";

/** Local mirror of DrawlistTextRunSegment (not publicly exported from core). */
type TextRunSegment = Readonly<{ text: string; style?: TextStyle }>;
import {
  type InstanceId,
  type InstanceIdAllocator,
  type LayoutTree,
  type RuntimeInstance,
  collectSelfDirtyInstanceIds,
  commitVNodeTree,
  computeDirtyLayoutSet,
  createInstanceIdAllocator,
  instanceDirtySetToVNodeDirtySet,
  layout,
  renderToDrawlist,
} from "@rezi-ui/core/pipeline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InkRenderTimings = Readonly<{
  commitMs: number;
  layoutMs: number;
  drawMs: number;
  totalMs: number;
  layoutSkipped: boolean;
  _layoutProfile?: unknown;
}>;

export type InkRenderNode = Readonly<{
  kind: string;
  rect: Readonly<{ x: number; y: number; w: number; h: number }>;
  props: Readonly<Record<string, unknown>>;
}>;

export type InkRenderOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

export type InkRenderResult = Readonly<{
  ops: readonly InkRenderOp[];
  nodes: readonly InkRenderNode[];
  timings: InkRenderTimings;
}>;

export type InkRendererViewport = Readonly<{ cols: number; rows: number }>;

export type InkRendererTraceEvent = Readonly<{
  renderId: number;
  viewport: InkRendererViewport;
  focusedId: string | null;
  tick: number;
  timings: Readonly<{
    commitMs: number;
    layoutMs: number;
    drawMs: number;
    textMs: number;
    totalMs: number;
  }>;
  nodeCount: number;
  opCount: number;
  opCounts: Readonly<Record<InkRenderOp["kind"], number>>;
  clipDepthMax: number;
  textChars: number;
  textLines: number;
  nonBlankLines: number;
  widestLine: number;
  minRectY: number;
  maxRectBottom: number;
  zeroHeightRects: number;
  detailIncluded: boolean;
  layoutSkipped: boolean;
  nodes?: readonly InkRenderNode[];
  ops?: readonly InkRenderOp[];
  text?: string;
}>;

export type InkRendererOptions = Readonly<{
  viewport?: InkRendererViewport;
  theme?: Theme;
  trace?: (event: InkRendererTraceEvent) => void;
  traceDetail?: boolean;
}>;

export type InkRenderOptions = Readonly<{
  viewport?: InkRendererViewport;
  forceLayout?: boolean;
}>;

export type InkRenderer = Readonly<{
  render: (vnode: VNode, opts?: InkRenderOptions) => InkRenderResult;
  reset: () => void;
}>;

// ---------------------------------------------------------------------------
// RecordingDrawlistBuilder — records ops as JS objects (reusable per frame)
// ---------------------------------------------------------------------------

class RecordingDrawlistBuilder implements DrawlistBuilder {
  private _ops: InkRenderOp[] = [];
  private _prevOps: InkRenderOp[] = [];
  private readonly textRunBlobs: Array<readonly TextRunSegment[]> = [];

  clear(): void {
    this._ops.push({ kind: "clear" });
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    if (style === undefined) {
      this._ops.push({ kind: "clearTo", cols, rows });
      return;
    }
    this._ops.push({ kind: "clearTo", cols, rows, style });
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    if (style === undefined) {
      this._ops.push({ kind: "fillRect", x, y, w, h });
      return;
    }
    this._ops.push({ kind: "fillRect", x, y, w, h, style });
  }

  drawText(x: number, y: number, text: string, style?: TextStyle): void {
    if (style === undefined) {
      this._ops.push({ kind: "drawText", x, y, text });
      return;
    }
    this._ops.push({ kind: "drawText", x, y, text, style });
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this._ops.push({ kind: "pushClip", x, y, w, h });
  }

  popClip(): void {
    this._ops.push({ kind: "popClip" });
  }

  addBlob(_bytes: Uint8Array): number | null {
    return null;
  }

  addTextRunBlob(segments: readonly TextRunSegment[]): number | null {
    const index = this.textRunBlobs.length;
    this.textRunBlobs.push(segments);
    return index;
  }

  drawTextRun(x: number, y: number, blobIndex: number): void {
    const blob = this.textRunBlobs[blobIndex];
    if (!blob) return;

    let cursorX = x;
    for (const segment of blob) {
      const text = segment.text;
      if (text.length > 0) {
        const style = segment.style;
        if (style === undefined) {
          this._ops.push({ kind: "drawText", x: cursorX, y, text });
        } else {
          this._ops.push({ kind: "drawText", x: cursorX, y, text, style });
        }
        cursorX += measureTextCells(text);
      }
    }
  }

  setCursor(_state: {
    x: number;
    y: number;
    shape: number;
    visible: boolean;
    blink: boolean;
  }): void {}

  hideCursor(): void {}

  blitRect(
    _srcX: number,
    _srcY: number,
    _w: number,
    _h: number,
    _dstX: number,
    _dstY: number,
  ): void {}

  setLink(_uri: string | null, _id?: string): void {}

  drawCanvas(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _blobIndex: number,
    _blitter: "auto" | "braille" | "sextant" | "quadrant" | "halfblock" | "ascii",
    _pxWidth?: number,
    _pxHeight?: number,
  ): void {}

  drawImage(
    _x: number,
    _y: number,
    _w: number,
    _h: number,
    _blobIndex: number,
    _format: "rgba" | "png",
    _protocol: "auto" | "kitty" | "sixel" | "iterm2" | "blitter",
    _zLayer: -1 | 0 | 1,
    _fit: "fill" | "contain" | "cover",
    _imageId: number,
    _pxWidth?: number,
    _pxHeight?: number,
  ): void {}

  build(): DrawlistBuildResult {
    return { ok: true, bytes: new Uint8Array(0) };
  }

  buildInto(_dst: Uint8Array): DrawlistBuildResult {
    return this.build();
  }

  reset(): void {
    this._ops.length = 0;
    this._prevOps.length = 0;
    this.textRunBlobs.length = 0;
  }

  /** Clear ops for next frame without re-allocating the builder. */
  clearOps(): void {
    this._ops.length = 0;
    this.textRunBlobs.length = 0;
  }

  swapAndGetOps(): readonly InkRenderOp[] {
    const out = this._ops;
    this._ops = this._prevOps;
    this._ops.length = 0;
    this._prevOps = out;
    return out;
  }
}

// ---------------------------------------------------------------------------
// collectNodes — lean variant (no findText/findById, no frozen paths)
// ---------------------------------------------------------------------------

function asPropsRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null) return {};
  return { ...(value as Record<string, unknown>) };
}

function collectNodes(layoutTree: LayoutTree): readonly InkRenderNode[] {
  const out: InkRenderNode[] = [];

  const walk = (node: LayoutTree): void => {
    const props = asPropsRecord((node.vnode as { props?: unknown }).props);
    out.push({
      kind: node.vnode.kind,
      rect: node.rect,
      props,
    });

    for (let i = 0; i < node.children.length; i++) {
      const child = node.children[i];
      if (!child) continue;
      walk(child);
    }
  };

  walk(layoutTree);
  return out;
}

// ---------------------------------------------------------------------------
// opsToText — kept for trace callback compatibility
// ---------------------------------------------------------------------------

type ClipRect = Readonly<{ x: number; y: number; w: number; h: number }>;

function inClipStack(x: number, y: number, clipStack: readonly ClipRect[]): boolean {
  for (const clip of clipStack) {
    if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
  }
  return true;
}

function drawTextToGrid(
  grid: string[][],
  viewport: InkRendererViewport,
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
  viewport: InkRendererViewport,
  clipStack: readonly ClipRect[],
  rect: Readonly<{ x: number; y: number; w: number; h: number }>,
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

function opsToText(ops: readonly InkRenderOp[], viewport: InkRendererViewport): string {
  const grid: string[][] = [];
  for (let y = 0; y < viewport.rows; y++) {
    grid.push(new Array(viewport.cols).fill(" "));
  }
  const clipStack: ClipRect[] = [];

  for (const op of ops) {
    if (op.kind === "clear") {
      fillGridRect(grid, viewport, clipStack, { x: 0, y: 0, w: viewport.cols, h: viewport.rows });
      continue;
    }
    if (op.kind === "clearTo") {
      fillGridRect(grid, viewport, clipStack, { x: 0, y: 0, w: op.cols, h: op.rows });
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

// ---------------------------------------------------------------------------
// Trace helpers (match createTestRenderer's trace event shape)
// ---------------------------------------------------------------------------

function createZeroOpCounts(): Record<InkRenderOp["kind"], number> {
  return {
    clear: 0,
    clearTo: 0,
    fillRect: 0,
    drawText: 0,
    pushClip: 0,
    popClip: 0,
  };
}

function summarizeOps(
  ops: readonly InkRenderOp[],
): Readonly<{ opCounts: Readonly<Record<InkRenderOp["kind"], number>>; clipDepthMax: number }> {
  const opCounts = createZeroOpCounts();
  let clipDepth = 0;
  let clipDepthMax = 0;

  for (const op of ops) {
    opCounts[op.kind] += 1;
    if (op.kind === "pushClip") {
      clipDepth += 1;
      clipDepthMax = Math.max(clipDepthMax, clipDepth);
    } else if (op.kind === "popClip") {
      clipDepth = Math.max(0, clipDepth - 1);
    }
  }

  return { opCounts, clipDepthMax };
}

function summarizeNodes(
  nodes: readonly InkRenderNode[],
): Readonly<{ minRectY: number; maxRectBottom: number; zeroHeightRects: number }> {
  let minRectY = Number.POSITIVE_INFINITY;
  let maxRectBottom = 0;
  let zeroHeightRects = 0;

  for (const node of nodes) {
    const y = node.rect.y;
    const h = node.rect.h;
    minRectY = Math.min(minRectY, y);
    maxRectBottom = Math.max(maxRectBottom, y + h);
    if (h === 0) zeroHeightRects += 1;
  }

  return {
    minRectY: Number.isFinite(minRectY) ? minRectY : -1,
    maxRectBottom,
    zeroHeightRects,
  };
}

function summarizeText(
  text: string,
): Readonly<{ textChars: number; textLines: number; nonBlankLines: number; widestLine: number }> {
  const lines = text.split("\n");
  let nonBlankLines = 0;
  let widestLine = 0;

  for (const line of lines) {
    widestLine = Math.max(widestLine, line.length);
    if (line.trimEnd().length > 0) nonBlankLines += 1;
  }

  return { textChars: text.length, textLines: lines.length, nonBlankLines, widestLine };
}

// ---------------------------------------------------------------------------
// Viewport normalization
// ---------------------------------------------------------------------------

function normalizeViewport(viewport: InkRendererViewport | undefined): InkRendererViewport {
  const cols = viewport?.cols ?? 80;
  const rows = viewport?.rows ?? 24;
  const safeCols = Number.isFinite(cols) ? Math.max(0, Math.trunc(cols)) : 0;
  const safeRows = Number.isFinite(rows) ? Math.max(0, Math.trunc(rows)) : 0;
  return { cols: safeCols, rows: safeRows };
}

// ---------------------------------------------------------------------------
// Debug helpers (temporary — remove after investigation)
// ---------------------------------------------------------------------------

function countSelfDirty(root: RuntimeInstance | null): number {
  if (!root) return 0;
  let count = 0;
  const stack: RuntimeInstance[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (node.selfDirty) count++;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) stack.push(child);
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// createInkRenderer — optimized production renderer
// ---------------------------------------------------------------------------

export function createInkRenderer(opts: InkRendererOptions = {}): InkRenderer {
  // --- Persistent state (survives across frames) ---
  let prevRoot: RuntimeInstance | null = null;
  let allocator: InstanceIdAllocator = createInstanceIdAllocator(1);
  let cachedLayoutTree: LayoutTree | null = null;

  const defaultViewport = normalizeViewport(opts.viewport);
  const rendererTheme: Theme = opts.theme ?? coreDefaultTheme;
  const trace = opts.trace;
  const defaultTraceDetail = opts.traceDetail === true;

  // Layout caches (WeakMap — GC-friendly, survives across frames)
  const layoutMeasureCache = new WeakMap<VNode, unknown>();
  const layoutTreeCache = new WeakMap<VNode, unknown>();

  const runtimeStack: RuntimeInstance[] = [];

  // Dirty set pools (reused across frames)
  const pooledDirtyLayoutInstanceIds: InstanceId[] = [];

  // Recording builder (reused, cleared each frame)
  const builder = new RecordingDrawlistBuilder();

  let renderId = 0;

  // Cached result for early-skip optimization
  let cachedOps: readonly InkRenderOp[] = [];
  let cachedNodes: readonly InkRenderNode[] = [];
  let cachedViewport: InkRendererViewport | null = null;

  const render = (vnode: VNode, renderOpts: InkRenderOptions = {}): InkRenderResult => {
    const t0 = performance.now();
    renderId += 1;

    const viewport = normalizeViewport(renderOpts.viewport ?? defaultViewport);
    const forceLayout = renderOpts.forceLayout === true;
    const viewportChanged =
      cachedViewport === null ||
      cachedViewport.cols !== viewport.cols ||
      cachedViewport.rows !== viewport.rows;

    // ─── COMMIT ───
    const commitStartedAt = performance.now();
    const isFirstFrame = prevRoot === null;
    const committed = commitVNodeTree(prevRoot, vnode, { allocator });
    const commitMs = performance.now() - commitStartedAt;
    if (!committed.ok) {
      throw new Error(
        `createInkRenderer: commit failed: ${committed.fatal.code}: ${committed.fatal.detail}`,
      );
    }
    prevRoot = committed.value.root;

    // ─── EARLY SKIP: nothing changed ───
    // After commit with in-place mutation, if root.dirty is false, the entire
    // tree is unchanged. Skip layout, draw, and collect entirely.
    if (
      !isFirstFrame &&
      !forceLayout &&
      !prevRoot.dirty &&
      cachedLayoutTree !== null &&
      !viewportChanged
    ) {
      const totalMs = performance.now() - t0;
      if (trace) {
        const textStartedAt = performance.now();
        const screenText = opsToText(cachedOps, viewport);
        const textMs = performance.now() - textStartedAt;
        const opSummary = summarizeOps(cachedOps);
        const nodeSummary = summarizeNodes(cachedNodes);
        const textSummary = summarizeText(screenText);
        trace({
          renderId,
          viewport,
          focusedId: null,
          tick: 0,
          timings: { commitMs, layoutMs: 0, drawMs: 0, textMs, totalMs },
          nodeCount: cachedNodes.length,
          opCount: cachedOps.length,
          opCounts: opSummary.opCounts,
          clipDepthMax: opSummary.clipDepthMax,
          textChars: textSummary.textChars,
          textLines: textSummary.textLines,
          nonBlankLines: textSummary.nonBlankLines,
          widestLine: textSummary.widestLine,
          minRectY: nodeSummary.minRectY,
          maxRectBottom: nodeSummary.maxRectBottom,
          zeroHeightRects: nodeSummary.zeroHeightRects,
          detailIncluded: defaultTraceDetail,
          layoutSkipped: true,
          ...(defaultTraceDetail ? { nodes: cachedNodes, ops: cachedOps, text: screenText } : {}),
        });
      }
      return {
        ops: cachedOps,
        nodes: cachedNodes,
        timings: { commitMs, layoutMs: 0, drawMs: 0, totalMs, layoutSkipped: true },
      };
    }

    // ─── DIRTY SET ───
    let layoutDirtyVNodeSet: Set<VNode> | null = null;
    if (!isFirstFrame && !forceLayout) {
      collectSelfDirtyInstanceIds(prevRoot, pooledDirtyLayoutInstanceIds, runtimeStack);
      const dirtyInstanceIds = computeDirtyLayoutSet(
        prevRoot,
        committed.value.mountedInstanceIds,
        pooledDirtyLayoutInstanceIds,
      );
      layoutDirtyVNodeSet = instanceDirtySetToVNodeDirtySet(prevRoot, dirtyInstanceIds);
    }

    // ─── LAYOUT ───
    const layoutStartedAt = performance.now();
    const layoutRes = layout(
      prevRoot.vnode,
      0,
      0,
      viewport.cols,
      viewport.rows,
      "column",
      layoutMeasureCache,
      layoutTreeCache,
      layoutDirtyVNodeSet,
    );
    if (!layoutRes.ok) {
      throw new Error(
        `createInkRenderer: layout failed: ${layoutRes.fatal.code}: ${layoutRes.fatal.detail}`,
      );
    }
    cachedLayoutTree = layoutRes.value;
    const layoutMs = performance.now() - layoutStartedAt;

    // ─── RENDER TO DRAWLIST ───
    const drawStartedAt = performance.now();
    builder.clearOps();
    renderToDrawlist({
      tree: prevRoot,
      layout: cachedLayoutTree,
      viewport,
      focusState: { focusedId: null },
      builder,
      theme: rendererTheme,
      tick: 0,
    });
    const drawMs = performance.now() - drawStartedAt;

    // ─── COLLECT ───
    const ops = builder.swapAndGetOps();
    const nodes = collectNodes(cachedLayoutTree);
    cachedOps = ops;
    cachedNodes = nodes;
    cachedViewport = viewport;
    const totalMs = performance.now() - t0;

    // ─── TRACE (when configured) ───
    if (trace) {
      const textStartedAt = performance.now();
      const screenText = opsToText(ops, viewport);
      const textMs = performance.now() - textStartedAt;

      const opSummary = summarizeOps(ops);
      const nodeSummary = summarizeNodes(nodes);
      const textSummary = summarizeText(screenText);
      trace({
        renderId,
        viewport,
        focusedId: null,
        tick: 0,
        timings: { commitMs, layoutMs, drawMs, textMs, totalMs },
        nodeCount: nodes.length,
        opCount: ops.length,
        opCounts: opSummary.opCounts,
        clipDepthMax: opSummary.clipDepthMax,
        textChars: textSummary.textChars,
        textLines: textSummary.textLines,
        nonBlankLines: textSummary.nonBlankLines,
        widestLine: textSummary.widestLine,
        minRectY: nodeSummary.minRectY,
        maxRectBottom: nodeSummary.maxRectBottom,
        zeroHeightRects: nodeSummary.zeroHeightRects,
        detailIncluded: defaultTraceDetail,
        layoutSkipped: false,
        ...(defaultTraceDetail ? { nodes, ops, text: screenText } : {}),
      });
    }

    return {
      ops,
      nodes,
      timings: { commitMs, layoutMs, drawMs, totalMs, layoutSkipped: false },
    };
  };

  const reset = (): void => {
    prevRoot = null;
    cachedLayoutTree = null;
    cachedOps = [];
    cachedNodes = [];
    cachedViewport = null;
    allocator = createInstanceIdAllocator(1);
  };

  return { render, reset };
}
