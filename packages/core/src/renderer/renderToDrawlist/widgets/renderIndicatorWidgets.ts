import { resolveIconGlyph as resolveIconRenderGlyph } from "../../../icons/index.js";
import type { DrawlistBuilderV1 } from "../../../drawlist/types.js";
import { measureTextCells } from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { Theme } from "../../../theme/theme.js";
import { resolveColor } from "../../../theme/theme.js";
import type { WidgetTone } from "../../../ui/designTokens.js";
import { calloutRecipe, progressRecipe } from "../../../ui/recipes.js";
import { asTextStyle } from "../../styles.js";
import { renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { getColorTokens, readWidgetTone } from "../themeTokens.js";
import {
  drawSegments,
  truncateToWidth,
  variantToThemeColor,
  type StyledSegment,
} from "./renderTextWidgets.js";

type MaybeFillOwnBackground = (
  builder: DrawlistBuilderV1,
  rect: Rect,
  ownStyle: unknown,
  style: ResolvedTextStyle,
) => void;

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

function calloutVariantToTone(variant: unknown): WidgetTone | "info" {
  switch (variant) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "error":
      return "danger";
    default:
      return "info";
  }
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

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
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

function resolveIconText(iconPath: string, useFallback: boolean): string {
  return resolveIconRenderGlyph(iconPath, useFallback).glyph;
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

export function renderIndicatorWidgets(
  builder: DrawlistBuilderV1,
  rect: Rect,
  theme: Theme,
  parentStyle: ResolvedTextStyle,
  node: RuntimeInstance,
  maybeFillOwnBackground: MaybeFillOwnBackground,
): boolean {
  const vnode = node.vnode;

  switch (vnode.kind) {
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
            builder.drawText(rect.x, rect.y, truncateToWidth(labelText, w), style);
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
        dsTone?: unknown;
      };
      const value = clamp01(readNumber(props.value) ?? 0);
      const label = readString(props.label) ?? "";
      const showPercent = props.showPercent === true;
      const ownStyle = asTextStyle(props.style, theme);
      const style = parentStyle;

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
      const colorTokens = getColorTokens(theme);
      const dsTone = readWidgetTone(props.dsTone);
      const recipeResult =
        colorTokens !== null
          ? progressRecipe(colorTokens, dsTone === undefined ? {} : { tone: dsTone })
          : null;
      const ownTrackStyle = asTextStyle(props.trackStyle, theme);

      const fillStyle =
        recipeResult !== null
          ? mergeTextStyle(mergeTextStyle(parentStyle, recipeResult.filled), ownStyle)
          : mergeTextStyle(
              mergeTextStyle(parentStyle, { fg: theme.colors.primary, bold: true }),
              ownStyle,
            );

      let trackStyle =
        recipeResult !== null
          ? mergeTextStyle(parentStyle, recipeResult.track)
          : mergeTextStyle(style, { fg: theme.colors.muted });
      if (ownTrackStyle) trackStyle = mergeTextStyle(trackStyle, ownTrackStyle);
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

      const colorTokens = getColorTokens(theme);
      const recipeResult =
        colorTokens !== null
          ? calloutRecipe(colorTokens, { tone: calloutVariantToTone(variant) })
          : null;

      const baseBorderStyle =
        recipeResult !== null
          ? mergeTextStyle(parentStyle, recipeResult.borderStyle)
          : mergeTextStyle(style, { fg: theme.colors.border });
      const borderBaseWithOverrides = ownStyle
        ? mergeTextStyle(baseBorderStyle, ownStyle)
        : baseBorderStyle;
      if (recipeResult?.bg.bg) {
        const bgBase = mergeTextStyle(parentStyle, recipeResult.bg);
        const bgStyle = ownStyle ? mergeTextStyle(bgBase, ownStyle) : bgBase;
        builder.fillRect(rect.x, rect.y, rect.w, rect.h, bgStyle);
      }
      if (rect.w >= 2 && rect.h >= 2) {
        const borderStyle =
          recipeResult?.bg.bg !== undefined
            ? mergeTextStyle(borderBaseWithOverrides, { bg: recipeResult.bg.bg })
            : borderBaseWithOverrides;
        renderBoxBorder(builder, rect, "single", undefined, "left", borderStyle);
      }

      const inset = rect.w >= 2 && rect.h >= 2 ? 1 : 0;
      const innerX = rect.x + inset;
      const innerY = rect.y + inset;
      const innerW = Math.max(0, rect.w - inset * 2);
      const innerH = Math.max(0, rect.h - inset * 2);
      if (innerW <= 0 || innerH <= 0) break;

      const accentBaseStyle =
        recipeResult !== null
          ? mergeTextStyle(
              parentStyle,
              recipeResult.bg.bg
                ? { ...recipeResult.borderStyle, bg: recipeResult.bg.bg, bold: true }
                : { ...recipeResult.borderStyle, bold: true },
            )
          : mergeTextStyle(style, { fg: calloutVariantToColor(theme, variant), bold: true });
      const accentStyle = ownStyle ? mergeTextStyle(accentBaseStyle, ownStyle) : accentBaseStyle;
      const titleStyle = accentStyle;
      const textBaseStyle =
        recipeResult !== null
          ? mergeTextStyle(
              parentStyle,
              recipeResult.bg.bg
                ? { ...recipeResult.text, bg: recipeResult.bg.bg }
                : recipeResult.text,
            )
          : style;
      const textStyle = ownStyle ? mergeTextStyle(textBaseStyle, ownStyle) : textBaseStyle;
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
            builder.drawText(contentX, y, truncateToWidth(line, contentW), textStyle);
            y += 1;
          }
        }
      }

      builder.popClip();
      break;
    }
    case "spacer":
      break;
    default:
      return false;
  }

  return true;
}
