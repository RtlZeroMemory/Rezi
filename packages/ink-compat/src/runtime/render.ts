import {
  createTestRenderer,
  measureTextCells,
  type Rgb,
  type TextStyle,
  type VNode,
} from "@rezi-ui/core";
import { appendFileSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import React from "react";

import type { InkHostContainer, InkHostNode } from "../reconciler/types.js";
import { enableTranslationTrace, flushTranslationTrace } from "../translation/traceCollector.js";
import { createBridge } from "./bridge.js";
import { InkContext } from "./context.js";
import { commitSync, createReactRoot } from "./reactHelpers.js";

export interface RenderOptions {
  stdout?: Writable;
  stdin?: Readable;
  stderr?: Writable;
  exitOnCtrlC?: boolean;
  patchConsole?: boolean;
  debug?: boolean;
  maxFps?: number;
  /** @jrichman/ink fork: announce screen reader changes */
  isScreenReaderEnabled?: boolean;
  /** @jrichman/ink fork: callback invoked after each render frame */
  onRender?: (metrics: { renderTime: number; output: string; staticOutput?: string }) => void;
  /** @jrichman/ink fork: use alternate terminal screen buffer */
  alternateBuffer?: boolean;
  /** @jrichman/ink fork: enable incremental rendering */
  incrementalRendering?: boolean;
}

export interface Instance {
  rerender(tree: React.ReactElement): void;
  unmount(): void;
  waitUntilExit(): Promise<void>;
  clear(): void;
  cleanup(): void;
}

interface ViewportSize {
  cols: number;
  rows: number;
}

interface ClipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CellStyle {
  fg?: Rgb;
  bg?: Rgb;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  inverse?: boolean;
}

interface StyledCell {
  char: string;
  style: CellStyle | undefined;
}

type RenderOp =
  | Readonly<{ kind: "clear" }>
  | Readonly<{ kind: "clearTo"; cols: number; rows: number; style?: TextStyle }>
  | Readonly<{ kind: "fillRect"; x: number; y: number; w: number; h: number; style?: TextStyle }>
  | Readonly<{ kind: "drawText"; x: number; y: number; text: string; style?: TextStyle }>
  | Readonly<{ kind: "pushClip"; x: number; y: number; w: number; h: number }>
  | Readonly<{ kind: "popClip" }>;

interface OutputShapeSummary {
  lines: number;
  nonBlankLines: number;
  firstNonBlankLine: number;
  lastNonBlankLine: number;
  widestLine: number;
}

interface HostTreeSummary {
  nodeCount: number;
  boxCount: number;
  scrollNodeCount: number;
  maxScrollTop: number;
  maxScrollLeft: number;
  rootScrollTop: number;
  rootOverflow: string;
  rootWidthProp: string;
  rootHeightProp: string;
  rootFlexGrowProp: string;
  rootFlexShrinkProp: string;
}

interface ResizeSignalRecord {
  at: number;
  phase: "signal" | "flush";
  source: string;
  viewport: ViewportSize;
}

interface ReziRendererTraceEvent {
  renderId: number;
  viewport: ViewportSize;
  focusedId: string | null;
  tick: number;
  timings: {
    commitMs: number;
    layoutMs: number;
    drawMs: number;
    textMs: number;
    totalMs: number;
  };
  nodeCount: number;
  opCount: number;
  clipDepthMax: number;
  textChars: number;
  textLines: number;
  nonBlankLines: number;
  widestLine: number;
  minRectY: number;
  maxRectBottom: number;
  zeroHeightRects: number;
  detailIncluded: boolean;
  nodes?: readonly unknown[];
  ops?: readonly unknown[];
  text?: string;
}

function readViewportSize(stdout: Writable, fallbackStdout: Writable): ViewportSize {
  const readPositiveInt = (value: unknown): number | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      return undefined;
    }
    return Math.trunc(value);
  };

  const readWindowSize = (stream: Writable): Partial<ViewportSize> => {
    const fn = (stream as { getWindowSize?: unknown }).getWindowSize;
    if (typeof fn !== "function") return {};

    try {
      const size = (fn as () => unknown).call(stream);
      if (!Array.isArray(size) || size.length < 2) return {};
      const cols = readPositiveInt(size[0]);
      const rows = readPositiveInt(size[1]);
      return {
        ...(cols == null ? {} : { cols }),
        ...(rows == null ? {} : { rows }),
      };
    } catch {
      return {};
    }
  };

  const parseEnvInt = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const parsed = Number.parseInt(value, 10);
    return readPositiveInt(parsed);
  };

  const primaryWindow = readWindowSize(stdout);
  const fallbackWindow = stdout === fallbackStdout ? {} : readWindowSize(fallbackStdout);

  const primaryCols = primaryWindow.cols ?? readPositiveInt((stdout as { columns?: unknown }).columns);
  const primaryRows = primaryWindow.rows ?? readPositiveInt((stdout as { rows?: unknown }).rows);

  const fallbackCols =
    stdout === fallbackStdout
      ? undefined
      : fallbackWindow.cols ?? readPositiveInt((fallbackStdout as { columns?: unknown }).columns);
  const fallbackRows =
    stdout === fallbackStdout
      ? undefined
      : fallbackWindow.rows ?? readPositiveInt((fallbackStdout as { rows?: unknown }).rows);

  const envCols = parseEnvInt(process.env["COLUMNS"]);
  const envRows = parseEnvInt(process.env["LINES"]);

  return {
    cols: primaryCols ?? fallbackCols ?? envCols ?? 80,
    rows: primaryRows ?? fallbackRows ?? envRows ?? 24,
  };
}

function describeStreamSize(stream: Writable): string {
  const cols = (stream as { columns?: unknown }).columns;
  const rows = (stream as { rows?: unknown }).rows;
  const getWindowSize = (stream as { getWindowSize?: unknown }).getWindowSize;

  if (typeof getWindowSize !== "function") {
    return `cols=${String(cols)} rows=${String(rows)} win=none`;
  }

  try {
    const value = (getWindowSize as () => unknown).call(stream);
    if (!Array.isArray(value) || value.length < 2) {
      return `cols=${String(cols)} rows=${String(rows)} win=invalid`;
    }
    return `cols=${String(cols)} rows=${String(rows)} win=${String(value[0])}x${String(value[1])}`;
  } catch {
    return `cols=${String(cols)} rows=${String(rows)} win=error`;
  }
}

function summarizeOutputShape(output: string): OutputShapeSummary {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const lines = plain.split("\n");

  let nonBlankLines = 0;
  let firstNonBlankLine = -1;
  let lastNonBlankLine = -1;
  let widestLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    widestLine = Math.max(widestLine, line.length);
    if (line.trimEnd().length === 0) continue;
    nonBlankLines += 1;
    if (firstNonBlankLine === -1) firstNonBlankLine = index;
    lastNonBlankLine = index;
  }

  return {
    lines: lines.length,
    nonBlankLines,
    firstNonBlankLine,
    lastNonBlankLine,
    widestLine,
  };
}

function toNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function coerceRootViewportHeight(
  vnode: VNode,
  viewport: ViewportSize,
): { vnode: VNode; coerced: boolean } {
  if (typeof vnode !== "object" || vnode === null) {
    return { vnode, coerced: false };
  }

  const candidate = vnode as {
    kind?: unknown;
    props?: unknown;
  };

  if (candidate.kind !== "box" && candidate.kind !== "row" && candidate.kind !== "column") {
    return { vnode, coerced: false };
  }

  const props =
    typeof candidate.props === "object" && candidate.props !== null
      ? (candidate.props as Record<string, unknown>)
      : {};

  if (toNumber(props["height"]) != null) {
    return { vnode, coerced: false };
  }

  const overflow = typeof props["overflow"] === "string" ? props["overflow"] : "";
  if (overflow !== "hidden" && overflow !== "scroll") {
    return { vnode, coerced: false };
  }

  if (viewport.rows <= 0) {
    return { vnode, coerced: false };
  }

  const nextVNode = {
    ...(vnode as Record<string, unknown>),
    props: {
      ...props,
      height: viewport.rows,
    },
  } as VNode;

  return { vnode: nextVNode, coerced: true };
}

function formatLineSnippet(line: string, max = 180): string {
  if (line.length <= max) return line;
  return `${line.slice(0, max)}…`;
}

function plainOutputLines(output: string): readonly string[] {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  return plain.split("\n");
}

function pickOutputLine(lines: readonly string[], index: number): string {
  if (index < 0 || index >= lines.length) return "";
  return lines[index] ?? "";
}

function formatIoPreview(value: string, max = 180): string {
  const normalized = value.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

function readTraceLimit(name: string, fallback: number, minimum = 1): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, parsed);
}

const TRACE_SUMMARY_MAX_DEPTH = readTraceLimit("INK_COMPAT_TRACE_JSON_MAX_DEPTH", 3, 1);
const TRACE_SUMMARY_ARRAY_LIMIT = readTraceLimit("INK_COMPAT_TRACE_JSON_ARRAY_LIMIT", 20, 1);
const TRACE_SUMMARY_OBJECT_LIMIT = readTraceLimit("INK_COMPAT_TRACE_JSON_OBJECT_LIMIT", 30, 1);

function summarizeUnknown(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[function:${value.name || "anonymous"}]`;
  if (typeof value !== "object") return String(value);
  if (depth >= TRACE_SUMMARY_MAX_DEPTH) return "[max-depth]";

  if (Array.isArray(value)) {
    const limit = TRACE_SUMMARY_ARRAY_LIMIT;
    const items = value.slice(0, limit).map((item) => summarizeUnknown(item, depth + 1));
    if (value.length > limit) items.push(`[+${value.length - limit} more]`);
    return items;
  }

  const objectValue = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const entries = Object.entries(objectValue);
  const limit = TRACE_SUMMARY_OBJECT_LIMIT;
  for (let index = 0; index < Math.min(entries.length, limit); index += 1) {
    const [key, entryValue] = entries[index]!;
    out[key] = summarizeUnknown(entryValue, depth + 1);
  }
  if (entries.length > limit) out["__truncated"] = entries.length - limit;
  return out;
}

function safeJson(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, inputValue) => {
      if (typeof inputValue === "object" && inputValue !== null) {
        if (seen.has(inputValue)) return "[circular]";
        seen.add(inputValue);
      }
      return summarizeUnknown(inputValue);
    },
    0,
  );
}

function snapshotHostRootChildren(rootNode: InkHostContainer, limit: number): readonly unknown[] {
  const out: unknown[] = [];
  const children = rootNode.children.slice(0, limit);

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (!child) continue;
    out.push(
      Object.freeze({
        index,
        type: child.type,
        textContent: child.textContent ?? "",
        childCount: child.children.length,
        props: summarizeUnknown(child.props),
      }),
    );
  }

  if (rootNode.children.length > limit) {
    out.push(Object.freeze({ truncatedChildren: rootNode.children.length - limit }));
  }

  return Object.freeze(out);
}

function snapshotHostTreeNode(
  node: InkHostNode,
  depth: number,
  childLimit: number,
): unknown {
  const out: Record<string, unknown> = {
    type: node.type,
    textContent: node.textContent ?? "",
    childCount: node.children.length,
    props: summarizeUnknown(node.props),
  };

  if (depth <= 0) return Object.freeze(out);

  const children = node.children.slice(0, childLimit).map((child) => snapshotHostTreeNode(child, depth - 1, childLimit));
  if (node.children.length > childLimit) {
    children.push(Object.freeze({ truncatedChildren: node.children.length - childLimit }));
  }
  out["children"] = children;
  return Object.freeze(out);
}

function snapshotHostTree(
  rootNode: InkHostContainer,
  depth: number,
  childLimit: number,
): unknown {
  const children = rootNode.children.slice(0, childLimit).map((child) => snapshotHostTreeNode(child, depth - 1, childLimit));
  if (rootNode.children.length > childLimit) {
    children.push(Object.freeze({ truncatedChildren: rootNode.children.length - childLimit }));
  }

  return Object.freeze({
    type: rootNode.type,
    childCount: rootNode.children.length,
    children,
  });
}

function snapshotLayoutNodes(
  nodes: readonly {
    kind?: unknown;
    id?: unknown;
    path?: readonly number[];
    rect?: { x?: number; y?: number; w?: number; h?: number };
    text?: unknown;
    props?: Record<string, unknown>;
  }[],
  limit: number,
): readonly unknown[] {
  const out: unknown[] = [];
  for (let index = 0; index < Math.min(nodes.length, limit); index += 1) {
    const node = nodes[index];
    if (!node) continue;
    out.push(
      Object.freeze({
        index,
        kind: node.kind ?? "unknown",
        id: typeof node.id === "string" ? node.id : null,
        path: Array.isArray(node.path) ? node.path.join(".") : "",
        rect: node.rect ?? null,
        text:
          typeof node.text === "string"
            ? formatLineSnippet(node.text, 80)
            : undefined,
        props: summarizeUnknown(node.props),
      }),
    );
  }
  if (nodes.length > limit) out.push(Object.freeze({ truncatedNodes: nodes.length - limit }));
  return Object.freeze(out);
}

function snapshotOps(
  ops: readonly RenderOp[],
  limit: number,
): readonly unknown[] {
  const out: unknown[] = [];
  for (let index = 0; index < Math.min(ops.length, limit); index += 1) {
    const op = ops[index];
    if (!op) continue;
    out.push(
      Object.freeze({
        index,
        ...op,
        ...(op.kind === "drawText"
          ? { text: formatLineSnippet(op.text, 80), textLen: op.text.length }
          : {}),
      }),
    );
  }
  if (ops.length > limit) out.push(Object.freeze({ truncatedOps: ops.length - limit }));
  return Object.freeze(out);
}

/**
 * Recursive VNode tree snapshot — captures kind, key props (border, style, bg,
 * overflow, flex, height, width), and children for every node.
 */
function snapshotVNodeTree(node: unknown, depth = 0, maxDepth = 8): unknown {
  if (depth > maxDepth) return { truncated: true };
  if (node == null || typeof node !== "object") return null;

  const n = node as Record<string, unknown>;
  const kind = n["kind"];
  if (typeof kind !== "string") return null;

  const props = typeof n["props"] === "object" && n["props"] !== null
    ? (n["props"] as Record<string, unknown>)
    : {};

  // Capture relevant props for debugging
  const snap: Record<string, unknown> = { kind };
  if (typeof n["text"] === "string") snap["text"] = (n["text"] as string).slice(0, 60);
  // Layout props
  for (const key of [
    "width", "height", "minWidth", "minHeight", "maxWidth", "maxHeight",
    "flex", "flexShrink", "flexBasis",
    "overflow", "scrollY", "scrollX",
    "gap", "p", "px", "py", "pt", "pb", "pl", "pr",
    "m", "mx", "my", "mt", "mb", "ml", "mr",
    "items", "justify", "alignSelf", "wrap", "reverse",
  ]) {
    if (props[key] != null) snap[key] = props[key];
  }
  // Border props
  for (const key of [
    "border", "borderTop", "borderRight", "borderBottom", "borderLeft",
    "borderStyle",
  ]) {
    if (props[key] != null) snap[key] = props[key];
  }
  // Style props (bg, fg)
  if (props["style"] != null) snap["style"] = props["style"];
  // RichText spans (summarized)
  if (Array.isArray(props["spans"])) {
    const spans = (props["spans"] as { text?: string; style?: unknown }[]).slice(0, 10);
    snap["spans"] = spans.map((s) => ({
      text: typeof s.text === "string" ? s.text.slice(0, 40) : "",
      style: s.style ?? null,
    }));
    if ((props["spans"] as unknown[]).length > 10) snap["spansTruncated"] = (props["spans"] as unknown[]).length;
  }

  const children = n["children"];
  if (Array.isArray(children) && children.length > 0) {
    snap["children"] = children.slice(0, 50).map((c) => snapshotVNodeTree(c, depth + 1, maxDepth));
    if (children.length > 50) snap["childrenTruncated"] = children.length;
  }

  return snap;
}

/**
 * Snapshot specific rows of the cell grid — shows char and style for each cell.
 * Used to diagnose exactly what the bright horizontal bar is made of.
 */
function snapshotCellGridRows(
  grid: StyledCell[][],
  rowIndices: number[],
  maxCols = 120,
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const rowIdx of rowIndices) {
    if (rowIdx < 0 || rowIdx >= grid.length) continue;
    const row = grid[rowIdx]!;
    const cells: unknown[] = [];
    let lastVisibleCol = -1;
    for (let col = 0; col < Math.min(row.length, maxCols); col++) {
      const cell = row[col]!;
      if (cell.char !== " " || styleVisibleOnSpace(cell.style)) lastVisibleCol = col;
    }
    // Only capture up to last visible cell + a few
    const captureTo = Math.min(row.length, maxCols, lastVisibleCol + 5);
    for (let col = 0; col < captureTo; col++) {
      const cell = row[col]!;
      const entry: Record<string, unknown> = { c: cell.char };
      if (cell.style?.bg) entry["bg"] = `${cell.style.bg.r},${cell.style.bg.g},${cell.style.bg.b}`;
      if (cell.style?.fg) entry["fg"] = `${cell.style.fg.r},${cell.style.fg.g},${cell.style.fg.b}`;
      if (cell.style?.bold) entry["bold"] = true;
      if (cell.style?.dim) entry["dim"] = true;
      if (cell.style?.inverse) entry["inv"] = true;
      cells.push(entry);
    }
    out.push({ row: rowIdx, lastVisible: lastVisibleCol, cellCount: cells.length, cells });
  }
  return out;
}

function formatResizeTimeline(
  records: readonly ResizeSignalRecord[],
  startAtMs: number,
  limit: number,
): string {
  const recent = records.slice(-limit);
  return recent
    .map((record) => {
      const delta = Math.max(0, record.at - startAtMs);
      return `${delta}ms:${record.phase}:${record.source}:${record.viewport.cols}x${record.viewport.rows}`;
    })
    .join("|");
}

function summarizeHostTree(rootNode: InkHostContainer): HostTreeSummary {
  let nodeCount = 0;
  let boxCount = 0;
  let scrollNodeCount = 0;
  let maxScrollTop = 0;
  let maxScrollLeft = 0;
  let rootScrollTop = 0;
  let rootOverflow = "";
  let rootWidthProp = "";
  let rootHeightProp = "";
  let rootFlexGrowProp = "";
  let rootFlexShrinkProp = "";

  const stack: InkHostNode[] = [...rootNode.children];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    nodeCount += 1;
    if (node.type === "ink-box") {
      boxCount += 1;
      const overflow = node.props["overflow"] ?? node.props["overflowY"] ?? node.props["overflowX"];
      if (overflow === "scroll" || overflow === "hidden") {
        scrollNodeCount += 1;
      }

      const scrollTop = toNumber(node.props["scrollTop"]);
      if (scrollTop != null) maxScrollTop = Math.max(maxScrollTop, Math.trunc(scrollTop));

      const scrollLeft = toNumber(node.props["scrollLeft"]);
      if (scrollLeft != null) maxScrollLeft = Math.max(maxScrollLeft, Math.trunc(scrollLeft));
    }

    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index];
      if (child) stack.push(child);
    }
  }

  const rootChild = rootNode.children[0];
  if (rootChild?.type === "ink-box") {
    const value = toNumber(rootChild.props["scrollTop"]);
    if (value != null) rootScrollTop = Math.trunc(value);
    const overflow = rootChild.props["overflow"] ?? rootChild.props["overflowY"] ?? rootChild.props["overflowX"];
    if (typeof overflow === "string") rootOverflow = overflow;
    rootWidthProp = String(rootChild.props["width"] ?? "");
    rootHeightProp = String(rootChild.props["height"] ?? "");
    rootFlexGrowProp = String(rootChild.props["flexGrow"] ?? "");
    rootFlexShrinkProp = String(rootChild.props["flexShrink"] ?? "");
  }

  return {
    nodeCount,
    boxCount,
    scrollNodeCount,
    maxScrollTop,
    maxScrollLeft,
    rootScrollTop,
    rootOverflow,
    rootWidthProp,
    rootHeightProp,
    rootFlexGrowProp,
    rootFlexShrinkProp,
  };
}

function isRgb(value: unknown): value is Rgb {
  if (typeof value !== "object" || value === null) return false;
  const r = (value as { r?: unknown }).r;
  const g = (value as { g?: unknown }).g;
  const b = (value as { b?: unknown }).b;
  return (
    typeof r === "number" &&
    Number.isFinite(r) &&
    typeof g === "number" &&
    Number.isFinite(g) &&
    typeof b === "number" &&
    Number.isFinite(b)
  );
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeStyle(style: TextStyle | undefined): CellStyle | undefined {
  if (!style) return undefined;

  const normalized: CellStyle = {};
  if (isRgb(style.fg)) {
    normalized.fg = { r: clampByte(style.fg.r), g: clampByte(style.fg.g), b: clampByte(style.fg.b) };
  }
  if (isRgb(style.bg)) {
    normalized.bg = { r: clampByte(style.bg.r), g: clampByte(style.bg.g), b: clampByte(style.bg.b) };
  }
  if (style.bold === true) normalized.bold = true;
  if (style.dim === true) normalized.dim = true;
  if (style.italic === true) normalized.italic = true;
  if (style.underline === true) normalized.underline = true;
  if (style.strikethrough === true) normalized.strikethrough = true;
  if (style.inverse === true) normalized.inverse = true;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function stylesEqual(a: CellStyle | undefined, b: CellStyle | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;

  const keysA = Object.keys(a).sort();
  const keysB = Object.keys(b).sort();
  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i]!;
    if (key !== keysB[i]) return false;
    if (JSON.stringify((a as Record<string, unknown>)[key]) !== JSON.stringify((b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}

function styleVisibleOnSpace(style: CellStyle | undefined): boolean {
  if (!style) return false;
  return style.bg !== undefined || style.inverse === true || style.underline === true;
}

function styleToSgr(style: CellStyle | undefined): string {
  if (!style) return "\u001b[0m";

  const codes: string[] = [];
  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.inverse) codes.push("7");
  if (style.strikethrough) codes.push("9");
  if (style.fg) codes.push(`38;2;${clampByte(style.fg.r)};${clampByte(style.fg.g)};${clampByte(style.fg.b)}`);
  if (style.bg) codes.push(`48;2;${clampByte(style.bg.r)};${clampByte(style.bg.g)};${clampByte(style.bg.b)}`);

  if (codes.length === 0) return "\u001b[0m";
  // Always reset (0) before applying new attributes to prevent attribute
  // bleed from previous cells (e.g. bold, bg carrying over).
  return `\u001b[0;${codes.join(";")}m`;
}

function inClipStack(x: number, y: number, clipStack: readonly ClipRect[]): boolean {
  for (const clip of clipStack) {
    if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
  }
  return true;
}

function fillCells(
  grid: StyledCell[][],
  viewport: ViewportSize,
  clipStack: readonly ClipRect[],
  x: number,
  y: number,
  w: number,
  h: number,
  style: CellStyle | undefined,
): void {
  for (let yy = y; yy < y + h; yy += 1) {
    if (yy < 0 || yy >= viewport.rows) continue;
    const row = grid[yy];
    if (!row) continue;
    for (let xx = x; xx < x + w; xx += 1) {
      if (xx < 0 || xx >= viewport.cols || !inClipStack(xx, yy, clipStack)) continue;
      row[xx] = { char: " ", style };
    }
  }
}

/**
 * Merge an overlay cell style on top of an existing base style.
 * Preserves base properties (especially bg from fillRect) when the
 * overlay doesn't explicitly set them.
 */
function mergeCellStyles(
  base: CellStyle | undefined,
  overlay: CellStyle | undefined,
): CellStyle | undefined {
  if (!overlay && !base) return undefined;
  if (!overlay) return base;
  if (!base) return overlay;

  const merged: CellStyle = {};
  const bg = overlay.bg ?? base.bg;
  const fg = overlay.fg ?? base.fg;
  if (bg) merged.bg = bg;
  if (fg) merged.fg = fg;
  if (overlay.bold ?? base.bold) merged.bold = true;
  if (overlay.dim ?? base.dim) merged.dim = true;
  if (overlay.italic ?? base.italic) merged.italic = true;
  if (overlay.underline ?? base.underline) merged.underline = true;
  if (overlay.strikethrough ?? base.strikethrough) merged.strikethrough = true;
  if (overlay.inverse ?? base.inverse) merged.inverse = true;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function drawTextToCells(
  grid: StyledCell[][],
  viewport: ViewportSize,
  clipStack: readonly ClipRect[],
  x0: number,
  y: number,
  text: string,
  style: CellStyle | undefined,
): void {
  if (y < 0 || y >= viewport.rows) return;

  let cursorX = x0;
  for (const glyph of text) {
    const width = measureTextCells(glyph);
    if (width <= 0) continue;

    if (cursorX >= 0 && cursorX < viewport.cols && inClipStack(cursorX, y, clipStack)) {
      const row = grid[y];
      if (row) {
        const existing = row[cursorX];
        row[cursorX] = { char: glyph, style: mergeCellStyles(existing?.style, style) };
      }
    }

    for (let offset = 1; offset < width; offset += 1) {
      const fillX = cursorX + offset;
      if (fillX < 0 || fillX >= viewport.cols || !inClipStack(fillX, y, clipStack)) continue;
      const row = grid[y];
      if (row) {
        const existing = row[fillX];
        row[fillX] = { char: " ", style: mergeCellStyles(existing?.style, style) };
      }
    }

    cursorX += width;
  }
}

function renderOpsToAnsi(ops: readonly RenderOp[], viewport: ViewportSize): { ansi: string; grid: StyledCell[][] } {
  const grid: StyledCell[][] = [];
  for (let rowIndex = 0; rowIndex < viewport.rows; rowIndex += 1) {
    const row: StyledCell[] = [];
    for (let colIndex = 0; colIndex < viewport.cols; colIndex += 1) {
      row.push({ char: " ", style: undefined });
    }
    grid.push(row);
  }

  const clipStack: ClipRect[] = [];

  for (const op of ops) {
    if (op.kind === "clear") {
      fillCells(grid, viewport, clipStack, 0, 0, viewport.cols, viewport.rows, undefined);
      continue;
    }
    if (op.kind === "clearTo") {
      fillCells(
        grid,
        viewport,
        clipStack,
        0,
        0,
        Math.max(0, Math.trunc(op.cols)),
        Math.max(0, Math.trunc(op.rows)),
        normalizeStyle(op.style),
      );
      continue;
    }
    if (op.kind === "fillRect") {
      fillCells(
        grid,
        viewport,
        clipStack,
        Math.trunc(op.x),
        Math.trunc(op.y),
        Math.max(0, Math.trunc(op.w)),
        Math.max(0, Math.trunc(op.h)),
        normalizeStyle(op.style),
      );
      continue;
    }
    if (op.kind === "drawText") {
      drawTextToCells(
        grid,
        viewport,
        clipStack,
        Math.trunc(op.x),
        Math.trunc(op.y),
        op.text,
        normalizeStyle(op.style),
      );
      continue;
    }
    if (op.kind === "pushClip") {
      clipStack.push({
        x: Math.trunc(op.x),
        y: Math.trunc(op.y),
        w: Math.max(0, Math.trunc(op.w)),
        h: Math.max(0, Math.trunc(op.h)),
      });
      continue;
    }
    if (op.kind === "popClip") {
      clipStack.pop();
    }
  }

  const lines: string[] = [];

  for (const row of grid) {
    let lastUsefulCol = -1;
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index]!;
      if (cell.char !== " " || styleVisibleOnSpace(cell.style)) lastUsefulCol = index;
    }

    if (lastUsefulCol < 0) {
      lines.push("");
      continue;
    }

    let line = "";
    let activeStyle: CellStyle | undefined;

    for (let colIndex = 0; colIndex <= lastUsefulCol; colIndex += 1) {
      const cell = row[colIndex]!;
      if (!stylesEqual(activeStyle, cell.style)) {
        line += styleToSgr(cell.style);
        activeStyle = cell.style;
      }
      line += cell.char;
    }

    if (activeStyle) line += "\u001b[0m";
    lines.push(line);
  }

  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return { ansi: lines.join("\n"), grid };
}

export function render(element: React.ReactElement, options: RenderOptions = {}): Instance {
  const stdout = options.stdout ?? process.stdout;
  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;
  const fallbackStdout = process.stdout as Writable;
  const debug = options.debug ?? process.env["INK_COMPAT_DEBUG"] === "1";
  const traceFile = process.env["INK_COMPAT_TRACE_FILE"];
  const traceEnabled =
    debug || process.env["INK_COMPAT_TRACE"] === "1" || (traceFile != null && traceFile.length > 0);
  const traceToStderr = debug || process.env["INK_COMPAT_TRACE_STDERR"] === "1";
  const traceDetail = process.env["INK_COMPAT_TRACE_DETAIL"] === "1";
  const traceDetailFull = process.env["INK_COMPAT_TRACE_DETAIL_FULL"] === "1";
  const traceAllFrames = process.env["INK_COMPAT_TRACE_ALL_FRAMES"] === "1";
  const traceIoWrites = process.env["INK_COMPAT_TRACE_IO"] === "1";
  const traceResizeVerbose = process.env["INK_COMPAT_TRACE_RESIZE_VERBOSE"] === "1";
  const tracePollEvery = Math.max(
    1,
    Number.parseInt(process.env["INK_COMPAT_TRACE_POLL_EVERY"] ?? "10", 10) || 10,
  );
  const viewportPollMs = Math.max(
    16,
    Number.parseInt(process.env["INK_COMPAT_VIEWPORT_POLL_MS"] ?? "120", 10) || 120,
  );
  const idleRepaintMs = Math.max(
    0,
    Number.parseInt(process.env["INK_COMPAT_IDLE_REPAINT_MS"] ?? "1000", 10) || 0,
  );
  const detailNodeLimit = traceDetailFull ? 2000 : 300;
  const detailOpLimit = traceDetailFull ? 4000 : 500;
  const detailResizeLimit = traceDetailFull ? 300 : 80;
  const writeErr = (stderr as { write: (s: string) => void }).write.bind(stderr);
  const traceStartAt = Date.now();

  const trace = (message: string): void => {
    if (!traceEnabled) return;
    const line = `[ink-compat trace ${new Date().toISOString()}] ${message}\n`;
    if (traceToStderr) {
      writeErr(line);
    }
    if (traceFile != null && traceFile.length > 0) {
      try {
        appendFileSync(traceFile, line);
      } catch {}
    }
  };

  const bridge = createBridge({
    stdout,
    stdin,
    stderr,
    ...(options.exitOnCtrlC === undefined ? {} : { exitOnCtrlC: options.exitOnCtrlC }),
  });

  const container = createReactRoot(bridge.rootNode, (err: unknown) => {
    writeErr(`[ink-compat] REACT ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  });

  let viewport = readViewportSize(stdout, fallbackStdout);
  const renderer = createTestRenderer({
    viewport,
    ...(traceEnabled
      ? {
          traceDetail: traceDetailFull,
          trace: (event: ReziRendererTraceEvent) => {
            trace(
              `rezi#${event.renderId} viewport=${event.viewport.cols}x${event.viewport.rows} focused=${event.focusedId ?? "none"} tick=${event.tick} totalMs=${event.timings.totalMs} commitMs=${event.timings.commitMs} layoutMs=${event.timings.layoutMs} drawMs=${event.timings.drawMs} textMs=${event.timings.textMs} nodes=${event.nodeCount} ops=${event.opCount} clipMax=${event.clipDepthMax} textChars=${event.textChars} textLines=${event.textLines} nonBlank=${event.nonBlankLines} widest=${event.widestLine} minY=${event.minRectY} maxBottom=${event.maxRectBottom} zeroH=${event.zeroHeightRects} detailIncluded=${event.detailIncluded}`,
            );

            if (!traceDetail) return;
            const nodePayload = snapshotLayoutNodes(
              (event.nodes ?? []) as readonly {
                kind?: unknown;
                id?: unknown;
                path?: readonly number[];
                rect?: { x?: number; y?: number; w?: number; h?: number };
                text?: unknown;
                props?: Record<string, unknown>;
              }[],
              detailNodeLimit,
            );
            const opPayload = snapshotOps((event.ops ?? []) as readonly RenderOp[], detailOpLimit);
            trace(`rezi#${event.renderId} nodes=${safeJson(nodePayload)}`);
            trace(`rezi#${event.renderId} ops=${safeJson(opPayload)}`);
            if (traceDetailFull) {
              trace(`rezi#${event.renderId} text=${safeJson(event.text ?? "")}`);
            }
          },
        }
      : {}),
  });

  let lastOutput = "";
  let lastStableOutput = "";
  let frameCount = 0;
  let usingAlternateBuffer = options.alternateBuffer === true;
  let cursorHidden = false;
  let writeBlocked = false;
  let queuedOutput: string | null = null;
  let drainListener: (() => void) | undefined;
  let resizeTimer: NodeJS.Timeout | undefined;
  const pendingResizeSources = new Set<string>();
  const resizeTimeline: ResizeSignalRecord[] = [];
  let lastResizeSignalAt = 0;
  let lastResizeFlushAt = 0;
  let lastWriteAt = Date.now();
  let compatWriteDepth = 0;
  let restoreStdoutWrite: (() => void) | undefined;

  const _s = debug
    ? writeErr
    : (_msg: string): void => {};

  const streamColorDepth = (() => {
    const fn = (stdout as { getColorDepth?: unknown }).getColorDepth;
    if (typeof fn !== "function") return "unknown";
    try {
      const value = (fn as () => unknown).call(stdout);
      return typeof value === "number" && Number.isFinite(value) ? String(value) : "unknown";
    } catch {
      return "error";
    }
  })();

  trace(
    `init viewport=${viewport.cols}x${viewport.rows} stdout={${describeStreamSize(stdout)}} fallback={${describeStreamSize(fallbackStdout)}}`,
  );
  trace(
    `terminal colorDepth=${streamColorDepth} isTTY=${String((stdout as { isTTY?: unknown }).isTTY === true)} TERM=${process.env["TERM"] ?? ""} COLORTERM=${process.env["COLORTERM"] ?? ""} NO_COLOR=${process.env["NO_COLOR"] ?? ""} FORCE_COLOR=${process.env["FORCE_COLOR"] ?? ""}`,
  );
  trace(
    `trace-config schema=2 enabled=${traceEnabled} detail=${traceDetail} detailFull=${traceDetailFull} allFrames=${traceAllFrames} ioWrites=${traceIoWrites} resizeVerbose=${traceResizeVerbose} tracePollEvery=${tracePollEvery} viewportPollMs=${viewportPollMs} idleRepaintMs=${idleRepaintMs} nodeLimit=${detailNodeLimit} opLimit=${detailOpLimit} jsonDepth=${TRACE_SUMMARY_MAX_DEPTH} jsonArrayLimit=${TRACE_SUMMARY_ARRAY_LIMIT} jsonObjectLimit=${TRACE_SUMMARY_OBJECT_LIMIT}`,
  );

  // Enable translation-layer tracing (propsToVNode border/color/dimension logs)
  if (traceEnabled && traceDetailFull) {
    enableTranslationTrace(true);
  }

  if (usingAlternateBuffer) {
    stdout.write("\u001b[?1049h");
  }

  const stdoutWithEvents = stdout as Writable & {
    on?: (event: string, listener: () => void) => void;
    off?: (event: string, listener: () => void) => void;
    removeListener?: (event: string, listener: () => void) => void;
  };
  const fallbackStdoutWithEvents = fallbackStdout as Writable & {
    on?: (event: string, listener: () => void) => void;
    off?: (event: string, listener: () => void) => void;
    removeListener?: (event: string, listener: () => void) => void;
  };

  const writeCompat = (chunk: string): boolean => {
    compatWriteDepth += 1;
    try {
      return stdout.write(chunk);
    } finally {
      compatWriteDepth -= 1;
    }
  };

  const hideCursor = (): void => {
    if (cursorHidden) return;
    cursorHidden = true;
    writeCompat("\u001b[?25l");
  };

  const showCursor = (): void => {
    if (!cursorHidden) return;
    cursorHidden = false;
    writeCompat("\u001b[?25h");
  };

  hideCursor();

  if (traceEnabled && traceIoWrites) {
    const stdoutWithWrite = stdout as Writable & {
      write: (chunk: unknown, encoding?: unknown, cb?: unknown) => boolean;
    };
    const originalWrite = stdoutWithWrite.write.bind(stdoutWithWrite);
    stdoutWithWrite.write = (chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
      if (compatWriteDepth === 0) {
        const raw =
          typeof chunk === "string"
            ? chunk
            : Buffer.isBuffer(chunk)
              ? chunk.toString("utf8")
              : String(chunk ?? "");
        trace(
          `stdout.write external len=${raw.length} hasClear=${/\u001b\\[[0-9;]*[HJ]/.test(raw)} hasAltIn=${raw.includes("\u001b[?1049h")} hasAltOut=${raw.includes("\u001b[?1049l")} preview=${safeJson(formatIoPreview(raw))}`,
        );
      }
      return originalWrite(chunk, encoding, cb);
    };
    restoreStdoutWrite = () => {
      stdoutWithWrite.write = originalWrite;
    };
  }

  const removeDrainListener = (): void => {
    if (!drainListener) return;
    if (typeof stdoutWithEvents.off === "function") {
      stdoutWithEvents.off("drain", drainListener);
    } else {
      stdoutWithEvents.removeListener?.("drain", drainListener);
    }
    drainListener = undefined;
  };

  const listenerCount = (
    stream: Writable & {
      listenerCount?: (event: string) => number;
    },
    event: string,
  ): number => {
    const fn = stream.listenerCount;
    if (typeof fn !== "function") return -1;
    try {
      return fn.call(stream, event);
    } catch {
      return -1;
    }
  };

  const writeOutput = (output: string): void => {
    if (writeBlocked) {
      queuedOutput = output;
      lastOutput = output;
      if (output.length > 0) lastStableOutput = output;
      trace(
        `write queue blocked=true outputLen=${output.length} queuedLen=${queuedOutput.length} viewport=${viewport.cols}x${viewport.rows}`,
      );
      return;
    }

    const writeOk = writeCompat(`\u001b[H\u001b[J${output}`);
    lastWriteAt = Date.now();
    lastOutput = output;
    if (output.length > 0) {
      lastStableOutput = output;
    }

    if (writeOk) return;
    if (drainListener) return;

    writeBlocked = true;
    trace(`write blocked outputLen=${output.length} viewport=${viewport.cols}x${viewport.rows}`);
    drainListener = () => {
      removeDrainListener();
      writeBlocked = false;

      if (queuedOutput == null) return;
      const next = queuedOutput;
      queuedOutput = null;
      trace(`write drain flush queuedLen=${next.length} viewport=${viewport.cols}x${viewport.rows}`);
      writeOutput(next);
    };
    stdoutWithEvents.on?.("drain", drainListener);
  };

  const idleRepaintTimer =
    idleRepaintMs > 0
      ? setInterval(() => {
          if (writeBlocked) return;
          const payload = lastOutput.length > 0 ? lastOutput : lastStableOutput;
          if (payload.length === 0) return;
          if (Date.now() - lastWriteAt < idleRepaintMs) return;
          trace(`idle repaint payloadLen=${payload.length} idleForMs=${Date.now() - lastWriteAt}`);
          writeOutput(payload);
        }, idleRepaintMs)
      : undefined;
  idleRepaintTimer?.unref?.();

  const renderFrame = (force = false): void => {
    // Skip non-forced renders while a resize timer is pending.
    // The forced render at the end of the debounce will pick up all changes,
    // preventing rapid clear+redraw cycles that cause visible flicker.
    if (!force && resizeTimer !== undefined) {
      if (traceEnabled) {
        trace(`frame-skip resize-debounce-pending frameCount=${frameCount + 1}`);
      }
      return;
    }

    const frameStartedAt = Date.now();
    frameCount++;
    try {
      const frameNow = Date.now();
      const nextViewport = readViewportSize(stdout, fallbackStdout);
      const viewportChanged =
        nextViewport.cols !== viewport.cols || nextViewport.rows !== viewport.rows;
      if (viewportChanged) {
        viewport = nextViewport;
      }

      const translated = bridge.translateToVNode();
      const translationTraceEntries = traceEnabled ? flushTranslationTrace() : [];
      const { vnode, coerced: rootHeightCoerced } = coerceRootViewportHeight(translated, viewport);
      const result = renderer.render(vnode, { viewport });
      const { ansi: output, grid: cellGrid } = renderOpsToAnsi(result.ops as readonly RenderOp[], viewport);
      const outputShape = summarizeOutputShape(output);
      const emptyOutputFrame = outputShape.nonBlankLines === 0;
      const rootChildCount = bridge.rootNode.children.length;
      const msSinceResizeSignal =
        lastResizeSignalAt > 0 ? frameNow - lastResizeSignalAt : Number.POSITIVE_INFINITY;
      const msSinceResizeFlush =
        lastResizeFlushAt > 0 ? frameNow - lastResizeFlushAt : Number.POSITIVE_INFINITY;
      const transientEmptyAfterResize =
        !force &&
        emptyOutputFrame &&
        rootChildCount === 0 &&
        lastStableOutput.length > 0 &&
        msSinceResizeFlush <= 2000;

      let minRectY = Number.POSITIVE_INFINITY;
      let maxRectBottom = 0;
      let zeroHeightRects = 0;
      for (const node of result.nodes as readonly { rect?: { y?: number; h?: number } }[]) {
        const rect = node.rect;
        if (!rect) continue;
        const y = toNumber(rect.y);
        const h = toNumber(rect.h);
        if (y == null || h == null) continue;
        minRectY = Math.min(minRectY, y);
        maxRectBottom = Math.max(maxRectBottom, y + h);
        if (h === 0) zeroHeightRects += 1;
      }

      if (debug && frameCount <= 5) {
        _s(
          `[ink-compat] frame #${frameCount}: vnode.kind=${vnode?.kind ?? "null"}, ops=${result.ops.length}, nodes=${result.nodes.length}, output.length=${output.length}\n`,
        );
      }

      const collapsed =
        viewport.rows >= 10 &&
        outputShape.nonBlankLines <= 4 &&
        outputShape.firstNonBlankLine >= 0 &&
        outputShape.lastNonBlankLine >= outputShape.firstNonBlankLine &&
        outputShape.lastNonBlankLine >= viewport.rows - 4;

      const shouldTraceFrame =
        traceEnabled &&
        (traceAllFrames || frameCount <= 40 || force || viewportChanged || writeBlocked || collapsed);

      if (shouldTraceFrame) {
        const host = summarizeHostTree(bridge.rootNode);
        const vnodeKind =
          typeof vnode === "object" && vnode !== null && "kind" in vnode
            ? String((vnode as { kind?: unknown }).kind ?? "null")
            : "unknown";
        const vnodeProps =
          typeof vnode === "object" && vnode !== null && "props" in vnode
            ? ((vnode as { props?: Record<string, unknown> }).props ?? {})
            : {};
        const translatedOverflow =
          typeof vnodeProps["overflow"] === "string" ? (vnodeProps["overflow"] as string) : "";
        const translatedScrollY = toNumber(vnodeProps["scrollY"]) ?? -1;
        const translatedScrollX = toNumber(vnodeProps["scrollX"]) ?? -1;

        trace(
          `frame#${frameCount} force=${force} viewport=${viewport.cols}x${viewport.rows} viewportChanged=${viewportChanged} renderTimeMs=${Date.now() - frameStartedAt} outputLen=${output.length} nonBlank=${outputShape.nonBlankLines}/${outputShape.lines} first=${outputShape.firstNonBlankLine} last=${outputShape.lastNonBlankLine} widest=${outputShape.widestLine} ops=${result.ops.length} nodes=${result.nodes.length} minY=${Number.isFinite(minRectY) ? minRectY : -1} maxBottom=${maxRectBottom} zeroH=${zeroHeightRects} hostNodes=${host.nodeCount} hostBoxes=${host.boxCount} hostScrollNodes=${host.scrollNodeCount} hostMaxScrollTop=${host.maxScrollTop} hostMaxScrollLeft=${host.maxScrollLeft} hostRootScrollTop=${host.rootScrollTop} hostRootOverflow=${host.rootOverflow || "none"} hostRootWidth=${host.rootWidthProp || "unset"} hostRootHeight=${host.rootHeightProp || "unset"} hostRootFlexGrow=${host.rootFlexGrowProp || "unset"} hostRootFlexShrink=${host.rootFlexShrinkProp || "unset"} rootChildren=${rootChildCount} msSinceResizeSignal=${Number.isFinite(msSinceResizeSignal) ? msSinceResizeSignal : -1} msSinceResizeFlush=${Number.isFinite(msSinceResizeFlush) ? msSinceResizeFlush : -1} transientEmptyAfterResize=${transientEmptyAfterResize} vnode=${vnodeKind} vnodeOverflow=${translatedOverflow || "none"} vnodeScrollY=${translatedScrollY} vnodeScrollX=${translatedScrollX} rootHeightCoerced=${rootHeightCoerced} writeBlocked=${writeBlocked} collapsed=${collapsed}`,
        );

        if (traceDetail) {
          const lines = plainOutputLines(output);
          const firstLine = pickOutputLine(lines, outputShape.firstNonBlankLine);
          const lastLine = pickOutputLine(lines, outputShape.lastNonBlankLine);
          trace(
            `frame#${frameCount} firstLineText=${safeJson(formatLineSnippet(firstLine))} lastLineText=${safeJson(formatLineSnippet(lastLine))}`,
          );
          trace(
            `frame#${frameCount} hostRootChildren=${safeJson(snapshotHostRootChildren(bridge.rootNode, traceDetailFull ? 60 : 16))}`,
          );
          if (traceDetailFull) {
            trace(`frame#${frameCount} hostTree=${safeJson(snapshotHostTree(bridge.rootNode, 5, 40))}`);
          }
          trace(
            `frame#${frameCount} layoutNodes=${safeJson(snapshotLayoutNodes(result.nodes as readonly { kind?: unknown; id?: unknown; path?: readonly number[]; rect?: { x?: number; y?: number; w?: number; h?: number }; text?: unknown; props?: Record<string, unknown> }[], detailNodeLimit))}`,
          );
          trace(`frame#${frameCount} renderOps=${safeJson(snapshotOps(result.ops as readonly RenderOp[], detailOpLimit))}`);
          trace(
            `frame#${frameCount} resizeTimeline=${formatResizeTimeline(resizeTimeline, traceStartAt, detailResizeLimit)}`,
          );

          // ─── Deep diagnostics: VNode tree, cell grid rows, translation trace ───
          if (traceDetailFull) {
            // Full VNode tree with border/style/bg props at every level
            trace(`frame#${frameCount} vnodeTree=${safeJson(snapshotVNodeTree(vnode, 0, 10))}`);

            // Cell grid rows — snapshot every non-blank row to find the bright bar
            const nonBlankRows: number[] = [];
            for (let r = 0; r < cellGrid.length; r++) {
              const row = cellGrid[r];
              if (!row) continue;
              for (let c = 0; c < row.length; c++) {
                const cell = row[c];
                if (!cell) continue;
                if (cell.char !== " " || styleVisibleOnSpace(cell.style)) {
                  nonBlankRows.push(r);
                  break;
                }
              }
            }
            trace(`frame#${frameCount} nonBlankGridRows=${safeJson(nonBlankRows)}`);

            // Snapshot all non-blank rows (capped at 40)
            const rowsToSnapshot = nonBlankRows.slice(0, 40);
            trace(`frame#${frameCount} cellGridSnapshot=${safeJson(snapshotCellGridRows(cellGrid, rowsToSnapshot, 120))}`);

            // Translation trace entries (border translations, color parses, dimension skips)
            if (translationTraceEntries.length > 0) {
              // Group by kind for readability
              const borderTraces = translationTraceEntries.filter((e) => e.kind === "border-translate");
              const colorTraces = translationTraceEntries.filter((e) => e.kind === "color-parse");
              const dimSkipTraces = translationTraceEntries.filter((e) => e.kind === "dimension-skip");
              if (borderTraces.length > 0) {
                trace(`frame#${frameCount} borderTranslations=${safeJson(borderTraces.slice(0, 30))}`);
              }
              if (colorTraces.length > 0) {
                // Deduplicate: only show unique input→result pairs
                const seen = new Set<string>();
                const unique = colorTraces.filter((e) => {
                  const key = `${String(e["input"])}→${safeJson(e["result"])}`;
                  if (seen.has(key)) return false;
                  seen.add(key);
                  return true;
                });
                trace(`frame#${frameCount} colorParses=${safeJson(unique.slice(0, 40))}`);
              }
              if (dimSkipTraces.length > 0) {
                trace(`frame#${frameCount} dimensionSkips=${safeJson(dimSkipTraces.slice(0, 20))}`);
              }
            }

            // Per-row ANSI output lines (raw, for correlating grid → ANSI)
            const rawLines = output.split("\n");
            const ansiLineInfo: { row: number; len: number; snippet: string }[] = [];
            for (let r = 0; r < rawLines.length; r++) {
              const line = rawLines[r]!;
              if (line.length > 0) {
                ansiLineInfo.push({ row: r, len: line.length, snippet: formatLineSnippet(line, 120) });
              }
            }
            trace(`frame#${frameCount} ansiLineDetail=${safeJson(ansiLineInfo.slice(0, 40))}`);
          }
        }
      }

      const renderTime = Date.now() - frameStartedAt;
      options.onRender?.({ renderTime, output });

      if (!force && output === lastOutput && !viewportChanged) return;

      if (transientEmptyAfterResize) {
        _s("[ink-compat] transient empty frame after resize; preserving previous output\n");
        trace(
          `frame#${frameCount} preserve-last-stable transient-empty outputLen=${output.length} nonBlank=${outputShape.nonBlankLines} rootChildren=${rootChildCount} msSinceResizeFlush=${Number.isFinite(msSinceResizeFlush) ? msSinceResizeFlush : -1} stableLen=${lastStableOutput.length}`,
        );
        return;
      }

      if (force && emptyOutputFrame && lastStableOutput.length > 0) {
        _s("[ink-compat] resize produced an empty frame; preserving previous output\n");
        trace(
          `frame#${frameCount} preserve-last-stable force=true outputLen=${output.length} nonBlank=${outputShape.nonBlankLines} stableLen=${lastStableOutput.length}`,
        );
        return;
      }

      writeOutput(output);
    } catch (err) {
      _s(
        `[ink-compat] renderFrame error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
      );
      trace(`renderFrame error frame#${frameCount}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      if (force && lastStableOutput.length > 0) {
        writeOutput(lastStableOutput);
      }
    }
  };

  bridge.rootNode.onCommit = renderFrame;

  let currentElement = element;

  const doRender = (el: React.ReactElement): void => {
    currentElement = el;
    const wrapped = React.createElement(
      InkContext.Provider,
      { value: bridge.context },
      el,
    );
    try {
      commitSync(container, wrapped);
    } catch (err) {
      _s(`[ink-compat] commitSync THREW: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    }
  };

  // Wire up rerender in context so useApp().rerender() works
  bridge.context.rerender = () => {
    doRender(React.cloneElement(currentElement));
  };

  doRender(element);
  renderFrame();

  const onData = (data: Buffer | string): void => {
    bridge.simulateInput(typeof data === "string" ? data : data.toString("utf-8"));
  };

  const stdinWithRaw = stdin as Readable & {
    setRawMode?: (enabled: boolean) => void;
    resume?: () => void;
    pause?: () => void;
  };

  if (typeof stdinWithRaw.setRawMode === "function") {
    stdinWithRaw.setRawMode(true);
    stdinWithRaw.resume?.();
    stdin.on("data", onData);
  }

  const scheduleResize = (source: string): void => {
    const observed = readViewportSize(stdout, fallbackStdout);
    const signalAt = Date.now();
    lastResizeSignalAt = signalAt;
    resizeTimeline.push({
      at: signalAt,
      phase: "signal",
      source,
      viewport: observed,
    });
    if (resizeTimeline.length > 5000) {
      resizeTimeline.splice(0, resizeTimeline.length - 5000);
    }
    if (traceDetail || traceResizeVerbose) {
      trace(
        `resize signal source=${source} observed=${observed.cols}x${observed.rows} pending=${pendingResizeSources.size + 1}`,
      );
    }

    pendingResizeSources.add(source);
    if (resizeTimer !== undefined) return;
    resizeTimer = setTimeout(() => {
      resizeTimer = undefined;
      const sourceList = [...pendingResizeSources].join(",");
      pendingResizeSources.clear();

      const previousViewport = viewport;
      const latest = readViewportSize(stdout, fallbackStdout);
      const flushAt = Date.now();
      lastResizeFlushAt = flushAt;
      resizeTimeline.push({
        at: flushAt,
        phase: "flush",
        source: sourceList || "unknown",
        viewport: latest,
      });
      if (resizeTimeline.length > 5000) {
        resizeTimeline.splice(0, resizeTimeline.length - 5000);
      }
      trace(
        `resize flush sources=${sourceList || "unknown"} previous=${previousViewport.cols}x${previousViewport.rows} latest=${latest.cols}x${latest.rows} stdout={${describeStreamSize(stdout)}} fallback={${describeStreamSize(fallbackStdout)}}`,
      );
      if (traceDetail || traceResizeVerbose) {
        trace(
          `resize timeline now=${formatResizeTimeline(resizeTimeline, traceStartAt, detailResizeLimit)}`,
        );
      }

      if (latest.cols === previousViewport.cols && latest.rows === previousViewport.rows) return;
      viewport = latest;
      renderFrame(true);
    }, 16);
    resizeTimer.unref?.();
  };

  const onStdoutResize = (): void => {
    if (traceResizeVerbose) {
      trace(
        `resize event source=stdout.resize viewport=${viewport.cols}x${viewport.rows} stdout={${describeStreamSize(stdout)}} fallback={${describeStreamSize(fallbackStdout)}}`,
      );
    }
    scheduleResize("stdout.resize");
  };
  const onFallbackResize = (): void => {
    if (traceResizeVerbose) {
      trace(
        `resize event source=fallback.resize viewport=${viewport.cols}x${viewport.rows} stdout={${describeStreamSize(stdout)}} fallback={${describeStreamSize(fallbackStdout)}}`,
      );
    }
    scheduleResize("fallback.resize");
  };

  stdoutWithEvents.on?.("resize", onStdoutResize);
  if (fallbackStdout !== stdout) {
    fallbackStdoutWithEvents.on?.("resize", onFallbackResize);
  }

  const onSigWinch = (): void => {
    if (traceResizeVerbose) {
      trace(
        `resize event source=sigwinch viewport=${viewport.cols}x${viewport.rows} stdout={${describeStreamSize(stdout)}} fallback={${describeStreamSize(fallbackStdout)}}`,
      );
    }
    scheduleResize("sigwinch");
  };
  process.on("SIGWINCH", onSigWinch);

  if (traceEnabled) {
    trace(
      `resize-hooks attached stdoutListenerCount=${listenerCount(stdoutWithEvents, "resize")} fallbackListenerCount=${listenerCount(fallbackStdoutWithEvents, "resize")} sigwinchListenerCount=${process.listenerCount("SIGWINCH")} stdoutEqFallback=${stdout === fallbackStdout}`,
    );
  }

  let pollTick = 0;
  let lastStdoutSignature = describeStreamSize(stdout);
  let lastFallbackSignature = describeStreamSize(fallbackStdout);
  const viewportPoll = setInterval(() => {
    pollTick += 1;
    const latest = readViewportSize(stdout, fallbackStdout);
    const stdoutSignature = describeStreamSize(stdout);
    const fallbackSignature = describeStreamSize(fallbackStdout);
    const streamSignatureChanged =
      stdoutSignature !== lastStdoutSignature || fallbackSignature !== lastFallbackSignature;
    const viewportChanged = latest.cols !== viewport.cols || latest.rows !== viewport.rows;

    if (streamSignatureChanged) {
      trace(
        `poll stream-signature changed tick=${pollTick} stdout={${stdoutSignature}} fallback={${fallbackSignature}} current=${viewport.cols}x${viewport.rows} latest=${latest.cols}x${latest.rows}`,
      );
      lastStdoutSignature = stdoutSignature;
      lastFallbackSignature = fallbackSignature;
    }

    if (traceResizeVerbose && (streamSignatureChanged || pollTick % tracePollEvery === 0 || viewportChanged)) {
      trace(
        `poll tick=${pollTick} current=${viewport.cols}x${viewport.rows} latest=${latest.cols}x${latest.rows} changed=${viewportChanged} stdout={${stdoutSignature}} fallback={${fallbackSignature}}`,
      );
    }

    if (viewportChanged) {
      if (traceResizeVerbose) {
        trace(
          `poll detected viewport drift previous=${viewport.cols}x${viewport.rows} latest=${latest.cols}x${latest.rows}`,
        );
      }
      scheduleResize("poll");
    }
  }, viewportPollMs);
  viewportPoll.unref?.();

  const removeResize = (): void => {
    if (typeof stdoutWithEvents.off === "function") {
      stdoutWithEvents.off("resize", onStdoutResize);
    } else {
      stdoutWithEvents.removeListener?.("resize", onStdoutResize);
    }

    if (fallbackStdout !== stdout) {
      if (typeof fallbackStdoutWithEvents.off === "function") {
        fallbackStdoutWithEvents.off("resize", onFallbackResize);
      } else {
        fallbackStdoutWithEvents.removeListener?.("resize", onFallbackResize);
      }
    }

    process.off("SIGWINCH", onSigWinch);
    clearInterval(viewportPoll);
    if (idleRepaintTimer !== undefined) {
      clearInterval(idleRepaintTimer);
    }
    if (resizeTimer !== undefined) {
      clearTimeout(resizeTimer);
      resizeTimer = undefined;
    }
    removeDrainListener();
    restoreStdoutWrite?.();
    restoreStdoutWrite = undefined;
  };

  const removeData = (): void => {
    stdin.off?.("data", onData);
    stdin.removeListener?.("data", onData);
  };

  const leaveAlternateBuffer = (): void => {
    if (!usingAlternateBuffer) return;
    usingAlternateBuffer = false;
    writeCompat("\u001b[?1049l");
  };

  return {
    rerender: (newElement: React.ReactElement) => {
      doRender(newElement);
    },
    unmount: () => {
      commitSync(container, null);
      bridge.exit();
      removeData();
      removeResize();
      if (typeof stdinWithRaw.setRawMode === "function") {
        stdinWithRaw.setRawMode(false);
        stdinWithRaw.pause?.();
      }
      showCursor();
      leaveAlternateBuffer();
    },
    waitUntilExit: () => bridge.exitPromise,
    clear: () => bridge.clearOutput(),
    cleanup: () => {
      removeData();
      removeResize();
      bridge.dispose();
      showCursor();
      leaveAlternateBuffer();
    },
  };
}
