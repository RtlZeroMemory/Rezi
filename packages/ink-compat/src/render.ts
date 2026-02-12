import { EventEmitter } from "node:events";
import process from "node:process";
import { format } from "node:util";
import terminalSize from "terminal-size";
import {
  type BackendEventBatch,
  type RuntimeBackend,
  type VNode,
  measureTextCells,
  ZRDL_MAGIC,
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,
  ZR_CURSOR_SHAPE_BLOCK,
  ZR_EVENT_BATCH_VERSION_V1,
  ZREV_MAGIC,
  createApp,
  ui,
} from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
import React from "react";
import AccessibilityContext from "./context/AccessibilityContext.js";
import AppContext from "./context/AppContext.js";
import FocusProvider from "./context/FocusProvider.js";
import CursorContext from "./context/CursorContext.js";
import StdioContext, { type StdioContextValue } from "./context/StdioContext.js";
import { enableWarnOnce } from "./internal/warn.js";
import { resolveFlags, type KittyFlagName } from "./kittyKeyboard.js";
import { applyLayoutSnapshot } from "./measurement.js";
import {
  type HostRoot,
  type RootContainer,
  createRootContainerWithMode,
  updateRootContainer,
} from "./reconciler.js";
import { normalizeRenderOptions } from "./render/options.js";
import type { CursorPosition } from "./logUpdate.js";
import type { Instance, RenderOptions } from "./types.js";

export type { Instance, RenderOptions } from "./types.js";

type AppState = Readonly<{ vnode: VNode }>;

type InternalRenderOptions = RenderOptions &
  Readonly<{
    internal_backend?: RuntimeBackend;
  }>;

type NormalizedInternalRenderOptions = Readonly<
  InternalRenderOptions & {
    stdout: NodeJS.WriteStream;
    stdin: NodeJS.ReadStream;
    stderr: NodeJS.WriteStream;
    debug: boolean;
    exitOnCtrlC: boolean;
    patchConsole: boolean;
    maxFps: number;
    incrementalRendering: boolean;
    concurrent: boolean;
  }
>;

function hasRawMode(stdin: NodeJS.ReadStream): stdin is NodeJS.ReadStream & {
  isTTY: true;
  setRawMode: (value: boolean) => void;
  ref: () => void;
  unref: () => void;
} {
  return (
    (stdin as unknown as { isTTY?: unknown }).isTTY === true &&
    typeof (stdin as unknown as { setRawMode?: unknown }).setRawMode === "function"
  );
}

function isInCi(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  // Mirrors `is-in-ci` behavior closely enough for Ink parity.
  const v = env["CI"];
  if (v && v !== "false") return true;
  if (env["CONTINUOUS_INTEGRATION"]) return true;
  if (env["BUILD_NUMBER"]) return true;
  if (env["RUN_ID"]) return true;
  return false;
}

type ExitError = Error | number | null | undefined;

const instances = new WeakMap<NodeJS.WriteStream, InkCompatInstance>();

function align4(n: number): number {
  return (n + 3) & ~3;
}

const ZRDL_V2_HEADER_SIZE = 64;

const OP_CLEAR = 1;
const OP_FILL_RECT = 2;
const OP_DRAW_TEXT = 3;
const OP_PUSH_CLIP = 4;
const OP_POP_CLIP = 5;
const OP_DRAW_TEXT_RUN = 6;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const CLEAR_TERMINAL = "\u001B[2J\u001B[3J\u001B[H";

type ClipRect = Readonly<{ x: number; y: number; w: number; h: number }>;

class DebugFrameProjector {
  private cols = 0;
  private rows = 0;
  private cells: string[] = [];

  constructor(
    private readonly getViewport: () => Readonly<{ cols: number; rows: number }>,
  ) {}

  private resize(cols: number, rows: number): void {
    const next = new Array<string>(cols * rows).fill(" ");
    const copyRows = Math.min(this.rows, rows);
    const copyCols = Math.min(this.cols, cols);
    for (let y = 0; y < copyRows; y++) {
      const prevBase = y * this.cols;
      const nextBase = y * cols;
      for (let x = 0; x < copyCols; x++) {
        next[nextBase + x] = this.cells[prevBase + x] ?? " ";
      }
    }
    this.cols = cols;
    this.rows = rows;
    this.cells = next;
  }

  private ensureViewport(): void {
    const viewport = this.getViewport();
    const cols = Math.max(0, toPositiveIntOr(viewport.cols, 0));
    const rows = Math.max(0, toPositiveIntOr(viewport.rows, 0));
    if (cols === this.cols && rows === this.rows) return;
    this.resize(cols, rows);
  }

  private clear(): void {
    this.cells.fill(" ");
  }

  private isVisible(x: number, y: number, clipStack: readonly ClipRect[]): boolean {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return false;
    for (const clip of clipStack) {
      if (x < clip.x || x >= clip.x + clip.w || y < clip.y || y >= clip.y + clip.h) return false;
    }
    return true;
  }

  private writeCell(x: number, y: number, ch: string, clipStack: readonly ClipRect[]): void {
    if (!this.isVisible(x, y, clipStack)) return;
    this.cells[y * this.cols + x] = ch;
  }

  private fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    clipStack: readonly ClipRect[],
  ): void {
    if (w <= 0 || h <= 0) return;
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.writeCell(xx, yy, " ", clipStack);
      }
    }
  }

  private drawText(x: number, y: number, text: string, clipStack: readonly ClipRect[]): void {
    if (text.length === 0) return;
    let cursorX = x;
    for (const ch of text) {
      this.writeCell(cursorX, y, ch, clipStack);
      cursorX += 1;
    }
  }

  private toMultilineText(): string {
    if (this.cols <= 0 || this.rows <= 0) return "";
    const lines: string[] = [];
    for (let y = 0; y < this.rows; y++) {
      const base = y * this.cols;
      const line = this.cells.slice(base, base + this.cols).join("").replace(/\s+$/u, "");
      lines.push(line);
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  apply(drawlist: Uint8Array): string {
    this.ensureViewport();
    if (this.cols <= 0 || this.rows <= 0 || drawlist.byteLength < ZRDL_V2_HEADER_SIZE) {
      return this.toMultilineText();
    }

    const dv = new DataView(drawlist.buffer, drawlist.byteOffset, drawlist.byteLength);
    if (dv.getUint32(0, true) !== ZRDL_MAGIC) return this.toMultilineText();
    const version = dv.getUint32(4, true);
    if (version !== ZR_DRAWLIST_VERSION_V1 && version !== ZR_DRAWLIST_VERSION_V2) {
      return this.toMultilineText();
    }
    if (dv.getUint32(8, true) !== ZRDL_V2_HEADER_SIZE) return this.toMultilineText();
    if (dv.getUint32(12, true) !== drawlist.byteLength) return this.toMultilineText();

    const cmdOffset = dv.getUint32(16, true);
    const cmdBytes = dv.getUint32(20, true);
    const cmdEnd = cmdOffset + cmdBytes;

    const stringsSpanOffset = dv.getUint32(28, true);
    const stringsCount = dv.getUint32(32, true);
    const stringsBytesOffset = dv.getUint32(36, true);
    const stringsBytesLen = dv.getUint32(40, true);

    const blobsSpanOffset = dv.getUint32(44, true);
    const blobsCount = dv.getUint32(48, true);
    const blobsBytesOffset = dv.getUint32(52, true);
    const blobsBytesLen = dv.getUint32(56, true);

    if (cmdOffset > drawlist.byteLength || cmdEnd > drawlist.byteLength) return this.toMultilineText();
    if (stringsCount > 0) {
      const spansEnd = stringsSpanOffset + stringsCount * 8;
      const bytesEnd = stringsBytesOffset + stringsBytesLen;
      if (spansEnd > drawlist.byteLength || bytesEnd > drawlist.byteLength) return this.toMultilineText();
    }
    if (blobsCount > 0) {
      const spansEnd = blobsSpanOffset + blobsCount * 8;
      const bytesEnd = blobsBytesOffset + blobsBytesLen;
      if (spansEnd > drawlist.byteLength || bytesEnd > drawlist.byteLength) return this.toMultilineText();
    }

    const strings: string[] = new Array(stringsCount).fill("");
    for (let i = 0; i < stringsCount; i++) {
      const spanOff = stringsSpanOffset + i * 8;
      const relOff = dv.getUint32(spanOff, true);
      const len = dv.getUint32(spanOff + 4, true);
      if (relOff + len > stringsBytesLen) continue;
      const absOff = stringsBytesOffset + relOff;
      strings[i] = UTF8_DECODER.decode(drawlist.subarray(absOff, absOff + len));
    }

    const decodeTextRun = (blobIndex: number): string => {
      if (blobIndex < 0 || blobIndex >= blobsCount) return "";
      const spanOff = blobsSpanOffset + blobIndex * 8;
      const relOff = dv.getUint32(spanOff, true);
      const len = dv.getUint32(spanOff + 4, true);
      if (relOff + len > blobsBytesLen || len < 4) return "";

      const absOff = blobsBytesOffset + relOff;
      const blob = drawlist.subarray(absOff, absOff + len);
      const blobDv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
      const count = blobDv.getUint32(0, true);
      let off = 4;
      let out = "";
      for (let i = 0; i < count; i++) {
        if (off + 28 > blob.byteLength) break;
        const stringIndex = blobDv.getUint32(off + 16, true);
        out += strings[stringIndex] ?? "";
        off += 28;
      }
      return out;
    };

    const clipStack: ClipRect[] = [];
    for (let off = cmdOffset; off + 8 <= cmdEnd; ) {
      const opcode = dv.getUint16(off + 0, true);
      const size = dv.getUint32(off + 4, true);
      if (size < 8 || off + size > cmdEnd) break;

      switch (opcode) {
        case OP_CLEAR: {
          this.clear();
          break;
        }
        case OP_FILL_RECT: {
          if (size >= 24) {
            const x = dv.getInt32(off + 8, true);
            const y = dv.getInt32(off + 12, true);
            const w = dv.getInt32(off + 16, true);
            const h = dv.getInt32(off + 20, true);
            this.fillRect(x, y, w, h, clipStack);
          }
          break;
        }
        case OP_DRAW_TEXT: {
          if (size >= 20) {
            const x = dv.getInt32(off + 8, true);
            const y = dv.getInt32(off + 12, true);
            const stringIndex = dv.getUint32(off + 16, true);
            this.drawText(x, y, strings[stringIndex] ?? "", clipStack);
          }
          break;
        }
        case OP_DRAW_TEXT_RUN: {
          if (size >= 20) {
            const x = dv.getInt32(off + 8, true);
            const y = dv.getInt32(off + 12, true);
            const blobIndex = dv.getUint32(off + 16, true);
            this.drawText(x, y, decodeTextRun(blobIndex), clipStack);
          }
          break;
        }
        case OP_PUSH_CLIP: {
          if (size >= 24) {
            const x = dv.getInt32(off + 8, true);
            const y = dv.getInt32(off + 12, true);
            const w = dv.getInt32(off + 16, true);
            const h = dv.getInt32(off + 20, true);
            clipStack.push({
              x,
              y,
              w: w < 0 ? 0 : w,
              h: h < 0 ? 0 : h,
            });
          }
          break;
        }
        case OP_POP_CLIP: {
          if (clipStack.length > 0) clipStack.pop();
          break;
        }
        default: {
          // Ignore unknown opcodes for debug projection.
          break;
        }
      }

      off += align4(size);
    }

    return this.toMultilineText();
  }
}

function createDebugAppendOnlyFrameWriter(
  stdout: NodeJS.WriteStream,
): (drawlist: Uint8Array) => void {
  const projector = new DebugFrameProjector(() => ({
    cols: getStdoutCols(stdout),
    rows: getStdoutRows(stdout),
  }));

  return (drawlist: Uint8Array): void => {
    const rendered = projector.apply(drawlist);
    try {
      stdout.write(rendered.length > 0 ? `${rendered}\n` : "\n");
    } catch {
      // ignore
    }
  };
}

function encodeResizeBatchV1(cols: number, rows: number): Uint8Array {
  const totalSize = align4(24 + 32);
  const bytes = new Uint8Array(totalSize);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, 1, true); // event_count
  dv.setUint32(16, 0, true); // batch_flags
  dv.setUint32(20, 0, true); // reserved0

  let off = 24;
  dv.setUint32(off + 0, 5, true); // ZREV_RECORD_RESIZE
  dv.setUint32(off + 4, 32, true); // record_size
  dv.setUint32(off + 8, 0, true); // time_ms
  dv.setUint32(off + 12, 0, true); // flags
  dv.setUint32(off + 16, cols, true);
  dv.setUint32(off + 20, rows, true);
  dv.setUint32(off + 24, 0, true);
  dv.setUint32(off + 28, 0, true);

  return bytes;
}

function toPositiveIntOr(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v <= 0) return fallback;
  return v;
}

function getStdoutCols(stdout: NodeJS.WriteStream): number {
  const columns = toPositiveIntOr((stdout as unknown as { columns?: unknown }).columns, 0);
  if (columns > 0) return columns;
  try {
    const size = terminalSize();
    return toPositiveIntOr(size?.columns, 80);
  } catch {
    return 80;
  }
}

function getStdoutRows(stdout: NodeJS.WriteStream): number {
  const rows = toPositiveIntOr((stdout as unknown as { rows?: unknown }).rows, 0);
  if (rows > 0) return rows;
  try {
    const size = terminalSize();
    return toPositiveIntOr(size?.rows, 24);
  } catch {
    return 24;
  }
}

type TextBlock = Readonly<{
  lines: string[];
  width: number;
}>;

function trimTrailingEmptyLines(lines: string[]): string[] {
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function trimLineEnd(line: string): string {
  return line.replace(/\s+$/u, "");
}

function blockFromText(text: string): TextBlock {
  const lines = text.split("\n").map(trimLineEnd);
  const trimmed = trimTrailingEmptyLines(lines);
  const width = trimmed.reduce((max, line) => Math.max(max, measureTextCells(line)), 0);
  return { lines: trimmed, width };
}

function blockToText(block: TextBlock): string {
  return trimTrailingEmptyLines(block.lines.map(trimLineEnd)).join("\n");
}

function padToWidth(line: string, width: number): string {
  const delta = width - measureTextCells(line);
  if (delta <= 0) return line;
  return line + " ".repeat(delta);
}

function mergeRowBlocks(blocks: readonly TextBlock[]): TextBlock {
  if (blocks.length === 0) return { lines: [], width: 0 };
  const height = blocks.reduce((max, block) => Math.max(max, block.lines.length), 0);
  const out = Array.from({ length: height }, () => "");

  for (const block of blocks) {
    for (let row = 0; row < height; row++) {
      const line = block.lines[row] ?? "";
      out[row] = (out[row] ?? "") + padToWidth(line, block.width);
    }
  }

  const trimmed = out.map(trimLineEnd);
  const width = trimmed.reduce((max, line) => Math.max(max, measureTextCells(line)), 0);
  return { lines: trimTrailingEmptyLines(trimmed), width };
}

function mergeColumnBlocks(blocks: readonly TextBlock[]): TextBlock {
  if (blocks.length === 0) return { lines: [], width: 0 };
  const lines: string[] = [];
  let width = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      lines.push(line);
      width = Math.max(width, measureTextCells(line));
    }
  }
  return { lines: trimTrailingEmptyLines(lines.map(trimLineEnd)), width };
}

function hasVNodeChildren(vnode: VNode): vnode is VNode & Readonly<{ children: readonly VNode[] }> {
  return "children" in vnode && Array.isArray((vnode as { children?: unknown }).children);
}

function vnodeToTextBlock(vnode: VNode): TextBlock {
  if (vnode.kind === "text") {
    return blockFromText(vnode.text);
  }

  if (vnode.kind === "richText") {
    return blockFromText(vnode.props.spans.map((span) => span.text).join(""));
  }

  if (!hasVNodeChildren(vnode)) {
    return { lines: [], width: 0 };
  }

  const blocks = vnode.children.map(vnodeToTextBlock);
  if (vnode.kind === "row") {
    return mergeRowBlocks(blocks);
  }

  return mergeColumnBlocks(blocks);
}

function vnodeToPlainText(vnode: VNode): string {
  return blockToText(vnodeToTextBlock(vnode));
}

function withTrailingNewline(text: string): string {
  if (text.length === 0) return "";
  return text.endsWith("\n") ? text : `${text}\n`;
}

function stripStaticPrefix(vnode: VNode, staticCount: number): VNode {
  if (staticCount <= 0) return vnode;

  if (vnode.kind !== "column") {
    return ui.text("");
  }

  const interactiveChildren = vnode.children.slice(staticCount);
  if (interactiveChildren.length === 0) return ui.text("");
  if (interactiveChildren.length === 1) return interactiveChildren[0] ?? ui.text("");
  return ui.column({}, interactiveChildren);
}

type BufferedWaiter = Readonly<{
  resolve: (b: BackendEventBatch) => void;
  reject: (err: Error) => void;
}>;

type PatchFrame = (drawlist: Uint8Array) => Uint8Array;

class BufferedBackend implements RuntimeBackend {
  private readonly inner: RuntimeBackend;
  private readonly patchFrame: PatchFrame | null;
  private readonly deferFrameWrites: boolean;
  private readonly appendOnlyFrameWriter: ((drawlist: Uint8Array) => void | Promise<void>) | null;
  private latestDeferredFrame: Uint8Array | null = null;
  private queue: BackendEventBatch[] = [];
  private waiters: BufferedWaiter[] = [];
  private pollError: Error | null = null;
  private pumping = false;

  constructor(
    inner: RuntimeBackend,
    opts?: Readonly<{
      patchFrame?: PatchFrame;
      deferFrameWrites?: boolean;
      appendOnlyFrameWriter?: ((drawlist: Uint8Array) => void | Promise<void>) | null;
    }>,
  ) {
    this.inner = inner;
    this.patchFrame = opts?.patchFrame ?? null;
    this.deferFrameWrites = opts?.deferFrameWrites === true;
    this.appendOnlyFrameWriter = opts?.appendOnlyFrameWriter ?? null;
  }

  enqueue(batch: BackendEventBatch): void {
    if (this.pollError) {
      try {
        batch.release();
      } catch {
        // ignore
      }
      return;
    }

    const w = this.waiters.shift();
    if (w) {
      w.resolve(batch);
      return;
    }

    this.queue.push(batch);
  }

  fail(err: Error): void {
    if (this.pollError) return;
    this.pollError = err;

    for (const w of this.waiters) {
      w.reject(err);
    }
    this.waiters = [];

    for (const b of this.queue) {
      try {
        b.release();
      } catch {
        // ignore
      }
    }
    this.queue = [];
  }

  async start(): Promise<void> {
    await this.inner.start();

    if (this.pumping) return;
    this.pumping = true;
    void (async () => {
      while (this.pumping) {
        try {
          const batch = await this.inner.pollEvents();
          this.enqueue(batch);
        } catch (e: unknown) {
          if (!this.pumping) return;
          this.fail(e instanceof Error ? e : new Error(String(e)));
          return;
        }
      }
    })();
  }

  async stop(): Promise<void> {
    this.pumping = false;
    await this.inner.stop();
  }

  dispose(): void {
    this.pumping = false;
    this.inner.dispose();
  }

  async requestFrame(drawlist: Uint8Array): Promise<void> {
    const patched = this.patchFrame ? this.patchFrame(drawlist) : drawlist;
    if (this.appendOnlyFrameWriter) {
      await this.appendOnlyFrameWriter(patched);
      return;
    }
    if (this.deferFrameWrites) {
      // Buffers latest frame for CI-like "final frame only" semantics.
      this.latestDeferredFrame = patched.slice();
      return;
    }
    return this.inner.requestFrame(patched);
  }

  async flushDeferredFrame(): Promise<void> {
    if (!this.deferFrameWrites) return;
    const frame = this.latestDeferredFrame;
    this.latestDeferredFrame = null;
    if (!frame) return;
    await this.inner.requestFrame(frame);
  }

  pollEvents(): Promise<BackendEventBatch> {
    const b = this.queue.shift();
    if (b) return Promise.resolve(b);
    if (this.pollError) return Promise.reject(this.pollError);

    return new Promise<BackendEventBatch>((resolve, reject) => {
      this.waiters.push({
        resolve,
        reject: (err) => reject(err),
      });
    });
  }

  postUserEvent(tag: number, payload: Uint8Array): void {
    this.inner.postUserEvent(tag, payload);
  }

  async getCaps() {
    return this.inner.getCaps();
  }
}

const SET_CURSOR_CMD_SIZE = 20;
const OP_SET_CURSOR = 7;

function appendSetCursorV2(drawlist: Uint8Array, position: CursorPosition): Uint8Array {
  const dv = new DataView(drawlist.buffer, drawlist.byteOffset, drawlist.byteLength);
  if (dv.byteLength < 64) return drawlist;
  if (dv.getUint32(0, true) !== ZRDL_MAGIC) return drawlist;
  if (dv.getUint32(4, true) !== ZR_DRAWLIST_VERSION_V2) return drawlist;

  const headerSize = dv.getUint32(8, true);
  const totalSize = dv.getUint32(12, true);
  const cmdOffset = dv.getUint32(16, true);
  const cmdBytes = dv.getUint32(20, true);
  const cmdCount = dv.getUint32(24, true);

  const stringsSpanOffset = dv.getUint32(28, true);
  const stringsCount = dv.getUint32(32, true);
  const stringsBytesOffset = dv.getUint32(36, true);
  const stringsBytesLen = dv.getUint32(40, true);
  const blobsSpanOffset = dv.getUint32(44, true);
  const blobsCount = dv.getUint32(48, true);
  const blobsBytesOffset = dv.getUint32(52, true);
  const blobsBytesLen = dv.getUint32(56, true);

  if (headerSize !== 64) return drawlist;
  if (totalSize !== dv.byteLength) return drawlist;
  if (cmdOffset === 0) return drawlist;

  const cmdEnd = cmdOffset + cmdBytes;
  if (cmdEnd > totalSize) return drawlist;

  const out = new Uint8Array(totalSize + SET_CURSOR_CMD_SIZE);
  out.set(drawlist.subarray(0, cmdEnd), 0);

  const outDv = new DataView(out.buffer, out.byteOffset, out.byteLength);

  // Insert SET_CURSOR at the end of the command stream so it overrides any prior hideCursor.
  const off = cmdEnd;
  outDv.setUint16(off + 0, OP_SET_CURSOR, true);
  outDv.setUint16(off + 2, 0, true);
  outDv.setUint32(off + 4, SET_CURSOR_CMD_SIZE, true);
  outDv.setInt32(off + 8, position.x | 0, true);
  outDv.setInt32(off + 12, position.y | 0, true);
  outDv.setUint8(off + 16, ZR_CURSOR_SHAPE_BLOCK);
  outDv.setUint8(off + 17, 1); // visible
  outDv.setUint8(off + 18, 1); // blink (Ink doesn't expose this; true is fine)
  outDv.setUint8(off + 19, 0);

  // Shift remainder (string/blobs sections) by SET_CURSOR_CMD_SIZE.
  out.set(drawlist.subarray(cmdEnd), cmdEnd + SET_CURSOR_CMD_SIZE);

  const shift = (n: number): number => (n === 0 ? 0 : n + SET_CURSOR_CMD_SIZE);

  // Header (64 bytes)
  outDv.setUint32(0, ZRDL_MAGIC, true);
  outDv.setUint32(4, ZR_DRAWLIST_VERSION_V2, true);
  outDv.setUint32(8, headerSize, true);
  outDv.setUint32(12, out.byteLength, true);
  outDv.setUint32(16, cmdOffset, true);
  outDv.setUint32(20, cmdBytes + SET_CURSOR_CMD_SIZE, true);
  outDv.setUint32(24, cmdCount + 1, true);
  outDv.setUint32(28, shift(stringsSpanOffset), true);
  outDv.setUint32(32, stringsCount, true);
  outDv.setUint32(36, shift(stringsBytesOffset), true);
  outDv.setUint32(40, stringsBytesLen, true);
  outDv.setUint32(44, shift(blobsSpanOffset), true);
  outDv.setUint32(48, blobsCount, true);
  outDv.setUint32(52, shift(blobsBytesOffset), true);
  outDv.setUint32(56, blobsBytesLen, true);
  outDv.setUint32(60, 0, true);

  return out;
}

function getInstance(
  stdout: NodeJS.WriteStream,
  createInstance: () => InkCompatInstance,
  concurrent: boolean,
): InkCompatInstance {
  let instance = instances.get(stdout);

  if (!instance) {
    instance = createInstance();
    instances.set(stdout, instance);
  } else if (instance.isConcurrent !== concurrent) {
    console.warn(
      `Warning: render() was called with concurrent: ${concurrent}, but the existing instance for this stdout uses concurrent: ${instance.isConcurrent}. ` +
        `The concurrent option only takes effect on the first render. Call unmount() first if you need to change the rendering mode.`,
    );
  }

  return instance;
}

class InkCompatInstance {
  /**
   * Whether this instance is using concurrent rendering mode.
   */
  readonly isConcurrent: boolean;

  private readonly options: NormalizedInternalRenderOptions;

  private readonly app: ReturnType<typeof createApp<AppState>>;
  private readonly container: RootContainer;
  private readonly root: HostRoot;

  private readonly supportsRawMode: boolean;
  private rawModeEnabledCount = 0;
  private readableListener: (() => void) | undefined;
  private restoreConsole: (() => void) | null = null;
  private unsubEvents: (() => void) | null = null;

  private cursorPosition: CursorPosition | undefined = undefined;
  private cursorDirty = false;

  private kittyProtocolEnabled = false;
  private cancelKittyDetection: (() => void) | undefined;

  private isUnmounted = false;
  private exitPromise?: Promise<void>;
  private resolveExitPromise: () => void = () => {};
  private rejectExitPromise: (reason?: Error) => void = () => {};
  private beforeExitHandler: (() => void) | undefined;

  private latestTree: React.ReactNode | null = null;

  private readonly internalEventEmitter: EventEmitter;
  private readonly backend: BufferedBackend;
  private readonly frameProjector: DebugFrameProjector;
  private readonly runningInCi: boolean;
  private readonly debugMode: boolean;
  private lastProjectedOutput = "";
  private lastProjectedOutputHeight = 0;
  private lastStdoutCols = 80;
  private emittedStaticChunks: string[] = [];

  constructor(options: NormalizedInternalRenderOptions) {
    this.options = options;
    this.isConcurrent = options.concurrent ?? false;
    this.runningInCi = isInCi();
    this.debugMode = options.debug === true;

    if (this.debugMode) enableWarnOnce();

    const stdin = options.stdin;
    const stdout = options.stdout;
    const stderr = options.stderr;
    this.lastStdoutCols = getStdoutCols(stdout);
    this.frameProjector = new DebugFrameProjector(() => ({
      cols: getStdoutCols(stdout),
      rows: getStdoutRows(stdout),
    }));
    const isScreenReaderEnabled =
      options.isScreenReaderEnabled ??
      // biome-ignore lint/complexity/useLiteralKeys: process.env is typed with an index signature under our TS config.
      process.env["INK_SCREEN_READER"] === "true";

    const unthrottled = options.debug === true || isScreenReaderEnabled;
    const maxFps = unthrottled ? 1000 : (options.maxFps ?? 30);

    this.internalEventEmitter = new EventEmitter();
    this.internalEventEmitter.setMaxListeners(Infinity);

    let rootRef: HostRoot | null = null;

    const rawBackend =
      options.internal_backend ?? createNodeBackend({ fpsCap: maxFps, useDrawlistV2: true });
    const backend = new BufferedBackend(rawBackend, {
      patchFrame: (drawlist) => {
        let patched = drawlist;
        if (this.cursorDirty) {
          this.cursorDirty = false;
          const position = this.cursorPosition;
          patched = position ? appendSetCursorV2(drawlist, position) : drawlist;
        }
        this.captureProjectedFrame(patched);
        return patched;
      },
      deferFrameWrites: this.runningInCi && !this.debugMode,
      appendOnlyFrameWriter: this.debugMode ? createDebugAppendOnlyFrameWriter(stdout) : null,
    });
    this.backend = backend;

    const handleStdoutResize = (): void => {
      const cols = getStdoutCols(stdout);
      const rows = getStdoutRows(stdout);
      if ((stdout as { isTTY?: unknown }).isTTY === true && cols < this.lastStdoutCols) {
        this.writeRawToStdout(CLEAR_TERMINAL);
      }
      this.lastStdoutCols = cols;
      if (rootRef) {
        rootRef.internal_terminalWidth = cols;
      }
      backend.enqueue({
        bytes: encodeResizeBatchV1(cols, rows),
        droppedBatches: 0,
        release: () => {},
      });
    };

    const app = createApp<AppState>({
      backend,
      initialState: { vnode: ui.text("") },
      config: {
        fpsCap: maxFps,
        incrementalRendering: options.incrementalRendering === true,
        internal_onRender: (metrics) => {
          options.onRender?.(metrics);
        },
        internal_onLayout: (snapshot) => {
          if (!rootRef) return;
          applyLayoutSnapshot(rootRef, snapshot.idRects);
        },
      },
    });

    app.view((s) => s.vnode);

    this.app = app;

    // Ink patches console when patchConsole=true and not in debug mode.
    if (options.patchConsole !== false && options.debug !== true) {
      this.restoreConsole = this.patchConsole();
    }

    // Mirror Ink: subscribe to stdout 'resize' events (best-effort) and convert them
    // into backend resize batches so Rezi's layout/render pipeline reruns.
    const stdoutEmitter = stdout as unknown as {
      on?: (event: string, listener: () => void) => unknown;
      off?: (event: string, listener: () => void) => unknown;
    };
    if (!this.runningInCi && typeof stdoutEmitter.on === "function" && typeof stdoutEmitter.off === "function") {
      stdoutEmitter.on("resize", handleStdoutResize);
      this.unsubEvents = () => {
        stdoutEmitter.off?.("resize", handleStdoutResize);
      };
    }

    this.supportsRawMode = hasRawMode(stdin);

    const exitOnCtrlC = options.exitOnCtrlC !== false;

    const handleInput = (input: string): void => {
      // Exit on Ctrl+C (only when raw mode is enabled and we are reading stdin).
      // eslint-disable-next-line unicorn/no-hex-escape
      if (input === "\x03" && exitOnCtrlC) {
        this.unmount();
        return;
      }
    };

    const handleReadable = (): void => {
      // eslint-disable-next-line @typescript-eslint/ban-types
      let chunk;
      // eslint-disable-next-line @typescript-eslint/ban-types
      while ((chunk = stdin.read() as string | null) !== null) {
        handleInput(chunk);
        this.internalEventEmitter.emit("input", chunk);
      }
    };

    const stdioValue: StdioContextValue = Object.freeze({
      stdin,
      stdout,
      stderr,
      internal_writeToStdout: (data: string) => this.writeToStdout(data),
      internal_writeToStderr: (data: string) => this.writeToStderr(data),
      setRawMode: (enabled: boolean) => {
        if (!this.supportsRawMode) {
          if (stdin === process.stdin) {
            throw new Error(
              "Raw mode is not supported on the current process.stdin, which Ink uses as input stream by default.\n" +
                "Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
            );
          }
          throw new Error(
            "Raw mode is not supported on the stdin provided to Ink.\n" +
              "Read about how to prevent this error on https://github.com/vadimdemedes/ink/#israwmodesupported",
          );
        }

        stdin.setEncoding("utf8");

        if (enabled) {
          if (this.rawModeEnabledCount === 0) {
            try {
              stdin.ref();
            } catch {
              // ignore
            }
            stdin.setRawMode(true);
            this.readableListener = handleReadable;
            stdin.addListener("readable", handleReadable);
          }
          this.rawModeEnabledCount++;
          return;
        }

        if (this.rawModeEnabledCount <= 0) return;
        this.rawModeEnabledCount--;
        if (this.rawModeEnabledCount === 0) {
          try {
            stdin.setRawMode(false);
          } catch {
            // ignore
          }
          if (this.readableListener) {
            stdin.removeListener("readable", this.readableListener);
            this.readableListener = undefined;
          }
          try {
            stdin.unref();
          } catch {
            // ignore
          }
        }
      },
      isRawModeSupported: this.supportsRawMode,
      internal_exitOnCtrlC: options.exitOnCtrlC !== false,
      internal_eventEmitter: this.internalEventEmitter,
    });

    const wrap = (node: React.ReactNode) =>
      React.createElement(
        AppContext.Provider,
        { value: { exit: (err?: Error) => this.unmount(err) } },
        React.createElement(
          AccessibilityContext.Provider,
          { value: isScreenReaderEnabled },
          React.createElement(
            StdioContext.Provider,
            { value: stdioValue },
            React.createElement(
              CursorContext.Provider,
              { value: { setCursorPosition: this.setCursorPosition } },
              React.createElement(FocusProvider, null, node),
            ),
          ),
        ),
      );

    this.root = {
      kind: "root",
      children: [],
      staticVNodes: [],
      internal_isScreenReaderEnabled: isScreenReaderEnabled,
      internal_terminalWidth: getStdoutCols(stdout),
      onCommit: (vnode) => {
        if (this.isUnmounted) return;
        this.emitStaticOutputIfNeeded();
        const committed = vnode ?? ui.text("");
        const interactive =
          rootRef?.internal_isScreenReaderEnabled === true
            ? committed
            : stripStaticPrefix(committed, rootRef?.staticVNodes.length ?? 0);
        app.update((prev) => ({ ...prev, vnode: interactive }));
      },
    };
    rootRef = this.root;

    this.container = createRootContainerWithMode(this.root, { concurrent: this.isConcurrent });

    // Render wrapper is stable, but node changes each call.
    this.wrap = wrap;

    this.initKittyKeyboard();

    void app.start().catch((e: unknown) => {
      this.unmount(e instanceof Error ? e : new Error(String(e)));
    });
  }

  // Wrapped render tree builder (assigned in constructor).
  private wrap!: (node: React.ReactNode) => React.ReactElement;

  private writeRawToStdout(data: string): void {
    try {
      this.options.stdout.write(data);
    } catch {
      // ignore
    }
  }

  private captureProjectedFrame(drawlist: Uint8Array): void {
    const output = this.frameProjector.apply(drawlist);
    this.lastProjectedOutput = output;
    this.lastProjectedOutputHeight = output.length === 0 ? 0 : output.split("\n").length;
  }

  private emitStaticOutputIfNeeded(): void {
    const currentChunks = this.root.staticVNodes
      .map((chunk) => vnodeToPlainText(chunk))
      .filter((text) => text.length > 0);

    let prefix = 0;
    const maxPrefix = Math.min(this.emittedStaticChunks.length, currentChunks.length);
    while (
      prefix < maxPrefix &&
      this.emittedStaticChunks[prefix] === currentChunks[prefix]
    ) {
      prefix++;
    }

    // New static output is only append-only. Divergent snapshots are adopted
    // without replay to avoid duplicates (e.g. keyed remounts).
    if (prefix !== this.emittedStaticChunks.length) {
      this.emittedStaticChunks = currentChunks;
      return;
    }

    if (currentChunks.length <= this.emittedStaticChunks.length) {
      this.emittedStaticChunks = currentChunks;
      return;
    }

    const payload = currentChunks
      .slice(this.emittedStaticChunks.length)
      .map(withTrailingNewline)
      .join("");

    this.emittedStaticChunks = currentChunks;
    if (payload.length === 0) return;

    const rows = getStdoutRows(this.options.stdout);
    const isFullscreenPreviousFrame =
      (this.options.stdout as { isTTY?: unknown }).isTTY === true &&
      this.lastProjectedOutputHeight >= rows;

    if (isFullscreenPreviousFrame && !this.debugMode) {
      this.writeRawToStdout(CLEAR_TERMINAL);
    }

    this.writeRawToStdout(payload);
  }

  private maybeWriteCiTrailingNewline(): void {
    if (!this.runningInCi) return;
    if (this.lastProjectedOutput.length === 0) return;

    const rows = getStdoutRows(this.options.stdout);
    const isFullscreen =
      (this.options.stdout as { isTTY?: unknown }).isTTY === true &&
      this.lastProjectedOutputHeight >= rows;

    if (!isFullscreen) {
      this.writeRawToStdout("\n");
    }
  }

  render = (node: React.ReactNode): void => {
    if (this.isUnmounted) return;
    this.latestTree = node;
    updateRootContainer(this.container, this.wrap(node), null, { sync: !this.isConcurrent });
  };

  clear = (): void => {
    this.app.update((prev) => ({ ...prev, vnode: ui.text("") }));
  };

  setCursorPosition = (position: CursorPosition | undefined): void => {
    const prev = this.cursorPosition;
    const changed =
      (prev === undefined) !== (position === undefined) ||
      (prev?.x ?? 0) !== (position?.x ?? 0) ||
      (prev?.y ?? 0) !== (position?.y ?? 0);

    this.cursorPosition = position;
    this.cursorDirty = true;

    if (changed && !this.isUnmounted) {
      try {
        this.app.update((state) => ({ ...state }));
      } catch {
        // ignore
      }
    }
  };

  writeToStdout = (data: string): void => {
    if (this.isUnmounted) return;
    try {
      this.options.stdout.write(data);
    } catch {
      // ignore
    }

    if (this.debugMode || this.runningInCi) return;

    // Best-effort: schedule a new frame so the UI is restored after external writes.
    // Ink clears and re-renders the last output; Rezi's runtime needs a dirty turn
    // even if the React tree didn't change.
    try {
      this.app.update((prev) => ({ ...prev }));
    } catch {
      // ignore
    }
  };

  writeToStderr = (data: string): void => {
    if (this.isUnmounted) return;
    try {
      this.options.stderr.write(data);
    } catch {
      // ignore
    }

    if (this.debugMode || this.runningInCi) return;

    try {
      this.app.update((prev) => ({ ...prev }));
    } catch {
      // ignore
    }
  };

  patchConsole = (): (() => void) => {
    const methods = ["log", "info", "warn", "error", "debug"] as const;
    const original: Partial<Record<(typeof methods)[number], (...args: unknown[]) => void>> = {};

    for (const name of methods) {
      const fn = console[name];
      if (typeof fn !== "function") continue;
      // eslint-disable-next-line no-console
      original[name] = fn;
      // eslint-disable-next-line no-console
      console[name] = (...args: unknown[]) => {
        const text = format(...args) + "\n";
        const toStderr = name === "warn" || name === "error";
        if (toStderr) {
          if (text.startsWith("The above error occurred")) return;
          this.writeToStderr(text);
          return;
        }
        this.writeToStdout(text);
      };
    }

    return () => {
      for (const name of methods) {
        const prev = original[name];
        if (!prev) continue;
        // eslint-disable-next-line no-console
        console[name] = prev;
      }
    };
  };

  private initKittyKeyboard(): void {
    const opts = this.options.kittyKeyboard;
    if (!opts) return;

    const mode = opts.mode ?? "auto";
    if (mode === "disabled" || this.options.stdin.isTTY !== true || this.options.stdout.isTTY !== true) {
      return;
    }

    const flags: KittyFlagName[] = opts.flags ?? ["disambiguateEscapeCodes"];
    if (mode === "enabled") {
      this.enableKittyProtocol(flags);
      return;
    }

    const term = process.env["TERM"] ?? "";
    const termProgram = process.env["TERM_PROGRAM"] ?? "";
    const isKnownSupportingTerminal =
      "KITTY_WINDOW_ID" in process.env ||
      term === "xterm-kitty" ||
      termProgram === "WezTerm" ||
      termProgram === "ghostty";

    if (!isInCi() && isKnownSupportingTerminal) {
      this.confirmKittySupport(flags);
    }
  }

  private confirmKittySupport(flags: KittyFlagName[]): void {
    const stdin = this.options.stdin as unknown as {
      on?: (event: string, listener: (data: Uint8Array | string) => void) => unknown;
      removeListener?: (event: string, listener: (data: Uint8Array | string) => void) => unknown;
      unshift?: (chunk: Uint8Array) => void;
    };

    if (typeof stdin.on !== "function" || typeof stdin.removeListener !== "function") {
      return;
    }

    let responseBuffer = "";

    const cleanup = (): void => {
      this.cancelKittyDetection = undefined;
      clearTimeout(timer);
      stdin.removeListener?.("data", onData);

      const remaining = responseBuffer.replace(/\u001B\[\?\d+u/, "");
      responseBuffer = "";
      if (remaining && typeof stdin.unshift === "function") {
        try {
          stdin.unshift(Buffer.from(remaining));
        } catch {
          // ignore
        }
      }
    };

    const onData = (data: Uint8Array | string): void => {
      responseBuffer += typeof data === "string" ? data : Buffer.from(data).toString();

      if (/\u001B\[\?\d+u/.test(responseBuffer)) {
        cleanup();
        if (!this.isUnmounted) {
          this.enableKittyProtocol(flags);
        }
      }
    };

    stdin.on("data", onData);
    const timer = setTimeout(cleanup, 200);
    this.cancelKittyDetection = cleanup;

    try {
      this.options.stdout.write("\u001B[?u");
    } catch {
      cleanup();
    }
  }

  private enableKittyProtocol(flags: KittyFlagName[]): void {
    try {
      this.options.stdout.write(`\u001B[>${resolveFlags(flags)}u`);
      this.kittyProtocolEnabled = true;
    } catch {
      this.kittyProtocolEnabled = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  unmount = (error?: ExitError): void => {
    if (this.isUnmounted) return;

    if (this.beforeExitHandler) {
      process.off("beforeExit", this.beforeExitHandler);
      this.beforeExitHandler = undefined;
    }

    this.isUnmounted = true;

    instances.delete(this.options.stdout);

    if (this.unsubEvents) {
      try {
        this.unsubEvents();
      } catch {
        // ignore
      }
      this.unsubEvents = null;
    }

    if (this.restoreConsole) {
      try {
        this.restoreConsole();
      } catch {
        // ignore
      }
      this.restoreConsole = null;
    }

    if (this.cancelKittyDetection) {
      try {
        this.cancelKittyDetection();
      } catch {
        // ignore
      }
      this.cancelKittyDetection = undefined;
    }

    if (this.kittyProtocolEnabled) {
      try {
        this.options.stdout.write("\u001B[<u");
      } catch {
        // ignore
      }
      this.kittyProtocolEnabled = false;
    }

    if (this.rawModeEnabledCount > 0 && this.supportsRawMode) {
      try {
        this.options.stdin.setRawMode(false);
      } catch {
        // ignore
      }
      if (this.readableListener) {
        try {
          this.options.stdin.removeListener("readable", this.readableListener);
        } catch {
          // ignore
        }
        this.readableListener = undefined;
      }
      try {
        this.options.stdin.unref();
      } catch {
        // ignore
      }
      this.rawModeEnabledCount = 0;
    }

    if (!this.runningInCi) {
      try {
        updateRootContainer(this.container, null, null, { sync: !this.isConcurrent });
      } catch {
        // Best-effort; unmount should not throw.
      }
    }

    const resolveOrReject = () => {
      if (error instanceof Error) this.rejectExitPromise(error);
      else this.resolveExitPromise();
    };

    const isProcessExiting = error !== undefined && !(error instanceof Error);
    if (isProcessExiting) {
      resolveOrReject();
      return;
    }

    void Promise.resolve()
      .then(() => this.backend.flushDeferredFrame())
      .catch(() => {
        // ignore
      })
      .then(() => {
        this.maybeWriteCiTrailingNewline();
      })
      .then(() => this.app.stop())
      .catch(() => {
        // ignore
      })
      .finally(() => {
        try {
          this.app.dispose();
        } catch {
          // ignore
        }

        // Ensure any queued writes have been processed before resolving.
        const stdout = this.options.stdout as unknown as {
          write?: (chunk: string, cb?: () => void) => unknown;
          writableLength?: unknown;
          _writableState?: unknown;
        };

        if (
          stdout &&
          typeof stdout.write === "function" &&
          (stdout._writableState !== undefined || stdout.writableLength !== undefined)
        ) {
          try {
            (this.options.stdout as unknown as NodeJS.WriteStream).write("", resolveOrReject);
            return;
          } catch {
            // ignore
          }
        }

        setImmediate(resolveOrReject);
      });
  };

  waitUntilExit = async (): Promise<void> => {
    this.exitPromise ||= new Promise((resolve, reject) => {
      this.resolveExitPromise = resolve;
      this.rejectExitPromise = reject;
    });

    if (!this.beforeExitHandler) {
      this.beforeExitHandler = () => {
        this.unmount();
      };

      process.once("beforeExit", this.beforeExitHandler);
    }

    return this.exitPromise;
  };
}

export default function render(tree: React.ReactNode, options?: RenderOptions | NodeJS.WriteStream): Instance {
  const opts = normalizeRenderOptions(options) as InternalRenderOptions;

  const inkOptions: NormalizedInternalRenderOptions = {
    stdout: process.stdout,
    stdin: process.stdin,
    stderr: process.stderr,
    debug: false,
    exitOnCtrlC: true,
    patchConsole: true,
    maxFps: 30,
    incrementalRendering: false,
    concurrent: false,
    ...opts,
  };

  const instance = getInstance(
    inkOptions.stdout,
    () => new InkCompatInstance(inkOptions),
    inkOptions.concurrent ?? false,
  );

  instance.render(tree);

  return {
    rerender: instance.render,
    unmount() {
      instance.unmount();
    },
    waitUntilExit: instance.waitUntilExit,
    cleanup: () => instances.delete(inkOptions.stdout),
    clear: instance.clear,
  };
}
