import type { DrawlistBuilder } from "../../../drawlist/types.js";
import {
  type SpinnerVariant,
  getSpinnerFrame,
  resolveIconGlyph as resolveIconRenderGlyph,
} from "../../../icons/index.js";
import {
  measureTextCells,
  truncateMiddle,
  truncateStart,
  truncateWithEllipsis,
  wrapTextToLines,
} from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { Theme } from "../../../theme/theme.js";
import { linkLabel } from "../../../widgets/link.js";
import { type Rgb24, rgb } from "../../../widgets/style.js";
import { asTextStyle } from "../../styles.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { getColorTokens, resolveWidgetFocusStyle } from "../themeTokens.js";
import type { CursorInfo } from "../types.js";

export type StyledSegment = Readonly<{
  text: string;
  style: ResolvedTextStyle;
}>;

type MutableAnsiSgrStyle = {
  fg?: Rgb24;
  bg?: Rgb24;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
};

type ParsedAnsiTransformText = Readonly<{
  segments: readonly StyledSegment[];
  visibleText: string;
  hasAnsi: boolean;
}>;

type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

type MaybeFillOwnBackground = (
  builder: DrawlistBuilder,
  rect: Rect,
  ownStyle: unknown,
  style: ResolvedTextStyle,
) => void;

/** Check if a string contains only printable ASCII (0x20..0x7E). */
function isAsciiText(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) return false;
  }
  return true;
}

const ANSI_ESCAPE = String.fromCharCode(0x1b);
const ANSI_SGR_REGEX = new RegExp(`${ANSI_ESCAPE}\\[([0-9:;]*)m`, "g");
const ANSI_16_PALETTE: readonly Rgb24[] = [
  rgb(0, 0, 0),
  rgb(205, 0, 0),
  rgb(0, 205, 0),
  rgb(205, 205, 0),
  rgb(0, 0, 238),
  rgb(205, 0, 205),
  rgb(0, 205, 205),
  rgb(229, 229, 229),
  rgb(127, 127, 127),
  rgb(255, 0, 0),
  rgb(0, 255, 0),
  rgb(255, 255, 0),
  rgb(92, 92, 255),
  rgb(255, 0, 255),
  rgb(0, 255, 255),
  rgb(255, 255, 255),
];

function ansiPaletteColor(index: number): Rgb24 {
  return ANSI_16_PALETTE[index] ?? ANSI_16_PALETTE[0] ?? rgb(0, 0, 0);
}

function unsetAnsiStyleValue(style: MutableAnsiSgrStyle, key: keyof MutableAnsiSgrStyle): void {
  Reflect.deleteProperty(style, key);
}

function appendStyledSegment(
  segments: StyledSegment[],
  text: string,
  style: ResolvedTextStyle,
): void {
  if (text.length === 0) return;
  const previous = segments[segments.length - 1];
  if (previous && previous.style === style) {
    segments[segments.length - 1] = { text: `${previous.text}${text}`, style };
    return;
  }
  segments.push({ text, style });
}

function parseAnsiSgrCodes(raw: string): number[] {
  if (raw.length === 0) return [0];

  const normalizedRaw = raw
    .replace(/([34]8):2::(\d{1,3}):(\d{1,3}):(\d{1,3})/g, "$1;2;$2;$3;$4")
    .replace(/([34]8):2:\d{1,3}:(\d{1,3}):(\d{1,3}):(\d{1,3})/g, "$1;2;$2;$3;$4")
    .replace(/([34]8):5:(\d{1,3})/g, "$1;5;$2")
    .replaceAll(":", ";");

  const codes: number[] = [];
  for (const part of normalizedRaw.split(";")) {
    if (part.length === 0) {
      codes.push(0);
      continue;
    }
    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) codes.push(parsed);
  }
  return codes.length > 0 ? codes : [0];
}

function isByte(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 255;
}

function decodeAnsi256Color(index: number): Rgb24 {
  if (index < 16) return ansiPaletteColor(index);
  if (index <= 231) {
    const offset = index - 16;
    const rLevel = Math.floor(offset / 36);
    const gLevel = Math.floor((offset % 36) / 6);
    const bLevel = offset % 6;
    const toChannel = (level: number): number => (level === 0 ? 0 : 55 + level * 40);
    return rgb(toChannel(rLevel), toChannel(gLevel), toChannel(bLevel));
  }
  const gray = 8 + (index - 232) * 10;
  return rgb(gray, gray, gray);
}

function clearAnsiStyleOverride(style: MutableAnsiSgrStyle): void {
  unsetAnsiStyleValue(style, "fg");
  unsetAnsiStyleValue(style, "bg");
  unsetAnsiStyleValue(style, "bold");
  unsetAnsiStyleValue(style, "dim");
  unsetAnsiStyleValue(style, "italic");
  unsetAnsiStyleValue(style, "underline");
  unsetAnsiStyleValue(style, "inverse");
  unsetAnsiStyleValue(style, "strikethrough");
}

function applyExtendedAnsiColor(
  channel: "fg" | "bg",
  codes: readonly number[],
  index: number,
  style: MutableAnsiSgrStyle,
): number {
  const mode = codes[index + 1];
  if (mode === 5) {
    const colorIndex = codes[index + 2];
    if (
      typeof colorIndex === "number" &&
      Number.isInteger(colorIndex) &&
      colorIndex >= 0 &&
      colorIndex <= 255
    ) {
      style[channel] = decodeAnsi256Color(colorIndex);
    }
    return index + 2;
  }

  if (mode === 2) {
    const directR = codes[index + 2];
    const directG = codes[index + 3];
    const directB = codes[index + 4];
    if (isByte(directR) && isByte(directG) && isByte(directB)) {
      style[channel] = rgb(directR, directG, directB);
      return index + 4;
    }

    const colorSpace = codes[index + 2];
    const r = codes[index + 3];
    const g = codes[index + 4];
    const b = codes[index + 5];
    if (
      (colorSpace == null ||
        (typeof colorSpace === "number" && Number.isInteger(colorSpace) && colorSpace >= 0)) &&
      isByte(r) &&
      isByte(g) &&
      isByte(b)
    ) {
      style[channel] = rgb(r, g, b);
      return index + 5;
    }

    return index + 4;
  }

  if (mode === 0) {
    if (channel === "fg") {
      unsetAnsiStyleValue(style, "fg");
    } else {
      unsetAnsiStyleValue(style, "bg");
    }
    return index + 1;
  }

  return index;
}

function applyAnsiSgrCodes(codes: readonly number[], style: MutableAnsiSgrStyle): void {
  const normalized = codes.length > 0 ? codes : [0];
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized[index];
    if (code == null) continue;
    if (code === 0) {
      clearAnsiStyleOverride(style);
      continue;
    }
    if (code === 1) {
      style.bold = true;
      continue;
    }
    if (code === 2) {
      style.dim = true;
      continue;
    }
    if (code === 3) {
      style.italic = true;
      continue;
    }
    if (code === 4) {
      style.underline = true;
      continue;
    }
    if (code === 7) {
      style.inverse = true;
      continue;
    }
    if (code === 9) {
      style.strikethrough = true;
      continue;
    }
    if (code === 22) {
      style.bold = false;
      style.dim = false;
      continue;
    }
    if (code === 23) {
      style.italic = false;
      continue;
    }
    if (code === 24) {
      style.underline = false;
      continue;
    }
    if (code === 27) {
      style.inverse = false;
      continue;
    }
    if (code === 29) {
      style.strikethrough = false;
      continue;
    }
    if (code === 39) {
      unsetAnsiStyleValue(style, "fg");
      continue;
    }
    if (code === 49) {
      unsetAnsiStyleValue(style, "bg");
      continue;
    }
    if (code >= 30 && code <= 37) {
      style.fg = ansiPaletteColor(code - 30);
      continue;
    }
    if (code >= 40 && code <= 47) {
      style.bg = ansiPaletteColor(code - 40);
      continue;
    }
    if (code >= 90 && code <= 97) {
      style.fg = ansiPaletteColor(code - 90 + 8);
      continue;
    }
    if (code >= 100 && code <= 107) {
      style.bg = ansiPaletteColor(code - 100 + 8);
      continue;
    }
    if (code === 38 || code === 48) {
      index = applyExtendedAnsiColor(code === 38 ? "fg" : "bg", normalized, index, style);
    }
  }
}

function parseAnsiTransformText(
  text: string,
  baseStyle: ResolvedTextStyle,
): ParsedAnsiTransformText {
  if (text.length === 0 || text.indexOf("\u001b[") === -1) {
    return {
      segments: text.length === 0 ? [] : [{ text, style: baseStyle }],
      visibleText: text,
      hasAnsi: false,
    };
  }

  const segments: StyledSegment[] = [];
  let visibleText = "";
  let lastIndex = 0;
  let hasAnsi = false;
  const activeStyleOverride: MutableAnsiSgrStyle = {};
  let activeStyle = baseStyle;

  ANSI_SGR_REGEX.lastIndex = 0;
  for (const match of text.matchAll(ANSI_SGR_REGEX)) {
    const index = match.index;
    if (index == null) continue;
    hasAnsi = true;
    const plainText = text.slice(lastIndex, index);
    if (plainText.length > 0) {
      visibleText += plainText;
      appendStyledSegment(segments, plainText, activeStyle);
    }

    applyAnsiSgrCodes(parseAnsiSgrCodes(match[1] ?? ""), activeStyleOverride);
    activeStyle = mergeTextStyle(baseStyle, activeStyleOverride);
    lastIndex = index + match[0].length;
  }

  const trailing = text.slice(lastIndex);
  if (trailing.length > 0) {
    visibleText += trailing;
    appendStyledSegment(segments, trailing, activeStyle);
  }

  if (!hasAnsi) {
    return {
      segments: [{ text, style: baseStyle }],
      visibleText: text,
      hasAnsi: false,
    };
  }

  return { segments, visibleText, hasAnsi: true };
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

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
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

function readTextOverflow(v: unknown): "clip" | "ellipsis" | "middle" | "start" {
  switch (v) {
    case "ellipsis":
    case "middle":
    case "start":
      return v;
    default:
      return "clip";
  }
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  if (n <= min) return min;
  if (n >= max) return max;
  return n;
}

export function textVariantToStyle(
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

export function truncateToWidth(text: string, width: number): string {
  if (width <= 0 || text.length === 0) return "";
  return measureTextCells(text) > width ? truncateWithEllipsis(text, width) : text;
}

export function clipSegmentsToWidth(
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

export function drawSegments(
  builder: DrawlistBuilder,
  x: number,
  y: number,
  maxWidth: number,
  segments: readonly StyledSegment[],
): void {
  const textRunStableKey = (segments0: readonly StyledSegment[]): string =>
    JSON.stringify(segments0.map((segment) => [segment.text, segment.style ?? null] as const));

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

export function variantToThemeColor(
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

export function renderTextWidgets(
  builder: DrawlistBuilder,
  focusState: FocusState,
  rect: Rect,
  theme: Theme,
  tick: number,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  cursorInfo: CursorInfo | undefined,
  focusAnnouncement: string | null | undefined,
  maybeFillOwnBackground: MaybeFillOwnBackground,
): ResolvedCursor | null | undefined {
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
        wrap?: unknown;
        __inkTransform?: unknown;
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
      const wrap = props.wrap === true;
      const transform =
        typeof props.__inkTransform === "function"
          ? (props.__inkTransform as (line: string, index: number) => string)
          : undefined;
      const transformLine = (line: string, index: number): string => {
        if (!transform) return line;
        const next = transform(line, index);
        if (typeof next === "string") return next;
        return String(next ?? "");
      };
      const cursorMeta = readTerminalCursorMeta(props);
      const cursorOffset = Math.min(text.length, Math.max(0, cursorMeta.position ?? text.length));

      if (wrap && rect.h > 1) {
        const wrappedLines = wrapTextToLines(text, overflowW);
        const lines = transform
          ? wrappedLines.map((line, index) => transformLine(line ?? "", index))
          : wrappedLines;
        const visibleCount = Math.min(rect.h, lines.length);
        if (visibleCount <= 0) break;

        for (let i = 0; i < visibleCount; i++) {
          const rawLine = lines[i] ?? "";
          const ansiLine = transform ? parseAnsiTransformText(rawLine, style) : undefined;
          const baseLine = ansiLine?.hasAnsi ? ansiLine.visibleText : rawLine;
          const isLastVisible = i === visibleCount - 1;
          const hasHiddenLines = lines.length > visibleCount;
          let line = baseLine;
          let lineSegments = ansiLine?.hasAnsi ? ansiLine.segments : undefined;

          if (isLastVisible) {
            switch (textOverflow) {
              case "ellipsis": {
                if (!hasHiddenLines) {
                  line = truncateWithEllipsis(baseLine, overflowW);
                  lineSegments = undefined;
                  break;
                }
                if (overflowW <= 1) {
                  line = "…";
                  lineSegments = undefined;
                  break;
                }
                const reservedWidth = overflowW - 1;
                const base =
                  measureTextCells(baseLine) <= reservedWidth
                    ? baseLine
                    : truncateWithEllipsis(baseLine, reservedWidth);
                line = base.endsWith("…") ? base : `${base}…`;
                lineSegments = undefined;
                break;
              }
              case "middle":
                line = truncateMiddle(hasHiddenLines ? `${baseLine}…` : baseLine, overflowW);
                lineSegments = undefined;
                break;
              case "start":
                line = truncateStart(hasHiddenLines ? `…${baseLine}` : baseLine, overflowW);
                lineSegments = undefined;
                break;
              case "clip":
                break;
            }
          }

          const clipWidth = transform ? Math.max(overflowW, measureTextCells(line)) : overflowW;
          builder.pushClip(rect.x, rect.y + i, clipWidth, 1);
          if (lineSegments) {
            drawSegments(builder, rect.x, rect.y + i, clipWidth, lineSegments);
          } else {
            builder.drawText(rect.x, rect.y + i, line, style);
          }
          builder.popClip();
        }

        if (!transform && cursorInfo && cursorMeta.focused) {
          let remaining = cursorOffset;
          let cursorLine = 0;
          for (let i = 0; i < visibleCount; i++) {
            const lineLen = (lines[i] ?? "").length;
            if (remaining <= lineLen) {
              cursorLine = i;
              break;
            }
            remaining = Math.max(0, remaining - lineLen - 1);
            cursorLine = i;
          }
          const lineText = lines[Math.min(cursorLine, visibleCount - 1)] ?? "";
          const localOffset = Math.min(lineText.length, Math.max(0, remaining));
          resolvedCursor = {
            x: rect.x + Math.min(overflowW, measureTextCells(lineText.slice(0, localOffset))),
            y: rect.y + Math.min(cursorLine, visibleCount - 1),
            shape: cursorInfo.shape,
            blink: cursorInfo.blink,
          };
        }
        break;
      }

      const transformedText = transformLine(text, 0);
      const ansiText = transform ? parseAnsiTransformText(transformedText, style) : undefined;
      const visibleTransformedText =
        ansiText?.hasAnsi === true ? ansiText.visibleText : transformedText;

      // Avoid measuring in the common ASCII case.
      const fits =
        (isAsciiText(visibleTransformedText) && visibleTransformedText.length <= overflowW) ||
        measureTextCells(visibleTransformedText) <= overflowW;

      if (fits) {
        if (ansiText?.hasAnsi) {
          drawSegments(builder, rect.x, rect.y, overflowW, ansiText.segments);
        } else {
          builder.drawText(rect.x, rect.y, visibleTransformedText, style);
        }
        if (!transform && cursorInfo && cursorMeta.focused) {
          const cursorX = Math.min(
            overflowW,
            measureTextCells(
              visibleTransformedText.slice(
                0,
                Math.min(cursorOffset, visibleTransformedText.length),
              ),
            ),
          );
          resolvedCursor = {
            x: rect.x + cursorX,
            y: rect.y,
            shape: cursorInfo.shape,
            blink: cursorInfo.blink,
          };
        }
        break;
      }

      let displayText = visibleTransformedText;
      let useClip = false;
      let useStyledSegments = ansiText?.hasAnsi === true;

      switch (textOverflow) {
        case "ellipsis":
          displayText = truncateWithEllipsis(visibleTransformedText, overflowW);
          useStyledSegments = false;
          break;
        case "middle":
          displayText = truncateMiddle(visibleTransformedText, overflowW);
          useStyledSegments = false;
          break;
        case "start":
          displayText = truncateStart(visibleTransformedText, overflowW);
          useStyledSegments = false;
          break;
        case "clip":
          useClip = true;
          break;
      }
      if (useClip) {
        builder.pushClip(rect.x, rect.y, overflowW, rect.h);
        if (useStyledSegments && ansiText) {
          drawSegments(builder, rect.x, rect.y, overflowW, ansiText.segments);
        } else {
          builder.drawText(rect.x, rect.y, displayText, style);
        }
        builder.popClip();
      } else {
        if (useStyledSegments && ansiText) {
          drawSegments(builder, rect.x, rect.y, overflowW, ansiText.segments);
        } else {
          builder.drawText(rect.x, rect.y, displayText, style);
        }
      }
      if (!transform && cursorInfo && cursorMeta.focused) {
        const cursorX = Math.min(
          overflowW,
          measureTextCells(
            visibleTransformedText.slice(0, Math.min(cursorOffset, visibleTransformedText.length)),
          ),
        );
        resolvedCursor = {
          x: rect.x + cursorX,
          y: rect.y,
          shape: cursorInfo.shape,
          blink: cursorInfo.blink,
        };
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
      const finalStyle = mergeTextStyle(
        styledLink,
        resolveWidgetFocusStyle(getColorTokens(theme), focused, disabled),
      );

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      if (!disabled) {
        builder.setLink(url, id);
        builder.drawText(rect.x, rect.y, truncateToWidth(text, rect.w), finalStyle);
        builder.setLink(null);
      } else {
        builder.drawText(rect.x, rect.y, truncateToWidth(text, rect.w), finalStyle);
      }
      builder.popClip();
      break;
    }
    default:
      return undefined;
  }

  return resolvedCursor;
}
