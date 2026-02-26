/**
 * ABI constants and error types for Rezi.
 * @see docs/protocol/abi.md
 * @see docs/guide/lifecycle-and-updates.md
 */

// =============================================================================
// ABI Version Pins (from docs/protocol/abi.md)
// =============================================================================

/**
 * Engine ABI version numbers.
 * These must match the C engine's zr_version.h exactly.
 */
export const ZR_ENGINE_ABI_MAJOR = 1;
export const ZR_ENGINE_ABI_MINOR = 2;
export const ZR_ENGINE_ABI_PATCH = 0;

/**
 * Binary format version pins.
 * Drawlist is pre-alpha and currently pinned to v1.
 */
export const ZR_DRAWLIST_VERSION_V1 = 1;
export const ZR_EVENT_BATCH_VERSION_V1 = 1;

// =============================================================================
// Cursor Shape Constants (from zr_drawlist.h SET_CURSOR)
// =============================================================================

/**
 * Cursor shape values for SET_CURSOR command (v2+).
 * These match the engine's zr_dl_cmd_set_cursor_t.shape field.
 */
export const ZR_CURSOR_SHAPE_BLOCK = 0;
export const ZR_CURSOR_SHAPE_UNDERLINE = 1;
export const ZR_CURSOR_SHAPE_BAR = 2;

export type CursorShape = 0 | 1 | 2;

/**
 * Pinned Unicode version for deterministic width/grapheme behavior.
 */
export const ZR_UNICODE_VERSION_MAJOR = 15;
export const ZR_UNICODE_VERSION_MINOR = 1;
export const ZR_UNICODE_VERSION_PATCH = 0;

/**
 * Magic bytes for binary formats (little-endian u32).
 */
export const ZRDL_MAGIC = 0x4c44525a; // 'ZRDL' as little-endian u32
export const ZREV_MAGIC = 0x5645525a; // 'ZREV' as little-endian u32

// =============================================================================
// ZrResult Enum (from docs/protocol/abi.md)
// =============================================================================

/**
 * Result codes returned by engine FFI functions.
 * All engine functions return zr_result_t (int32).
 */
export enum ZrResult {
  /** Operation completed successfully */
  OK = 0,
  /** NULL pointer, invalid enum, impossible value */
  ERR_INVALID_ARGUMENT = -1,
  /** Allocation failed */
  ERR_OOM = -2,
  /** Buffer too small, cap exceeded */
  ERR_LIMIT = -3,
  /** Unknown version, opcode, feature */
  ERR_UNSUPPORTED = -4,
  /** Malformed binary data */
  ERR_FORMAT = -5,
  /** OS/terminal call failed */
  ERR_PLATFORM = -6,
}

// =============================================================================
// ZrUiErrorCode Union (from docs/guide/lifecycle-and-updates.md)
// =============================================================================

/**
 * Deterministic error codes for all runtime violations.
 * These are surfaced as ZrUiError instances.
 */
export type ZrUiErrorCode =
  | "ZRUI_INVALID_STATE"
  | "ZRUI_MODE_CONFLICT"
  | "ZRUI_NO_RENDER_MODE"
  | "ZRUI_REENTRANT_CALL"
  | "ZRUI_UPDATE_DURING_RENDER"
  | "ZRUI_DUPLICATE_KEY"
  | "ZRUI_DUPLICATE_ID"
  | "ZRUI_INVALID_PROPS"
  | "ZRUI_PROTOCOL_ERROR"
  | "ZRUI_DRAWLIST_BUILD_ERROR"
  | "ZRUI_BACKEND_ERROR"
  | "ZRUI_USER_CODE_THROW";

// =============================================================================
// ZrUiError Class (from docs/guide/lifecycle-and-updates.md)
// =============================================================================

/**
 * Error class for all deterministic runtime violations.
 * The `code` property identifies the specific violation.
 */
export class ZrUiError extends Error {
  override readonly name = "ZrUiError";
  readonly code: ZrUiErrorCode;

  constructor(code: ZrUiErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;

    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ZrUiError);
    }
  }
}
