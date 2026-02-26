/**
 * packages/core/src/drawlist/types.ts — ZRDL drawlist builder type definitions.
 */

import type { CursorShape } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";

export type DrawlistTextRunSegment = Readonly<{
  text: string;
  style?: TextStyle;
}>;

export type EncodedStyle = Readonly<{
  fg: number;
  bg: number;
  attrs: number;
  reserved: number;
  underlineRgb: number;
  linkUriRef: number;
  linkIdRef: number;
}>;

export type DrawlistBuildErrorCode =
  | "ZRDL_TOO_LARGE"
  | "ZRDL_BAD_PARAMS"
  | "ZRDL_FORMAT"
  | "ZRDL_INTERNAL";

export type DrawlistBuildError = Readonly<{ code: DrawlistBuildErrorCode; detail: string }>;

export type DrawlistBuildResult =
  | Readonly<{ ok: true; bytes: Uint8Array }>
  | Readonly<{ ok: false; error: DrawlistBuildError }>;

export interface DrawlistBuildInto {
  buildInto(dst: Uint8Array): DrawlistBuildResult;
}

export type CursorState = Readonly<{
  x: number;
  y: number;
  shape: CursorShape;
  visible: boolean;
  blink: boolean;
}>;

export interface DrawlistBuilderV1 {
  clear(): void;
  clearTo(cols: number, rows: number, style?: TextStyle): void;
  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void;
  drawText(x: number, y: number, text: string, style?: TextStyle): void;
  pushClip(x: number, y: number, w: number, h: number): void;
  popClip(): void;
  addBlob(bytes: Uint8Array, stableKey?: string): number | null;
  addTextRunBlob(segments: readonly DrawlistTextRunSegment[], stableKey?: string): number | null;
  drawTextRun(x: number, y: number, blobId: number): void;
  build(): DrawlistBuildResult;
  reset(): void;
}

export interface DrawlistBuilderV2 extends DrawlistBuilderV1, DrawlistBuildInto {
  setCursor(state: CursorState): void;
  hideCursor(): void;
}

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
 * Drawlist builder for ZRDL v1.
 *
 * Note: kept under the legacy V3 name to avoid churn across internal call sites.
 */
export interface DrawlistBuilderV3 extends DrawlistBuilderV2 {
  readonly drawlistVersion: 1;
  setLink(uri: string | null, id?: string): void;
  drawCanvas(
    x: number,
    y: number,
    w: number,
    h: number,
    blobId: number,
    blitter: DrawlistCanvasBlitter,
    pxWidth?: number,
    pxHeight?: number,
  ): void;
  drawImage(
    x: number,
    y: number,
    w: number,
    h: number,
    blobId: number,
    format: DrawlistImageFormat,
    protocol: DrawlistImageProtocol,
    zLayer: -1 | 0 | 1,
    fit: DrawlistImageFit,
    imageId: number,
    pxWidth?: number,
    pxHeight?: number,
  ): void;

  /**
   * Invalidate engine-side resources (for backend restart/recreate).
   * Next frame will re-emit all required DEF_* commands.
   */
  markEngineResourceStoreEmpty(): void;
}
