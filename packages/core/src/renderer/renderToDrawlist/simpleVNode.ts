import {
  type SpinnerVariant,
  getSpinnerFrame,
  resolveIconGlyph as resolveIconRenderGlyph,
} from "../../icons/index.js";
import type { DrawlistBuilderV1, VNode } from "../../index.js";
import {
  measureTextCells,
  truncateMiddle,
  truncateWithEllipsis,
} from "../../layout/textMeasure.js";
import type { Theme } from "../../theme/theme.js";
import { resolveColor } from "../../theme/theme.js";
import { createShadowConfig, renderShadow } from "../shadow.js";
import { asTextStyle, getButtonLabelStyle } from "../styles.js";
import { readBoxBorder, renderBoxBorder } from "./boxBorder.js";
import { readIntNonNegative, resolveMarginFromProps, resolveSpacingFromProps } from "./spacing.js";
import { mergeTextStyle, shouldFillForStyleOverride } from "./textStyle.js";
import type { ResolvedTextStyle } from "./textStyle.js";

type StyledSegment = Readonly<{
  text: string;
  style: ResolvedTextStyle;
}>;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function readString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
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

function resolveIconText(iconPath: string, fallback: boolean): string {
  return resolveIconRenderGlyph(iconPath, fallback).glyph;
}

function readShadowDensity(raw: unknown): "light" | "medium" | "dense" | undefined {
  if (raw === "light" || raw === "medium" || raw === "dense") {
    return raw;
  }
  return undefined;
}

function readShadowOffset(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const value = Math.trunc(raw);
  return value <= 0 ? 0 : value;
}

function resolveBoxShadowConfig(
  shadow: unknown,
  theme: Theme,
): ReturnType<typeof createShadowConfig> | null {
  if (shadow !== true && (shadow === false || shadow === undefined || shadow === null)) {
    return null;
  }

  if (shadow === true) {
    return createShadowConfig({ color: theme.colors.border });
  }

  if (typeof shadow !== "object") {
    return null;
  }

  const config = shadow as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  const offsetX = readShadowOffset(config.offsetX, 1);
  const offsetY = readShadowOffset(config.offsetY, 1);
  const density = readShadowDensity(config.density);
  if (offsetX <= 0 && offsetY <= 0) {
    return null;
  }
  return createShadowConfig({
    color: theme.colors.border,
    offsetX,
    offsetY,
    ...(density !== undefined ? { density } : {}),
  });
}

function clipSegmentsToWidth(
  segments: readonly StyledSegment[],
  maxWidth: number,
): StyledSegment[] {
  if (maxWidth <= 0) return [];
  const out: StyledSegment[] = [];
  let remaining = maxWidth;

  for (const segment of segments) {
    if (segment.text.length === 0 || remaining <= 0) continue;
    const width = measureTextCells(segment.text);
    if (width <= remaining) {
      out.push(segment);
      remaining -= width;
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

/**
 * Simple VNode renderer for virtual list items.
 * This renders a VNode at the given position without going through the full layout system.
 */
export function renderVNodeSimple(
  builder: DrawlistBuilderV1,
  vnode: VNode,
  x: number,
  y: number,
  w: number,
  h: number,
  focused: boolean,
  tick: number,
  theme: Theme,
  inheritedStyle: ResolvedTextStyle,
): void {
  if (h <= 0 || w <= 0) return;

  switch (vnode.kind) {
    case "text": {
      const props = vnode.props as {
        style?: unknown;
        variant?: unknown;
        textOverflow?: unknown;
        maxWidth?: unknown;
      };
      const variantStyle = textVariantToStyle(props.variant);
      const ownStyle = asTextStyle(props.style);
      const style =
        variantStyle === undefined && ownStyle === undefined
          ? inheritedStyle
          : mergeTextStyle(mergeTextStyle(inheritedStyle, variantStyle), ownStyle);
      const textOverflow = readTextOverflow(props.textOverflow);
      const maxWidth = readNonNegativeInt(props.maxWidth);
      const overflowW = maxWidth === undefined ? w : Math.min(w, maxWidth);
      if (overflowW <= 0) break;

      let displayText = vnode.text;
      if (measureTextCells(displayText) > overflowW) {
        switch (textOverflow) {
          case "ellipsis":
            displayText = truncateWithEllipsis(displayText, overflowW);
            break;
          case "middle":
            displayText = truncateMiddle(displayText, overflowW);
            break;
          case "clip":
            break;
        }
      }

      builder.pushClip(x, y, overflowW, h);
      builder.drawText(x, y, displayText, style);
      builder.popClip();
      break;
    }
    case "button": {
      const props = vnode.props as { label?: unknown; disabled?: unknown; style?: unknown };
      const label = typeof props.label === "string" ? props.label : "";
      const disabled = props.disabled === true;
      const ownStyle = asTextStyle(props.style);
      builder.pushClip(x, y, w, h);
      builder.drawText(
        x + 1,
        y,
        label,
        mergeTextStyle(
          mergeTextStyle(inheritedStyle, ownStyle),
          getButtonLabelStyle({ focused, disabled }),
        ),
      );
      builder.popClip();
      break;
    }
    case "input": {
      const props = vnode.props as { value?: unknown; disabled?: unknown; style?: unknown };
      const value = typeof props.value === "string" ? props.value : "";
      const disabled = props.disabled === true;
      const ownStyle = asTextStyle(props.style);
      builder.pushClip(x, y, w, h);
      builder.drawText(
        x + 1,
        y,
        value,
        mergeTextStyle(
          mergeTextStyle(inheritedStyle, ownStyle),
          getButtonLabelStyle({ focused, disabled }),
        ),
      );
      builder.popClip();
      break;
    }
    case "icon": {
      const props = vnode.props as { icon?: unknown; fallback?: unknown; style?: unknown };
      const iconPath = readString(props.icon) ?? "";
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const glyph = resolveIconText(iconPath, props.fallback === true);

      builder.pushClip(x, y, w, h);
      const display = truncateToWidth(glyph, w);
      if (display.length > 0) builder.drawText(x, y, display, style);
      builder.popClip();
      break;
    }
    case "spinner": {
      const props = vnode.props as { variant?: unknown; label?: unknown; style?: unknown };
      const variant = readSpinnerVariant(props.variant);
      const label = readString(props.label);
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const frameStyle = mergeTextStyle(style, { fg: theme.colors.primary, bold: true });
      const frame = getSpinnerFrame(variant, tick);

      builder.pushClip(x, y, w, h);
      drawSegments(
        builder,
        x,
        y,
        w,
        label && label.length > 0
          ? [
              { text: frame, style: frameStyle },
              { text: ` ${label}`, style },
            ]
          : [{ text: frame, style: frameStyle }],
      );
      builder.popClip();
      break;
    }
    case "richText": {
      const props = vnode.props as { spans?: unknown };
      const spans = Array.isArray(props.spans)
        ? (props.spans as readonly { text?: unknown; style?: unknown }[])
        : [];
      if (spans.length === 0) break;

      const segments: StyledSegment[] = [];
      for (const span of spans) {
        const text = readString(span.text) ?? "";
        if (text.length === 0) continue;
        segments.push({
          text,
          style: mergeTextStyle(inheritedStyle, asTextStyle(span.style)),
        });
      }
      if (segments.length === 0) break;

      builder.pushClip(x, y, w, h);
      drawSegments(builder, x, y, w, segments);
      builder.popClip();
      break;
    }
    case "badge": {
      const props = vnode.props as { text?: unknown; variant?: unknown; style?: unknown };
      const text = readString(props.text) ?? "";
      const ownStyle = asTextStyle(props.style);
      const color = variantToThemeColor(theme, props.variant, "primary");
      const style = mergeTextStyle(
        mergeTextStyle(inheritedStyle, { fg: theme.colors.bg, bg: color, bold: true }),
        ownStyle,
      );
      const content = truncateToWidth(` ${text} `, w);

      builder.pushClip(x, y, w, h);
      if (content.length > 0) {
        const fillW = Math.min(w, measureTextCells(content));
        if (fillW > 0) builder.fillRect(x, y, fillW, 1, style);
        builder.drawText(x, y, content, style);
      }
      builder.popClip();
      break;
    }
    case "kbd": {
      const props = vnode.props as { keys?: unknown; separator?: unknown; style?: unknown };
      const keys = props.keys;
      const separator = readString(props.separator) ?? "+";
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const keyStyle = mergeTextStyle(style, { bold: true });
      const mutedStyle = mergeTextStyle(keyStyle, { fg: theme.colors.muted });
      const segments: StyledSegment[] = [];

      if (typeof keys === "string") {
        segments.push({ text: "[", style: mutedStyle });
        segments.push({ text: keys, style: keyStyle });
        segments.push({ text: "]", style: mutedStyle });
      } else if (Array.isArray(keys)) {
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          if (typeof key !== "string") continue;
          if (i > 0) segments.push({ text: separator, style: mutedStyle });
          segments.push({ text: "[", style: mutedStyle });
          segments.push({ text: key, style: keyStyle });
          segments.push({ text: "]", style: mutedStyle });
        }
      }

      builder.pushClip(x, y, w, h);
      drawSegments(builder, x, y, w, segments);
      builder.popClip();
      break;
    }
    case "status": {
      const props = vnode.props as {
        status?: unknown;
        label?: unknown;
        showLabel?: unknown;
        style?: unknown;
      };
      const label = readString(props.label);
      const showLabel =
        props.showLabel === true || (props.showLabel !== false && label !== undefined);
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const dotStyle = mergeTextStyle(style, {
        fg: statusToThemeColor(theme, props.status),
        bold: true,
      });
      const segments: StyledSegment[] = [{ text: "●", style: dotStyle }];
      if (showLabel && label && label.length > 0) {
        segments.push({ text: ` ${label}`, style });
      }

      builder.pushClip(x, y, w, h);
      drawSegments(builder, x, y, w, segments);
      builder.popClip();
      break;
    }
    case "tag": {
      const props = vnode.props as {
        text?: unknown;
        variant?: unknown;
        removable?: unknown;
        style?: unknown;
      };
      const text = readString(props.text) ?? "";
      const removable = props.removable === true;
      const ownStyle = asTextStyle(props.style);
      const variantColor = variantToThemeColor(theme, props.variant, "secondary");
      const tagStyle = mergeTextStyle(
        mergeTextStyle(inheritedStyle, { fg: theme.colors.bg, bg: variantColor, bold: true }),
        ownStyle,
      );
      const content = truncateToWidth(` ${text}${removable ? " ×" : ""} `, w);

      builder.pushClip(x, y, w, h);
      if (content.length > 0) {
        const fillW = Math.min(w, measureTextCells(content));
        if (fillW > 0) builder.fillRect(x, y, fillW, 1, tagStyle);
        builder.drawText(x, y, content, tagStyle);
      }
      builder.popClip();
      break;
    }
    case "progress": {
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
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const variant =
        props.variant === "blocks" ? "blocks" : props.variant === "minimal" ? "minimal" : "bar";
      const labelText = label.length > 0 ? `${label} ` : "";
      const percentText = showPercent ? ` ${Math.round(value * 100)}%` : "";
      const explicitWidth =
        typeof props.width === "number" && Number.isFinite(props.width) && props.width > 0
          ? Math.trunc(props.width)
          : undefined;
      let barWidth =
        explicitWidth ??
        Math.max(1, w - measureTextCells(labelText) - measureTextCells(percentText));
      if (variant !== "minimal") barWidth = Math.max(3, barWidth);

      const fillGlyph = variant === "minimal" ? "━" : variant === "blocks" ? "▓" : "█";
      const emptyGlyph = variant === "minimal" ? "╌" : "░";
      const fillStyle = mergeTextStyle(style, { fg: theme.colors.primary, bold: true });
      const trackStyle = mergeTextStyle(
        mergeTextStyle(style, { fg: theme.colors.muted }),
        asTextStyle(props.trackStyle),
      );

      const segments: StyledSegment[] = [];
      if (labelText.length > 0) segments.push({ text: labelText, style });
      if (variant === "minimal") {
        const filled = Math.max(0, Math.min(barWidth, Math.round(barWidth * value)));
        const empty = Math.max(0, barWidth - filled);
        if (filled > 0) segments.push({ text: fillGlyph.repeat(filled), style: fillStyle });
        if (empty > 0) segments.push({ text: emptyGlyph.repeat(empty), style: trackStyle });
      } else {
        const inner = Math.max(1, barWidth - 2);
        const filled = Math.max(0, Math.min(inner, Math.round(inner * value)));
        const empty = Math.max(0, inner - filled);
        segments.push({ text: "[", style });
        if (filled > 0) segments.push({ text: fillGlyph.repeat(filled), style: fillStyle });
        if (empty > 0) segments.push({ text: emptyGlyph.repeat(empty), style: trackStyle });
        segments.push({ text: "]", style });
      }
      if (percentText.length > 0) segments.push({ text: percentText, style });

      builder.pushClip(x, y, w, h);
      drawSegments(builder, x, y, w, segments);
      builder.popClip();
      break;
    }
    case "spacer": {
      // Spacers are invisible, nothing to render
      break;
    }
    case "row":
    case "column": {
      // Render children in a minimal stack layout (used for virtual list items).
      const props = vnode.props as {
        pad?: unknown;
        p?: unknown;
        px?: unknown;
        py?: unknown;
        pt?: unknown;
        pb?: unknown;
        pl?: unknown;
        pr?: unknown;
        m?: unknown;
        mx?: unknown;
        my?: unknown;
        gap?: unknown;
        style?: unknown;
      };
      const spacing = resolveSpacingFromProps(props);
      const margin = resolveMarginFromProps(props);
      const gap = readIntNonNegative(props.gap, 0);
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const stackX = x + margin.left;
      const stackY = y + margin.top;
      const stackW = Math.max(0, w - margin.left - margin.right);
      const stackH = Math.max(0, h - margin.top - margin.bottom);
      if (shouldFillForStyleOverride(ownStyle)) {
        builder.fillRect(stackX, stackY, stackW, stackH, style);
      }

      const ix = stackX + spacing.left;
      const iy = stackY + spacing.top;
      const iw = Math.max(0, stackW - spacing.left - spacing.right);
      const ih = Math.max(0, stackH - spacing.top - spacing.bottom);

      builder.pushClip(ix, iy, iw, ih);

      const children = vnode.children.filter((c): c is VNode => c !== null && c !== undefined);

      const estimateChildWidth = (child: VNode): number => {
        switch (child.kind) {
          case "text":
            return measureTextCells(child.text);
          case "richText": {
            const p = child.props as { spans?: unknown };
            const spans = Array.isArray(p.spans) ? (p.spans as readonly { text?: unknown }[]) : [];
            let total = 0;
            for (const span of spans) {
              const text = typeof span.text === "string" ? span.text : "";
              total += measureTextCells(text);
            }
            return total;
          }
          case "button": {
            const p = child.props as { label?: unknown };
            const label = typeof p.label === "string" ? p.label : "";
            return measureTextCells(label) + 2; // +1 left padding +1 slack
          }
          case "input": {
            const p = child.props as { value?: unknown };
            const value = typeof p.value === "string" ? p.value : "";
            return measureTextCells(value) + 2; // +1 left padding +1 slack
          }
          case "divider":
            return 1;
          case "icon":
            return 1;
          case "spinner": {
            const p = child.props as { label?: unknown };
            const label = typeof p.label === "string" ? p.label : "";
            return Math.max(1, measureTextCells(label) + (label.length > 0 ? 2 : 1));
          }
          case "badge": {
            const p = child.props as { text?: unknown };
            const text = typeof p.text === "string" ? p.text : "";
            return measureTextCells(text) + 2;
          }
          case "tag": {
            const p = child.props as { text?: unknown; removable?: unknown };
            const text = typeof p.text === "string" ? p.text : "";
            const removable = p.removable === true ? 2 : 0;
            return measureTextCells(text) + 2 + removable;
          }
          case "status": {
            const p = child.props as { label?: unknown; showLabel?: unknown };
            const label = typeof p.label === "string" ? p.label : undefined;
            const showLabel =
              p.showLabel === true || (p.showLabel !== false && label !== undefined);
            return 1 + (showLabel && label ? measureTextCells(label) + 1 : 0);
          }
          case "kbd": {
            const p = child.props as { keys?: unknown; separator?: unknown };
            const sep = typeof p.separator === "string" ? p.separator : "+";
            if (typeof p.keys === "string") return measureTextCells(p.keys) + 2;
            if (!Array.isArray(p.keys)) return 0;
            let total = 0;
            for (let i = 0; i < p.keys.length; i++) {
              const key = p.keys[i];
              if (typeof key !== "string") continue;
              total += measureTextCells(key) + 2;
              if (i > 0) total += measureTextCells(sep);
            }
            return total;
          }
          case "progress": {
            const p = child.props as { width?: unknown; label?: unknown; showPercent?: unknown };
            const explicit =
              typeof p.width === "number" && Number.isFinite(p.width) && p.width > 0
                ? Math.trunc(p.width)
                : 10;
            const label = typeof p.label === "string" ? p.label : "";
            const percent = p.showPercent === true ? 5 : 0;
            return explicit + (label.length > 0 ? measureTextCells(label) + 1 : 0) + percent;
          }
          case "spacer": {
            const p = child.props as { size?: unknown };
            const size = typeof p.size === "number" && Number.isFinite(p.size) ? p.size : 0;
            return Math.max(0, Math.floor(size));
          }
          default:
            return 0;
        }
      };

      if (vnode.kind === "row") {
        const limitX = ix + iw;
        const count = children.length;
        let cursorX = ix;

        for (let i = 0; i < count; i++) {
          const child = children[i];
          if (!child) continue;
          if (cursorX >= limitX) break;

          const remaining = limitX - cursorX;
          const gapsRemaining = gap * Math.max(0, count - i - 1);
          const available = Math.max(0, remaining - gapsRemaining);
          const childW =
            i === count - 1
              ? remaining
              : Math.max(0, Math.min(available, estimateChildWidth(child)));

          renderVNodeSimple(builder, child, cursorX, iy, childW, ih, focused, tick, theme, style);
          cursorX += childW;
          if (i < count - 1) cursorX += gap;
        }
      } else {
        const limitY = iy + ih;
        const count = children.length;
        let cursorY = iy;

        for (let i = 0; i < count; i++) {
          const child = children[i];
          if (!child) continue;
          if (cursorY >= limitY) break;
          const remaining = limitY - cursorY;
          const childH = Math.min(remaining, 1);
          renderVNodeSimple(builder, child, ix, cursorY, iw, childH, focused, tick, theme, style);
          cursorY += childH;
          if (i < count - 1) cursorY += gap;
        }
      }

      builder.popClip();
      break;
    }
    case "divider": {
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
        ? mergeTextStyle(inheritedStyle, { fg: resolveColor(theme, color) })
        : inheritedStyle;

      if (direction === "horizontal") {
        if (w <= 0 || h <= 0) break;
        const lineY = y;
        if (label && label.length > 0) {
          const labelText = ` ${label} `;
          const labelWidth = measureTextCells(labelText);
          if (labelWidth >= w) {
            builder.drawText(x, lineY, truncateToWidth(labelText, w), style);
            break;
          }
          const remaining = w - labelWidth;
          const left = Math.floor(remaining / 2);
          const right = remaining - left;
          builder.drawText(
            x,
            lineY,
            `${glyph.repeat(left)}${labelText}${glyph.repeat(right)}`,
            style,
          );
          break;
        }
        builder.drawText(x, lineY, glyph.repeat(w), style);
        break;
      }

      for (let i = 0; i < h; i++) {
        builder.drawText(x, y + i, glyph, style);
      }
      break;
    }
    case "box": {
      const props = vnode.props as {
        pad?: unknown;
        p?: unknown;
        px?: unknown;
        py?: unknown;
        pt?: unknown;
        pb?: unknown;
        pl?: unknown;
        pr?: unknown;
        m?: unknown;
        mx?: unknown;
        my?: unknown;
        border?: unknown;
        borderTop?: unknown;
        borderRight?: unknown;
        borderBottom?: unknown;
        borderLeft?: unknown;
        title?: unknown;
        shadow?: unknown;
        style?: unknown;
      };
      const spacing = resolveSpacingFromProps(props);
      const margin = resolveMarginFromProps(props);
      const border = readBoxBorder(props.border);
      const defaultSide = border !== "none";
      const borderTop = typeof props.borderTop === "boolean" ? props.borderTop : defaultSide;
      const borderRight = typeof props.borderRight === "boolean" ? props.borderRight : defaultSide;
      const borderBottom =
        typeof props.borderBottom === "boolean" ? props.borderBottom : defaultSide;
      const borderLeft = typeof props.borderLeft === "boolean" ? props.borderLeft : defaultSide;
      const title = typeof props.title === "string" ? props.title : undefined;
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(inheritedStyle, ownStyle);
      const boxX = x + margin.left;
      const boxY = y + margin.top;
      const boxW = Math.max(0, w - margin.left - margin.right);
      const boxH = Math.max(0, h - margin.top - margin.bottom);
      const shadowConfig = resolveBoxShadowConfig(props.shadow, theme);
      if (shadowConfig) {
        renderShadow(builder, { x: boxX, y: boxY, w: boxW, h: boxH }, shadowConfig, style);
      }
      if (shouldFillForStyleOverride(ownStyle)) {
        builder.fillRect(boxX, boxY, boxW, boxH, style);
      }

      renderBoxBorder(
        builder,
        { x: boxX, y: boxY, w: boxW, h: boxH },
        border,
        title,
        "left",
        style,
        { top: borderTop, right: borderRight, bottom: borderBottom, left: borderLeft },
      );

      const bt = border === "none" || !borderTop ? 0 : 1;
      const br = border === "none" || !borderRight ? 0 : 1;
      const bb = border === "none" || !borderBottom ? 0 : 1;
      const bl = border === "none" || !borderLeft ? 0 : 1;

      const cx = boxX + bl + spacing.left;
      const cy = boxY + bt + spacing.top;
      const cw = Math.max(0, boxW - bl - br - spacing.left - spacing.right);
      const ch = Math.max(0, boxH - bt - bb - spacing.top - spacing.bottom);

      builder.pushClip(cx, cy, cw, ch);
      let cursorY = cy;
      for (const child of vnode.children) {
        if (cursorY >= cy + ch) break;
        const childH = 1; // Default height for child items
        renderVNodeSimple(builder, child, cx, cursorY, cw, childH, focused, tick, theme, style);
        cursorY += childH;
      }
      builder.popClip();
      break;
    }
    default:
      // Other kinds: spacer, input, focusZone, focusTrap, virtualList - skip or minimal render
      break;
  }
}
