import { ZRDL_MAGIC } from "../abi.js";
import type { TextStyle } from "../widgets/style.js";
import type {
  DrawlistBuildError,
  DrawlistBuildErrorCode,
  DrawlistBuildResult,
  DrawlistBuilderV1,
  DrawlistTextRunSegment,
} from "./types.js";

export type DrawlistBuilderBaseOpts = Readonly<{
  maxDrawlistBytes?: number;
  maxCmdCount?: number;
  maxBlobBytes?: number;
  maxBlobs?: number;
  maxStringBytes?: number;
  maxStrings?: number;
  validateParams?: boolean;
  reuseOutputBuffer?: boolean;
  encodedStringCacheCap?: number;
}>;

export const HEADER_SIZE = 64;

export const DEFAULT_MAX_DRAWLIST_BYTES = 2 * 1024 * 1024;
export const DEFAULT_MAX_CMD_COUNT = 100_000;
export const DEFAULT_MAX_BLOB_BYTES = 512 * 1024;
export const DEFAULT_MAX_BLOBS = 10_000;
export const DEFAULT_MAX_STRING_BYTES = 512 * 1024;
export const DEFAULT_MAX_STRINGS = 10_000;

const ENCODED_STRING_CACHE_MAX_KEY_LENGTH = 96;

export const INT32_MIN = -2147483648;
export const INT32_MAX = 2147483647;

export const OP_CLEAR = 1;
export const OP_FILL_RECT = 2;
export const OP_DRAW_TEXT = 3;
export const OP_PUSH_CLIP = 4;
export const OP_POP_CLIP = 5;
export const OP_DRAW_TEXT_RUN = 6;
export const OP_SET_CURSOR = 7;

export type EncodedStyleV1 = Readonly<{ fg: number; bg: number; attrs: number }>;

type Utf8Encoder = Readonly<{ encode(input: string): Uint8Array }>;

type Layout = Readonly<{
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
}>;

export function align4(n: number): number {
  return (n + 3) & ~3;
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function isRgbLike(v: unknown): v is Readonly<{ r: unknown; g: unknown; b: unknown }> {
  return isObject(v) && "r" in v && "g" in v && "b" in v;
}

export function isTextRunSegment(v: unknown): v is DrawlistTextRunSegment {
  if (typeof v !== "object" || v === null) return false;
  if (typeof (v as { text?: unknown }).text !== "string") return false;
  return true;
}

export function packRgb(v: unknown): number | null {
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

function hasUnderlineVariant(style: TextStyle): boolean {
  const underlineStyle = (style as { underlineStyle?: unknown }).underlineStyle;
  switch (underlineStyle) {
    case "straight":
    case "double":
    case "curly":
    case "dotted":
    case "dashed":
      return true;
    default:
      return false;
  }
}

export function encodeBasicStyle(style: TextStyle | undefined): EncodedStyleV1 {
  if (!style) return { fg: 0, bg: 0, attrs: 0 };

  const fg = packRgb(style.fg) ?? 0;
  const bg = packRgb(style.bg) ?? 0;

  let attrs = 0;
  if (style.bold) attrs |= 1 << 0;
  if (style.italic) attrs |= 1 << 1;
  if (style.underline || hasUnderlineVariant(style)) attrs |= 1 << 2;
  if (style.inverse) attrs |= 1 << 3;
  if (style.dim) attrs |= 1 << 4;
  if (style.strikethrough) attrs |= 1 << 5;
  if (style.overline) attrs |= 1 << 6;
  if (style.blink) attrs |= 1 << 7;

  return { fg, bg, attrs };
}

export abstract class DrawlistBuilderBase<TEncodedStyle> implements DrawlistBuilderV1 {
  protected readonly builderName: string;

  protected readonly maxDrawlistBytes: number;
  protected readonly maxCmdCount: number;
  protected readonly maxBlobBytes: number;
  protected readonly maxBlobs: number;
  protected readonly maxStringBytes: number;
  protected readonly maxStrings: number;
  protected readonly validateParams: boolean;
  protected readonly reuseOutputBuffer: boolean;
  protected readonly encodedStringCacheCap: number;

  protected readonly encoder: Utf8Encoder | undefined;

  protected cmdBuf: Uint8Array;
  protected cmdDv: DataView;
  protected cmdLen = 0;
  protected cmdCount = 0;

  protected readonly stringIndexByValue = new Map<string, number>();
  protected readonly stringSpanOffs: number[] = [];
  protected readonly stringSpanLens: number[] = [];
  protected stringBytesBuf: Uint8Array;
  protected stringBytesLen = 0;

  protected readonly blobSpanOffs: number[] = [];
  protected readonly blobSpanLens: number[] = [];
  protected blobBytesBuf: Uint8Array;
  protected blobBytesLen = 0;

  protected outBuf: Uint8Array | null = null;
  protected readonly encodedStringCache: Map<string, Uint8Array> | null;

  protected error: DrawlistBuildError | undefined;

  protected constructor(opts: DrawlistBuilderBaseOpts, builderName: string) {
    this.builderName = builderName;

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

  clear(): void {
    if (this.error) return;
    this.appendClearCommand();
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

    const encodedStyle = this.encodeFillRectStyle(style);
    this.appendFillRectCommand(xi, yi, w0, h0, encodedStyle);

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

    const encodedStyle = this.encodeDrawTextStyle(style);
    this.appendDrawTextCommand(xi, yi, stringIndex, byteLen, encodedStyle);

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

    this.appendPushClipCommand(xi, yi, w0, h0);

    this.maybeFailTooLargeAfterWrite();
  }

  popClip(): void {
    if (this.error) return;
    this.appendPopClipCommand();
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

    const segmentSize = this.textRunBlobSegmentSize();
    const blobLen = 4 + segments.length * segmentSize;
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

      const encodedStyle = this.encodeTextRunStyle(seg0.style);
      off = this.writeTextRunBlobSegment(dv, off, encodedStyle, stringIndex, byteLen);
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

    this.appendDrawTextRunCommand(xi, yi, bi);

    this.maybeFailTooLargeAfterWrite();
  }

  abstract build(): DrawlistBuildResult;

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
  }

  protected abstract encodeFillRectStyle(style: TextStyle | undefined): TEncodedStyle;

  protected abstract encodeDrawTextStyle(style: TextStyle | undefined): TEncodedStyle;

  protected encodeTextRunStyle(style: TextStyle | undefined): TEncodedStyle {
    return this.encodeDrawTextStyle(style);
  }

  protected abstract appendClearCommand(): void;

  protected abstract appendFillRectCommand(
    x: number,
    y: number,
    w: number,
    h: number,
    style: TEncodedStyle,
  ): void;

  protected abstract appendDrawTextCommand(
    x: number,
    y: number,
    stringIndex: number,
    byteLen: number,
    style: TEncodedStyle,
  ): void;

  protected abstract appendPushClipCommand(x: number, y: number, w: number, h: number): void;

  protected abstract appendPopClipCommand(): void;

  protected abstract appendDrawTextRunCommand(x: number, y: number, blobIndex: number): void;

  protected abstract textRunBlobSegmentSize(): number;

  protected abstract writeTextRunBlobSegment(
    dv: DataView,
    off: number,
    style: TEncodedStyle,
    stringIndex: number,
    byteLen: number,
  ): number;

  protected buildWithVersion(version: number): DrawlistBuildResult {
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

    dv.setUint32(0, ZRDL_MAGIC, true);
    dv.setUint32(4, version >>> 0, true);
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

    out.set(this.cmdBuf.subarray(0, cmdBytes), cmdOffset);

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

    out.set(this.stringBytesBuf.subarray(0, stringsBytesLenRaw), stringsBytesOffset);
    if (this.reuseOutputBuffer && stringsBytesLen > stringsBytesLenRaw) {
      out.fill(0, stringsBytesOffset + stringsBytesLenRaw, stringsBytesOffset + stringsBytesLen);
    }

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

    out.set(this.blobBytesBuf.subarray(0, blobsBytesLenRaw), blobsBytesOffset);
    if (this.reuseOutputBuffer && blobsBytesLen > blobsBytesLenRaw) {
      out.fill(0, blobsBytesOffset + blobsBytesLenRaw, blobsBytesOffset + blobsBytesLen);
    }

    return { ok: true, bytes: out };
  }

  protected requirePositiveInt(name: string, v: number): number {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v <= 0) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `${this.builderName}: ${name} must be a positive integer (got ${String(v)})`,
      );
      return 1;
    }
    if (v > 0x7fff_ffff) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `${this.builderName}: ${name} must be <= 2147483647 (got ${String(v)})`,
      );
      return 1;
    }
    return v;
  }

  protected requireNonNegativeInt(name: string, v: number): number {
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `${this.builderName}: ${name} must be a non-negative integer (got ${String(v)})`,
      );
      return 0;
    }
    if (v > 0x7fff_ffff) {
      this.fail(
        "ZRDL_BAD_PARAMS",
        `${this.builderName}: ${name} must be <= 2147483647 (got ${String(v)})`,
      );
      return 0;
    }
    return v;
  }

  protected requireI32(method: string, name: string, v: number): number | null {
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

  protected requireI32NonNeg(method: string, name: string, v: number): number | null {
    const iv = this.requireI32(method, name, v);
    if (iv === null) return null;
    if (iv < 0) {
      this.fail("ZRDL_BAD_PARAMS", `${method}: ${name} must be >= 0 (got ${String(v)})`);
      return null;
    }
    return iv;
  }

  protected fail(code: DrawlistBuildErrorCode, detail: string): void {
    if (this.error) return;
    this.error = { code, detail };
  }

  protected internString(text: string): number | null {
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

    const cacheEligible = text.length <= ENCODED_STRING_CACHE_MAX_KEY_LENGTH;
    const cache = cacheEligible ? this.encodedStringCache : null;
    const cached = cache?.get(text);
    const encoded = cached ?? this.encodeUtf8(text);
    if (!cached && cache) {
      if (cache.size >= this.encodedStringCacheCap) {
        cache.clear();
      }
      cache.set(text, encoded);
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

  private encodeUtf8(text: string): Uint8Array {
    let asciiOnly = true;
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) > 0x7f) {
        asciiOnly = false;
        break;
      }
    }

    if (asciiOnly) {
      const out = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i++) {
        out[i] = text.charCodeAt(i) & 0x7f;
      }
      return out;
    }

    return this.encoder ? this.encoder.encode(text) : new Uint8Array();
  }

  protected ensureCmdCapacity(required: number): void {
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

  protected ensureOutputCapacity(required: number): Uint8Array {
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

  protected ensureStringBytesCapacity(required: number): void {
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

  protected ensureBlobBytesCapacity(required: number): void {
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

  protected writeCommandHeader(opcode: number, size: number): void {
    if (this.error) return;

    if (this.cmdCount + 1 > this.maxCmdCount) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `maxCmdCount exceeded (count=${this.cmdCount + 1}, max=${this.maxCmdCount})`,
      );
      return;
    }

    const expected = this.expectedCmdSize(opcode);
    if (expected !== size) {
      this.fail(
        "ZRDL_FORMAT",
        `writeCommandHeader: size mismatch for opcode ${opcode} (expected=${expected}, got=${size})`,
      );
      return;
    }

    if ((this.cmdLen & 3) !== 0) {
      this.fail("ZRDL_INTERNAL", "writeCommandHeader: cmd cursor is not 4-byte aligned");
      return;
    }

    const alignedSize = align4(size);
    const start = this.cmdLen;
    const end = start + alignedSize;
    this.ensureCmdCapacity(end);
    if (this.error) return;

    this.cmdDv.setUint16(start + 0, opcode & 0xffff, true);
    this.cmdDv.setUint16(start + 2, 0, true);
    this.cmdDv.setUint32(start + 4, size >>> 0, true);

    if (alignedSize !== size) {
      this.cmdBuf.fill(0x00, start + size, end);
    }

    this.cmdLen = start + 8;
    this.cmdCount += 1;
  }

  protected expectedCmdSize(_opcode: number): number {
    return -1;
  }

  protected writeI32(v: number): void {
    const off = this.cmdLen;
    this.cmdDv.setInt32(off, v | 0, true);
    this.cmdLen = off + 4;
  }

  protected writeU32(v: number): void {
    const off = this.cmdLen;
    this.cmdDv.setUint32(off, v >>> 0, true);
    this.cmdLen = off + 4;
  }

  protected writeU8(v: number): void {
    const off = this.cmdLen;
    this.cmdBuf[off] = v & 0xff;
    this.cmdLen = off + 1;
  }

  protected padCmdTo4(): void {
    const aligned = align4(this.cmdLen);
    if (aligned === this.cmdLen) return;
    this.cmdBuf.fill(0x00, this.cmdLen, aligned);
    this.cmdLen = aligned;
  }

  protected beginCommandWrite(method: string, size: number): boolean {
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

  protected failCapacity(method: string, size: number): void {
    const required = this.cmdLen + size;
    this.fail(
      "ZRDL_TOO_LARGE",
      `${method}: command stream exceeds maxDrawlistBytes (required=${required}, max=${this.maxDrawlistBytes})`,
    );
  }

  protected maybeFailTooLargeAfterWrite(): void {
    if (this.error) return;

    const estimate = this.estimateTotalSize();
    if (estimate > this.maxDrawlistBytes) {
      this.fail(
        "ZRDL_TOO_LARGE",
        `maxDrawlistBytes exceeded (estimatedTotal=${estimate}, max=${this.maxDrawlistBytes})`,
      );
    }
  }

  protected estimateTotalSize(): number {
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

  protected validateLayout(layout: Layout): DrawlistBuildResult | null {
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

export abstract class DrawlistBuilderLegacyBase extends DrawlistBuilderBase<EncodedStyleV1> {
  protected constructor(opts: DrawlistBuilderBaseOpts, builderName: string) {
    super(opts, builderName);
  }

  protected override encodeFillRectStyle(style: TextStyle | undefined): EncodedStyleV1 {
    return encodeBasicStyle(style);
  }

  protected override encodeDrawTextStyle(style: TextStyle | undefined): EncodedStyleV1 {
    return encodeBasicStyle(style);
  }

  protected override appendClearCommand(): void {
    this.writeCommandHeader(OP_CLEAR, 8);
  }

  protected override appendFillRectCommand(
    x: number,
    y: number,
    w: number,
    h: number,
    style: EncodedStyleV1,
  ): void {
    this.writeCommandHeader(OP_FILL_RECT, 8 + 32);
    this.writeI32(x);
    this.writeI32(y);
    this.writeI32(w);
    this.writeI32(h);
    this.writeLegacyStyle(style);
    this.padCmdTo4();
  }

  protected override appendDrawTextCommand(
    x: number,
    y: number,
    stringIndex: number,
    byteLen: number,
    style: EncodedStyleV1,
  ): void {
    this.writeCommandHeader(OP_DRAW_TEXT, 8 + 40);
    this.writeI32(x);
    this.writeI32(y);
    this.writeU32(stringIndex);
    this.writeU32(0);
    this.writeU32(byteLen);
    this.writeLegacyStyle(style);
    this.writeU32(0);
    this.padCmdTo4();
  }

  protected override appendPushClipCommand(x: number, y: number, w: number, h: number): void {
    this.writeCommandHeader(OP_PUSH_CLIP, 8 + 16);
    this.writeI32(x);
    this.writeI32(y);
    this.writeI32(w);
    this.writeI32(h);
    this.padCmdTo4();
  }

  protected override appendPopClipCommand(): void {
    this.writeCommandHeader(OP_POP_CLIP, 8);
  }

  protected override appendDrawTextRunCommand(x: number, y: number, blobIndex: number): void {
    this.writeCommandHeader(OP_DRAW_TEXT_RUN, 8 + 16);
    this.writeI32(x);
    this.writeI32(y);
    this.writeU32(blobIndex);
    this.writeU32(0);
    this.padCmdTo4();
  }

  protected override textRunBlobSegmentSize(): number {
    return 28;
  }

  protected override writeTextRunBlobSegment(
    dv: DataView,
    off: number,
    style: EncodedStyleV1,
    stringIndex: number,
    byteLen: number,
  ): number {
    dv.setUint32(off + 0, style.fg >>> 0, true);
    dv.setUint32(off + 4, style.bg >>> 0, true);
    dv.setUint32(off + 8, style.attrs >>> 0, true);
    dv.setUint32(off + 12, 0, true);
    dv.setUint32(off + 16, stringIndex >>> 0, true);
    dv.setUint32(off + 20, 0, true);
    dv.setUint32(off + 24, byteLen >>> 0, true);
    return off + 28;
  }

  protected override expectedCmdSize(opcode: number): number {
    switch (opcode) {
      case OP_CLEAR:
        return 8;
      case OP_FILL_RECT:
        return 8 + 32;
      case OP_DRAW_TEXT:
        return 8 + 40;
      case OP_PUSH_CLIP:
        return 8 + 16;
      case OP_POP_CLIP:
        return 8;
      case OP_DRAW_TEXT_RUN:
        return 8 + 16;
      default:
        return this.expectedExtraCmdSize(opcode);
    }
  }

  protected expectedExtraCmdSize(_opcode: number): number {
    return -1;
  }

  private writeLegacyStyle(style: EncodedStyleV1): void {
    this.writeU32(style.fg);
    this.writeU32(style.bg);
    this.writeU32(style.attrs);
    this.writeU32(0);
  }
}
