/**
 * packages/core/src/debug/types.ts — Debug trace type definitions.
 *
 * Why: Defines TypeScript representations of the Zireael C engine's debug trace
 * structures. These types form the contract between the binary parsers and the
 * debug controller, ensuring type-safe handling of debug records.
 *
 * C structures reference: include/zr/zr_debug.h
 *
 * @see docs/guide/debugging.md
 */

import type { TerminalCaps } from "../terminalCaps.js";

/**
 * Debug record categories matching zr_debug_category_t.
 *
 * Categories:
 *   - none (0): Unspecified category
 *   - frame (1): Frame lifecycle (submit, present)
 *   - event (2): Event processing (poll, parse, route)
 *   - drawlist (3): Drawlist validation and execution
 *   - error (4): Errors and warnings
 *   - state (5): State transitions
 *   - perf (6): Performance measurements
 */
export type DebugCategory = "none" | "frame" | "event" | "drawlist" | "error" | "state" | "perf";

/**
 * Debug severity levels matching zr_debug_severity_t.
 *
 * Severity levels (low to high):
 *   - trace (0): Verbose tracing (disabled by default)
 *   - info (1): Informational (frame boundaries, etc.)
 *   - warn (2): Warnings (recoverable issues)
 *   - error (3): Errors (operation failed)
 */
export type DebugSeverity = "trace" | "info" | "warn" | "error";

/**
 * Debug record header (common to all record types).
 * Matches zr_debug_record_header_t (40 bytes).
 *
 * Layout:
 *   - record_id: u64 (bytes 0-7) - Monotonic record counter
 *   - timestamp_us: u64 (bytes 8-15) - Microseconds since engine creation
 *   - frame_id: u64 (bytes 16-23) - Associated frame (0 if not applicable)
 *   - category: u32 (bytes 24-27) - zr_debug_category_t
 *   - severity: u32 (bytes 28-31) - zr_debug_severity_t
 *   - code: u32 (bytes 32-35) - Subsystem-specific code
 *   - payload_size: u32 (bytes 36-39) - Size of payload following header
 */
export type DebugRecordHeader = Readonly<{
  recordId: bigint;
  timestampUs: bigint;
  frameId: bigint;
  category: DebugCategory;
  severity: DebugSeverity;
  code: number;
  payloadSize: number;
}>;

/**
 * Frame record payload — captures per-frame diagnostics.
 * Matches zr_debug_frame_record_t (56 bytes).
 *
 * Why: Enables frame-by-frame comparison to identify rendering regressions.
 */
export type FrameRecord = Readonly<{
  frameId: bigint;
  cols: number;
  rows: number;
  drawlistBytes: number;
  drawlistCmds: number;
  diffBytesEmitted: number;
  dirtyLines: number;
  dirtyCells: number;
  damageRects: number;
  usDrawlist: number;
  usDiff: number;
  usWrite: number;
}>;

/**
 * Event record payload — captures event processing details.
 * Matches zr_debug_event_record_t (32 bytes).
 *
 * Why: Enables tracing of event flow from terminal input to handler dispatch.
 */
export type EventRecord = Readonly<{
  frameId: bigint;
  eventType: number;
  eventFlags: number;
  timeMs: number;
  rawBytesLen: number;
  parseResult: number;
}>;

/**
 * Drawlist bytes payload — raw drawlist bytes captured by the engine.
 *
 * Note: When captureDrawlistBytes is enabled, the engine may emit a drawlist
 * record whose payload is the raw drawlist byte stream rather than a fixed
 * zr_debug_drawlist_record_t structure.
 */
export type DrawlistBytesPayload = Readonly<{
  kind: "drawlistBytes";
  bytes: Uint8Array;
}>;

/**
 * Error record payload — captures error context for diagnostics.
 * Matches zr_debug_error_record_t (120 bytes).
 *
 * Why: Aggregates errors with context for post-mortem analysis.
 */
export type ErrorRecord = Readonly<{
  frameId: bigint;
  errorCode: number;
  sourceLine: number;
  occurrenceCount: number;
  sourceFile: string;
  message: string;
}>;

/**
 * Drawlist record payload — captures drawlist execution details.
 * Matches zr_debug_drawlist_record_t (48 bytes).
 *
 * Why: Enables verification of drawlist commands and their effects.
 */
export type DrawlistRecord = Readonly<{
  frameId: bigint;
  totalBytes: number;
  cmdCount: number;
  version: number;
  validationResult: number;
  executionResult: number;
  clipStackMaxDepth: number;
  textRuns: number;
  fillRects: number;
}>;

/**
 * Performance record payload — captures timing measurements.
 * Matches zr_debug_perf_record_t (24 bytes).
 *
 * Why: Enables identification of performance bottlenecks.
 */
export type PerfRecord = Readonly<{
  frameId: bigint;
  phase: number;
  usElapsed: number;
  bytesProcessed: number;
}>;

/**
 * Union of all debug payload types.
 */
export type DebugPayload =
  | FrameRecord
  | EventRecord
  | ErrorRecord
  | DrawlistRecord
  | DrawlistBytesPayload
  | PerfRecord;

/**
 * Complete debug record with header and parsed payload.
 */
export type DebugRecord = Readonly<{
  header: DebugRecordHeader;
  payload: DebugPayload | null;
}>;

/**
 * Debug configuration for enabling/configuring tracing.
 * Matches zr_debug_config_t (32 bytes).
 *
 * Note: All fields except 'enabled' are optional and use engine defaults if omitted.
 */
export type DebugConfig = Readonly<{
  /** Master enable flag */
  enabled: boolean;
  /** Max records in ring buffer (0 = default) */
  ringCapacity?: number;
  /** Minimum severity to capture */
  minSeverity?: DebugSeverity;
  /** Bitmask of enabled categories */
  categoryMask?: number;
  /** Capture raw event bytes (0/1) */
  captureRawEvents?: boolean;
  /** Capture drawlist bytes (0/1) */
  captureDrawlistBytes?: boolean;
}>;

/**
 * Debug query filter for retrieving records.
 * Matches zr_debug_query_t (48 bytes).
 *
 * All fields are optional; unset fields don't filter.
 */
export type DebugQuery = Readonly<{
  /** Start at this record ID (0 = oldest) */
  minRecordId?: bigint;
  /** End at this record ID (0 = newest) */
  maxRecordId?: bigint;
  /** Filter by frame range start (0 = no filter) */
  minFrameId?: bigint;
  /** Filter by frame range end (0 = no filter) */
  maxFrameId?: bigint;
  /** Bitmask of categories to include */
  categoryMask?: number;
  /** Minimum severity to include */
  minSeverity?: DebugSeverity;
  /** Maximum records to return (0 = no limit) */
  maxRecords?: number;
}>;

/**
 * Debug query result with statistics.
 * Matches zr_debug_query_result_t (32 bytes).
 */
export type DebugQueryResult = Readonly<{
  /** Number of records returned */
  recordsReturned: number;
  /** Total matching records in buffer */
  recordsAvailable: number;
  /** Oldest record ID still in buffer */
  oldestRecordId: bigint;
  /** Newest record ID in buffer */
  newestRecordId: bigint;
  /** Records overwritten since last query */
  recordsDropped: number;
}>;

/**
 * Debug statistics snapshot.
 * Matches zr_debug_stats_t (32 bytes).
 *
 * Why: Provides aggregate counts for monitoring without querying individual records.
 */
export type DebugStats = Readonly<{
  /** Total records ever written */
  totalRecords: bigint;
  /** Records dropped due to ring overflow */
  totalDropped: bigint;
  /** Total error records */
  errorCount: number;
  /** Total warning records */
  warnCount: number;
  /** Records currently in ring */
  currentRingUsage: number;
  /** Ring buffer capacity */
  ringCapacity: number;
}>;

/**
 * Stable schema identifier for JSON debug bundles.
 */
export type DebugBundleSchema = "rezi-debug-bundle-v1";

/**
 * Debug record header shape used in exported bundles.
 * BigInt fields are serialized as decimal strings for JSON compatibility.
 */
export type DebugBundleHeader = Readonly<{
  recordId: string;
  timestampUs: string;
  frameId: string;
  category: DebugCategory;
  severity: DebugSeverity;
  code: number;
  payloadSize: number;
}>;

/**
 * Reasons a payload was intentionally omitted from a bundle.
 */
export type DebugBundlePayloadOmittedReason =
  | "capture-raw-events-disabled"
  | "capture-drawlist-bytes-disabled"
  | "payload-unavailable";

/**
 * Payload snapshot for a trace record inside an exported bundle.
 */
export type DebugBundlePayloadSnapshot =
  | Readonly<{
      included: true;
      encoding: "hex";
      data: string;
      bytesIncluded: number;
      bytesTotal: number;
      truncated: boolean;
    }>
  | Readonly<{
      included: false;
      reason: DebugBundlePayloadOmittedReason;
      bytesTotal: number;
    }>;

/**
 * Trace entry included in an exported bundle.
 */
export type DebugBundleTraceRecord = Readonly<{
  header: DebugBundleHeader;
  payload: DebugBundlePayloadSnapshot | null;
}>;

/**
 * Debug statistics snapshot serialized for bundle export.
 */
export type DebugBundleStatsSnapshot = Readonly<{
  totalRecords: string;
  totalDropped: string;
  errorCount: number;
  warnCount: number;
  currentRingUsage: number;
  ringCapacity: number;
}>;

/**
 * Capture flags active when the bundle was exported.
 */
export type DebugBundleCaptureFlags = Readonly<{
  captureRawEvents: boolean;
  captureDrawlistBytes: boolean;
}>;

/**
 * Bounds applied while building the bundle.
 */
export type DebugBundleBounds = Readonly<{
  maxRecords: number;
  maxPayloadBytes: number;
  maxTotalPayloadBytes: number;
  maxRecentFrames: number;
}>;

/**
 * Query window metadata for the exported trace set.
 */
export type DebugBundleQueryWindow = Readonly<{
  recordsReturned: number;
  recordsAvailable: number;
  recordsDropped: number;
  oldestRecordId: string;
  newestRecordId: string;
}>;

/**
 * Lightweight frame summary included when frame snapshots are available.
 */
export type DebugBundleFrameSummary = Readonly<{
  frameId: string;
  timestamp: number;
  cols: number;
  rows: number;
  drawlistBytes: number;
  drawlistCmds: number;
  diffBytesEmitted: number;
  dirtyLines: number;
  dirtyCells: number;
  damageRects: number;
  usDrawlist: number;
  usDiff: number;
  usWrite: number;
}>;

/**
 * Deterministic debug export bundle.
 */
export type DebugBundle = Readonly<{
  schema: DebugBundleSchema;
  captureFlags: DebugBundleCaptureFlags;
  bounds: DebugBundleBounds;
  terminalCaps: TerminalCaps | null;
  stats: DebugBundleStatsSnapshot;
  queryWindow: DebugBundleQueryWindow;
  trace: readonly DebugBundleTraceRecord[];
  recentFrameSummaries?: readonly DebugBundleFrameSummary[];
}>;

/**
 * Options for debug bundle export.
 */
export type DebugBundleExportOptions = Readonly<{
  maxRecords?: number;
  maxPayloadBytes?: number;
  maxTotalPayloadBytes?: number;
  includeRecentFrames?: boolean;
  maxRecentFrames?: number;
  terminalCaps?: TerminalCaps | null;
  includeRawEvents?: boolean;
  includeDrawlistBytes?: boolean;
}>;

/**
 * Performance phase identifiers for PerfRecord.phase field.
 */
export type PerfPhase = "poll" | "submit" | "present";

/**
 * Parse error codes for debug record parsing.
 * Extends the standard ParseErrorCode with debug-specific codes.
 */
export type DebugParseErrorCode =
  | "ZR_BAD_MAGIC"
  | "ZR_UNSUPPORTED_VERSION"
  | "ZR_TRUNCATED"
  | "ZR_MISALIGNED"
  | "ZR_SIZE_MISMATCH"
  | "ZR_OUT_OF_BOUNDS"
  | "ZR_INVALID_RECORD"
  | "ZR_LIMIT"
  | "ZR_DEBUG_INVALID_CATEGORY"
  | "ZR_DEBUG_INVALID_SEVERITY";

/**
 * Parse error with debug-specific context.
 */
export type DebugParseError = Readonly<{
  code: DebugParseErrorCode;
  offset: number;
  detail: string;
}>;

/**
 * Parse result for debug records.
 */
export type DebugParseResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: DebugParseError }>;
