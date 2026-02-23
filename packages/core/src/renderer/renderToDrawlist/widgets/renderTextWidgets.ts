import type { DrawlistBuilderV1, DrawlistBuilderV3 } from "../../../drawlist/types.js";
import {
  type SpinnerVariant,
  getSpinnerFrame,
  resolveIconGlyph as resolveIconRenderGlyph,
} from "../../../icons/index.js";
import {
  measureTextCells,
  truncateMiddle,
  truncateWithEllipsis,
  wrapTextToLines,
} from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { Theme } from "../../../theme/theme.js";
import { linkLabel } from "../../../widgets/link.js";
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

type ResolvedCursor = Readonly<{
  x: number;
  y: number;
  shape: CursorInfo["shape"];
  blink: boolean;
}>;

type MaybeFillOwnBackground = (
  builder: DrawlistBuilderV1,
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

function readTextOverflow(v: unknown): "clip" | "ellipsis" | "middle" {
  switch (v) {
    case "ellipsis":
    case "middle":
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

function isV3Builder(builder: DrawlistBuilderV1): builder is DrawlistBuilderV3 {
  const maybe = builder as Partial<DrawlistBuilderV3>;
  return (
    typeof maybe.drawCanvas === "function" &&
    typeof maybe.drawImage === "function" &&
    typeof maybe.setLink === "function"
  );
}

export function renderTextWidgets(
  builder: DrawlistBuilderV1,
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
      const cursorMeta = readTerminalCursorMeta(props);
      const cursorOffset = Math.min(text.length, Math.max(0, cursorMeta.position ?? text.length));
      const cursorX = Math.min(overflowW, measureTextCells(text.slice(0, cursorOffset)));

      if (wrap && rect.h > 1) {
        const lines = wrapTextToLines(text, overflowW);
        const visibleCount = Math.min(rect.h, lines.length);
        if (visibleCount <= 0) break;

        for (let i = 0; i < visibleCount; i++) {
          const rawLine = lines[i] ?? "";
          const isLastVisible = i === visibleCount - 1;
          const hasHiddenLines = lines.length > visibleCount;
          let line = rawLine;

          if (isLastVisible) {
            switch (textOverflow) {
              case "ellipsis": {
                if (!hasHiddenLines) {
                  line = truncateWithEllipsis(rawLine, overflowW);
                  break;
                }
                if (overflowW <= 1) {
                  line = "…";
                  break;
                }
                const reservedWidth = overflowW - 1;
                const base =
                  measureTextCells(rawLine) <= reservedWidth
                    ? rawLine
                    : truncateWithEllipsis(rawLine, reservedWidth);
                line = base.endsWith("…") ? base : `${base}…`;
                break;
              }
              case "middle":
                line = truncateMiddle(hasHiddenLines ? `${rawLine}…` : rawLine, overflowW);
                break;
              case "clip":
                break;
            }
          }

          builder.pushClip(rect.x, rect.y + i, overflowW, 1);
          builder.drawText(rect.x, rect.y + i, line, style);
          builder.popClip();
        }

        if (cursorInfo && cursorMeta.focused) {
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
    default:
      return undefined;
  }

  return resolvedCursor;
}
