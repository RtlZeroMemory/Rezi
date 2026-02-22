/**
 * packages/core/src/drawlist/builder_v3.ts — ZRDL v3/v4/v5 drawlist builder.
 *
 * Why: Aligns TypeScript drawlist encoding with vendored Zireael protocol:
 *  - v3: style extensions (underline RGB + hyperlink refs)
 *  - v4: v3 + DRAW_CANVAS
 *  - v5: v4 + DRAW_IMAGE
 *
 * @see docs/protocol/abi.md
 * @see docs/protocol/zrdl.md
 */

import {
  ZRDL_MAGIC,
  ZR_DRAWLIST_VERSION_V3,
  ZR_DRAWLIST_VERSION_V4,
  ZR_DRAWLIST_VERSION_V5,
} from "../abi.js";
import type { TextStyle } from "../index.js";
import type {
  CursorState,
  DrawlistBuildError,
  DrawlistBuildErrorCode,
  DrawlistBuildResult,
  DrawlistBuilderV3,
  DrawlistCanvasBlitter,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
  DrawlistTextRunSegment,
} from "./types.js";
import {
  CLEAR_SIZE,
  DRAW_CANVAS_SIZE,
  DRAW_IMAGE_SIZE,
  DRAW_TEXT_RUN_SIZE,
  DRAW_TEXT_SIZE,
  FILL_RECT_SIZE,
  POP_CLIP_SIZE,
  PUSH_CLIP_SIZE,
  SET_CURSOR_SIZE,
  writeClear,
  writeDrawCanvas,
  writeDrawImage,
  writeDrawText,
  writeDrawTextRun,
  writeFillRect,
  writePopClip,
  writePushClip,
  writeSetCursor,
} from "./writers.gen.js";

/**
 * Builder configuration options with cap enforcement.
 */
export type DrawlistBuilderV3Opts = Readonly<{
  drawlistVersion?: 3 | 4 | 5;
  maxDrawlistBytes?: number;
  maxCmdCount?: number;
  maxBlobBytes?: number;
  maxBlobs?: number;
  maxStringBytes?: number;
  maxStrings?: number;
  validateParams?: boolean;
  /**
   * If true, reuse the output buffer across build() calls.
   *
   * Safety: Only enable when the caller guarantees that build() is not called
   * again until the previous drawlist bytes are no longer in use.
   */
  reuseOutputBuffer?: boolean;
  /**
   * Optional cap for caching UTF-8 encoded strings across builds.
   *
   * A value of 0 disables the cache (default). When enabled, the cache is
   * cleared if it grows past this cap to prevent unbounded memory usage.
   */
  encodedStringCacheCap?: number;
}>;

/* --- Format Constants --- */

const HEADER_SIZE = 64;

/* --- Default Caps --- */

const DEFAULT_MAX_DRAWLIST_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CMD_COUNT = 100_000;
const DEFAULT_MAX_BLOB_BYTES = 512 * 1024;
const DEFAULT_MAX_BLOBS = 10_000;
const DEFAULT_MAX_STRING_BYTES = 512 * 1024;
const DEFAULT_MAX_STRINGS = 10_000;

/* --- Integer Bounds --- */

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

const BLITTER_CODE: Readonly<Record<DrawlistCanvasBlitter, number>> = Object.freeze({
  auto: 0,
  braille: 2,
  sextant: 3,
  quadrant: 4,
  halfblock: 5,
  ascii: 6,
});

const IMAGE_FORMAT_CODE: Readonly<Record<DrawlistImageFormat, number>> = Object.freeze({
  rgba: 0,
  png: 1,
});

const IMAGE_PROTOCOL_CODE: Readonly<Record<Exclude<DrawlistImageProtocol, "blitter">, number>> =
  Object.freeze({
    auto: 0,
    kitty: 1,
    sixel: 2,
    iterm2: 3,
  });

const IMAGE_FIT_CODE: Readonly<Record<DrawlistImageFit, number>> = Object.freeze({
  fill: 0,
  contain: 1,
  cover: 2,
});

export type EncodedStyle = Readonly<{
  fg: number;
  bg: number;
  attrs: number;
  reserved: number;
  underlineRgb: number;
  linkUriRef: number;
  linkIdRef: number;
}>;
type Utf8Encoder = Readonly<{ encode(input: string): Uint8Array }>;
type LinkRefs = Readonly<{ uriRef: number; idRef: number }>;
type CanvasPixelSize = Readonly<{ pxWidth: number; pxHeight: number }>;

const MAX_U16 = 0xffff;

const BLITTER_SUBCELL_RESOLUTION: Readonly<
  Record<Exclude<DrawlistCanvasBlitter, "auto">, Readonly<{ subW: number; subH: number }>>
> = Object.freeze({
  braille: Object.freeze({ subW: 2, subH: 4 }),
  sextant: Object.freeze({ subW: 2, subH: 3 }),
  quadrant: Object.freeze({ subW: 2, subH: 2 }),
  halfblock: Object.freeze({ subW: 1, subH: 2 }),
  ascii: Object.freeze({ subW: 1, subH: 1 }),
});

function align4(n: number): number {
  return (n + 3) & ~3;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isRgbLike(v: unknown): v is Readonly<{ r: unknown; g: unknown; b: unknown }> {
  return isObject(v) && "r" in v && "g" in v && "b" in v;
}

function isTextRunSegment(v: unknown): v is DrawlistTextRunSegment {
  if (typeof v !== "object" || v === null) return false;
  if (typeof (v as { text?: unknown }).text !== "string") return false;
  return true;
}

function packRgb(v: unknown): number | null {
  if (typeof v === "string") {
    const raw = v.startsWith("#") ? v.slice(1) : v;
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
      return Number.parseInt(raw, 16) & 0x00ff_ff_ff;
    }
    return null;
  }
  if (!isRgbLike(v)) return null;
  const r0 = v.r;
  const g0 = v.g;
  const b0 = v.b;
  const r = typeof r0 === "number" && Number.isFinite(r0) ? r0 | 0 : 0;
  const g = typeof g0 === "number" && Number.isFinite(g0) ? g0 | 0 : 0;
  const b = typeof b0 === "number" && Number.isFinite(b0) ? b0 | 0 : 0;
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}

function encodeUnderlineStyle(style: TextStyle["underlineStyle"] | undefined): number {
  switch (style) {
    case "straight":
      return 1;
    case "double":
      return 2;
    case "curly":
      return 3;
    case "dotted":
      return 4;
    case "dashed":
      return 5;
    default:
      return 0;
  }
}

function encodeStyle(style: TextStyle | undefined, linkRefs: LinkRefs | null): EncodedStyle {
  if (!style) {
    return {
      fg: 0,
      bg: 0,
      attrs: 0,
      reserved: 0,
      underlineRgb: 0,
      linkUriRef: linkRefs?.uriRef ?? 0,
      linkIdRef: linkRefs?.idRef ?? 0,
    };
  }

  const fg = packRgb(style.fg) ?? 0;
  const bg = packRgb(style.bg) ?? 0;
  const underlineColor = packRgb(style.underlineColor) ?? 0;
  const underlineStyle = encodeUnderlineStyle(style.underlineStyle);

  let attrs = 0;
  if (style.bold) attrs |= 1 << 0;
  if (style.italic) attrs |= 1 << 1;
  if (style.underline || underlineStyle !== 0) attrs |= 1 << 2;
  if (style.inverse) attrs |= 1 << 3;
  if (style.dim) attrs |= 1 << 4;
  if (style.strikethrough) attrs |= 1 << 5;
  if (style.overline) attrs |= 1 << 6;
  if (style.blink) attrs |= 1 << 7;

  return {
    fg,
    bg,
    attrs,
    reserved: underlineStyle & 0x7,
    underlineRgb: underlineColor,
    linkUriRef: linkRefs?.uriRef ?? 0,
    linkIdRef: linkRefs?.idRef ?? 0,
  };
}

function deriveCanvasPxFromBlitter(
  cols: number,
  rows: number,
  blitter: DrawlistCanvasBlitter,
): CanvasPixelSize | null {
  if (blitter === "auto") return null;
  const res = BLITTER_SUBCELL_RESOLUTION[blitter];
  if (!res) return null;
  return Object.freeze({ pxWidth: cols * res.subW, pxHeight: rows * res.subH });
}

function inferAutoCanvasPx(blobLen: number, cols: number): CanvasPixelSize | null {
  if (blobLen <= 0 || (blobLen & 3) !== 0) return null;
  const pixels = blobLen >>> 2;
  const pxWidth = cols > 0 ? cols : 1;
  if (pxWidth <= 0 || pixels % pxWidth !== 0) return null;
  const pxHeight = pixels / pxWidth;
  if (pxHeight <= 0) return null;
  return Object.freeze({ pxWidth, pxHeight });
}

/**
 * Create a new ZRDL v3 drawlist builder.
 *
 * @param opts - Builder caps (defaults match v1)
 * @returns DrawlistBuilderV3 instance with SET_CURSOR support
 */
export function createDrawlistBuilderV3(opts: DrawlistBuilderV3Opts = {}): DrawlistBuilderV3 {
  return new DrawlistBuilderV3Impl(opts);
}

/**
 * Internal implementation of DrawlistBuilderV3.
 * Extends v1 logic with SET_CURSOR command and v2 header.
 */
class DrawlistBuilderV3Impl implements DrawlistBuilderV3 {
  readonly drawlistVersion: 3 | 4 | 5;
  private readonly maxDrawlistBytes: number;
  private readonly maxCmdCount: number;
  private readonly maxBlobBytes: number;
  private readonly maxBlobs: number;
  private readonly maxStringBytes: number;
  private readonly maxStrings: number;
  private readonly validateParams: boolean;
  private readonly reuseOutputBuffer: boolean;
  private readonly encodedStringCacheCap: number;

  private readonly encoder: Utf8Encoder | undefined;

  private cmdBuf: Uint8Array;
  private cmdDv: DataView;
  private cmdLen = 0;
  private cmdCount = 0;

  private readonly stringIndexByValue = new Map<string, number>();
  private readonly stringSpanOffs: number[] = [];
  private readonly stringSpanLens: number[] = [];
  private stringBytesBuf: Uint8Array;
  private stringBytesLen = 0;

  private readonly blobSpanOffs: number[] = [];
  private readonly blobSpanLens: number[] = [];
  private blobBytesBuf: Uint8Array;
  private blobBytesLen = 0;

  private outBuf: Uint8Array | null = null;
  private readonly encodedStringCache: Map<string, Uint8Array> | null;
  private activeLinkUriRef = 0;
  private activeLinkIdRef = 0;

  private error: DrawlistBuildError | undefined;

  constructor(opts: DrawlistBuilderV3Opts) {
    const drawlistVersion = opts.drawlistVersion ?? ZR_DRAWLIST_VERSION_V5;
    const maxDrawlistBytes = opts.maxDrawlistBytes ?? DEFAULT_MAX_DRAWLIST_BYTES;
    const maxCmdCount = opts.maxCmdCount ?? DEFAULT_MAX_CMD_COUNT;
    const maxBlobBytes = opts.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;
    const maxBlobs = opts.maxBlobs ?? DEFAULT_MAX_BLOBS;
    const maxStringBytes = opts.maxStringBytes ?? DEFAULT_MAX_STRING_BYTES;
    const maxStrings = opts.maxStrings ?? DEFAULT_MAX_STRINGS;
    const validateParams = opts.validateParams ?? true;
    const reuseOutputBuffer = opts.reuseOutputBuffer === true;
    const encodedStringCacheCap = opts.encodedStringCacheCap ?? 0;

    if (
      drawlistVersion !== ZR_DRAWLIST_VERSION_V3 &&
      drawlistVersion !== ZR_DRAWLIST_VERSION_V4 &&
      drawlistVersion !== ZR_DRAWLIST_VERSION_V5
    ) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `DrawlistBuilderV3: drawlistVersion must be 3, 4, or 5 (got ${String(drawlistVersion)})`,
      );
    }
    this.drawlistVersion = (
      drawlistVersion === ZR_DRAWLIST_VERSION_V3
        ? ZR_DRAWLIST_VERSION_V3
        : drawlistVersion === ZR_DRAWLIST_VERSION_V4
          ? ZR_DRAWLIST_VERSION_V4
          : ZR_DRAWLIST_VERSION_V5
    ) as 3 | 4 | 5;
    this.maxDrawlistBytes = this.requirePositiveInt("maxDrawlistBytes", maxDrawlistBytes);
    this.maxCmdCount = this.requirePositiveInt("maxCmdCount", maxCmdCount);
    this.maxBlobBytes = this.requirePositiveInt("maxBlobBytes", maxBlobBytes);
    this.maxBlobs = this.requirePositiveInt("maxBlobs", maxBlobs);
    this.maxStringBytes = this.requirePositiveInt("maxStringBytes", maxStringBytes);
    this.maxStrings = this.requirePositiveInt("maxStrings", maxStrings);
    this.validateParams = validateParams !== false;
    this.reuseOutputBuffer = reuseOutputBuffer;
    this.encodedStringCacheCap = this.requireNonNegativeInt(
      "encodedStringCacheCap",
      encodedStringCacheCap,
    );
    this.encodedStringCache = this.encodedStringCacheCap > 0 ? new Map() : null;

    const initialCmdCap = Math.min(4096, this.maxDrawlistBytes);
    this.cmdBuf = new Uint8Array(initialCmdCap);
    this.cmdDv = new DataView(this.cmdBuf.buffer, this.cmdBuf.byteOffset, this.cmdBuf.byteLength);

    const initialStrCap = Math.min(1024, this.maxStringBytes);
    this.stringBytesBuf = new Uint8Array(initialStrCap);

    const initialBlobCap = Math.min(1024, this.maxBlobBytes);
    this.blobBytesBuf = new Uint8Array(initialBlobCap);

    this.encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : undefined;
    if (!this.encoder) {
      this.fail("ZRDL_INTERNAL", "TextEncoder is not available in this environment");
    }
  }

  // =========================================================================
  // v2 Commands
  // =========================================================================

  setCursor(state: CursorState): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("setCursor", "x", state.x) : state.x | 0;
    const yi = this.validateParams ? this.requireI32("setCursor", "y", state.y) : state.y | 0;
    if (this.error) return;
    if (xi === null || yi === null) return;

    const shape = state.shape & 0xff;
    if (this.validateParams && (shape < 0 || shape > 2)) {
      this.fail("ZRDL_BAD_PARAMS", `setCursor: shape must be 0, 1, or 2 (got ${shape})`);
      return;
    }

    if (!this.beginCommandWrite("setCursor", SET_CURSOR_SIZE)) return;
    this.cmdLen = writeSetCursor(
      this.cmdBuf,
      this.cmdDv,
      this.cmdLen,
      xi,
      yi,
      shape,
      state.visible ? 1 : 0,
      state.blink ? 1 : 0,
      0,
    );
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  hideCursor(): void {
    this.setCursor({ x: -1, y: -1, shape: 0, visible: false, blink: false });
  }

  setLink(uri: string | null, id?: string): void {
    if (this.error) return;

    if (id !== undefined && typeof id !== "string") {
      this.fail("ZRDL_BAD_PARAMS", "setLink: id must be a string when provided");
      return;
    }

    if (uri === null) {
      this.activeLinkUriRef = 0;
      this.activeLinkIdRef = 0;
      return;
    }

    if (uri !== null) {
      if (typeof uri !== "string") {
        this.fail("ZRDL_BAD_PARAMS", "setLink: uri must be a string or null");
        return;
      }
      const idx = this.internString(uri);
      if (this.error || idx === null) return;
      this.activeLinkUriRef = (idx + 1) >>> 0;

      if (id !== undefined) {
        const idIdx = this.internString(id);
        if (this.error || idIdx === null) return;
        this.activeLinkIdRef = (idIdx + 1) >>> 0;
      } else {
        this.activeLinkIdRef = 0;
      }
    }
  }

  drawCanvas(
    x: number,
    y: number,
    w: number,
    h: number,
    blobIndex: number,
    blitter: DrawlistCanvasBlitter,
    pxWidth?: number,
    pxHeight?: number,
  ): void {
    if (this.error) return;
    if (this.drawlistVersion < ZR_DRAWLIST_VERSION_V4) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawCanvas: requires drawlist version >= 4 (current=${this.drawlistVersion})`,
      );
      return;
    }

    const xi = this.validateParams ? this.requireI32NonNeg("drawCanvas", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32NonNeg("drawCanvas", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32Positive("drawCanvas", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32Positive("drawCanvas", "h", h) : h | 0;
    const bi = this.validateParams
      ? this.requireU32("drawCanvas", "blobIndex", blobIndex)
      : blobIndex >>> 0;
    if (this.error) return;
    if (xi === null || yi === null || wi === null || hi === null || bi === null) return;

    if (bi >= this.blobSpanOffs.length) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawCanvas: blobIndex out of range (blobIndex=${bi}, blobsCount=${this.blobSpanOffs.length})`,
      );
      return;
    }

    const blitterCode = BLITTER_CODE[blitter];
    if (blitterCode === undefined) {
      this.fail("ZRDL_BAD_PARAMS", `drawCanvas: unsupported blitter "${String(blitter)}"`);
      return;
    }

    const blobOff = this.blobSpanOffs[bi];
    const blobLen = this.blobSpanLens[bi];
    if (blobOff === undefined || blobLen === undefined) {
      this.fail("ZRDL_INTERNAL", "drawCanvas: blob span table is inconsistent");
      return;
    }

    let resolvedPxW: number | null = null;
    let resolvedPxH: number | null = null;
    if (pxWidth !== undefined || pxHeight !== undefined) {
      const pxWi = this.validateParams
        ? this.requireI32Positive("drawCanvas", "pxWidth", pxWidth)
        : (pxWidth ?? 0) | 0;
      const pxHi = this.validateParams
        ? this.requireI32Positive("drawCanvas", "pxHeight", pxHeight)
        : (pxHeight ?? 0) | 0;
      if (this.error) return;
      if (pxWi === null || pxHi === null) return;
      resolvedPxW = pxWi;
      resolvedPxH = pxHi;
    } else {
      const derived = deriveCanvasPxFromBlitter(wi, hi, blitter) ?? inferAutoCanvasPx(blobLen, wi);
      if (!derived) {
        this.fail(
          "ZRDL_BAD_PARAMS",
          "drawCanvas: unable to infer pxWidth/pxHeight; pass explicit pixel dimensions",
        );
        return;
      }
      resolvedPxW = derived.pxWidth;
      resolvedPxH = derived.pxHeight;
    }

    if (
      resolvedPxW <= 0 ||
      resolvedPxH <= 0 ||
      resolvedPxW > MAX_U16 ||
      resolvedPxH > MAX_U16 ||
      wi > MAX_U16 ||
      hi > MAX_U16 ||
      xi > MAX_U16 ||
      yi > MAX_U16
    ) {
      this.fail("ZRDL_BAD_PARAMS", "drawCanvas: dst/px dimensions must be in range 1..65535");
      return;
    }

    const expectedBlobLen = resolvedPxW * resolvedPxH * 4;
    if (expectedBlobLen !== blobLen) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawCanvas: blob length mismatch (expected=${expectedBlobLen}, got=${blobLen})`,
      );
      return;
    }

    if (!this.beginCommandWrite("drawCanvas", DRAW_CANVAS_SIZE)) return;
    this.cmdLen = writeDrawCanvas(
      this.cmdBuf,
      this.cmdDv,
      this.cmdLen,
      xi,
      yi,
      wi,
      hi,
      resolvedPxW,
      resolvedPxH,
      blobOff,
      blobLen,
      blitterCode,
      0,
      0,
    );
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

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
  ): void {
    if (this.error) return;
    if (this.drawlistVersion < ZR_DRAWLIST_VERSION_V5) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawImage: requires drawlist version >= 5 (current=${this.drawlistVersion})`,
      );
      return;
    }

    const xi = this.validateParams ? this.requireI32NonNeg("drawImage", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32NonNeg("drawImage", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32Positive("drawImage", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32Positive("drawImage", "h", h) : h | 0;
    const bi = this.validateParams
      ? this.requireU32("drawImage", "blobIndex", blobIndex)
      : blobIndex >>> 0;
    const imageIdU32 = this.validateParams
      ? this.requireU32("drawImage", "imageId", imageId)
      : imageId >>> 0;
    if (this.error) return;
    if (
      xi === null ||
      yi === null ||
      wi === null ||
      hi === null ||
      bi === null ||
      imageIdU32 === null
    )
      return;

    if (bi >= this.blobSpanOffs.length) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawImage: blobIndex out of range (blobIndex=${bi}, blobsCount=${this.blobSpanOffs.length})`,
      );
      return;
    }

    const formatCode = IMAGE_FORMAT_CODE[format];
    if (protocol === "blitter") {
      this.fail(
        "ZRDL_BAD_PARAMS",
        'drawImage: protocol "blitter" is not encoded in DRAW_IMAGE; use drawCanvas with RGBA bytes',
      );
      return;
    }
    const protocolCode = IMAGE_PROTOCOL_CODE[protocol];
    const fitCode = IMAGE_FIT_CODE[fit];
    if (formatCode === undefined || protocolCode === undefined || fitCode === undefined) {
      this.fail("ZRDL_BAD_PARAMS", "drawImage: invalid format/protocol/fit value");
      return;
    }

    const zLayerRaw = zLayer as number;
    if (this.validateParams && zLayerRaw !== -1 && zLayerRaw !== 0 && zLayerRaw !== 1) {
      this.fail("ZRDL_BAD_PARAMS", `drawImage: zLayer must be -1, 0, or 1 (got ${String(zLayer)})`);
      return;
    }
    const blobOff = this.blobSpanOffs[bi];
    const blobLen = this.blobSpanLens[bi];
    if (blobOff === undefined || blobLen === undefined) {
      this.fail("ZRDL_INTERNAL", "drawImage: blob span table is inconsistent");
      return;
    }

    let resolvedPxW: number | null = null;
    let resolvedPxH: number | null = null;
    if (pxWidth !== undefined || pxHeight !== undefined) {
      const pxWi = this.validateParams
        ? this.requireI32Positive("drawImage", "pxWidth", pxWidth)
        : (pxWidth ?? 0) | 0;
      const pxHi = this.validateParams
        ? this.requireI32Positive("drawImage", "pxHeight", pxHeight)
        : (pxHeight ?? 0) | 0;
      if (this.error) return;
      if (pxWi === null || pxHi === null) return;
      resolvedPxW = pxWi;
      resolvedPxH = pxHi;
    } else if (format === "rgba") {
      const pixels = blobLen >>> 2;
      if ((blobLen & 3) !== 0 || pixels === 0) {
        this.fail("ZRDL_BAD_PARAMS", "drawImage: RGBA blobs must be width*height*4 bytes");
        return;
      }
      if (wi > 0 && pixels % wi === 0) {
        resolvedPxW = wi;
        resolvedPxH = pixels / wi;
      } else if (hi > 0 && pixels % hi === 0) {
        resolvedPxW = pixels / hi;
        resolvedPxH = hi;
      } else {
        this.fail(
          "ZRDL_BAD_PARAMS",
          "drawImage: unable to infer RGBA dimensions; pass explicit pxWidth/pxHeight",
        );
        return;
      }
    } else {
      this.fail(
        "ZRDL_BAD_PARAMS",
        "drawImage: PNG format requires explicit pxWidth/pxHeight in draw command",
      );
      return;
    }

    if (
      resolvedPxW <= 0 ||
      resolvedPxH <= 0 ||
      resolvedPxW > MAX_U16 ||
      resolvedPxH > MAX_U16 ||
      wi > MAX_U16 ||
      hi > MAX_U16 ||
      xi > MAX_U16 ||
      yi > MAX_U16
    ) {
      this.fail("ZRDL_BAD_PARAMS", "drawImage: dst/px dimensions must be in range 1..65535");
      return;
    }

    if (format === "rgba") {
      const expectedBlobLen = resolvedPxW * resolvedPxH * 4;
      if (expectedBlobLen !== blobLen) {
        this.fail(
          "ZRDL_BAD_PARAMS",
          `drawImage: RGBA blob length mismatch (expected=${expectedBlobLen}, got=${blobLen})`,
        );
        return;
      }
    } else if (blobLen <= 0) {
      this.fail("ZRDL_BAD_PARAMS", "drawImage: PNG blob must be non-empty");
      return;
    }

    if (!this.beginCommandWrite("drawImage", DRAW_IMAGE_SIZE)) return;
    this.cmdLen = writeDrawImage(
      this.cmdBuf,
      this.cmdDv,
      this.cmdLen,
      xi,
      yi,
      wi,
      hi,
      resolvedPxW,
      resolvedPxH,
      blobOff,
      blobLen,
      imageIdU32,
      formatCode,
      protocolCode,
      zLayerRaw,
      fitCode,
      0,
      0,
      0,
    );
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  // =========================================================================
  // v1 Commands (copied from builder_v1.ts)
  // =========================================================================

  clear(): void {
    if (this.error) return;
    if (!this.beginCommandWrite("clear", CLEAR_SIZE)) return;
    this.cmdLen = writeClear(this.cmdBuf, this.cmdDv, this.cmdLen);
    this.cmdCount += 1;
    this.maybeFailTooLargeAfterWrite();
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    if (this.error) return;
    const wi = this.validateParams ? this.requireI32NonNeg("clearTo", "cols", cols) : cols | 0;
    const hi = this.validateParams ? this.requireI32NonNeg("clearTo", "rows", rows) : rows | 0;
    if (this.error) return;
    if (wi === null || hi === null) return;
    const w = wi < 0 ? 0 : wi;
    const h = hi < 0 ? 0 : hi;

    this.clear();
    this.fillRect(0, 0, w, h, style);
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("fillRect", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("fillRect", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32NonNeg("fillRect", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32NonNeg("fillRect", "h", h) : h | 0;
    if (this.error) return;
    if (xi === null || yi === null || wi === null || hi === null) return;
    const w0 = wi < 0 ? 0 : wi;
    const h0 = hi < 0 ? 0 : hi;

    const s = encodeStyle(style, null);

    if (!this.beginCommandWrite("fillRect", FILL_RECT_SIZE)) return;
    this.cmdLen = writeFillRect(this.cmdBuf, this.cmdDv, this.cmdLen, xi, yi, w0, h0, s);
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  drawText(x: number, y: number, text: string, style?: TextStyle): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("drawText", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("drawText", "y", y) : y | 0;
    if (this.error) return;
    if (xi === null || yi === null) return;

    if (typeof text !== "string") {
      this.fail("ZRDL_BAD_PARAMS", `drawText: text must be a string (got ${typeof text})`);
      return;
    }

    const stringIndex = this.internString(text);
    if (this.error) return;
    if (stringIndex === null) return;

    const byteLen = this.stringSpanLens[stringIndex];
    if (byteLen === undefined) {
      this.fail("ZRDL_INTERNAL", "drawText: interned string has no recorded span length");
      return;
    }

    const s = encodeStyle(style, this.currentLinkRefs());

    if (!this.beginCommandWrite("drawText", DRAW_TEXT_SIZE)) return;
    this.cmdLen = writeDrawText(
      this.cmdBuf,
      this.cmdDv,
      this.cmdLen,
      xi,
      yi,
      stringIndex,
      0,
      byteLen,
      s,
      0,
    );
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("pushClip", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("pushClip", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32NonNeg("pushClip", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32NonNeg("pushClip", "h", h) : h | 0;
    if (this.error) return;
    if (xi === null || yi === null || wi === null || hi === null) return;
    const w0 = wi < 0 ? 0 : wi;
    const h0 = hi < 0 ? 0 : hi;

    if (!this.beginCommandWrite("pushClip", PUSH_CLIP_SIZE)) return;
    this.cmdLen = writePushClip(this.cmdBuf, this.cmdDv, this.cmdLen, xi, yi, w0, h0);
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  popClip(): void {
    if (this.error) return;
    if (!this.beginCommandWrite("popClip", POP_CLIP_SIZE)) return;
    this.cmdLen = writePopClip(this.cmdBuf, this.cmdDv, this.cmdLen);
    this.cmdCount += 1;
    this.maybeFailTooLargeAfterWrite();
  }

  addBlob(bytes: Uint8Array): number | null {
    if (this.error) return null;

    if (!(bytes instanceof Uint8Array)) {
      this.fail("ZRDL_BAD_PARAMS", "addBlob: bytes must be a Uint8Array");
      return null;
    }
    const byteLen = bytes.byteLength;
    if (!Number.isInteger(byteLen) || byteLen < 0) {
      this.fail("ZRDL_BAD_PARAMS", "addBlob: bytes.byteLength must be a non-negative integer");
      return null;
    }
    if ((byteLen & 3) !== 0) {
      this.fail("ZRDL_BAD_PARAMS", "addBlob: blob length must be 4-byte aligned");
      return null;
    }

    const nextIndex = this.blobSpanOffs.length;
    if (nextIndex + 1 > this.maxBlobs) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `addBlob: maxBlobs exceeded (count=${nextIndex + 1}, max=${this.maxBlobs})`,
      );
      return null;
    }

    const nextBytesLen = this.blobBytesLen + byteLen;
    if (nextBytesLen > this.maxBlobBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `addBlob: maxBlobBytes exceeded (bytes=${nextBytesLen}, max=${this.maxBlobBytes})`,
      );
      return null;
    }

    if ((this.blobBytesLen & 3) !== 0) {
      this.fail("ZRDL_INTERNAL", "addBlob: blob cursor is not 4-byte aligned");
      return null;
    }

    this.ensureBlobBytesCapacity(nextBytesLen);
    if (this.error) return null;

    const off = this.blobBytesLen;
    this.blobBytesBuf.set(bytes, off);
    this.blobBytesLen = nextBytesLen;
    this.blobSpanOffs.push(off);
    this.blobSpanLens.push(byteLen);

    this.maybeFailTooLargeAfterWrite();
    return nextIndex;
  }

  addTextRunBlob(segments: readonly DrawlistTextRunSegment[]): number | null {
    if (this.error) return null;

    if (!Array.isArray(segments)) {
      this.fail("ZRDL_BAD_PARAMS", "addTextRunBlob: segments must be an array");
      return null;
    }
    if (segments.length === 0) {
      this.fail("ZRDL_BAD_PARAMS", "addTextRunBlob: segments must be non-empty");
      return null;
    }
    if (segments.length > 0xffff_ffff) {
      this.fail("ZRDL_BAD_PARAMS", "addTextRunBlob: segments length exceeds u32");
      return null;
    }

    const blobLen = 4 + segments.length * 40;
    const blob = new Uint8Array(blobLen);
    const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    dv.setUint32(0, segments.length >>> 0, true);

    let off = 4;
    for (const seg0 of segments as readonly unknown[]) {
      if (!isTextRunSegment(seg0)) {
        this.fail(
          "ZRDL_BAD_PARAMS",
          "addTextRunBlob: each segment must be an object with { text: string, style?: TextStyle }",
        );
        return null;
      }

      const stringIndex = this.internString(seg0.text);
      if (this.error) return null;
      if (stringIndex === null) return null;

      const byteLen = this.stringSpanLens[stringIndex];
      if (byteLen === undefined) {
        this.fail("ZRDL_INTERNAL", "addTextRunBlob: interned string has no recorded span length");
        return null;
      }

      const s = encodeStyle(seg0.style, this.currentLinkRefs());
      dv.setUint32(off + 0, s.fg >>> 0, true);
      dv.setUint32(off + 4, s.bg >>> 0, true);
      dv.setUint32(off + 8, s.attrs >>> 0, true);
      dv.setUint32(off + 12, s.reserved >>> 0, true);
      dv.setUint32(off + 16, s.underlineRgb >>> 0, true);
      dv.setUint32(off + 20, s.linkUriRef >>> 0, true);
      dv.setUint32(off + 24, s.linkIdRef >>> 0, true);
      dv.setUint32(off + 28, stringIndex >>> 0, true);
      dv.setUint32(off + 32, 0, true);
      dv.setUint32(off + 36, byteLen >>> 0, true);
      off += 40;
    }

    return this.addBlob(blob);
  }

  drawTextRun(x: number, y: number, blobIndex: number): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("drawTextRun", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("drawTextRun", "y", y) : y | 0;
    if (this.error) return;
    if (xi === null || yi === null) return;

    const bi = this.validateParams ? blobIndex : blobIndex >>> 0;
    if (this.validateParams) {
      if (!Number.isFinite(bi) || !Number.isInteger(bi) || bi < 0 || bi > 0xffff_ffff) {
        this.fail("ZRDL_BAD_PARAMS", "drawTextRun: blobIndex must be a u32");
        return;
      }
    }
    if (bi >= this.blobSpanOffs.length) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawTextRun: blobIndex out of range (blobIndex=${bi}, blobsCount=${this.blobSpanOffs.length})`,
      );
      return;
    }

    if (!this.beginCommandWrite("drawTextRun", DRAW_TEXT_RUN_SIZE)) return;
    this.cmdLen = writeDrawTextRun(this.cmdBuf, this.cmdDv, this.cmdLen, xi, yi, bi, 0);
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  build(): DrawlistBuildResult {
    if (this.error) {
      return { ok: false, error: this.error };
    }

    if ((this.cmdLen & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: command stream is not 4-byte aligned" },
      };
    }

    const cmdCount = this.cmdCount;
    let cursor = HEADER_SIZE;

    const cmdBytes = cmdCount === 0 ? 0 : this.cmdLen;
    const cmdOffset = cmdCount === 0 ? 0 : cursor;
    cursor += cmdBytes;

    const stringsCount = this.stringSpanOffs.length;
    const stringsSpanBytes = stringsCount * 8;
    const stringsSpanOffset = stringsCount === 0 ? 0 : cursor;
    cursor += stringsSpanBytes;
    const stringsBytesOffset = stringsCount === 0 ? 0 : cursor;
    const stringsBytesLenRaw = this.stringBytesLen;
    const stringsBytesLen = stringsCount === 0 ? 0 : align4(stringsBytesLenRaw);
    cursor += stringsBytesLen;

    const blobsCount = this.blobSpanOffs.length;
    const blobsSpanBytes = blobsCount * 8;
    const blobsSpanOffset = blobsCount === 0 ? 0 : cursor;
    cursor += blobsSpanBytes;
    const blobsBytesOffset = blobsCount === 0 ? 0 : cursor;
    const blobsBytesLenRaw = this.blobBytesLen;
    const blobsBytesLen = blobsCount === 0 ? 0 : align4(blobsBytesLenRaw);
    cursor += blobsBytesLen;

    const totalSize = cursor;

    const formatFail = this.validateLayout({
      cmdOffset,
      cmdBytes,
      cmdCount,
      stringsSpanOffset,
      stringsCount,
      stringsSpanBytes,
      stringsBytesOffset,
      stringsBytesLen,
      blobsSpanOffset,
      blobsCount,
      blobsBytesOffset,
      blobsBytesLen,
      totalSize,
    });
    if (formatFail) return formatFail;

    if (totalSize > this.maxDrawlistBytes) {
      return {
        ok: false,
        error: {
          code: "ZRDL_TOO_LARGE",
          detail: `build: maxDrawlistBytes exceeded (total=${totalSize}, max=${this.maxDrawlistBytes})`,
        },
      };
    }

    const outBuf = this.reuseOutputBuffer
      ? this.ensureOutputCapacity(totalSize)
      : new Uint8Array(totalSize);
    if (this.error) {
      return { ok: false, error: this.error };
    }
    const out = this.reuseOutputBuffer ? outBuf.subarray(0, totalSize) : outBuf;
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);

    // Header (64 bytes) — version = 3/4/5
    dv.setUint32(0, ZRDL_MAGIC, true);
    dv.setUint32(4, this.drawlistVersion, true);
    dv.setUint32(8, HEADER_SIZE, true);
    dv.setUint32(12, totalSize, true);
    dv.setUint32(16, cmdOffset, true);
    dv.setUint32(20, cmdBytes, true);
    dv.setUint32(24, cmdCount, true);
    dv.setUint32(28, stringsSpanOffset, true);
    dv.setUint32(32, stringsCount, true);
    dv.setUint32(36, stringsBytesOffset, true);
    dv.setUint32(40, stringsBytesLen, true);
    dv.setUint32(44, blobsSpanOffset, true);
    dv.setUint32(48, blobsCount, true);
    dv.setUint32(52, blobsBytesOffset, true);
    dv.setUint32(56, blobsBytesLen, true);
    dv.setUint32(60, 0, true);

    // Command stream
    out.set(this.cmdBuf.subarray(0, cmdBytes), cmdOffset);

    // String span table
    let spanOff = stringsSpanOffset;
    for (let i = 0; i < stringsCount; i++) {
      const off = this.stringSpanOffs[i];
      const len = this.stringSpanLens[i];
      if (off === undefined || len === undefined) {
        return {
          ok: false,
          error: { code: "ZRDL_INTERNAL", detail: "build: string span table is inconsistent" },
        };
      }

      dv.setUint32(spanOff, off >>> 0, true);
      dv.setUint32(spanOff + 4, len >>> 0, true);
      spanOff += 8;
    }

    // String bytes
    out.set(this.stringBytesBuf.subarray(0, stringsBytesLenRaw), stringsBytesOffset);
    if (this.reuseOutputBuffer && stringsBytesLen > stringsBytesLenRaw) {
      out.fill(0, stringsBytesOffset + stringsBytesLenRaw, stringsBytesOffset + stringsBytesLen);
    }

    // Blob span table
    spanOff = blobsSpanOffset;
    for (let i = 0; i < blobsCount; i++) {
      const off = this.blobSpanOffs[i];
      const len = this.blobSpanLens[i];
      if (off === undefined || len === undefined) {
        return {
          ok: false,
          error: { code: "ZRDL_INTERNAL", detail: "build: blob span table is inconsistent" },
        };
      }

      dv.setUint32(spanOff, off >>> 0, true);
      dv.setUint32(spanOff + 4, len >>> 0, true);
      spanOff += 8;
    }

    // Blob bytes
    out.set(this.blobBytesBuf.subarray(0, blobsBytesLenRaw), blobsBytesOffset);
    if (this.reuseOutputBuffer && blobsBytesLen > blobsBytesLenRaw) {
      out.fill(0, blobsBytesOffset + blobsBytesLenRaw, blobsBytesOffset + blobsBytesLen);
    }

    return { ok: true, bytes: out };
  }

  reset(): void {
    this.error = undefined;
    if (!this.encoder) {
      this.fail("ZRDL_INTERNAL", "TextEncoder is not available in this environment");
      return;
    }

    this.cmdLen = 0;
    this.cmdCount = 0;

    this.stringIndexByValue.clear();
    this.stringSpanOffs.length = 0;
    this.stringSpanLens.length = 0;
    this.stringBytesLen = 0;

    this.blobSpanOffs.length = 0;
    this.blobSpanLens.length = 0;
    this.blobBytesLen = 0;
    this.activeLinkUriRef = 0;
    this.activeLinkIdRef = 0;
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private requirePositiveInt(name: string, v: number): number {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `DrawlistBuilderV3: ${name} must be a positive integer (got ${String(v)})`,
      );
      return 1;
    }
    if (v > 0x7fff_ffff) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `DrawlistBuilderV3: ${name} must be <= 2147483647 (got ${String(v)})`,
      );
      return 1;
    }
    return v;
  }

  private requireNonNegativeInt(name: string, v: number): number {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `DrawlistBuilderV3: ${name} must be a non-negative integer (got ${String(v)})`,
      );
      return 0;
    }
    if (v > 0x7fff_ffff) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `DrawlistBuilderV3: ${name} must be <= 2147483647 (got ${String(v)})`,
      );
      return 0;
    }
    return v;
  }

  private requireI32(method: string, name: string, v: number): number | null {
    if (!Number.isFinite(v)) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} must be finite (got ${String(v)})`);
      return null;
    }
    if (!Number.isInteger(v) || v < INT32_MIN || v > INT32_MAX) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} must be an int32 (got ${String(v)})`);
      return null;
    }
    return v | 0;
  }

  private requireI32NonNeg(method: string, name: string, v: number): number | null {
    const iv = this.requireI32(method, name, v);
    if (iv === null) return null;
    if (iv < 0) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} must be >= 0 (got ${String(v)})`);
      return null;
    }
    return iv;
  }

  private requireI32Positive(method: string, name: string, v: number | undefined): number | null {
    if (v === undefined) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} is required`);
      return null;
    }
    const iv = this.requireI32(method, name, v);
    if (iv === null) return null;
    if (iv <= 0) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} must be > 0 (got ${String(v)})`);
      return null;
    }
    return iv;
  }

  private requireU32(method: string, name: string, v: number): number | null {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 0xffff_ffff) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} must be a u32 (got ${String(v)})`);
      return null;
    }
    return v >>> 0;
  }

  private currentLinkRefs(): LinkRefs | null {
    if (this.activeLinkUriRef === 0) return null;
    return Object.freeze({
      uriRef: this.activeLinkUriRef >>> 0,
      idRef: this.activeLinkIdRef >>> 0,
    });
  }

  private fail(code: DrawlistBuildErrorCode, detail: string): void {
    if (this.error) return;
    this.error = { code, detail };
  }

  private internString(text: string): number | null {
    const existing = this.stringIndexByValue.get(text);
    if (existing !== undefined) return existing;

    if (!this.encoder) {
      this.fail("ZRDL_INTERNAL", "drawText: TextEncoder is not available");
      return null;
    }

    const nextIndex = this.stringSpanOffs.length;
    if (nextIndex + 1 > this.maxStrings) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `drawText: maxStrings exceeded (count=${nextIndex + 1}, max=${this.maxStrings})`,
      );
      return null;
    }

    const cached = this.encodedStringCache?.get(text);
    const encoded = cached ?? this.encoder.encode(text);
    if (!cached && this.encodedStringCache) {
      if (this.encodedStringCache.size >= this.encodedStringCacheCap) {
        this.encodedStringCache.clear();
      }
      this.encodedStringCache.set(text, encoded);
    }
    const byteLen = encoded.byteLength;

    const nextBytesLen = this.stringBytesLen + byteLen;
    if (nextBytesLen > this.maxStringBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `drawText: maxStringBytes exceeded (bytes=${nextBytesLen}, max=${this.maxStringBytes})`,
      );
      return null;
    }

    this.ensureStringBytesCapacity(nextBytesLen);
    if (this.error) return null;

    const off = this.stringBytesLen;
    this.stringBytesBuf.set(encoded, off);
    this.stringBytesLen = nextBytesLen;
    this.stringSpanOffs.push(off);
    this.stringSpanLens.push(byteLen);
    this.stringIndexByValue.set(text, nextIndex);

    this.maybeFailTooLargeAfterWrite();

    return nextIndex;
  }

  private ensureCmdCapacity(required: number): void {
    if (required <= this.cmdBuf.byteLength) return;

    const minTotal = HEADER_SIZE + required;
    if (minTotal > this.maxDrawlistBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `command stream exceeds maxDrawlistBytes (minTotal=${minTotal}, max=${this.maxDrawlistBytes})`,
      );
      return;
    }

    let nextCap = this.cmdBuf.byteLength;
    while (nextCap < required) nextCap = Math.min(nextCap * 2, this.maxDrawlistBytes);
    if (nextCap < required) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `command stream exceeds maxDrawlistBytes (required=${required}, max=${this.maxDrawlistBytes})`,
      );
      return;
    }

    const next = new Uint8Array(nextCap);
    next.set(this.cmdBuf.subarray(0, this.cmdLen));
    this.cmdBuf = next;
    this.cmdDv = new DataView(this.cmdBuf.buffer, this.cmdBuf.byteOffset, this.cmdBuf.byteLength);
  }

  private ensureOutputCapacity(required: number): Uint8Array {
    const existing = this.outBuf;
    if (existing && existing.byteLength >= required) return existing;

    let nextCap = existing ? existing.byteLength : 0;
    if (nextCap === 0) nextCap = Math.min(4096, this.maxDrawlistBytes);
    while (nextCap < required) nextCap = Math.min(nextCap * 2, this.maxDrawlistBytes);

    if (nextCap < required) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `output buffer exceeds maxDrawlistBytes (required=${required}, max=${this.maxDrawlistBytes})`,
      );
      return existing ?? new Uint8Array(required);
    }

    const next = new Uint8Array(nextCap);
    this.outBuf = next;
    return next;
  }

  private ensureStringBytesCapacity(required: number): void {
    if (required <= this.stringBytesBuf.byteLength) return;
    if (required > this.maxStringBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `string bytes exceed maxStringBytes (required=${required}, max=${this.maxStringBytes})`,
      );
      return;
    }

    let nextCap = this.stringBytesBuf.byteLength;
    while (nextCap < required) nextCap = Math.min(nextCap * 2, this.maxStringBytes);
    if (nextCap < required) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `string bytes exceed maxStringBytes (required=${required}, max=${this.maxStringBytes})`,
      );
      return;
    }

    const next = new Uint8Array(nextCap);
    next.set(this.stringBytesBuf.subarray(0, this.stringBytesLen));
    this.stringBytesBuf = next;
  }

  private ensureBlobBytesCapacity(required: number): void {
    if (required <= this.blobBytesBuf.byteLength) return;
    if (required > this.maxBlobBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `blob bytes exceed maxBlobBytes (required=${required}, max=${this.maxBlobBytes})`,
      );
      return;
    }

    let nextCap = this.blobBytesBuf.byteLength;
    while (nextCap < required) nextCap = Math.min(nextCap * 2, this.maxBlobBytes);
    if (nextCap < required) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `blob bytes exceed maxBlobBytes (required=${required}, max=${this.maxBlobBytes})`,
      );
      return;
    }

    const next = new Uint8Array(nextCap);
    next.set(this.blobBytesBuf.subarray(0, this.blobBytesLen));
    this.blobBytesBuf = next;
  }

  private beginCommandWrite(method: string, size: number): boolean {
    if (this.error) return false;

    if (this.cmdCount + 1 > this.maxCmdCount) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `maxCmdCount exceeded (count=${this.cmdCount + 1}, max=${this.maxCmdCount})`,
      );
      return false;
    }

    if ((this.cmdLen & 3) !== 0) {
      this.fail("ZRDL_INTERNAL", "writeCommandHeader: cmd cursor is not 4-byte aligned");
      return false;
    }

    const required = this.cmdLen + size;
    this.ensureCmdCapacity(required);
    if (this.error) return false;

    if (required > this.cmdBuf.byteLength) {
      this.failCapacity(method, size);
      return false;
    }
    return true;
  }

  private failCapacity(method: string, size: number): void {
    const required = this.cmdLen + size;
    this.fail(
      "ZRDL_TOO_LARGE",
      `${method}: command stream exceeds maxDrawlistBytes (required=${required}, max=${this.maxDrawlistBytes})`,
    );
  }

  private maybeFailTooLargeAfterWrite(): void {
    if (this.error) return;

    const estimate = this.estimateTotalSize();
    if (estimate > this.maxDrawlistBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `maxDrawlistBytes exceeded (estimatedTotal=${estimate}, max=${this.maxDrawlistBytes})`,
      );
    }
  }

  private estimateTotalSize(): number {
    const cmdOffset = HEADER_SIZE;
    const cmdBytes = this.cmdLen;

    const stringsCount = this.stringSpanOffs.length;
    const stringsSpanBytes = stringsCount * 8;
    const stringsSpanOffset = cmdOffset + cmdBytes;
    const stringsBytesOffset = stringsSpanOffset + stringsSpanBytes;
    const stringsBytesAligned = align4(this.stringBytesLen);

    const blobsCount = this.blobSpanOffs.length;
    const blobsSpanBytes = blobsCount * 8;
    const blobsSpanOffset = stringsBytesOffset + stringsBytesAligned;
    const blobsBytesOffset = blobsSpanOffset + blobsSpanBytes;
    const blobsBytesAligned = align4(this.blobBytesLen);

    return blobsBytesOffset + blobsBytesAligned;
  }

  private validateLayout(
    layout: Readonly<{
      cmdOffset: number;
      cmdBytes: number;
      cmdCount: number;
      stringsSpanOffset: number;
      stringsCount: number;
      stringsSpanBytes: number;
      stringsBytesOffset: number;
      stringsBytesLen: number;
      blobsSpanOffset: number;
      blobsCount: number;
      blobsBytesOffset: number;
      blobsBytesLen: number;
      totalSize: number;
    }>,
  ): DrawlistBuildResult | null {
    const {
      cmdOffset,
      cmdBytes,
      cmdCount,
      stringsSpanOffset,
      stringsCount,
      stringsSpanBytes,
      stringsBytesOffset,
      stringsBytesLen,
      blobsSpanOffset,
      blobsCount,
      blobsBytesOffset,
      blobsBytesLen,
      totalSize,
    } = layout;

    if (cmdCount === 0) {
      if (cmdOffset !== 0 || cmdBytes !== 0) {
        return {
          ok: false,
          error: {
            code: "ZRDL_FORMAT",
            detail: "build: cmdOffset/cmdBytes must be 0 when cmdCount is 0",
          },
        };
      }
    } else if (cmdOffset !== HEADER_SIZE) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: `build: cmdOffset must be ${HEADER_SIZE}` },
      };
    }
    if ((cmdOffset & 3) !== 0) {
      return { ok: false, error: { code: "ZRDL_FORMAT", detail: "build: cmdOffset misaligned" } };
    }
    if ((cmdBytes & 3) !== 0) {
      return { ok: false, error: { code: "ZRDL_FORMAT", detail: "build: cmdBytes misaligned" } };
    }
    if (cmdCount !== this.cmdCount) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: cmdCount mismatch" },
      };
    }
    if ((stringsSpanOffset & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: stringsSpanOffset misaligned" },
      };
    }
    if (stringsCount !== this.stringSpanOffs.length) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: stringsCount mismatch" },
      };
    }
    if (stringsSpanBytes !== stringsCount * 8) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: stringsSpanBytes mismatch" },
      };
    }
    if (stringsCount === 0) {
      if (stringsSpanOffset !== 0 || stringsBytesOffset !== 0 || stringsBytesLen !== 0) {
        return {
          ok: false,
          error: {
            code: "ZRDL_FORMAT",
            detail: "build: strings offsets/len must be 0 when stringsCount is 0",
          },
        };
      }
    }
    if ((stringsBytesOffset & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: stringsBytesOffset misaligned" },
      };
    }
    if ((stringsBytesLen & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: stringsBytesLen misaligned" },
      };
    }
    if (stringsBytesLen !== align4(this.stringBytesLen)) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: stringsBytesLen mismatch" },
      };
    }
    if ((blobsSpanOffset & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: blobsSpanOffset misaligned" },
      };
    }
    if (blobsCount !== this.blobSpanOffs.length) {
      return { ok: false, error: { code: "ZRDL_INTERNAL", detail: "build: blobsCount mismatch" } };
    }
    if (blobsCount === 0) {
      if (blobsSpanOffset !== 0 || blobsBytesOffset !== 0 || blobsBytesLen !== 0) {
        return {
          ok: false,
          error: {
            code: "ZRDL_FORMAT",
            detail: "build: blobs offsets/len must be 0 when blobsCount is 0",
          },
        };
      }
    }
    if ((blobsBytesOffset & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: blobsBytesOffset misaligned" },
      };
    }
    if ((blobsBytesLen & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: blobsBytesLen misaligned" },
      };
    }
    if (blobsBytesLen !== align4(this.blobBytesLen)) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: blobsBytesLen mismatch" },
      };
    }
    if ((totalSize & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_FORMAT", detail: "build: totalSize must be 4-byte aligned" },
      };
    }
    if (totalSize < HEADER_SIZE) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: totalSize underflow" },
      };
    }

    return null;
  }
}
