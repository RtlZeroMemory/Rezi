import {
  type SpinnerVariant,
  getSpinnerFrame,
  resolveIconGlyph as resolveIconRenderGlyph,
} from "../../../icons/index.js";
import type { DrawlistBuilderV1, DrawlistBuilderV3 } from "../../../index.js";
import type { LayoutTree } from "../../../layout/layout.js";
import {
  measureTextCells,
  truncateMiddle,
  truncateWithEllipsis,
} from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { TerminalProfile } from "../../../terminalProfile.js";
import type { Theme } from "../../../theme/theme.js";
import { resolveColor } from "../../../theme/theme.js";
import type { ColorTokens } from "../../../theme/tokens.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../../ui/designTokens.js";
import { buttonRecipe, inputRecipe } from "../../../ui/recipes.js";
import { createCanvasDrawingSurface, resolveCanvasBlitter } from "../../../widgets/canvas.js";
import {
  colorForHeatmapValue,
  getHeatmapRange,
  normalizeHeatmapScale,
} from "../../../widgets/heatmap.js";
import {
  type ImageBinaryFormat,
  analyzeImageSource,
  hashImageBytes,
  inferRgbaDimensions,
  normalizeImageFit,
  normalizeImageProtocol,
} from "../../../widgets/image.js";
import {
  getLegendLabels,
  getLineChartRange,
  mapSeriesToPoints,
} from "../../../widgets/lineChart.js";
import { linkLabel } from "../../../widgets/link.js";
import { getScatterRange, mapScatterPointsToPixels } from "../../../widgets/scatter.js";
import {
  DEFAULT_SLIDER_TRACK_WIDTH,
  formatSliderValue,
  normalizeSliderState,
} from "../../../widgets/slider.js";
import type { Rgb } from "../../../widgets/style.js";
import type { GraphicsBlitter, SelectOption } from "../../../widgets/types.js";
import { asTextStyle, getButtonLabelStyle } from "../../styles.js";
import { renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle, shouldFillForStyleOverride } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import type { CursorInfo } from "../types.js";
import {
  focusIndicatorEnabled,
  readFocusConfig,
  resolveFocusedContentStyle,
} from "./focusConfig.js";

/**
 * Extract ColorTokens from a legacy Theme for design system recipe use.
 * The legacy Theme stores semantic token paths as flat keys (e.g. "bg.base").
 * This reconstructs the structured ColorTokens shape.
 */
function extractColorTokens(theme: Theme): ColorTokens | null {
  const c = theme.colors;
  // Check if semantic tokens exist (they do when theme was coerced from ThemeDefinition)
  const bgBase = c["bg.base"] as Rgb | undefined;
  if (!bgBase) return null;

  return {
    bg: {
      base: bgBase,
      elevated: (c["bg.elevated"] as Rgb) ?? bgBase,
      overlay: (c["bg.overlay"] as Rgb) ?? bgBase,
      subtle: (c["bg.subtle"] as Rgb) ?? bgBase,
    },
    fg: {
      primary: (c["fg.primary"] as Rgb) ?? c.fg,
      secondary: (c["fg.secondary"] as Rgb) ?? c.muted,
      muted: (c["fg.muted"] as Rgb) ?? c.muted,
      inverse: (c["fg.inverse"] as Rgb) ?? c.bg,
    },
    accent: {
      primary: (c["accent.primary"] as Rgb) ?? c.primary,
      secondary: (c["accent.secondary"] as Rgb) ?? c.secondary,
      tertiary: (c["accent.tertiary"] as Rgb) ?? c.info,
    },
    success: c.success,
    warning: c.warning,
    error: c.danger ?? (c as { error?: Rgb }).error ?? { r: 220, g: 53, b: 69 },
    info: c.info,
    focus: {
      ring: (c["focus.ring"] as Rgb) ?? c.primary,
      bg: (c["focus.bg"] as Rgb) ?? c.bg,
    },
    selected: {
      bg: (c["selected.bg"] as Rgb) ?? c.primary,
      fg: (c["selected.fg"] as Rgb) ?? c.fg,
    },
    disabled: {
      fg: (c["disabled.fg"] as Rgb) ?? c.muted,
      bg: (c["disabled.bg"] as Rgb) ?? c.bg,
    },
    diagnostic: {
      error: (c["diagnostic.error"] as Rgb) ?? c.danger ?? { r: 220, g: 53, b: 69 },
      warning: (c["diagnostic.warning"] as Rgb) ?? c.warning,
      info: (c["diagnostic.info"] as Rgb) ?? c.info,
      hint: (c["diagnostic.hint"] as Rgb) ?? c.success,
    },
    border: {
      subtle: (c["border.subtle"] as Rgb) ?? c.border,
      default: (c["border.default"] as Rgb) ?? c.border,
      strong: (c["border.strong"] as Rgb) ?? c.border,
    },
  };
}

/** Cache to avoid repeated extraction */
const colorTokensCache = new WeakMap<Theme["colors"], ColorTokens | null>();

function getColorTokens(theme: Theme): ColorTokens | null {
  const cached = colorTokensCache.get(theme.colors);
  if (cached !== undefined) return cached;
  const tokens = extractColorTokens(theme);
  colorTokensCache.set(theme.colors, tokens);
  return tokens;
}

function readDsButtonVariant(value: unknown): WidgetVariant | undefined {
  if (value === "solid" || value === "soft" || value === "outline" || value === "ghost") {
    return value;
  }
  return undefined;
}

function readDsButtonTone(value: unknown): WidgetTone | undefined {
  if (
    value === "default" ||
    value === "primary" ||
    value === "danger" ||
    value === "success" ||
    value === "warning"
  ) {
    return value;
  }
  return undefined;
}

function readDsButtonSize(value: unknown): WidgetSize | undefined {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  return undefined;
}

type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

const REPEAT_CACHE_MAX_ENTRIES = 2048;
const repeatCache = new Map<string, string>();

function repeatCached(glyph: string, count: number): string {
  if (count <= 0) return "";
  if (count === 1) return glyph;
  if (count > 256) return glyph.repeat(count);
  const key = `${glyph}\u0000${String(count)}`;
  const cached = repeatCache.get(key);
  if (cached !== undefined) return cached;
  const value = glyph.repeat(count);
  if (repeatCache.size >= REPEAT_CACHE_MAX_ENTRIES) {
    const oldest = repeatCache.keys().next();
    if (!oldest.done) repeatCache.delete(oldest.value);
  }
  repeatCache.set(key, value);
  return value;
}

const SPARKLINE_LEVELS = Object.freeze(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]);

type StyledSegment = Readonly<{
  text: string;
  style: ResolvedTextStyle;
}>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Check if a string contains only printable ASCII (0x20..0x7E). */
function isAsciiText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  if (n <= min) return min;
  if (n >= max) return max;
  return n;
}

function parseHexRgb(value: string): Readonly<{ r: number; g: number; b: number }> | null {
  const raw = value.startsWith("#") ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    const parsed = Number.parseInt(raw, 16);
    return Object.freeze({
      r: (parsed >> 16) & 0xff,
      g: (parsed >> 8) & 0xff,
      b: parsed & 0xff,
    });
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const r = Number.parseInt(raw[0] ?? "0", 16);
    const g = Number.parseInt(raw[1] ?? "0", 16);
    const b = Number.parseInt(raw[2] ?? "0", 16);
    return Object.freeze({
      r: (r << 4) | r,
      g: (g << 4) | g,
      b: (b << 4) | b,
    });
  }
  return null;
}

function resolveCanvasOverlayColor(
  theme: Theme,
  color: string,
): Readonly<{ r: number; g: number; b: number }> {
  const parsedHex = parseHexRgb(color);
  if (parsedHex) return parsedHex;
  return resolveColor(theme, color);
}

function readNumber(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function readNonNegativeInt(v: unknown): number | undefined {
  const n = readNumber(v);
  if (n === undefined || n < 0) return undefined;
  return Math.trunc(n);
}

function readTerminalCursorMeta(
  props: Readonly<{
    internal_terminalCursorFocus?: unknown;
    internal_terminalCursorPosition?: unknown;
    terminalCursorFocus?: unknown;
    terminalCursorPosition?: unknown;
  }>,
): Readonly<{ focused: boolean; position?: number }> {
  const focused = (props.internal_terminalCursorFocus ?? props.terminalCursorFocus) === true;
  const rawPosition = props.internal_terminalCursorPosition ?? props.terminalCursorPosition;
  const position = readNonNegativeInt(rawPosition);
  return { focused, ...(position === undefined ? {} : { position }) };
}

function readPositiveInt(v: unknown): number | undefined {
  const n = readNonNegativeInt(v);
  if (n === undefined || n <= 0) return undefined;
  return n;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function readTextOverflow(v: unknown): "clip" | "ellipsis" | "middle" {
  switch (v) {
    case "ellipsis":
    case "middle":
      return v;
    default:
      return "clip";
  }
}

function textVariantToStyle(
  variant: unknown,
): { bold?: true; dim?: true; inverse?: true } | undefined {
  switch (variant) {
    case "heading":
    case "label":
      return { bold: true };
    case "caption":
      return { dim: true };
    case "code":
      return { inverse: true };
    default:
      return undefined;
  }
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0 || text.length === 0) return "";
  return measureTextCells(text) > width ? truncateWithEllipsis(text, width) : text;
}

function wrapLineByCells(line: string, width: number): readonly string[] {
  if (width <= 0) return Object.freeze([""]);
  if (line.length === 0) return Object.freeze([""]);

  const cps = Array.from(line);
  const out: string[] = [];
  let chunk = "";
  let chunkWidth = 0;

  for (const cp of cps) {
    const cpWidth = Math.max(0, measureTextCells(cp));
    if (chunk.length > 0 && chunkWidth + cpWidth > width) {
      out.push(chunk);
      chunk = cp;
      chunkWidth = cpWidth;
      continue;
    }
    chunk += cp;
    chunkWidth += cpWidth;
  }

  if (chunk.length > 0) out.push(chunk);
  return Object.freeze(out.length > 0 ? out : [""]);
}

type InputLineMeta = Readonly<{
  lines: readonly string[];
  starts: readonly number[];
  ends: readonly number[];
}>;

function buildInputLineMeta(value: string): InputLineMeta {
  const starts: number[] = [];
  const ends: number[] = [];
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 0x0a) {
      starts.push(lineStart);
      ends.push(i);
      lines.push(value.slice(lineStart, i));
      lineStart = i + 1;
    }
  }
  starts.push(lineStart);
  ends.push(value.length);
  lines.push(value.slice(lineStart));
  return Object.freeze({
    lines: Object.freeze(lines),
    starts: Object.freeze(starts),
    ends: Object.freeze(ends),
  });
}

function findInputLineIndex(meta: InputLineMeta, cursor: number): number {
  const c = Math.max(0, cursor);
  for (let i = 0; i < meta.ends.length; i++) {
    const end = meta.ends[i] ?? 0;
    if (c <= end) return i;
  }
  return Math.max(0, meta.ends.length - 1);
}

function resolveMultilineCursorPosition(
  value: string,
  cursor: number,
  contentWidth: number,
  wordWrap: boolean,
): Readonly<{ visualLine: number; visualX: number; visualLines: readonly string[] }> {
  const width = Math.max(1, contentWidth);
  const meta = buildInputLineMeta(value);
  const visualLines: string[] = [];
  const wrappedCountByLine: number[] = [];

  for (const line of meta.lines) {
    const wrapped = wordWrap ? wrapLineByCells(line, width) : Object.freeze([line]);
    wrappedCountByLine.push(wrapped.length);
    for (const segment of wrapped) {
      visualLines.push(segment);
    }
  }

  const lineIndex = findInputLineIndex(meta, cursor);
  const lineStart = meta.starts[lineIndex] ?? 0;
  const lineEnd = meta.ends[lineIndex] ?? value.length;
  const col = Math.max(0, Math.min(Math.max(0, lineEnd - lineStart), cursor - lineStart));
  const lineText = meta.lines[lineIndex] ?? "";

  let visualLine = 0;
  for (let i = 0; i < lineIndex; i++) {
    visualLine += wrappedCountByLine[i] ?? 1;
  }

  if (!wordWrap) {
    return Object.freeze({
      visualLine,
      visualX: measureTextCells(lineText.slice(0, col)),
      visualLines: Object.freeze(visualLines.length > 0 ? visualLines : [""]),
    });
  }

  const wrappedPrefix = wrapLineByCells(lineText.slice(0, col), width);
  const wrappedLineOffset = Math.max(0, wrappedPrefix.length - 1);
  const visualX = measureTextCells(wrappedPrefix[wrappedLineOffset] ?? "");
  return Object.freeze({
    visualLine: visualLine + wrappedLineOffset,
    visualX,
    visualLines: Object.freeze(visualLines.length > 0 ? visualLines : [""]),
  });
}

function clipSegmentsToWidth(
  segments: readonly StyledSegment[],
  maxWidth: number,
): StyledSegment[] {
  if (maxWidth <= 0 || segments.length === 0) return [];

  let remaining = maxWidth;
  const out: StyledSegment[] = [];

  for (const segment of segments) {
    if (remaining <= 0) break;
    if (segment.text.length === 0) continue;
    const segmentWidth = measureTextCells(segment.text);
    if (segmentWidth <= remaining) {
      out.push(segment);
      remaining -= segmentWidth;
      continue;
    }
    const clipped = truncateToWidth(segment.text, remaining);
    if (clipped.length > 0) out.push({ text: clipped, style: segment.style });
    break;
  }

  return out;
}

function drawSegments(
  builder: DrawlistBuilderV1,
  x: number,
  y: number,
  maxWidth: number,
  segments: readonly StyledSegment[],
): void {
  const clipped = clipSegmentsToWidth(segments, maxWidth);
  if (clipped.length === 0) return;
  if (clipped.length === 1) {
    const first = clipped[0];
    if (!first) return;
    builder.drawText(x, y, first.text, first.style);
    return;
  }

  const blobIndex = builder.addTextRunBlob(
    clipped.map((segment) => ({
      text: segment.text,
      style: segment.style,
    })),
  );
  if (blobIndex !== null) {
    builder.drawTextRun(x, y, blobIndex);
    return;
  }

  let cursorX = x;
  for (const segment of clipped) {
    builder.drawText(cursorX, y, segment.text, segment.style);
    cursorX += measureTextCells(segment.text);
  }
}

function variantToThemeColor(
  theme: Theme,
  variant: unknown,
  fallback: string,
): Theme["colors"][string] {
  switch (variant) {
    case "success":
      return theme.colors.success;
    case "warning":
      return theme.colors.warning;
    case "error":
      return theme.colors.danger;
    case "info":
      return theme.colors.info;
    case "default":
      return theme.colors[fallback] ?? theme.colors.primary;
    default:
      return theme.colors[fallback] ?? theme.colors.primary;
  }
}

function statusToThemeColor(theme: Theme, status: unknown): Theme["colors"][string] {
  switch (status) {
    case "online":
      return theme.colors.success;
    case "offline":
      return theme.colors.danger;
    case "away":
      return theme.colors.warning;
    case "busy":
      return theme.colors.danger;
    default:
      return theme.colors.muted;
  }
}

function calloutVariantToColor(theme: Theme, variant: unknown): Theme["colors"][string] {
  switch (variant) {
    case "success":
      return theme.colors.success;
    case "warning":
      return theme.colors.warning;
    case "error":
      return theme.colors.danger;
    default:
      return theme.colors.info;
  }
}

function calloutVariantIcon(variant: unknown): string {
  switch (variant) {
    case "success":
      return "✓";
    case "warning":
      return "⚠";
    case "error":
      return "✗";
    default:
      return "ℹ";
  }
}

function readSpinnerVariant(v: unknown): SpinnerVariant {
  switch (v) {
    case "dots":
    case "line":
    case "circle":
    case "bounce":
    case "pulse":
    case "arrows":
    case "dots2":
      return v;
    default:
      return "dots";
  }
}

function resolveIconText(iconPath: string, useFallback: boolean): string {
  return resolveIconRenderGlyph(iconPath, useFallback).glyph;
}

function maybeFillOwnBackground(
  builder: DrawlistBuilderV1,
  rect: Rect,
  ownStyle: ReturnType<typeof asTextStyle>,
  style: ResolvedTextStyle,
): void {
  if (shouldFillForStyleOverride(ownStyle)) {
    builder.fillRect(rect.x, rect.y, rect.w, rect.h, style);
  }
}

function resolveGaugeColor(
  theme: Theme,
  value: number,
  thresholds: unknown,
): Theme["colors"][string] {
  if (Array.isArray(thresholds)) {
    let bestThreshold: number | undefined;
    let bestVariant: unknown;
    for (const raw of thresholds) {
      if (!isRecord(raw)) continue;
      const entry = raw as { value?: unknown; variant?: unknown };
      const threshold = readNumber(entry.value);
      if (threshold === undefined) continue;
      if (value < threshold) continue;
      if (bestThreshold === undefined || threshold >= bestThreshold) {
        bestThreshold = threshold;
        bestVariant = entry.variant;
      }
    }
    if (bestThreshold !== undefined) {
      return variantToThemeColor(theme, bestVariant, "primary");
    }
  }

  if (value >= 0.9) return theme.colors.danger;
  if (value >= 0.75) return theme.colors.warning;
  if (value >= 0.5) return theme.colors.info;
  return theme.colors.success;
}

function sparklineForData(
  data: readonly number[],
  width: number,
  min: number,
  max: number,
): string {
  if (width <= 0 || data.length === 0) return "";

  const range = max - min;
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const index = Math.min(data.length - 1, Math.floor((i * data.length) / width));
    const value = data[index] ?? min;
    const normalized = range <= 0 ? 0.5 : clamp01((value - min) / range);
    const levelIndex = Math.round(normalized * (SPARKLINE_LEVELS.length - 1));
    const glyph = SPARKLINE_LEVELS[levelIndex] ?? SPARKLINE_LEVELS[0] ?? "▁";
    out.push(glyph);
  }
  return out.join("");
}

function firstChar(text: string): string {
  if (text.length === 0) return "";
  const cp = text.codePointAt(0);
  return cp === undefined ? "" : String.fromCodePoint(cp);
}

function readActionLabel(action: unknown): string | undefined {
  if (!isRecord(action)) return undefined;
  const actionNode = action as { kind?: unknown; props?: unknown; text?: unknown };
  const kind = actionNode.kind;
  const props = isRecord(actionNode.props)
    ? (actionNode.props as { label?: unknown; text?: unknown; icon?: unknown })
    : undefined;

  switch (kind) {
    case "text": {
      const text = readString(actionNode.text);
      return text;
    }
    case "button": {
      const label = props ? readString(props.label) : undefined;
      if (!label) return undefined;
      return `[${label}]`;
    }
    case "badge":
    case "tag":
      return props ? readString(props.text) : undefined;
    case "icon": {
      const iconPath = props ? readString(props.icon) : undefined;
      if (!iconPath) return undefined;
      return resolveIconText(iconPath, false);
    }
    default:
      return undefined;
  }
}

function isV3Builder(builder: DrawlistBuilderV1): builder is DrawlistBuilderV3 {
  const maybe = builder as Partial<DrawlistBuilderV3>;
  return (
    typeof maybe.drawCanvas === "function" &&
    typeof maybe.drawImage === "function" &&
    typeof maybe.setLink === "function"
  );
}

function readGraphicsBlitter(v: unknown): GraphicsBlitter | undefined {
  switch (v) {
    case "auto":
    case "braille":
    case "sextant":
    case "quadrant":
    case "halfblock":
    case "ascii":
      return v;
    default:
      return undefined;
  }
}

function readImageFit(v: unknown): "fill" | "contain" | "cover" | undefined {
  switch (v) {
    case "fill":
    case "contain":
    case "cover":
      return v;
    default:
      return undefined;
  }
}

function readImageProtocol(
  v: unknown,
): "auto" | "kitty" | "sixel" | "iterm2" | "blitter" | undefined {
  switch (v) {
    case "auto":
    case "kitty":
    case "sixel":
    case "iterm2":
    case "blitter":
      return v;
    default:
      return undefined;
  }
}

type ImageRenderRoute = Readonly<
  | { ok: true; mode: "drawImage"; protocol: "auto" | "kitty" | "sixel" | "iterm2" }
  | { ok: true; mode: "drawCanvas" }
  | { ok: false; reason: string }
>;

function resolveProtocolForImageSource(
  requested: "auto" | "kitty" | "sixel" | "iterm2" | "blitter",
  format: ImageBinaryFormat,
  terminalProfile: TerminalProfile | undefined,
  canDrawCanvas: boolean,
): ImageRenderRoute {
  if (requested === "blitter") {
    if (!canDrawCanvas) {
      return Object.freeze({ ok: false, reason: "blitter protocol requires drawlist v4" });
    }
    if (format !== "rgba") {
      return Object.freeze({ ok: false, reason: "blitter protocol requires RGBA source" });
    }
    return Object.freeze({ ok: true, mode: "drawCanvas" });
  }

  if (requested === "kitty" || requested === "sixel") {
    if (format !== "png")
      return Object.freeze({ ok: true, mode: "drawImage", protocol: requested });
    return Object.freeze({
      ok: false,
      reason: "PNG source requires RGBA when using kitty/sixel",
    });
  }

  if (requested === "iterm2") {
    return Object.freeze({ ok: true, mode: "drawImage", protocol: "iterm2" });
  }

  if (requested !== "auto") {
    return Object.freeze({ ok: false, reason: "unsupported image protocol" });
  }

  if (!terminalProfile) {
    if (format === "png") {
      return Object.freeze({
        ok: false,
        reason: "PNG source requires iTerm2 image support (or switch to RGBA)",
      });
    }
    return Object.freeze({ ok: true, mode: "drawImage", protocol: "auto" });
  }

  const supportsKitty = terminalProfile.supportsKittyGraphics === true;
  const supportsIterm2 = terminalProfile.supportsIterm2Images === true;
  const supportsSixel = terminalProfile.supportsSixel === true;

  if (format === "rgba") {
    if (supportsKitty) return Object.freeze({ ok: true, mode: "drawImage", protocol: "kitty" });
    if (supportsIterm2) return Object.freeze({ ok: true, mode: "drawImage", protocol: "iterm2" });
    if (supportsSixel) return Object.freeze({ ok: true, mode: "drawImage", protocol: "sixel" });
    if (canDrawCanvas) return Object.freeze({ ok: true, mode: "drawCanvas" });
    return Object.freeze({
      ok: false,
      reason: "no supported image protocol and blitter fallback unavailable",
    });
  }

  if (supportsIterm2) return Object.freeze({ ok: true, mode: "drawImage", protocol: "iterm2" });
  return Object.freeze({
    ok: false,
    reason: "PNG source requires iTerm2 image support (or switch to RGBA)",
  });
}

function readZLayer(v: unknown): -1 | 0 | 1 {
  if (v === -1 || v === 1) return v;
  return 0;
}

function drawPlaceholderBox(
  builder: DrawlistBuilderV1,
  rect: Rect,
  style: ResolvedTextStyle,
  title: string,
  body: string,
): void {
  if (rect.w <= 0 || rect.h <= 0) return;
  builder.pushClip(rect.x, rect.y, rect.w, rect.h);
  if (rect.w >= 2 && rect.h >= 2) {
    const top = `┌${repeatCached("─", Math.max(0, rect.w - 2))}┐`;
    const mid = `│${repeatCached(" ", Math.max(0, rect.w - 2))}│`;
    const bottom = `└${repeatCached("─", Math.max(0, rect.w - 2))}┘`;
    builder.drawText(rect.x, rect.y, truncateToWidth(top, rect.w), style);
    for (let row = 1; row < rect.h - 1; row++) {
      builder.drawText(rect.x, rect.y + row, truncateToWidth(mid, rect.w), style);
    }
    builder.drawText(rect.x, rect.y + rect.h - 1, truncateToWidth(bottom, rect.w), style);
    if (rect.h >= 3) {
      const titleLine = truncateToWidth(title, Math.max(0, rect.w - 2));
      const bodyLine = truncateToWidth(body, Math.max(0, rect.w - 2));
      builder.drawText(rect.x + 1, rect.y + 1, titleLine, style);
      if (rect.h >= 4) builder.drawText(rect.x + 1, rect.y + 2, bodyLine, style);
    }
  } else {
    builder.drawText(rect.x, rect.y, truncateToWidth(`[${title}]`, rect.w), style);
  }
  builder.popClip();
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function addBlobAligned(builder: DrawlistBuilderV1, bytes: Uint8Array): number | null {
  if ((bytes.byteLength & 3) === 0) return builder.addBlob(bytes);
  const padded = new Uint8Array(align4(bytes.byteLength));
  padded.set(bytes);
  return builder.addBlob(padded);
}

function rgbToHex(color: ReturnType<typeof resolveColor>): string {
  const r = color.r.toString(16).padStart(2, "0");
  const g = color.g.toString(16).padStart(2, "0");
  const b = color.b.toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function renderBasicWidget(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  pressedId: string | null,
  rect: Rect,
  theme: Theme,
  tick: number,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (Readonly<Rect> | undefined)[],
  currentClip: Readonly<Rect> | undefined,
  cursorInfo: CursorInfo | undefined,
  focusAnnouncement: string | null | undefined,
  terminalProfile: TerminalProfile | undefined,
): ResolvedCursor | null {
  const vnode = node.vnode;
  let resolvedCursor: ResolvedCursor | null = null;

  switch (vnode.kind) {
    case "text": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        style?: unknown;
        variant?: unknown;
        textOverflow?: unknown;
        maxWidth?: unknown;
        internal_terminalCursorFocus?: unknown;
        internal_terminalCursorPosition?: unknown;
        terminalCursorFocus?: unknown;
        terminalCursorPosition?: unknown;
      };
      const variantStyle = textVariantToStyle(props.variant);
      const ownStyle = asTextStyle(props.style, theme);
      const style =
        variantStyle === undefined && ownStyle === undefined
          ? parentStyle
          : mergeTextStyle(mergeTextStyle(parentStyle, variantStyle), ownStyle);
      const textOverflow = readTextOverflow(props.textOverflow);
      const maxWidth = readNonNegativeInt(props.maxWidth);
      const overflowW = maxWidth === undefined ? rect.w : Math.min(rect.w, maxWidth);
      if (overflowW <= 0) break;

      const text = vnode.text;
      const cursorMeta = readTerminalCursorMeta(props);
      const cursorOffset = Math.min(text.length, Math.max(0, cursorMeta.position ?? text.length));
      const cursorX = Math.min(overflowW, measureTextCells(text.slice(0, cursorOffset)));

      // Avoid measuring in the common ASCII case.
      const fits =
        (isAsciiText(text) && text.length <= overflowW) || measureTextCells(text) <= overflowW;

      if (fits) {
        builder.drawText(rect.x, rect.y, text, style);
        if (cursorInfo && cursorMeta.focused) {
          resolvedCursor = {
            x: rect.x + cursorX,
            y: rect.y,
            shape: cursorInfo.shape,
            blink: cursorInfo.blink,
          };
        }
        break;
      }

      let displayText = text;
      let useClip = false;

      switch (textOverflow) {
        case "ellipsis":
          displayText = truncateWithEllipsis(text, overflowW);
          break;
        case "middle":
          displayText = truncateMiddle(text, overflowW);
          break;
        case "clip":
          useClip = true;
          break;
      }
      if (useClip) {
        builder.pushClip(rect.x, rect.y, overflowW, rect.h);
        builder.drawText(rect.x, rect.y, displayText, style);
        builder.popClip();
      } else {
        builder.drawText(rect.x, rect.y, displayText, style);
      }
      if (cursorInfo && cursorMeta.focused) {
        resolvedCursor = {
          x: rect.x + cursorX,
          y: rect.y,
          shape: cursorInfo.shape,
          blink: cursorInfo.blink,
        };
      }
      break;
    }
    case "divider": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      const direction = props.direction === "vertical" ? "vertical" : "horizontal";
      const rawChar =
        typeof props.char === "string" && props.char.length > 0 ? props.char : undefined;
      const glyph = (() => {
        const fallback = direction === "horizontal" ? "─" : "│";
        if (!rawChar) return fallback;
        const cp = rawChar.codePointAt(0);
        return cp === undefined ? fallback : String.fromCodePoint(cp);
      })();
      const label = typeof props.label === "string" ? props.label : undefined;
      const color = typeof props.color === "string" ? props.color : undefined;
      const style = color
        ? mergeTextStyle(parentStyle, { fg: resolveColor(theme, color) })
        : parentStyle;

      if (direction === "horizontal") {
        const w = rect.w;
        if (w <= 0) break;
        if (label && label.length > 0) {
          const labelText = ` ${label} `;
          const labelWidth = measureTextCells(labelText);
          if (labelWidth >= w) {
            builder.drawText(rect.x, rect.y, truncateWithEllipsis(labelText, w), style);
            break;
          }
          const remaining = w - labelWidth;
          const left = Math.floor(remaining / 2);
          const right = remaining - left;
          builder.drawText(
            rect.x,
            rect.y,
            `${repeatCached(glyph, left)}${labelText}${repeatCached(glyph, right)}`,
            style,
          );
          break;
        }
        builder.drawText(rect.x, rect.y, repeatCached(glyph, w), style);
        break;
      }

      for (let i = 0; i < rect.h; i++) {
        builder.drawText(rect.x, rect.y + i, glyph, style);
      }
      break;
    }
    case "button": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        label?: unknown;
        disabled?: unknown;
        px?: unknown;
        style?: unknown;
        focusConfig?: unknown;
        pressedStyle?: unknown;
        dsVariant?: unknown;
        dsTone?: unknown;
        dsSize?: unknown;
      };
      const focusConfig = readFocusConfig(props.focusConfig);
      const id = typeof props.id === "string" ? props.id : null;
      const label = typeof props.label === "string" ? props.label : "";
      const disabled = props.disabled === true;
      const focused = id !== null && focusState.focusedId === id;
      const pressed = !disabled && id !== null && pressedId === id;
      const effectiveFocused = focused && focusIndicatorEnabled(focusConfig);

      // Design system recipe path
      const dsVariant = readDsButtonVariant(props.dsVariant);
      const colorTokens = dsVariant !== undefined ? getColorTokens(theme) : null;

      if (colorTokens !== null && dsVariant !== undefined) {
        // Use design system recipe
        const dsTone = readDsButtonTone(props.dsTone) ?? "default";
        const dsSize = readDsButtonSize(props.dsSize) ?? "md";
        const state = disabled
          ? ("disabled" as const)
          : pressed
            ? ("pressed" as const)
            : effectiveFocused
              ? ("focus" as const)
              : ("default" as const);
        const recipeResult = buttonRecipe(colorTokens, {
          variant: dsVariant,
          tone: dsTone,
          size: dsSize,
          state,
        });
        const hasBorder = recipeResult.border !== "none" && rect.w >= 2 && rect.h >= 2;
        const insetContent = hasBorder && rect.w >= 3 && rect.h >= 3;
        const contentX = insetContent ? rect.x + 1 : rect.x;
        const contentW = insetContent ? Math.max(0, rect.w - 2) : rect.w;
        const contentY = insetContent ? rect.y + Math.floor((rect.h - 1) / 2) : rect.y;
        const px = recipeResult.px;
        const availableLabelW = Math.max(0, contentW - px * 2);
        const displayLabel =
          availableLabelW <= 0
            ? ""
            : measureTextCells(label) > availableLabelW
              ? truncateWithEllipsis(label, availableLabelW)
              : label;

        // Fill background if solid/soft variant provides bg color
        if (recipeResult.bg.bg) {
          const bgStyle = mergeTextStyle(parentStyle, recipeResult.bg);
          builder.fillRect(rect.x, rect.y, rect.w, rect.h, bgStyle);
        }

        if (hasBorder) {
          let borderStyle = mergeTextStyle(parentStyle, recipeResult.borderStyle);
          if (recipeResult.bg.bg) {
            borderStyle = mergeTextStyle(borderStyle, { bg: recipeResult.bg.bg });
          }
          renderBoxBorder(builder, rect, recipeResult.border, undefined, "left", borderStyle);
        }

        // Draw label
        if (displayLabel.length > 0) {
          // Keep text cells on the same background as the filled button surface.
          // Without this, inherited parent bg would repaint label cells and leave
          // only side padding visibly filled.
          const labelStyle = mergeTextStyle(
            parentStyle,
            recipeResult.bg.bg
              ? { ...recipeResult.label, bg: recipeResult.bg.bg }
              : recipeResult.label,
          );
          builder.drawText(contentX + px, contentY, displayLabel, labelStyle);
        }
      } else {
        // Legacy path: original ad-hoc styling
        const px =
          typeof props.px === "number" && Number.isFinite(props.px) && props.px >= 0
            ? Math.trunc(props.px)
            : 1;
        const availableLabelW = Math.max(0, rect.w - px * 2);
        const displayLabel =
          availableLabelW <= 0
            ? ""
            : measureTextCells(label) > availableLabelW
              ? truncateWithEllipsis(label, availableLabelW)
              : label;
        const ownStyle = asTextStyle(props.style, theme);
        const baseLabelStyle = mergeTextStyle(
          mergeTextStyle(parentStyle, ownStyle),
          getButtonLabelStyle({ focused: effectiveFocused, disabled }),
        );
        let labelStyle = effectiveFocused
          ? resolveFocusedContentStyle(baseLabelStyle, theme, focusConfig)
          : baseLabelStyle;
        const pressedStyle = asTextStyle(props.pressedStyle, theme);
        if (pressedStyle && pressed) {
          labelStyle = mergeTextStyle(labelStyle, pressedStyle);
        }
        if (displayLabel.length > 0) {
          builder.drawText(rect.x + px, rect.y, displayLabel, labelStyle);
        }
      }
      break;
    }
    case "input": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        value?: unknown;
        placeholder?: unknown;
        disabled?: unknown;
        style?: unknown;
        multiline?: unknown;
        wordWrap?: unknown;
        focusConfig?: unknown;
      };
      const focusConfig = readFocusConfig(props.focusConfig);
      const id = typeof props.id === "string" ? props.id : null;
      const value = typeof props.value === "string" ? props.value : "";
      const placeholder = typeof props.placeholder === "string" ? props.placeholder : "";
      const disabled = props.disabled === true;
      const multiline = props.multiline === true;
      const wordWrap = props.wordWrap !== false;
      const focused = id !== null && focusState.focusedId === id;
      const focusVisible = focused && focusIndicatorEnabled(focusConfig);
      const showPlaceholder = value.length === 0 && placeholder.length > 0;
      const ownStyle = asTextStyle(props.style, theme);
      const baseInputStyle = mergeTextStyle(
        mergeTextStyle(parentStyle, ownStyle),
        getButtonLabelStyle({ focused: focusVisible, disabled }),
      );
      const style = focusVisible
        ? resolveFocusedContentStyle(baseInputStyle, theme, focusConfig)
        : baseInputStyle;
      const placeholderStyle = mergeTextStyle(style, { fg: theme.colors.muted, dim: true });

      if (multiline) {
        const contentW = Math.max(1, rect.w - 2);
        const graphemeOffset = cursorInfo?.cursorByInstanceId.get(node.instanceId) ?? value.length;
        const wrapped = resolveMultilineCursorPosition(value, graphemeOffset, contentW, wordWrap);
        const maxStartVisual = Math.max(0, wrapped.visualLines.length - rect.h);
        const startVisual =
          focused && !disabled
            ? Math.max(0, Math.min(maxStartVisual, wrapped.visualLine - rect.h + 1))
            : 0;

        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        for (let row = 0; row < rect.h; row++) {
          const rawLine = showPlaceholder
            ? row === 0
              ? placeholder
              : ""
            : (wrapped.visualLines[startVisual + row] ?? "");
          const line = wordWrap ? rawLine : truncateToWidth(rawLine, contentW);
          if (line.length === 0) continue;
          builder.drawText(
            rect.x + 1,
            rect.y + row,
            line,
            showPlaceholder ? placeholderStyle : style,
          );
        }
        builder.popClip();

        if (focused && !disabled && cursorInfo && rect.w > 1) {
          const localY = wrapped.visualLine - startVisual;
          if (localY >= 0 && localY < rect.h) {
            const maxCursorX = Math.max(0, rect.w - 2);
            resolvedCursor = {
              x: rect.x + 1 + clampInt(wrapped.visualX, 0, maxCursorX),
              y: rect.y + localY,
              shape: cursorInfo.shape,
              blink: cursorInfo.blink,
            };
          }
        }
      } else {
        const text = showPlaceholder ? placeholder : value;
        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        builder.drawText(rect.x + 1, rect.y, text, showPlaceholder ? placeholderStyle : style);
        builder.popClip();

        // v2 cursor: resolve cursor position for focused enabled input
        if (focused && !disabled && cursorInfo && rect.w > 1) {
          // Cursor offset is stored as grapheme index; convert to cell position
          const graphemeOffset = cursorInfo.cursorByInstanceId.get(node.instanceId);
          const cursorX =
            graphemeOffset !== undefined
              ? measureTextCells(value.slice(0, graphemeOffset))
              : measureTextCells(value);
          const maxCursorX = Math.max(0, rect.w - 2);
          resolvedCursor = {
            x: rect.x + 1 + clampInt(cursorX, 0, maxCursorX),
            y: rect.y,
            shape: cursorInfo.shape,
            blink: cursorInfo.blink,
          };
        }
      }
      break;
    }
    case "focusAnnouncer": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { emptyText?: unknown; style?: unknown };
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);
      const fallback = readString(props.emptyText) ?? "";
      const text = focusAnnouncement ?? fallback;
      if (text.length === 0) break;
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(rect.x, rect.y, truncateToWidth(text, rect.w), style);
      builder.popClip();
      break;
    }
    case "slider": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        value?: unknown;
        min?: unknown;
        max?: unknown;
        step?: unknown;
        width?: unknown;
        label?: unknown;
        showValue?: unknown;
        disabled?: unknown;
        readOnly?: unknown;
        style?: unknown;
      };
      const id = readString(props.id);
      const focused = id !== undefined && focusState.focusedId === id;
      const disabled = props.disabled === true;
      const readOnly = props.readOnly === true;
      const label = readString(props.label) ?? "";
      const showValue = props.showValue !== false;
      const value = readNumber(props.value) ?? Number.NaN;
      const min = readNumber(props.min);
      const max = readNumber(props.max);
      const step = readNumber(props.step);
      const normalized = normalizeSliderState({ value, min, max, step });

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      let stateStyle: { fg?: Theme["colors"][string]; underline?: true; bold?: true; dim?: true };
      if (disabled) {
        stateStyle = { fg: theme.colors.muted };
      } else if (focused && readOnly) {
        stateStyle = { underline: true, bold: true, dim: true };
      } else if (focused) {
        stateStyle = { underline: true, bold: true };
      } else if (readOnly) {
        stateStyle = { dim: true };
      } else {
        stateStyle = {};
      }
      const textStyle = mergeTextStyle(style, stateStyle);

      const labelText = label.length > 0 ? `${label} ` : "";
      const valueText =
        showValue === true ? ` ${formatSliderValue(normalized.value, normalized.step)}` : "";
      const dynamicTrack = rect.w - measureTextCells(labelText) - measureTextCells(valueText) - 2; // '[' + ']'
      const explicitTrack = readPositiveInt(props.width);
      const trackCells = Math.max(
        1,
        explicitTrack ?? Math.max(1, dynamicTrack > 0 ? dynamicTrack : DEFAULT_SLIDER_TRACK_WIDTH),
      );
      const span = normalized.max - normalized.min;
      const ratio = span <= 0 ? 0 : clamp01((normalized.value - normalized.min) / span);
      const thumbIndex =
        trackCells <= 1
          ? 0
          : Math.max(0, Math.min(trackCells - 1, Math.round(ratio * (trackCells - 1))));
      const fillCells = trackCells <= 1 ? 0 : thumbIndex;
      const emptyCells = Math.max(0, trackCells - fillCells - 1);
      const trackText = `${repeatCached("█", fillCells)}●${repeatCached("░", emptyCells)}`;

      const trackStyle = mergeTextStyle(
        textStyle,
        disabled
          ? { fg: theme.colors.muted }
          : readOnly
            ? { fg: theme.colors.info, dim: true }
            : { fg: theme.colors.primary, bold: true },
      );
      const valueStyle = mergeTextStyle(
        textStyle,
        !disabled && readOnly ? { fg: theme.colors.muted } : undefined,
      );

      const segments: StyledSegment[] = [];
      if (labelText.length > 0) segments.push({ text: labelText, style: textStyle });
      segments.push({ text: "[", style: textStyle });
      segments.push({ text: trackText, style: trackStyle });
      segments.push({ text: "]", style: textStyle });
      if (valueText.length > 0) segments.push({ text: valueText, style: valueStyle });

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "spacer":
      break;
    case "field": {
      if (!isVisibleRect(rect)) break;

      const props = vnode.props as {
        label?: unknown;
        error?: unknown;
        required?: unknown;
        hint?: unknown;
      };
      const label = typeof props.label === "string" ? props.label : "";
      const required = props.required === true;
      const error = typeof props.error === "string" ? props.error : undefined;
      const hint = typeof props.hint === "string" ? props.hint : undefined;

      const labelText = required ? `${label} *` : label;
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(rect.x, rect.y, truncateToWidth(labelText, rect.w), parentStyle);
      if (rect.h >= 2) {
        const footerY = rect.y + rect.h - 1;
        const footer = error ?? hint;
        if (footer) {
          const footerStyle = mergeTextStyle(
            parentStyle,
            error ? { fg: theme.colors.danger } : { fg: theme.colors.muted },
          );
          builder.drawText(rect.x, footerY, truncateToWidth(footer, rect.w), footerStyle);
        }
      }
      builder.popClip();

      const childCount = Math.min(node.children.length, layoutNode.children.length);
      for (let i = childCount - 1; i >= 0; i--) {
        const c = node.children[i];
        const lc = layoutNode.children[i];
        if (c && lc) {
          nodeStack.push(c);
          styleStack.push(parentStyle);
          layoutStack.push(lc);
          clipStack.push(currentClip);
        }
      }
      break;
    }
    case "select": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        value?: unknown;
        options?: unknown;
        placeholder?: unknown;
        disabled?: unknown;
        focusConfig?: unknown;
      };
      const focusConfig = readFocusConfig(props.focusConfig);
      const id = typeof props.id === "string" ? props.id : null;
      const focused = id !== null && focusState.focusedId === id;
      const focusVisible = focused && focusIndicatorEnabled(focusConfig);
      const disabled = props.disabled === true;
      const value = typeof props.value === "string" ? props.value : "";
      const placeholder = typeof props.placeholder === "string" ? props.placeholder : "Select…";

      const options = Array.isArray(props.options)
        ? (props.options as readonly SelectOption[])
        : [];
      let label = "";
      for (const opt of options) {
        if (opt && opt.value === value) {
          label = opt.label;
          break;
        }
      }
      if (label.length === 0) label = placeholder;

      const focusStyle = focusVisible ? { underline: true, bold: true } : undefined;
      const baseStyle = mergeTextStyle(
        parentStyle,
        disabled ? { fg: theme.colors.muted, ...focusStyle } : focusStyle,
      );
      const style = focusVisible
        ? resolveFocusedContentStyle(baseStyle, theme, focusConfig)
        : baseStyle;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      const text = ` ${label} ▼`;
      builder.drawText(rect.x, rect.y, text, style);
      builder.popClip();
      break;
    }
    case "checkbox": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        checked?: unknown;
        label?: unknown;
        disabled?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const focused = id !== null && focusState.focusedId === id;
      const disabled = props.disabled === true;
      const checked = props.checked === true;
      const label = typeof props.label === "string" ? props.label : "";
      const box = checked ? "[x]" : "[ ]";
      const text = label.length > 0 ? `${box} ${label}` : box;
      const focusStyle = focused ? { underline: true, bold: true } : undefined;
      const style = mergeTextStyle(
        parentStyle,
        disabled ? { fg: theme.colors.muted, ...focusStyle } : focusStyle,
      );
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(rect.x, rect.y, text, style);
      builder.popClip();
      break;
    }
    case "radioGroup": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        value?: unknown;
        options?: unknown;
        direction?: unknown;
        disabled?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const focused = id !== null && focusState.focusedId === id;
      const disabled = props.disabled === true;
      const value = typeof props.value === "string" ? props.value : "";
      const direction = props.direction === "horizontal" ? "horizontal" : "vertical";
      const options = Array.isArray(props.options)
        ? (props.options as readonly SelectOption[])
        : [];

      const focusStyle = focused ? { underline: true, bold: true } : undefined;
      const style = mergeTextStyle(
        parentStyle,
        disabled ? { fg: theme.colors.muted, ...focusStyle } : focusStyle,
      );

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      let cx = rect.x;
      let cy = rect.y;
      for (const opt of options) {
        const mark = opt.value === value ? "(o)" : "( )";
        const chunk = `${mark} ${opt.label}`;
        builder.drawText(cx, cy, chunk, style);
        if (direction === "horizontal") {
          cx += measureTextCells(chunk) + 2;
        } else {
          cy += 1;
        }
        if (cy >= rect.y + rect.h) break;
      }
      builder.popClip();
      break;
    }
    case "richText": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        spans?: unknown;
        internal_terminalCursorFocus?: unknown;
        internal_terminalCursorPosition?: unknown;
        terminalCursorFocus?: unknown;
        terminalCursorPosition?: unknown;
      };
      const spans = Array.isArray(props.spans)
        ? (props.spans as readonly { text?: unknown; style?: unknown }[])
        : [];
      if (spans.length === 0) break;

      const segments: StyledSegment[] = [];
      let combinedText = "";
      for (const span of spans) {
        const text = readString(span.text) ?? "";
        if (text.length === 0) continue;
        combinedText += text;
        segments.push({
          text,
          style: mergeTextStyle(parentStyle, asTextStyle(span.style, theme)),
        });
      }
      if (segments.length === 0) break;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      const cursorMeta = readTerminalCursorMeta(props);
      if (cursorInfo && cursorMeta.focused) {
        const cursorOffset = Math.min(
          combinedText.length,
          Math.max(0, cursorMeta.position ?? combinedText.length),
        );
        const cursorX = measureTextCells(combinedText.slice(0, cursorOffset));
        const maxCursorX = Math.max(0, rect.w - 1);
        resolvedCursor = {
          x: rect.x + clampInt(cursorX, 0, maxCursorX),
          y: rect.y,
          shape: cursorInfo.shape,
          blink: cursorInfo.blink,
        };
      }
      break;
    }
    case "badge": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { text?: unknown; variant?: unknown; style?: unknown };
      const text = readString(props.text) ?? "";
      const ownStyle = asTextStyle(props.style, theme);
      const color = variantToThemeColor(theme, props.variant, "primary");
      const style = mergeTextStyle(
        mergeTextStyle(parentStyle, { fg: theme.colors.bg, bg: color, bold: true }),
        ownStyle,
      );
      const content = ` ${text} `;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      const display = truncateToWidth(content, rect.w);
      if (display.length > 0) {
        const fillW = Math.min(rect.w, measureTextCells(display));
        if (fillW > 0) builder.fillRect(rect.x, rect.y, fillW, 1, style);
        builder.drawText(rect.x, rect.y, display, style);
      }
      builder.popClip();
      break;
    }
    case "spinner": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { variant?: unknown; style?: unknown; label?: unknown };
      const variant = readSpinnerVariant(props.variant);
      const label = readString(props.label);
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const frame = getSpinnerFrame(variant, tick);
      const frameStyle = mergeTextStyle(style, { fg: theme.colors.primary, bold: true });
      const segments: StyledSegment[] = [{ text: frame, style: frameStyle }];
      if (label && label.length > 0) {
        segments.push({ text: ` ${label}`, style });
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "icon": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { icon?: unknown; fallback?: unknown; style?: unknown };
      const iconPath = readString(props.icon) ?? "";
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const glyph = resolveIconText(iconPath, props.fallback === true);
      const display = truncateToWidth(glyph, rect.w);
      if (display.length === 0) break;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(rect.x, rect.y, display, style);
      builder.popClip();
      break;
    }
    case "kbd": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { keys?: unknown; separator?: unknown; style?: unknown };
      const keysProp = props.keys;
      const separator = readString(props.separator) ?? "+";
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const keyStyle = mergeTextStyle(style, { bold: true });
      const mutedStyle = mergeTextStyle(keyStyle, { fg: theme.colors.muted });
      const segments: StyledSegment[] = [];

      if (typeof keysProp === "string") {
        segments.push({ text: "[", style: mutedStyle });
        segments.push({ text: keysProp, style: keyStyle });
        segments.push({ text: "]", style: mutedStyle });
      } else if (Array.isArray(keysProp)) {
        for (let i = 0; i < keysProp.length; i++) {
          const key = keysProp[i];
          if (typeof key !== "string") continue;
          if (i > 0) segments.push({ text: separator, style: mutedStyle });
          segments.push({ text: "[", style: mutedStyle });
          segments.push({ text: key, style: keyStyle });
          segments.push({ text: "]", style: mutedStyle });
        }
      }
      if (segments.length === 0) break;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "status": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        status?: unknown;
        label?: unknown;
        showLabel?: unknown;
        style?: unknown;
      };
      const label = readString(props.label);
      const showLabel =
        props.showLabel === true || (props.showLabel !== false && label !== undefined);
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const dotStyle = mergeTextStyle(style, {
        fg: statusToThemeColor(theme, props.status),
        bold: true,
      });
      const segments: StyledSegment[] = [{ text: "●", style: dotStyle }];
      if (showLabel && label && label.length > 0) {
        segments.push({ text: ` ${label}`, style });
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "tag": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        text?: unknown;
        variant?: unknown;
        removable?: unknown;
        style?: unknown;
      };
      const text = readString(props.text) ?? "";
      const removable = props.removable === true;
      const ownStyle = asTextStyle(props.style, theme);
      const variantColor = variantToThemeColor(theme, props.variant, "secondary");
      const style = mergeTextStyle(
        mergeTextStyle(parentStyle, { fg: theme.colors.bg, bg: variantColor, bold: true }),
        ownStyle,
      );
      maybeFillOwnBackground(builder, rect, ownStyle, style);
      const content = ` ${text}${removable ? " ×" : ""} `;
      const display = truncateToWidth(content, rect.w);
      if (display.length === 0) break;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      const fillW = Math.min(rect.w, measureTextCells(display));
      if (fillW > 0) builder.fillRect(rect.x, rect.y, fillW, 1, style);
      builder.drawText(rect.x, rect.y, display, style);
      builder.popClip();
      break;
    }
    case "skeleton": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        width?: unknown;
        height?: unknown;
        variant?: unknown;
        style?: unknown;
      };
      const targetW = readNonNegativeInt(props.width) ?? rect.w;
      const targetH = readPositiveInt(props.height) ?? 1;
      const drawW = Math.max(0, Math.min(rect.w, targetW));
      const drawH = Math.max(0, Math.min(rect.h, targetH));
      if (drawW <= 0 || drawH <= 0) break;

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);
      const skeletonStyle = mergeTextStyle(style, { fg: theme.colors.muted, dim: true });
      const variant =
        props.variant === "circle" ? "circle" : props.variant === "rect" ? "rect" : "text";

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      if (variant === "circle") {
        const circleText = truncateToWidth("(░░)", drawW);
        const y = rect.y + Math.floor((drawH - 1) / 2);
        builder.drawText(rect.x, y, circleText, skeletonStyle);
      } else {
        for (let row = 0; row < drawH; row++) {
          const glyph = row % 2 === 0 ? "░" : "▒";
          builder.drawText(rect.x, rect.y + row, repeatCached(glyph, drawW), skeletonStyle);
        }
      }
      builder.popClip();
      break;
    }
    case "progress": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        value?: unknown;
        width?: unknown;
        variant?: unknown;
        showPercent?: unknown;
        label?: unknown;
        style?: unknown;
        trackStyle?: unknown;
      };
      const value = clamp01(readNumber(props.value) ?? 0);
      const label = readString(props.label) ?? "";
      const showPercent = props.showPercent === true;
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const variant =
        props.variant === "blocks" ? "blocks" : props.variant === "minimal" ? "minimal" : "bar";
      const labelText = label.length > 0 ? `${label} ` : "";
      const percentText = showPercent ? ` ${Math.round(value * 100)}%` : "";
      const explicitWidth = readPositiveInt(props.width);
      const dynamicWidth = rect.w - measureTextCells(labelText) - measureTextCells(percentText);
      let barWidth = explicitWidth ?? Math.max(1, dynamicWidth);
      if (variant !== "minimal") barWidth = Math.max(3, barWidth);

      const fillGlyph = variant === "minimal" ? "━" : variant === "blocks" ? "▓" : "█";
      const emptyGlyph = variant === "minimal" ? "╌" : "░";
      const fillStyle = mergeTextStyle(style, { fg: theme.colors.primary, bold: true });
      const trackStyle = mergeTextStyle(
        mergeTextStyle(style, { fg: theme.colors.muted }),
        asTextStyle(props.trackStyle, theme),
      );
      const segments: StyledSegment[] = [];
      if (labelText.length > 0) segments.push({ text: labelText, style });

      if (variant === "minimal") {
        const cells = Math.max(1, barWidth);
        const filled = Math.max(0, Math.min(cells, Math.round(cells * value)));
        const empty = Math.max(0, cells - filled);
        if (filled > 0) segments.push({ text: repeatCached(fillGlyph, filled), style: fillStyle });
        if (empty > 0) segments.push({ text: repeatCached(emptyGlyph, empty), style: trackStyle });
      } else {
        const inner = Math.max(1, barWidth - 2);
        const filled = Math.max(0, Math.min(inner, Math.round(inner * value)));
        const empty = Math.max(0, inner - filled);
        segments.push({ text: "[", style });
        if (filled > 0) segments.push({ text: repeatCached(fillGlyph, filled), style: fillStyle });
        if (empty > 0) segments.push({ text: repeatCached(emptyGlyph, empty), style: trackStyle });
        segments.push({ text: "]", style });
      }
      if (percentText.length > 0) segments.push({ text: percentText, style });

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "gauge": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        value?: unknown;
        label?: unknown;
        variant?: unknown;
        thresholds?: unknown;
        style?: unknown;
      };
      const value = clamp01(readNumber(props.value) ?? 0);
      const label = readString(props.label) ?? "";
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const gaugeColor = resolveGaugeColor(theme, value, props.thresholds);
      const fillStyle = mergeTextStyle(style, { fg: gaugeColor, bold: true });
      const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
      const variant = props.variant === "compact" ? "compact" : "linear";
      const percentText = `${Math.round(value * 100)}%`;
      const labelText = label.length > 0 ? `${label} ` : "";
      const segments: StyledSegment[] = [];
      if (labelText.length > 0) segments.push({ text: labelText, style });

      if (variant === "compact") {
        const compactSuffix = ` ${percentText}`;
        const meterWidth = Math.max(
          1,
          rect.w - measureTextCells(labelText) - measureTextCells(compactSuffix),
        );
        const filled = Math.max(0, Math.min(meterWidth, Math.round(meterWidth * value)));
        const empty = Math.max(0, meterWidth - filled);
        if (filled > 0) segments.push({ text: repeatCached("▓", filled), style: fillStyle });
        if (empty > 0) segments.push({ text: repeatCached("░", empty), style: trackStyle });
        segments.push({ text: compactSuffix, style });
      } else {
        const linearSuffix = ` ${percentText}`;
        const barWidth = Math.max(
          3,
          rect.w - measureTextCells(labelText) - measureTextCells(linearSuffix),
        );
        const inner = Math.max(1, barWidth - 2);
        const filled = Math.max(0, Math.min(inner, Math.round(inner * value)));
        const empty = Math.max(0, inner - filled);
        segments.push({ text: "[", style });
        if (filled > 0) segments.push({ text: repeatCached("▓", filled), style: fillStyle });
        if (empty > 0) segments.push({ text: repeatCached("░", empty), style: trackStyle });
        segments.push({ text: "]", style });
        segments.push({ text: linearSuffix, style });
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "empty": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        icon?: unknown;
        title?: unknown;
        description?: unknown;
        action?: unknown;
        style?: unknown;
      };
      const title = readString(props.title) ?? "";
      const description = readString(props.description);
      const iconPath = readString(props.icon);
      const actionLabel = readActionLabel(props.action);

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const lines: StyledSegment[] = [];
      if (iconPath && iconPath.length > 0) {
        const icon = resolveIconText(iconPath, false);
        if (icon.length > 0) {
          lines.push({
            text: icon,
            style: mergeTextStyle(style, { fg: theme.colors.muted }),
          });
        }
      }
      if (title.length > 0) {
        lines.push({ text: title, style: mergeTextStyle(style, { bold: true }) });
      }
      if (description && description.length > 0) {
        lines.push({
          text: description,
          style: mergeTextStyle(style, { fg: theme.colors.muted }),
        });
      }
      if (actionLabel && actionLabel.length > 0) {
        lines.push({
          text: actionLabel,
          style: mergeTextStyle(style, { fg: theme.colors.info, underline: true }),
        });
      }
      if (lines.length === 0) break;

      const startY = rect.y + Math.max(0, Math.floor((rect.h - lines.length) / 2));
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const y = startY + i;
        if (y < rect.y || y >= rect.y + rect.h) continue;
        const text = truncateToWidth(line.text, rect.w);
        if (text.length === 0) continue;
        const textWidth = measureTextCells(text);
        const x = rect.x + Math.max(0, Math.floor((rect.w - textWidth) / 2));
        builder.drawText(x, y, text, line.style);
      }
      builder.popClip();
      break;
    }
    case "errorDisplay": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        title?: unknown;
        message?: unknown;
        stack?: unknown;
        showStack?: unknown;
        onRetry?: unknown;
        style?: unknown;
      };
      const title = readString(props.title) ?? "Error";
      const message = readString(props.message) ?? "";
      const stack = readString(props.stack);
      const showStack = props.showStack === true;
      const showRetry = typeof props.onRetry === "function";

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const titleStyle = mergeTextStyle(style, { fg: theme.colors.danger, bold: true });
      const stackStyle = mergeTextStyle(style, { fg: theme.colors.muted, dim: true });

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      let y = rect.y;
      if (y < rect.y + rect.h) {
        builder.drawText(rect.x, y, truncateToWidth(`✗ ${title}`, rect.w), titleStyle);
        y += 1;
      }
      for (const line of message.split("\n")) {
        if (y >= rect.y + rect.h) break;
        builder.drawText(rect.x, y, truncateToWidth(line, rect.w), style);
        y += 1;
      }

      if (showStack && stack && stack.length > 0) {
        for (const line of stack.split("\n")) {
          if (y >= rect.y + rect.h) break;
          builder.drawText(rect.x, y, truncateToWidth(line, rect.w), stackStyle);
          y += 1;
        }
      }

      if (showRetry && y < rect.y + rect.h) {
        builder.drawText(
          rect.x,
          y,
          truncateToWidth("[Retry]", rect.w),
          mergeTextStyle(style, { fg: theme.colors.info, underline: true }),
        );
      }
      builder.popClip();
      break;
    }
    case "callout": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        variant?: unknown;
        title?: unknown;
        message?: unknown;
        icon?: unknown;
        style?: unknown;
      };
      const variant = props.variant;
      const title = readString(props.title);
      const message = readString(props.message) ?? "";
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const accentColor = calloutVariantToColor(theme, variant);
      const borderStyle = mergeTextStyle(style, { fg: theme.colors.border });
      if (rect.w >= 2 && rect.h >= 2) {
        renderBoxBorder(builder, rect, "single", undefined, "left", borderStyle);
      }

      const inset = rect.w >= 2 && rect.h >= 2 ? 1 : 0;
      const innerX = rect.x + inset;
      const innerY = rect.y + inset;
      const innerW = Math.max(0, rect.w - inset * 2);
      const innerH = Math.max(0, rect.h - inset * 2);
      if (innerW <= 0 || innerH <= 0) break;

      const accentStyle = mergeTextStyle(style, { fg: accentColor, bold: true });
      const titleStyle = mergeTextStyle(style, { fg: accentColor, bold: true });
      const iconOverride = readString(props.icon);
      const iconGlyph =
        iconOverride && iconOverride.length > 0
          ? resolveIconText(iconOverride, false)
          : calloutVariantIcon(variant);

      builder.pushClip(innerX, innerY, innerW, innerH);
      for (let row = 0; row < innerH; row++) {
        builder.drawText(innerX, innerY + row, "│", accentStyle);
      }

      const contentX = innerX + (innerW >= 3 ? 2 : 1);
      const contentW = Math.max(0, innerW - (contentX - innerX));
      if (contentW > 0) {
        let y = innerY;
        if (title && title.length > 0) {
          const header: StyledSegment[] = [];
          if (iconGlyph.length > 0) header.push({ text: `${iconGlyph} `, style: accentStyle });
          header.push({ text: title, style: titleStyle });
          drawSegments(builder, contentX, y, contentW, header);
          y += 1;
        }

        if (y < innerY + innerH) {
          const firstLinePrefix =
            title && title.length > 0 ? "" : iconGlyph.length > 0 ? `${iconGlyph} ` : "";
          const lines = message.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (y >= innerY + innerH) break;
            const line = i === 0 ? `${firstLinePrefix}${lines[i] ?? ""}` : (lines[i] ?? "");
            builder.drawText(contentX, y, truncateToWidth(line, contentW), style);
            y += 1;
          }
        }
      }

      builder.popClip();
      break;
    }
    case "link": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        url?: unknown;
        label?: unknown;
        style?: unknown;
        disabled?: unknown;
      };
      const url = readString(props.url) ?? "";
      if (url.length === 0) break;
      const label = readString(props.label);
      const text = linkLabel({ url, ...(label ? { label } : {}) });
      const ownStyle = asTextStyle(props.style, theme);
      const baseLinkStyle = mergeTextStyle(parentStyle, {
        underline: true,
        fg: theme.colors.primary,
      });
      const styledLink = ownStyle ? mergeTextStyle(baseLinkStyle, ownStyle) : baseLinkStyle;
      const id = readString(props.id);
      const disabled = props.disabled === true;
      const focused = !disabled && id !== undefined && focusState.focusedId === id;
      const finalStyle = focused ? mergeTextStyle(styledLink, { bold: true }) : styledLink;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      if (isV3Builder(builder) && !disabled) {
        builder.setLink(url, id);
        builder.drawText(rect.x, rect.y, truncateToWidth(text, rect.w), finalStyle);
        builder.setLink(null);
      } else {
        builder.drawText(rect.x, rect.y, truncateToWidth(text, rect.w), finalStyle);
      }
      builder.popClip();
      break;
    }
    case "canvas": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        draw?: unknown;
        blitter?: unknown;
      };
      if (typeof props.draw !== "function") break;
      const requestedBlitter = readGraphicsBlitter(props.blitter);
      const blitter = resolveCanvasBlitter(requestedBlitter, true);
      const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
        resolveColor(theme, color),
      );
      (props.draw as (ctx: typeof surface.ctx) => void)(surface.ctx);

      if (isV3Builder(builder) && rect.w > 0 && rect.h > 0) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Canvas", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Canvas", "graphics not supported");
      }

      if (surface.overlays.length > 0) {
        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        for (const overlay of surface.overlays) {
          const color =
            overlay.color === undefined
              ? undefined
              : { fg: resolveCanvasOverlayColor(theme, overlay.color) };
          builder.drawText(rect.x + overlay.x, rect.y + overlay.y, overlay.text, color);
        }
        builder.popClip();
      }
      break;
    }
    case "image": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        src?: unknown;
        sourceWidth?: unknown;
        sourceHeight?: unknown;
        fit?: unknown;
        protocol?: unknown;
        alt?: unknown;
        imageId?: unknown;
        zLayer?: unknown;
      };
      const alt = readString(props.alt);
      const fallbackBody = (reason: string): string => {
        if (alt !== undefined) {
          const trimmed = alt.trim();
          if (trimmed.length > 0) return trimmed;
        }
        return reason;
      };
      const src = props.src;
      if (!(src instanceof Uint8Array)) {
        drawPlaceholderBox(builder, rect, parentStyle, "Image", fallbackBody("invalid source"));
        break;
      }
      const analyzed = analyzeImageSource(src);
      if (!analyzed.ok || !analyzed.bytes || !analyzed.format) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody(analyzed.error ?? "decode failed"),
        );
        break;
      }

      if (!isV3Builder(builder) || rect.w <= 0 || rect.h <= 0) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("graphics not supported"),
        );
        break;
      }

      const fit = normalizeImageFit(readImageFit(props.fit));
      const requestedProtocol = normalizeImageProtocol(readImageProtocol(props.protocol));
      const resolvedProtocol = resolveProtocolForImageSource(
        requestedProtocol,
        analyzed.format,
        terminalProfile,
        builder.drawlistVersion >= 4,
      );
      if (!resolvedProtocol.ok) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody(resolvedProtocol.reason),
        );
        break;
      }
      const zLayer = readZLayer(props.zLayer);
      const imageId = readNonNegativeInt(props.imageId) ?? hashImageBytes(analyzed.bytes) ?? 0;
      const explicitSourceWidth = readPositiveInt(props.sourceWidth);
      const explicitSourceHeight = readPositiveInt(props.sourceHeight);
      if ((explicitSourceWidth === undefined) !== (explicitSourceHeight === undefined)) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("sourceWidth/sourceHeight must be provided together"),
        );
        break;
      }
      const explicitDims =
        explicitSourceWidth !== undefined && explicitSourceHeight !== undefined
          ? { width: explicitSourceWidth, height: explicitSourceHeight }
          : null;
      if (explicitDims && analyzed.format === "rgba") {
        const expectedLen = explicitDims.width * explicitDims.height * 4;
        if (!Number.isSafeInteger(expectedLen) || expectedLen !== analyzed.bytes.byteLength) {
          drawPlaceholderBox(
            builder,
            rect,
            parentStyle,
            "Image",
            fallbackBody("RGBA source size does not match sourceWidth/sourceHeight"),
          );
          break;
        }
      }
      const dims =
        explicitDims ??
        (analyzed.format === "png"
          ? analyzed.width !== undefined && analyzed.height !== undefined
            ? { width: analyzed.width, height: analyzed.height }
            : null
          : inferRgbaDimensions(analyzed.bytes.byteLength, rect.w, rect.h));
      if (!dims) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("unable to infer pixel size"),
        );
        break;
      }

      if (resolvedProtocol.mode === "drawCanvas") {
        const canvasBlobIndex = addBlobAligned(builder, analyzed.bytes);
        if (canvasBlobIndex === null) {
          drawPlaceholderBox(
            builder,
            rect,
            parentStyle,
            "Image",
            fallbackBody("blob allocation failed"),
          );
          break;
        }
        const blitter = resolveCanvasBlitter("auto", true);
        builder.drawCanvas(
          rect.x,
          rect.y,
          rect.w,
          rect.h,
          canvasBlobIndex,
          blitter,
          dims.width,
          dims.height,
        );
        break;
      }

      const blobIndex = addBlobAligned(builder, analyzed.bytes);
      if (blobIndex === null) {
        drawPlaceholderBox(
          builder,
          rect,
          parentStyle,
          "Image",
          fallbackBody("blob allocation failed"),
        );
        break;
      }

      const protocol = resolvedProtocol.protocol;
      builder.drawImage(
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        blobIndex,
        analyzed.format,
        protocol,
        zLayer,
        fit,
        imageId >>> 0,
        dims.width,
        dims.height,
      );
      break;
    }
    case "lineChart": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        series?: unknown;
        blitter?: unknown;
        axes?: unknown;
        showLegend?: unknown;
      };
      const rawSeries = Array.isArray(props.series) ? props.series : [];
      const series = rawSeries.filter(
        (entry): entry is { data?: unknown; color?: unknown; label?: unknown } => isRecord(entry),
      );
      if (series.length === 0) break;
      const showLegend = props.showLegend ?? series.length > 1;
      const legendRows = showLegend ? 1 : 0;
      const chartRows = Math.max(0, rect.h - legendRows);
      if (chartRows <= 0) break;
      const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter) ?? "braille", true);
      const surface = createCanvasDrawingSurface(rect.w, chartRows, blitter, (color) =>
        resolveColor(theme, color),
      );

      const normalizedSeries = series.map((entry) => ({
        data: Array.isArray(entry.data)
          ? entry.data
              .map((value) => readNumber(value) ?? 0)
              .filter((value) => Number.isFinite(value))
          : ([] as number[]),
        color: readString(entry.color) ?? rgbToHex(theme.colors.primary),
        label: readString(entry.label),
      }));
      const range = getLineChartRange(
        normalizedSeries.map((entry) => ({
          data: Object.freeze(entry.data),
          color: entry.color,
          ...(entry.label ? { label: entry.label } : {}),
        })),
        isRecord(props.axes) && isRecord((props.axes as { y?: unknown }).y)
          ? ((props.axes as { y?: unknown }).y as { label?: string; min?: number; max?: number })
          : undefined,
      );

      for (const entry of normalizedSeries) {
        const points = mapSeriesToPoints(entry.data, surface.widthPx, surface.heightPx, range);
        for (let index = 1; index < points.length; index++) {
          const prev = points[index - 1];
          const curr = points[index];
          if (!prev || !curr) continue;
          surface.ctx.line(prev.x, prev.y, curr.x, curr.y, entry.color);
        }
      }

      if (isV3Builder(builder)) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, chartRows, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Line Chart", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Line Chart", "graphics not supported");
      }

      if (showLegend && rect.h > chartRows) {
        const labels = getLegendLabels(
          normalizedSeries.map((entry) => ({
            data: Object.freeze(entry.data),
            color: entry.color,
            ...(entry.label ? { label: entry.label } : {}),
          })),
        );
        const legend = labels.join("  ");
        builder.drawText(rect.x, rect.y + chartRows, truncateToWidth(legend, rect.w), parentStyle);
      }
      break;
    }
    case "scatter": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        points?: unknown;
        axes?: unknown;
        color?: unknown;
        blitter?: unknown;
      };
      const rawPoints = Array.isArray(props.points) ? props.points : [];
      const points = rawPoints.filter(
        (entry): entry is { x?: unknown; y?: unknown; color?: unknown } => isRecord(entry),
      );
      if (points.length === 0 || rect.w <= 0 || rect.h <= 0) break;
      const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter), true);
      const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
        resolveColor(theme, color),
      );
      const normalized = points.map((entry) => {
        const pointColor = readString(entry.color);
        return {
          x: readNumber(entry.x) ?? 0,
          y: readNumber(entry.y) ?? 0,
          ...(pointColor === undefined ? {} : { color: pointColor }),
        };
      });
      const parseAxis = (
        axis: unknown,
      ): { label?: string; min?: number; max?: number } | undefined => {
        if (!isRecord(axis)) return undefined;
        const label = readString((axis as { label?: unknown }).label);
        const min = readNumber((axis as { min?: unknown }).min);
        const max = readNumber((axis as { max?: unknown }).max);
        return {
          ...(label === undefined ? {} : { label }),
          ...(min === undefined ? {} : { min }),
          ...(max === undefined ? {} : { max }),
        };
      };
      const axes = isRecord(props.axes) ? (props.axes as { x?: unknown; y?: unknown }) : undefined;
      const xAxis = parseAxis(axes?.x);
      const yAxis = parseAxis(axes?.y);
      const range = getScatterRange(
        normalized,
        axes === undefined
          ? undefined
          : {
              ...(xAxis === undefined ? {} : { x: xAxis }),
              ...(yAxis === undefined ? {} : { y: yAxis }),
            },
      );
      const mapped = mapScatterPointsToPixels(normalized, surface.widthPx, surface.heightPx, range);
      const fallbackColor = readString(props.color) ?? rgbToHex(theme.colors.primary);
      for (const point of mapped) {
        surface.ctx.setPixel(point.x, point.y, point.color ?? fallbackColor);
      }

      if (isV3Builder(builder)) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Scatter", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Scatter", "graphics not supported");
      }
      break;
    }
    case "heatmap": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        min?: unknown;
        max?: unknown;
        colorScale?: unknown;
      };
      const rows = Array.isArray(props.data) ? props.data : [];
      const matrix = rows.map((row) =>
        Array.isArray(row) ? row.map((value) => readNumber(value) ?? 0) : [],
      );
      if (matrix.length === 0 || rect.w <= 0 || rect.h <= 0) break;
      const columns = Math.max(0, ...matrix.map((row) => row.length));
      if (columns <= 0) break;
      const scale = normalizeHeatmapScale(
        (typeof props.colorScale === "string" ? props.colorScale : undefined) as
          | "viridis"
          | "plasma"
          | "inferno"
          | "magma"
          | "turbo"
          | "grayscale"
          | undefined,
      );
      const range = getHeatmapRange(matrix, readNumber(props.min), readNumber(props.max));
      const blitter = resolveCanvasBlitter("quadrant", true);
      const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
        resolveColor(theme, color),
      );

      for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
        const row = matrix[rowIndex] ?? [];
        for (let colIndex = 0; colIndex < columns; colIndex++) {
          const value = row[colIndex] ?? range.min;
          const rgb = colorForHeatmapValue(value, range, scale);
          const x0 = Math.floor((colIndex * surface.widthPx) / columns);
          const x1 = Math.floor(((colIndex + 1) * surface.widthPx) / columns);
          const y0 = Math.floor((rowIndex * surface.heightPx) / matrix.length);
          const y1 = Math.floor(((rowIndex + 1) * surface.heightPx) / matrix.length);
          const cellW = Math.max(1, x1 - x0);
          const cellH = Math.max(1, y1 - y0);
          surface.ctx.fillRect(x0, y0, cellW, cellH, rgbToHex(rgb));
        }
      }

      if (isV3Builder(builder)) {
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
        } else {
          drawPlaceholderBox(builder, rect, parentStyle, "Heatmap", "blob allocation failed");
        }
      } else {
        drawPlaceholderBox(builder, rect, parentStyle, "Heatmap", "graphics not supported");
      }
      break;
    }
    case "sparkline": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        width?: unknown;
        min?: unknown;
        max?: unknown;
        highRes?: unknown;
        blitter?: unknown;
        style?: unknown;
      };
      const rawData = Array.isArray(props.data) ? props.data : [];
      const data: number[] = [];
      for (const value of rawData) {
        const n = readNumber(value);
        if (n !== undefined) data.push(n);
      }
      if (data.length === 0) break;

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);
      const sparkColor = ownStyle?.fg ?? theme.colors.info;

      const width = Math.max(1, Math.min(rect.w, readPositiveInt(props.width) ?? data.length));
      const autoMin = Math.min(...data);
      const autoMax = Math.max(...data);
      const min = readNumber(props.min) ?? autoMin;
      const max = readNumber(props.max) ?? autoMax;
      const sampledData: number[] = [];
      for (let index = 0; index < width; index++) {
        const sourceIndex = Math.min(data.length - 1, Math.floor((index * data.length) / width));
        sampledData.push(data[sourceIndex] ?? min);
      }
      const line = sparklineForData(data, width, min, max);

      const highRes = props.highRes === true;
      if (highRes && isV3Builder(builder) && rect.w > 0 && rect.h > 0) {
        const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter) ?? "braille", true);
        const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
          resolveColor(theme, color),
        );
        const range = max - min;
        const color = rgbToHex(sparkColor);
        if (sampledData.length <= 1) {
          const only = sampledData[0] ?? min;
          const y = Math.round(
            (1 - (range <= 0 ? 0.5 : clamp01((only - min) / range))) * (surface.heightPx - 1),
          );
          if (surface.widthPx > 1) {
            surface.ctx.line(0, y, surface.widthPx - 1, y, color);
          } else {
            surface.ctx.setPixel(0, y, color);
          }
        } else {
          for (let index = 1; index < sampledData.length; index++) {
            const prev = sampledData[index - 1] ?? min;
            const curr = sampledData[index] ?? min;
            const x0 = Math.round(
              ((index - 1) / Math.max(1, sampledData.length - 1)) * (surface.widthPx - 1),
            );
            const x1 = Math.round(
              (index / Math.max(1, sampledData.length - 1)) * (surface.widthPx - 1),
            );
            const y0 = Math.round(
              (1 - (range <= 0 ? 0.5 : clamp01((prev - min) / range))) * (surface.heightPx - 1),
            );
            const y1 = Math.round(
              (1 - (range <= 0 ? 0.5 : clamp01((curr - min) / range))) * (surface.heightPx - 1),
            );
            surface.ctx.line(x0, y0, x1, y1, color);
          }
        }
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
          break;
        }
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(
        rect.x,
        rect.y,
        truncateToWidth(line, rect.w),
        mergeTextStyle(style, { fg: sparkColor }),
      );
      builder.popClip();
      break;
    }
    case "barChart": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        orientation?: unknown;
        showValues?: unknown;
        showLabels?: unknown;
        maxBarLength?: unknown;
        highRes?: unknown;
        blitter?: unknown;
        style?: unknown;
      };
      const rawData = Array.isArray(props.data) ? props.data : [];
      const data = rawData.filter(
        (item): item is { label?: unknown; value?: unknown; variant?: unknown } => isRecord(item),
      );
      if (data.length === 0) break;

      const orientation = props.orientation === "vertical" ? "vertical" : "horizontal";
      const showValues = props.showValues !== false;
      const showLabels = props.showLabels !== false;
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const values = data.map((item) => Math.max(0, readNumber(item.value) ?? 0));
      const maxValue = Math.max(1, ...values);

      if (props.highRes === true && isV3Builder(builder) && rect.w > 0 && rect.h > 0) {
        const blitter = resolveCanvasBlitter(readGraphicsBlitter(props.blitter), true);
        const surface = createCanvasDrawingSurface(rect.w, rect.h, blitter, (color) =>
          resolveColor(theme, color),
        );
        if (orientation === "horizontal") {
          const rowHeight = Math.max(1, Math.floor(surface.heightPx / Math.max(1, data.length)));
          for (let row = 0; row < data.length; row++) {
            const item = data[row];
            if (!item) continue;
            const value = Math.max(0, readNumber(item.value) ?? 0);
            const ratio = clamp01(value / maxValue);
            const fillW = Math.max(0, Math.round(ratio * surface.widthPx));
            const y = row * rowHeight;
            const color = variantToThemeColor(theme, item.variant, "primary");
            surface.ctx.fillRect(0, y, fillW, rowHeight, rgbToHex(color));
          }
        } else {
          const colWidth = Math.max(1, Math.floor(surface.widthPx / Math.max(1, data.length)));
          for (let col = 0; col < data.length; col++) {
            const item = data[col];
            if (!item) continue;
            const value = Math.max(0, readNumber(item.value) ?? 0);
            const ratio = clamp01(value / maxValue);
            const fillH = Math.max(0, Math.round(ratio * surface.heightPx));
            const x = col * colWidth;
            const y = Math.max(0, surface.heightPx - fillH);
            const color = variantToThemeColor(theme, item.variant, "primary");
            surface.ctx.fillRect(x, y, colWidth, fillH, rgbToHex(color));
          }
        }
        const blobIndex = addBlobAligned(builder, surface.rgba);
        if (blobIndex !== null) {
          builder.drawCanvas(rect.x, rect.y, rect.w, rect.h, blobIndex, surface.blitter);
          break;
        }
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      if (orientation === "horizontal") {
        const maxBarLength = readPositiveInt(props.maxBarLength);
        for (let row = 0; row < rect.h && row < data.length; row++) {
          const item = data[row];
          if (!item) continue;
          const label = showLabels ? (readString(item.label) ?? "") : "";
          const value = Math.max(0, readNumber(item.value) ?? 0);
          const valueText = showValues ? ` ${String(value)}` : "";
          const labelText = label.length > 0 ? `${label} ` : "";
          let barWidth = rect.w - measureTextCells(labelText) - measureTextCells(valueText);
          if (maxBarLength !== undefined) barWidth = Math.min(barWidth, maxBarLength);
          barWidth = Math.max(1, barWidth);

          const filled = Math.max(0, Math.min(barWidth, Math.round((value / maxValue) * barWidth)));
          const empty = Math.max(0, barWidth - filled);
          const barStyle = mergeTextStyle(style, {
            fg: variantToThemeColor(theme, item.variant, "primary"),
            bold: true,
          });
          const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
          const segments: StyledSegment[] = [];
          if (labelText.length > 0) segments.push({ text: labelText, style });
          if (filled > 0) segments.push({ text: repeatCached("█", filled), style: barStyle });
          if (empty > 0) segments.push({ text: repeatCached("░", empty), style: trackStyle });
          if (valueText.length > 0) segments.push({ text: valueText, style });
          drawSegments(builder, rect.x, rect.y + row, rect.w, segments);
        }
      } else {
        const labelRows = showLabels ? 1 : 0;
        const valueRows = showValues ? 1 : 0;
        const maxBarLength = readPositiveInt(props.maxBarLength);
        const chartHeight = Math.max(
          0,
          Math.min(rect.h - labelRows - valueRows, maxBarLength ?? Number.POSITIVE_INFINITY),
        );
        const columns = Math.max(1, Math.min(rect.w, data.length));
        for (let col = 0; col < columns; col++) {
          const sourceIndex = Math.min(data.length - 1, Math.floor((col * data.length) / columns));
          const item = data[sourceIndex];
          if (!item) continue;
          const value = Math.max(0, readNumber(item.value) ?? 0);
          const filled =
            chartHeight <= 0
              ? 0
              : Math.max(0, Math.min(chartHeight, Math.round((value / maxValue) * chartHeight)));
          const barStyle = mergeTextStyle(style, {
            fg: variantToThemeColor(theme, item.variant, "primary"),
            bold: true,
          });
          const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
          for (let y = 0; y < chartHeight; y++) {
            const cellY = rect.y + chartHeight - 1 - y;
            const filledCell = y < filled;
            builder.drawText(
              rect.x + col,
              cellY,
              filledCell ? "█" : "░",
              filledCell ? barStyle : trackStyle,
            );
          }
        }

        if (showLabels && chartHeight < rect.h) {
          let labels = "";
          for (let col = 0; col < columns; col++) {
            const sourceIndex = Math.min(
              data.length - 1,
              Math.floor((col * data.length) / columns),
            );
            const item = data[sourceIndex];
            const label = item ? (readString(item.label) ?? "") : "";
            labels += firstChar(label) || " ";
          }
          builder.drawText(rect.x, rect.y + chartHeight, truncateToWidth(labels, rect.w), style);
        }

        if (showValues && chartHeight + labelRows < rect.h) {
          const valueLine = data
            .map((item) => String(Math.max(0, readNumber(item.value) ?? 0)))
            .join(" ");
          const y = rect.y + chartHeight + labelRows;
          builder.drawText(
            rect.x,
            y,
            truncateToWidth(valueLine, rect.w),
            mergeTextStyle(style, { fg: theme.colors.muted }),
          );
        }
      }
      builder.popClip();
      break;
    }
    case "miniChart": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        values?: unknown;
        variant?: unknown;
        style?: unknown;
      };
      const rawValues = Array.isArray(props.values) ? props.values : [];
      const values = rawValues.filter(
        (item): item is { label?: unknown; value?: unknown; max?: unknown } => isRecord(item),
      );
      if (values.length === 0) break;

      const variant = props.variant === "pills" ? "pills" : "bars";
      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const fillGlyph = variant === "pills" ? "●" : "▓";
      const emptyGlyph = variant === "pills" ? "○" : "░";
      const fillStyle = mergeTextStyle(style, { fg: theme.colors.primary, bold: true });
      const trackStyle = mergeTextStyle(style, { fg: theme.colors.muted });
      const segments: StyledSegment[] = [];

      for (let i = 0; i < values.length; i++) {
        const item = values[i];
        if (!item) continue;
        if (i > 0) segments.push({ text: "  ", style });
        const label = readString(item.label) ?? "";
        const value = Math.max(0, readNumber(item.value) ?? 0);
        const max = Math.max(1, readNumber(item.max) ?? Math.max(value, 1));
        const ratio = clamp01(value / max);
        const cells = 5;
        const filled = Math.max(0, Math.min(cells, Math.round(cells * ratio)));
        const empty = Math.max(0, cells - filled);

        if (label.length > 0) segments.push({ text: `${label}:`, style });
        if (filled > 0) segments.push({ text: repeatCached(fillGlyph, filled), style: fillStyle });
        if (empty > 0) segments.push({ text: repeatCached(emptyGlyph, empty), style: trackStyle });
        segments.push({ text: ` ${Math.round(ratio * 100)}%`, style });
      }

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    default:
      break;
  }

  return resolvedCursor;
}
