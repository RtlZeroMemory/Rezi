/**
 * packages/core/src/repro/constants.ts - Repro bundle schema constants.
 *
 * Why: Keep all wire-format literals centralized so schema/version checks stay
 * strict and deterministic across parse + export helpers.
 */

/** Stable schema identifier for record/replay bundles. */
export const REPRO_BUNDLE_SCHEMA_V1 = "rezi-repro-v1";

/** Timing model kind used by v1 bundles. */
export const REPRO_TIMING_MODEL_KIND_DETERMINISTIC = "deterministic";

/** Clock metadata used by v1 deterministic timing model. */
export const REPRO_TIMING_CLOCK_MONOTONIC_MS = "monotonic-ms";

/** Replay strategy metadata used by v1 deterministic timing model. */
export const REPRO_TIMING_REPLAY_STRATEGY_RECORDED_DELTA = "recorded-delta";

/** Time unit metadata used by v1 deterministic timing model. */
export const REPRO_TIMING_UNIT_MS = "ms";

/** Deterministic ordering metadata for captured backend event batches. */
export const REPRO_EVENT_CAPTURE_ORDERING_POLL = "poll-order";
/** Deterministic timing metadata for captured backend event batches. */
export const REPRO_EVENT_CAPTURE_TIMING_STEP_DELTA_MS = "step-delta-ms";
/** Truncation mode used by bounded event-capture bundles. */
export const REPRO_EVENT_CAPTURE_TRUNCATION_MODE_DROP_TAIL_BATCH = "drop-tail-batch";
