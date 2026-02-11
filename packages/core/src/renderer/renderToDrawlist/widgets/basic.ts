import { type SpinnerVariant, getIconChar, getSpinnerFrame } from "../../../icons/index.js";
import type { DrawlistBuilderV1 } from "../../../index.js";
import type { LayoutTree } from "../../../layout/layout.js";
import {
  measureTextCells,
  truncateMiddle,
  truncateWithEllipsis,
} from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { Theme } from "../../../theme/theme.js";
import { resolveColor } from "../../../theme/theme.js";
import type { SelectOption } from "../../../widgets/types.js";
import { asTextStyle, getButtonLabelStyle } from "../../styles.js";
import { renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle, shouldFillForStyleOverride } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import type { CursorInfo } from "../types.js";

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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
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

function resolveIconGlyph(iconPath: string, useFallback: boolean): string {
  if (iconPath.length === 0) return "";
  const preferred = getIconChar(iconPath, useFallback);
  if (preferred.length > 0) return preferred;
  const fallback = getIconChar(iconPath, true);
  if (fallback.length > 0) return fallback;
  return iconPath;
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
  return text.slice(0, 1);
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
      return resolveIconGlyph(iconPath, false);
    }
    default:
      return undefined;
  }
}

export function renderBasicWidget(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  rect: Rect,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  layoutNode: LayoutTree,
  nodeStack: (RuntimeInstance | null)[],
  styleStack: ResolvedTextStyle[],
  layoutStack: LayoutTree[],
  clipStack: (Readonly<Rect> | undefined)[],
  currentClip: Readonly<Rect> | undefined,
  cursorInfo: CursorInfo | undefined,
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
      };
      const variantStyle = textVariantToStyle(props.variant);
      const ownStyle = asTextStyle(props.style);
      const style =
        variantStyle === undefined && ownStyle === undefined
          ? parentStyle
          : mergeTextStyle(mergeTextStyle(parentStyle, variantStyle), ownStyle);
      const textOverflow = readTextOverflow(props.textOverflow);
      const maxWidth = readNonNegativeInt(props.maxWidth);
      const overflowW = maxWidth === undefined ? rect.w : Math.min(rect.w, maxWidth);
      if (overflowW <= 0) break;

      let displayText = vnode.text;
      let useClip = false;

      const textWidth = measureTextCells(displayText);
      const overflow = textWidth > overflowW;
      if (overflow) {
        switch (textOverflow) {
          case "ellipsis":
            displayText = truncateWithEllipsis(displayText, overflowW);
            break;
          case "middle":
            displayText = truncateMiddle(displayText, overflowW);
            break;
          case "clip":
            useClip = true;
            break;
        }
      }

      if (variantStyle === undefined && ownStyle === undefined && !useClip && !overflow) {
        builder.drawText(rect.x, rect.y, vnode.text, parentStyle);
        break;
      }

      if (useClip) {
        builder.pushClip(rect.x, rect.y, overflowW, rect.h);
        builder.drawText(rect.x, rect.y, displayText, style);
        builder.popClip();
      } else {
        builder.drawText(rect.x, rect.y, displayText, style);
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
      const glyph = rawChar
        ? (rawChar[0] ?? (direction === "horizontal" ? "─" : "│"))
        : direction === "horizontal"
          ? "─"
          : "│";
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
      };
      const id = typeof props.id === "string" ? props.id : null;
      const label = typeof props.label === "string" ? props.label : "";
      const disabled = props.disabled === true;
      const focused = id !== null && focusState.focusedId === id;
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
      const ownStyle = asTextStyle(props.style);
      if (displayLabel.length > 0) {
        builder.drawText(
          rect.x + px,
          rect.y,
          displayLabel,
          mergeTextStyle(
            mergeTextStyle(parentStyle, ownStyle),
            getButtonLabelStyle({ focused, disabled }),
          ),
        );
      }
      break;
    }
    case "input": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        value?: unknown;
        disabled?: unknown;
        style?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const value = typeof props.value === "string" ? props.value : "";
      const disabled = props.disabled === true;
      const focused = id !== null && focusState.focusedId === id;
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(
        mergeTextStyle(parentStyle, ownStyle),
        getButtonLabelStyle({ focused, disabled }),
      );
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(rect.x + 1, rect.y, value, style);
      builder.popClip();

      // v2 cursor: resolve cursor position for focused enabled input
      if (focused && !disabled && cursorInfo) {
        // Cursor offset is stored as grapheme index; convert to cell position
        const graphemeOffset = cursorInfo.cursorByInstanceId.get(node.instanceId);
        const cursorX =
          graphemeOffset !== undefined
            ? measureTextCells(value.slice(0, graphemeOffset))
            : measureTextCells(value);
        resolvedCursor = {
          x: rect.x + 1 + cursorX,
          y: rect.y,
          shape: cursorInfo.shape,
          blink: cursorInfo.blink,
        };
      }
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
      };
      const id = typeof props.id === "string" ? props.id : null;
      const focused = id !== null && focusState.focusedId === id;
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

      const focusStyle = focused ? { underline: true, bold: true } : undefined;
      const style = mergeTextStyle(
        parentStyle,
        disabled ? { fg: theme.colors.muted, ...focusStyle } : focusStyle,
      );

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
          style: mergeTextStyle(parentStyle, asTextStyle(span.style)),
        });
      }
      if (segments.length === 0) break;

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      drawSegments(builder, rect.x, rect.y, rect.w, segments);
      builder.popClip();
      break;
    }
    case "badge": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as { text?: unknown; variant?: unknown; style?: unknown };
      const text = readString(props.text) ?? "";
      const ownStyle = asTextStyle(props.style);
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
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const frame = getSpinnerFrame(variant, 0);
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
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const glyph = resolveIconGlyph(iconPath, props.fallback === true);
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
      const ownStyle = asTextStyle(props.style);
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
      const ownStyle = asTextStyle(props.style);
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
      const ownStyle = asTextStyle(props.style);
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

      const ownStyle = asTextStyle(props.style);
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
      const ownStyle = asTextStyle(props.style);
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
        asTextStyle(props.trackStyle),
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
      const ownStyle = asTextStyle(props.style);
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

      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const lines: StyledSegment[] = [];
      if (iconPath && iconPath.length > 0) {
        const icon = resolveIconGlyph(iconPath, false);
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

      const ownStyle = asTextStyle(props.style);
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
      const ownStyle = asTextStyle(props.style);
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
          ? resolveIconGlyph(iconOverride, false)
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
    case "sparkline": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        data?: unknown;
        width?: unknown;
        min?: unknown;
        max?: unknown;
        style?: unknown;
      };
      const rawData = Array.isArray(props.data) ? props.data : [];
      const data: number[] = [];
      for (const value of rawData) {
        const n = readNumber(value);
        if (n !== undefined) data.push(n);
      }
      if (data.length === 0) break;

      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const width = Math.max(1, Math.min(rect.w, readPositiveInt(props.width) ?? data.length));
      const autoMin = Math.min(...data);
      const autoMax = Math.max(...data);
      const min = readNumber(props.min) ?? autoMin;
      const max = readNumber(props.max) ?? autoMax;
      const line = sparklineForData(data, width, min, max);

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      builder.drawText(
        rect.x,
        rect.y,
        truncateToWidth(line, rect.w),
        mergeTextStyle(style, { fg: theme.colors.info }),
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
      const ownStyle = asTextStyle(props.style);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const values = data.map((item) => Math.max(0, readNumber(item.value) ?? 0));
      const maxValue = Math.max(1, ...values);

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
      const ownStyle = asTextStyle(props.style);
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
