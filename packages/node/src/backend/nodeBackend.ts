/**
 * Node RuntimeBackend implementation (LOCKED behavior).
 * @see docs/backend/worker-model.md
 * @see docs/guide/lifecycle-and-updates.md
 * @see docs/backend/node.md
 * @see docs/dev/style-guide.md
 * @see docs/backend/native.md
 */

import { Worker } from "node:worker_threads";
import type {
  BackendEventBatch,
  DebugBackend,
  DebugConfig,
  DebugQuery,
  DebugQueryResult,
  DebugStats,
  RuntimeBackend,
  TerminalCaps,
} from "@rezi-ui/core";
import {
  BACKEND_DRAWLIST_V2_MARKER,
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  DEFAULT_TERMINAL_CAPS,
  FRAME_ACCEPTED_ACK_MARKER,
} from "@rezi-ui/core";
import {
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
  ZR_EVENT_BATCH_VERSION_V1,
  ZrUiError,
  setTextMeasureEmojiPolicy,
  severityToNum,
} from "@rezi-ui/core";
import {
  type EngineCreateConfig,
  FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD,
  FRAME_SAB_CONTROL_HEADER_WORDS,
  FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
  FRAME_SAB_CONTROL_WORDS_PER_SLOT,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_SAB_SLOT_STATE_WRITING,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_TRANSFER_V1,
  FRAME_TRANSPORT_VERSION,
  type FrameTransportConfig,
  type MainToWorkerMessage,
  type PerfSnapshotWire,
  type WorkerToMainMessage,
} from "../worker/protocol.js";
import { applyEmojiWidthPolicy, resolveBackendEmojiWidthPolicy } from "./emojiWidthPolicy.js";
import { createNodeBackendInlineInternal } from "./nodeBackendInline.js";

export type NodeBackendConfig = Readonly<{
  /**
   * Runtime execution mode:
   * - "auto": pick inline only for very low fps caps (<=30), worker otherwise
   * - "worker": worker-thread engine ownership
   * - "inline": single-thread inline backend (no worker-hop transport)
   */
  executionMode?: "auto" | "worker" | "inline";
  /**
   * @deprecated Prefer createNodeApp({ config: { fpsCap } }) so app/core and backend
   * remain aligned by construction.
   */
  fpsCap?: number;
  /**
   * @deprecated Prefer createNodeApp({ config: { maxEventBytes } }) so app/core and backend
   * remain aligned by construction.
   */
  maxEventBytes?: number;
  /**
   * Request drawlist v2 for native cursor support (default: false for compatibility).
   * @deprecated Prefer createNodeApp({ config: { useV2Cursor: true } }).
   */
  useDrawlistV2?: boolean;
  /**
   * Frame transport mode:
   * - "auto": prefer SAB mailbox transport when available, fallback to transfer.
   * - "transfer": always use transferable ArrayBuffer path.
   * - "sab": require SAB mailbox path when available, fallback to transfer when unavailable.
   */
  frameTransport?: "auto" | "transfer" | "sab";
  /** SAB mailbox slot count (default: 8). */
  frameSabSlotCount?: number;
  /** SAB mailbox bytes per slot (default: 1 MiB). */
  frameSabSlotBytes?: number;
  /**
   * Extra native `engine_create` configuration passed through to the addon (e.g. `limits`).
   * Keys are forwarded as-is (camelCase or snake_case accepted by the native parser).
   */
  nativeConfig?: Readonly<Record<string, unknown>>;
  /**
   * Emoji width policy used to keep core layout measurement and native rendering aligned.
   * - "auto": use native/env overrides; optional probe when `ZRUI_EMOJI_WIDTH_PROBE=1`
   *   then fallback to deterministic "wide"
   * - "wide": emoji clusters consume 2 cells
   * - "narrow": emoji clusters consume 1 cell
   *
   * This sets core text measurement policy and native `widthPolicy` together.
   */
  emojiWidthPolicy?: "auto" | "wide" | "narrow";
}>;

export type NodeBackendInternalOpts = Readonly<{
  config?: NodeBackendConfig;
  nativeShimModule?: string;
}>;

export type NodeBackendPerfSnapshot = Readonly<{
  phases: Readonly<
    Record<
      string,
      {
        count: number;
        avg: number;
        p50: number;
        p95: number;
        p99: number;
        max: number;
        worst10: readonly number[];
      }
    >
  >;
}>;

export type NodeBackendPerf = Readonly<{
  perfSnapshot: () => Promise<NodeBackendPerfSnapshot>;
}>;

export type NodeBackend = RuntimeBackend & Readonly<{ debug: DebugBackend; perf: NodeBackendPerf }>;

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (err: Error) => void;
}>;

type SabFrameTransport = Readonly<{
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
  slotCount: number;
  slotBytes: number;
  controlHeader: Int32Array;
  states: Int32Array;
  tokens: Int32Array;
  dataBytes: Uint8Array;
  nextSlot: { value: number };
}>;

const WIDTH_POLICY_KEY = "widthPolicy" as const;

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = (err: unknown) => rej(err instanceof Error ? err : new Error(String(err)));
  });
  return { promise, resolve, reject };
}

function parsePositiveIntOr(n: unknown, fallback: number): number {
  if (typeof n !== "number") return fallback;
  if (!Number.isFinite(n)) return fallback;
  if (!Number.isInteger(n)) return fallback;
  if (n <= 0) return fallback;
  return n;
}

function parsePositiveInt(n: unknown): number | null {
  if (typeof n !== "number") return null;
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n <= 0) return null;
  return n;
}

function readNativeTargetFpsValues(
  cfg: Readonly<Record<string, unknown>>,
): Readonly<{ camel: number | null; snake: number | null }> {
  const targetFpsCfg = cfg as Readonly<{ targetFps?: unknown; target_fps?: unknown }>;
  return {
    camel: parsePositiveInt(targetFpsCfg.targetFps),
    snake: parsePositiveInt(targetFpsCfg.target_fps),
  };
}

function resolveTargetFps(fpsCap: number, nativeConfig: Readonly<Record<string, unknown>>): number {
  const values = readNativeTargetFpsValues(nativeConfig);
  if (values.camel !== null && values.snake !== null && values.camel !== values.snake) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `createNodeBackend config mismatch: nativeConfig.targetFps=${String(values.camel)} must match nativeConfig.target_fps=${String(values.snake)}.`,
    );
  }
  const nativeTargetFps = values.camel ?? values.snake;
  if (nativeTargetFps !== null && nativeTargetFps !== fpsCap) {
    throw new ZrUiError(
      "ZRUI_INVALID_PROPS",
      `createNodeBackend config mismatch: fpsCap=${String(fpsCap)} must match nativeConfig.targetFps/target_fps=${String(nativeTargetFps)}. Fix: set nativeConfig.targetFps (or target_fps) to ${String(fpsCap)}, or remove the override and use fpsCap only.`,
    );
  }
  return fpsCap;
}

function safeErr(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

const DEBUG_QUERY_DEFAULT_RECORDS = 4096 as const;
const DEBUG_QUERY_MAX_RECORDS = 16384 as const;
const FRAME_SAB_SLOT_COUNT_DEFAULT = 8 as const;
const FRAME_SAB_SLOT_BYTES_DEFAULT = 1 << 20;

function copyInto(buf: ArrayBuffer, bytes: Uint8Array): void {
  new Uint8Array(buf, 0, bytes.byteLength).set(bytes);
}

function frameSeqToSlotToken(frameSeq: number): number {
  const token = frameSeq & 0x7fff_ffff;
  return token === 0 ? 1 : token;
}

function createSabFrameTransport(slotCount: number, slotBytes: number): SabFrameTransport | null {
  if (typeof SharedArrayBuffer !== "function") return null;
  const control = new SharedArrayBuffer(
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount * FRAME_SAB_CONTROL_WORDS_PER_SLOT) *
      Int32Array.BYTES_PER_ELEMENT,
  );
  const controlHeader = new Int32Array(control, 0, FRAME_SAB_CONTROL_HEADER_WORDS);
  const states = new Int32Array(
    control,
    FRAME_SAB_CONTROL_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const tokens = new Int32Array(
    control,
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount) * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, 0);
  Atomics.store(controlHeader, FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD, 0);
  for (let i = 0; i < slotCount; i++) {
    Atomics.store(states, i, FRAME_SAB_SLOT_STATE_FREE);
    Atomics.store(tokens, i, 0);
  }
  const data = new SharedArrayBuffer(slotCount * slotBytes);
  return {
    control,
    data,
    slotCount,
    slotBytes,
    controlHeader,
    states,
    tokens,
    dataBytes: new Uint8Array(data),
    nextSlot: { value: 0 },
  };
}

function resetSabFrameTransport(t: SabFrameTransport): void {
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, 0);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD, 0);
  for (let i = 0; i < t.slotCount; i++) {
    Atomics.store(t.states, i, FRAME_SAB_SLOT_STATE_FREE);
    Atomics.store(t.tokens, i, 0);
  }
  t.nextSlot.value = 0;
}

function acquireSabSlot(t: SabFrameTransport): number {
  const start = t.nextSlot.value % t.slotCount;
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_FREE,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_FREE) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return slot;
    }
  }
  // Latest-wins semantics allow reclaiming stale READY slots instead of
  // falling back to transfer under pressure.
  for (let i = 0; i < t.slotCount; i++) {
    const slot = (start + i) % t.slotCount;
    const prev = Atomics.compareExchange(
      t.states,
      slot,
      FRAME_SAB_SLOT_STATE_READY,
      FRAME_SAB_SLOT_STATE_WRITING,
    );
    if (prev === FRAME_SAB_SLOT_STATE_READY) {
      t.nextSlot.value = (slot + 1) % t.slotCount;
      return slot;
    }
  }
  return -1;
}

function publishSabFrame(
  t: SabFrameTransport,
  frameSeq: number,
  slotIndex: number,
  slotToken: number,
  byteLen: number,
): void {
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, slotIndex);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, byteLen);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, slotToken);
  Atomics.store(t.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, frameSeq);
}

export function createNodeBackendInternal(opts: NodeBackendInternalOpts = {}): NodeBackend {
  const cfg = opts.config ?? {};
  const fpsCap = parsePositiveIntOr(cfg.fpsCap, 60);
  const requestedExecutionMode = cfg.executionMode ?? "auto";
  const executionMode: "worker" | "inline" =
    requestedExecutionMode === "inline"
      ? "inline"
      : requestedExecutionMode === "worker"
        ? "worker"
        : fpsCap <= 30
          ? "inline"
          : "worker";
  if (executionMode === "inline") {
    return createNodeBackendInlineInternal(opts);
  }
  const maxEventBytes = parsePositiveIntOr(cfg.maxEventBytes, 1 << 20);
  const useDrawlistV2 = cfg.useDrawlistV2 === true;
  const frameTransportMode =
    cfg.frameTransport === "transfer" || cfg.frameTransport === "sab" ? cfg.frameTransport : "auto";
  const frameSabSlotCount = parsePositiveIntOr(cfg.frameSabSlotCount, FRAME_SAB_SLOT_COUNT_DEFAULT);
  const frameSabSlotBytes = parsePositiveIntOr(cfg.frameSabSlotBytes, FRAME_SAB_SLOT_BYTES_DEFAULT);
  const sabFrameTransport =
    frameTransportMode === "transfer"
      ? null
      : createSabFrameTransport(frameSabSlotCount, frameSabSlotBytes);
  const frameTransportWire: FrameTransportConfig =
    sabFrameTransport !== null
      ? {
          kind: FRAME_TRANSPORT_SAB_V1,
          version: FRAME_TRANSPORT_VERSION,
          slotCount: sabFrameTransport.slotCount,
          slotBytes: sabFrameTransport.slotBytes,
          control: sabFrameTransport.control,
          data: sabFrameTransport.data,
        }
      : {
          kind: FRAME_TRANSPORT_TRANSFER_V1,
          version: FRAME_TRANSPORT_VERSION,
        };
  const nativeConfig: Readonly<Record<string, unknown>> =
    typeof cfg.nativeConfig === "object" &&
    cfg.nativeConfig !== null &&
    !Array.isArray(cfg.nativeConfig)
      ? (cfg.nativeConfig as Record<string, unknown>)
      : Object.freeze({});
  const nativeTargetFps = resolveTargetFps(fpsCap, nativeConfig);

  const initConfigBase: EngineCreateConfig = {
    ...nativeConfig,
    // fpsCap is the single frame-scheduling knob; native target fps must align.
    targetFps: nativeTargetFps,
    // Negotiation pins (docs/16 + docs/01)
    requestedEngineAbiMajor: ZR_ENGINE_ABI_MAJOR,
    requestedEngineAbiMinor: ZR_ENGINE_ABI_MINOR,
    requestedEngineAbiPatch: ZR_ENGINE_ABI_PATCH,
    requestedDrawlistVersion: useDrawlistV2 ? ZR_DRAWLIST_VERSION_V2 : ZR_DRAWLIST_VERSION_V1,
    requestedEventBatchVersion: ZR_EVENT_BATCH_VERSION_V1,

    // Node worker runtime caps
    fpsCap,
    maxEventBytes,
    frameTransport: frameTransportWire,
  };
  let initConfigResolved: EngineCreateConfig | null = null;

  let worker: Worker | null = null;
  let disposed = false;
  let started = false;
  let fatal: Error | null = null;

  let startDef: Deferred<void> | null = null;
  let startSettled = false;
  let stopDef: Deferred<void> | null = null;
  let stopSettled = false;
  let exitDef: Deferred<void> | null = null;

  let nextFrameSeq = 1;
  const frameAcceptedWaiters = new Map<number, Deferred<void>>();
  const frameCompletionWaiters = new Map<number, Deferred<void>>();

  const eventQueue: Array<
    Readonly<{ batch: ArrayBuffer; byteLen: number; droppedSinceLast: number }>
  > = [];
  const eventWaiters: Array<Deferred<BackendEventBatch>> = [];
  const capsWaiters: Array<Deferred<TerminalCaps>> = [];
  let cachedCaps: TerminalCaps | null = null;
  let stopRequested = false;

  // =============================================================================
  // Debug request serialization (no request IDs in protocol)
  // =============================================================================

  let debugChain: Promise<void> = Promise.resolve();
  let debugEnableDef: Deferred<number> | null = null;
  let debugDisableDef: Deferred<number> | null = null;
  let debugQueryDef: Deferred<{ headers: Uint8Array; result: DebugQueryResult }> | null = null;
  let debugGetPayloadDef: Deferred<Uint8Array | null> | null = null;
  let debugGetStatsDef: Deferred<DebugStats> | null = null;
  let debugExportDef: Deferred<Uint8Array> | null = null;
  let debugResetDef: Deferred<number> | null = null;
  let perfSnapshotDef: Deferred<PerfSnapshotWire> | null = null;

  function rejectDebugWaiters(err: Error): void {
    debugEnableDef?.reject(err);
    debugEnableDef = null;
    debugDisableDef?.reject(err);
    debugDisableDef = null;
    debugQueryDef?.reject(err);
    debugQueryDef = null;
    debugGetPayloadDef?.reject(err);
    debugGetPayloadDef = null;
    debugGetStatsDef?.reject(err);
    debugGetStatsDef = null;
    debugExportDef?.reject(err);
    debugExportDef = null;
    debugResetDef?.reject(err);
    debugResetDef = null;
    perfSnapshotDef?.reject(err);
    perfSnapshotDef = null;
  }

  function enqueueDebug<T>(fn: () => Promise<T>): Promise<T> {
    const p = debugChain.then(fn, fn);
    debugChain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  }

  function rejectFrameWaiters(err: Error): void {
    for (const waiter of frameAcceptedWaiters.values()) {
      waiter.reject(err);
    }
    frameAcceptedWaiters.clear();
    for (const waiter of frameCompletionWaiters.values()) {
      waiter.reject(err);
    }
    frameCompletionWaiters.clear();
  }

  function resolveAcceptedFramesUpTo(acceptedSeq: number): void {
    if (!Number.isInteger(acceptedSeq) || acceptedSeq <= 0) return;
    for (const [seq, waiter] of frameAcceptedWaiters.entries()) {
      if (seq > acceptedSeq) continue;
      frameAcceptedWaiters.delete(seq);
      waiter.resolve(undefined);
    }
  }

  function resolveCoalescedCompletionFramesUpTo(acceptedSeq: number): void {
    if (!Number.isInteger(acceptedSeq) || acceptedSeq <= 0) return;
    for (const [seq, waiter] of frameCompletionWaiters.entries()) {
      if (seq >= acceptedSeq) continue;
      frameCompletionWaiters.delete(seq);
      waiter.resolve(undefined);
    }
  }

  function settleCompletedFrame(frameSeq: number, completedResult: number): void {
    const waiter = frameCompletionWaiters.get(frameSeq);
    if (waiter === undefined) return;
    frameCompletionWaiters.delete(frameSeq);
    if (completedResult < 0) {
      waiter.reject(
        new ZrUiError(
          "ZRUI_BACKEND_ERROR",
          `engine frame completion failed: seq=${String(frameSeq)} code=${String(completedResult)}`,
        ),
      );
      return;
    }
    waiter.resolve(undefined);
  }

  function failAll(err: Error): void {
    while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
    while (capsWaiters.length > 0) capsWaiters.shift()?.reject(err);
    eventQueue.length = 0;
    rejectFrameWaiters(err);
    rejectDebugWaiters(err);

    if (startDef !== null && !startSettled) {
      startSettled = true;
      startDef.reject(err);
    }
    if (stopDef !== null && !stopSettled) {
      stopSettled = true;
      stopDef.reject(err);
    }
  }

  function rejectPending(err: Error): void {
    while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
    while (capsWaiters.length > 0) capsWaiters.shift()?.reject(err);
    eventQueue.length = 0;
    rejectFrameWaiters(err);
    rejectDebugWaiters(err);

    if (startDef !== null && !startSettled) {
      startSettled = true;
      startDef.reject(err);
    }
  }

  function send(msg: MainToWorkerMessage, transfer?: readonly ArrayBuffer[]): void {
    if (worker === null) return;
    if (transfer !== undefined) {
      worker.postMessage(msg, transfer as unknown as Array<ArrayBuffer>);
      return;
    }
    worker.postMessage(msg);
  }

  function handleWorkerMessage(m: unknown): void {
    if (fatal !== null) return;
    if (typeof m !== "object" || m === null) return;
    const type = (m as { type?: unknown }).type;
    if (typeof type !== "string") return;

    const msg = m as WorkerToMainMessage;
    switch (msg.type) {
      case "ready": {
        started = true;
        stopRequested = false;
        if (startDef !== null && !startSettled) {
          startSettled = true;
          startDef.resolve();
        }
        return;
      }

      case "frameStatus": {
        if (!Number.isInteger(msg.acceptedSeq) || msg.acceptedSeq <= 0) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `invalid frameStatus.acceptedSeq: ${String(msg.acceptedSeq)}`,
          );
          failAll(fatal);
          return;
        }
        resolveAcceptedFramesUpTo(msg.acceptedSeq);
        resolveCoalescedCompletionFramesUpTo(msg.acceptedSeq);

        if (msg.completedSeq !== undefined) {
          if (!Number.isInteger(msg.completedSeq) || msg.completedSeq <= 0) {
            fatal = new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `invalid frameStatus.completedSeq: ${String(msg.completedSeq)}`,
            );
            failAll(fatal);
            return;
          }
          const completedResult = msg.completedResult ?? 0;
          if (!Number.isInteger(completedResult)) {
            fatal = new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `invalid frameStatus.completedResult: ${String(msg.completedResult)}`,
            );
            failAll(fatal);
            return;
          }
          settleCompletedFrame(msg.completedSeq, completedResult);
          if (completedResult < 0) {
            fatal = new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `engine frame failed: seq=${String(msg.completedSeq)} code=${String(completedResult)}`,
            );
            failAll(fatal);
            return;
          }
          return;
        }
        return;
      }

      case "events": {
        if (!Number.isInteger(msg.byteLen) || msg.byteLen < 0) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: invalid byteLen=${String(msg.byteLen)}`,
          );
          failAll(fatal);
          return;
        }
        if (msg.byteLen > msg.batch.byteLength) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: byteLen=${String(msg.byteLen)} exceeds batch.byteLength=${String(msg.batch.byteLength)}`,
          );
          failAll(fatal);
          return;
        }
        if (msg.byteLen > maxEventBytes) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: byteLen=${String(msg.byteLen)} exceeds maxEventBytes=${String(maxEventBytes)}`,
          );
          failAll(fatal);
          return;
        }
        if (!Number.isInteger(msg.droppedSinceLast) || msg.droppedSinceLast < 0) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: invalid droppedSinceLast=${String(msg.droppedSinceLast)}`,
          );
          failAll(fatal);
          return;
        }
        const waiter = eventWaiters.shift();
        if (waiter !== undefined) {
          const buf = msg.batch;
          const bytes = new Uint8Array(buf, 0, msg.byteLen);
          let released = false;
          waiter.resolve({
            bytes,
            droppedBatches: msg.droppedSinceLast,
            release: () => {
              if (released) return;
              released = true;
              if (disposed) return;
              send({ type: "eventsAck", buffer: buf }, [buf]);
            },
          });
          return;
        }
        eventQueue.push({
          batch: msg.batch,
          byteLen: msg.byteLen,
          droppedSinceLast: msg.droppedSinceLast,
        });
        return;
      }

      case "fatal": {
        fatal = new ZrUiError(
          "ZRUI_BACKEND_ERROR",
          `worker fatal: ${msg.where} (${msg.code}): ${msg.detail}`,
        );
        failAll(fatal);
        return;
      }

      case "debug:enableResult": {
        debugEnableDef?.resolve(msg.result);
        debugEnableDef = null;
        return;
      }

      case "debug:disableResult": {
        debugDisableDef?.resolve(msg.result);
        debugDisableDef = null;
        return;
      }

      case "debug:queryResult": {
        try {
          if (!Number.isInteger(msg.headersByteLen) || msg.headersByteLen < 0) {
            throw new Error(
              `debug:queryResult: invalid headersByteLen=${String(msg.headersByteLen)}`,
            );
          }
          if (msg.headersByteLen > msg.headers.byteLength) {
            throw new Error(
              `debug:queryResult: headersByteLen=${String(msg.headersByteLen)} exceeds buffer=${String(msg.headers.byteLength)}`,
            );
          }

          const headers = new Uint8Array(msg.headers, 0, msg.headersByteLen);
          const result: DebugQueryResult = {
            recordsReturned: msg.result.recordsReturned,
            recordsAvailable: msg.result.recordsAvailable,
            oldestRecordId: BigInt(msg.result.oldestRecordId),
            newestRecordId: BigInt(msg.result.newestRecordId),
            recordsDropped: msg.result.recordsDropped,
          };
          debugQueryDef?.resolve({ headers, result });
          debugQueryDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:getPayloadResult": {
        if (msg.result <= 0 || msg.payloadByteLen <= 0) {
          debugGetPayloadDef?.resolve(null);
          debugGetPayloadDef = null;
          return;
        }
        try {
          if (!Number.isInteger(msg.payloadByteLen) || msg.payloadByteLen < 0) {
            throw new Error(
              `debug:getPayloadResult: invalid payloadByteLen=${String(msg.payloadByteLen)}`,
            );
          }
          if (msg.payloadByteLen > msg.payload.byteLength) {
            throw new Error(
              `debug:getPayloadResult: payloadByteLen=${String(msg.payloadByteLen)} exceeds buffer=${String(msg.payload.byteLength)}`,
            );
          }
          debugGetPayloadDef?.resolve(new Uint8Array(msg.payload, 0, msg.payloadByteLen));
          debugGetPayloadDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:getStatsResult": {
        try {
          const stats: DebugStats = {
            totalRecords: BigInt(msg.stats.totalRecords),
            totalDropped: BigInt(msg.stats.totalDropped),
            errorCount: msg.stats.errorCount,
            warnCount: msg.stats.warnCount,
            currentRingUsage: msg.stats.currentRingUsage,
            ringCapacity: msg.stats.ringCapacity,
          };
          debugGetStatsDef?.resolve(stats);
          debugGetStatsDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:exportResult": {
        try {
          if (!Number.isInteger(msg.bufferByteLen) || msg.bufferByteLen < 0) {
            throw new Error(
              `debug:exportResult: invalid bufferByteLen=${String(msg.bufferByteLen)}`,
            );
          }
          if (msg.bufferByteLen > msg.buffer.byteLength) {
            throw new Error(
              `debug:exportResult: bufferByteLen=${String(msg.bufferByteLen)} exceeds buffer=${String(msg.buffer.byteLength)}`,
            );
          }
          debugExportDef?.resolve(new Uint8Array(msg.buffer, 0, msg.bufferByteLen));
          debugExportDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:resetResult": {
        debugResetDef?.resolve(msg.result);
        debugResetDef = null;
        return;
      }

      case "perf:snapshotResult": {
        perfSnapshotDef?.resolve(msg.snapshot);
        perfSnapshotDef = null;
        return;
      }

      case "shutdownComplete": {
        rejectPending(new Error("NodeBackend: stopped"));
        if (stopDef !== null && !stopSettled) {
          stopSettled = true;
          stopDef.resolve();
        }
        return;
      }

      case "caps": {
        const caps: TerminalCaps = {
          colorMode: msg.colorMode as 0 | 1 | 2 | 3,
          supportsMouse: msg.supportsMouse,
          supportsBracketedPaste: msg.supportsBracketedPaste,
          supportsFocusEvents: msg.supportsFocusEvents,
          supportsOsc52: msg.supportsOsc52,
          supportsSyncUpdate: msg.supportsSyncUpdate,
          supportsScrollRegion: msg.supportsScrollRegion,
          supportsCursorShape: msg.supportsCursorShape,
          supportsOutputWaitWritable: msg.supportsOutputWaitWritable,
          sgrAttrsSupported: msg.sgrAttrsSupported,
        };
        cachedCaps = caps;
        const waiter = capsWaiters.shift();
        if (waiter !== undefined) {
          waiter.resolve(caps);
        }
        return;
      }
    }
  }

  function handleWorkerExit(code: number | null): void {
    if (disposed) return;
    if (stopRequested) {
      rejectPending(new Error("NodeBackend: stopped"));
    }
    if (code !== 0 && fatal === null) {
      fatal = new ZrUiError(
        "ZRUI_BACKEND_ERROR",
        `worker exited unexpectedly: code=${String(code)}`,
      );
      failAll(fatal);
    }
    if (code === 0 && !started && fatal === null && startDef !== null && !startSettled) {
      fatal = new ZrUiError("ZRUI_BACKEND_ERROR", "worker exited before ready handshake");
      failAll(fatal);
    }

    if (stopDef !== null && !stopSettled) {
      stopSettled = true;
      stopDef.resolve();
    }

    if (exitDef !== null) exitDef.resolve();
    worker = null;
    started = false;
  }

  const backend: RuntimeBackend = {
    async start(): Promise<void> {
      if (disposed) throw new Error("NodeBackend: disposed");
      if (fatal !== null) throw fatal;
      if (started) return;

      if (worker === null) {
        if (initConfigResolved === null) {
          const resolvedEmojiWidthPolicy = await resolveBackendEmojiWidthPolicy(
            cfg.emojiWidthPolicy,
            nativeConfig,
          );
          const nativeWidthPolicy = applyEmojiWidthPolicy(resolvedEmojiWidthPolicy);
          initConfigResolved = {
            ...initConfigBase,
            widthPolicy: nativeWidthPolicy,
          };
        } else {
          // Keep core measurement policy deterministic across stop/start cycles.
          const widthPolicy = initConfigResolved[WIDTH_POLICY_KEY];
          if (typeof widthPolicy === "number") {
            setTextMeasureEmojiPolicy(widthPolicy === 0 ? "narrow" : "wide");
          }
        }

        startDef = deferred<void>();
        startSettled = false;
        stopDef = null;
        stopSettled = false;
        stopRequested = false;
        if (sabFrameTransport !== null) resetSabFrameTransport(sabFrameTransport);

        const entry = new URL("../worker/engineWorker.js", import.meta.url);
        const workerData =
          opts.nativeShimModule === undefined
            ? undefined
            : { nativeShimModule: opts.nativeShimModule };
        worker = new Worker(entry, { workerData });
        exitDef = deferred<void>();
        worker.on("message", handleWorkerMessage);
        worker.on("error", (err) => {
          if (fatal !== null) return;
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
        });
        worker.on("exit", (code) => {
          handleWorkerExit(code);
        });

        send({ type: "init", config: initConfigResolved });
      }

      if (startDef === null) throw new Error("NodeBackend: invariant violated (startDef is null)");
      await startDef.promise;
    },

    async stop(): Promise<void> {
      if (disposed) return;
      if (fatal !== null) throw fatal;
      if (worker === null) return;

      if (stopDef !== null) {
        await stopDef.promise;
        return;
      }

      stopDef = deferred<void>();
      stopSettled = false;
      stopRequested = true;
      send({ type: "shutdown" });
      await stopDef.promise;
      if (exitDef !== null) await exitDef.promise;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;

      if (worker !== null) {
        worker.terminate().catch(() => {});
        worker = null;
      }

      const err = new Error("NodeBackend: disposed");
      while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
      while (capsWaiters.length > 0) capsWaiters.shift()?.reject(err);
      eventQueue.length = 0;
      rejectFrameWaiters(err);
      rejectDebugWaiters(err);

      if (startDef !== null && !startSettled) {
        startSettled = true;
        startDef.reject(err);
      }
      if (stopDef !== null && !stopSettled) {
        stopSettled = true;
        stopDef.reject(err);
      }
    },

    requestFrame(drawlist: Uint8Array): Promise<void> {
      if (disposed) return Promise.reject(new Error("NodeBackend: disposed"));
      if (fatal !== null) return Promise.reject(fatal);
      if (stopRequested) return Promise.reject(new Error("NodeBackend: stopped"));
      if (!started) {
        return backend.start().then(() => backend.requestFrame(drawlist));
      }
      if (worker === null) return Promise.reject(new Error("NodeBackend: worker not available"));

      const frameSeq = nextFrameSeq++;
      const frameAcceptedDef = deferred<void>();
      frameAcceptedWaiters.set(frameSeq, frameAcceptedDef);
      const frameCompletionDef = deferred<void>();
      frameCompletionWaiters.set(frameSeq, frameCompletionDef);
      const framePromise = frameCompletionDef.promise as Promise<void> &
        Partial<Record<typeof FRAME_ACCEPTED_ACK_MARKER, Promise<void>>>;
      Object.defineProperty(framePromise, FRAME_ACCEPTED_ACK_MARKER, {
        value: frameAcceptedDef.promise,
        configurable: false,
        enumerable: false,
        writable: false,
      });

      if (sabFrameTransport !== null && drawlist.byteLength <= sabFrameTransport.slotBytes) {
        const slotIndex = acquireSabSlot(sabFrameTransport);
        if (slotIndex >= 0) {
          const slotToken = frameSeqToSlotToken(frameSeq);
          const slotOffset = slotIndex * sabFrameTransport.slotBytes;
          sabFrameTransport.dataBytes.set(drawlist, slotOffset);
          Atomics.store(sabFrameTransport.tokens, slotIndex, slotToken);
          Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_READY);
          publishSabFrame(sabFrameTransport, frameSeq, slotIndex, slotToken, drawlist.byteLength);
          // SAB consumers wake on futex notify instead of per-frame
          // MessagePort frameKick round-trips.
          Atomics.notify(sabFrameTransport.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 1);
          return framePromise;
        }
      }

      // Transfer fallback participates in the same ACK model:
      // - accepted ACK (hidden marker) can unblock app scheduling early
      // - completion promise settles on worker completion/coalescing status
      const buf = new ArrayBuffer(drawlist.byteLength);
      copyInto(buf, drawlist);
      try {
        send(
          {
            type: "frame",
            frameSeq,
            byteLen: drawlist.byteLength,
            transport: FRAME_TRANSPORT_TRANSFER_V1,
            drawlist: buf,
          },
          [buf],
        );
      } catch (err) {
        frameAcceptedWaiters.delete(frameSeq);
        frameCompletionWaiters.delete(frameSeq);
        return Promise.reject(safeErr(err));
      }
      return framePromise;
    },

    pollEvents(): Promise<BackendEventBatch> {
      if (disposed) return Promise.reject(new Error("NodeBackend: disposed"));
      if (fatal !== null) return Promise.reject(fatal);
      if (stopRequested) return Promise.reject(new Error("NodeBackend: stopped"));

      const queued = eventQueue.shift();
      if (queued !== undefined) {
        const buf = queued.batch;
        const bytes = new Uint8Array(buf, 0, queued.byteLen);
        let released = false;
        return Promise.resolve({
          bytes,
          droppedBatches: queued.droppedSinceLast,
          release: () => {
            if (released) return;
            released = true;
            if (disposed) return;
            send({ type: "eventsAck", buffer: buf }, [buf]);
          },
        });
      }

      const d = deferred<BackendEventBatch>();
      eventWaiters.push(d);
      return d.promise;
    },

    postUserEvent(tag: number, payload: Uint8Array): void {
      if (disposed) throw new Error("NodeBackend: disposed");
      if (fatal !== null) throw fatal;
      if (worker === null) throw new Error("NodeBackend: not started");
      if (stopRequested) throw new Error("NodeBackend: stopped");

      const buf = new ArrayBuffer(payload.byteLength);
      copyInto(buf, payload);
      send({ type: "postUserEvent", tag, payload: buf, byteLen: payload.byteLength }, [buf]);
    },

    async getCaps(): Promise<TerminalCaps> {
      if (disposed) throw new Error("NodeBackend: disposed");
      if (fatal !== null) throw fatal;

      // Return cached caps if available
      if (cachedCaps !== null) {
        return cachedCaps;
      }

      // If not started, return default caps
      if (!started || worker === null) {
        return DEFAULT_TERMINAL_CAPS;
      }

      // Request caps from worker
      const d = deferred<TerminalCaps>();
      capsWaiters.push(d);
      send({ type: "getCaps" });
      return d.promise;
    },
  };

  const debug: DebugBackend = {
    debugEnable: (config: DebugConfig) =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugEnableDef !== null) throw new Error("NodeBackend: debugEnable already in-flight");
        debugEnableDef = deferred<number>();

        const minSeverity =
          config.minSeverity !== undefined ? severityToNum(config.minSeverity) : null;

        const configWire = {
          enabled: true,
          ...(config.ringCapacity !== undefined ? { ringCapacity: config.ringCapacity } : {}),
          ...(minSeverity !== null ? { minSeverity } : {}),
          ...(config.categoryMask !== undefined ? { categoryMask: config.categoryMask } : {}),
          ...(config.captureRawEvents !== undefined
            ? { captureRawEvents: config.captureRawEvents }
            : {}),
          ...(config.captureDrawlistBytes !== undefined
            ? { captureDrawlistBytes: config.captureDrawlistBytes }
            : {}),
        };

        send({ type: "debug:enable", config: configWire });

        const rc = await debugEnableDef.promise;
        debugEnableDef = null;
        if (rc < 0) {
          throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugEnable failed: code=${String(rc)}`);
        }
      }),

    debugDisable: () =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugDisableDef !== null)
          throw new Error("NodeBackend: debugDisable already in-flight");
        debugDisableDef = deferred<number>();
        send({ type: "debug:disable" });
        const rc = await debugDisableDef.promise;
        debugDisableDef = null;
        if (rc < 0) {
          throw new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `engineDebugDisable failed: code=${String(rc)}`,
          );
        }
      }),

    debugQuery: (query: DebugQuery) =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugQueryDef !== null) throw new Error("NodeBackend: debugQuery already in-flight");
        debugQueryDef = deferred<{ headers: Uint8Array; result: DebugQueryResult }>();

        const minSeverity =
          query.minSeverity !== undefined ? severityToNum(query.minSeverity) : null;
        const maxRecords = parsePositiveInt(query.maxRecords);
        const recordsCap =
          maxRecords !== null
            ? Math.min(maxRecords, DEBUG_QUERY_MAX_RECORDS)
            : DEBUG_QUERY_DEFAULT_RECORDS;
        const headersCap = Math.max(40, recordsCap * 40);

        const queryWire = {
          ...(query.minRecordId !== undefined ? { minRecordId: String(query.minRecordId) } : {}),
          ...(query.maxRecordId !== undefined ? { maxRecordId: String(query.maxRecordId) } : {}),
          ...(query.minFrameId !== undefined ? { minFrameId: String(query.minFrameId) } : {}),
          ...(query.maxFrameId !== undefined ? { maxFrameId: String(query.maxFrameId) } : {}),
          ...(query.categoryMask !== undefined ? { categoryMask: query.categoryMask } : {}),
          ...(minSeverity !== null ? { minSeverity } : {}),
          ...(maxRecords !== null ? { maxRecords: recordsCap } : {}),
        };

        send({ type: "debug:query", query: queryWire, headersCap });

        const out = await debugQueryDef.promise;
        debugQueryDef = null;
        return out;
      }),

    debugGetPayload: (recordId: bigint) =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugGetPayloadDef !== null) {
          throw new Error("NodeBackend: debugGetPayload already in-flight");
        }
        debugGetPayloadDef = deferred<Uint8Array | null>();

        // Payloads can include raw drawlist bytes. Default to 4 MiB.
        const payloadCap = 1 << 22;
        send({
          type: "debug:getPayload",
          recordId: String(recordId),
          payloadCap,
        });

        const bytes = await debugGetPayloadDef.promise;
        debugGetPayloadDef = null;
        return bytes;
      }),

    debugGetStats: () =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugGetStatsDef !== null)
          throw new Error("NodeBackend: debugGetStats already in-flight");
        debugGetStatsDef = deferred<DebugStats>();
        send({ type: "debug:getStats" });
        const stats = await debugGetStatsDef.promise;
        debugGetStatsDef = null;
        return stats;
      }),

    debugExport: () =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugExportDef !== null) throw new Error("NodeBackend: debugExport already in-flight");
        debugExportDef = deferred<Uint8Array>();
        send({ type: "debug:export", bufferCap: 1 << 23 }); // 8 MiB
        const bytes = await debugExportDef.promise;
        debugExportDef = null;
        return bytes;
      }),

    debugReset: () =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugResetDef !== null) throw new Error("NodeBackend: debugReset already in-flight");
        debugResetDef = deferred<number>();
        send({ type: "debug:reset" });
        const rc = await debugResetDef.promise;
        debugResetDef = null;
        if (rc < 0) {
          throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugReset failed: code=${String(rc)}`);
        }
      }),
  };

  const perf: NodeBackendPerf = {
    perfSnapshot: () =>
      enqueueDebug(async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (perfSnapshotDef !== null)
          throw new Error("NodeBackend: perfSnapshot already in-flight");
        perfSnapshotDef = deferred<PerfSnapshotWire>();
        send({ type: "perf:snapshot" });
        const snapshot = await perfSnapshotDef.promise;
        perfSnapshotDef = null;
        return snapshot;
      }),
  };

  const out = Object.assign(backend, { debug, perf }) as NodeBackend &
    Record<
      | typeof BACKEND_DRAWLIST_V2_MARKER
      | typeof BACKEND_MAX_EVENT_BYTES_MARKER
      | typeof BACKEND_FPS_CAP_MARKER,
      boolean | number
    >;
  Object.defineProperties(out, {
    [BACKEND_DRAWLIST_V2_MARKER]: {
      value: useDrawlistV2,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_MAX_EVENT_BYTES_MARKER]: {
      value: maxEventBytes,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_FPS_CAP_MARKER]: {
      value: fpsCap,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });
  return out;
}
