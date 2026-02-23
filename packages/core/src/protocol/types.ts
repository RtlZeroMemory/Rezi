/**
 * packages/core/src/protocol/types.ts — ZREV event batch type definitions.
 *
 * Why: Defines the TypeScript representations of parsed ZREV events and parse
 * results. These types form the contract between the binary parser and the
 * runtime, ensuring type-safe event handling throughout the framework.
 *
 * ZREV format: Little-endian, 4-byte aligned event batch from the C engine.
 *
 * @see docs/protocol/abi.md
 * @see docs/protocol/index.md
 */

/**
 * Error codes for ZREV parsing failures.
 *
 * Error categories:
 *   - ZR_BAD_MAGIC: Magic bytes don't match 'ZREV' (0x5A524556)
 *   - ZR_UNSUPPORTED_VERSION: Format version not supported by this parser
 *   - ZR_TRUNCATED: Buffer ends before declared size
 *   - ZR_MISALIGNED: Offset/size not 4-byte aligned as required
 *   - ZR_SIZE_MISMATCH: Declared size doesn't match actual data
 *   - ZR_OUT_OF_BOUNDS: Record extends beyond batch total_size
 *   - ZR_INVALID_RECORD: Record type/payload structure invalid
 *   - ZR_LIMIT: Count/size exceeds configured parser cap
 */
export type ParseErrorCode =
  | "ZR_BAD_MAGIC"
  | "ZR_UNSUPPORTED_VERSION"
  | "ZR_TRUNCATED"
  | "ZR_MISALIGNED"
  | "ZR_SIZE_MISMATCH"
  | "ZR_OUT_OF_BOUNDS"
  | "ZR_INVALID_RECORD"
  | "ZR_LIMIT";

/** Key event action type: down (press), up (release), or repeat (held). */
export type ZrevKeyAction = "down" | "up" | "repeat";

/**
 * Mouse event kind enumeration (matches ZREV binary values).
 *   1 = move, 2 = drag, 3 = down, 4 = up, 5 = wheel
 */
export type ZrevMouseKind = 1 | 2 | 3 | 4 | 5;

/**
 * Structured parse error with precise diagnostic context.
 * Offset points to the byte position where parsing failed.
 */
export type ParseError = Readonly<{
  code: ParseErrorCode;
  offset: number;
  detail: string;
}>;

/**
 * Discriminated union result type for parse operations.
 * Enforces explicit error handling (no thrown exceptions for parse failures).
 */
export type ParseResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ParseError }>;

/**
 * Mutable state for unwrapping the engine's 32-bit millisecond timestamp into a
 * monotonic number across u32 wrap-around (~49.7 days).
 *
 * Usage: pass the same object to parseEventBatchV1(..., { timeUnwrap: state })
 * for each subsequent batch.
 */
export type EventTimeUnwrapState = {
  epochMs: number;
  lastRawMs: number | null;
};

/**
 * Discriminated union of all ZREV event types.
 *
 * Event kinds (match ZREV record type values):
 *   - key (1): Keyboard key press/release/repeat with modifier state
 *   - text (2): Unicode codepoint from text input (distinct from raw keys)
 *   - paste (3): Bracketed paste data as raw UTF-8 bytes
 *   - mouse (4): Mouse movement, clicks, drags, and scrolling
 *   - resize (5): Terminal viewport size change (cols/rows)
 *   - tick (6): Frame timing event with delta milliseconds
 *   - user (7): Application-defined event with tag and payload
 *
 * Ownership: paste.bytes and user.payload are subarray views into the
 * original event batch buffer; they become invalid after batch release.
 */
export type ZrevEvent =
  | { kind: "key"; timeMs: number; key: number; mods: number; action: ZrevKeyAction }
  | { kind: "text"; timeMs: number; codepoint: number }
  | { kind: "paste"; timeMs: number; bytes: Uint8Array }
  | {
      kind: "mouse";
      timeMs: number;
      x: number;
      y: number;
      mouseKind: ZrevMouseKind;
      mods: number;
      buttons: number;
      wheelX: number;
      wheelY: number;
    }
  | { kind: "resize"; timeMs: number; cols: number; rows: number }
  | { kind: "tick"; timeMs: number; dtMs: number }
  | { kind: "user"; timeMs: number; tag: number; payload: Uint8Array };
