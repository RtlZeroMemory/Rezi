/**
 * packages/core/src/drawlist/types.ts — ZRDL drawlist builder type definitions.
 */

import type { CursorShape } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";

export type DrawlistTextRunSegment = Readonly<{
  text: string;
  style?: TextStyle;
}>;

/** Encoded style payload used by generated drawlist writers. */
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

export type DrawlistTextPerfCounters = Readonly<{
  textEncoderCalls: number;
  textArenaBytes: number;
  textSegments: number;
}>;

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
 * Current drawlist builder interface. Produces protocol-current ZRDL buffers.
 */
export interface DrawlistBuilder extends DrawlistBuildInto {
  clear(): void;
  clearTo(cols: number, rows: number, style?: TextStyle): void;
  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void;
  reserveTextArena?(bytes: number): void;
  blitRect(srcX: number, srcY: number, w: number, h: number, dstX: number, dstY: number): void;
  drawText(x: number, y: number, text: string, style?: TextStyle): void;
  pushClip(x: number, y: number, w: number, h: number): void;
  popClip(): void;
  addBlob(bytes: Uint8Array): number | null;
  addTextRunBlob(segments: readonly DrawlistTextRunSegment[]): number | null;
  drawTextRun(x: number, y: number, blobIndex: number): void;
  setCursor(state: CursorState): void;
  hideCursor(): void;
  setLink(uri: string | null, id?: string): void;
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
  getTextPerfCounters?(): DrawlistTextPerfCounters;
  build(): DrawlistBuildResult;
  reset(): void;
}
