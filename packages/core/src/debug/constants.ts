/**
 * packages/core/src/debug/constants.ts — Debug trace constants and mappings.
 *
 * Why: Provides numeric constants matching the C engine's debug enums and
 * bidirectional mappings between numeric values and TypeScript string types.
 * These constants ensure consistent encoding/decoding of debug records.
 *
 * C enums reference: include/zr/zr_debug.h
 */

import type { DebugCategory, DebugSeverity, PerfPhase } from "./types.js";

/* --- Category Constants (match zr_debug_category_t) --- */

export const DEBUG_CAT_NONE = 0;
export const DEBUG_CAT_FRAME = 1;
export const DEBUG_CAT_EVENT = 2;
export const DEBUG_CAT_DRAWLIST = 3;
export const DEBUG_CAT_ERROR = 4;
export const DEBUG_CAT_STATE = 5;
export const DEBUG_CAT_PERF = 6;

/** Bitmask including all debug categories. */
export const DEBUG_CAT_ALL =
  (1 << DEBUG_CAT_FRAME) |
  (1 << DEBUG_CAT_EVENT) |
  (1 << DEBUG_CAT_DRAWLIST) |
  (1 << DEBUG_CAT_ERROR) |
  (1 << DEBUG_CAT_STATE) |
  (1 << DEBUG_CAT_PERF);

/* --- Severity Constants (match zr_debug_severity_t) --- */

export const DEBUG_SEV_TRACE = 0;
export const DEBUG_SEV_INFO = 1;
export const DEBUG_SEV_WARN = 2;
export const DEBUG_SEV_ERROR = 3;

/* --- Performance Phase Constants --- */

export const PERF_PHASE_POLL = 0;
export const PERF_PHASE_SUBMIT = 1;
export const PERF_PHASE_PRESENT = 2;

/* --- Record Header Size --- */

/** Size of zr_debug_record_header_t in bytes. */
export const DEBUG_RECORD_HEADER_SIZE = 40;

/* --- Payload Sizes --- */

/** Size of zr_debug_frame_record_t in bytes. */
export const DEBUG_FRAME_RECORD_SIZE = 56;

/** Size of zr_debug_event_record_t in bytes. */
export const DEBUG_EVENT_RECORD_SIZE = 32;

/** Size of zr_debug_error_record_t in bytes. */
export const DEBUG_ERROR_RECORD_SIZE = 120;

/** Size of zr_debug_drawlist_record_t in bytes. */
export const DEBUG_DRAWLIST_RECORD_SIZE = 48;

/** Size of zr_debug_perf_record_t in bytes. */
export const DEBUG_PERF_RECORD_SIZE = 24;

/* --- Config/Query Sizes --- */

/** Size of zr_debug_config_t in bytes. */
export const DEBUG_CONFIG_SIZE = 32;

/** Size of zr_debug_query_t in bytes. */
export const DEBUG_QUERY_SIZE = 48;

/** Size of zr_debug_query_result_t in bytes. */
export const DEBUG_QUERY_RESULT_SIZE = 32;

/** Size of zr_debug_stats_t in bytes. */
export const DEBUG_STATS_SIZE = 32;

/* --- Bundle Export Constants --- */

/** Stable schema identifier for JSON debug bundles. */
export const DEBUG_BUNDLE_SCHEMA_V1 = "rezi-debug-bundle-v1";

/** Default maximum number of trace headers exported into a bundle. */
export const DEBUG_BUNDLE_DEFAULT_MAX_RECORDS = 512;

/** Default maximum payload bytes included per trace record. */
export const DEBUG_BUNDLE_DEFAULT_MAX_PAYLOAD_BYTES = 4096;

/** Default maximum payload bytes included across all records. */
export const DEBUG_BUNDLE_DEFAULT_MAX_TOTAL_PAYLOAD_BYTES = 262_144;

/** Default maximum recent frame summaries included when available. */
export const DEBUG_BUNDLE_DEFAULT_MAX_RECENT_FRAMES = 32;

/* --- Category Mapping --- */

const CATEGORY_NUM_TO_STR: ReadonlyMap<number, DebugCategory> = new Map([
  [DEBUG_CAT_NONE, "none"],
  [DEBUG_CAT_FRAME, "frame"],
  [DEBUG_CAT_EVENT, "event"],
  [DEBUG_CAT_DRAWLIST, "drawlist"],
  [DEBUG_CAT_ERROR, "error"],
  [DEBUG_CAT_STATE, "state"],
  [DEBUG_CAT_PERF, "perf"],
]);

const CATEGORY_STR_TO_NUM: ReadonlyMap<DebugCategory, number> = new Map([
  ["none", DEBUG_CAT_NONE],
  ["frame", DEBUG_CAT_FRAME],
  ["event", DEBUG_CAT_EVENT],
  ["drawlist", DEBUG_CAT_DRAWLIST],
  ["error", DEBUG_CAT_ERROR],
  ["state", DEBUG_CAT_STATE],
  ["perf", DEBUG_CAT_PERF],
]);

/**
 * Convert a numeric category value to its string representation.
 * Returns null if the value is not a valid category.
 */
export function categoryFromNum(num: number): DebugCategory | null {
  return CATEGORY_NUM_TO_STR.get(num) ?? null;
}

/**
 * Convert a category string to its numeric value.
 * Returns null if the string is not a valid category.
 */
export function categoryToNum(cat: DebugCategory): number | null {
  return CATEGORY_STR_TO_NUM.get(cat) ?? null;
}

/* --- Severity Mapping --- */

const SEVERITY_NUM_TO_STR: ReadonlyMap<number, DebugSeverity> = new Map([
  [DEBUG_SEV_TRACE, "trace"],
  [DEBUG_SEV_INFO, "info"],
  [DEBUG_SEV_WARN, "warn"],
  [DEBUG_SEV_ERROR, "error"],
]);

const SEVERITY_STR_TO_NUM: ReadonlyMap<DebugSeverity, number> = new Map([
  ["trace", DEBUG_SEV_TRACE],
  ["info", DEBUG_SEV_INFO],
  ["warn", DEBUG_SEV_WARN],
  ["error", DEBUG_SEV_ERROR],
]);

/**
 * Convert a numeric severity value to its string representation.
 * Returns null if the value is not a valid severity.
 */
export function severityFromNum(num: number): DebugSeverity | null {
  return SEVERITY_NUM_TO_STR.get(num) ?? null;
}

/**
 * Convert a severity string to its numeric value.
 * Returns null if the string is not a valid severity.
 */
export function severityToNum(sev: DebugSeverity): number | null {
  return SEVERITY_STR_TO_NUM.get(sev) ?? null;
}

/* --- Performance Phase Mapping --- */

const PERF_PHASE_NUM_TO_STR: ReadonlyMap<number, PerfPhase> = new Map([
  [PERF_PHASE_POLL, "poll"],
  [PERF_PHASE_SUBMIT, "submit"],
  [PERF_PHASE_PRESENT, "present"],
]);

/**
 * Convert a numeric performance phase to its string representation.
 * Returns null if the value is not a valid phase.
 */
export function perfPhaseFromNum(num: number): PerfPhase | null {
  return PERF_PHASE_NUM_TO_STR.get(num) ?? null;
}

/* --- Category Bitmask Helpers --- */

/**
 * Create a category bitmask from an array of categories.
 */
export function categoriesToMask(categories: readonly DebugCategory[]): number {
  let mask = 0;
  for (const cat of categories) {
    const num = categoryToNum(cat);
    if (num !== null && num > 0) {
      mask |= 1 << num;
    }
  }
  return mask;
}

/**
 * Extract categories from a bitmask.
 */
export function maskToCategories(mask: number): DebugCategory[] {
  const result: DebugCategory[] = [];
  for (const [num, cat] of CATEGORY_NUM_TO_STR) {
    if (num > 0 && (mask & (1 << num)) !== 0) {
      result.push(cat);
    }
  }
  return result;
}

/**
 * Check if a category is set in a bitmask.
 */
export function isCategoryInMask(mask: number, category: DebugCategory): boolean {
  const num = categoryToNum(category);
  if (num === null || num === 0) return false;
  return (mask & (1 << num)) !== 0;
}
