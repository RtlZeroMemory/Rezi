/**
 * Draw API for raw mode rendering.
 * @see docs/protocol/zrdl.md
 */

import type { TextStyle } from "./widgets/style.js";

// =============================================================================
// DrawApi Interface (from docs/protocol/zrdl.md)
// =============================================================================

/**
 * Low-level draw API for raw mode rendering.
 *
 * This interface is used via the `app.draw(g => ...)` escape hatch
 * and corresponds to the DrawlistBuilderV1 operations.
 *
 * All coordinates are in cell units (column, row).
 * All methods validate inputs and fail deterministically on invalid parameters.
 */
export interface DrawApi {
  /**
   * Clear the framebuffer.
   */
  clear(): void;

  /**
   * Clear and fill the viewport with a style.
   *
   * Why: ZRDL v1 CLEAR carries no style payload. This helper emits CLEAR +
   * FILL_RECT and is the recommended way to apply a background color in raw mode.
   */
  clearTo(cols: number, rows: number, style?: TextStyle): void;

  /**
   * Fill a rectangle with an optional style.
   *
   * @param x - Left column (int32)
   * @param y - Top row (int32)
   * @param w - Width in columns (>= 0)
   * @param h - Height in rows (>= 0)
   * @param style - Optional style for the fill
   */
  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void;

  /**
   * Draw text at a position with an optional style.
   *
   * @param x - Column position (int32)
   * @param y - Row position (int32)
   * @param text - Text to draw (UTF-8 encoded internally)
   * @param style - Optional text style
   */
  drawText(x: number, y: number, text: string, style?: TextStyle): void;

  /**
   * Push a clip rectangle onto the clip stack.
   *
   * All subsequent draw operations will be clipped to this rectangle
   * (intersected with any existing clip).
   *
   * @param x - Left column (int32)
   * @param y - Top row (int32)
   * @param w - Width in columns (>= 0)
   * @param h - Height in rows (>= 0)
   */
  pushClip(x: number, y: number, w: number, h: number): void;

  /**
   * Pop the most recent clip rectangle from the clip stack.
   *
   * Must be balanced with pushClip calls.
   */
  popClip(): void;

  /** Append/lookup a blob payload and return its resource id (for advanced ZRDL use). */
  addBlob(bytes: Uint8Array, stableKey?: string): number | null;

  /** Encode and append a DRAW_TEXT_RUN blob payload from segments. */
  addTextRunBlob(
    segments: ReadonlyArray<Readonly<{ text: string; style?: TextStyle }>>,
    stableKey?: string,
  ): number | null;

  /** Draw a DRAW_TEXT_RUN command referencing a blob resource id. */
  drawTextRun(x: number, y: number, blobId: number): void;
}
