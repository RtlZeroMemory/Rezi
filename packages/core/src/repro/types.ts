/**
 * packages/core/src/repro/types.ts - Record/replay schema and parse types.
 *
 * Why: Defines the versioned repro bundle contract consumed by parse/validate
 * helpers and deterministic export utilities.
 */

import type { TerminalCaps } from "../terminalCaps.js";

/** Stable schema identifier for record/replay bundles. */
export type ReproBundleSchema = "rezi-repro-v1";

/**
 * Capture configuration snapshot stored in the bundle.
 * These fields describe what was captured and the capture bounds.
 */
export type ReproCaptureConfig = Readonly<{
  captureRawEvents: boolean;
  captureDrawlistBytes: boolean;
  maxEventBytes: number;
  maxDrawlistBytes: number;
  maxFrames: number;
  fpsCap: number;
  cursorProtocolVersion: 2;
}>;

/**
 * Backend/runtime caps that influence deterministic replay behavior.
 */
export type ReproBackendCapsSnapshot = Readonly<{
  maxEventBytes: number;
  fpsCap: number;
  cursorProtocolVersion: 2;
}>;

/**
 * Capability snapshot captured with the recording.
 */
export type ReproCapsSnapshot = Readonly<{
  terminalCaps: TerminalCaps | null;
  backendCaps: ReproBackendCapsSnapshot;
}>;

/** Timing model kind for deterministic replay. */
export type ReproTimingModelKind = "deterministic";

/** Clock name used for deterministic replay timing metadata. */
export type ReproTimingClock = "monotonic-ms";

/** Replay strategy used to apply recorded timing. */
export type ReproTimingReplayStrategy = "recorded-delta";

/** Time unit used by timing metadata. */
export type ReproTimingUnit = "ms";

/**
 * Deterministic timing model metadata required by v1 schema.
 */
export type ReproTimingModelMetadata = Readonly<{
  kind: ReproTimingModelKind;
  clock: ReproTimingClock;
  replayStrategy: ReproTimingReplayStrategy;
  timeUnit: ReproTimingUnit;
  baseTimeMs: number;
}>;

/**
 * Versioned record/replay bundle schema (v1).
 */
export type ReproBundleV1 = Readonly<{
  schema: "rezi-repro-v1";
  captureConfig: ReproCaptureConfig;
  capsSnapshot: ReproCapsSnapshot;
  timingModel: ReproTimingModelMetadata;
  eventCapture: ReproEventCapture;
}>;

/** Deterministic ordering strategy for captured backend event batches. */
export type ReproEventCaptureOrdering = "poll-order";
/** Deterministic timing strategy for captured backend event batches. */
export type ReproEventCaptureTiming = "step-delta-ms";
/** Explicit truncation mode for bounded event capture. */
export type ReproEventCaptureTruncationMode = "drop-tail-batch";
/** Deterministic truncation reason for bounded event capture. */
export type ReproEventCaptureTruncationReason = "max-batches" | "max-events" | "max-bytes";

/** Resize metadata extracted from a captured event batch. */
export type ReproRecordedResizeEvent = Readonly<{
  eventIndex: number;
  cols: number;
  rows: number;
  timeMs: number;
}>;

/** Deterministic recorded backend event batch payload + timing metadata. */
export type ReproRecordedEventBatch = Readonly<{
  step: number;
  deltaMs: number;
  byteLength: number;
  bytesHex: string;
  eventCount: number;
  droppedBatches: number;
  resizeEvents: readonly ReproRecordedResizeEvent[];
}>;

/** Bounds used while recording backend event batches. */
export type ReproEventCaptureBounds = Readonly<{
  maxBatches: number;
  maxEvents: number;
  maxBytes: number;
}>;

/** Capture totals included with deterministic truncation metadata. */
export type ReproEventCaptureTotals = Readonly<{
  capturedBatches: number;
  capturedEvents: number;
  capturedBytes: number;
  runtimeDroppedBatches: number;
  omittedBatches: number;
  omittedEvents: number;
  omittedBytes: number;
}>;

/** Explicit truncation metadata for deterministic bounded capture. */
export type ReproEventCaptureTruncation = Readonly<{
  mode: ReproEventCaptureTruncationMode;
  truncated: boolean;
  reason: ReproEventCaptureTruncationReason | null;
  firstOmittedStep: number | null;
}>;

/** Event-capture payload added by schema v2 bundles. */
export type ReproEventCapture = Readonly<{
  ordering: ReproEventCaptureOrdering;
  timing: ReproEventCaptureTiming;
  bounds: ReproEventCaptureBounds;
  totals: ReproEventCaptureTotals;
  truncation: ReproEventCaptureTruncation;
  batches: readonly ReproRecordedEventBatch[];
}>;

/** Current supported repro bundle union. */
export type ReproBundle = ReproBundleV1;

/** Parse/validation error codes for repro schema helpers. */
export type ReproParseErrorCode =
  | "ZR_REPRO_INVALID_JSON"
  | "ZR_REPRO_INVALID_SCHEMA"
  | "ZR_REPRO_UNSUPPORTED_VERSION"
  | "ZR_REPRO_INVALID_BUNDLE"
  | "ZR_REPRO_UNKNOWN_FIELD";

/** Structured parse/validation error with JSON path. */
export type ReproParseError = Readonly<{
  code: ReproParseErrorCode;
  path: string;
  detail: string;
}>;

/** Discriminated parse result for repro schema helpers. */
export type ReproParseResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ReproParseError }>;
