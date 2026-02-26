import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1 } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";
import {
  DEFAULT_MAX_BLOB_BYTES,
  DEFAULT_MAX_BLOBS,
  DEFAULT_MAX_CMD_COUNT,
  DEFAULT_MAX_DRAWLIST_BYTES,
  DEFAULT_MAX_STRINGS,
  DEFAULT_MAX_STRING_BYTES,
  HEADER_SIZE,
  INT32_MAX,
  INT32_MIN,
  type DrawlistBuilderBaseOpts,
  packRgb,
} from "./builderBase.js";
import type {
  CursorState,
  DrawlistBuildError,
  DrawlistBuildResult,
  DrawlistBuilderV3,
  DrawlistCanvasBlitter,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
  DrawlistTextRunSegment,
  EncodedStyle,
} from "./types.js";
import {
  CLEAR_SIZE,
  DEF_BLOB_BASE_SIZE,
  DEF_STRING_BASE_SIZE,
  DRAW_CANVAS_SIZE,
  DRAW_IMAGE_SIZE,
  DRAW_TEXT_RUN_SIZE,
  DRAW_TEXT_SIZE,
  FILL_RECT_SIZE,
  FREE_BLOB_SIZE,
  FREE_STRING_SIZE,
  POP_CLIP_SIZE,
  PUSH_CLIP_SIZE,
  SET_CURSOR_SIZE,
  writeClear,
  writeDefBlob,
  writeDefString,
  writeDrawCanvas,
  writeDrawImage,
  writeDrawText,
  writeDrawTextRun,
  writeFillRect,
  writeFreeBlob,
  writeFreeString,
  writePopClip,
  writePushClip,
  writeSetCursor,
} from "./writers.gen.js";

export type DrawlistBuilderV3Opts = Readonly<
  DrawlistBuilderBaseOpts & {
    /**
     * Deprecated compatibility option. ZRDL v1 is always used.
     * Older values are accepted and ignored.
     */
    drawlistVersion?: number;
  }
>;

export type DrawlistBuilderV1Opts = DrawlistBuilderV3Opts;

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

const ENCODED_STRING_CACHE_MAX_KEY_LENGTH = 96;
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

type Utf8Encoder = Readonly<{ encode(input: string): Uint8Array }>;

type StringResource = {
  id: number;
  value: string;
  bytes: Uint8Array;
  lastUsedTick: number;
  generationDefined: number;
  pinnedFrame: number;
  blobRefCount: number;
};

type BlobResource = {
  id: number;
  key: string;
  bytes: Uint8Array;
  lastUsedTick: number;
  generationDefined: number;
  pinnedFrame: number;
  stringDeps: readonly number[];
};

type LinkRefs = Readonly<{ uriRef: number; idRef: number }>;

type PreludeEncoding = Readonly<{
  bytes: Uint8Array;
  byteLen: number;
  cmdCount: number;
}>;

function align4(n: number): number {
  return (n + 3) & ~3;
}

function encodeUnderlineStyle(style: string | undefined): number {
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
): Readonly<{ pxWidth: number; pxHeight: number }> | null {
  if (blitter === "auto") return null;
  const res = BLITTER_SUBCELL_RESOLUTION[blitter];
  if (!res) return null;
  return Object.freeze({ pxWidth: cols * res.subW, pxHeight: rows * res.subH });
}

function inferAutoCanvasPx(
  blobLen: number,
  cols: number,
): Readonly<{ pxWidth: number; pxHeight: number }> | null {
  if (blobLen <= 0 || (blobLen & 3) !== 0) return null;
  const pixels = blobLen >>> 2;
  const pxWidth = cols > 0 ? cols : 1;
  if (pxWidth <= 0 || pixels % pxWidth !== 0) return null;
  const pxHeight = pixels / pxWidth;
  if (pxHeight <= 0) return null;
  return Object.freeze({ pxWidth, pxHeight });
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hashBytesFnv1a32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.byteLength; i++) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function normalizeStableKey(prefix: string, key: string): string {
  return `${prefix}:${key}`;
}

export function createDrawlistBuilderV1(opts: DrawlistBuilderV1Opts = {}): DrawlistBuilderV3 {
  return new DrawlistBuilderV1Impl(opts);
}

export function createDrawlistBuilderV3(opts: DrawlistBuilderV3Opts = {}): DrawlistBuilderV3 {
  return createDrawlistBuilderV1(opts);
}

class DrawlistBuilderV1Impl implements DrawlistBuilderV3 {
  readonly drawlistVersion = 1 as const;

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
  private readonly encodedStringCache: Map<string, Uint8Array> | null;

  private drawBuf: Uint8Array;
  private drawDv: DataView;
  private drawLen = 0;
  private drawCmdCount = 0;

  private outBuf: Uint8Array | null = null;

  private error: DrawlistBuildError | undefined;

  private readonly stringByValue = new Map<string, StringResource>();
  private readonly stringById = new Map<number, StringResource>();
  private stringBytesTotal = 0;
  private readonly freeStringIds: number[] = [];
  private nextStringId = 1;

  private readonly blobByKey = new Map<string, BlobResource>();
  private readonly blobById = new Map<number, BlobResource>();
  private blobBytesTotal = 0;
  private readonly freeBlobIds: number[] = [];
  private nextBlobId = 1;

  private readonly pendingFreeStringIds: number[] = [];
  private readonly pendingFreeBlobIds: number[] = [];
  private readonly pendingFreeStringSet = new Set<number>();
  private readonly pendingFreeBlobSet = new Set<number>();

  private readonly frameDefStrings = new Map<number, StringResource>();
  private readonly frameDefBlobs = new Map<number, BlobResource>();

  private engineGeneration = 1;
  private lruTick = 0;
  private frameSeq = 1;
  private builtThisFrame = false;
  private frameResourceMutations = false;

  private activeLinkUriId = 0;
  private activeLinkId = 0;

  constructor(opts: DrawlistBuilderV1Opts) {
    const _deprecatedVersion = opts.drawlistVersion;
    void _deprecatedVersion;

    const maxDrawlistBytes = opts.maxDrawlistBytes ?? DEFAULT_MAX_DRAWLIST_BYTES;
    const maxCmdCount = opts.maxCmdCount ?? DEFAULT_MAX_CMD_COUNT;
    const maxBlobBytes = opts.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;
    const maxBlobs = opts.maxBlobs ?? DEFAULT_MAX_BLOBS;
    const maxStringBytes = opts.maxStringBytes ?? DEFAULT_MAX_STRING_BYTES;
    const maxStrings = opts.maxStrings ?? DEFAULT_MAX_STRINGS;
    const validateParams = opts.validateParams ?? true;
    const reuseOutputBuffer = opts.reuseOutputBuffer === true;
    const encodedStringCacheCap = opts.encodedStringCacheCap ?? 0;

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
    this.drawBuf = new Uint8Array(initialCmdCap);
    this.drawDv = new DataView(this.drawBuf.buffer, this.drawBuf.byteOffset, this.drawBuf.byteLength);

    this.encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : undefined;
    if (!this.encoder) {
      this.fail("ZRDL_INTERNAL", "TextEncoder is not available in this environment");
    }
  }

  clear(): void {
    if (this.error) return;
    if (!this.beginDrawCommand("clear", CLEAR_SIZE)) return;
    this.drawLen = writeClear(this.drawBuf, this.drawDv, this.drawLen);
    this.drawCmdCount += 1;
  }

  clearTo(cols: number, rows: number, style?: TextStyle): void {
    if (this.error) return;
    const wi = this.validateParams ? this.requireI32NonNeg("clearTo", "cols", cols) : cols | 0;
    const hi = this.validateParams ? this.requireI32NonNeg("clearTo", "rows", rows) : rows | 0;
    if (this.error) return;
    if (wi === null || hi === null) return;

    this.clear();
    this.fillRect(0, 0, wi, hi, style);
  }

  fillRect(x: number, y: number, w: number, h: number, style?: TextStyle): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("fillRect", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("fillRect", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32NonNeg("fillRect", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32NonNeg("fillRect", "h", h) : h | 0;
    if (this.error) return;
    if (xi === null || yi === null || wi === null || hi === null) return;

    const encodedStyle = encodeStyle(style, null);
    if (!this.beginDrawCommand("fillRect", FILL_RECT_SIZE)) return;
    this.drawLen = writeFillRect(this.drawBuf, this.drawDv, this.drawLen, xi, yi, wi, hi, encodedStyle);
    this.drawCmdCount += 1;
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

    const stringId = this.internString(text);
    if (this.error || stringId === null) return;
    const stringEntry = this.stringById.get(stringId);
    if (!stringEntry) {
      this.fail("ZRDL_INTERNAL", "drawText: interned string entry missing");
      return;
    }

    if (!this.beginDrawCommand("drawText", DRAW_TEXT_SIZE)) return;
    this.drawLen = writeDrawText(
      this.drawBuf,
      this.drawDv,
      this.drawLen,
      xi,
      yi,
      stringId,
      0,
      stringEntry.bytes.byteLength,
      encodeStyle(style, this.currentLinkRefs()),
      0,
    );
    this.drawCmdCount += 1;
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("pushClip", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("pushClip", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32NonNeg("pushClip", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32NonNeg("pushClip", "h", h) : h | 0;
    if (this.error) return;
    if (xi === null || yi === null || wi === null || hi === null) return;

    if (!this.beginDrawCommand("pushClip", PUSH_CLIP_SIZE)) return;
    this.drawLen = writePushClip(this.drawBuf, this.drawDv, this.drawLen, xi, yi, wi, hi);
    this.drawCmdCount += 1;
  }

  popClip(): void {
    if (this.error) return;
    if (!this.beginDrawCommand("popClip", POP_CLIP_SIZE)) return;
    this.drawLen = writePopClip(this.drawBuf, this.drawDv, this.drawLen);
    this.drawCmdCount += 1;
  }

  addBlob(bytes: Uint8Array, stableKey?: string): number | null {
    return this.addBlobInternal(bytes, stableKey === undefined ? undefined : normalizeStableKey("u", stableKey));
  }

  addTextRunBlob(segments: readonly DrawlistTextRunSegment[], stableKey?: string): number | null {
    if (this.error) return null;

    if (!Array.isArray(segments)) {
      this.fail("ZRDL_BAD_PARAMS", "addTextRunBlob: segments must be an array");
      return null;
    }
    if (segments.length === 0) {
      this.fail("ZRDL_BAD_PARAMS", "addTextRunBlob: segments must be non-empty");
      return null;
    }

    const SEGMENT_SIZE = 40;
    const blob = new Uint8Array(4 + segments.length * SEGMENT_SIZE);
    const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    dv.setUint32(0, segments.length >>> 0, true);

    const depSet = new Set<number>();

    let off = 4;
    for (const seg0 of segments as readonly unknown[]) {
      if (typeof seg0 !== "object" || seg0 === null || typeof (seg0 as { text?: unknown }).text !== "string") {
        this.fail(
          "ZRDL_BAD_PARAMS",
          "addTextRunBlob: each segment must be { text: string; style?: TextStyle }",
        );
        return null;
      }
      const seg = seg0 as DrawlistTextRunSegment;
      const stringId = this.internString(seg.text);
      if (this.error || stringId === null) return null;
      const stringEntry = this.stringById.get(stringId);
      if (!stringEntry) {
        this.fail("ZRDL_INTERNAL", "addTextRunBlob: interned string entry missing");
        return null;
      }
      depSet.add(stringId);

      const encoded = encodeStyle(seg.style, this.currentLinkRefs());
      dv.setUint32(off + 0, encoded.fg >>> 0, true);
      dv.setUint32(off + 4, encoded.bg >>> 0, true);
      dv.setUint32(off + 8, encoded.attrs >>> 0, true);
      dv.setUint32(off + 12, encoded.reserved >>> 0, true);
      dv.setUint32(off + 16, encoded.underlineRgb >>> 0, true);
      dv.setUint32(off + 20, encoded.linkUriRef >>> 0, true);
      dv.setUint32(off + 24, encoded.linkIdRef >>> 0, true);
      dv.setUint32(off + 28, stringId >>> 0, true);
      dv.setUint32(off + 32, 0, true);
      dv.setUint32(off + 36, stringEntry.bytes.byteLength >>> 0, true);
      off += SEGMENT_SIZE;
    }

    const key =
      stableKey === undefined
        ? undefined
        : normalizeStableKey("tr", stableKey);

    return this.addBlobInternal(blob, key, [...depSet]);
  }

  drawTextRun(x: number, y: number, blobId: number): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("drawTextRun", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32("drawTextRun", "y", y) : y | 0;
    const bi = this.validateParams ? this.requireU32("drawTextRun", "blobId", blobId) : blobId >>> 0;
    if (this.error) return;
    if (xi === null || yi === null || bi === null) return;

    if (!this.useBlobById("drawTextRun", bi)) return;

    if (!this.beginDrawCommand("drawTextRun", DRAW_TEXT_RUN_SIZE)) return;
    this.drawLen = writeDrawTextRun(this.drawBuf, this.drawDv, this.drawLen, xi, yi, bi, 0);
    this.drawCmdCount += 1;
  }

  setCursor(state: CursorState): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("setCursor", "x", state.x) : state.x | 0;
    const yi = this.validateParams ? this.requireI32("setCursor", "y", state.y) : state.y | 0;
    if (this.error) return;
    if (xi === null || yi === null) return;

    const shape = state.shape & 0xff;
    if (this.validateParams && (shape < 0 || shape > 2)) {
      this.fail("ZRDL_BAD_PARAMS", `setCursor: shape must be 0, 1, or 2 (got ${String(shape)})`);
      return;
    }

    if (!this.beginDrawCommand("setCursor", SET_CURSOR_SIZE)) return;
    this.drawLen = writeSetCursor(
      this.drawBuf,
      this.drawDv,
      this.drawLen,
      xi,
      yi,
      shape,
      state.visible ? 1 : 0,
      state.blink ? 1 : 0,
      0,
    );
    this.drawCmdCount += 1;
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
      this.activeLinkUriId = 0;
      this.activeLinkId = 0;
      return;
    }

    if (typeof uri !== "string") {
      this.fail("ZRDL_BAD_PARAMS", "setLink: uri must be a string or null");
      return;
    }

    const uriId = this.internString(uri);
    if (this.error || uriId === null) return;
    this.activeLinkUriId = uriId;

    if (id !== undefined) {
      const idRef = this.internString(id);
      if (this.error || idRef === null) return;
      this.activeLinkId = idRef;
    } else {
      this.activeLinkId = 0;
    }
  }

  drawCanvas(
    x: number,
    y: number,
    w: number,
    h: number,
    blobId: number,
    blitter: DrawlistCanvasBlitter,
    pxWidth?: number,
    pxHeight?: number,
  ): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32NonNeg("drawCanvas", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32NonNeg("drawCanvas", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32Positive("drawCanvas", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32Positive("drawCanvas", "h", h) : h | 0;
    const bi = this.validateParams ? this.requireU32("drawCanvas", "blobId", blobId) : blobId >>> 0;
    if (this.error) return;
    if (xi === null || yi === null || wi === null || hi === null || bi === null) return;

    const blob = this.useBlobById("drawCanvas", bi);
    if (!blob) return;

    const blitterCode = BLITTER_CODE[blitter];
    if (blitterCode === undefined) {
      this.fail("ZRDL_BAD_PARAMS", `drawCanvas: unsupported blitter \"${String(blitter)}\"`);
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
      const derived = deriveCanvasPxFromBlitter(wi, hi, blitter) ?? inferAutoCanvasPx(blob.bytes.byteLength, wi);
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
    if (expectedBlobLen !== blob.bytes.byteLength) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `drawCanvas: blob length mismatch (expected=${String(expectedBlobLen)}, got=${String(blob.bytes.byteLength)})`,
      );
      return;
    }

    if (!this.beginDrawCommand("drawCanvas", DRAW_CANVAS_SIZE)) return;
    this.drawLen = writeDrawCanvas(
      this.drawBuf,
      this.drawDv,
      this.drawLen,
      xi,
      yi,
      wi,
      hi,
      resolvedPxW,
      resolvedPxH,
      bi,
      0,
      blitterCode,
      0,
      0,
    );
    this.drawCmdCount += 1;
  }

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
  ): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32NonNeg("drawImage", "x", x) : x | 0;
    const yi = this.validateParams ? this.requireI32NonNeg("drawImage", "y", y) : y | 0;
    const wi = this.validateParams ? this.requireI32Positive("drawImage", "w", w) : w | 0;
    const hi = this.validateParams ? this.requireI32Positive("drawImage", "h", h) : h | 0;
    const bi = this.validateParams ? this.requireU32("drawImage", "blobId", blobId) : blobId >>> 0;
    const imageIdU32 = this.validateParams ? this.requireU32("drawImage", "imageId", imageId) : imageId >>> 0;
    if (this.error) return;
    if (
      xi === null ||
      yi === null ||
      wi === null ||
      hi === null ||
      bi === null ||
      imageIdU32 === null
    ) {
      return;
    }

    const blob = this.useBlobById("drawImage", bi);
    if (!blob) return;

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
      const pixels = blob.bytes.byteLength >>> 2;
      if ((blob.bytes.byteLength & 3) !== 0 || pixels === 0) {
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
      if (expectedBlobLen !== blob.bytes.byteLength) {
        this.fail(
          "ZRDL_BAD_PARAMS",
          `drawImage: RGBA blob length mismatch (expected=${String(expectedBlobLen)}, got=${String(blob.bytes.byteLength)})`,
        );
        return;
      }
    } else if (blob.bytes.byteLength <= 0) {
      this.fail("ZRDL_BAD_PARAMS", "drawImage: PNG blob must be non-empty");
      return;
    }

    if (!this.beginDrawCommand("drawImage", DRAW_IMAGE_SIZE)) return;
    this.drawLen = writeDrawImage(
      this.drawBuf,
      this.drawDv,
      this.drawLen,
      xi,
      yi,
      wi,
      hi,
      resolvedPxW,
      resolvedPxH,
      bi,
      0,
      imageIdU32,
      formatCode,
      protocolCode,
      zLayerRaw,
      fitCode,
      0,
      0,
      0,
    );
    this.drawCmdCount += 1;
  }

  markEngineResourceStoreEmpty(): void {
    this.engineGeneration += 1;
    this.pendingFreeStringIds.length = 0;
    this.pendingFreeBlobIds.length = 0;
    this.pendingFreeStringSet.clear();
    this.pendingFreeBlobSet.clear();
    this.frameDefStrings.clear();
    this.frameDefBlobs.clear();
  }

  buildInto(dst: Uint8Array): DrawlistBuildResult {
    return this.buildInternal(dst);
  }

  build(): DrawlistBuildResult {
    return this.buildInternal();
  }

  reset(): void {
    if (this.builtThisFrame) {
      this.commitFrameResourceEffects();
    } else if (this.frameResourceMutations) {
      // Resource state changed without a submitted frame; force conservative resend.
      this.markEngineResourceStoreEmpty();
    } else {
      this.frameDefStrings.clear();
      this.frameDefBlobs.clear();
    }

    this.error = undefined;
    this.drawLen = 0;
    this.drawCmdCount = 0;
    this.activeLinkUriId = 0;
    this.activeLinkId = 0;

    this.frameSeq += 1;
    this.builtThisFrame = false;
    this.frameResourceMutations = false;
  }

  private buildInternal(dst?: Uint8Array): DrawlistBuildResult {
    if (this.error) {
      return { ok: false, error: this.error };
    }

    const prelude = this.encodePrelude();
    if ("ok" in prelude) {
      return prelude;
    }

    const cmdCount = prelude.cmdCount + this.drawCmdCount;
    if (cmdCount > this.maxCmdCount) {
      return {
        ok: false,
        error: {
          code: "ZRDL_TOO_LARGE",
          detail: `build: maxCmdCount exceeded (count=${String(cmdCount)}, max=${String(this.maxCmdCount)})`,
        },
      };
    }

    const cmdBytes = prelude.byteLen + this.drawLen;
    const totalSize = HEADER_SIZE + cmdBytes;
    if (totalSize > this.maxDrawlistBytes) {
      return {
        ok: false,
        error: {
          code: "ZRDL_TOO_LARGE",
          detail: `build: maxDrawlistBytes exceeded (total=${String(totalSize)}, max=${String(this.maxDrawlistBytes)})`,
        },
      };
    }

    let out: Uint8Array;
    if (dst !== undefined) {
      if (!(dst instanceof Uint8Array)) {
        return {
          ok: false,
          error: { code: "ZRDL_BAD_PARAMS", detail: "buildInto: dst must be a Uint8Array" },
        };
      }
      if (dst.byteLength < totalSize) {
        return {
          ok: false,
          error: {
            code: "ZRDL_TOO_LARGE",
            detail: `buildInto: dst is too small (required=${String(totalSize)}, got=${String(dst.byteLength)})`,
          },
        };
      }
      out = dst.subarray(0, totalSize);
    } else if (this.reuseOutputBuffer) {
      out = this.ensureOutputCapacity(totalSize).subarray(0, totalSize);
      if (this.error) return { ok: false, error: this.error };
    } else {
      out = new Uint8Array(totalSize);
    }

    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);

    const cmdOffset = cmdCount === 0 ? 0 : HEADER_SIZE;

    dv.setUint32(0, ZRDL_MAGIC, true);
    dv.setUint32(4, ZR_DRAWLIST_VERSION_V1, true);
    dv.setUint32(8, HEADER_SIZE, true);
    dv.setUint32(12, totalSize, true);
    dv.setUint32(16, cmdOffset, true);
    dv.setUint32(20, cmdBytes, true);
    dv.setUint32(24, cmdCount, true);
    dv.setUint32(28, 0, true);
    dv.setUint32(32, 0, true);
    dv.setUint32(36, 0, true);
    dv.setUint32(40, 0, true);
    dv.setUint32(44, 0, true);
    dv.setUint32(48, 0, true);
    dv.setUint32(52, 0, true);
    dv.setUint32(56, 0, true);
    dv.setUint32(60, 0, true);

    if (cmdCount > 0) {
      out.set(prelude.bytes.subarray(0, prelude.byteLen), HEADER_SIZE);
      out.set(this.drawBuf.subarray(0, this.drawLen), HEADER_SIZE + prelude.byteLen);
    }

    this.builtThisFrame = true;
    return { ok: true, bytes: out };
  }

  private commitFrameResourceEffects(): void {
    for (const [id, entry] of this.frameDefStrings) {
      const live = this.stringById.get(id);
      if (live === entry) {
        live.generationDefined = this.engineGeneration;
      }
    }

    for (const [id, entry] of this.frameDefBlobs) {
      const live = this.blobById.get(id);
      if (live === entry) {
        live.generationDefined = this.engineGeneration;
      }
    }

    this.frameDefStrings.clear();
    this.frameDefBlobs.clear();

    this.pendingFreeStringIds.length = 0;
    this.pendingFreeBlobIds.length = 0;
    this.pendingFreeStringSet.clear();
    this.pendingFreeBlobSet.clear();
  }

  private encodePrelude(): PreludeEncoding | DrawlistBuildResult {
    const defStrings = [...this.frameDefStrings.values()];
    const defBlobs = [...this.frameDefBlobs.values()];

    let estimated = this.pendingFreeStringIds.length * FREE_STRING_SIZE;
    estimated += this.pendingFreeBlobIds.length * FREE_BLOB_SIZE;
    for (const entry of defStrings) {
      estimated += align4(DEF_STRING_BASE_SIZE + entry.bytes.byteLength);
    }
    for (const entry of defBlobs) {
      estimated += align4(DEF_BLOB_BASE_SIZE + entry.bytes.byteLength);
    }

    const out = new Uint8Array(estimated);
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);

    let pos = 0;
    let cmdCount = 0;

    for (const id of this.pendingFreeStringIds) {
      pos = writeFreeString(out, dv, pos, id);
      cmdCount += 1;
    }

    for (const id of this.pendingFreeBlobIds) {
      pos = writeFreeBlob(out, dv, pos, id);
      cmdCount += 1;
    }

    for (const entry of defStrings) {
      if (this.stringById.get(entry.id) !== entry) continue;
      pos = writeDefString(out, dv, pos, entry.id, entry.bytes.byteLength, entry.bytes);
      cmdCount += 1;
    }

    for (const entry of defBlobs) {
      if (this.blobById.get(entry.id) !== entry) continue;
      pos = writeDefBlob(out, dv, pos, entry.id, entry.bytes.byteLength, entry.bytes);
      cmdCount += 1;
    }

    return Object.freeze({ bytes: out, byteLen: pos, cmdCount });
  }

  private internString(text: string): number | null {
    const existing = this.stringByValue.get(text);
    if (existing) {
      this.touchString(existing);
      this.ensureStringDefined(existing);
      return existing.id;
    }

    const encoded = this.encodeUtf8(text);
    if (this.error) return null;

    if (!this.ensureStringCapacity(encoded.byteLength, 1)) {
      return null;
    }

    const id = this.allocStringId();
    const entry: StringResource = {
      id,
      value: text,
      bytes: encoded,
      lastUsedTick: ++this.lruTick,
      generationDefined: 0,
      pinnedFrame: this.frameSeq,
      blobRefCount: 0,
    };

    this.stringByValue.set(text, entry);
    this.stringById.set(id, entry);
    this.stringBytesTotal += encoded.byteLength;

    this.frameResourceMutations = true;
    this.ensureStringDefined(entry);
    return id;
  }

  private addBlobInternal(
    bytes: Uint8Array,
    stableKey?: string,
    stringDeps: readonly number[] = [],
  ): number | null {
    if (this.error) return null;

    if (!(bytes instanceof Uint8Array)) {
      this.fail("ZRDL_BAD_PARAMS", "addBlob: bytes must be a Uint8Array");
      return null;
    }

    const key = stableKey ?? this.autoBlobKey(bytes);
    const existing = this.blobByKey.get(key);
    if (existing) {
      if (bytesEqual(existing.bytes, bytes)) {
        this.touchBlob(existing);
        this.ensureBlobDefined(existing);
        return existing.id;
      }
      if (existing.pinnedFrame === this.frameSeq) {
        this.fail(
          "ZRDL_BAD_PARAMS",
          `addBlob: stableKey collision in active frame for key=${JSON.stringify(key)}`,
        );
        return null;
      }
      this.evictBlob(existing);
      if (this.error) return null;
    }

    if (!this.ensureBlobCapacity(bytes.byteLength, 1)) {
      return null;
    }

    const id = this.allocBlobId();
    const deps = [...new Set(stringDeps)].filter((depId) => this.stringById.has(depId));
    const entry: BlobResource = {
      id,
      key,
      bytes,
      lastUsedTick: ++this.lruTick,
      generationDefined: 0,
      pinnedFrame: this.frameSeq,
      stringDeps: deps,
    };

    for (const depId of deps) {
      const dep = this.stringById.get(depId);
      if (dep) dep.blobRefCount += 1;
    }

    this.blobByKey.set(key, entry);
    this.blobById.set(id, entry);
    this.blobBytesTotal += bytes.byteLength;

    this.frameResourceMutations = true;
    this.ensureBlobDefined(entry);
    return id;
  }

  private autoBlobKey(bytes: Uint8Array): string {
    return `a:${String(bytes.byteLength)}:${String(hashBytesFnv1a32(bytes))}`;
  }

  private useBlobById(method: string, blobId: number): BlobResource | null {
    const entry = this.blobById.get(blobId);
    if (!entry) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `${method}: blobId out of range (blobId=${String(blobId)}, blobsCount=${String(this.blobById.size)})`,
      );
      return null;
    }
    this.touchBlob(entry);
    this.ensureBlobDefined(entry);
    return entry;
  }

  private ensureStringDefined(entry: StringResource): void {
    if (entry.generationDefined === this.engineGeneration) return;
    if (this.frameDefStrings.has(entry.id)) return;
    this.frameDefStrings.set(entry.id, entry);
  }

  private ensureBlobDefined(entry: BlobResource): void {
    if (entry.generationDefined === this.engineGeneration) return;
    if (this.frameDefBlobs.has(entry.id)) return;
    this.frameDefBlobs.set(entry.id, entry);
  }

  private touchString(entry: StringResource): void {
    entry.lastUsedTick = ++this.lruTick;
    entry.pinnedFrame = this.frameSeq;
  }

  private touchBlob(entry: BlobResource): void {
    entry.lastUsedTick = ++this.lruTick;
    entry.pinnedFrame = this.frameSeq;
  }

  private ensureStringCapacity(additionalBytes: number, additionalCount: number): boolean {
    while (
      this.stringById.size + additionalCount > this.maxStrings ||
      this.stringBytesTotal + additionalBytes > this.maxStringBytes
    ) {
      const candidate = this.pickEvictableString();
      if (!candidate) {
        this.fail(
          "ZRDL_TOO_LARGE",
          `drawText: string cache cannot evict resources (maxStrings=${String(this.maxStrings)}, maxStringBytes=${String(this.maxStringBytes)})`,
        );
        return false;
      }
      this.evictString(candidate);
      if (this.error) return false;
    }
    return true;
  }

  private ensureBlobCapacity(additionalBytes: number, additionalCount: number): boolean {
    while (
      this.blobById.size + additionalCount > this.maxBlobs ||
      this.blobBytesTotal + additionalBytes > this.maxBlobBytes
    ) {
      const candidate = this.pickEvictableBlob();
      if (!candidate) {
        this.fail(
          "ZRDL_TOO_LARGE",
          `addBlob: blob cache cannot evict resources (maxBlobs=${String(this.maxBlobs)}, maxBlobBytes=${String(this.maxBlobBytes)})`,
        );
        return false;
      }
      this.evictBlob(candidate);
      if (this.error) return false;
    }
    return true;
  }

  private pickEvictableString(): StringResource | null {
    let candidate: StringResource | null = null;
    for (const entry of this.stringById.values()) {
      if (entry.pinnedFrame === this.frameSeq) continue;
      if (entry.blobRefCount > 0) continue;
      if (!candidate || entry.lastUsedTick < candidate.lastUsedTick) {
        candidate = entry;
      }
    }
    return candidate;
  }

  private pickEvictableBlob(): BlobResource | null {
    let candidate: BlobResource | null = null;
    for (const entry of this.blobById.values()) {
      if (entry.pinnedFrame === this.frameSeq) continue;
      if (!candidate || entry.lastUsedTick < candidate.lastUsedTick) {
        candidate = entry;
      }
    }
    return candidate;
  }

  private evictString(entry: StringResource): void {
    this.stringById.delete(entry.id);
    this.stringByValue.delete(entry.value);
    this.stringBytesTotal -= entry.bytes.byteLength;

    this.frameDefStrings.delete(entry.id);

    if (entry.generationDefined === this.engineGeneration) {
      this.queueFreeString(entry.id);
    }

    this.freeStringIds.push(entry.id);
    this.frameResourceMutations = true;
  }

  private evictBlob(entry: BlobResource): void {
    this.blobById.delete(entry.id);
    this.blobByKey.delete(entry.key);
    this.blobBytesTotal -= entry.bytes.byteLength;

    this.frameDefBlobs.delete(entry.id);

    for (const depId of entry.stringDeps) {
      const dep = this.stringById.get(depId);
      if (dep && dep.blobRefCount > 0) dep.blobRefCount -= 1;
    }

    if (entry.generationDefined === this.engineGeneration) {
      this.queueFreeBlob(entry.id);
    }

    this.freeBlobIds.push(entry.id);
    this.frameResourceMutations = true;
  }

  private queueFreeString(id: number): void {
    if (this.pendingFreeStringSet.has(id)) return;
    this.pendingFreeStringSet.add(id);
    this.pendingFreeStringIds.push(id);
  }

  private queueFreeBlob(id: number): void {
    if (this.pendingFreeBlobSet.has(id)) return;
    this.pendingFreeBlobSet.add(id);
    this.pendingFreeBlobIds.push(id);
  }

  private allocStringId(): number {
    if (this.freeStringIds.length > 0) {
      const reused = this.freeStringIds.pop();
      if (reused !== undefined) return reused >>> 0;
    }
    const next = this.nextStringId;
    this.nextStringId += 1;
    return next >>> 0;
  }

  private allocBlobId(): number {
    if (this.freeBlobIds.length > 0) {
      const reused = this.freeBlobIds.pop();
      if (reused !== undefined) return reused >>> 0;
    }
    const next = this.nextBlobId;
    this.nextBlobId += 1;
    return next >>> 0;
  }

  private encodeUtf8(text: string): Uint8Array {
    if (!this.encoder) {
      this.fail("ZRDL_INTERNAL", "TextEncoder is not available");
      return new Uint8Array();
    }

    const cacheEligible = text.length <= ENCODED_STRING_CACHE_MAX_KEY_LENGTH;
    const cache = cacheEligible ? this.encodedStringCache : null;
    const cached = cache?.get(text);
    if (cached) return cached;

    let asciiOnly = true;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 0x7f) {
        asciiOnly = false;
        break;
      }
    }

    let encoded: Uint8Array;
    if (asciiOnly) {
      encoded = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) {
        encoded[i] = text.charCodeAt(i) & 0x7f;
      }
    } else {
      encoded = this.encoder.encode(text);
    }

    if (cache) {
      if (cache.size >= this.encodedStringCacheCap) cache.clear();
      cache.set(text, encoded);
    }

    return encoded;
  }

  private beginDrawCommand(method: string, size: number): boolean {
    if (this.error) return false;
    if ((this.drawLen & 3) !== 0) {
      this.fail("ZRDL_INTERNAL", "command stream is not 4-byte aligned");
      return false;
    }
    const required = this.drawLen + size;
    this.ensureDrawCapacity(required);
    if (this.error) return false;
    if (required > this.drawBuf.byteLength) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `${method}: command stream exceeds maxDrawlistBytes (required=${String(required)}, max=${String(this.maxDrawlistBytes)})`,
      );
      return false;
    }
    return true;
  }

  private ensureDrawCapacity(required: number): void {
    if (required <= this.drawBuf.byteLength) return;

    const minTotal = HEADER_SIZE + required;
    if (minTotal > this.maxDrawlistBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `command stream exceeds maxDrawlistBytes (minTotal=${String(minTotal)}, max=${String(this.maxDrawlistBytes)})`,
      );
      return;
    }

    let nextCap = this.drawBuf.byteLength;
    while (nextCap < required) nextCap = Math.min(nextCap * 2, this.maxDrawlistBytes);
    if (nextCap < required) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `command stream exceeds maxDrawlistBytes (required=${String(required)}, max=${String(this.maxDrawlistBytes)})`,
      );
      return;
    }

    const next = new Uint8Array(nextCap);
    next.set(this.drawBuf.subarray(0, this.drawLen));
    this.drawBuf = next;
    this.drawDv = new DataView(this.drawBuf.buffer, this.drawBuf.byteOffset, this.drawBuf.byteLength);
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
        `output buffer exceeds maxDrawlistBytes (required=${String(required)}, max=${String(this.maxDrawlistBytes)})`,
      );
      return existing ?? new Uint8Array(required);
    }

    const next = new Uint8Array(nextCap);
    this.outBuf = next;
    return next;
  }

  private requirePositiveInt(name: string, v: number): number {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
      this.fail("ZRDL_BAD_PARAMS", `${name} must be a positive integer (got ${String(v)})`);
      return 1;
    }
    if (v > 0x7fff_ffff) {
      this.fail("ZRDL_BAD_PARAMS", `${name} must be <= 2147483647 (got ${String(v)})`);
      return 1;
    }
    return v;
  }

  private requireNonNegativeInt(name: string, v: number): number {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      this.fail("ZRDL_BAD_PARAMS", `${name} must be a non-negative integer (got ${String(v)})`);
      return 0;
    }
    if (v > 0x7fff_ffff) {
      this.fail("ZRDL_BAD_PARAMS", `${name} must be <= 2147483647 (got ${String(v)})`);
      return 0;
    }
    return v;
  }

  private requireI32(method: string, name: string, v: number | undefined): number | null {
    if (v === undefined || !Number.isFinite(v)) {
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

  private fail(code: DrawlistBuildError["code"], detail: string): void {
    if (this.error) return;
    this.error = { code, detail };
  }

  private currentLinkRefs(): LinkRefs | null {
    if (this.activeLinkUriId === 0) return null;
    return Object.freeze({ uriRef: this.activeLinkUriId >>> 0, idRef: this.activeLinkId >>> 0 });
  }
}
