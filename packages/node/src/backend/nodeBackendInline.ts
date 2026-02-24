/**
 * Inline (single-thread) Node RuntimeBackend implementation.
 *
 * This path removes the worker-thread hop and submits frames directly from the
 * main thread. It is intentionally optimized for low-latency transport and is
 * selected explicitly via `executionMode: "inline"`.
 */

import { performance } from "node:perf_hooks";
import type {
  BackendEventBatch,
  BackendRawWrite,
  DebugBackend,
  DebugConfig,
  DebugQuery,
  DebugQueryResult,
  DebugStats,
  RuntimeBackend,
  TerminalCaps,
  TerminalProfile,
} from "@rezi-ui/core";
import {
  BACKEND_DRAWLIST_VERSION_MARKER,
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  BACKEND_RAW_WRITE_MARKER,
  DEFAULT_TERMINAL_CAPS,
} from "@rezi-ui/core";
import {
  ZR_DRAWLIST_VERSION_V5,
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
  ZR_EVENT_BATCH_VERSION_V1,
  ZrUiError,
  setTextMeasureEmojiPolicy,
  severityToNum,
} from "@rezi-ui/core";
import { applyEmojiWidthPolicy, resolveBackendEmojiWidthPolicy } from "./emojiWidthPolicy.js";
import type {
  NodeBackend,
  NodeBackendInternalOpts,
  NodeBackendPerfSnapshot,
} from "./nodeBackend.js";
import { terminalProfileFromNodeEnv } from "./terminalProfile.js";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (err: Error) => void;
}>;

type NativeCaps = Readonly<{
  colorMode: number;
  supportsMouse: boolean;
  supportsBracketedPaste: boolean;
  supportsFocusEvents: boolean;
  supportsOsc52: boolean;
  supportsSyncUpdate: boolean;
  supportsScrollRegion: boolean;
  supportsCursorShape: boolean;
  supportsOutputWaitWritable: boolean;
  supportsUnderlineStyles?: boolean;
  supportsColoredUnderlines?: boolean;
  supportsHyperlinks?: boolean;
  sgrAttrsSupported: number;
}>;

type NativeDebugStats = Readonly<{
  totalRecords: bigint;
  totalDropped: bigint;
  errorCount: number;
  warnCount: number;
  currentRingUsage: number;
  ringCapacity: number;
}>;

type NativeDebugQueryResult = Readonly<{
  recordsReturned: number;
  recordsAvailable: number;
  oldestRecordId: bigint;
  newestRecordId: bigint;
  recordsDropped: number;
}>;

const DEFAULT_NATIVE_LIMITS: Readonly<Record<string, number>> = Object.freeze({
  outMaxBytesPerFrame: 2 * 1024 * 1024,
  dlMaxTotalBytes: 2 * 1024 * 1024,
  dlMaxCmds: 100_000,
  dlMaxStrings: 10_000,
  dlMaxBlobs: 10_000,
});

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function mergeNativeLimits(
  nativeConfig: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  // biome-ignore lint/complexity/useLiteralKeys: bracket access is required by noPropertyAccessFromIndexSignature.
  const limitsValue = nativeConfig["limits"];
  const existingLimits = isPlainObject(limitsValue)
    ? (limitsValue as Record<string, unknown>)
    : null;
  const limits: Record<string, unknown> = { ...(existingLimits ?? {}) };

  const has = (camel: string): boolean => {
    const snake = camel.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    return (
      Object.prototype.hasOwnProperty.call(limits, camel) ||
      Object.prototype.hasOwnProperty.call(limits, snake)
    );
  };

  for (const [camel, value] of Object.entries(DEFAULT_NATIVE_LIMITS)) {
    if (has(camel)) continue;
    limits[camel] = value;
  }

  return Object.freeze({ ...nativeConfig, limits: Object.freeze(limits) });
}

type NativeApi = Readonly<{
  engineCreate: (config?: object | null) => number;
  engineDestroy: (engineId: number) => void;
  engineSubmitDrawlist: (engineId: number, drawlist: Uint8Array) => number;
  enginePresent: (engineId: number) => number;
  enginePollEvents: (engineId: number, timeoutMs: number, out: Uint8Array) => number;
  enginePostUserEvent: (engineId: number, tag: number, payload: Uint8Array) => number;
  engineSetConfig: (engineId: number, cfg?: object | null) => number;
  engineGetCaps: (engineId: number) => NativeCaps;
  engineDebugEnable?: (engineId: number, config?: object | null) => number;
  engineDebugDisable?: (engineId: number) => number;
  engineDebugQuery?: (
    engineId: number,
    query: object | null,
    outHeaders: Uint8Array,
  ) => NativeDebugQueryResult;
  engineDebugGetPayload?: (engineId: number, recordId: bigint, outPayload: Uint8Array) => number;
  engineDebugGetStats?: (engineId: number) => NativeDebugStats;
  engineDebugExport?: (engineId: number, outBuf: Uint8Array) => number;
  engineDebugReset?: (engineId: number) => number;
}>;

type NativeApiWithDebug = NativeApi &
  Readonly<{
    engineDebugEnable: (engineId: number, config?: object | null) => number;
    engineDebugDisable: (engineId: number) => number;
    engineDebugQuery: (
      engineId: number,
      query: object | null,
      outHeaders: Uint8Array,
    ) => NativeDebugQueryResult;
    engineDebugGetPayload: (engineId: number, recordId: bigint, outPayload: Uint8Array) => number;
    engineDebugGetStats: (engineId: number) => NativeDebugStats;
    engineDebugExport: (engineId: number, outBuf: Uint8Array) => number;
    engineDebugReset: (engineId: number) => number;
  }>;

const DEBUG_QUERY_DEFAULT_RECORDS = 4096 as const;
const DEBUG_QUERY_MAX_RECORDS = 16384 as const;
const EVENT_POOL_SIZE = 16 as const;
const POLL_IDLE_MS = 2 as const;
const POLL_BUSY_MS = 0 as const;
const ZR_ERR_LIMIT = -3 as const;
const DEFAULT_FPS_CAP = 60 as const;
const MAX_SAFE_FPS_CAP = 1000 as const;
const DEFAULT_MAX_EVENT_BYTES = 1 << 20;
const MAX_SAFE_EVENT_BYTES = 4 << 20;
const MAX_DEBUG_BYTES_RETRY_CAP = 64 << 20;
const WIDTH_POLICY_KEY = "widthPolicy" as const;
const RESOLVED_VOID = Promise.resolve();
const SYNC_FRAME_ACK_MARKER = "__reziSyncFrameAck";
const RESOLVED_SYNC_FRAME_ACK = Promise.resolve() as Promise<void> &
  Readonly<Record<typeof SYNC_FRAME_ACK_MARKER, true>>;
Object.defineProperty(RESOLVED_SYNC_FRAME_ACK, SYNC_FRAME_ACK_MARKER, {
  value: true,
  configurable: false,
  enumerable: false,
  writable: false,
});

const PERF_ENABLED = (process.env as Readonly<{ REZI_PERF?: string }>).REZI_PERF === "1";
const PERF_MAX_SAMPLES = 1024;

type PerfSample = Readonly<{ phase: string; durationMs: number }>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
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

export function readDebugBytesWithRetry<TEmpty>(
  read: (out: Uint8Array) => number,
  initialCapacity: number,
  emptyValue: TEmpty,
  operation: string,
): Uint8Array | TEmpty {
  const baseCapacity = Number.isFinite(initialCapacity) ? Math.floor(initialCapacity) : 1;
  let capacity = Math.min(MAX_DEBUG_BYTES_RETRY_CAP, Math.max(1, baseCapacity));
  while (true) {
    const out = new Uint8Array(capacity);
    const written = read(out);
    if (!Number.isInteger(written) || written > out.byteLength) {
      throw new ZrUiError(
        "ZRUI_BACKEND_ERROR",
        `${operation} returned invalid byte count: written=${String(written)} capacity=${String(out.byteLength)}`,
      );
    }
    if (written <= 0) {
      return emptyValue;
    }
    if (written < out.byteLength) {
      return out.slice(0, written);
    }
    if (capacity >= MAX_DEBUG_BYTES_RETRY_CAP) {
      // Native debug APIs return written byte count but not total required size.
      // If the output exactly fills our max-cap buffer, it's likely truncated.
      process.emitWarning(
        `[rezi][debug] ${operation} filled ${String(capacity)} bytes at max cap; payload may be truncated.`,
      );
      return out.slice(0, written);
    }
    capacity = Math.min(MAX_DEBUG_BYTES_RETRY_CAP, capacity * 2);
  }
}

function parseDrawlistVersion(v: unknown): 2 | 3 | 4 | 5 | null {
  if (v === undefined) return null;
  if (v === 2 || v === 3 || v === 4 || v === 5) return v;
  throw new ZrUiError(
    "ZRUI_INVALID_PROPS",
    `createNodeBackend config mismatch: drawlistVersion must be one of 2, 3, 4, 5 (got ${String(v)}).`,
  );
}

function resolveRequestedDrawlistVersion(
  config: Readonly<{ drawlistVersion?: 2 | 3 | 4 | 5 }>,
): 2 | 3 | 4 | 5 {
  const explicitDrawlistVersion = parseDrawlistVersion(config.drawlistVersion);
  if (explicitDrawlistVersion !== null) return explicitDrawlistVersion;
  return ZR_DRAWLIST_VERSION_V5;
}

function parseBoundedPositiveIntOrThrow(
  name: string,
  value: unknown,
  fallback: number,
  max: number,
): number {
  if (value === undefined) return fallback;
  const parsed = parsePositiveInt(value);
  if (parsed === null) {
    throw new ZrUiError("ZRUI_INVALID_PROPS", `${name} must be a positive integer`);
  }
  if (parsed > max) {
    throw new ZrUiError("ZRUI_INVALID_PROPS", `${name} must be <= ${String(max)}`);
  }
  return parsed;
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

function safeDetail(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

// Little-endian u32 magic for bytes "ZREV".
const ZREV_MAGIC = 0x5645525a;
const ZREV_RECORD_RESIZE = 5;

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

async function loadNative(shimModule: string | undefined): Promise<NativeApi> {
  const unwrap = (m: unknown): NativeApi => {
    if (typeof m === "object" && m !== null) {
      const rec = m as { native?: unknown; default?: unknown };
      const candidate = (rec.native ?? rec.default ?? rec) as unknown;
      return candidate as NativeApi;
    }
    return m as NativeApi;
  };

  if (typeof shimModule === "string" && shimModule.length > 0) {
    return unwrap((await import(shimModule)) as unknown);
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

export function createNodeBackendInlineInternal(opts: NodeBackendInternalOpts = {}): NodeBackend {
  const cfg = opts.config ?? {};
  const requestedDrawlistVersion = resolveRequestedDrawlistVersion(cfg);
  const fpsCap = parseBoundedPositiveIntOrThrow(
    "fpsCap",
    cfg.fpsCap,
    DEFAULT_FPS_CAP,
    MAX_SAFE_FPS_CAP,
  );
  const maxEventBytes = parseBoundedPositiveIntOrThrow(
    "maxEventBytes",
    cfg.maxEventBytes,
    DEFAULT_MAX_EVENT_BYTES,
    MAX_SAFE_EVENT_BYTES,
  );
  const nativeConfig: Readonly<Record<string, unknown>> =
    typeof cfg.nativeConfig === "object" &&
    cfg.nativeConfig !== null &&
    !Array.isArray(cfg.nativeConfig)
      ? mergeNativeLimits(cfg.nativeConfig as Record<string, unknown>)
      : mergeNativeLimits(Object.freeze({}));
  const nativeTargetFps = resolveTargetFps(fpsCap, nativeConfig);

  const initConfigBase = {
    ...nativeConfig,
    // fpsCap is the single frame-scheduling knob; native target fps must align.
    targetFps: nativeTargetFps,
    requestedEngineAbiMajor: ZR_ENGINE_ABI_MAJOR,
    requestedEngineAbiMinor: ZR_ENGINE_ABI_MINOR,
    requestedEngineAbiPatch: ZR_ENGINE_ABI_PATCH,
    requestedDrawlistVersion: requestedDrawlistVersion,
    requestedEventBatchVersion: ZR_EVENT_BATCH_VERSION_V1,
  };
  let initConfigResolved: Record<string, unknown> | null = null;

  let native: NativeApi | null = null;
  let nativePromise: Promise<NativeApi> | null = null;
  let engineId: number | null = null;
  let started = false;
  let disposed = false;
  let stopRequested = false;
  let fatal: Error | null = null;

  let startDef: Deferred<void> | null = null;
  let startSettled = false;
  let stopDef: Deferred<void> | null = null;
  let stopSettled = false;

  let eventQueue: Array<
    Readonly<{ batch: ArrayBuffer; byteLen: number; droppedSinceLast: number }>
  > = [];
  const eventWaiters: Array<Deferred<BackendEventBatch>> = [];
  let eventPool: ArrayBuffer[] = [];
  let discardBuffer: ArrayBuffer | null = null;
  let droppedSinceLast = 0;

  let pollTimer: NodeJS.Timeout | null = null;
  let pollImmediate: NodeJS.Immediate | null = null;
  let pollActive = false;

  const perfSamples: PerfSample[] = [];

  let cachedCaps: TerminalCaps | null = null;

  function perfRecord(phase: string, durationMs: number): void {
    if (!PERF_ENABLED) return;
    if (perfSamples.length >= PERF_MAX_SAMPLES) {
      perfSamples.shift();
    }
    perfSamples.push({ phase, durationMs });
  }

  function perfSnapshot(): NodeBackendPerfSnapshot {
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
        worst10: readonly number[];
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

  function rejectWaiters(err: Error): void {
    while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
    eventQueue = [];
    if (startDef !== null && !startSettled) {
      startSettled = true;
      startDef.reject(err);
    }
    if (stopDef !== null && !stopSettled) {
      stopSettled = true;
      stopDef.reject(err);
    }
  }

  function failWith(where: string, code: number, detail: string): void {
    const err = new ZrUiError("ZRUI_BACKEND_ERROR", `${where} (${String(code)}): ${detail}`);
    fatal = err;
    rejectWaiters(err);
  }

  function clearPollLoop(): void {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    if (pollImmediate !== null) {
      clearImmediate(pollImmediate);
      pollImmediate = null;
    }
    pollActive = false;
  }

  function schedulePoll(delayMs: number): void {
    if (!started || disposed || stopRequested || fatal !== null) return;
    if (pollImmediate !== null || pollTimer !== null) return;
    if (delayMs <= 0) {
      pollImmediate = setImmediate(() => {
        pollImmediate = null;
        runPollOnce();
      });
      return;
    }
    pollTimer = setTimeout(() => {
      pollTimer = null;
      runPollOnce();
    }, delayMs);
  }

  function buildBatch(buf: ArrayBuffer, byteLen: number, dropped: number): BackendEventBatch {
    const bytes = new Uint8Array(buf, 0, byteLen);
    let released = false;
    return {
      bytes,
      droppedBatches: dropped,
      release: () => {
        if (released) return;
        released = true;
        if (!started || disposed) return;
        eventPool.push(buf);
      },
    };
  }

  function emitInitialResizeIfPossible(): void {
    if (!started || discardBuffer === null) return;
    // Keep test-shim runs deterministic (mirrors worker backend behavior).
    if (typeof opts.nativeShimModule === "string" && opts.nativeShimModule.length > 0) return;
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
    const waiter = eventWaiters.shift();
    if (waiter !== undefined) {
      waiter.resolve(buildBatch(buf, byteLen, 0));
      return;
    }
    eventQueue.push({ batch: buf, byteLen, droppedSinceLast: 0 });
  }

  function runPollOnce(): void {
    if (!started || disposed || stopRequested || fatal !== null) return;
    if (engineId === null || native === null || discardBuffer === null) return;
    if (pollActive) return;
    pollActive = true;
    try {
      const outBuf = eventPool.length > 0 ? (eventPool.pop() ?? discardBuffer) : discardBuffer;
      let written = -1;
      const startMs = PERF_ENABLED ? performance.now() : 0;
      try {
        written = native.enginePollEvents(engineId, 0, new Uint8Array(outBuf));
      } catch (err) {
        failWith("enginePollEvents", -1, `engine_poll_events threw: ${safeDetail(err)}`);
        return;
      }
      if (PERF_ENABLED) {
        perfRecord("event_poll", performance.now() - startMs);
      }
      if (written === ZR_ERR_LIMIT) {
        if (outBuf !== discardBuffer) eventPool.push(outBuf);
        droppedSinceLast++;
        schedulePoll(POLL_BUSY_MS);
        return;
      }
      if (!Number.isInteger(written) || written > outBuf.byteLength) {
        if (outBuf !== discardBuffer) eventPool.push(outBuf);
        failWith(
          "enginePollEvents",
          -1,
          `engine_poll_events returned invalid byte count: written=${String(written)} capacity=${String(outBuf.byteLength)}`,
        );
        return;
      }
      if (written < 0) {
        if (outBuf !== discardBuffer) eventPool.push(outBuf);
        failWith("enginePollEvents", written, "engine_poll_events failed");
        return;
      }
      if (written === 0) {
        if (outBuf !== discardBuffer) eventPool.push(outBuf);
        schedulePoll(POLL_IDLE_MS);
        return;
      }
      if (outBuf === discardBuffer) {
        droppedSinceLast++;
        schedulePoll(POLL_BUSY_MS);
        return;
      }
      const waiter = eventWaiters.shift();
      if (waiter !== undefined) {
        waiter.resolve(buildBatch(outBuf, written, droppedSinceLast));
      } else {
        eventQueue.push({ batch: outBuf, byteLen: written, droppedSinceLast });
      }
      droppedSinceLast = 0;
      schedulePoll(POLL_BUSY_MS);
    } finally {
      pollActive = false;
    }
  }

  async function ensureNativeLoaded(): Promise<NativeApi> {
    if (native !== null) return native;
    if (nativePromise !== null) return nativePromise;
    nativePromise = loadNative(opts.nativeShimModule).then((mod) => {
      native = mod;
      return mod;
    });
    return nativePromise;
  }

  function ensureDebugApiLoaded(api: NativeApi): NativeApiWithDebug {
    if (typeof api.engineDebugEnable !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    if (typeof api.engineDebugDisable !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    if (typeof api.engineDebugQuery !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    if (typeof api.engineDebugGetPayload !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    if (typeof api.engineDebugGetStats !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    if (typeof api.engineDebugExport !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    if (typeof api.engineDebugReset !== "function") {
      throw new Error("inline backend: native debug API is unavailable");
    }
    return api as NativeApiWithDebug;
  }

  const backend: RuntimeBackend = {
    async start(): Promise<void> {
      if (disposed) throw new Error("NodeBackend(inline): disposed");
      if (fatal !== null) throw fatal;
      if (started) return;
      if (startDef !== null) {
        await startDef.promise;
        return;
      }

      startDef = deferred<void>();
      startSettled = false;
      stopRequested = false;

      try {
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
          const widthPolicy = initConfigResolved[WIDTH_POLICY_KEY];
          if (typeof widthPolicy === "number") {
            setTextMeasureEmojiPolicy(widthPolicy === 0 ? "narrow" : "wide");
          }
        }

        const api = await ensureNativeLoaded();
        let id = 0;
        try {
          id = api.engineCreate(initConfigResolved);
        } catch (err) {
          throw new Error(`engine_create threw: ${safeDetail(err)}`);
        }
        if (!Number.isInteger(id) || id <= 0) {
          throw new Error(`engine_create failed: code=${String(id)}`);
        }
        engineId = id;
        started = true;
        cachedCaps = null;
        eventQueue = [];
        eventPool = [];
        for (let i = 0; i < EVENT_POOL_SIZE; i++) {
          eventPool.push(new ArrayBuffer(maxEventBytes));
        }
        discardBuffer = new ArrayBuffer(maxEventBytes);
        droppedSinceLast = 0;
        emitInitialResizeIfPossible();
        schedulePoll(POLL_IDLE_MS);
        if (!startSettled && startDef !== null) {
          startSettled = true;
          startDef.resolve();
        }
      } catch (err) {
        const e = safeErr(err);
        fatal = new ZrUiError("ZRUI_BACKEND_ERROR", e.message);
        rejectWaiters(fatal);
      }

      if (startDef === null) throw new Error("NodeBackend(inline): invariant startDef");
      await startDef.promise;
      startDef = null;
    },

    async stop(): Promise<void> {
      if (disposed) return;
      if (fatal !== null) throw fatal;
      if (!started) return;
      if (stopDef !== null) {
        await stopDef.promise;
        return;
      }

      stopDef = deferred<void>();
      stopSettled = false;
      stopRequested = true;
      clearPollLoop();

      const stopErr = new Error("NodeBackend(inline): stopped");
      while (eventWaiters.length > 0) eventWaiters.shift()?.reject(stopErr);
      eventQueue = [];

      if (engineId !== null && native !== null) {
        try {
          native.engineDestroy(engineId);
        } catch {
          // best effort on stop
        }
      }
      engineId = null;
      started = false;

      if (!stopSettled && stopDef !== null) {
        stopSettled = true;
        stopDef.resolve();
      }
      await stopDef.promise;
      stopDef = null;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearPollLoop();
      stopRequested = true;
      if (engineId !== null && native !== null) {
        try {
          native.engineDestroy(engineId);
        } catch {
          // ignore
        }
      }
      engineId = null;
      started = false;
      const err = new Error("NodeBackend(inline): disposed");
      while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
      eventQueue = [];
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
      if (disposed) return Promise.reject(new Error("NodeBackend(inline): disposed"));
      if (fatal !== null) return Promise.reject(fatal);
      if (stopRequested) return Promise.reject(new Error("NodeBackend(inline): stopped"));
      if (!started) {
        return backend.start().then(() => backend.requestFrame(drawlist));
      }
      if (native === null || engineId === null) {
        return Promise.reject(new Error("NodeBackend(inline): engine not started"));
      }

      try {
        const submitRc = native.engineSubmitDrawlist(engineId, drawlist);
        if (submitRc < 0) {
          return Promise.reject(
            new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `engine_submit_drawlist failed: code=${String(submitRc)}`,
            ),
          );
        }
        const presentRc = native.enginePresent(engineId);
        if (presentRc < 0) {
          return Promise.reject(
            new ZrUiError("ZRUI_BACKEND_ERROR", `engine_present failed: code=${String(presentRc)}`),
          );
        }
      } catch (err) {
        return Promise.reject(safeErr(err));
      }
      return RESOLVED_SYNC_FRAME_ACK;
    },

    pollEvents(): Promise<BackendEventBatch> {
      if (disposed) return Promise.reject(new Error("NodeBackend(inline): disposed"));
      if (fatal !== null) return Promise.reject(fatal);
      if (stopRequested) return Promise.reject(new Error("NodeBackend(inline): stopped"));

      const queued = eventQueue.shift();
      if (queued !== undefined) {
        return Promise.resolve(buildBatch(queued.batch, queued.byteLen, queued.droppedSinceLast));
      }

      const d = deferred<BackendEventBatch>();
      eventWaiters.push(d);
      schedulePoll(POLL_BUSY_MS);
      return d.promise;
    },

    postUserEvent(tag: number, payload: Uint8Array): void {
      if (disposed) throw new Error("NodeBackend(inline): disposed");
      if (fatal !== null) throw fatal;
      if (!started || engineId === null || native === null)
        throw new Error("NodeBackend(inline): not started");
      if (stopRequested) throw new Error("NodeBackend(inline): stopped");
      const rc = native.enginePostUserEvent(engineId, tag, payload);
      if (rc < 0) {
        throw new ZrUiError(
          "ZRUI_BACKEND_ERROR",
          `engine_post_user_event failed: code=${String(rc)}`,
        );
      }
    },

    async getCaps(): Promise<TerminalCaps> {
      if (disposed) throw new Error("NodeBackend(inline): disposed");
      if (fatal !== null) throw fatal;
      if (cachedCaps !== null) return cachedCaps;
      if (!started || engineId === null || native === null) return DEFAULT_TERMINAL_CAPS;
      const caps = native.engineGetCaps(engineId);
      const nextCaps: TerminalCaps = Object.freeze({
        colorMode: caps.colorMode as TerminalCaps["colorMode"],
        supportsMouse: caps.supportsMouse,
        supportsBracketedPaste: caps.supportsBracketedPaste,
        supportsFocusEvents: caps.supportsFocusEvents,
        supportsOsc52: caps.supportsOsc52,
        supportsSyncUpdate: caps.supportsSyncUpdate,
        supportsScrollRegion: caps.supportsScrollRegion,
        supportsCursorShape: caps.supportsCursorShape,
        supportsOutputWaitWritable: caps.supportsOutputWaitWritable,
        supportsUnderlineStyles: caps.supportsUnderlineStyles ?? false,
        supportsColoredUnderlines: caps.supportsColoredUnderlines ?? false,
        supportsHyperlinks: caps.supportsHyperlinks ?? false,
        sgrAttrsSupported: caps.sgrAttrsSupported,
      });
      cachedCaps = nextCaps;
      return nextCaps;
    },

    async getTerminalProfile(): Promise<TerminalProfile> {
      const caps = await backend.getCaps();
      return terminalProfileFromNodeEnv(caps);
    },
  };

  const debug: DebugBackend = {
    debugEnable: async (config: DebugConfig) => {
      await backend.start();
      if (native === null || engineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
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
      const rc = dbg.engineDebugEnable(engineId, configWire);
      if (rc < 0) {
        throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugEnable failed: code=${String(rc)}`);
      }
    },
    debugDisable: async () => {
      await backend.start();
      if (native === null || engineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
      const rc = dbg.engineDebugDisable(engineId);
      if (rc < 0) {
        throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugDisable failed: code=${String(rc)}`);
      }
    },
    debugQuery: async (query: DebugQuery) => {
      await backend.start();
      if (native === null || engineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
      const maxRecordsRaw =
        query.maxRecords === undefined ? DEBUG_QUERY_DEFAULT_RECORDS : query.maxRecords;
      const maxRecords = parsePositiveIntOr(maxRecordsRaw, DEBUG_QUERY_DEFAULT_RECORDS);
      const clampedMaxRecords = Math.min(DEBUG_QUERY_MAX_RECORDS, maxRecords);
      const queryWire = {
        ...(query.minRecordId !== undefined ? { minRecordId: query.minRecordId.toString() } : {}),
        ...(query.maxRecordId !== undefined ? { maxRecordId: query.maxRecordId.toString() } : {}),
        ...(query.categoryMask !== undefined ? { categoryMask: query.categoryMask } : {}),
        ...(query.minSeverity !== undefined
          ? { minSeverity: severityToNum(query.minSeverity) }
          : {}),
        maxRecords: clampedMaxRecords,
      };
      const headersCap = Math.max(1, clampedMaxRecords) * 40;
      const outHeaders = new Uint8Array(headersCap);
      const result = dbg.engineDebugQuery(engineId, queryWire, outHeaders);
      const headers = outHeaders.subarray(0, result.recordsReturned * 40);
      const wireResult: DebugQueryResult = {
        recordsReturned: result.recordsReturned,
        recordsAvailable: result.recordsAvailable,
        oldestRecordId: result.oldestRecordId,
        newestRecordId: result.newestRecordId,
        recordsDropped: result.recordsDropped,
      };
      return { headers, result: wireResult };
    },
    debugGetPayload: async (recordId: bigint) => {
      await backend.start();
      const activeEngineId = engineId;
      if (native === null || activeEngineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
      return readDebugBytesWithRetry(
        (out) => dbg.engineDebugGetPayload(activeEngineId, recordId, out),
        maxEventBytes,
        null,
        "engineDebugGetPayload",
      );
    },
    debugGetStats: async () => {
      await backend.start();
      if (native === null || engineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
      const s = dbg.engineDebugGetStats(engineId);
      const out: DebugStats = {
        totalRecords: s.totalRecords,
        totalDropped: s.totalDropped,
        errorCount: s.errorCount,
        warnCount: s.warnCount,
        currentRingUsage: s.currentRingUsage,
        ringCapacity: s.ringCapacity,
      };
      return out;
    },
    debugExport: async () => {
      await backend.start();
      const activeEngineId = engineId;
      if (native === null || activeEngineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
      return readDebugBytesWithRetry(
        (out) => dbg.engineDebugExport(activeEngineId, out),
        maxEventBytes,
        new Uint8Array(0),
        "engineDebugExport",
      );
    },
    debugReset: async () => {
      await backend.start();
      if (native === null || engineId === null) {
        throw new Error("NodeBackend(inline): engine not started");
      }
      const dbg = ensureDebugApiLoaded(native);
      const rc = dbg.engineDebugReset(engineId);
      if (rc < 0) {
        throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugReset failed: code=${String(rc)}`);
      }
    },
  };

  const perf = {
    perfSnapshot: async (): Promise<NodeBackendPerfSnapshot> => perfSnapshot(),
  };

  const out = { ...backend, debug, perf } as NodeBackend &
    Record<
      | typeof BACKEND_DRAWLIST_VERSION_MARKER
      | typeof BACKEND_MAX_EVENT_BYTES_MARKER
      | typeof BACKEND_FPS_CAP_MARKER
      | typeof BACKEND_RAW_WRITE_MARKER,
      boolean | number | BackendRawWrite
    >;
  Object.defineProperties(out, {
    [BACKEND_DRAWLIST_VERSION_MARKER]: {
      value: requestedDrawlistVersion,
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
    [BACKEND_RAW_WRITE_MARKER]: {
      value: ((text: string): void => {
        if (typeof text !== "string" || text.length === 0) return;
        try {
          process.stdout.write(text);
        } catch {
          // Preserve backend determinism: clipboard write failures are non-fatal.
        }
      }) satisfies BackendRawWrite,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });
  return Object.freeze(out);
}
