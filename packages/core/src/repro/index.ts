/**
 * packages/core/src/repro/index.ts - Record/replay schema public exports.
 */

export {
  REPRO_BUNDLE_SCHEMA_V1,
  REPRO_EVENT_CAPTURE_ORDERING_POLL,
  REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS,
  REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH,
  REPRO_TIMING_CLOCK_MONOTONIC_MS,
  REPRO_TIMING_MODEL_KIND_DETERMINISTIC,
  REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA,
  REPRO_TIMING_UNIT_MS,
} from "./constants.js";

export type {
  ReproBundle,
  ReproBundleSchema,
  ReproBundleV1,
  ReproCapsSnapshot,
  ReproCaptureConfig,
  ReproBackendCapsSnapshot,
  ReproEventCapture,
  ReproEventCaptureBounds,
  ReproEventCaptureOrdering,
  ReproEventCaptureTiming,
  ReproEventCaptureTotals,
  ReproEventCaptureTruncation,
  ReproEventCaptureTruncationMode,
  ReproEventCaptureTruncationReason,
  ReproParseError,
  ReproParseErrorCode,
  ReproParseResult,
  ReproRecordedEventBatch,
  ReproRecordedResizeEvent,
  ReproTimingClock,
  ReproTimingModelKind,
  ReproTimingModelMetadata,
  ReproTimingReplayStrategy,
  ReproTimingUnit,
} from "./types.js";

export {
  isReproBundle,
  parseReproBundle,
  parseReproBundleBytes,
  parseReproBundleJson,
  validateReproBundle,
} from "./schema.js";

export { exportReproBundleBytes, serializeReproBundleStable } from "./stable.js";

export { createReproReplayDriver, runReproReplayHarness } from "./replay.js";
export type {
  ReproReplayDriver,
  ReproReplayDriverOptions,
  ReproReplayDriverState,
  ReproReplayDriverStepResult,
  ReproReplayExpectedAction,
  ReproReplayFatal,
  ReproReplayHarnessOptions,
  ReproReplayHarnessResult,
  ReproReplayInvariantExpectations,
  ReproReplayMismatch,
  ReproReplayMismatchCode,
  ReproReplayObservedAction,
  ReproReplayOverrun,
  ReproReplayRunResult,
  ReproReplayViewport,
} from "./replay.js";
