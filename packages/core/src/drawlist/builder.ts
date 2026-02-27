import { ZRDL_MAGIC, ZR_DRAWLIST_VERSION_V1 } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";
import {
  HEADER_SIZE,
  DrawlistBuilderBase,
  align4,
  type DrawlistBuilderBaseOpts,
} from "./builderBase.js";
import type {
  CursorState,
  DrawlistBuildResult,
  DrawlistBuilder,
  DrawlistCanvasBlitter,
  DrawlistImageFit,
  DrawlistImageFormat,
  DrawlistImageProtocol,
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

export type DrawlistBuilderOpts = DrawlistBuilderBaseOpts;

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
type ResourceBuildPlan = Readonly<{
  cmdOffset: number;
  cmdBytes: number;
  cmdCount: number;
  stringsCount: number;
  blobsCount: number;
  freeStringsCount: number;
  freeBlobsCount: number;
  totalSize: number;
}>;

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

function asPackedRgb24(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return (value >>> 0) & 0x00ff_ffff;
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

  const fg = asPackedRgb24(style.fg);
  const bg = asPackedRgb24(style.bg);
  const underlineColor = asPackedRgb24(style.underlineColor);
  const underlineStyle = encodeUnderlineStyle(style.underlineStyle);

  const prepackedAttrs = (style as { attrs?: unknown }).attrs;
  let attrs =
    typeof prepackedAttrs === "number" && Number.isFinite(prepackedAttrs)
      ? (prepackedAttrs >>> 0) & 0xff
      : 0;
  if (attrs === 0) {
    if (style.bold) attrs |= 1 << 0;
    if (style.italic) attrs |= 1 << 1;
    if (style.underline || underlineStyle !== 0) attrs |= 1 << 2;
    if (style.inverse) attrs |= 1 << 3;
    if (style.dim) attrs |= 1 << 4;
    if (style.strikethrough) attrs |= 1 << 5;
    if (style.overline) attrs |= 1 << 6;
    if (style.blink) attrs |= 1 << 7;
  }

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

export function createDrawlistBuilder(opts: DrawlistBuilderOpts = {}): DrawlistBuilder {
  return new DrawlistBuilderImpl(opts);
}

class DrawlistBuilderImpl extends DrawlistBuilderBase<EncodedStyle> implements DrawlistBuilder {
  private activeLinkUriRef = 0;
  private activeLinkIdRef = 0;
  private prevBuiltStringsCount = 0;
  private prevBuiltBlobsCount = 0;

  constructor(opts: DrawlistBuilderOpts) {
    super(opts, "DrawlistBuilder");
  }

  setCursor(state: CursorState): void {
    if (this.error) return;

    const xi = this.validateParams ? this.requireI32("setCursor", "x", state.x) : state.x | 0;
    const yi = this.validateParams ? this.requireI32("setCursor", "y", state.y) : state.y | 0;
    if (this.error) return;
    if (xi === null || yi === null) return;

    const shapeRaw = state.shape;
    if (
      this.validateParams &&
      (!Number.isFinite(shapeRaw) || !Number.isInteger(shapeRaw) || shapeRaw < 0 || shapeRaw > 2)
    ) {
      this.fail("ZRDL_BAD_PARAMS", `setCursor: shape must be 0, 1, or 2 (got ${shapeRaw})`);
      return;
    }
    const shape = Number(shapeRaw) & 0xff;

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

    const blobLen = this.blobSpanLens[bi];
    if (blobLen === undefined) {
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
      bi + 1,
      0,
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

    const blobLen = this.blobSpanLens[bi];
    if (blobLen === undefined) {
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
      bi + 1,
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
    this.cmdCount += 1;

    this.maybeFailTooLargeAfterWrite();
  }

  buildInto(dst: Uint8Array): DrawlistBuildResult {
    if (this.error) {
      return { ok: false, error: this.error };
    }
    if (!(dst instanceof Uint8Array)) {
      return {
        ok: false,
        error: { code: "ZRDL_BAD_PARAMS", detail: "buildInto: dst must be a Uint8Array" },
      };
    }
    const planned = this.planResourceStream();
    if (!planned.ok) {
      return planned;
    }
    const plan = planned.plan;
    if (dst.byteLength < plan.totalSize) {
      return {
        ok: false,
        error: {
          code: "ZRDL_TOO_LARGE",
          detail: `buildInto: dst is too small (required=${plan.totalSize}, got=${dst.byteLength})`,
        },
      };
    }
    return this.writeBuiltStream(dst.subarray(0, plan.totalSize), plan, ZR_DRAWLIST_VERSION_V1);
  }

  build(): DrawlistBuildResult {
    if (this.error) {
      return { ok: false, error: this.error };
    }
    const planned = this.planResourceStream();
    if (!planned.ok) {
      return planned;
    }
    const plan = planned.plan;
    const out = this.reuseOutputBuffer
      ? this.ensureOutputCapacity(plan.totalSize)
      : new Uint8Array(plan.totalSize);
    if (this.error) {
      return { ok: false, error: this.error };
    }
    return this.writeBuiltStream(out.subarray(0, plan.totalSize), plan, ZR_DRAWLIST_VERSION_V1);
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
      stringIndex + 1,
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
    this.cmdLen = writeDrawTextRun(this.cmdBuf, this.cmdDv, this.cmdLen, x, y, blobIndex + 1, 0);
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
    dv.setUint32(off + 28, (stringIndex + 1) >>> 0, true);
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

  private planResourceStream():
    | Readonly<{ ok: true; plan: ResourceBuildPlan }>
    | Readonly<{ ok: false; error: { code: "ZRDL_TOO_LARGE" | "ZRDL_INTERNAL"; detail: string } }> {
    if ((this.cmdLen & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: command stream is not 4-byte aligned" },
      };
    }

    const stringsCount = this.stringSpanOffs.length;
    const blobsCount = this.blobSpanOffs.length;
    const freeStringsCount = Math.max(0, this.prevBuiltStringsCount - stringsCount);
    const freeBlobsCount = Math.max(0, this.prevBuiltBlobsCount - blobsCount);

    let defStringsBytes = 0;
    for (let i = 0; i < stringsCount; i++) {
      const len = this.stringSpanLens[i];
      if (len === undefined) {
        return {
          ok: false,
          error: { code: "ZRDL_INTERNAL", detail: "build: string span table is inconsistent" },
        };
      }
      defStringsBytes += align4(DEF_STRING_BASE_SIZE + len);
    }

    let defBlobsBytes = 0;
    for (let i = 0; i < blobsCount; i++) {
      const len = this.blobSpanLens[i];
      if (len === undefined) {
        return {
          ok: false,
          error: { code: "ZRDL_INTERNAL", detail: "build: blob span table is inconsistent" },
        };
      }
      defBlobsBytes += align4(DEF_BLOB_BASE_SIZE + len);
    }

    const cmdCount = stringsCount + blobsCount + this.cmdCount + freeStringsCount + freeBlobsCount;
    const cmdBytes =
      defStringsBytes +
      defBlobsBytes +
      this.cmdLen +
      freeStringsCount * FREE_STRING_SIZE +
      freeBlobsCount * FREE_BLOB_SIZE;
    const cmdOffset = cmdCount === 0 ? 0 : HEADER_SIZE;
    const totalSize = HEADER_SIZE + cmdBytes;

    if (cmdCount > this.maxCmdCount) {
      return {
        ok: false,
        error: {
          code: "ZRDL_TOO_LARGE",
          detail: `build: maxCmdCount exceeded (count=${cmdCount}, max=${this.maxCmdCount})`,
        },
      };
    }

    if ((cmdBytes & 3) !== 0 || (totalSize & 3) !== 0) {
      return {
        ok: false,
        error: { code: "ZRDL_INTERNAL", detail: "build: command stream alignment is invalid" },
      };
    }

    if (totalSize > this.maxDrawlistBytes) {
      return {
        ok: false,
        error: {
          code: "ZRDL_TOO_LARGE",
          detail: `build: maxDrawlistBytes exceeded (total=${totalSize}, max=${this.maxDrawlistBytes})`,
        },
      };
    }

    return {
      ok: true,
      plan: {
        cmdOffset,
        cmdBytes,
        cmdCount,
        stringsCount,
        blobsCount,
        freeStringsCount,
        freeBlobsCount,
        totalSize,
      },
    };
  }

  private writeBuiltStream(
    out: Uint8Array,
    plan: ResourceBuildPlan,
    version: number,
  ): DrawlistBuildResult {
    const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);

    dv.setUint32(0, ZRDL_MAGIC, true);
    dv.setUint32(4, version >>> 0, true);
    dv.setUint32(8, HEADER_SIZE, true);
    dv.setUint32(12, plan.totalSize >>> 0, true);
    dv.setUint32(16, plan.cmdOffset >>> 0, true);
    dv.setUint32(20, plan.cmdBytes >>> 0, true);
    dv.setUint32(24, plan.cmdCount >>> 0, true);
    dv.setUint32(28, 0, true);
    dv.setUint32(32, 0, true);
    dv.setUint32(36, 0, true);
    dv.setUint32(40, 0, true);
    dv.setUint32(44, 0, true);
    dv.setUint32(48, 0, true);
    dv.setUint32(52, 0, true);
    dv.setUint32(56, 0, true);
    dv.setUint32(60, 0, true);

    let pos = plan.cmdOffset;

    for (let i = 0; i < plan.stringsCount; i++) {
      const off = this.stringSpanOffs[i];
      const len = this.stringSpanLens[i];
      if (off === undefined || len === undefined) {
        return {
          ok: false,
          error: { code: "ZRDL_INTERNAL", detail: "build: string span table is inconsistent" },
        };
      }
      const bytes = this.stringBytesBuf.subarray(off, off + len);
      pos = writeDefString(out, dv, pos, i + 1, len, bytes);
    }

    for (let i = 0; i < plan.blobsCount; i++) {
      const off = this.blobSpanOffs[i];
      const len = this.blobSpanLens[i];
      if (off === undefined || len === undefined) {
        return {
          ok: false,
          error: { code: "ZRDL_INTERNAL", detail: "build: blob span table is inconsistent" },
        };
      }
      const bytes = this.blobBytesBuf.subarray(off, off + len);
      pos = writeDefBlob(out, dv, pos, i + 1, len, bytes);
    }

    out.set(this.cmdBuf.subarray(0, this.cmdLen), pos);
    pos += this.cmdLen;

    for (let i = 0; i < plan.freeStringsCount; i++) {
      const id = plan.stringsCount + i + 1;
      pos = writeFreeString(out, dv, pos, id);
    }

    for (let i = 0; i < plan.freeBlobsCount; i++) {
      const id = plan.blobsCount + i + 1;
      pos = writeFreeBlob(out, dv, pos, id);
    }

    const expectedEnd = plan.cmdOffset + plan.cmdBytes;
    if (pos !== expectedEnd) {
      return {
        ok: false,
        error: {
          code: "ZRDL_INTERNAL",
          detail: `build: command stream size mismatch (expected=${expectedEnd}, got=${pos})`,
        },
      };
    }

    this.prevBuiltStringsCount = plan.stringsCount;
    this.prevBuiltBlobsCount = plan.blobsCount;
    return { ok: true, bytes: out };
  }
}
