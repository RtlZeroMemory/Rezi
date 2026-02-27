import type {
  DrawlistBuildResult,
  DrawlistBuilder,
  DrawlistTextRunSegment,
} from "../../drawlist/types.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusState } from "../../runtime/focus.js";
import type { RenderPacket, RenderPacketOp } from "../../runtime/renderPacket.js";
import type { Theme } from "../../theme/theme.js";
import type { ResolvedTextStyle } from "./textStyle.js";
import type { CursorInfo } from "./types.js";

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const HASH_MASK_32 = 0xffff_ffff;

const refIds = new WeakMap<object, number>();
let nextRefId = 1;
const themeHashCache = new WeakMap<Theme, number>();
const styleHashCache = new WeakMap<object, number>();
const textValueHashCache = new Map<string, number>();
const TEXT_VALUE_HASH_CACHE_MAX = 8_192;
const TEXT_VALUE_HASH_CACHE_MIN_LEN = 24;
type TextPacketKeyMemo = Readonly<{
  kind: string;
  text: string;
  props: Readonly<Record<string, unknown>>;
  theme: Theme;
  parentStyle: ResolvedTextStyle;
  rectWidth: number;
  rectHeight: number;
  focusBits: number;
  key: number;
}>;
const textPacketKeyMemo = new WeakMap<RuntimeInstance, TextPacketKeyMemo>();

function hashString(value: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

function hashTextValue(value: string): number {
  if (value.length < TEXT_VALUE_HASH_CACHE_MIN_LEN) {
    return hashString(value);
  }
  const cached = textValueHashCache.get(value);
  if (cached !== undefined) return cached;
  const hashed = hashString(value);
  if (textValueHashCache.size >= TEXT_VALUE_HASH_CACHE_MAX) {
    // Bound memory under high-cardinality dynamic text workloads.
    textValueHashCache.clear();
  }
  textValueHashCache.set(value, hashed);
  return hashed;
}

function mixHash(hash: number, value: number): number {
  const mixed = Math.imul((hash ^ (value >>> 0)) >>> 0, FNV_PRIME);
  return mixed >>> 0;
}

function hashUnknown(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return (Math.trunc(value) & HASH_MASK_32) >>> 0;
  if (typeof value === "boolean") return value ? 1 : 2;
  if (typeof value === "string") return hashString(value);
  if (typeof value === "symbol") return hashString(String(value));
  if (typeof value === "bigint") return Number(value & 0xffff_ffffn) >>> 0;

  if (typeof value === "object" || typeof value === "function") {
    const key = value as object;
    const cached = refIds.get(key);
    if (cached !== undefined) return cached >>> 0;
    const id = nextRefId++;
    refIds.set(key, id);
    return id >>> 0;
  }

  return 0;
}

/**
 * Hash a value by content for primitives, by identity for objects/functions.
 * Returns null if the value contains unhashable content (signals uncacheable).
 */
function hashPropValue(hash: number, value: unknown): number {
  if (value === null || value === undefined) return mixHash(hash, 0);
  if (typeof value === "boolean") return mixHash(hash, value ? 1 : 2);
  if (typeof value === "number") return mixHash(hash, (Math.trunc(value) & HASH_MASK_32) >>> 0);
  if (typeof value === "string") return mixHash(hash, hashString(value));
  // Functions (callbacks) don't affect visual output — skip with stable sentinel.
  if (typeof value === "function") return mixHash(hash, 0xcafe_0001);
  // Arrays: hash element count + each element.
  if (Array.isArray(value)) {
    let out = mixHash(hash, value.length);
    for (let i = 0; i < value.length; i++) {
      out = hashPropValue(out, value[i]);
    }
    return out;
  }
  // Plain objects: hash by identity (preserving correctness for complex nested objects).
  return mixHash(hash, hashUnknown(value));
}

/**
 * Hash all own enumerable props of an object by content (primitives) or identity (objects).
 * Callbacks (functions) receive a stable sentinel so re-created closures don't bust the cache.
 */
function hashPropsShallow(hash: number, props: Readonly<Record<string, unknown>>): number {
  let out = hash;
  const keys = Object.keys(props);
  out = mixHash(out, keys.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === undefined) continue;
    out = mixHash(out, hashString(key));
    out = hashPropValue(out, props[key]);
  }
  return out;
}

function hashBoolFlag(value: boolean | undefined): number {
  if (value === true) return 1;
  if (value === false) return 2;
  return 0;
}

function hashTheme(theme: Theme): number {
  const cached = themeHashCache.get(theme);
  if (cached !== undefined) return cached;

  let hash = FNV_OFFSET;
  const keys = Object.keys(theme.colors).sort();
  for (const key of keys) {
    hash = mixHash(hash, hashString(key));
    hash = mixHash(hash, (theme.colors[key] ?? 0) >>> 0);
  }
  for (let i = 0; i < theme.spacing.length; i++) {
    hash = mixHash(hash, (Math.trunc(theme.spacing[i] ?? 0) & HASH_MASK_32) >>> 0);
  }
  const out = hash === 0 ? 1 : hash >>> 0;
  themeHashCache.set(theme, out);
  return out;
}

function hashResolvedStyle(style: ResolvedTextStyle): number {
  const key = style as unknown as object;
  const cached = styleHashCache.get(key);
  if (cached !== undefined) return cached;

  let hash = FNV_OFFSET;
  hash = mixHash(hash, (style.fg ?? 0) >>> 0);
  hash = mixHash(hash, (style.bg ?? 0) >>> 0);
  hash = mixHash(hash, style.attrs >>> 0);
  hash = mixHash(hash, hashBoolFlag(style.bold));
  hash = mixHash(hash, hashBoolFlag(style.dim));
  hash = mixHash(hash, hashBoolFlag(style.italic));
  hash = mixHash(hash, hashBoolFlag(style.underline));
  hash = mixHash(hash, hashBoolFlag(style.inverse));
  hash = mixHash(hash, hashBoolFlag(style.strikethrough));
  hash = mixHash(hash, hashBoolFlag(style.overline));
  hash = mixHash(hash, hashBoolFlag(style.blink));
  hash = mixHash(hash, hashUnknown(style.underlineStyle));
  hash = mixHash(hash, hashUnknown(style.underlineColor));
  const out = hash === 0 ? 1 : hash >>> 0;
  styleHashCache.set(key, out);
  return out;
}

function hasTerminalCursorFocus(
  node: RuntimeInstance,
  cursorInfo: CursorInfo | undefined,
): boolean {
  if (cursorInfo === undefined) return false;
  if (node.vnode.kind !== "text" && node.vnode.kind !== "richText") return false;
  const props = node.vnode.props as {
    internal_terminalCursorFocus?: unknown;
    terminalCursorFocus?: unknown;
  };
  return (props.internal_terminalCursorFocus ?? props.terminalCursorFocus) === true;
}

function isRenderPacketCacheable(
  node: RuntimeInstance,
  cursorInfo: CursorInfo | undefined,
): boolean {
  if (hasTerminalCursorFocus(node, cursorInfo)) return false;

  switch (node.vnode.kind) {
    case "text":
    case "richText":
    case "badge":
    case "spinner":
    case "icon":
    case "kbd":
    case "status":
    case "tag":
    case "divider":
    case "progress":
    case "gauge":
    case "skeleton":
    case "spacer":
    case "empty":
    case "errorDisplay":
    case "callout":
    case "canvas":
    case "image":
    case "lineChart":
    case "scatter":
    case "heatmap":
    case "sparkline":
    case "barChart":
    case "miniChart":
    case "button":
    case "select":
    case "checkbox":
    case "radioGroup":
    case "slider":
      return true;
    default:
      return false;
  }
}

function focusPressedBits(
  node: RuntimeInstance,
  focusState: FocusState,
  pressedId: string | null,
): number {
  const props = node.vnode.props as { id?: unknown };
  const id = typeof props.id === "string" && props.id.length > 0 ? props.id : null;
  if (id === null) return 0;
  const focused = focusState.focusedId === id;
  const pressed = pressedId === id;
  return (focused ? 1 : 0) | (pressed ? 2 : 0);
}

function isTickDrivenKind(kind: RuntimeInstance["vnode"]["kind"]): boolean {
  return kind === "spinner";
}

/**
 * Fast-path prop hashing for text/richText nodes.
 * Only hashes the visual-relevant props (style, maxWidth, wrap, variant, dim,
 * textOverflow) to avoid the cost of iterating all keys via hashPropsShallow.
 * The text content itself is already hashed separately.
 */
function hashTextProps(hash: number, props: Readonly<Record<string, unknown>>): number {
  const textProps = props as Readonly<{
    style?: unknown;
    maxWidth?: unknown;
    wrap?: unknown;
    variant?: unknown;
    dim?: unknown;
    textOverflow?: unknown;
  }>;

  const style = textProps.style;
  const maxWidth = textProps.maxWidth;
  const wrap = textProps.wrap;
  const variant = textProps.variant;
  const dim = textProps.dim;
  const textOverflow = textProps.textOverflow;

  // Common case for plain text nodes with no explicit props.
  if (
    style === undefined &&
    maxWidth === undefined &&
    wrap === undefined &&
    variant === undefined &&
    dim === undefined &&
    textOverflow === undefined
  ) {
    return mixHash(hash, 0x7458_7430);
  }

  let out = hash;
  if (style !== undefined) {
    out = mixHash(out, 1);
    out = mixHash(out, hashUnknown(style));
  }
  if (maxWidth !== undefined) {
    out = mixHash(out, 2);
    out = hashPropValue(out, maxWidth);
  }
  if (wrap !== undefined) {
    out = mixHash(out, 3);
    out = hashPropValue(out, wrap);
  }
  if (variant !== undefined) {
    out = mixHash(out, 4);
    out = hashPropValue(out, variant);
  }
  if (dim !== undefined) {
    out = mixHash(out, 5);
    out = hashPropValue(out, dim);
  }
  if (textOverflow !== undefined) {
    out = mixHash(out, 6);
    out = hashPropValue(out, textOverflow);
  }
  return out;
}

export function computeRenderPacketKey(
  node: RuntimeInstance,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  rectWidth: number,
  rectHeight: number,
  focusState: FocusState,
  pressedId: string | null,
  tick: number,
  cursorInfo: CursorInfo | undefined,
): number {
  if (!isRenderPacketCacheable(node, cursorInfo)) return 0;

  const focusBits = focusPressedBits(node, focusState, pressedId);
  const kind = node.vnode.kind;
  const vnodeText = (node.vnode as { text?: string }).text;

  if ((kind === "text" || kind === "richText") && vnodeText !== undefined) {
    const props = node.vnode.props as Readonly<Record<string, unknown>>;
    const memo = textPacketKeyMemo.get(node);
    if (
      memo !== undefined &&
      memo.kind === kind &&
      memo.text === vnodeText &&
      memo.props === props &&
      memo.theme === theme &&
      memo.parentStyle === parentStyle &&
      memo.rectWidth === rectWidth &&
      memo.rectHeight === rectHeight &&
      memo.focusBits === focusBits
    ) {
      return memo.key;
    }
  }

  let hash = FNV_OFFSET;
  hash = mixHash(hash, hashString(kind));
  if (vnodeText !== undefined) {
    hash = mixHash(hash, hashTextValue(vnodeText));
  }
  if (kind === "text" || kind === "richText") {
    hash = hashTextProps(hash, node.vnode.props as Readonly<Record<string, unknown>>);
  } else {
    hash = hashPropsShallow(hash, node.vnode.props as Readonly<Record<string, unknown>>);
  }
  hash = mixHash(hash, hashTheme(theme));
  hash = mixHash(hash, hashResolvedStyle(parentStyle));
  hash = mixHash(hash, (Math.trunc(rectWidth) & HASH_MASK_32) >>> 0);
  hash = mixHash(hash, (Math.trunc(rectHeight) & HASH_MASK_32) >>> 0);
  hash = mixHash(hash, focusBits);
  if (isTickDrivenKind(node.vnode.kind)) {
    hash = mixHash(hash, tick >>> 0);
  }
  const out = hash === 0 ? 1 : hash >>> 0;
  if ((kind === "text" || kind === "richText") && vnodeText !== undefined) {
    textPacketKeyMemo.set(node, {
      kind,
      text: vnodeText,
      props: node.vnode.props as Readonly<Record<string, unknown>>,
      theme,
      parentStyle,
      rectWidth,
      rectHeight,
      focusBits,
      key: out,
    });
  }
  return out;
}

export class RenderPacketRecorder implements DrawlistBuilder {
  private readonly ops: RenderPacketOp[] = [];
  private readonly resources: Uint8Array[] = [];
  private readonly blobResourceById = new Map<number, number>();
  private readonly textRunByBlobId = new Map<number, readonly DrawlistTextRunSegment[]>();
  private valid = true;

  constructor(
    private readonly target: DrawlistBuilder,
    private readonly originX: number,
    private readonly originY: number,
  ) {}

  buildPacket(): RenderPacket | null {
    if (!this.valid) return null;
    return Object.freeze({
      ops: Object.freeze(this.ops.slice()),
      resources: Object.freeze(this.resources.slice()),
    });
  }

  private localX(x: number): number {
    return x - this.originX;
  }

  private localY(y: number): number {
    return y - this.originY;
  }

  private invalidatePacket(): void {
    this.valid = false;
  }

  clear(): void {
    this.invalidatePacket();
    this.target.clear();
  }

  clearTo(cols: number, rows: number, style?: Parameters<DrawlistBuilder["clearTo"]>[2]): void {
    this.invalidatePacket();
    this.target.clearTo(cols, rows, style);
  }

  fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    style?: Parameters<DrawlistBuilder["fillRect"]>[4],
  ): void {
    this.target.fillRect(x, y, w, h, style);
    const local = { op: "FILL_RECT", x: this.localX(x), y: this.localY(y), w, h } as const;
    this.ops.push(style === undefined ? local : { ...local, style });
  }

  blitRect(srcX: number, srcY: number, w: number, h: number, dstX: number, dstY: number): void {
    this.invalidatePacket();
    this.target.blitRect(srcX, srcY, w, h, dstX, dstY);
  }

  drawText(
    x: number,
    y: number,
    text: string,
    style?: Parameters<DrawlistBuilder["drawText"]>[3],
  ): void {
    this.target.drawText(x, y, text, style);
    const local = {
      op: "DRAW_TEXT_SLICE",
      x: this.localX(x),
      y: this.localY(y),
      text,
    } as const;
    this.ops.push(style === undefined ? local : { ...local, style });
  }

  pushClip(x: number, y: number, w: number, h: number): void {
    this.target.pushClip(x, y, w, h);
    this.ops.push({ op: "PUSH_CLIP", x: this.localX(x), y: this.localY(y), w, h });
  }

  popClip(): void {
    this.target.popClip();
    this.ops.push({ op: "POP_CLIP" });
  }

  addBlob(bytes: Uint8Array): number | null {
    const blobId = this.target.addBlob(bytes);
    if (blobId !== null) {
      const resourceId = this.resources.length;
      this.resources.push(bytes.slice());
      this.blobResourceById.set(blobId, resourceId);
    }
    return blobId;
  }

  addTextRunBlob(segments: readonly DrawlistTextRunSegment[]): number | null {
    const blobId = this.target.addTextRunBlob(segments);
    if (blobId !== null) {
      const copied = segments.map((segment) =>
        segment.style ? { text: segment.text, style: segment.style } : { text: segment.text },
      );
      this.textRunByBlobId.set(blobId, copied);
    }
    return blobId;
  }

  drawTextRun(x: number, y: number, blobIndex: number): void {
    this.target.drawTextRun(x, y, blobIndex);
    const segments = this.textRunByBlobId.get(blobIndex);
    if (!segments) {
      this.invalidatePacket();
      return;
    }
    this.ops.push({
      op: "DRAW_TEXT_RUN",
      x: this.localX(x),
      y: this.localY(y),
      segments,
    });
  }

  setCursor(...args: Parameters<DrawlistBuilder["setCursor"]>): void {
    this.invalidatePacket();
    this.target.setCursor(...args);
  }

  hideCursor(): void {
    this.invalidatePacket();
    this.target.hideCursor();
  }

  setLink(...args: Parameters<DrawlistBuilder["setLink"]>): void {
    this.invalidatePacket();
    this.target.setLink(...args);
  }

  drawCanvas(...args: Parameters<DrawlistBuilder["drawCanvas"]>): void {
    this.target.drawCanvas(...args);
    const [x, y, w, h, blobIndex, blitter, pxWidth, pxHeight] = args;
    const resourceId = this.blobResourceById.get(blobIndex);
    if (resourceId === undefined) {
      this.invalidatePacket();
      return;
    }
    this.ops.push({
      op: "DRAW_CANVAS",
      x: this.localX(x),
      y: this.localY(y),
      w,
      h,
      resourceId,
      blitter,
      ...(pxWidth !== undefined ? { pxWidth } : {}),
      ...(pxHeight !== undefined ? { pxHeight } : {}),
    });
  }

  drawImage(...args: Parameters<DrawlistBuilder["drawImage"]>): void {
    this.target.drawImage(...args);
    const [x, y, w, h, blobIndex, format, protocol, zLayer, fit, imageId, pxWidth, pxHeight] = args;
    const resourceId = this.blobResourceById.get(blobIndex);
    if (resourceId === undefined) {
      this.invalidatePacket();
      return;
    }
    this.ops.push({
      op: "DRAW_IMAGE",
      x: this.localX(x),
      y: this.localY(y),
      w,
      h,
      resourceId,
      format,
      protocol,
      zLayer,
      fit,
      imageId,
      ...(pxWidth !== undefined ? { pxWidth } : {}),
      ...(pxHeight !== undefined ? { pxHeight } : {}),
    });
  }

  buildInto(dst: Uint8Array): DrawlistBuildResult {
    return this.target.buildInto(dst);
  }

  build(): DrawlistBuildResult {
    return this.target.build();
  }

  reset(): void {
    this.target.reset();
    this.ops.length = 0;
    this.resources.length = 0;
    this.blobResourceById.clear();
    this.textRunByBlobId.clear();
    this.valid = true;
  }
}

export function emitRenderPacket(
  builder: DrawlistBuilder,
  packet: RenderPacket,
  originX: number,
  originY: number,
): void {
  const blobByResourceId: (number | null)[] = new Array(packet.resources.length);
  for (let i = 0; i < packet.resources.length; i++) {
    const resource = packet.resources[i];
    blobByResourceId[i] = resource ? builder.addBlob(resource) : null;
  }

  for (const op of packet.ops) {
    switch (op.op) {
      case "FILL_RECT":
        builder.fillRect(originX + op.x, originY + op.y, op.w, op.h, op.style);
        break;
      case "DRAW_TEXT_SLICE":
        builder.drawText(originX + op.x, originY + op.y, op.text, op.style);
        break;
      case "DRAW_TEXT_RUN": {
        const blobId = builder.addTextRunBlob(op.segments);
        if (blobId !== null) {
          builder.drawTextRun(originX + op.x, originY + op.y, blobId);
          break;
        }
        let cursorX = originX + op.x;
        const y = originY + op.y;
        for (const segment of op.segments) {
          builder.drawText(cursorX, y, segment.text, segment.style);
          cursorX += measureTextCells(segment.text);
        }
        break;
      }
      case "PUSH_CLIP":
        builder.pushClip(originX + op.x, originY + op.y, op.w, op.h);
        break;
      case "POP_CLIP":
        builder.popClip();
        break;
      case "DRAW_CANVAS": {
        const blobId = blobByResourceId[op.resourceId];
        if (blobId === null || blobId === undefined) break;
        builder.drawCanvas(
          originX + op.x,
          originY + op.y,
          op.w,
          op.h,
          blobId,
          op.blitter,
          op.pxWidth,
          op.pxHeight,
        );
        break;
      }
      case "DRAW_IMAGE": {
        const blobId = blobByResourceId[op.resourceId];
        if (blobId === null || blobId === undefined) break;
        builder.drawImage(
          originX + op.x,
          originY + op.y,
          op.w,
          op.h,
          blobId,
          op.format,
          op.protocol,
          op.zLayer,
          op.fit,
          op.imageId,
          op.pxWidth,
          op.pxHeight,
        );
        break;
      }
      default:
        break;
    }
  }
}
