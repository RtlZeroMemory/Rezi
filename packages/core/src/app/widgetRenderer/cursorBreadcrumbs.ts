import type { DrawlistBuilderV2 } from "../../drawlist/index.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import type { Rect } from "../../layout/types.js";
import type { CursorInfo } from "../../renderer/renderToDrawlist.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusManagerState } from "../../runtime/focus.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { InputMeta } from "../../runtime/widgetMeta.js";
import type { Theme } from "../../theme/theme.js";
import type { CodeEditorProps, CommandPaletteProps } from "../../widgets/types.js";
import type {
  RuntimeBreadcrumbCursorSummary,
  RuntimeBreadcrumbDamageMode,
  WidgetRuntimeBreadcrumbSnapshot,
} from "../runtimeBreadcrumbs.js";
import type { CodeEditorRenderCache } from "./renderCaches.js";

export type CursorBreadcrumbViewport = Readonly<{ cols: number; rows: number }>;

type ResolveRuntimeCursorSummaryContext = Readonly<{
  focusedId: string | null;
  inputById: ReadonlyMap<string, InputMeta>;
  pooledRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  inputCursorByInstanceId: ReadonlyMap<InstanceId, number>;
  codeEditorById: ReadonlyMap<string, CodeEditorProps>;
  rectById: ReadonlyMap<string, Rect>;
  codeEditorRenderCacheById: ReadonlyMap<string, CodeEditorRenderCache>;
  commandPaletteById: ReadonlyMap<string, CommandPaletteProps>;
}>;

type EmitIncrementalCursorContext = ResolveRuntimeCursorSummaryContext &
  Readonly<{
    collectRuntimeBreadcrumbs: boolean;
    builder: unknown;
  }>;

type UpdateRuntimeBreadcrumbSnapshotContext = Readonly<{
  collectRuntimeBreadcrumbs: boolean;
  focusState: FocusManagerState;
  focusAnnouncement: string | null;
}>;

type SnapshotRenderedFrameStateParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  viewport: CursorBreadcrumbViewport;
  theme: Theme;
  doLayout: boolean;
  focusAnnouncement: string | null;
  focusedId: string | null;
  pooledRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  pooledRectById: ReadonlyMap<string, Rect>;
  pooledDamageRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  pooledDamageRectById: ReadonlyMap<string, Rect>;
  prevFrameRectByInstanceId: Map<InstanceId, Rect>;
  prevFrameRectById: Map<string, Rect>;
  prevFrameDamageRectByInstanceId: Map<InstanceId, Rect>;
  prevFrameDamageRectById: Map<string, Rect>;
  prevFrameOpacityByInstanceId: Map<InstanceId, number>;
  pooledRuntimeStack: RuntimeInstance[];
  readContainerOpacity: (node: RuntimeInstance) => number;
}>;

const UTF8_LINE_FEED = 0x0a;

type CursorBuilderLike = Pick<DrawlistBuilderV2, "setCursor" | "hideCursor">;

function isCursorBuilder(builder: unknown): builder is CursorBuilderLike {
  return (
    typeof builder === "object" &&
    builder !== null &&
    typeof (builder as CursorBuilderLike).setCursor === "function" &&
    typeof (builder as CursorBuilderLike).hideCursor === "function"
  );
}

function wrapInputLineForCursor(line: string, width: number): readonly string[] {
  if (width <= 0) return Object.freeze([""]);
  if (line.length === 0) return Object.freeze([""]);

  const out: string[] = [];
  const cps = Array.from(line);
  let chunk = "";
  let chunkWidth = 0;
  for (const cp of cps) {
    const cpWidth = Math.max(0, measureTextCells(cp));
    if (chunk.length > 0 && chunkWidth + cpWidth > width) {
      out.push(chunk);
      chunk = cp;
      chunkWidth = cpWidth;
      continue;
    }
    chunk += cp;
    chunkWidth += cpWidth;
  }
  out.push(chunk);
  return Object.freeze(out);
}

function resolveInputMultilineCursor(
  value: string,
  cursorOffset: number,
  width: number,
  wordWrap: boolean,
): Readonly<{ visualLine: number; visualX: number; totalVisualLines: number }> {
  const clampedCursor = Math.max(0, Math.min(value.length, cursorOffset));

  const lineStarts: number[] = [];
  const lineEnds: number[] = [];
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === UTF8_LINE_FEED) {
      lineStarts.push(lineStart);
      lineEnds.push(i);
      lines.push(value.slice(lineStart, i));
      lineStart = i + 1;
    }
  }
  lineStarts.push(lineStart);
  lineEnds.push(value.length);
  lines.push(value.slice(lineStart));

  let lineIndex = Math.max(0, lines.length - 1);
  for (let i = 0; i < lineEnds.length; i++) {
    const end = lineEnds[i] ?? 0;
    if (clampedCursor <= end) {
      lineIndex = i;
      break;
    }
  }

  let visualLine = 0;
  for (let i = 0; i < lineIndex; i++) {
    const line = lines[i] ?? "";
    visualLine += wordWrap ? wrapInputLineForCursor(line, width).length : 1;
  }

  const currentLine = lines[lineIndex] ?? "";
  const currentStart = lineStarts[lineIndex] ?? 0;
  const currentEnd = lineEnds[lineIndex] ?? value.length;
  const col = Math.max(
    0,
    Math.min(Math.max(0, currentEnd - currentStart), clampedCursor - currentStart),
  );

  if (!wordWrap) {
    let totalVisualLines = 0;
    for (const _line of lines) totalVisualLines += 1;
    return Object.freeze({
      visualLine,
      visualX: measureTextCells(currentLine.slice(0, col)),
      totalVisualLines,
    });
  }

  const wrappedPrefix = wrapInputLineForCursor(currentLine.slice(0, col), width);
  const localWrappedLine = Math.max(0, wrappedPrefix.length - 1);
  const visualX = measureTextCells(wrappedPrefix[localWrappedLine] ?? "");
  let totalVisualLines = 0;
  for (const line of lines) totalVisualLines += wrapInputLineForCursor(line, width).length;
  return Object.freeze({
    visualLine: visualLine + localWrappedLine,
    visualX,
    totalVisualLines,
  });
}

export function resolveRuntimeCursorSummary(
  ctx: ResolveRuntimeCursorSummaryContext,
  cursorInfo: CursorInfo | undefined,
): RuntimeBreadcrumbCursorSummary | null {
  if (!cursorInfo) return null;

  const hidden: RuntimeBreadcrumbCursorSummary = Object.freeze({
    visible: false,
    shape: cursorInfo.shape,
    blink: cursorInfo.blink,
  });

  const focusedId = ctx.focusedId;
  if (!focusedId) return hidden;

  const input = ctx.inputById.get(focusedId);
  if (input && !input.disabled) {
    const rect = ctx.pooledRectByInstanceId.get(input.instanceId);
    if (!rect || rect.w <= 1 || rect.h <= 0) return hidden;

    const graphemeOffset = ctx.inputCursorByInstanceId.get(input.instanceId) ?? input.value.length;
    let cursorX = 0;
    let cursorY = rect.y;
    if (input.multiline) {
      const contentW = Math.max(1, rect.w - 2);
      const resolved = resolveInputMultilineCursor(
        input.value,
        graphemeOffset,
        contentW,
        input.wordWrap,
      );
      const maxStartVisual = Math.max(0, resolved.totalVisualLines - rect.h);
      const startVisual = Math.max(0, Math.min(maxStartVisual, resolved.visualLine - rect.h + 1));
      const localY = resolved.visualLine - startVisual;
      if (localY < 0 || localY >= rect.h) return hidden;
      cursorX = Math.max(0, Math.min(Math.max(0, rect.w - 2), resolved.visualX));
      cursorY = rect.y + localY;
    } else {
      cursorX = Math.max(
        0,
        Math.min(Math.max(0, rect.w - 2), measureTextCells(input.value.slice(0, graphemeOffset))),
      );
    }

    return Object.freeze({
      visible: true,
      x: rect.x + 1 + cursorX,
      y: cursorY,
      shape: cursorInfo.shape,
      blink: cursorInfo.blink,
    });
  }

  const editor = ctx.codeEditorById.get(focusedId);
  if (editor) {
    const rect = ctx.rectById.get(editor.id);
    if (!rect || rect.w <= 0 || rect.h <= 0) return hidden;
    const lineNumWidth =
      ctx.codeEditorRenderCacheById.get(editor.id)?.lineNumWidth ??
      (editor.lineNumbers === false ? 0 : Math.max(4, String(editor.lines.length).length + 1));
    const cy = editor.cursor.line - editor.scrollTop;
    if (cy < 0 || cy >= rect.h) return hidden;
    const cx = editor.cursor.column - editor.scrollLeft;
    const x = rect.x + lineNumWidth + cx;
    if (x < rect.x + lineNumWidth || x >= rect.x + rect.w) return hidden;
    return Object.freeze({
      visible: true,
      x,
      y: rect.y + cy,
      shape: cursorInfo.shape,
      blink: cursorInfo.blink,
    });
  }

  const palette = ctx.commandPaletteById.get(focusedId);
  if (palette?.open === true) {
    const rect = ctx.rectById.get(palette.id);
    if (!rect || rect.w <= 0 || rect.h <= 0) return hidden;
    const inputW = Math.max(0, rect.w - 6);
    if (inputW <= 0) return hidden;
    const qx = measureTextCells(palette.query);
    return Object.freeze({
      visible: true,
      x: rect.x + 4 + Math.min(qx, Math.max(0, inputW - 1)),
      y: rect.y + 1,
      shape: cursorInfo.shape,
      blink: cursorInfo.blink,
    });
  }

  return hidden;
}

export function emitIncrementalCursor(
  ctx: EmitIncrementalCursorContext,
  cursorInfo: CursorInfo | undefined,
): RuntimeBreadcrumbCursorSummary | null {
  const resolveSummary = () =>
    resolveRuntimeCursorSummary(
      {
        focusedId: ctx.focusedId,
        inputById: ctx.inputById,
        pooledRectByInstanceId: ctx.pooledRectByInstanceId,
        inputCursorByInstanceId: ctx.inputCursorByInstanceId,
        codeEditorById: ctx.codeEditorById,
        rectById: ctx.rectById,
        codeEditorRenderCacheById: ctx.codeEditorRenderCacheById,
        commandPaletteById: ctx.commandPaletteById,
      },
      cursorInfo,
    );

  const summary = resolveSummary();

  if (!cursorInfo || !isCursorBuilder(ctx.builder)) {
    return ctx.collectRuntimeBreadcrumbs ? summary : null;
  }

  if (!summary || !summary.visible) {
    ctx.builder.hideCursor();
    return ctx.collectRuntimeBreadcrumbs ? summary : null;
  }

  ctx.builder.setCursor({
    x: summary.x,
    y: summary.y,
    shape: summary.shape,
    visible: true,
    blink: summary.blink,
  });

  return ctx.collectRuntimeBreadcrumbs ? summary : null;
}

export function updateRuntimeBreadcrumbSnapshot(
  current: WidgetRuntimeBreadcrumbSnapshot,
  ctx: UpdateRuntimeBreadcrumbSnapshotContext,
  params: Readonly<{
    tick: number;
    commit: boolean;
    layout: boolean;
    incremental: boolean;
    damageMode: RuntimeBreadcrumbDamageMode;
    damageRectCount: number;
    damageArea: number;
    cursor: RuntimeBreadcrumbCursorSummary | null;
  }>,
): WidgetRuntimeBreadcrumbSnapshot {
  if (!ctx.collectRuntimeBreadcrumbs) return current;

  const activeTrapId =
    ctx.focusState.trapStack.length > 0
      ? (ctx.focusState.trapStack[ctx.focusState.trapStack.length - 1] ?? null)
      : null;

  return Object.freeze({
    focus: Object.freeze({
      focusedId: ctx.focusState.focusedId,
      activeZoneId: ctx.focusState.activeZoneId,
      activeTrapId,
      announcement: ctx.focusAnnouncement,
    }),
    cursor: params.cursor,
    damage: Object.freeze({
      mode: params.damageMode,
      rectCount: Math.max(0, params.damageRectCount),
      area: Math.max(0, params.damageArea),
    }),
    frame: Object.freeze({
      tick: params.tick,
      commit: params.commit,
      layout: params.layout,
      incremental: params.incremental,
      renderTimeMs: 0,
    }),
  });
}

export function snapshotRenderedFrameState(params: SnapshotRenderedFrameStateParams): Readonly<{
  hasRenderedFrame: boolean;
  lastRenderedViewport: CursorBreadcrumbViewport;
  lastRenderedThemeRef: Theme;
  lastRenderedFocusedId: string | null;
  lastRenderedFocusAnnouncement: string | null;
}> {
  if (params.doLayout) {
    params.prevFrameRectByInstanceId.clear();
    for (const [instanceId, rect] of params.pooledRectByInstanceId) {
      params.prevFrameRectByInstanceId.set(instanceId, rect);
    }
    params.prevFrameRectById.clear();
    for (const [id, rect] of params.pooledRectById) {
      params.prevFrameRectById.set(id, rect);
    }
  }

  params.prevFrameDamageRectByInstanceId.clear();
  for (const [instanceId, rect] of params.pooledDamageRectByInstanceId) {
    params.prevFrameDamageRectByInstanceId.set(instanceId, rect);
  }
  params.prevFrameDamageRectById.clear();
  for (const [id, rect] of params.pooledDamageRectById) {
    params.prevFrameDamageRectById.set(id, rect);
  }

  params.prevFrameOpacityByInstanceId.clear();
  params.pooledRuntimeStack.length = 0;
  params.pooledRuntimeStack.push(params.runtimeRoot);
  while (params.pooledRuntimeStack.length > 0) {
    const node = params.pooledRuntimeStack.pop();
    if (!node) continue;
    if (
      node.vnode.kind === "box" ||
      node.vnode.kind === "row" ||
      node.vnode.kind === "column" ||
      node.vnode.kind === "grid"
    ) {
      params.prevFrameOpacityByInstanceId.set(node.instanceId, params.readContainerOpacity(node));
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) params.pooledRuntimeStack.push(child);
    }
  }

  return Object.freeze({
    hasRenderedFrame: true,
    lastRenderedViewport: Object.freeze({ cols: params.viewport.cols, rows: params.viewport.rows }),
    lastRenderedThemeRef: params.theme,
    lastRenderedFocusedId: params.focusedId,
    lastRenderedFocusAnnouncement: params.focusAnnouncement,
  });
}
