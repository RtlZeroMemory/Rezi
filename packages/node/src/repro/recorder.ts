import { performance } from "node:perf_hooks";
import {
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  type BackendEventBatch,
  REPRO_BUNDLE_SCHEMA_V1,
  REPRO_EVENT_CAPTURE_ORDERING_POLL,
  REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS,
  REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
  REPRO_TIMING_CLOCK_MONOTONIC_MS,
  REPRO_TIMING_MODEL_KIND_DETERMINISTIC,
  REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA,
  REPRO_TIMING_UNIT_MS,
  type ReproBundleV1,
  type ReproEventCapture,
  type ReproEventCaptureBounds,
  type ReproEventCaptureTruncationReason,
  type ReproRecordedEventBatch,
  type ReproRecordedResizeEvent,
  type RuntimeBackend,
  type TerminalCaps,
  exportReproBundleBytes,
  parseEventBatchV1,
} from "@rezi-ui/core";

const DEFAULT_MAX_BATCHES = 256;
const DEFAULT_MAX_EVENTS = 8192;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_EVENT_BYTES = 1024 * 1024;
const DEFAULT_FPS_CAP = 60;

export type ReproRecorderBounds = Readonly<{
  maxBatches?: number;
  maxEvents?: number;
  maxBytes?: number;
}>;

export type ReproRecorderBackendCapsOverrides = Readonly<{
  maxEventBytes?: number;
  fpsCap?: number;
}>;

export type CreateReproRecorderOptions = Readonly<{
  bounds?: ReproRecorderBounds;
  backendCaps?: ReproRecorderBackendCapsOverrides;
  terminalCaps?: TerminalCaps | null;
  clock?: () => number;
}>;

export type ReproRecorderBuildResult = Readonly<{
  bundle: ReproBundleV1;
  bytes: Uint8Array;
}>;

export type ReproRecorder = Readonly<{
  backend: RuntimeBackend;
  buildBundle: () => Promise<ReproBundleV1>;
  buildBytes: () => Promise<Uint8Array>;
  build: () => Promise<ReproRecorderBuildResult>;
  snapshot: () => ReproEventCapture;
  reset: () => void;
}>;

type MutableRecorderState = {
  readonly batches: ReproRecordedEventBatch[];
  capturedBatches: number;
  capturedEvents: number;
  capturedBytes: number;
  omittedBatches: number;
  omittedEvents: number;
  omittedBytes: number;
  runtimeDroppedBatches: number;
  truncated: boolean;
  truncationReason: ReproEventCaptureTruncationReason | null;
  firstOmittedStep: number | null;
  baseTimeMs: number | null;
  lastCapturedTimeMs: number | null;
};

function normalizeNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isInteger(value)) return fallback;
  if (value < 0) return fallback;
  return value;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isInteger(value)) return fallback;
  if (value <= 0) return fallback;
  return value;
}

function normalizeClockSample(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const floored = Math.floor(value);
  if (floored < 0) return 0;
  return floored;
}

function toLowerHex(bytes: Uint8Array): string {
  const out = new Array<string>(bytes.byteLength);
  for (let i = 0; i < bytes.byteLength; i++) {
    out[i] = bytes[i]?.toString(16).padStart(2, "0") ?? "00";
  }
  return out.join("");
}

function cloneTerminalCaps(caps: TerminalCaps | null): TerminalCaps | null {
  if (caps === null) return null;
  return {
    colorMode: caps.colorMode,
    supportsMouse: caps.supportsMouse,
    supportsBracketedPaste: caps.supportsBracketedPaste,
    supportsFocusEvents: caps.supportsFocusEvents,
    supportsOsc52: caps.supportsOsc52,
    supportsSyncUpdate: caps.supportsSyncUpdate,
    supportsScrollRegion: caps.supportsScrollRegion,
    supportsCursorShape: caps.supportsCursorShape,
    supportsOutputWaitWritable: caps.supportsOutputWaitWritable,
    supportsUnderlineStyles: caps.supportsUnderlineStyles,
    supportsColoredUnderlines: caps.supportsColoredUnderlines,
    supportsHyperlinks: caps.supportsHyperlinks,
    sgrAttrsSupported: caps.sgrAttrsSupported,
  };
}

function buildBackendCapsSnapshot(
  backend: RuntimeBackend,
  bounds: ReproEventCaptureBounds,
  overrides: ReproRecorderBackendCapsOverrides | undefined,
): ReproBundleV1["capsSnapshot"]["backendCaps"] {
  const rec = backend as unknown as Record<string, unknown>;

  const markerMaxEventBytes = rec[BACKEND_MAX_EVENT_BYTES_MARKER];
  const markerFpsCap = rec[BACKEND_FPS_CAP_MARKER];

  const maxEventBytes = normalizePositiveInteger(
    overrides?.maxEventBytes ?? markerMaxEventBytes,
    bounds.maxBytes > 0 ? bounds.maxBytes : DEFAULT_MAX_EVENT_BYTES,
  );
  const fpsCap = normalizePositiveInteger(overrides?.fpsCap ?? markerFpsCap, DEFAULT_FPS_CAP);

  const cursorProtocolVersion = 2;

  return {
    maxEventBytes,
    fpsCap,
    cursorProtocolVersion,
  };
}

function createMutableState(): MutableRecorderState {
  return {
    batches: [],
    capturedBatches: 0,
    capturedEvents: 0,
    capturedBytes: 0,
    omittedBatches: 0,
    omittedEvents: 0,
    omittedBytes: 0,
    runtimeDroppedBatches: 0,
    truncated: false,
    truncationReason: null,
    firstOmittedStep: null,
    baseTimeMs: null,
    lastCapturedTimeMs: null,
  };
}

function buildEventCaptureSnapshot(
  state: MutableRecorderState,
  bounds: ReproEventCaptureBounds,
): ReproEventCapture {
  return {
    ordering: REPRO_EVENT_CAPTURE_ORDERING_POLL,
    timing: REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS,
    bounds: {
      maxBatches: bounds.maxBatches,
      maxEvents: bounds.maxEvents,
      maxBytes: bounds.maxBytes,
    },
    totals: {
      capturedBatches: state.capturedBatches,
      capturedEvents: state.capturedEvents,
      capturedBytes: state.capturedBytes,
      runtimeDroppedBatches: state.runtimeDroppedBatches,
      omittedBatches: state.omittedBatches,
      omittedEvents: state.omittedEvents,
      omittedBytes: state.omittedBytes,
    },
    truncation: {
      mode: REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
      truncated: state.truncated,
      reason: state.truncationReason,
      firstOmittedStep: state.firstOmittedStep,
    },
    batches: state.batches.slice(),
  };
}

function parseBatchMetadata(bytes: Uint8Array): Readonly<{
  eventCount: number;
  resizeEvents: readonly ReproRecordedResizeEvent[];
}> {
  const parsed = parseEventBatchV1(bytes);
  if (!parsed.ok) {
    return {
      eventCount: 0,
      resizeEvents: [],
    };
  }

  const events = parsed.value.events;
  const resizeEvents: ReproRecordedResizeEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event?.kind !== "resize") continue;
    resizeEvents.push({
      eventIndex: i,
      cols: event.cols,
      rows: event.rows,
      timeMs: normalizeClockSample(event.timeMs),
    });
  }

  return {
    eventCount: events.length,
    resizeEvents,
  };
}

function copyBatchBytes(batch: BackendEventBatch): Uint8Array {
  const out = new Uint8Array(batch.bytes.byteLength);
  out.set(batch.bytes);
  return out;
}

export function createReproRecorder(
  backend: RuntimeBackend,
  options: CreateReproRecorderOptions = {},
): ReproRecorder {
  const bounds: ReproEventCaptureBounds = {
    maxBatches: normalizeNonNegativeInteger(options.bounds?.maxBatches, DEFAULT_MAX_BATCHES),
    maxEvents: normalizeNonNegativeInteger(options.bounds?.maxEvents, DEFAULT_MAX_EVENTS),
    maxBytes: normalizeNonNegativeInteger(options.bounds?.maxBytes, DEFAULT_MAX_BYTES),
  };

  const backendCaps = buildBackendCapsSnapshot(backend, bounds, options.backendCaps);
  const now = options.clock ?? (() => performance.now());
  let cachedTerminalCaps: TerminalCaps | null | undefined =
    options.terminalCaps !== undefined ? cloneTerminalCaps(options.terminalCaps) : undefined;

  const state = createMutableState();
  const originalPollEvents = backend.pollEvents.bind(backend);
  const originalGetCaps = backend.getCaps.bind(backend);

  async function resolveTerminalCaps(): Promise<TerminalCaps | null> {
    if (cachedTerminalCaps !== undefined) {
      return cloneTerminalCaps(cachedTerminalCaps);
    }
    try {
      const caps = await originalGetCaps();
      cachedTerminalCaps = cloneTerminalCaps(caps);
      return cloneTerminalCaps(cachedTerminalCaps);
    } catch {
      cachedTerminalCaps = null;
      return null;
    }
  }

  function appendOmittedBatch(eventCount: number, byteLength: number): void {
    state.omittedBatches += 1;
    state.omittedEvents += eventCount;
    state.omittedBytes += byteLength;
  }

  function markTruncated(reason: ReproEventCaptureTruncationReason): void {
    if (state.truncated) return;
    state.truncated = true;
    state.truncationReason = reason;
    state.firstOmittedStep = state.capturedBatches;
  }

  function recordCapturedBatch(
    byteLength: number,
    bytesHex: string,
    droppedBatches: number,
    eventCount: number,
    resizeEvents: readonly ReproRecordedResizeEvent[],
  ): void {
    const nowMs = normalizeClockSample(now());
    if (state.baseTimeMs === null) {
      state.baseTimeMs = nowMs;
    }
    const deltaMs =
      state.lastCapturedTimeMs === null ? 0 : Math.max(0, nowMs - state.lastCapturedTimeMs);
    state.lastCapturedTimeMs = nowMs;

    state.batches.push({
      step: state.capturedBatches,
      deltaMs,
      byteLength,
      bytesHex,
      eventCount,
      droppedBatches,
      resizeEvents: resizeEvents.slice(),
    });
    state.capturedBatches += 1;
    state.capturedEvents += eventCount;
    state.capturedBytes += byteLength;
  }

  function observeBatch(bytes: Uint8Array, droppedBatches: number): void {
    const byteLength = bytes.byteLength;
    const { eventCount, resizeEvents } = parseBatchMetadata(bytes);

    state.runtimeDroppedBatches += droppedBatches;

    if (state.truncated) {
      appendOmittedBatch(eventCount, byteLength);
      return;
    }

    if (state.capturedBatches >= bounds.maxBatches) {
      markTruncated("max-batches");
      appendOmittedBatch(eventCount, byteLength);
      return;
    }
    if (state.capturedEvents + eventCount > bounds.maxEvents) {
      markTruncated("max-events");
      appendOmittedBatch(eventCount, byteLength);
      return;
    }
    if (state.capturedBytes + byteLength > bounds.maxBytes) {
      markTruncated("max-bytes");
      appendOmittedBatch(eventCount, byteLength);
      return;
    }

    recordCapturedBatch(byteLength, toLowerHex(bytes), droppedBatches, eventCount, resizeEvents);
  }

  const wrapped = Object.create(Object.getPrototypeOf(backend)) as RuntimeBackend;
  Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(backend));
  Object.defineProperties(wrapped, {
    pollEvents: {
      value: async (): Promise<BackendEventBatch> => {
        const batch = await originalPollEvents();
        observeBatch(copyBatchBytes(batch), batch.droppedBatches);
        return batch;
      },
      writable: false,
      enumerable: true,
      configurable: true,
    },
    getCaps: {
      value: async (): Promise<TerminalCaps> => {
        const caps = await originalGetCaps();
        cachedTerminalCaps = cloneTerminalCaps(caps);
        return caps;
      },
      writable: false,
      enumerable: true,
      configurable: true,
    },
  });

  async function buildBundle(): Promise<ReproBundleV1> {
    const terminalCaps = await resolveTerminalCaps();
    const eventCapture = buildEventCaptureSnapshot(state, bounds);

    return {
      schema: REPRO_BUNDLE_SCHEMA_V1,
      captureConfig: {
        captureRawEvents: true,
        captureDrawlistBytes: false,
        maxEventBytes: backendCaps.maxEventBytes,
        maxDrawlistBytes: 0,
        maxFrames: bounds.maxBatches,
        fpsCap: backendCaps.fpsCap,
        cursorProtocolVersion: backendCaps.cursorProtocolVersion,
      },
      capsSnapshot: {
        terminalCaps,
        backendCaps,
      },
      timingModel: {
        kind: REPRO_TIMING_MODEL_KIND_DETERMINISTIC,
        clock: REPRO_TIMING_CLOCK_MONOTONIC_MS,
        replayStrategy: REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA,
        timeUnit: REPRO_TIMING_UNIT_MS,
        baseTimeMs: state.baseTimeMs ?? 0,
      },
      eventCapture,
    };
  }

  async function buildBytes(): Promise<Uint8Array> {
    return exportReproBundleBytes(await buildBundle());
  }

  async function build(): Promise<ReproRecorderBuildResult> {
    const bundle = await buildBundle();
    return {
      bundle,
      bytes: exportReproBundleBytes(bundle),
    };
  }

  function reset(): void {
    state.batches.length = 0;
    state.capturedBatches = 0;
    state.capturedEvents = 0;
    state.capturedBytes = 0;
    state.omittedBatches = 0;
    state.omittedEvents = 0;
    state.omittedBytes = 0;
    state.runtimeDroppedBatches = 0;
    state.truncated = false;
    state.truncationReason = null;
    state.firstOmittedStep = null;
    state.baseTimeMs = null;
    state.lastCapturedTimeMs = null;
  }

  return {
    backend: wrapped,
    buildBundle,
    buildBytes,
    build,
    snapshot: () => buildEventCaptureSnapshot(state, bounds),
    reset,
  };
}
