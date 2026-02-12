/**
 * Node worker-thread entrypoint owning the native engine (LOCKED).
 * @see docs/backend/worker-model.md
 * @see docs/backend/node.md
 * @see docs/dev/style-guide.md
 * @see docs/backend/native.md
 */

import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
import {
  EVENT_POOL_SIZE,
  FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD,
  FRAME_SAB_CONTROL_HEADER_WORDS,
  FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
  FRAME_SAB_CONTROL_WORDS_PER_SLOT,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_IN_USE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_TRANSFER_V1,
  FRAME_TRANSPORT_VERSION,
  type FrameTransportConfig,
  MAX_POLL_DRAIN_ITERS,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from "./protocol.js";

/**
 * Perf tracking for worker-side event polling.
 * Only active when REZI_PERF=1.
 */
const PERF_ENABLED = (process.env as Readonly<{ REZI_PERF?: string }>).REZI_PERF === "1";
const ZR_ERR_LIMIT = -3;
type PerfSample = { phase: string; durationMs: number };
const perfSamples: PerfSample[] = [];
const PERF_MAX_SAMPLES = 1024;

function perfRecord(phase: string, durationMs: number): void {
  if (!PERF_ENABLED) return;
  if (perfSamples.length >= PERF_MAX_SAMPLES) {
    perfSamples.shift();
  }
  perfSamples.push({ phase, durationMs });
}

function perfSnapshot(): {
  phases: Record<
    string,
    {
      count: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
      worst10: number[];
    }
  >;
} {
  const byPhase = new Map<string, number[]>();
  for (const s of perfSamples) {
    let arr = byPhase.get(s.phase);
    if (!arr) {
      arr = [];
      byPhase.set(s.phase, arr);
    }
    arr.push(s.durationMs);
  }

  const phases: Record<
    string,
    {
      count: number;
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      max: number;
      worst10: number[];
    }
  > = {};
  for (const [phase, samples] of byPhase) {
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const p50Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.5));
    const p95Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    const p99Idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99));
    const worst10Start = Math.max(0, sorted.length - 10);
    const worst10 = sorted.slice(worst10Start).reverse();
    phases[phase] = {
      count: sorted.length,
      avg: sorted.length > 0 ? sum / sorted.length : 0,
      p50: sorted[p50Idx] ?? 0,
      p95: sorted[p95Idx] ?? 0,
      p99: sorted[p99Idx] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      worst10,
    };
  }
  return { phases };
}

type TerminalCapsNative = Readonly<{
  colorMode: number;
  supportsMouse: boolean;
  supportsBracketedPaste: boolean;
  supportsFocusEvents: boolean;
  supportsOsc52: boolean;
  supportsSyncUpdate: boolean;
  supportsScrollRegion: boolean;
  supportsCursorShape: boolean;
  supportsOutputWaitWritable: boolean;
  sgrAttrsSupported: number;
}>;

type DebugStatsNative = Readonly<{
  totalRecords: bigint;
  totalDropped: bigint;
  errorCount: number;
  warnCount: number;
  currentRingUsage: number;
  ringCapacity: number;
}>;

type DebugQueryResultNative = Readonly<{
  recordsReturned: number;
  recordsAvailable: number;
  oldestRecordId: bigint;
  newestRecordId: bigint;
  recordsDropped: number;
}>;

type NativeApi = Readonly<{
  engineCreate: (config?: object | null) => number;
  engineDestroy: (engineId: number) => void;
  engineSubmitDrawlist: (engineId: number, drawlist: Uint8Array) => number;
  enginePresent: (engineId: number) => number;
  enginePollEvents: (engineId: number, timeoutMs: number, out: Uint8Array) => number;
  enginePostUserEvent: (engineId: number, tag: number, payload: Uint8Array) => number;
  engineSetConfig: (engineId: number, cfg?: object | null) => number;
  engineGetCaps: (engineId: number) => TerminalCapsNative;
  // Debug API
  engineDebugEnable: (engineId: number, config?: object | null) => number;
  engineDebugDisable: (engineId: number) => number;
  engineDebugQuery: (
    engineId: number,
    query: object | null,
    outHeaders: Uint8Array,
  ) => DebugQueryResultNative;
  engineDebugGetPayload: (engineId: number, recordId: bigint, outPayload: Uint8Array) => number;
  engineDebugGetStats: (engineId: number) => DebugStatsNative;
  engineDebugExport: (engineId: number, outBuf: Uint8Array) => number;
  engineDebugReset: (engineId: number) => number;
}>;

type PendingFrameTransfer = Readonly<{
  frameSeq: number;
  transport: typeof FRAME_TRANSPORT_TRANSFER_V1;
  buf: ArrayBuffer;
  byteLen: number;
}>;

type PendingFrameSab = Readonly<{
  frameSeq: number;
  transport: typeof FRAME_TRANSPORT_SAB_V1;
  slotIndex: number;
  slotToken: number;
  byteLen: number;
}>;

type PendingFrame = PendingFrameTransfer | PendingFrameSab;

type WorkerFrameTransport =
  | Readonly<{ kind: typeof FRAME_TRANSPORT_TRANSFER_V1 }>
  | Readonly<{
      kind: typeof FRAME_TRANSPORT_SAB_V1;
      slotCount: number;
      slotBytes: number;
      controlHeader: Int32Array;
      states: Int32Array;
      tokens: Int32Array;
      data: Uint8Array;
    }>;

type WorkerData = Readonly<{
  nativeShimModule?: string;
}>;

function postToMain(msg: WorkerToMainMessage, transfer?: readonly ArrayBuffer[]): void {
  if (parentPort === null) return;
  if (transfer !== undefined) {
    parentPort.postMessage(msg, transfer as unknown as Array<ArrayBuffer>);
    return;
  }
  parentPort.postMessage(msg);
}

function safeDetail(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

function parsePositiveInt(n: unknown): number | null {
  if (typeof n !== "number") return null;
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n <= 0) return null;
  return n;
}

function parseFrameTransportConfig(cfg: unknown): WorkerFrameTransport {
  if (typeof cfg !== "object" || cfg === null) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const wire = cfg as Partial<FrameTransportConfig>;
  if (wire.kind !== FRAME_TRANSPORT_SAB_V1) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  if (wire.version !== FRAME_TRANSPORT_VERSION) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const slotCount = parsePositiveInt(wire.slotCount);
  const slotBytes = parsePositiveInt(wire.slotBytes);
  if (slotCount === null || slotBytes === null) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  if (!(wire.control instanceof SharedArrayBuffer) || !(wire.data instanceof SharedArrayBuffer)) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const control = new Int32Array(wire.control);
  if (
    control.length <
    FRAME_SAB_CONTROL_HEADER_WORDS + slotCount * FRAME_SAB_CONTROL_WORDS_PER_SLOT
  ) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const controlHeader = new Int32Array(wire.control, 0, FRAME_SAB_CONTROL_HEADER_WORDS);
  const states = new Int32Array(
    wire.control,
    FRAME_SAB_CONTROL_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const tokens = new Int32Array(
    wire.control,
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount) * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const data = new Uint8Array(wire.data);
  if (data.byteLength < slotCount * slotBytes) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  return Object.freeze({
    kind: FRAME_TRANSPORT_SAB_V1,
    slotCount,
    slotBytes,
    controlHeader,
    states,
    tokens,
    data,
  });
}

async function loadNative(): Promise<NativeApi> {
  const wd: WorkerData =
    workerData && typeof workerData === "object" ? (workerData as WorkerData) : Object.freeze({});
  const shim = typeof wd.nativeShimModule === "string" ? wd.nativeShimModule : null;

  const unwrap = (m: unknown): NativeApi => {
    if (typeof m === "object" && m !== null) {
      const rec = m as { native?: unknown; default?: unknown };
      const candidate = (rec.native ?? rec.default ?? rec) as unknown;
      return candidate as NativeApi;
    }
    return m as NativeApi;
  };

  if (shim !== null && shim.length > 0) {
    return unwrap((await import(shim)) as unknown);
  }

  try {
    return unwrap((await import("@rezi-ui/native")) as unknown);
  } catch (err) {
    const detail = safeDetail(err);
    throw new Error(
      `Failed to load @rezi-ui/native.\n\nThis usually means the native addon was not built or not installed for this platform.\n\n${detail}`,
    );
  }
}

const native = await loadNative();

// Little-endian u32 magic for bytes "ZREV".
const ZREV_MAGIC = 0x5645525a;
const ZR_EVENT_BATCH_VERSION_V1 = 1;
const ZREV_RECORD_RESIZE = 5;
const DEBUG_HEADER_BYTES = 40;
const DEBUG_QUERY_MIN_HEADERS_CAP = DEBUG_HEADER_BYTES;
const DEBUG_QUERY_MAX_HEADERS_CAP = 1 << 20; // 1 MiB
const NO_RECYCLED_DRAWLISTS: readonly ArrayBuffer[] = Object.freeze([]);

let engineId: number | null = null;
let running = false;
let haveSubmittedDrawlist = false;
let pendingFrame: PendingFrame | null = null;
let lastConsumedSabPublishedSeq = 0;
let frameTransport: WorkerFrameTransport = Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });

let eventPool: ArrayBuffer[] = [];
let discardBuffer: ArrayBuffer | null = null;
let droppedSinceLast = 0;

let tickTimer: NodeJS.Timeout | null = null;
let tickImmediate: NodeJS.Immediate | null = null;
let tickIntervalMs = 16;
let idleDelayMs = 0;
let maxIdleDelayMs = 50;
const MAX_IDLE_BACKOFF_MS = 1;
const MAX_EVENT_POLL_INTERVAL_MS = 1;
let sabWakeArmed = false;
let sabWakeEpoch = 0;

function writeResizeBatchV1(buf: ArrayBuffer, cols: number, rows: number): number {
  // Batch header (24) + RESIZE record (32) = 56 bytes.
  const totalSize = 56;
  if (buf.byteLength < totalSize) return 0;

  const dv = new DataView(buf);
  const timeMs = (Date.now() >>> 0) & 0xffff_ffff;

  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, 1, true); // event_count
  dv.setUint32(16, 0, true); // batch_flags
  dv.setUint32(20, 0, true); // reserved0

  dv.setUint32(24, ZREV_RECORD_RESIZE, true);
  dv.setUint32(28, 32, true); // record_size
  dv.setUint32(32, timeMs, true);
  dv.setUint32(36, 0, true); // flags

  dv.setUint32(40, cols >>> 0, true);
  dv.setUint32(44, rows >>> 0, true);
  dv.setUint32(48, 0, true);
  dv.setUint32(52, 0, true);

  return totalSize;
}

function maybeInjectInitialResize(maxEventBytes: number): void {
  const cols =
    typeof process.stdout.columns === "number" &&
    Number.isInteger(process.stdout.columns) &&
    process.stdout.columns > 0
      ? process.stdout.columns
      : 80;
  const rows =
    typeof process.stdout.rows === "number" &&
    Number.isInteger(process.stdout.rows) &&
    process.stdout.rows > 0
      ? process.stdout.rows
      : 24;

  const buf = eventPool.pop() ?? new ArrayBuffer(maxEventBytes);
  const byteLen = writeResizeBatchV1(buf, cols, rows);
  if (byteLen <= 0) {
    eventPool.push(buf);
    return;
  }
  postToMain({ type: "events", batch: buf, byteLen, droppedSinceLast: 0 }, [buf]);
}

function stopTickLoop(): void {
  if (tickTimer !== null) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
  if (tickImmediate !== null) {
    clearImmediate(tickImmediate);
    tickImmediate = null;
  }
  sabWakeEpoch++;
  sabWakeArmed = false;
}

function scheduleTickNow(): void {
  if (!running) return;
  if (tickImmediate !== null) return;
  if (tickTimer !== null) {
    clearTimeout(tickTimer);
    tickTimer = null;
  }
  tickImmediate = setImmediate(() => {
    tickImmediate = null;
    tick();
  });
}

function scheduleTick(delayMs: number): void {
  if (!running) return;

  const d = Math.max(0, delayMs);
  // Avoid the `setTimeout(0)` ~1ms clamp: immediate work should be scheduled via
  // `setImmediate` to keep input→frame latency tight.
  if (d <= 0) {
    scheduleTickNow();
    return;
  }
  if (tickImmediate !== null || tickTimer !== null) return;

  tickTimer = setTimeout(() => {
    tickTimer = null;
    tick();
  }, d);
}

function armSabFrameWake(): void {
  if (!running) return;
  if (frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) return;
  if (sabWakeArmed) return;

  const h = frameTransport.controlHeader;
  const seq = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD);
  if (seq > lastConsumedSabPublishedSeq) {
    // Avoid timer-driven SAB mailbox polling; when we can observe that a newer
    // frame is available, sync it now and schedule an immediate submit tick.
    syncPendingSabFrameFromMailbox();
    scheduleTickNow();
    return;
  }

  const epoch = sabWakeEpoch;
  const timeoutMs = Math.max(1, tickIntervalMs);
  const waitAsync = (
    Atomics as unknown as {
      waitAsync?: (
        typedArray: Int32Array,
        index: number,
        value: number,
        timeout?: number,
      ) => { async: boolean; value: Promise<unknown> | unknown };
    }
  ).waitAsync;
  if (typeof waitAsync !== "function") return;
  const waiter = waitAsync(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, seq, timeoutMs);
  if (typeof waiter !== "object" || waiter === null) return;

  if (waiter.async !== true) {
    if (!running) return;
    if (epoch !== sabWakeEpoch) return;
    syncPendingSabFrameFromMailbox();
    scheduleTickNow();
    return;
  }

  sabWakeArmed = true;
  const waiterPromise = waiter.value as Promise<unknown>;
  void waiterPromise.then(
    () => {
      if (epoch !== sabWakeEpoch) return;
      sabWakeArmed = false;
      if (!running) return;
      syncPendingSabFrameFromMailbox();
      scheduleTickNow();
    },
    () => {
      if (epoch !== sabWakeEpoch) return;
      sabWakeArmed = false;
    },
  );
}

function startTickLoop(fpsCap: number): void {
  stopTickLoop();
  // We poll events (including input) on the worker tick. At low FPS caps (e.g.
  // 60fps → ~16ms), this can inflate input-to-event latency into the multi-ms
  // range under load. Cap the poll interval to keep interactive latency tight.
  tickIntervalMs = Math.min(MAX_EVENT_POLL_INTERVAL_MS, Math.max(1, Math.floor(1000 / fpsCap)));
  // Keep input-to-first-poll latency bounded even after long idle periods.
  // For high fps caps (e.g. bench at 1000), we allow a small idle backoff
  // without letting latency drift into tens of milliseconds.
  maxIdleDelayMs = Math.max(tickIntervalMs, MAX_IDLE_BACKOFF_MS);
  idleDelayMs = tickIntervalMs;
  scheduleTickNow();
  armSabFrameWake();
}

function fatal(where: string, code: number, detail: string): void {
  postToMain({ type: "fatal", where, code, detail });
}

function shutdownComplete(): void {
  postToMain({ type: "shutdownComplete" });
}

function releaseSabSlot(slotIndex: number, slotToken: number, expectedState: number): void {
  if (frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) return;
  if (slotIndex < 0 || slotIndex >= frameTransport.slotCount) return;
  if (Atomics.load(frameTransport.tokens, slotIndex) !== slotToken) return;
  Atomics.compareExchange(
    frameTransport.states,
    slotIndex,
    expectedState,
    FRAME_SAB_SLOT_STATE_FREE,
  );
}

function releasePendingFrame(frame: PendingFrame, expectedSabState: number): void {
  if (frame.transport === FRAME_TRANSPORT_TRANSFER_V1) return;
  releaseSabSlot(frame.slotIndex, frame.slotToken, expectedSabState);
}

function postFrameStatus(frameSeq: number, completedResult: number): void {
  if (!Number.isInteger(frameSeq) || frameSeq <= 0) return;
  postToMain({
    type: "frameStatus",
    acceptedSeq: frameSeq,
    completedSeq: frameSeq,
    completedResult,
    recycledDrawlists: NO_RECYCLED_DRAWLISTS,
  });
}

function postFrameAccepted(frameSeq: number): void {
  if (!Number.isInteger(frameSeq) || frameSeq <= 0) return;
  postToMain({
    type: "frameStatus",
    acceptedSeq: frameSeq,
    recycledDrawlists: NO_RECYCLED_DRAWLISTS,
  });
}

function readLatestSabFrame(): PendingFrameSab | null {
  if (frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) return null;
  const h = frameTransport.controlHeader;

  let stableSeq = 0;
  let slotIndex = -1;
  let byteLen = -1;
  let slotToken = 0;

  for (let attempt = 0; attempt < 4; attempt++) {
    const seqBefore = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD);
    if (seqBefore <= lastConsumedSabPublishedSeq) return null;
    slotIndex = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD);
    byteLen = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD);
    slotToken = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD);
    const seqAfter = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD);
    if (seqBefore === seqAfter) {
      stableSeq = seqAfter;
      break;
    }
  }

  if (stableSeq <= lastConsumedSabPublishedSeq) return null;
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= frameTransport.slotCount) {
    fatal("frame", -1, `invalid SAB publish slot index: ${String(slotIndex)}`);
    running = false;
    return null;
  }
  if (!Number.isInteger(byteLen) || byteLen < 0 || byteLen > frameTransport.slotBytes) {
    fatal("frame", -1, `invalid SAB publish byteLen: ${String(byteLen)}`);
    running = false;
    return null;
  }
  if (!Number.isInteger(slotToken) || slotToken <= 0) {
    fatal("frame", -1, `invalid SAB publish slotToken: ${String(slotToken)}`);
    running = false;
    return null;
  }

  lastConsumedSabPublishedSeq = stableSeq;

  return {
    frameSeq: stableSeq,
    transport: FRAME_TRANSPORT_SAB_V1,
    slotIndex,
    slotToken,
    byteLen,
  };
}

function syncPendingSabFrameFromMailbox(): void {
  const latest = readLatestSabFrame();
  if (latest === null) return;
  if (pendingFrame !== null) {
    releasePendingFrame(pendingFrame, FRAME_SAB_SLOT_STATE_READY);
  }
  pendingFrame = latest;
}

function destroyEngineBestEffort(): void {
  const id = engineId;
  engineId = null;
  if (id === null) return;
  try {
    native.engineDestroy(id);
  } catch (err) {
    fatal("engineDestroy", -1, `engine_destroy threw: ${safeDetail(err)}`);
  }
}

function shutdownNow(): void {
  running = false;
  stopTickLoop();
  if (pendingFrame !== null) {
    releasePendingFrame(pendingFrame, FRAME_SAB_SLOT_STATE_READY);
    pendingFrame = null;
  }
  destroyEngineBestEffort();
  shutdownComplete();

  // Let worker thread exit naturally once handles are cleared.
  if (parentPort !== null) parentPort.close();
}

function tick(): void {
  if (!running) return;
  if (engineId === null) return;

  let didSubmitDrawlistThisTick = false;
  let didFrameWork = false;
  let didEventWork = false;
  let submittedFrameSeq: number | null = null;

  // 1) submit latest drawlist (if any)
  if (pendingFrame !== null) {
    const f = pendingFrame;
    pendingFrame = null;
    let res = -1;
    let sabInUse = false;
    let staleSabFrame = false;
    try {
      if (f.transport === FRAME_TRANSPORT_TRANSFER_V1) {
        res = native.engineSubmitDrawlist(engineId, new Uint8Array(f.buf, 0, f.byteLen));
      } else {
        if (frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) {
          throw new Error("SAB frame transport unavailable");
        }
        if (f.slotIndex < 0 || f.slotIndex >= frameTransport.slotCount) {
          throw new Error(`invalid SAB frame slot index: ${String(f.slotIndex)}`);
        }
        const token = Atomics.load(frameTransport.tokens, f.slotIndex);
        if (token !== f.slotToken) {
          staleSabFrame = true;
        } else {
          const prev = Atomics.compareExchange(
            frameTransport.states,
            f.slotIndex,
            FRAME_SAB_SLOT_STATE_READY,
            FRAME_SAB_SLOT_STATE_IN_USE,
          );
          if (prev !== FRAME_SAB_SLOT_STATE_READY) {
            const tokenAfter = Atomics.load(frameTransport.tokens, f.slotIndex);
            if (tokenAfter !== f.slotToken) {
              staleSabFrame = true;
            } else {
              throw new Error(
                `SAB frame slot ${String(f.slotIndex)} not ready (state=${String(prev)})`,
              );
            }
          } else {
            sabInUse = true;
            const offset = f.slotIndex * frameTransport.slotBytes;
            const view = frameTransport.data.subarray(offset, offset + f.byteLen);
            res = native.engineSubmitDrawlist(engineId, view);
          }
        }
      }
    } catch (err) {
      releasePendingFrame(f, sabInUse ? FRAME_SAB_SLOT_STATE_IN_USE : FRAME_SAB_SLOT_STATE_READY);
      postFrameStatus(f.frameSeq, -1);
      fatal("engineSubmitDrawlist", -1, `engine_submit_drawlist threw: ${safeDetail(err)}`);
      running = false;
      return;
    }
    if (staleSabFrame) {
      // This frame was superseded in the shared mailbox before submit.
      // Keep latest-wins behavior without surfacing a fatal protocol error.
      didFrameWork = true;
      syncPendingSabFrameFromMailbox();
      // Continue with present/event processing on this tick.
    } else {
      didSubmitDrawlistThisTick = res === 0;
      haveSubmittedDrawlist = haveSubmittedDrawlist || didSubmitDrawlistThisTick;
      didFrameWork = true;
      releasePendingFrame(f, FRAME_SAB_SLOT_STATE_IN_USE);
      if (res < 0) {
        postFrameStatus(f.frameSeq, res);
        fatal("engineSubmitDrawlist", res, "engine_submit_drawlist failed");
        running = false;
        return;
      }
      // Frame accepted by worker transport+submit path.
      postFrameAccepted(f.frameSeq);
      submittedFrameSeq = f.frameSeq;
    }
  }

  // 2) present (only when a new drawlist was submitted)
  //
  // Why: Presenting every tick can cause constant output even when the UI is idle
  // (e.g. sync-update begin/end sequences), which can manifest as flicker in some
  // terminals. Present should be driven by actual drawlist updates.
  if (haveSubmittedDrawlist && didSubmitDrawlistThisTick) {
    let pres = -1;
    try {
      pres = native.enginePresent(engineId);
    } catch (err) {
      if (submittedFrameSeq !== null) postFrameStatus(submittedFrameSeq, -1);
      fatal("enginePresent", -1, `engine_present threw: ${safeDetail(err)}`);
      running = false;
      return;
    }
    if (pres < 0) {
      if (submittedFrameSeq !== null) postFrameStatus(submittedFrameSeq, pres);
      fatal("enginePresent", pres, "engine_present failed");
      running = false;
      return;
    }
  }

  if (submittedFrameSeq !== null) {
    postFrameStatus(submittedFrameSeq, 0);
  }

  // 3) drain events (bounded)
  const discard = discardBuffer;
  if (discard === null) {
    if (frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWake();
    return;
  }
  for (let i = 0; i < MAX_POLL_DRAIN_ITERS; i++) {
    const outBuf: ArrayBuffer = eventPool.length > 0 ? (eventPool.pop() ?? discard) : discard;
    let written = -1;
    const pollStart = PERF_ENABLED ? performance.now() : 0;
    try {
      written = native.enginePollEvents(engineId, 0, new Uint8Array(outBuf));
    } catch (err) {
      fatal("enginePollEvents", -1, `engine_poll_events threw: ${safeDetail(err)}`);
      running = false;
      return;
    }
    if (PERF_ENABLED) {
      perfRecord("event_poll", performance.now() - pollStart);
    }

    if (written === ZR_ERR_LIMIT) {
      if (outBuf !== discard) eventPool.push(outBuf);
      // Oversized event batch for configured maxEventBytes: recover by dropping
      // this batch and continuing the pump without aborting the backend.
      droppedSinceLast++;
      didEventWork = true;
      break;
    }

    if (written < 0) {
      if (outBuf !== discard) eventPool.push(outBuf);
      fatal("enginePollEvents", written, "engine_poll_events failed");
      running = false;
      return;
    }

    if (written === 0) {
      if (outBuf !== discard) eventPool.push(outBuf);
      break;
    }

    if (outBuf === discard) {
      droppedSinceLast++;
      didEventWork = true;
      continue;
    }

    postToMain({ type: "events", batch: outBuf, byteLen: written, droppedSinceLast }, [outBuf]);
    droppedSinceLast = 0;
    didEventWork = true;
  }

  if (!running) return;
  if (didFrameWork) {
    idleDelayMs = tickIntervalMs;
    // Keep a hot pump while frames are flowing to reduce submit jitter.
    scheduleTickNow();
    if (frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWake();
    return;
  }
  if (didEventWork) {
    idleDelayMs = tickIntervalMs;
    // Event-only traffic (notably engine ticks) should not force an immediate
    // hot loop; staying timer-paced avoids main-thread contention spikes.
    scheduleTick(tickIntervalMs);
    if (frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWake();
    return;
  }
  idleDelayMs = Math.min(
    maxIdleDelayMs,
    Math.max(tickIntervalMs, idleDelayMs > 0 ? idleDelayMs * 2 : tickIntervalMs),
  );
  scheduleTick(idleDelayMs);
  if (frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWake();
}

function onMessage(msg: MainToWorkerMessage): void {
  switch (msg.type) {
    case "init": {
      if (engineId !== null) return;
      const maxEventBytes = parsePositiveInt(msg.config.maxEventBytes);
      if (maxEventBytes === null) {
        fatal("init", -1, "config.maxEventBytes must be a positive integer");
        shutdownNow();
        return;
      }
      frameTransport = parseFrameTransportConfig(msg.config.frameTransport);

      let id = 0;
      try {
        // Worker protocol includes Node-only keys (maxEventBytes, fpsCap). Strip
        // those before handing config to the native addon so the addon can
        // validate unknown keys strictly.
        const {
          maxEventBytes: _maxEventBytes,
          fpsCap: _fpsCap,
          frameTransport: _frameTransport,
          ...nativeCfg
        } = msg.config;
        id = native.engineCreate(nativeCfg);
      } catch (err) {
        fatal("engineCreate", -1, `engine_create threw: ${safeDetail(err)}`);
        shutdownNow();
        return;
      }
      if (!Number.isInteger(id) || id <= 0) {
        fatal("engineCreate", id, "engine_create failed");
        shutdownNow();
        return;
      }

      engineId = id;
      haveSubmittedDrawlist = false;
      running = true;
      pendingFrame = null;
      lastConsumedSabPublishedSeq = 0;
      if (frameTransport.kind === FRAME_TRANSPORT_SAB_V1) {
        Atomics.store(frameTransport.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 0);
        Atomics.store(frameTransport.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, 0);
        Atomics.store(frameTransport.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, 0);
        Atomics.store(frameTransport.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, 0);
        Atomics.store(frameTransport.controlHeader, FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD, 0);
        for (let i = 0; i < frameTransport.slotCount; i++) {
          Atomics.store(frameTransport.states, i, FRAME_SAB_SLOT_STATE_FREE);
          Atomics.store(frameTransport.tokens, i, 0);
        }
      }

      eventPool = [];
      for (let i = 0; i < EVENT_POOL_SIZE; i++) eventPool.push(new ArrayBuffer(maxEventBytes));
      discardBuffer = new ArrayBuffer(maxEventBytes);
      droppedSinceLast = 0;

      // Some terminals (notably Rio/WSL) may not deliver an initial resize
      // immediately. Emit a best-effort initial viewport so widget mode can
      // render on first frame.
      //
      // Skip this when a test shim is injected, to keep worker tests fully
      // deterministic (and avoid consuming buffers without ACKs).
      const wd: WorkerData =
        workerData && typeof workerData === "object"
          ? (workerData as WorkerData)
          : Object.freeze({});
      const shim = typeof wd.nativeShimModule === "string" ? wd.nativeShimModule : null;
      if (shim === null || shim.length === 0) {
        maybeInjectInitialResize(maxEventBytes);
      }

      postToMain({ type: "ready", engineId: id });

      const fpsCap = parsePositiveInt(msg.config.fpsCap) ?? 60;
      startTickLoop(fpsCap);
      return;
    }

    case "frame": {
      if (engineId === null) return;

      // latest-wins overwrite for transfer-path fallback.
      if (pendingFrame !== null) {
        releasePendingFrame(pendingFrame, FRAME_SAB_SLOT_STATE_READY);
      }

      const frameTransportTag = msg.transport ?? FRAME_TRANSPORT_TRANSFER_V1;
      if (frameTransportTag === FRAME_TRANSPORT_SAB_V1) {
        if (frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) {
          fatal("frame", -1, "received SAB frame while SAB transport is disabled");
          running = false;
          return;
        }
        if (
          !Number.isInteger(msg.slotIndex) ||
          (msg.slotIndex as number) < 0 ||
          (msg.slotIndex as number) >= frameTransport.slotCount
        ) {
          fatal("frame", -1, `invalid SAB frame slot: ${String(msg.slotIndex)}`);
          running = false;
          return;
        }
        if (
          !Number.isInteger(msg.byteLen) ||
          msg.byteLen < 0 ||
          msg.byteLen > frameTransport.slotBytes
        ) {
          fatal("frame", -1, `invalid SAB frame byteLen: ${String(msg.byteLen)}`);
          running = false;
          return;
        }
        if (!Number.isInteger(msg.slotToken) || (msg.slotToken as number) <= 0) {
          fatal("frame", -1, `invalid SAB frame slotToken: ${String(msg.slotToken)}`);
          running = false;
          return;
        }
        pendingFrame = {
          frameSeq: msg.frameSeq,
          transport: FRAME_TRANSPORT_SAB_V1,
          slotIndex: msg.slotIndex as number,
          slotToken: msg.slotToken as number,
          byteLen: msg.byteLen,
        };
      } else {
        if (!(msg.drawlist instanceof ArrayBuffer)) {
          fatal("frame", -1, "invalid transfer frame payload: missing drawlist");
          running = false;
          return;
        }
        if (
          !Number.isInteger(msg.byteLen) ||
          msg.byteLen < 0 ||
          msg.byteLen > msg.drawlist.byteLength
        ) {
          fatal("frame", -1, `invalid transfer frame byteLen: ${String(msg.byteLen)}`);
          running = false;
          return;
        }
        pendingFrame = {
          frameSeq: msg.frameSeq,
          transport: FRAME_TRANSPORT_TRANSFER_V1,
          buf: msg.drawlist,
          byteLen: msg.byteLen,
        };
      }
      idleDelayMs = tickIntervalMs;
      scheduleTickNow();
      return;
    }

    case "frameKick": {
      if (engineId === null) return;
      if (frameTransport.kind === FRAME_TRANSPORT_SAB_V1) {
        syncPendingSabFrameFromMailbox();
      }
      idleDelayMs = tickIntervalMs;
      scheduleTickNow();
      return;
    }

    case "setConfig": {
      if (engineId === null) return;
      let rc = -1;
      try {
        rc = native.engineSetConfig(engineId, msg.config);
      } catch (err) {
        fatal("engineSetConfig", -1, `engine_set_config threw: ${safeDetail(err)}`);
        running = false;
        return;
      }
      if (rc < 0) {
        fatal("engineSetConfig", rc, "engine_set_config failed");
        running = false;
      }
      return;
    }

    case "postUserEvent": {
      if (engineId === null) return;
      let rc = -1;
      try {
        rc = native.enginePostUserEvent(
          engineId,
          msg.tag,
          new Uint8Array(msg.payload, 0, msg.byteLen),
        );
      } catch (err) {
        fatal("enginePostUserEvent", -1, `engine_post_user_event threw: ${safeDetail(err)}`);
        running = false;
        return;
      }
      if (rc < 0) {
        fatal("enginePostUserEvent", rc, "engine_post_user_event failed");
        running = false;
      }
      return;
    }

    case "eventsAck": {
      if (discardBuffer === null) return;
      eventPool.push(msg.buffer);
      return;
    }

    case "getCaps": {
      if (engineId === null) return;
      try {
        const caps = native.engineGetCaps(engineId);
        postToMain({
          type: "caps",
          colorMode: caps.colorMode,
          supportsMouse: caps.supportsMouse,
          supportsBracketedPaste: caps.supportsBracketedPaste,
          supportsFocusEvents: caps.supportsFocusEvents,
          supportsOsc52: caps.supportsOsc52,
          supportsSyncUpdate: caps.supportsSyncUpdate,
          supportsScrollRegion: caps.supportsScrollRegion,
          supportsCursorShape: caps.supportsCursorShape,
          supportsOutputWaitWritable: caps.supportsOutputWaitWritable,
          sgrAttrsSupported: caps.sgrAttrsSupported,
        });
      } catch (err) {
        fatal("engineGetCaps", -1, `engine_get_caps threw: ${safeDetail(err)}`);
      }
      return;
    }

    case "shutdown": {
      shutdownNow();
      return;
    }

    // Debug API handlers
    case "debug:enable": {
      if (engineId === null) return;
      let rc = -1;
      try {
        const nativeConfig = {
          enabled: msg.config.enabled ?? true,
          ringCapacity: msg.config.ringCapacity ?? 0,
          minSeverity: msg.config.minSeverity ?? 0,
          categoryMask: msg.config.categoryMask ?? 0xffffffff,
          captureRawEvents: msg.config.captureRawEvents ?? false,
          captureDrawlistBytes: msg.config.captureDrawlistBytes ?? false,
        };
        rc = native.engineDebugEnable(engineId, nativeConfig);
      } catch (err) {
        fatal("engineDebugEnable", -1, `engine_debug_enable threw: ${safeDetail(err)}`);
        return;
      }
      postToMain({ type: "debug:enableResult", result: rc });
      return;
    }

    case "debug:disable": {
      if (engineId === null) return;
      let rc = -1;
      try {
        rc = native.engineDebugDisable(engineId);
      } catch (err) {
        fatal("engineDebugDisable", -1, `engine_debug_disable threw: ${safeDetail(err)}`);
        return;
      }
      postToMain({ type: "debug:disableResult", result: rc });
      return;
    }

    case "debug:query": {
      if (engineId === null) return;
      try {
        const nativeQuery = {
          minRecordId: msg.query.minRecordId ? BigInt(msg.query.minRecordId) : undefined,
          maxRecordId: msg.query.maxRecordId ? BigInt(msg.query.maxRecordId) : undefined,
          minFrameId: msg.query.minFrameId ? BigInt(msg.query.minFrameId) : undefined,
          maxFrameId: msg.query.maxFrameId ? BigInt(msg.query.maxFrameId) : undefined,
          categoryMask: msg.query.categoryMask,
          minSeverity: msg.query.minSeverity,
          maxRecords: msg.query.maxRecords,
        };
        const requestedHeadersCap = parsePositiveInt(msg.headersCap) ?? 0;
        const headersCap = Math.min(
          DEBUG_QUERY_MAX_HEADERS_CAP,
          Math.max(DEBUG_QUERY_MIN_HEADERS_CAP, requestedHeadersCap),
        );
        const headersBuf = new ArrayBuffer(headersCap);
        const headersArr = new Uint8Array(headersBuf);
        const result = native.engineDebugQuery(engineId, nativeQuery, headersArr);

        const maxHeaders = Math.floor(headersCap / DEBUG_HEADER_BYTES);
        const returnedHeaders =
          Number.isInteger(result.recordsReturned) && result.recordsReturned > 0
            ? Math.min(result.recordsReturned, maxHeaders)
            : 0;
        const headersByteLen = returnedHeaders * DEBUG_HEADER_BYTES;

        postToMain(
          {
            type: "debug:queryResult",
            headers: headersBuf,
            headersByteLen,
            result: {
              recordsReturned: returnedHeaders,
              recordsAvailable: result.recordsAvailable,
              oldestRecordId: String(result.oldestRecordId),
              newestRecordId: String(result.newestRecordId),
              recordsDropped: result.recordsDropped,
            },
          },
          [headersBuf],
        );
      } catch (err) {
        fatal("engineDebugQuery", -1, `engine_debug_query threw: ${safeDetail(err)}`);
      }
      return;
    }

    case "debug:getPayload": {
      if (engineId === null) return;
      try {
        const payloadBuf = new ArrayBuffer(msg.payloadCap);
        const payloadArr = new Uint8Array(payloadBuf);
        const recordId = BigInt(msg.recordId);
        const bytesWritten = native.engineDebugGetPayload(engineId, recordId, payloadArr);
        const payloadByteLen = bytesWritten > 0 ? Math.min(bytesWritten, msg.payloadCap) : 0;
        postToMain(
          {
            type: "debug:getPayloadResult",
            payload: payloadBuf,
            payloadByteLen,
            result: bytesWritten,
          },
          [payloadBuf],
        );
      } catch (err) {
        fatal("engineDebugGetPayload", -1, `engine_debug_get_payload threw: ${safeDetail(err)}`);
      }
      return;
    }

    case "debug:getStats": {
      if (engineId === null) return;
      try {
        const stats = native.engineDebugGetStats(engineId);
        postToMain({
          type: "debug:getStatsResult",
          stats: {
            totalRecords: String(stats.totalRecords),
            totalDropped: String(stats.totalDropped),
            errorCount: stats.errorCount,
            warnCount: stats.warnCount,
            currentRingUsage: stats.currentRingUsage,
            ringCapacity: stats.ringCapacity,
          },
        });
      } catch (err) {
        fatal("engineDebugGetStats", -1, `engine_debug_get_stats threw: ${safeDetail(err)}`);
      }
      return;
    }

    case "debug:export": {
      if (engineId === null) return;
      try {
        const exportBuf = new ArrayBuffer(msg.bufferCap);
        const exportArr = new Uint8Array(exportBuf);
        const bytesWritten = native.engineDebugExport(engineId, exportArr);
        const bufferByteLen = bytesWritten > 0 ? Math.min(bytesWritten, msg.bufferCap) : 0;
        postToMain(
          {
            type: "debug:exportResult",
            buffer: exportBuf,
            bufferByteLen,
          },
          [exportBuf],
        );
      } catch (err) {
        fatal("engineDebugExport", -1, `engine_debug_export threw: ${safeDetail(err)}`);
      }
      return;
    }

    case "debug:reset": {
      if (engineId === null) return;
      let rc = -1;
      try {
        rc = native.engineDebugReset(engineId);
      } catch (err) {
        fatal("engineDebugReset", -1, `engine_debug_reset threw: ${safeDetail(err)}`);
        return;
      }
      postToMain({ type: "debug:resetResult", result: rc });
      return;
    }

    case "perf:snapshot": {
      const snapshot = perfSnapshot();
      postToMain({ type: "perf:snapshotResult", snapshot });
      return;
    }
  }
}

if (parentPort === null) {
  throw new Error("engineWorker: parentPort is null (not running in worker_threads)");
}

parentPort.on("message", (m: unknown) => {
  if (typeof m !== "object" || m === null) return;
  const type = (m as { type?: unknown }).type;
  if (typeof type !== "string") return;
  onMessage(m as MainToWorkerMessage);
});
