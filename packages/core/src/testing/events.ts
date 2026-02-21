/**
 * packages/core/src/testing/events.ts — Test event encoding and fluent builders.
 *
 * Why: Integration tests should not need to hand-encode ZREV binary batches.
 * This module provides:
 *   - A stable ZREV v1 encoder for test events
 *   - A fluent TestEventBuilder API for readable test setup
 *   - A BackendEventBatch helper for polling backends in tests
 */

import { ZREV_MAGIC, ZR_EVENT_BATCH_VERSION_V1 } from "../abi.js";
import type { BackendEventBatch } from "../backend.js";
import { KEY_NAME_TO_CODE, charToKeyCode } from "../keybindings/keyCodes.js";
import type { ZrevKeyAction, ZrevMouseKind } from "../protocol/types.js";

const BATCH_HEADER_SIZE = 24;
const RECORD_HEADER_SIZE = 16;
const PASTE_HEADER_SIZE = 8;
const USER_HEADER_SIZE = 16;

const KEY_RECORD_SIZE = 32;
const TEXT_RECORD_SIZE = 24;
const MOUSE_RECORD_SIZE = 48;
const RESIZE_RECORD_SIZE = 32;
const TICK_RECORD_SIZE = 32;

export const TEST_MOUSE_KIND_DOWN: ZrevMouseKind = 3;
export const TEST_MOUSE_KIND_UP: ZrevMouseKind = 4;
export const TEST_MOUSE_KIND_SCROLL: ZrevMouseKind = 5;

export type TestZrevEvent =
  | Readonly<{
      kind: "key";
      timeMs: number;
      key: number;
      mods?: number;
      action: ZrevKeyAction;
    }>
  | Readonly<{ kind: "text"; timeMs: number; codepoint: number }>
  | Readonly<{ kind: "paste"; timeMs: number; bytes: Uint8Array }>
  | Readonly<{
      kind: "mouse";
      timeMs: number;
      x: number;
      y: number;
      mouseKind: ZrevMouseKind;
      mods?: number;
      buttons?: number;
      wheelX?: number;
      wheelY?: number;
    }>
  | Readonly<{ kind: "resize"; timeMs: number; cols: number; rows: number }>
  | Readonly<{ kind: "tick"; timeMs: number; dtMs?: number }>
  | Readonly<{ kind: "user"; timeMs: number; tag: number; payload: Uint8Array }>;

export type TestEventInput =
  | Readonly<{
      kind: "key";
      timeMs?: number;
      key: number | string;
      mods?: number;
      action?: ZrevKeyAction;
    }>
  | Readonly<{ kind: "text"; timeMs?: number; codepoint: number }>
  | Readonly<{ kind: "paste"; timeMs?: number; bytes: Uint8Array }>
  | Readonly<{
      kind: "mouse";
      timeMs?: number;
      x: number;
      y: number;
      mouseKind: ZrevMouseKind;
      mods?: number;
      buttons?: number;
      wheelX?: number;
      wheelY?: number;
    }>
  | Readonly<{ kind: "resize"; timeMs?: number; cols: number; rows: number }>
  | Readonly<{ kind: "tick"; timeMs?: number; dtMs?: number }>
  | Readonly<{ kind: "user"; timeMs?: number; tag: number; payload: Uint8Array }>;

export type TestEventBuilderOptions = Readonly<{
  startTimeMs?: number;
  stepMs?: number;
}>;

type KeyPressOptions = Readonly<{
  timeMs?: number;
  mods?: number;
  action?: ZrevKeyAction;
}>;

type TypeOptions = Readonly<{
  timeMs?: number;
}>;

type ClickOptions = Readonly<{
  timeMs?: number;
  releaseTimeMs?: number;
  mods?: number;
  buttonMask?: number;
}>;

type ScrollOptions = Readonly<{
  timeMs?: number;
  mods?: number;
  buttons?: number;
  wheelX?: number;
}>;

function align4(n: number): number {
  return (n + 3) & ~3;
}

function toU32(n: number): number {
  return Math.trunc(n) >>> 0;
}

function toI32(n: number): number {
  return (Math.trunc(n) | 0) >> 0;
}

function recordSize(ev: TestZrevEvent): number {
  switch (ev.kind) {
    case "key":
      return KEY_RECORD_SIZE;
    case "text":
      return TEXT_RECORD_SIZE;
    case "mouse":
      return MOUSE_RECORD_SIZE;
    case "resize":
      return RESIZE_RECORD_SIZE;
    case "tick":
      return TICK_RECORD_SIZE;
    case "paste": {
      const payloadLen = align4(ev.bytes.byteLength);
      return RECORD_HEADER_SIZE + PASTE_HEADER_SIZE + payloadLen;
    }
    case "user": {
      const payloadLen = align4(ev.payload.byteLength);
      return RECORD_HEADER_SIZE + USER_HEADER_SIZE + payloadLen;
    }
    default:
      return 0;
  }
}

function normalizedAction(action: ZrevKeyAction | undefined): ZrevKeyAction {
  if (action === "up" || action === "repeat") return action;
  return "down";
}

function actionToRaw(action: ZrevKeyAction): number {
  if (action === "down") return 1;
  if (action === "up") return 2;
  return 3;
}

function normalizeKeyCode(key: number | string): number {
  if (typeof key === "number") return toU32(key);

  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new Error("TestEventBuilder: key name must not be empty");
  }

  const direct = KEY_NAME_TO_CODE.get(trimmed.toLowerCase());
  if (direct !== undefined) return direct;

  if (trimmed.length === 1) {
    const fromChar = charToKeyCode(trimmed);
    if (fromChar !== null) return fromChar;
  }

  throw new Error(`TestEventBuilder: unsupported key "${key}"`);
}

function normalizeStepMs(stepMs: number | undefined): number {
  if (stepMs === undefined) return 1;
  if (!Number.isFinite(stepMs) || Math.trunc(stepMs) <= 0) {
    throw new Error(`TestEventBuilder: stepMs must be an integer > 0 (got ${String(stepMs)})`);
  }
  return Math.trunc(stepMs);
}

function normalizeStartTimeMs(startTimeMs: number | undefined): number {
  if (startTimeMs === undefined) return 1;
  if (!Number.isFinite(startTimeMs) || Math.trunc(startTimeMs) < 0) {
    throw new Error(
      `TestEventBuilder: startTimeMs must be an integer >= 0 (got ${String(startTimeMs)})`,
    );
  }
  return Math.trunc(startTimeMs);
}

/**
 * Encode a ZREV v1 batch from typed test events.
 *
 * This mirrors the parser layout in protocol/zrev_v1.ts and intentionally keeps
 * defaults lightweight (mods/buttons/wheel/dt default to 0).
 */
export function encodeZrevBatchV1(
  opts: Readonly<{ flags?: number; events?: readonly TestZrevEvent[] }>,
): Uint8Array {
  const flags = opts.flags ?? 0;
  const events = opts.events ?? [];

  let totalSize = BATCH_HEADER_SIZE;
  for (const ev of events) totalSize += recordSize(ev);
  totalSize = align4(totalSize);

  const bytes = new Uint8Array(totalSize);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, events.length, true);
  dv.setUint32(16, toU32(flags), true);
  dv.setUint32(20, 0, true);

  let off = BATCH_HEADER_SIZE;
  for (const ev of events) {
    const timeMs = toU32(ev.timeMs);

    if (ev.kind === "key") {
      dv.setUint32(off + 0, 1, true);
      dv.setUint32(off + 4, KEY_RECORD_SIZE, true);
      dv.setUint32(off + 8, timeMs, true);
      dv.setUint32(off + 12, 0, true);
      dv.setUint32(off + 16, toU32(ev.key), true);
      dv.setUint32(off + 20, toU32(ev.mods ?? 0), true);
      dv.setUint32(off + 24, actionToRaw(normalizedAction(ev.action)), true);
      dv.setUint32(off + 28, 0, true);
      off += KEY_RECORD_SIZE;
      continue;
    }

    if (ev.kind === "text") {
      dv.setUint32(off + 0, 2, true);
      dv.setUint32(off + 4, TEXT_RECORD_SIZE, true);
      dv.setUint32(off + 8, timeMs, true);
      dv.setUint32(off + 12, 0, true);
      dv.setUint32(off + 16, toU32(ev.codepoint), true);
      dv.setUint32(off + 20, 0, true);
      off += TEXT_RECORD_SIZE;
      continue;
    }

    if (ev.kind === "paste") {
      const byteLen = ev.bytes.byteLength;
      const padded = align4(byteLen);
      const size = RECORD_HEADER_SIZE + PASTE_HEADER_SIZE + padded;
      dv.setUint32(off + 0, 3, true);
      dv.setUint32(off + 4, size, true);
      dv.setUint32(off + 8, timeMs, true);
      dv.setUint32(off + 12, 0, true);
      dv.setUint32(off + 16, byteLen, true);
      dv.setUint32(off + 20, 0, true);
      bytes.set(ev.bytes, off + 24);
      off += size;
      continue;
    }

    if (ev.kind === "mouse") {
      dv.setUint32(off + 0, 4, true);
      dv.setUint32(off + 4, MOUSE_RECORD_SIZE, true);
      dv.setUint32(off + 8, timeMs, true);
      dv.setUint32(off + 12, 0, true);
      dv.setInt32(off + 16, toI32(ev.x), true);
      dv.setInt32(off + 20, toI32(ev.y), true);
      dv.setUint32(off + 24, toU32(ev.mouseKind), true);
      dv.setUint32(off + 28, toU32(ev.mods ?? 0), true);
      dv.setUint32(off + 32, toU32(ev.buttons ?? 0), true);
      dv.setInt32(off + 36, toI32(ev.wheelX ?? 0), true);
      dv.setInt32(off + 40, toI32(ev.wheelY ?? 0), true);
      dv.setUint32(off + 44, 0, true);
      off += MOUSE_RECORD_SIZE;
      continue;
    }

    if (ev.kind === "resize") {
      dv.setUint32(off + 0, 5, true);
      dv.setUint32(off + 4, RESIZE_RECORD_SIZE, true);
      dv.setUint32(off + 8, timeMs, true);
      dv.setUint32(off + 12, 0, true);
      dv.setUint32(off + 16, toU32(ev.cols), true);
      dv.setUint32(off + 20, toU32(ev.rows), true);
      dv.setUint32(off + 24, 0, true);
      dv.setUint32(off + 28, 0, true);
      off += RESIZE_RECORD_SIZE;
      continue;
    }

    if (ev.kind === "tick") {
      dv.setUint32(off + 0, 6, true);
      dv.setUint32(off + 4, TICK_RECORD_SIZE, true);
      dv.setUint32(off + 8, timeMs, true);
      dv.setUint32(off + 12, 0, true);
      dv.setUint32(off + 16, toU32(ev.dtMs ?? 0), true);
      dv.setUint32(off + 20, 0, true);
      dv.setUint32(off + 24, 0, true);
      dv.setUint32(off + 28, 0, true);
      off += TICK_RECORD_SIZE;
      continue;
    }

    const payloadLen = ev.payload.byteLength;
    const padded = align4(payloadLen);
    const size = RECORD_HEADER_SIZE + USER_HEADER_SIZE + padded;
    dv.setUint32(off + 0, 7, true);
    dv.setUint32(off + 4, size, true);
    dv.setUint32(off + 8, timeMs, true);
    dv.setUint32(off + 12, 0, true);
    dv.setUint32(off + 16, toU32(ev.tag), true);
    dv.setUint32(off + 20, payloadLen, true);
    dv.setUint32(off + 24, 0, true);
    dv.setUint32(off + 28, 0, true);
    bytes.set(ev.payload, off + 32);
    off += size;
  }

  return bytes;
}

export function makeBackendBatch(
  opts: Readonly<{
    bytes: Uint8Array;
    droppedBatches?: number;
    onRelease?: () => void;
  }>,
): BackendEventBatch {
  let released = false;
  return {
    bytes: opts.bytes,
    droppedBatches: opts.droppedBatches ?? 0,
    release: () => {
      if (released) return;
      released = true;
      opts.onRelease?.();
    },
  };
}

/**
 * Fluent helper for deterministic integration-test event streams.
 *
 * Example:
 *   const events = new TestEventBuilder();
 *   events.pressKey("Enter").type("hello@example.com").click(10, 5).resize(120, 40);
 *   backend.pushBatch(events.buildBatch());
 */
export class TestEventBuilder {
  private readonly initialTimeMs: number;
  private readonly stepMs: number;
  private nextTimeMs: number;
  private readonly queue: TestZrevEvent[] = [];

  constructor(opts: TestEventBuilderOptions = {}) {
    this.initialTimeMs = normalizeStartTimeMs(opts.startTimeMs);
    this.stepMs = normalizeStepMs(opts.stepMs);
    this.nextTimeMs = this.initialTimeMs;
  }

  private consumeTime(explicitTimeMs: number | undefined): number {
    if (explicitTimeMs !== undefined) {
      const timeMs = normalizeStartTimeMs(explicitTimeMs);
      this.nextTimeMs = Math.max(this.nextTimeMs, timeMs + this.stepMs);
      return timeMs;
    }
    const timeMs = this.nextTimeMs;
    this.nextTimeMs += this.stepMs;
    return timeMs;
  }

  add(input: TestEventInput): this {
    const timeMs = this.consumeTime(input.timeMs);

    if (input.kind === "key") {
      this.queue.push({
        kind: "key",
        timeMs,
        key: normalizeKeyCode(input.key),
        mods: toU32(input.mods ?? 0),
        action: normalizedAction(input.action),
      });
      return this;
    }

    if (input.kind === "text") {
      this.queue.push({
        kind: "text",
        timeMs,
        codepoint: toU32(input.codepoint),
      });
      return this;
    }

    if (input.kind === "paste") {
      this.queue.push({
        kind: "paste",
        timeMs,
        bytes: input.bytes,
      });
      return this;
    }

    if (input.kind === "mouse") {
      this.queue.push({
        kind: "mouse",
        timeMs,
        x: toI32(input.x),
        y: toI32(input.y),
        mouseKind: input.mouseKind,
        mods: toU32(input.mods ?? 0),
        buttons: toU32(input.buttons ?? 0),
        wheelX: toI32(input.wheelX ?? 0),
        wheelY: toI32(input.wheelY ?? 0),
      });
      return this;
    }

    if (input.kind === "resize") {
      this.queue.push({
        kind: "resize",
        timeMs,
        cols: toU32(input.cols),
        rows: toU32(input.rows),
      });
      return this;
    }

    if (input.kind === "tick") {
      this.queue.push({
        kind: "tick",
        timeMs,
        dtMs: toU32(input.dtMs ?? 0),
      });
      return this;
    }

    this.queue.push({
      kind: "user",
      timeMs,
      tag: toU32(input.tag),
      payload: input.payload,
    });
    return this;
  }

  pressKey(key: number | string, opts: KeyPressOptions = {}): this {
    return this.add(
      Object.freeze({
        kind: "key" as const,
        key,
        action: opts.action ?? "down",
        ...(opts.timeMs !== undefined ? { timeMs: opts.timeMs } : {}),
        ...(opts.mods !== undefined ? { mods: opts.mods } : {}),
      }),
    );
  }

  keyDown(key: number | string, opts: Omit<KeyPressOptions, "action"> = {}): this {
    return this.pressKey(key, { ...opts, action: "down" });
  }

  keyUp(key: number | string, opts: Omit<KeyPressOptions, "action"> = {}): this {
    return this.pressKey(key, { ...opts, action: "up" });
  }

  type(text: string, opts: TypeOptions = {}): this {
    let first = true;
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp === undefined) continue;
      this.add({
        kind: "text",
        ...(first && opts.timeMs !== undefined ? { timeMs: opts.timeMs } : {}),
        codepoint: cp,
      });
      first = false;
    }
    return this;
  }

  click(x: number, y: number, opts: ClickOptions = {}): this {
    const mods = opts.mods ?? 0;
    const buttonMask = opts.buttonMask ?? 1;

    this.add({
      kind: "mouse",
      x,
      y,
      mouseKind: TEST_MOUSE_KIND_DOWN,
      mods,
      buttons: buttonMask,
      wheelX: 0,
      wheelY: 0,
      ...(opts.timeMs !== undefined ? { timeMs: opts.timeMs } : {}),
    });
    this.add({
      kind: "mouse",
      x,
      y,
      mouseKind: TEST_MOUSE_KIND_UP,
      mods,
      buttons: 0,
      wheelX: 0,
      wheelY: 0,
      ...(opts.releaseTimeMs !== undefined ? { timeMs: opts.releaseTimeMs } : {}),
    });
    return this;
  }

  scroll(x: number, y: number, wheelY: number, opts: ScrollOptions = {}): this {
    return this.add({
      kind: "mouse",
      x,
      y,
      mouseKind: TEST_MOUSE_KIND_SCROLL,
      mods: opts.mods ?? 0,
      buttons: opts.buttons ?? 0,
      wheelX: opts.wheelX ?? 0,
      wheelY,
      ...(opts.timeMs !== undefined ? { timeMs: opts.timeMs } : {}),
    });
  }

  resize(cols: number, rows: number, timeMs?: number): this {
    return this.add({
      kind: "resize",
      cols,
      rows,
      ...(timeMs !== undefined ? { timeMs } : {}),
    });
  }

  tick(dtMs = 0, timeMs?: number): this {
    return this.add({
      kind: "tick",
      dtMs,
      ...(timeMs !== undefined ? { timeMs } : {}),
    });
  }

  paste(bytes: Uint8Array, timeMs?: number): this {
    return this.add({
      kind: "paste",
      bytes,
      ...(timeMs !== undefined ? { timeMs } : {}),
    });
  }

  user(tag: number, payload: Uint8Array, timeMs?: number): this {
    return this.add({
      kind: "user",
      tag,
      payload,
      ...(timeMs !== undefined ? { timeMs } : {}),
    });
  }

  events(): readonly TestZrevEvent[] {
    return Object.freeze(this.queue.slice());
  }

  build(flags = 0): Uint8Array {
    return encodeZrevBatchV1({ flags, events: this.queue });
  }

  buildBatch(
    opts: Readonly<{ flags?: number; droppedBatches?: number; onRelease?: () => void }> = {},
  ): BackendEventBatch {
    return makeBackendBatch({
      bytes: this.build(opts.flags ?? 0),
      ...(opts.droppedBatches !== undefined ? { droppedBatches: opts.droppedBatches } : {}),
      ...(opts.onRelease !== undefined ? { onRelease: opts.onRelease } : {}),
    });
  }

  reset(): this {
    this.queue.length = 0;
    this.nextTimeMs = this.initialTimeMs;
    return this;
  }
}
