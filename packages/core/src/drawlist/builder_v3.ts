import { ZR_DRAWLIST_VERSION_V3, ZR_DRAWLIST_VERSION_V4, ZR_DRAWLIST_VERSION_V5 } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";
import { DrawlistBuilderBase, type DrawlistBuilderBaseOpts, packRgb } from "./builderBase.js";
import type {
  CursorState,
  DrawlistBuildResult,
  DrawlistBuilderV3,
  DrawlistCanvasBlitter,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
  EncodedStyle,
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

export type DrawlistBuilderV3Opts = Readonly<
  DrawlistBuilderBaseOpts & {
    drawlistVersion?: 3 | 4 | 5;
  }
>;

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

export function createDrawlistBuilderV3(opts: DrawlistBuilderV3Opts = {}): DrawlistBuilderV3 {
  return new DrawlistBuilderV3Impl(opts);
}

class DrawlistBuilderV3Impl extends DrawlistBuilderBase<EncodedStyle> implements DrawlistBuilderV3 {
  readonly drawlistVersion: 3 | 4 | 5;

  private activeLinkUriRef = 0;
  private activeLinkIdRef = 0;

  constructor(opts: DrawlistBuilderV3Opts) {
    super(opts, "DrawlistBuilderV3");

    const drawlistVersion = opts.drawlistVersion ?? ZR_DRAWLIST_VERSION_V5;
    this.drawlistVersion = (
      drawlistVersion === ZR_DRAWLIST_VERSION_V3
        ? ZR_DRAWLIST_VERSION_V3
        : drawlistVersion === ZR_DRAWLIST_VERSION_V4
          ? ZR_DRAWLIST_VERSION_V4
          : ZR_DRAWLIST_VERSION_V5
    ) as 3 | 4 | 5;
  }

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

  buildInto(dst: Uint8Array): DrawlistBuildResult {
    return this.buildIntoWithVersion(this.drawlistVersion, dst);
  }

  build(): DrawlistBuildResult {
    return this.buildWithVersion(this.drawlistVersion);
  }

  override reset(): void {
    super.reset();
    if (this.error) return;

    this.activeLinkUriRef = 0;
    this.activeLinkIdRef = 0;
  }

  protected override encodeFillRectStyle(style: TextStyle | undefined): EncodedStyle {
    return encodeStyle(style, null);
  }

  protected override encodeDrawTextStyle(style: TextStyle | undefined): EncodedStyle {
    return encodeStyle(style, this.currentLinkRefs());
  }

  protected override appendClearCommand(): void {
    if (!this.beginCommandWrite("clear", CLEAR_SIZE)) return;
    this.cmdLen = writeClear(this.cmdBuf, this.cmdDv, this.cmdLen);
    this.cmdCount += 1;
  }

  protected override appendFillRectCommand(
    x: number,
    y: number,
    w: number,
    h: number,
    style: EncodedStyle,
  ): void {
    if (!this.beginCommandWrite("fillRect", FILL_RECT_SIZE)) return;
    this.cmdLen = writeFillRect(this.cmdBuf, this.cmdDv, this.cmdLen, x, y, w, h, style);
    this.cmdCount += 1;
  }

  protected override appendDrawTextCommand(
    x: number,
    y: number,
    stringIndex: number,
    byteLen: number,
    style: EncodedStyle,
  ): void {
    if (!this.beginCommandWrite("drawText", DRAW_TEXT_SIZE)) return;
    this.cmdLen = writeDrawText(
      this.cmdBuf,
      this.cmdDv,
      this.cmdLen,
      x,
      y,
      stringIndex,
      0,
      byteLen,
      style,
      0,
    );
    this.cmdCount += 1;
  }

  protected override appendPushClipCommand(x: number, y: number, w: number, h: number): void {
    if (!this.beginCommandWrite("pushClip", PUSH_CLIP_SIZE)) return;
    this.cmdLen = writePushClip(this.cmdBuf, this.cmdDv, this.cmdLen, x, y, w, h);
    this.cmdCount += 1;
  }

  protected override appendPopClipCommand(): void {
    if (!this.beginCommandWrite("popClip", POP_CLIP_SIZE)) return;
    this.cmdLen = writePopClip(this.cmdBuf, this.cmdDv, this.cmdLen);
    this.cmdCount += 1;
  }

  protected override appendDrawTextRunCommand(x: number, y: number, blobIndex: number): void {
    if (!this.beginCommandWrite("drawTextRun", DRAW_TEXT_RUN_SIZE)) return;
    this.cmdLen = writeDrawTextRun(this.cmdBuf, this.cmdDv, this.cmdLen, x, y, blobIndex, 0);
    this.cmdCount += 1;
  }

  protected override textRunBlobSegmentSize(): number {
    return 40;
  }

  protected override writeTextRunBlobSegment(
    dv: DataView,
    off: number,
    style: EncodedStyle,
    stringIndex: number,
    byteLen: number,
  ): number {
    dv.setUint32(off + 0, style.fg >>> 0, true);
    dv.setUint32(off + 4, style.bg >>> 0, true);
    dv.setUint32(off + 8, style.attrs >>> 0, true);
    dv.setUint32(off + 12, style.reserved >>> 0, true);
    dv.setUint32(off + 16, style.underlineRgb >>> 0, true);
    dv.setUint32(off + 20, style.linkUriRef >>> 0, true);
    dv.setUint32(off + 24, style.linkIdRef >>> 0, true);
    dv.setUint32(off + 28, stringIndex >>> 0, true);
    dv.setUint32(off + 32, 0, true);
    dv.setUint32(off + 36, byteLen >>> 0, true);
    return off + 40;
  }

  protected override failCapacity(method: string, size: number): void {
    const required = this.cmdLen + size;
    this.fail(
      "ZRDL_TOO_LARGE",
      `${method}: command stream exceeds maxDrawlistBytes (required=${required}, max=${this.maxDrawlistBytes})`,
    );
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
}
