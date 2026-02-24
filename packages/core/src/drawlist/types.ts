/**
 * packages/core/src/drawlist/types.ts — ZRDL drawlist builder type definitions.
 *
 * Why: Defines the TypeScript interface for building ZRDL binary drawlists.
 * These types form the contract between the widget renderer and the binary
 * builder, ensuring type-safe drawing command emission.
 *
 * ZRDL format: Little-endian, 4-byte aligned drawlist for the C engine.
 *
 * @see docs/protocol/abi.md
 * @see docs/protocol/zrdl.md
 */

import type { CursorShape } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";

export type DrawlistTextRunSegment = Readonly<{
  text: string;
  style?: TextStyle;
}>;

/** Encoded v3+ style payload used by generated drawlist writers. */
export type EncodedStyle = Readonly<{
  fg: number;
  bg: number;
  attrs: number;
  reserved: number;
  underlineRgb: number;
  linkUriRef: number;
  linkIdRef: number;
}>;

/**
 * Error codes for ZRDL build failures.
 *
 * Error categories:
 *   - ZRDL_TOO_LARGE: Output exceeds configured size/count caps
 *   - ZRDL_BAD_PARAMS: Invalid parameters passed to drawing commands
 *   - ZRDL_FORMAT: Internal format constraint violated (e.g., alignment)
 *   - ZRDL_INTERNAL: Implementation bug (should never occur)
 */
export type DrawlistBuildErrorCode =
  | "ZRDL_TOO_LARGE"
  | "ZRDL_BAD_PARAMS"
  | "ZRDL_FORMAT"
  | "ZRDL_INTERNAL";

/** Structured build error with diagnostic context. */
export type DrawlistBuildError = Readonly<{ code: DrawlistBuildErrorCode; detail: string }>;

/**
 * Discriminated union result type for build operations.
 * On success, bytes is a self-contained ZRDL binary ready for engine submission.
 */
export type DrawlistBuildResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; error: DrawlistBuildError }>;

/**
 * ZRDL v1 drawlist builder interface.
 *
 * Usage pattern:
 *   1. Call drawing commands (clear, fillRect, drawText, pushClip, popClip)
 *   2. Call build() to produce the final ZRDL binary
 *   3. Call reset() to reuse the builder for the next frame
 *
 * Error handling: Commands record errors internally; build() returns failure
 * if any command failed. This allows batching commands without per-call checks.
 *
 * Ownership: The Uint8Array returned by build() is owned by the caller.
 */
export interface DrawlistBuilderV1 {
  /** Clear framebuffer. Emits OP_CLEAR (opcode 1). */
  clear(): void;
  /**
   * Clear framebuffer and fill the viewport with a style.
   *
   * Why: ZRDL v1 CLEAR carries no style payload. This helper provides a
   * deterministic "clear with background" that works in both raw and widget
   * render modes by emitting CLEAR + FILL_RECT.
   */
  clearTo(cols: number, rows: number, style?: TextStyle): void;
  /** Fill rectangle at (x,y) with size (w,h). Emits OP_FILL_RECT (opcode 2). */
  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void;
  /** Draw text at (x,y). Strings are interned and deduplicated. Emits OP_DRAW_TEXT (opcode 3). */
  drawText(x: number, y: number, text: string, style?: TextStyle): void;
  /** Push clipping rectangle onto clip stack. Emits OP_PUSH_CLIP (opcode 4). */
  pushClip(x: number, y: number, w: number, h: number): void;
  /** Pop clipping rectangle from clip stack. Emits OP_POP_CLIP (opcode 5). */
  popClip(): void;
  /**
   * Append a blob payload to the blob table and return its index.
   *
   * Notes:
   * - The blob span length MUST be 4-byte aligned.
   * - Blob content is not deduplicated; callers may cache returned indices.
   */
  addBlob(bytes: Uint8Array): number | null;
  /**
   * Convenience helper that encodes a ZRDL v1 DRAW_TEXT_RUN blob payload from
   * segments and appends it via addBlob().
   */
  addTextRunBlob(segments: readonly DrawlistTextRunSegment[]): number | null;
  /** Draw a pre-measured text run blob at (x,y). Emits OP_DRAW_TEXT_RUN (opcode 6). */
  drawTextRun(x: number, y: number, blobIndex: number): void;
  /** Finalize and return the ZRDL binary, or error if any command failed. */
  build(): DrawlistBuildResult;
  /** Reset builder state for reuse. Clears commands, strings, and error state. */
  reset(): void;
}

// =============================================================================
// Cursor Types (ZRDL v2)
// =============================================================================

/**
 * Desired cursor state for SET_CURSOR command (v2+).
 *
 * Semantics:
 *   - x, y: 0-based cell position; -1 means "leave unchanged" (engine-side)
 *   - shape: 0=block, 1=underline, 2=bar
 *   - visible: whether cursor is shown
 *   - blink: whether cursor blinks
 *
 * @see zr_dl_cmd_set_cursor_t in zr_drawlist.h
 */
export type CursorState = Readonly<{
  x: number;
  y: number;
  shape: CursorShape;
  visible: boolean;
  blink: boolean;
}>;

/**
 * ZRDL v2 drawlist builder interface.
 *
 * Extends v1 with SET_CURSOR command for native cursor control.
 * When v2 is negotiated, the engine handles cursor display internally,
 * eliminating the need for "fake cursor" glyphs.
 */
export interface DrawlistBuilderV2 extends DrawlistBuilderV1 {
  /**
   * Set cursor position and appearance. Emits OP_SET_CURSOR (opcode 7).
   *
   * Notes:
   *   - x/y = -1 means "leave unchanged" (engine decides)
   *   - visible = false hides the cursor regardless of position
   *   - shape is ignored if the terminal doesn't support cursor shaping
   */
  setCursor(state: CursorState): void;

  /**
   * Hide the cursor by emitting SET_CURSOR with visible=false.
   * Convenience method equivalent to setCursor({ ..., visible: false }).
   */
  hideCursor(): void;
}

// =============================================================================
// Graphics Types (ZRDL v3+)
// =============================================================================

export type DrawlistCanvasBlitter =
  | "auto"
  | "braille"
  | "sextant"
  | "quadrant"
  | "halfblock"
  | "ascii";

export type DrawlistImageFormat = "rgba" | "png";

export type DrawlistImageProtocol = "auto" | "kitty" | "sixel" | "iterm2" | "blitter";

export type DrawlistImageFit = "fill" | "contain" | "cover";

/**
 * ZRDL v3+ drawlist builder interface.
 *
 * Extends v2 with v3 style extensions and v4/v5 graphics commands.
 */
export interface DrawlistBuilderV3 extends DrawlistBuilderV2 {
  /**
   * Active drawlist version for this builder (3, 4, or 5).
   *
   * - v3: style extensions (underline color + hyperlinks)
   * - v4: v3 + DRAW_CANVAS
   * - v5: v4 + DRAW_IMAGE
   */
  readonly drawlistVersion: 3 | 4 | 5;

  /**
   * Set/clear the active hyperlink refs used for subsequent text style encoding.
   *
   * This is a builder-side state helper; it does not emit an explicit command.
   * Pass `uri=null` to clear the active hyperlink.
   */
  setLink(uri: string | null, id?: string): void;

  /**
   * Draw a canvas RGBA blob (v4+).
   *
   * `pxWidth`/`pxHeight` are optional for backwards compatibility. When omitted,
   * the builder derives them from destination cell size + blitter.
   */
  drawCanvas(
    x: number,
    y: number,
    w: number,
    h: number,
    blobIndex: number,
    blitter: DrawlistCanvasBlitter,
    pxWidth?: number,
    pxHeight?: number,
  ): void;

  /**
   * Draw an image blob (v5+).
   *
   * `pxWidth`/`pxHeight` are optional for backwards compatibility. When omitted,
   * callers should ensure the builder can infer dimensions deterministically.
   */
  drawImage(
    x: number,
    y: number,
    w: number,
    h: number,
    blobIndex: number,
    format: DrawlistImageFormat,
    protocol: DrawlistImageProtocol,
    zLayer: -1 | 0 | 1,
    fit: DrawlistImageFit,
    imageId: number,
    pxWidth?: number,
    pxHeight?: number,
  ): void;
}
