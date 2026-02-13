/**
 * packages/core/src/debug/index.ts — Debug trace system public exports.
 *
 * Why: Provides a clean public API for the debug trace system. All debug
 * functionality should be imported from this module.
 *
 * @example
 * ```ts
 * import {
 *   createDebugController,
 *   type DebugConfig,
 *   type DebugController,
 * } from "@rezi-ui/core/debug";
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export type {
  DebugBundle,
  DebugBundleBounds,
  DebugBundleCaptureFlags,
  DebugBundleExportOptions,
  DebugBundleFrameSummary,
  DebugBundleHeader,
  DebugBundlePayloadOmittedReason,
  DebugBundlePayloadSnapshot,
  DebugBundleQueryWindow,
  DebugBundleSchema,
  DebugBundleStatsSnapshot,
  DebugBundleTraceRecord,
  DebugCategory,
  DebugConfig,
  DebugParseError,
  DebugParseErrorCode,
  DebugParseResult,
  DebugPayload,
  DebugQuery,
  DebugQueryResult,
  DebugRecord,
  DebugRecordHeader,
  DebugSeverity,
  DebugStats,
  DrawlistBytesPayload,
  DrawlistRecord,
  ErrorRecord,
  EventRecord,
  FrameRecord,
  PerfPhase,
  PerfRecord,
} from "./types.js";

// =============================================================================
// Constants
// =============================================================================

export {
  // Category constants
  DEBUG_CAT_ALL,
  DEBUG_CAT_DRAWLIST,
  DEBUG_CAT_ERROR,
  DEBUG_CAT_EVENT,
  DEBUG_CAT_FRAME,
  DEBUG_CAT_NONE,
  DEBUG_CAT_PERF,
  DEBUG_CAT_STATE,
  // Severity constants
  DEBUG_SEV_ERROR,
  DEBUG_SEV_INFO,
  DEBUG_SEV_TRACE,
  DEBUG_SEV_WARN,
  // Size constants
  DEBUG_BUNDLE_DEFAULT_MAX_PAYLOAD_BYTES,
  DEBUG_BUNDLE_DEFAULT_MAX_RECORDS,
  DEBUG_BUNDLE_DEFAULT_MAX_RECENT_FRAMES,
  DEBUG_BUNDLE_DEFAULT_MAX_TOTAL_PAYLOAD_BYTES,
  DEBUG_BUNDLE_SCHEMA_V1,
  DEBUG_CONFIG_SIZE,
  DEBUG_DRAWLIST_RECORD_SIZE,
  DEBUG_ERROR_RECORD_SIZE,
  DEBUG_EVENT_RECORD_SIZE,
  DEBUG_FRAME_RECORD_SIZE,
  DEBUG_PERF_RECORD_SIZE,
  DEBUG_QUERY_RESULT_SIZE,
  DEBUG_QUERY_SIZE,
  DEBUG_RECORD_HEADER_SIZE,
  DEBUG_STATS_SIZE,
  // Perf phase constants
  PERF_PHASE_POLL,
  PERF_PHASE_PRESENT,
  PERF_PHASE_SUBMIT,
  // Mapping functions
  categoriesToMask,
  categoryFromNum,
  categoryToNum,
  isCategoryInMask,
  maskToCategories,
  perfPhaseFromNum,
  severityFromNum,
  severityToNum,
} from "./constants.js";

// =============================================================================
// Parsers
// =============================================================================

export {
  parseDrawlistRecord,
  parseErrorRecord,
  parseEventRecord,
  parseFrameRecord,
  parsePayload,
  parsePerfRecord,
  parseQueryResult,
  parseRecordHeader,
  parseStats,
} from "./parsers.js";

// =============================================================================
// Debug Controller
// =============================================================================

export {
  createDebugController,
  type CreateDebugControllerOptions,
  type DebugBackend,
  type DebugController,
  type DebugErrorHandler,
  type DebugEventType,
  type DebugRecordHandler,
} from "./debugController.js";

// =============================================================================
// Frame Inspector
// =============================================================================

export {
  createFrameInspector,
  type FrameDiff,
  type FrameFieldChange,
  type FrameInspector,
  type FrameSnapshot,
} from "./frameInspector.js";

// =============================================================================
// Event Trace
// =============================================================================

export {
  createEventTrace,
  type EventTrace,
  type EventTraceFilter,
  type EventTraceRecord,
} from "./eventTrace.js";

// =============================================================================
// Error Aggregator
// =============================================================================

export {
  createErrorAggregator,
  type AggregatedError,
  type ErrorAggregator,
  type ErrorHandler,
} from "./errorAggregator.js";

// =============================================================================
// State Timeline
// =============================================================================

export {
  createStateTimeline,
  diffState,
  type StateChange,
  type StateTimeline,
} from "./stateTimeline.js";

// =============================================================================
// UI Helpers
// =============================================================================

export { debug, inspect } from "./debug.js";
