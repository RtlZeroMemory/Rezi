import { appendFileSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { format as formatConsoleMessage } from "node:util";
import {
  type Rgb,
  type TextStyle,
  type VNode,
  createTestRenderer,
  measureTextCells,
} from "@rezi-ui/core";
import React from "react";

import { type KittyFlagName, resolveKittyFlags } from "../kitty-keyboard.js";
import type { InkHostContainer, InkHostNode } from "../reconciler/types.js";
import { enableTranslationTrace, flushTranslationTrace } from "../translation/traceCollector.js";
import { checkAllResizeObservers } from "./ResizeObserver.js";
import { createBridge } from "./bridge.js";
import { InkContext } from "./context.js";
import { advanceLayoutGeneration, readCurrentLayout, writeCurrentLayout } from "./layoutState.js";
import { commitSync, createReactRoot } from "./reactHelpers.js";

export interface KittyKeyboardOptions {
  mode?: "auto" | "enabled" | "disabled";
  flags?: readonly KittyFlagName[];
}

export interface RenderOptions {
  stdout?: Writable;
  stdin?: Readable;
  stderr?: Writable;
  exitOnCtrlC?: boolean;
  patchConsole?: boolean;
  debug?: boolean;
  maxFps?: number;
  concurrent?: boolean;
  kittyKeyboard?: KittyKeyboardOptions;
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
  waitUntilExit(): Promise<unknown>;
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

interface ColorSupport {
  level: 0 | 1 | 2 | 3;
  noColor: boolean;
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

interface RenderWritePayload {
  output: string;
  staticOutput: string;
}

const MAX_QUEUED_OUTPUTS = 4;
const CORE_DEFAULT_FG: Readonly<Rgb> = Object.freeze({ r: 232, g: 238, b: 245 });
const CORE_DEFAULT_BG: Readonly<Rgb> = Object.freeze({ r: 7, g: 10, b: 12 });
const FORCED_TRUECOLOR_SUPPORT: ColorSupport = Object.freeze({ level: 3, noColor: false });
const FILL_CELLS_SMALL_SPAN_THRESHOLD = 160;

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

  const primaryCols =
    primaryWindow.cols ?? readPositiveInt((stdout as { columns?: unknown }).columns);
  const primaryRows = primaryWindow.rows ?? readPositiveInt((stdout as { rows?: unknown }).rows);

  const fallbackCols =
    stdout === fallbackStdout
      ? undefined
      : (fallbackWindow.cols ?? readPositiveInt((fallbackStdout as { columns?: unknown }).columns));
  const fallbackRows =
    stdout === fallbackStdout
      ? undefined
      : (fallbackWindow.rows ?? readPositiveInt((fallbackStdout as { rows?: unknown }).rows));

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

function summarizeGridShape(grid: StyledCell[][]): OutputShapeSummary {
  const lines = grid.length;
  let nonBlankLines = 0;
  let firstNonBlankLine = -1;
  let lastNonBlankLine = -1;
  let widestLine = 0;

  for (let rowIndex = 0; rowIndex < lines; rowIndex += 1) {
    const row = grid[rowIndex]!;
    let lastUsefulCol = -1;
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      const cell = row[colIndex]!;
      if ((cell.char !== "" && cell.char !== " ") || styleVisibleOnSpace(cell.style)) {
        lastUsefulCol = colIndex;
      }
    }
    widestLine = Math.max(widestLine, lastUsefulCol + 1);
    if (lastUsefulCol >= 0) {
      nonBlankLines += 1;
      if (firstNonBlankLine === -1) firstNonBlankLine = rowIndex;
      lastNonBlankLine = rowIndex;
    }
  }

  return { lines, nonBlankLines, firstNonBlankLine, lastNonBlankLine, widestLine };
}

function trimAnsiToNonBlankBlock(output: string): string {
  if (output.length === 0) return "";

  const rawLines = output.split("\n");
  const plainLines = rawLines.map((line) => line.replace(/\u001b\[[0-9;]*m/g, ""));

  let first = -1;
  let last = -1;
  for (let index = 0; index < plainLines.length; index += 1) {
    const line = plainLines[index] ?? "";
    if (line.trimEnd().length === 0) continue;
    if (first === -1) first = index;
    last = index;
  }

  if (first === -1 || last === -1) return "";
  return rawLines.slice(first, last + 1).join("\n");
}

function countRenderedLines(output: string): number {
  if (output.length === 0) return 0;
  return output.split("\n").length;
}

function eraseLines(count: number): string {
  if (count <= 0) return "";

  let out = "";
  for (let index = 0; index < count; index += 1) {
    out += "\u001b[2K";
    if (index < count - 1) {
      out += "\u001b[1A";
    }
  }

  out += "\u001b[G";
  return out;
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

/**
 * In non-alternate-buffer (static channel) mode the dynamic frame must be
 * content-sized — just like real Ink.  Two things cause the layout to expand
 * to fill the viewport constraint:
 *
 * 1. `overflow: "hidden"` on the root — makes it a clip container that fills
 *    the available space.
 * 2. `flex: 1` added by Fix #4 (the Ink/Yoga flexShrink:0 compat shim) —
 *    causes nodes to grow to fill their parent's height.
 *
 * This function recursively walks the VNode tree and:
 *  - Strips `overflow: "hidden"` from the root.
 *  - Strips `flex:1` from any node that matches the Fix #4 pattern
 *    (flex:1 + flexShrink:0).  Original flex:1 nodes have flexShrink:1
 *    (the Ink default) and are left intact.
 *
 * The result is a content-sized layout matching real Ink non-alt-buffer
 * rendering.
 */
function makeContentSized(vnode: VNode, isRoot = true, parentIsVertical = true): VNode {
  if (typeof vnode !== "object" || vnode === null) return vnode;

  const candidate = vnode as {
    kind?: unknown;
    props?: unknown;
    children?: readonly VNode[];
  };

  const isContainer =
    candidate.kind === "box" || candidate.kind === "row" || candidate.kind === "column";

  if (!isContainer) return vnode;

  const props =
    typeof candidate.props === "object" && candidate.props !== null
      ? (candidate.props as Record<string, unknown>)
      : {};

  let propsChanged = false;
  const nextProps = { ...props };

  // Root only: strip overflow
  if (isRoot) {
    const overflow = typeof props["overflow"] === "string" ? props["overflow"] : "";
    if (overflow === "hidden" || overflow === "scroll") {
      delete nextProps["overflow"];
      propsChanged = true;
    }
  }

  // In a vertical parent (column/box), flex:1 causes HEIGHT expansion
  // which makes the frame fill the viewport.  Strip it so nodes fall
  // back to intrinsic content height.
  // In a horizontal parent (row), flex:1 causes WIDTH distribution
  // which is fine and must be preserved.
  if (parentIsVertical) {
    const hasFlex = props["flex"] != null && toNumber(props["flex"]) !== 0;
    const hasGrow = toNumber(props["flexGrow"]) != null && toNumber(props["flexGrow"])! > 0;
    if (hasFlex) {
      delete nextProps["flex"];
      nextProps["flexGrow"] = 0;
      propsChanged = true;
    } else if (hasGrow) {
      nextProps["flexGrow"] = 0;
      propsChanged = true;
    }

    // Strip height / minHeight / flexBasis that may have been resolved
    // from percentage markers (e.g. height:"100%" → height:<viewport.rows>)
    // by resolvePercentMarkers which runs before makeContentSized.
    // Without this, a node with height=viewportRows would force the
    // layout to fill the viewport even though flex was removed above.
    if (toNumber(props["height"]) != null) {
      delete nextProps["height"];
      propsChanged = true;
    }
    if (toNumber(props["minHeight"]) != null) {
      delete nextProps["minHeight"];
      propsChanged = true;
    }
    if (toNumber(props["flexBasis"]) != null) {
      delete nextProps["flexBasis"];
      propsChanged = true;
    }
  }

  // Recurse into children — pass whether THIS node is a vertical container
  const thisIsVertical = candidate.kind !== "row";
  const children = Array.isArray(candidate.children) ? candidate.children : undefined;
  let nextChildren = children;
  if (children && children.length > 0) {
    const mapped: VNode[] = [];
    let childrenChanged = false;
    for (const child of children) {
      const next = makeContentSized(child, false, thisIsVertical);
      mapped.push(next);
      if (next !== child) childrenChanged = true;
    }
    if (childrenChanged) nextChildren = mapped;
  }

  if (!propsChanged && nextChildren === children) return vnode;

  const out: Record<string, unknown> = {
    ...(vnode as Record<string, unknown>),
  };
  if (propsChanged) out["props"] = nextProps;
  if (nextChildren !== children) out["children"] = nextChildren;
  return out as VNode;
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

interface ConsolePatchTarget {
  writeStdout: (line: string) => void;
  writeStderr: (line: string) => void;
}

let nextConsolePatchId = 1;
const consolePatchTargets = new Map<number, ConsolePatchTarget>();
const consolePatchStack: number[] = [];
let consolePatchOriginal:
  | {
      log: typeof console.log;
      info: typeof console.info;
      warn: typeof console.warn;
      error: typeof console.error;
    }
  | undefined;

function activeConsolePatchTarget(): ConsolePatchTarget | undefined {
  if (consolePatchStack.length === 0) return undefined;
  const topId = consolePatchStack[consolePatchStack.length - 1];
  if (topId == null) return undefined;
  return consolePatchTargets.get(topId);
}

function ensureConsolePatched(): void {
  if (consolePatchOriginal) return;
  consolePatchOriginal = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args: unknown[]) => {
    const target = activeConsolePatchTarget();
    if (target) {
      target.writeStdout(`${formatConsoleMessage(...args)}\n`);
      return;
    }
    consolePatchOriginal?.log(...args);
  };
  console.info = (...args: unknown[]) => {
    const target = activeConsolePatchTarget();
    if (target) {
      target.writeStdout(`${formatConsoleMessage(...args)}\n`);
      return;
    }
    consolePatchOriginal?.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    const target = activeConsolePatchTarget();
    if (target) {
      target.writeStderr(`${formatConsoleMessage(...args)}\n`);
      return;
    }
    consolePatchOriginal?.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    const target = activeConsolePatchTarget();
    if (target) {
      target.writeStderr(`${formatConsoleMessage(...args)}\n`);
      return;
    }
    consolePatchOriginal?.error(...args);
  };
}

function attachConsolePatchTarget(target: ConsolePatchTarget): () => void {
  ensureConsolePatched();
  const patchId = nextConsolePatchId;
  nextConsolePatchId += 1;
  consolePatchTargets.set(patchId, target);
  consolePatchStack.push(patchId);

  return () => {
    consolePatchTargets.delete(patchId);
    const stackIndex = consolePatchStack.lastIndexOf(patchId);
    if (stackIndex >= 0) {
      consolePatchStack.splice(stackIndex, 1);
    }

    if (consolePatchTargets.size > 0) return;
    if (!consolePatchOriginal) return;

    console.log = consolePatchOriginal.log;
    console.info = consolePatchOriginal.info;
    console.warn = consolePatchOriginal.warn;
    console.error = consolePatchOriginal.error;
    consolePatchOriginal = undefined;
  };
}

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

function snapshotHostTreeNode(node: InkHostNode, depth: number, childLimit: number): unknown {
  const out: Record<string, unknown> = {
    type: node.type,
    textContent: node.textContent ?? "",
    childCount: node.children.length,
    props: summarizeUnknown(node.props),
  };

  if (depth <= 0) return Object.freeze(out);

  const children = node.children
    .slice(0, childLimit)
    .map((child) => snapshotHostTreeNode(child, depth - 1, childLimit));
  if (node.children.length > childLimit) {
    children.push(Object.freeze({ truncatedChildren: node.children.length - childLimit }));
  }
  out["children"] = children;
  return Object.freeze(out);
}

function snapshotHostTree(rootNode: InkHostContainer, depth: number, childLimit: number): unknown {
  const children = rootNode.children
    .slice(0, childLimit)
    .map((child) => snapshotHostTreeNode(child, depth - 1, childLimit));
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
        text: typeof node.text === "string" ? formatLineSnippet(node.text, 80) : undefined,
        props: summarizeUnknown(node.props),
      }),
    );
  }
  if (nodes.length > limit) out.push(Object.freeze({ truncatedNodes: nodes.length - limit }));
  return Object.freeze(out);
}

function snapshotOps(ops: readonly RenderOp[], limit: number): readonly unknown[] {
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

function snapshotOpsOutsideViewport(
  ops: readonly RenderOp[],
  viewport: ViewportSize,
  limit: number,
): readonly unknown[] {
  const out: unknown[] = [];

  const push = (entry: Record<string, unknown>): void => {
    if (out.length >= limit) return;
    out.push(Object.freeze(entry));
  };

  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index];
    if (!op) continue;

    if (op.kind === "fillRect") {
      const x1 = Math.trunc(op.x);
      const y1 = Math.trunc(op.y);
      const x2 = x1 + Math.max(0, Math.trunc(op.w));
      const y2 = y1 + Math.max(0, Math.trunc(op.h));
      if (x1 < 0 || y1 < 0 || x2 > viewport.cols || y2 > viewport.rows) {
        push({
          index,
          kind: op.kind,
          x: x1,
          y: y1,
          w: Math.max(0, Math.trunc(op.w)),
          h: Math.max(0, Math.trunc(op.h)),
          outside: {
            top: Math.max(0, -y1),
            left: Math.max(0, -x1),
            right: Math.max(0, x2 - viewport.cols),
            bottom: Math.max(0, y2 - viewport.rows),
          },
        });
      }
      continue;
    }

    if (op.kind === "drawText") {
      const x1 = Math.trunc(op.x);
      const y1 = Math.trunc(op.y);
      const width = measureTextCells(op.text);
      const x2 = x1 + Math.max(0, width);
      const y2 = y1 + 1;
      if (x1 < 0 || y1 < 0 || x2 > viewport.cols || y2 > viewport.rows) {
        push({
          index,
          kind: op.kind,
          x: x1,
          y: y1,
          width,
          text: formatLineSnippet(op.text, 40),
          outside: {
            top: Math.max(0, -y1),
            left: Math.max(0, -x1),
            right: Math.max(0, x2 - viewport.cols),
            bottom: Math.max(0, y2 - viewport.rows),
          },
        });
      }
    }
  }

  if (out.length === limit) {
    out.push(Object.freeze({ truncated: true }));
  }
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

  const props =
    typeof n["props"] === "object" && n["props"] !== null
      ? (n["props"] as Record<string, unknown>)
      : {};

  // Capture relevant props for debugging
  const snap: Record<string, unknown> = { kind };
  if (typeof n["text"] === "string") snap["text"] = (n["text"] as string).slice(0, 60);
  // Layout props
  for (const key of [
    "width",
    "height",
    "minWidth",
    "minHeight",
    "maxWidth",
    "maxHeight",
    "flex",
    "flexShrink",
    "flexBasis",
    "overflow",
    "scrollY",
    "scrollX",
    "gap",
    "p",
    "px",
    "py",
    "pt",
    "pb",
    "pl",
    "pr",
    "m",
    "mx",
    "my",
    "mt",
    "mb",
    "ml",
    "mr",
    "items",
    "justify",
    "alignSelf",
    "wrap",
    "reverse",
  ]) {
    if (props[key] != null) snap[key] = props[key];
  }
  // Border props
  for (const key of [
    "border",
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
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
    if ((props["spans"] as unknown[]).length > 10)
      snap["spansTruncated"] = (props["spans"] as unknown[]).length;
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
 * Useful when tracking unexpected background/style rows.
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
      if ((cell.char !== "" && cell.char !== " ") || styleVisibleOnSpace(cell.style))
        lastVisibleCol = col;
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
    const overflow =
      rootChild.props["overflow"] ?? rootChild.props["overflowY"] ?? rootChild.props["overflowX"];
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

function scanHostTreeForStaticAndAnsi(rootNode: InkHostContainer): {
  hasStaticNodes: boolean;
  hasAnsiSgr: boolean;
} {
  return {
    hasStaticNodes: rootNode.__inkSubtreeHasStatic,
    hasAnsiSgr: rootNode.__inkSubtreeHasAnsiSgr,
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

function isSameRgb(a: Rgb, b: Readonly<Rgb>): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

const ANSI16_PALETTE: readonly [number, number, number][] = [
  [0, 0, 0],
  [205, 0, 0],
  [0, 205, 0],
  [205, 205, 0],
  [0, 0, 238],
  [205, 0, 205],
  [0, 205, 205],
  [229, 229, 229],
  [127, 127, 127],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [92, 92, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];

function parseForceColorValue(value: string | undefined): 0 | 1 | 2 | 3 | undefined {
  if (value == null || value.length === 0) return undefined;
  if (value === "true") return 1;
  if (value === "false") return 0;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed <= 0) return 0;
  if (parsed >= 3) return 3;
  return parsed as 1 | 2;
}

function detectColorSupport(stdout: Writable): ColorSupport {
  if (process.env["NO_COLOR"] != null && process.env["NO_COLOR"] !== "") {
    return { level: 0, noColor: true };
  }

  const forced = parseForceColorValue(process.env["FORCE_COLOR"]);
  if (forced != null) {
    return { level: forced, noColor: forced === 0 };
  }

  const depthReader = (stdout as { getColorDepth?: unknown }).getColorDepth;
  if (typeof depthReader === "function") {
    try {
      const depth = (depthReader as () => unknown).call(stdout);
      if (typeof depth === "number" && Number.isFinite(depth)) {
        if (depth >= 24) return { level: 3, noColor: false };
        if (depth >= 8) return { level: 2, noColor: false };
        if (depth >= 2) return { level: 1, noColor: false };
        return { level: 0, noColor: true };
      }
    } catch {}
  }

  return { level: 3, noColor: false };
}

function colorDistanceSq(a: Rgb, b: readonly [number, number, number]): number {
  const dr = a.r - b[0];
  const dg = a.g - b[1];
  const db = a.b - b[2];
  return dr * dr + dg * dg + db * db;
}

function toAnsi16Code(color: Rgb, background: boolean): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ANSI16_PALETTE.length; index += 1) {
    const candidate = ANSI16_PALETTE[index]!;
    const distance = colorDistanceSq(color, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  if (bestIndex < 8) {
    return (background ? 40 : 30) + bestIndex;
  }
  return (background ? 100 : 90) + (bestIndex - 8);
}

function rgbChannelToCubeLevel(channel: number): number {
  if (channel < 48) return 0;
  if (channel < 114) return 1;
  return Math.min(5, Math.floor((channel - 35) / 40));
}

function toAnsi256Code(color: Rgb): number {
  const rLevel = rgbChannelToCubeLevel(color.r);
  const gLevel = rgbChannelToCubeLevel(color.g);
  const bLevel = rgbChannelToCubeLevel(color.b);
  const cubeCode = 16 + 36 * rLevel + 6 * gLevel + bLevel;

  const cubeColor: Rgb = {
    r: rLevel === 0 ? 0 : 55 + 40 * rLevel,
    g: gLevel === 0 ? 0 : 55 + 40 * gLevel,
    b: bLevel === 0 ? 0 : 55 + 40 * bLevel,
  };

  const avg = Math.round((color.r + color.g + color.b) / 3);
  const grayLevel = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const grayCode = 232 + grayLevel;
  const grayValue = 8 + 10 * grayLevel;
  const grayColor: Rgb = { r: grayValue, g: grayValue, b: grayValue };

  const cubeDistance = colorDistanceSq(color, [cubeColor.r, cubeColor.g, cubeColor.b]);
  const grayDistance = colorDistanceSq(color, [grayColor.r, grayColor.g, grayColor.b]);
  return grayDistance < cubeDistance ? grayCode : cubeCode;
}

/**
 * Cache normalized styles by identity — Rezi's renderer reuses TextStyle
 * objects across draw ops, so identity-based caching is highly effective.
 */
const normalizeStyleCache = new WeakMap<TextStyle, CellStyle | undefined>();

function normalizeStyle(style: TextStyle | undefined): CellStyle | undefined {
  if (!style) return undefined;

  const cached = normalizeStyleCache.get(style);
  if (cached !== undefined) return cached;
  // WeakMap returns undefined for both missing entries and stored undefined
  // values, so use a separate check for the "computed but undefined" case.
  if (normalizeStyleCache.has(style)) return undefined;

  const normalized: CellStyle = {};
  if (isRgb(style.fg)) {
    const fg = { r: clampByte(style.fg.r), g: clampByte(style.fg.g), b: clampByte(style.fg.b) };
    // Rezi carries DEFAULT_BASE_STYLE through every text draw op. Ink treats
    // terminal defaults as implicit, so suppress those default color channels.
    if (!isSameRgb(fg, CORE_DEFAULT_FG)) {
      normalized.fg = fg;
    }
  }
  if (isRgb(style.bg)) {
    const bg = { r: clampByte(style.bg.r), g: clampByte(style.bg.g), b: clampByte(style.bg.b) };
    if (!isSameRgb(bg, CORE_DEFAULT_BG)) {
      normalized.bg = bg;
    }
  }
  if (style.bold === true) normalized.bold = true;
  if (style.dim === true) normalized.dim = true;
  if (style.italic === true) normalized.italic = true;
  if (style.underline === true) normalized.underline = true;
  if (style.strikethrough === true) normalized.strikethrough = true;
  if (style.inverse === true) normalized.inverse = true;

  const hasKeys =
    normalized.fg !== undefined ||
    normalized.bg !== undefined ||
    normalized.bold !== undefined ||
    normalized.dim !== undefined ||
    normalized.italic !== undefined ||
    normalized.underline !== undefined ||
    normalized.strikethrough !== undefined ||
    normalized.inverse !== undefined;
  const result = hasKeys ? normalized : undefined;
  normalizeStyleCache.set(style, result);
  return result;
}

function rgbEqual(a: Rgb | undefined, b: Rgb | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

function stylesEqual(a: CellStyle | undefined, b: CellStyle | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.strikethrough === b.strikethrough &&
    a.inverse === b.inverse &&
    rgbEqual(a.fg, b.fg) &&
    rgbEqual(a.bg, b.bg)
  );
}

function styleVisibleOnSpace(style: CellStyle | undefined): boolean {
  if (!style) return false;
  return style.bg !== undefined || style.inverse === true || style.underline === true;
}

// Cells are treated as immutable; we always replace array elements instead of mutating
// `char`/`style` in place. This lets us safely reuse a few shared cell objects.
const BLANK_CELL: StyledCell = { char: " ", style: undefined };
const WIDE_EMPTY_CELL: StyledCell = { char: "", style: undefined };
const SPACE_CELL_CACHE = new WeakMap<CellStyle, StyledCell>();

function getSpaceCell(style: CellStyle | undefined): StyledCell {
  if (!style) return BLANK_CELL;
  const cached = SPACE_CELL_CACHE.get(style);
  if (cached) return cached;
  const cell: StyledCell = { char: " ", style };
  SPACE_CELL_CACHE.set(style, cell);
  return cell;
}

/**
 * Identity-based SGR cache. Most frames use only 3-5 distinct CellStyle
 * objects, so caching by identity avoids rebuilding ANSI strings per-cell.
 */
const sgrCache = new Map<CellStyle, string>();
let sgrCacheColorLevel: number = -1;

function styleToSgr(style: CellStyle | undefined, colorSupport: ColorSupport): string {
  if (!style) return "\u001b[0m";

  // Invalidate cache when color support changes (rare)
  if (colorSupport.level !== sgrCacheColorLevel) {
    sgrCache.clear();
    sgrCacheColorLevel = colorSupport.level;
  }

  const cached = sgrCache.get(style);
  if (cached !== undefined) return cached;

  const codes: string[] = [];
  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.inverse) codes.push("7");
  if (style.strikethrough) codes.push("9");
  if (colorSupport.level > 0) {
    if (style.fg) {
      if (colorSupport.level >= 3) {
        codes.push(
          `38;2;${clampByte(style.fg.r)};${clampByte(style.fg.g)};${clampByte(style.fg.b)}`,
        );
      } else if (colorSupport.level === 2) {
        codes.push(`38;5;${toAnsi256Code(style.fg)}`);
      } else {
        codes.push(String(toAnsi16Code(style.fg, false)));
      }
    }
    if (style.bg) {
      if (colorSupport.level >= 3) {
        codes.push(
          `48;2;${clampByte(style.bg.r)};${clampByte(style.bg.g)};${clampByte(style.bg.b)}`,
        );
      } else if (colorSupport.level === 2) {
        codes.push(`48;5;${toAnsi256Code(style.bg)}`);
      } else {
        codes.push(String(toAnsi16Code(style.bg, true)));
      }
    }
  }

  let result: string;
  if (codes.length === 0) {
    result = "\u001b[0m";
  } else {
    // Always reset (0) before applying new attributes to prevent attribute
    // bleed from previous cells (e.g. bold, bg carrying over).
    result = `\u001b[0;${codes.join(";")}m`;
  }

  sgrCache.set(style, result);
  // Prevent unbounded growth — evict oldest when too large
  if (sgrCache.size > 256) {
    const firstKey = sgrCache.keys().next().value;
    if (firstKey) sgrCache.delete(firstKey);
  }
  return result;
}

function inClipStack(x: number, y: number, clipStack: readonly ClipRect[]): boolean {
  for (const clip of clipStack) {
    if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
  }
  return true;
}

/**
 * Pre-compute the effective clip rect (intersection of all rects in stack).
 * Returns null for empty clip stack or empty intersection.
 * Reduces per-cell clip checking from O(clipStack.length) to O(1).
 */
function computeEffectiveClip(clipStack: readonly ClipRect[]): ClipRect | null {
  if (clipStack.length === 0) return null;
  let x1 = clipStack[0]!.x;
  let y1 = clipStack[0]!.y;
  let x2 = x1 + clipStack[0]!.w;
  let y2 = y1 + clipStack[0]!.h;
  for (let i = 1; i < clipStack.length; i++) {
    const c = clipStack[i]!;
    x1 = Math.max(x1, c.x);
    y1 = Math.max(y1, c.y);
    x2 = Math.min(x2, c.x + c.w);
    y2 = Math.min(y2, c.y + c.h);
  }
  if (x1 >= x2 || y1 >= y2) return null;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function inEffectiveClip(x: number, y: number, clip: ClipRect | null): boolean {
  if (clip === null) return true;
  return x >= clip.x && x < clip.x + clip.w && y >= clip.y && y < clip.y + clip.h;
}

function fillCells(
  grid: StyledCell[][],
  viewport: ViewportSize,
  clip: ClipRect | null,
  x: number,
  y: number,
  w: number,
  h: number,
  style: CellStyle | undefined,
): void {
  // Compute effective bounds (intersection of fill rect, viewport, and clip)
  let startX = Math.max(0, x);
  let startY = Math.max(0, y);
  let endX = Math.min(viewport.cols, x + w);
  let endY = Math.min(viewport.rows, y + h);
  if (clip !== null) {
    startX = Math.max(startX, clip.x);
    startY = Math.max(startY, clip.y);
    endX = Math.min(endX, clip.x + clip.w);
    endY = Math.min(endY, clip.y + clip.h);
  }
  const fillCell = getSpaceCell(style);
  for (let yy = startY; yy < endY; yy += 1) {
    const row = grid[yy];
    if (!row) continue;
    const span = endX - startX;
    if (span <= FILL_CELLS_SMALL_SPAN_THRESHOLD) {
      for (let xx = startX; xx < endX; xx += 1) {
        row[xx] = fillCell;
      }
      continue;
    }
    row.fill(fillCell, startX, endX);
  }
}

/**
 * Merge an overlay cell style on top of an existing base style.
 * Preserves base properties (especially bg from fillRect) when the
 * overlay doesn't explicitly set them.
 */
const MERGED_STYLE_CACHE = new WeakMap<CellStyle, WeakMap<CellStyle, CellStyle>>();

function mergeCellStyles(
  base: CellStyle | undefined,
  overlay: CellStyle | undefined,
): CellStyle | undefined {
  if (!overlay && !base) return undefined;
  if (!overlay) return base;
  if (!base) return overlay;
  if (base === overlay) return base;

  let overlayCache = MERGED_STYLE_CACHE.get(base);
  if (!overlayCache) {
    overlayCache = new WeakMap<CellStyle, CellStyle>();
    MERGED_STYLE_CACHE.set(base, overlayCache);
  }
  const cached = overlayCache.get(overlay);
  if (cached) return cached;

  const bg = overlay.bg ?? base.bg;
  const fg = overlay.fg ?? base.fg;
  const bold = overlay.bold ?? base.bold;
  const dim = overlay.dim ?? base.dim;
  const italic = overlay.italic ?? base.italic;
  const underline = overlay.underline ?? base.underline;
  const strikethrough = overlay.strikethrough ?? base.strikethrough;
  const inverse = overlay.inverse ?? base.inverse;

  // If the overlay doesn't change anything, reuse the base style object.
  if (
    bg === base.bg &&
    fg === base.fg &&
    bold === base.bold &&
    dim === base.dim &&
    italic === base.italic &&
    underline === base.underline &&
    strikethrough === base.strikethrough &&
    inverse === base.inverse
  ) {
    overlayCache.set(overlay, base);
    return base;
  }

  const merged: CellStyle = {};
  if (bg) merged.bg = bg;
  if (fg) merged.fg = fg;
  if (bold) merged.bold = true;
  if (dim) merged.dim = true;
  if (italic) merged.italic = true;
  if (underline) merged.underline = true;
  if (strikethrough) merged.strikethrough = true;
  if (inverse) merged.inverse = true;

  overlayCache.set(overlay, merged);
  return merged;
}

type GraphemeSegmenter = {
  segment: (input: string) => Iterable<{ segment: string }>;
};

const graphemeSegmenter: GraphemeSegmenter | undefined = (() => {
  const maybeIntl = Intl as unknown as {
    Segmenter?: new (
      locales?: string | readonly string[],
      options?: Readonly<{ granularity?: "grapheme" | "word" | "sentence" }>,
    ) => GraphemeSegmenter;
  };
  if (typeof maybeIntl.Segmenter !== "function") return undefined;
  return new maybeIntl.Segmenter(undefined, { granularity: "grapheme" });
})();

function forEachGraphemeCluster(text: string, visit: (cluster: string) => void): void {
  if (text.length === 0) return;
  if (graphemeSegmenter) {
    for (const item of graphemeSegmenter.segment(text)) {
      const cluster = item.segment;
      if (cluster.length > 0) visit(cluster);
    }
    return;
  }

  let cluster = "";
  let joinWithNext = false;
  for (const codePoint of text) {
    const width = measureTextCells(codePoint);
    if (cluster.length === 0) {
      cluster = codePoint;
      joinWithNext = codePoint === "\u200d";
      continue;
    }
    if (joinWithNext || width <= 0 || codePoint === "\u200d") {
      cluster += codePoint;
      joinWithNext = codePoint === "\u200d";
      continue;
    }
    visit(cluster);
    cluster = codePoint;
    joinWithNext = codePoint === "\u200d";
  }
  if (cluster.length > 0) {
    visit(cluster);
  }
}

function drawTextToCells(
  grid: StyledCell[][],
  viewport: ViewportSize,
  clip: ClipRect | null,
  x0: number,
  y: number,
  text: string,
  style: CellStyle | undefined,
): void {
  if (y < 0 || y >= viewport.rows) return;
  if (clip !== null && (y < clip.y || y >= clip.y + clip.h)) return;
  const row = grid[y];
  if (!row) return;

  let cursorX = x0;
  forEachGraphemeCluster(text, (glyph) => {
    const width = measureTextCells(glyph);
    if (width <= 0) return;

    if (cursorX >= 0 && cursorX < viewport.cols && inEffectiveClip(cursorX, y, clip)) {
      const existingStyle = row[cursorX]?.style;
      if (!existingStyle) {
        row[cursorX] = { char: glyph, style };
      } else {
        row[cursorX] = { char: glyph, style: mergeCellStyles(existingStyle, style) };
      }
    }

    for (let offset = 1; offset < width; offset += 1) {
      const fillX = cursorX + offset;
      if (fillX >= 0 && fillX < viewport.cols && inEffectiveClip(fillX, y, clip)) {
        row[fillX] = WIDE_EMPTY_CELL;
      }
    }

    cursorX += width;
  });
}

function renderOpsToAnsi(
  ops: readonly RenderOp[],
  viewport: ViewportSize,
  colorSupport: ColorSupport,
): { ansi: string; grid: StyledCell[][] } {
  const grid: StyledCell[][] = new Array(viewport.rows);
  for (let rowIndex = 0; rowIndex < viewport.rows; rowIndex += 1) {
    const row = new Array<StyledCell>(viewport.cols);
    row.fill(BLANK_CELL);
    grid[rowIndex] = row;
  }

  const clipStack: ClipRect[] = [];
  let effectiveClip: ClipRect | null = null;

  for (const op of ops) {
    if (op.kind === "clear") {
      fillCells(grid, viewport, effectiveClip, 0, 0, viewport.cols, viewport.rows, undefined);
      continue;
    }
    if (op.kind === "clearTo") {
      // Use undefined style for clearTo so that "cleared" cells are
      // transparent (no bg) — matching real Ink which has empty styles
      // for unpainted cells.  The original DEFAULT_BASE_STYLE bg (from
      // the core renderer) would make every cell "visible" to the line
      // trimmer, producing an opaque dark background where Ink shows
      // the terminal's own background.
      fillCells(grid, viewport, effectiveClip, 0, 0, Math.max(0, Math.trunc(op.cols)), Math.max(0, Math.trunc(op.rows)), undefined);
      continue;
    }
    if (op.kind === "fillRect") {
      fillCells(
        grid,
        viewport,
        effectiveClip,
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
        effectiveClip,
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
      effectiveClip = computeEffectiveClip(clipStack);
      continue;
    }
    if (op.kind === "popClip") {
      clipStack.pop();
      effectiveClip = clipStack.length === 0 ? null : computeEffectiveClip(clipStack);
    }
  }

  const lines: string[] = [];

  for (const row of grid) {
    let lastUsefulCol = -1;
    for (let index = 0; index < row.length; index += 1) {
      const cell = row[index]!;
      if ((cell.char !== "" && cell.char !== " ") || styleVisibleOnSpace(cell.style))
        lastUsefulCol = index;
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
        line += styleToSgr(cell.style, colorSupport);
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

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function resolvePercent(value: number, base: number): number {
  return Math.max(0, Math.round((base * value) / 100));
}

type HostNodeWithLayout = InkHostNode & {
  __inkLayout?: { x: number; y: number; w: number; h: number };
  __inkLayoutGen?: number;
};

type FlexMainAxis = "row" | "column";

interface PercentResolveContext {
  parentSize: ViewportSize;
  parentMainAxis: FlexMainAxis;
}

function readHostNode(value: unknown): HostNodeWithLayout | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as HostNodeWithLayout;
  if (typeof candidate.type !== "string") return undefined;
  return candidate;
}

function readHostParentSize(
  hostNode: HostNodeWithLayout | undefined,
  fallback: ViewportSize,
): ViewportSize {
  const parentLayout = hostNode?.parent ? readCurrentLayout(hostNode.parent) : undefined;
  if (!parentLayout) return fallback;
  return {
    cols: Math.max(0, Math.trunc(parentLayout.w)),
    rows: Math.max(0, Math.trunc(parentLayout.h)),
  };
}

function readHostMainAxis(hostNode: HostNodeWithLayout | null): FlexMainAxis | undefined {
  if (!hostNode || hostNode.type !== "ink-box") return undefined;
  const direction = hostNode.props["flexDirection"];
  if (direction === "column" || direction === "column-reverse") return "column";
  return "row";
}

function readNodeMainAxis(kind: unknown): FlexMainAxis {
  if (kind === "row") return "row";
  return "column";
}

function hasPercentMarkers(vnode: VNode): boolean {
  if (typeof vnode !== "object" || vnode === null) return false;
  const candidate = vnode as { props?: unknown; children?: unknown };
  const props =
    typeof candidate.props === "object" && candidate.props !== null
      ? (candidate.props as Record<string, unknown>)
      : undefined;

  if (
    props &&
    (typeof props["__inkPercentWidth"] === "number" ||
      typeof props["__inkPercentHeight"] === "number" ||
      typeof props["__inkPercentMinWidth"] === "number" ||
      typeof props["__inkPercentMinHeight"] === "number" ||
      typeof props["__inkPercentFlexBasis"] === "number")
  ) {
    return true;
  }

  const children = Array.isArray(candidate.children) ? (candidate.children as VNode[]) : [];
  for (const child of children) {
    if (hasPercentMarkers(child)) return true;
  }
  return false;
}

function resolvePercentMarkers(vnode: VNode, context: PercentResolveContext): VNode {
  if (typeof vnode !== "object" || vnode === null) {
    return vnode;
  }

  const candidate = vnode as {
    kind?: unknown;
    props?: unknown;
    children?: unknown;
  };

  const originalProps =
    typeof candidate.props === "object" && candidate.props !== null
      ? (candidate.props as Record<string, unknown>)
      : {};
  const nextProps: Record<string, unknown> = { ...originalProps };
  const hostNode = readHostNode(originalProps["__inkHostNode"]);
  const parentSize = readHostParentSize(hostNode, context.parentSize);
  const parentMainAxis =
    readHostMainAxis(hostNode?.parent ? (hostNode.parent as HostNodeWithLayout) : null) ??
    context.parentMainAxis;

  const percentWidth = asFiniteNumber(originalProps["__inkPercentWidth"]);
  const percentHeight = asFiniteNumber(originalProps["__inkPercentHeight"]);
  const percentMinWidth = asFiniteNumber(originalProps["__inkPercentMinWidth"]);
  const percentMinHeight = asFiniteNumber(originalProps["__inkPercentMinHeight"]);
  const percentFlexBasis = asFiniteNumber(originalProps["__inkPercentFlexBasis"]);

  if (percentWidth != null) {
    nextProps["width"] = resolvePercent(percentWidth, parentSize.cols);
  }
  if (percentHeight != null) {
    nextProps["height"] = resolvePercent(percentHeight, parentSize.rows);
  }
  if (percentMinWidth != null) {
    nextProps["minWidth"] = resolvePercent(percentMinWidth, parentSize.cols);
  }
  if (percentMinHeight != null) {
    nextProps["minHeight"] = resolvePercent(percentMinHeight, parentSize.rows);
  }

  if (percentFlexBasis != null) {
    const basisBase = parentMainAxis === "column" ? parentSize.rows : parentSize.cols;
    nextProps["flexBasis"] = resolvePercent(percentFlexBasis, basisBase);
  }

  delete nextProps["__inkPercentWidth"];
  delete nextProps["__inkPercentHeight"];
  delete nextProps["__inkPercentMinWidth"];
  delete nextProps["__inkPercentMinHeight"];
  delete nextProps["__inkPercentFlexBasis"];

  const localWidth = asFiniteNumber(nextProps["width"]);
  const localHeight = asFiniteNumber(nextProps["height"]);

  const nextParentSize: ViewportSize = {
    cols: localWidth != null ? Math.max(0, Math.trunc(localWidth)) : parentSize.cols,
    rows: localHeight != null ? Math.max(0, Math.trunc(localHeight)) : parentSize.rows,
  };
  const nextContext: PercentResolveContext = {
    parentSize: nextParentSize,
    parentMainAxis: readNodeMainAxis(candidate.kind),
  };

  const originalChildren = Array.isArray(candidate.children) ? (candidate.children as VNode[]) : [];
  const nextChildren = originalChildren.map((child) => resolvePercentMarkers(child, nextContext));

  return {
    ...(vnode as Record<string, unknown>),
    props: nextProps,
    children: nextChildren,
  } as unknown as VNode;
}

function assignHostLayouts(
  container: InkHostContainer,
  nodes: readonly {
    rect?: { x?: number; y?: number; w?: number; h?: number };
    props?: Record<string, unknown>;
  }[],
): void {
  const generation = advanceLayoutGeneration(container);
  for (const node of nodes) {
    if (!node) continue;
    const host = node.props?.["__inkHostNode"];
    if (typeof host !== "object" || host === null) continue;
    const hostNode = host as HostNodeWithLayout;
    const rect = node.rect;
    const x = rect?.x;
    const y = rect?.y;
    const w = rect?.w;
    const h = rect?.h;
    if (
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y) ||
      typeof w !== "number" ||
      !Number.isFinite(w) ||
      typeof h !== "number" ||
      !Number.isFinite(h)
    ) {
      continue;
    }
    writeCurrentLayout(
      hostNode,
      {
        x: Math.trunc(x),
        y: Math.trunc(y),
        w: Math.max(0, Math.trunc(w)),
        h: Math.max(0, Math.trunc(h)),
      },
      generation,
    );
  }
}

function createRenderSession(element: React.ReactElement, options: RenderOptions = {}): Instance {
  const stdout = options.stdout ?? process.stdout;
  const stdin = options.stdin ?? process.stdin;
  const stderr = options.stderr ?? process.stderr;
  const fallbackStdout = process.stdout as Writable;
  const debug = options.debug ?? process.env["INK_COMPAT_DEBUG"] === "1";
  const patchConsoleEnabled = options.patchConsole ?? true;
  const incrementalRendering = options.incrementalRendering === true;
  const isScreenReaderEnabled =
    options.isScreenReaderEnabled ?? process.env["INK_SCREEN_READER"] === "true";
  const maxFps = options.maxFps ?? 30;
  const unthrottledRender = debug || isScreenReaderEnabled || maxFps <= 0;
  const renderIntervalMs = maxFps > 0 ? Math.max(1, Math.ceil(1000 / maxFps)) : 0;
  const colorSupport = detectColorSupport(stdout);

  const kittyMode = options.kittyKeyboard?.mode ?? "disabled";
  const kittyFlags = options.kittyKeyboard?.flags ?? ["disambiguateEscapeCodes"];
  const kittyKeyboardEnabled = kittyMode !== "disabled";

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
    isScreenReaderEnabled,
    kittyKeyboard: kittyKeyboardEnabled,
  });

  const container = createReactRoot(bridge.rootNode, (err: unknown) => {
    writeErr(
      `[ink-compat] REACT ERROR: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
    );
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
  let lastOutputLines: string[] = [];
  let lastOutputToRender = "";
  let lastOutputRenderLineCount = 0;
  let fullStaticOutput = "";
  let pendingStaticOutput = "";
  let frameCount = 0;
  let usingAlternateBuffer = options.alternateBuffer === true;
  let cursorHidden = false;
  let writeBlocked = false;
  const queuedOutputs: RenderWritePayload[] = [];
  let drainListener: (() => void) | undefined;
  let throttledRenderTimer: NodeJS.Timeout | undefined;
  let pendingRender = false;
  let pendingRenderForce = false;
  let lastRenderAt = 0;
  let rawModeRefCount = 0;
  let rawModeActive = false;
  let restoreConsole: (() => void) | undefined;
  let signalCleanupAttached = false;
  let kittyProtocolActive = false;
  const resizeTimeline: ResizeSignalRecord[] = [];
  let lastResizeSignalAt = 0;
  let lastResizeFlushAt = 0;
  let compatWriteDepth = 0;
  let restoreStdoutWrite: (() => void) | undefined;
  let lastCursorSignature = "hidden";

  const _s = debug ? writeErr : (_msg: string): void => {};

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
    `trace-config schema=3 enabled=${traceEnabled} detail=${traceDetail} detailFull=${traceDetailFull} allFrames=${traceAllFrames} ioWrites=${traceIoWrites} resizeVerbose=${traceResizeVerbose} maxFps=${maxFps} unthrottled=${unthrottledRender} incremental=${incrementalRendering} patchConsole=${patchConsoleEnabled} screenReader=${isScreenReaderEnabled} kittyMode=${kittyMode} nodeLimit=${detailNodeLimit} opLimit=${detailOpLimit} jsonDepth=${TRACE_SUMMARY_MAX_DEPTH} jsonArrayLimit=${TRACE_SUMMARY_ARRAY_LIMIT} jsonObjectLimit=${TRACE_SUMMARY_OBJECT_LIMIT}`,
  );

  // Enable translation-layer tracing (propsToVNode border/color/dimension logs)
  const translationTraceEnabled = traceEnabled && traceDetailFull;
  if (translationTraceEnabled) {
    enableTranslationTrace(true);
  }

  if (usingAlternateBuffer) {
    stdout.write("\u001b[?1049h");
  }
  if (kittyKeyboardEnabled && (stdout as { isTTY?: unknown }).isTTY === true) {
    const resolvedFlags = resolveKittyFlags(kittyFlags);
    if (debug || traceEnabled) {
      writeErr(
        `[ink-compat] kitty keyboard protocol enabled (mode=${kittyMode}, flags=${resolvedFlags})\n`,
      );
    }
    stdout.write(`\u001b[>${resolvedFlags}u`);
    kittyProtocolActive = true;
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
          `stdout.write external len=${raw.length} hasClear=${/\u001b\[[0-9;]*[HJ]/.test(raw)} hasAltIn=${raw.includes("\u001b[?1049h")} hasAltOut=${raw.includes("\u001b[?1049l")} preview=${safeJson(formatIoPreview(raw))}`,
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

  const toOutputToRender = (output: string): string => {
    const outputHeight = countRenderedLines(output);
    const isFullscreen =
      (stdout as { isTTY?: unknown }).isTTY === true && outputHeight >= viewport.rows;
    return isFullscreen ? output : `${output}\n`;
  };

  const enqueueWritePayload = (payload: RenderWritePayload): void => {
    if (queuedOutputs.length > 0) {
      const lastIndex = queuedOutputs.length - 1;
      const last = queuedOutputs[lastIndex]!;
      if (payload.output.length === 0) {
        queuedOutputs[lastIndex] = {
          output: last.output,
          staticOutput: `${last.staticOutput}${payload.staticOutput}`,
        };
      } else if (last.output === payload.output) {
        queuedOutputs[lastIndex] = {
          output: last.output,
          staticOutput: `${last.staticOutput}${payload.staticOutput}`,
        };
      } else {
        queuedOutputs.push(payload);
      }
    } else {
      queuedOutputs.push(payload);
    }

    while (queuedOutputs.length > MAX_QUEUED_OUTPUTS) {
      const dropped = queuedOutputs.shift();
      if (!dropped || dropped.staticOutput.length === 0) continue;
      if (queuedOutputs.length === 0) {
        queuedOutputs.push({ output: "", staticOutput: dropped.staticOutput });
      } else {
        const first = queuedOutputs[0]!;
        queuedOutputs[0] = {
          output: first.output,
          staticOutput: `${dropped.staticOutput}${first.staticOutput}`,
        };
      }
    }
  };

  const writeOutput = (payload: RenderWritePayload): void => {
    if (writeBlocked) {
      enqueueWritePayload(payload);
      lastOutput = payload.output;
      if (payload.output.length > 0) lastStableOutput = payload.output;
      const queuedTail = queuedOutputs[queuedOutputs.length - 1];
      trace(
        `write queue blocked=true outputLen=${payload.output.length} staticLen=${payload.staticOutput.length} queueDepth=${queuedOutputs.length} queuedLatestOutputLen=${queuedTail?.output.length ?? 0} queuedLatestStaticLen=${queuedTail?.staticOutput.length ?? 0} viewport=${viewport.cols}x${viewport.rows}`,
      );
      return;
    }

    const hasStaticChannel = fullStaticOutput.length > 0 || payload.staticOutput.length > 0;

    const syncCursorState = (): void => {
      if (hasStaticChannel) {
        hideCursor();
        return;
      }

      const cursor = bridge.context.getCursorPosition();
      if (!cursor) {
        hideCursor();
        return;
      }

      showCursor();
      const row = Math.max(1, Math.min(viewport.rows, Math.trunc(cursor.y) + 1));
      const col = Math.max(1, Math.min(viewport.cols, Math.trunc(cursor.x) + 1));
      writeCompat(`\u001b[${row};${col}H`);
    };

    const writeIncrementalOutput = (nextOutput: string): boolean => {
      const nextLines = nextOutput.length > 0 ? nextOutput.split("\n") : [];
      const previousLines = lastOutputLines;
      const maxLines = Math.max(previousLines.length, nextLines.length);

      let incrementalPayload = "";
      for (let index = 0; index < maxLines; index += 1) {
        const prevLine = previousLines[index] ?? "";
        const nextLine = nextLines[index] ?? "";
        if (prevLine === nextLine) continue;
        incrementalPayload += `\u001b[${index + 1};1H\u001b[2K${nextLine}`;
      }

      if (incrementalPayload.length === 0) {
        lastOutputLines = nextLines;
        syncCursorState();
        return true;
      }

      const ok = writeCompat(incrementalPayload);
      lastOutputLines = nextLines;
      syncCursorState();
      return ok;
    };

    const writeFullOutput = (nextOutput: string): boolean => {
      const ok = writeCompat(`\u001b[H\u001b[J${nextOutput}`);
      lastOutputLines = nextOutput.length > 0 ? nextOutput.split("\n") : [];
      syncCursorState();
      return ok;
    };

    const writeStaticChannelOutput = (nextOutput: string, nextStaticOutput: string): boolean => {
      let staticChannelPayload = "";

      if (lastOutputRenderLineCount > 0) {
        staticChannelPayload += eraseLines(lastOutputRenderLineCount);
      } else if (fullStaticOutput.length === 0 && nextStaticOutput.length > 0) {
        staticChannelPayload += "\u001b[H\u001b[J";
      }

      if (nextStaticOutput.length > 0) {
        staticChannelPayload += nextStaticOutput;
      }

      // In static channel mode, don't add trailing \n via toOutputToRender.
      // The static content + dynamic frame should fill exactly the viewport;
      // an extra \n would push 1 line into scrollback on every frame.
      staticChannelPayload += nextOutput;

      const ok = staticChannelPayload.length > 0 ? writeCompat(staticChannelPayload) : true;
      if (nextStaticOutput.length > 0) {
        fullStaticOutput += nextStaticOutput;
      }

      lastOutputToRender = nextOutput;
      lastOutputRenderLineCount = countRenderedLines(nextOutput);
      lastOutputLines = nextOutput.length > 0 ? nextOutput.split("\n") : [];
      hideCursor();
      return ok;
    };

    const writeNow = hasStaticChannel
      ? () => writeStaticChannelOutput(payload.output, payload.staticOutput)
      : () =>
          incrementalRendering
            ? writeIncrementalOutput(payload.output)
            : writeFullOutput(payload.output);

    const writeOk = writeNow();
    lastOutput = payload.output;
    if (payload.output.length > 0) lastStableOutput = payload.output;

    if (writeOk) return;
    if (drainListener) return;

    writeBlocked = true;
    trace(
      `write blocked outputLen=${payload.output.length} staticLen=${payload.staticOutput.length} viewport=${viewport.cols}x${viewport.rows}`,
    );
    drainListener = () => {
      removeDrainListener();
      writeBlocked = false;
      while (!writeBlocked && queuedOutputs.length > 0) {
        const next = queuedOutputs.shift()!;
        trace(
          `write drain flush outputLen=${next.output.length} staticLen=${next.staticOutput.length} queueRemaining=${queuedOutputs.length} viewport=${viewport.cols}x${viewport.rows}`,
        );
        writeOutput(next);
      }
    };
    stdoutWithEvents.on?.("drain", drainListener);
  };

  const preserveUiAroundStreamWrite = (stream: Writable, data: string): void => {
    if (data.length === 0) return;
    if (debug) {
      stream.write(data);
      return;
    }

    if (fullStaticOutput.length > 0) {
      if (lastOutputRenderLineCount > 0) {
        writeCompat(eraseLines(lastOutputRenderLineCount));
      }
      stream.write(data);
      if (lastOutputToRender.length > 0) {
        writeCompat(lastOutputToRender);
      }
      return;
    }

    if (incrementalRendering) {
      writeCompat("\u001b[H");
      for (let index = 0; index < lastOutputLines.length; index += 1) {
        writeCompat(`\u001b[${index + 1};1H\u001b[2K`);
      }
      lastOutputLines = [];
    } else {
      writeCompat("\u001b[H\u001b[J");
    }
    stream.write(data);
    if (lastOutput.length > 0) {
      writeOutput({ output: lastOutput, staticOutput: "" });
    }
  };

  bridge.context.writeStdout = (data: string) => {
    preserveUiAroundStreamWrite(stdout, data);
  };
  bridge.context.writeStderr = (data: string) => {
    preserveUiAroundStreamWrite(stderr, data);
  };

  const capturePendingStaticOutput = (): void => {
    const scan = scanHostTreeForStaticAndAnsi(bridge.rootNode);
    if (!scan.hasStaticNodes) return;

    const translatedStatic = bridge.translateStaticToVNode();
    const translatedStaticWithPercent = hasPercentMarkers(translatedStatic)
      ? resolvePercentMarkers(translatedStatic, {
          parentSize: viewport,
          parentMainAxis: "column",
        })
      : translatedStatic;
    const staticResult = renderer.render(translatedStaticWithPercent, { viewport });
    const staticHasAnsiSgr = scan.hasAnsiSgr;
    const staticColorSupport = staticHasAnsiSgr ? FORCED_TRUECOLOR_SUPPORT : colorSupport;
    const { ansi: staticAnsi } = renderOpsToAnsi(
      staticResult.ops as readonly RenderOp[],
      viewport,
      staticColorSupport,
    );
    const staticTrimmed = trimAnsiToNonBlankBlock(staticAnsi);

    trace(
      `staticCapture viewport=${viewport.cols}x${viewport.rows} hasAnsiSgr=${staticHasAnsiSgr} baseColorLevel=${colorSupport.level} effectiveColorLevel=${staticColorSupport.level} rawLines=${staticAnsi.split("\n").length} trimmedLines=${staticTrimmed.split("\n").length}`,
    );

    if (staticTrimmed.length === 0) return;
    pendingStaticOutput += `${staticTrimmed}\n`;
  };

  const renderFrame = (force = false): void => {
    const frameStartedAt = performance.now();
    frameCount++;
    try {
      const frameNow = Date.now();
      const nextViewport = readViewportSize(stdout, fallbackStdout);
      const viewportChanged =
        nextViewport.cols !== viewport.cols || nextViewport.rows !== viewport.rows;
      if (viewportChanged) {
        viewport = nextViewport;
      }

      const { vnode: translatedDynamic, meta: translationMeta } =
        bridge.translateDynamicWithMetadata();
      const hasDynamicPercentMarkers = translationMeta.hasPercentMarkers;

      // In static-channel mode, static output is rendered above the dynamic
      // frame, so dynamic layout works inside the remaining rows.
      const combinedStatic = fullStaticOutput + pendingStaticOutput;
      const staticRowsUsed =
        combinedStatic.length > 0 ? (combinedStatic.match(/\n/g)?.length ?? 0) : 0;
      const fullStaticRows =
        fullStaticOutput.length > 0 ? (fullStaticOutput.match(/\n/g)?.length ?? 0) : 0;
      const pendingStaticRows =
        pendingStaticOutput.length > 0 ? (pendingStaticOutput.match(/\n/g)?.length ?? 0) : 0;
      const layoutViewport: ViewportSize =
        staticRowsUsed > 0
          ? { cols: viewport.cols, rows: Math.max(1, viewport.rows - staticRowsUsed) }
          : viewport;

      let translatedDynamicWithPercent = hasDynamicPercentMarkers
        ? resolvePercentMarkers(translatedDynamic, {
            parentSize: layoutViewport,
            parentMainAxis: "column",
          })
        : translatedDynamic;
      const translationTraceEntries = traceEnabled ? flushTranslationTrace() : [];
      let vnode: VNode;
      let rootHeightCoerced: boolean;

      const coerced = coerceRootViewportHeight(translatedDynamicWithPercent, layoutViewport);
      vnode = coerced.vnode;
      rootHeightCoerced = coerced.coerced;
      let result = renderer.render(vnode, { viewport: layoutViewport });
      assignHostLayouts(
        bridge.rootNode,
        result.nodes as readonly {
          rect?: { x?: number; y?: number; w?: number; h?: number };
          props?: Record<string, unknown>;
        }[],
      );
      if (hasDynamicPercentMarkers) {
        translatedDynamicWithPercent = resolvePercentMarkers(translatedDynamic, {
          parentSize: layoutViewport,
          parentMainAxis: "column",
        });
        const secondPass = coerceRootViewportHeight(translatedDynamicWithPercent, layoutViewport);
        vnode = secondPass.vnode;
        rootHeightCoerced = rootHeightCoerced || secondPass.coerced;
        result = renderer.render(vnode, { viewport: layoutViewport });
        assignHostLayouts(
          bridge.rootNode,
          result.nodes as readonly {
            rect?: { x?: number; y?: number; w?: number; h?: number };
            props?: Record<string, unknown>;
          }[],
        );
      }
      checkAllResizeObservers();

      // Compute maxRectBottom from layout result — needed to size the ANSI
      // grid correctly in non-alternate-buffer mode.
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

      // Keep non-alt output content-sized by using computed layout height.
      // When root coercion applies (overflow hidden/scroll), maxRectBottom
      // naturally expands to layoutViewport.rows and preserves footer anchoring.
      const gridViewport: ViewportSize = usingAlternateBuffer
        ? layoutViewport
        : { cols: layoutViewport.cols, rows: Math.max(1, maxRectBottom) };

      const frameHasAnsiSgr = translationMeta.hasAnsiSgr;
      const frameColorSupport = frameHasAnsiSgr ? FORCED_TRUECOLOR_SUPPORT : colorSupport;
      const { ansi: rawAnsiOutput, grid: cellGrid } = renderOpsToAnsi(
        result.ops as readonly RenderOp[],
        gridViewport,
        frameColorSupport,
      );

      // In alternate-buffer mode the output fills the full layoutViewport.
      // In non-alternate-buffer mode the grid is content-sized so the
      // output is only maxRectBottom lines — matching real Ink behaviour.
      const output = rawAnsiOutput;

      const staticOutput = pendingStaticOutput;
      pendingStaticOutput = "";
      const outputShape = summarizeGridShape(cellGrid);
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
        (traceAllFrames ||
          frameCount <= 40 ||
          force ||
          viewportChanged ||
          writeBlocked ||
          collapsed);

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
        const opViewportOverflows = snapshotOpsOutsideViewport(
          result.ops as readonly RenderOp[],
          gridViewport,
          24,
        );

        trace(
          `frame#${frameCount} force=${force} viewport=${viewport.cols}x${viewport.rows} layoutViewport=${layoutViewport.cols}x${layoutViewport.rows} gridViewport=${gridViewport.cols}x${gridViewport.rows} staticRowsUsed=${staticRowsUsed} staticRowsFull=${fullStaticRows} staticRowsPending=${pendingStaticRows} viewportChanged=${viewportChanged} renderTimeMs=${Date.now() - frameStartedAt} outputLen=${output.length} nonBlank=${outputShape.nonBlankLines}/${outputShape.lines} first=${outputShape.firstNonBlankLine} last=${outputShape.lastNonBlankLine} widest=${outputShape.widestLine} ops=${result.ops.length} nodes=${result.nodes.length} minY=${Number.isFinite(minRectY) ? minRectY : -1} maxBottom=${maxRectBottom} zeroH=${zeroHeightRects} hostNodes=${host.nodeCount} hostBoxes=${host.boxCount} hostScrollNodes=${host.scrollNodeCount} hostMaxScrollTop=${host.maxScrollTop} hostMaxScrollLeft=${host.maxScrollLeft} hostRootScrollTop=${host.rootScrollTop} hostRootOverflow=${host.rootOverflow || "none"} hostRootWidth=${host.rootWidthProp || "unset"} hostRootHeight=${host.rootHeightProp || "unset"} hostRootFlexGrow=${host.rootFlexGrowProp || "unset"} hostRootFlexShrink=${host.rootFlexShrinkProp || "unset"} rootChildren=${rootChildCount} msSinceResizeSignal=${Number.isFinite(msSinceResizeSignal) ? msSinceResizeSignal : -1} msSinceResizeFlush=${Number.isFinite(msSinceResizeFlush) ? msSinceResizeFlush : -1} transientEmptyAfterResize=${transientEmptyAfterResize} vnode=${vnodeKind} vnodeOverflow=${translatedOverflow || "none"} vnodeScrollY=${translatedScrollY} vnodeScrollX=${translatedScrollX} rootHeightCoerced=${rootHeightCoerced} writeBlocked=${writeBlocked} collapsed=${collapsed} opViewportOverflowCount=${opViewportOverflows.length}`,
        );
        trace(
          `frame#${frameCount} colorSupport baseLevel=${colorSupport.level} baseNoColor=${colorSupport.noColor} hasAnsiSgr=${frameHasAnsiSgr} effectiveLevel=${frameColorSupport.level} effectiveNoColor=${frameColorSupport.noColor}`,
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
            trace(
              `frame#${frameCount} hostTree=${safeJson(snapshotHostTree(bridge.rootNode, 5, 40))}`,
            );
          }
          trace(
            `frame#${frameCount} layoutNodes=${safeJson(snapshotLayoutNodes(result.nodes as readonly { kind?: unknown; id?: unknown; path?: readonly number[]; rect?: { x?: number; y?: number; w?: number; h?: number }; text?: unknown; props?: Record<string, unknown> }[], detailNodeLimit))}`,
          );
          trace(
            `frame#${frameCount} renderOps=${safeJson(snapshotOps(result.ops as readonly RenderOp[], detailOpLimit))}`,
          );
          trace(
            `frame#${frameCount} resizeTimeline=${formatResizeTimeline(resizeTimeline, traceStartAt, detailResizeLimit)}`,
          );
          if (opViewportOverflows.length > 0) {
            trace(`frame#${frameCount} opViewportOverflows=${safeJson(opViewportOverflows)}`);
          }

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
                if ((cell.char !== "" && cell.char !== " ") || styleVisibleOnSpace(cell.style)) {
                  nonBlankRows.push(r);
                  break;
                }
              }
            }
            trace(`frame#${frameCount} nonBlankGridRows=${safeJson(nonBlankRows)}`);

            // Snapshot all non-blank rows (capped at 40)
            const rowsToSnapshot = nonBlankRows.slice(0, 40);
            trace(
              `frame#${frameCount} cellGridSnapshot=${safeJson(snapshotCellGridRows(cellGrid, rowsToSnapshot, 120))}`,
            );

            // Translation trace entries (border translations, color parses, dimension skips, forced-flex compat)
            if (translationTraceEntries.length > 0) {
              // Group by kind for readability
              const borderTraces = translationTraceEntries.filter(
                (e) => e.kind === "border-translate",
              );
              const colorTraces = translationTraceEntries.filter((e) => e.kind === "color-parse");
              const dimSkipTraces = translationTraceEntries.filter(
                (e) => e.kind === "dimension-skip",
              );
              const forcedFlexTraces = translationTraceEntries.filter(
                (e) => e.kind === "forced-flex-compat",
              );
              const flexGrowSkipTraces = translationTraceEntries.filter(
                (e) => e.kind === "flex-grow-skip",
              );
              if (borderTraces.length > 0) {
                trace(
                  `frame#${frameCount} borderTranslations=${safeJson(borderTraces.slice(0, 30))}`,
                );
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
              if (forcedFlexTraces.length > 0) {
                trace(
                  `frame#${frameCount} forcedFlexCompat=${safeJson(forcedFlexTraces.slice(0, 40))}`,
                );
              }
              if (flexGrowSkipTraces.length > 0) {
                trace(
                  `frame#${frameCount} flexGrowSkips=${safeJson(flexGrowSkipTraces.slice(0, 40))}`,
                );
              }
            }

            // Per-row ANSI output lines (raw, for correlating grid → ANSI)
            const rawLines = output.split("\n");
            const ansiLineInfo: { row: number; len: number; snippet: string }[] = [];
            for (let r = 0; r < rawLines.length; r++) {
              const line = rawLines[r]!;
              if (line.length > 0) {
                ansiLineInfo.push({
                  row: r,
                  len: line.length,
                  snippet: formatLineSnippet(line, 120),
                });
              }
            }
            trace(`frame#${frameCount} ansiLineDetail=${safeJson(ansiLineInfo.slice(0, 40))}`);
          }
        }
      }

      const renderTime = performance.now() - frameStartedAt;
      options.onRender?.({
        renderTime,
        output,
        ...(staticOutput.length > 0 ? { staticOutput } : {}),
      });

      const cursorPosition = bridge.context.getCursorPosition();
      const cursorSignature = cursorPosition
        ? `${Math.trunc(cursorPosition.x)},${Math.trunc(cursorPosition.y)}`
        : "hidden";
      const cursorChanged = cursorSignature !== lastCursorSignature;

      if (
        !force &&
        output === lastOutput &&
        staticOutput.length === 0 &&
        !viewportChanged &&
        !cursorChanged
      ) {
        return;
      }

      if (transientEmptyAfterResize) {
        _s("[ink-compat] transient empty frame after resize; preserving previous output\n");
        trace(
          `frame#${frameCount} preserve-last-stable transient-empty outputLen=${output.length} nonBlank=${outputShape.nonBlankLines} rootChildren=${rootChildCount} msSinceResizeFlush=${Number.isFinite(msSinceResizeFlush) ? msSinceResizeFlush : -1} stableLen=${lastStableOutput.length}`,
        );
        return;
      }

      if (force && emptyOutputFrame && staticOutput.length === 0 && lastStableOutput.length > 0) {
        _s("[ink-compat] resize produced an empty frame; preserving previous output\n");
        trace(
          `frame#${frameCount} preserve-last-stable force=true outputLen=${output.length} nonBlank=${outputShape.nonBlankLines} stableLen=${lastStableOutput.length}`,
        );
        return;
      }

      writeOutput({ output, staticOutput });
      lastCursorSignature = cursorSignature;
    } catch (err) {
      _s(
        `[ink-compat] renderFrame error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
      );
      trace(
        `renderFrame error frame#${frameCount}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`,
      );
      if (force && lastStableOutput.length > 0) {
        writeOutput({ output: lastStableOutput, staticOutput: "" });
      }
    }
  };

  const flushScheduledRender = (): void => {
    throttledRenderTimer = undefined;
    if (!pendingRender) return;
    const force = pendingRenderForce;
    pendingRender = false;
    pendingRenderForce = false;
    lastRenderAt = Date.now();
    renderFrame(force);
    if (pendingRender) {
      scheduleRender(pendingRenderForce);
    }
  };

  const scheduleRender = (force = false): void => {
    pendingRender = true;
    if (force) pendingRenderForce = true;

    if (unthrottledRender) {
      const nextForce = pendingRenderForce;
      pendingRender = false;
      pendingRenderForce = false;
      lastRenderAt = Date.now();
      renderFrame(nextForce);
      return;
    }

    if (throttledRenderTimer !== undefined) return;
    const elapsed = Date.now() - lastRenderAt;
    const waitMs = Math.max(0, renderIntervalMs - elapsed);
    throttledRenderTimer = setTimeout(flushScheduledRender, waitMs);
    throttledRenderTimer.unref?.();
  };

  bridge.rootNode.onCommit = () => {
    capturePendingStaticOutput();
    scheduleRender(false);
  };

  let currentElement = element;

  const doRender = (el: React.ReactElement): void => {
    currentElement = el;
    const wrapped = React.createElement(InkContext.Provider, { value: bridge.context }, el);
    try {
      commitSync(container, wrapped);
    } catch (err) {
      _s(
        `[ink-compat] commitSync THREW: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
      );
    }
  };

  const stdinWithRaw = stdin as Readable & {
    setRawMode?: (enabled: boolean) => void;
    resume?: () => void;
    pause?: () => void;
    on?: (event: string, listener: (chunk: Buffer | string) => void) => void;
    off?: (event: string, listener: (chunk: Buffer | string) => void) => void;
    removeListener?: (event: string, listener: (chunk: Buffer | string) => void) => void;
  };

  const applyRawMode = (enabled: boolean): void => {
    if (typeof stdinWithRaw.setRawMode !== "function") return;
    if (rawModeActive === enabled) return;
    rawModeActive = enabled;
    stdinWithRaw.setRawMode(enabled);
    if (enabled) {
      stdinWithRaw.resume?.();
    } else {
      stdinWithRaw.pause?.();
    }
  };

  bridge.context.setRawMode = (enabled: boolean) => {
    rawModeRefCount += enabled ? 1 : -1;
    if (rawModeRefCount < 0) rawModeRefCount = 0;
    applyRawMode(rawModeRefCount > 0);
  };

  const onData = (data: Buffer | string): void => {
    bridge.simulateInput(typeof data === "string" ? data : data.toString("utf-8"));
  };
  stdinWithRaw.on?.("data", onData);
  stdinWithRaw.resume?.();

  bridge.context.rerender = () => {
    doRender(React.cloneElement(currentElement));
  };

  const scheduleResize = (source: string): void => {
    const latest = readViewportSize(stdout, fallbackStdout);
    const now = Date.now();
    lastResizeSignalAt = now;
    resizeTimeline.push({
      at: now,
      phase: "signal",
      source,
      viewport: latest,
    });
    if (resizeTimeline.length > 5000) {
      resizeTimeline.splice(0, resizeTimeline.length - 5000);
    }

    const changed = latest.cols !== viewport.cols || latest.rows !== viewport.rows;
    if (!changed) return;

    viewport = latest;
    const flushAt = Date.now();
    lastResizeFlushAt = flushAt;
    resizeTimeline.push({
      at: flushAt,
      phase: "flush",
      source,
      viewport: latest,
    });
    if (resizeTimeline.length > 5000) {
      resizeTimeline.splice(0, resizeTimeline.length - 5000);
    }
    if (traceResizeVerbose) {
      trace(
        `resize source=${source} viewport=${latest.cols}x${latest.rows} timeline=${formatResizeTimeline(resizeTimeline, traceStartAt, detailResizeLimit)}`,
      );
    }
    scheduleRender(true);
  };

  const onStdoutResize = (): void => {
    scheduleResize("stdout.resize");
  };
  const onFallbackResize = (): void => {
    scheduleResize("fallback.resize");
  };
  const onSigWinch = (): void => {
    scheduleResize("sigwinch");
  };

  stdoutWithEvents.on?.("resize", onStdoutResize);
  if (fallbackStdout !== stdout) {
    fallbackStdoutWithEvents.on?.("resize", onFallbackResize);
  }
  process.on("SIGWINCH", onSigWinch);

  const viewportPoll = setInterval(() => {
    const latest = readViewportSize(stdout, fallbackStdout);
    if (latest.cols !== viewport.cols || latest.rows !== viewport.rows) {
      scheduleResize("poll");
    }
  }, viewportPollMs);
  viewportPoll.unref?.();

  const restoreRawMode = (): void => {
    rawModeRefCount = 0;
    if (typeof stdinWithRaw.setRawMode === "function" && rawModeActive) {
      stdinWithRaw.setRawMode(false);
    }
    rawModeActive = false;
    stdinWithRaw.pause?.();
  };

  const leaveAlternateBuffer = (): void => {
    if (!usingAlternateBuffer) return;
    usingAlternateBuffer = false;
    writeCompat("\u001b[?1049l");
  };

  const disableKittyProtocol = (): void => {
    if (!kittyProtocolActive) return;
    kittyProtocolActive = false;
    writeCompat("\u001b[<u");
  };

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
    if (throttledRenderTimer !== undefined) {
      clearTimeout(throttledRenderTimer);
      throttledRenderTimer = undefined;
    }
    removeDrainListener();
    restoreStdoutWrite?.();
    restoreStdoutWrite = undefined;
  };

  const removeData = (): void => {
    stdinWithRaw.off?.("data", onData);
    stdinWithRaw.removeListener?.("data", onData);
  };

  const signalCleanup = (): void => {
    if (!signalCleanupAttached) return;
    signalCleanupAttached = false;
    process.off("SIGINT", signalHandler);
    process.off("SIGTERM", signalHandler);
    process.off("beforeExit", signalHandler);
  };

  const signalHandler = (): void => {
    cleanup(false);
  };

  if (!signalCleanupAttached) {
    signalCleanupAttached = true;
    process.on("SIGINT", signalHandler);
    process.on("SIGTERM", signalHandler);
    process.on("beforeExit", signalHandler);
  }

  if (patchConsoleEnabled && !debug) {
    restoreConsole = attachConsolePatchTarget({
      writeStdout: (line) => bridge.context.writeStdout(line),
      writeStderr: (line) => bridge.context.writeStderr(line),
    });
  }

  doRender(element);
  pendingRender = false;
  pendingRenderForce = false;
  renderFrame(true);
  lastRenderAt = Date.now();

  let cleanedUp = false;
  function cleanup(unmountTree: boolean): void {
    if (cleanedUp) return;
    cleanedUp = true;
    if (translationTraceEnabled) {
      enableTranslationTrace(false);
    }
    bridge.rootNode.onCommit = null;

    if (unmountTree) {
      commitSync(container, null);
    }

    removeData();
    removeResize();
    restoreRawMode();
    restoreConsole?.();
    restoreConsole = undefined;
    signalCleanup();
    bridge.dispose();
    showCursor();
    disableKittyProtocol();
    leaveAlternateBuffer();
  }

  void bridge.exitPromise.then(
    () => {
      cleanup(true);
    },
    () => {
      cleanup(true);
    },
  );

  return {
    rerender: (newElement: React.ReactElement) => {
      doRender(newElement);
    },
    unmount: () => {
      bridge.exit();
      cleanup(true);
    },
    waitUntilExit: () => bridge.exitPromise,
    clear: () => {
      bridge.clearOutput();
      lastOutput = "";
      lastStableOutput = "";
      lastOutputLines = [];
      lastOutputToRender = "";
      lastOutputRenderLineCount = 0;
      fullStaticOutput = "";
      pendingStaticOutput = "";
      queuedOutputs.length = 0;
    },
    cleanup: () => {
      cleanup(false);
    },
  };
}

interface SharedInstanceRecord {
  instance: Instance;
  concurrent: boolean;
}

const instancesByStdout = new Map<Writable, SharedInstanceRecord>();

function isWritableStream(value: unknown): value is Writable {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { write?: unknown }).write === "function"
  );
}

function normalizeRenderOptions(
  optionsOrStdout: RenderOptions | Writable | undefined,
): RenderOptions {
  if (optionsOrStdout == null) return {};
  if (isWritableStream(optionsOrStdout)) {
    return { stdout: optionsOrStdout };
  }
  return optionsOrStdout;
}

export function render(element: React.ReactElement, stdout?: Writable): Instance;
export function render(element: React.ReactElement, options?: RenderOptions): Instance;
export function render(
  element: React.ReactElement,
  optionsOrStdout: RenderOptions | Writable = {},
): Instance {
  const options = normalizeRenderOptions(optionsOrStdout);
  const stdout = options.stdout ?? process.stdout;
  const requestedConcurrent = options.concurrent ?? false;

  const existing = instancesByStdout.get(stdout);
  if (existing) {
    if (existing.concurrent !== requestedConcurrent) {
      console.warn(
        `Warning: render() was called with concurrent=${requestedConcurrent}, but the existing stdout instance uses concurrent=${existing.concurrent}.`,
      );
    }
    existing.instance.rerender(element);
    return existing.instance;
  }

  const base = createRenderSession(element, options);
  const wrapped: Instance = {
    rerender: (tree: React.ReactElement) => {
      base.rerender(tree);
    },
    unmount: () => {
      try {
        base.unmount();
      } finally {
        instancesByStdout.delete(stdout);
      }
    },
    waitUntilExit: () => base.waitUntilExit(),
    clear: () => {
      base.clear();
    },
    cleanup: () => {
      try {
        base.cleanup();
      } finally {
        instancesByStdout.delete(stdout);
      }
    },
  };

  void wrapped.waitUntilExit().then(
    () => {
      instancesByStdout.delete(stdout);
    },
    () => {
      instancesByStdout.delete(stdout);
    },
  );

  instancesByStdout.set(stdout, {
    instance: wrapped,
    concurrent: requestedConcurrent,
  });

  return wrapped;
}
