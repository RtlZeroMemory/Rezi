import type { DrawlistBuilderV1 } from "../../../drawlist/types.js";
import type { LayoutTree } from "../../../layout/layout.js";
import { measureTextCells, truncateWithEllipsis } from "../../../layout/textMeasure.js";
import type { Rect } from "../../../layout/types.js";
import type { RuntimeInstance } from "../../../runtime/commit.js";
import type { FocusState } from "../../../runtime/focus.js";
import type { Theme } from "../../../theme/theme.js";
import {
  buttonRecipe,
  checkboxRecipe,
  inputRecipe,
  selectRecipe,
  sliderRecipe,
} from "../../../ui/recipes.js";
import {
  DEFAULT_SLIDER_TRACK_WIDTH,
  formatSliderValue,
  normalizeSliderState,
} from "../../../widgets/slider.js";
import type { TextStyle } from "../../../widgets/style.js";
import type { SelectOption } from "../../../widgets/types.js";
import { asTextStyle, getButtonLabelStyle } from "../../styles.js";
import { renderBoxBorder } from "../boxBorder.js";
import { isVisibleRect } from "../indices.js";
import { mergeTextStyle } from "../textStyle.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import {
  getColorTokens,
  readWidgetSize,
  readWidgetTone,
  readWidgetVariant,
  resolveWidgetFocusStyle,
} from "../themeTokens.js";
import type { CursorInfo } from "../types.js";
import {
  focusIndicatorEnabled,
  readFocusConfig,
  resolveFocusedContentStyle,
} from "./focusConfig.js";
import { type StyledSegment, drawSegments, truncateToWidth } from "./renderTextWidgets.js";

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

function resolveFocusFlags(
  focusState: FocusState,
  id: string | null,
  focusConfigRaw: unknown,
): Readonly<{
  focused: boolean;
  focusVisible: boolean;
  focusConfig: ReturnType<typeof readFocusConfig>;
}> {
  const focusConfig = readFocusConfig(focusConfigRaw);
  const focused = id !== null && focusState.focusedId === id;
  const focusVisible = focused && focusIndicatorEnabled(focusConfig);
  return { focused, focusVisible, focusConfig };
}

export function renderFormWidgets(
  builder: DrawlistBuilderV1,
  focusState: FocusState,
  pressedId: string | null,
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
  maybeFillOwnBackground: MaybeFillOwnBackground,
): ResolvedCursor | null | undefined {
  const vnode = node.vnode;
  let resolvedCursor: ResolvedCursor | null = null;

  switch (vnode.kind) {
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
      const id = typeof props.id === "string" ? props.id : null;
      const label = typeof props.label === "string" ? props.label : "";
      const disabled = props.disabled === true;
      const {
        focused,
        focusVisible: effectiveFocused,
        focusConfig,
      } = resolveFocusFlags(focusState, id, props.focusConfig);
      const pressed = !disabled && id !== null && pressedId === id;

      // Design system recipe path
      const colorTokens = getColorTokens(theme);
      const dsVariant = readWidgetVariant(props.dsVariant) ?? "soft";

      if (colorTokens !== null) {
        // Use design system recipe
        const dsTone = readWidgetTone(props.dsTone) ?? "default";
        const dsSize = readWidgetSize(props.dsSize) ?? "md";
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
          spacing: theme.spacing,
        });
        const hasBorder = recipeResult.border !== "none" && rect.w >= 2 && rect.h >= 2;
        const insetContent = hasBorder && rect.w >= 3 && rect.h >= 3;
        const contentX = insetContent ? rect.x + 1 : rect.x;
        const contentW = insetContent ? Math.max(0, rect.w - 2) : rect.w;
        const contentY = insetContent ? rect.y + Math.floor((rect.h - 1) / 2) : rect.y;
        const requestedPx =
          typeof props.px === "number" && Number.isFinite(props.px) && props.px >= 0
            ? Math.trunc(props.px)
            : undefined;
        const recipePx = requestedPx ?? recipeResult.px;
        const labelW = measureTextCells(label);
        const maxPxForAtLeastOneCell =
          contentW <= 0 ? 0 : Math.max(0, Math.floor((contentW - 1) / 2));
        let px = Math.min(recipePx, maxPxForAtLeastOneCell);
        // If the label would fit without padding but is truncated by recipe padding, reduce px so it fits.
        if (labelW > 0 && labelW <= contentW) {
          const maxPxToFitFullLabel = Math.max(0, Math.floor((contentW - labelW) / 2));
          px = Math.min(px, maxPxToFitFullLabel);
        }
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
          let labelStyle = mergeTextStyle(
            parentStyle,
            recipeResult.bg.bg
              ? { ...recipeResult.label, bg: recipeResult.bg.bg }
              : recipeResult.label,
          );
          // Allow label overrides (merged on top of the recipe result).
          const ownStyle = asTextStyle(props.style, theme);
          if (ownStyle) labelStyle = mergeTextStyle(labelStyle, ownStyle);
          const pressedStyle = asTextStyle(props.pressedStyle, theme);
          if (pressedStyle && pressed) labelStyle = mergeTextStyle(labelStyle, pressedStyle);
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
        dsSize?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const value = typeof props.value === "string" ? props.value : "";
      const placeholder = typeof props.placeholder === "string" ? props.placeholder : "";
      const disabled = props.disabled === true;
      const multiline = props.multiline === true;
      const wordWrap = props.wordWrap !== false;
      const { focused, focusVisible, focusConfig } = resolveFocusFlags(
        focusState,
        id,
        props.focusConfig,
      );
      const showPlaceholder = value.length === 0 && placeholder.length > 0;
      const colorTokens = getColorTokens(theme);
      const dsSize = readWidgetSize(props.dsSize) ?? "md";
      let textX = rect.x + 1;
      let textY = rect.y;
      let contentW = Math.max(1, rect.w - 2);
      let contentH = Math.max(1, rect.h);
      let style: ResolvedTextStyle;
      let placeholderStyle: ResolvedTextStyle;

      if (colorTokens !== null) {
        const state = disabled
          ? ("disabled" as const)
          : focusVisible
            ? ("focus" as const)
            : ("default" as const);
        const recipeResult = inputRecipe(colorTokens, {
          state,
          size: dsSize,
          spacing: theme.spacing,
        });
        // Only draw a border when there's at least a 1x1 interior (avoid overwriting border with content).
        const hasBorder = recipeResult.border !== "none" && rect.w >= 3 && rect.h >= 3;
        const borderInset = hasBorder ? 1 : 0;
        const innerW = Math.max(0, rect.w - borderInset * 2);
        const maxPxForAtLeastOneCell = innerW <= 0 ? 0 : Math.max(0, Math.floor((innerW - 1) / 2));
        let px = Math.min(recipeResult.px, maxPxForAtLeastOneCell);
        // For single-line inputs, try to keep the full value/placeholder visible by reducing px when possible.
        if (!multiline) {
          const displayText = showPlaceholder ? placeholder : value;
          const displayW = measureTextCells(displayText);
          if (displayW > 0 && displayW <= innerW) {
            const maxPxToFitFullText = Math.max(0, Math.floor((innerW - displayW) / 2));
            px = Math.min(px, maxPxToFitFullText);
          }
        }
        const startXInset = borderInset + px;
        const endXInset = borderInset + px;

        textX = rect.x + startXInset;
        textY = rect.y + borderInset;
        contentW = Math.max(0, rect.w - startXInset - endXInset);
        contentH = Math.max(0, rect.h - borderInset * 2);

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

        const recipeTextStyle = recipeResult.bg.bg
          ? { ...recipeResult.text, bg: recipeResult.bg.bg }
          : recipeResult.text;
        const recipePlaceholderStyle = recipeResult.bg.bg
          ? { ...recipeResult.placeholder, bg: recipeResult.bg.bg, dim: true }
          : { ...recipeResult.placeholder, dim: true };

        const ownStyle = asTextStyle(props.style, theme);
        const baseStyle = mergeTextStyle(parentStyle, recipeTextStyle);
        const basePlaceholderStyle = mergeTextStyle(parentStyle, recipePlaceholderStyle);
        style = ownStyle ? mergeTextStyle(baseStyle, ownStyle) : baseStyle;
        placeholderStyle = ownStyle
          ? mergeTextStyle(basePlaceholderStyle, ownStyle)
          : basePlaceholderStyle;
      } else {
        const ownStyle = asTextStyle(props.style, theme);
        const baseInputStyle = mergeTextStyle(
          mergeTextStyle(parentStyle, ownStyle),
          getButtonLabelStyle({ focused: focusVisible, disabled }),
        );
        style = focusVisible
          ? resolveFocusedContentStyle(baseInputStyle, theme, focusConfig)
          : baseInputStyle;
        placeholderStyle = mergeTextStyle(style, { fg: theme.colors.muted, dim: true });
      }

      if (contentW <= 0 || contentH <= 0) break;

      if (multiline) {
        const graphemeOffset = cursorInfo?.cursorByInstanceId.get(node.instanceId) ?? value.length;
        const wrapped = resolveMultilineCursorPosition(value, graphemeOffset, contentW, wordWrap);
        const maxStartVisual = Math.max(0, wrapped.visualLines.length - contentH);
        const startVisual =
          focused && !disabled
            ? Math.max(0, Math.min(maxStartVisual, wrapped.visualLine - contentH + 1))
            : 0;

        builder.pushClip(textX, textY, contentW, contentH);
        for (let row = 0; row < contentH; row++) {
          const rawLine = showPlaceholder
            ? row === 0
              ? placeholder
              : ""
            : (wrapped.visualLines[startVisual + row] ?? "");
          const line = wordWrap ? rawLine : truncateToWidth(rawLine, contentW);
          if (line.length === 0) continue;
          builder.drawText(textX, textY + row, line, showPlaceholder ? placeholderStyle : style);
        }
        builder.popClip();

        if (focused && !disabled && cursorInfo && contentW > 0) {
          const localY = wrapped.visualLine - startVisual;
          if (localY >= 0 && localY < contentH) {
            const maxCursorX = Math.max(0, contentW - 1);
            resolvedCursor = {
              x: textX + clampInt(wrapped.visualX, 0, maxCursorX),
              y: textY + localY,
              shape: cursorInfo.shape,
              blink: cursorInfo.blink,
            };
          }
        }
      } else {
        const text = showPlaceholder ? placeholder : value;
        builder.pushClip(textX, textY, contentW, contentH);
        builder.drawText(textX, textY, text, showPlaceholder ? placeholderStyle : style);
        builder.popClip();

        // Cursor protocol: resolve cursor position for focused enabled input
        if (focused && !disabled && cursorInfo && contentW > 0) {
          // Cursor offset is stored as grapheme index; convert to cell position
          const graphemeOffset = cursorInfo.cursorByInstanceId.get(node.instanceId);
          const cursorX =
            graphemeOffset !== undefined
              ? measureTextCells(value.slice(0, graphemeOffset))
              : measureTextCells(value);
          const maxCursorX = Math.max(0, contentW - 1);
          resolvedCursor = {
            x: textX + clampInt(cursorX, 0, maxCursorX),
            y: textY,
            shape: cursorInfo.shape,
            blink: cursorInfo.blink,
          };
        }
      }
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
        focusConfig?: unknown;
        style?: unknown;
      };
      const id = readString(props.id);
      const { focused, focusVisible, focusConfig } = resolveFocusFlags(
        focusState,
        id ?? null,
        props.focusConfig,
      );
      const disabled = props.disabled === true;
      const readOnly = props.readOnly === true;
      const label = readString(props.label) ?? "";
      const showValue = props.showValue !== false;
      const value = readNumber(props.value) ?? Number.NaN;
      const colorTokens = getColorTokens(theme);
      const min = readNumber(props.min);
      const max = readNumber(props.max);
      const step = readNumber(props.step);
      const normalized = normalizeSliderState({ value, min, max, step });
      const recipeResult =
        colorTokens !== null
          ? sliderRecipe(colorTokens, {
              state: disabled
                ? "disabled"
                : readOnly
                  ? "readonly"
                  : focusVisible
                    ? "focus"
                    : "default",
            })
          : null;

      const ownStyle = asTextStyle(props.style, theme);
      const style = mergeTextStyle(parentStyle, ownStyle);
      maybeFillOwnBackground(builder, rect, ownStyle, style);

      const focusStyle = resolveWidgetFocusStyle(colorTokens, focusVisible, disabled);
      let stateStyle: TextStyle;
      if (disabled) {
        stateStyle = { fg: theme.colors.muted };
      } else if (readOnly) {
        stateStyle = focusStyle ? { ...focusStyle, dim: true } : { dim: true };
      } else {
        stateStyle = focusStyle ?? {};
      }
      const baseTextStyle = mergeTextStyle(style, stateStyle);
      const textStyle = focusVisible
        ? resolveFocusedContentStyle(baseTextStyle, theme, focusConfig)
        : baseTextStyle;

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
      const filledText = repeatCached("█", fillCells);
      const emptyText = repeatCached("░", emptyCells);
      const filledStyle =
        recipeResult !== null
          ? mergeTextStyle(textStyle, recipeResult.filled)
          : mergeTextStyle(
              textStyle,
              disabled
                ? { fg: theme.colors.muted }
                : readOnly
                  ? { fg: theme.colors.info, dim: true }
                  : { fg: theme.colors.primary, bold: true },
            );
      const thumbStyle =
        recipeResult !== null
          ? mergeTextStyle(textStyle, recipeResult.thumb)
          : mergeTextStyle(
              textStyle,
              disabled
                ? { fg: theme.colors.muted }
                : readOnly
                  ? { fg: theme.colors.info, dim: true }
                  : { fg: theme.colors.primary, bold: true },
            );
      const emptyStyle =
        recipeResult !== null
          ? mergeTextStyle(textStyle, recipeResult.track)
          : mergeTextStyle(
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
      if (filledText.length > 0) segments.push({ text: filledText, style: filledStyle });
      segments.push({ text: "●", style: thumbStyle });
      if (emptyText.length > 0) segments.push({ text: emptyText, style: emptyStyle });
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
        dsVariant?: unknown;
        dsTone?: unknown;
        dsSize?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const { focusVisible, focusConfig } = resolveFocusFlags(focusState, id, props.focusConfig);
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

      const colorTokens = getColorTokens(theme);
      const dsSize = readWidgetSize(props.dsSize) ?? "md";
      if (colorTokens !== null) {
        const state = disabled
          ? ("disabled" as const)
          : focusVisible
            ? ("focus" as const)
            : ("default" as const);
        const recipeResult = selectRecipe(colorTokens, {
          state,
          size: dsSize,
          spacing: theme.spacing,
        });
        const hasBorder = recipeResult.border !== "none" && rect.w >= 3 && rect.h >= 3;
        const borderInset = hasBorder ? 1 : 0;
        const innerW = Math.max(0, rect.w - borderInset * 2);
        const innerH = Math.max(0, rect.h - borderInset * 2);
        const indicator = "▼";
        const indicatorWidth = measureTextCells(indicator);
        // Ensure at least the indicator fits; reduce px when possible to fit full label.
        const minContentW = Math.max(0, indicatorWidth);
        const maxPxForMinContent =
          innerW <= minContentW ? 0 : Math.max(0, Math.floor((innerW - minContentW) / 2));
        let px = Math.min(recipeResult.px, maxPxForMinContent);
        const labelW = measureTextCells(label);
        const requiredWToFitLabel = labelW + indicatorWidth + (labelW > 0 ? 1 : 0);
        if (labelW > 0 && requiredWToFitLabel <= innerW) {
          const maxPxToFitFullLabel = Math.max(0, Math.floor((innerW - requiredWToFitLabel) / 2));
          px = Math.min(px, maxPxToFitFullLabel);
        }

        const contentX = rect.x + borderInset + px;
        const contentW = Math.max(0, innerW - px * 2);
        const contentY =
          rect.y + borderInset + Math.max(0, Math.floor((Math.max(1, innerH) - 1) / 2));

        if (recipeResult.triggerBg.bg) {
          const bgStyle = mergeTextStyle(parentStyle, recipeResult.triggerBg);
          builder.fillRect(rect.x, rect.y, rect.w, rect.h, bgStyle);
        }
        if (hasBorder) {
          let borderStyle = mergeTextStyle(parentStyle, recipeResult.borderStyle);
          if (recipeResult.triggerBg.bg) {
            borderStyle = mergeTextStyle(borderStyle, { bg: recipeResult.triggerBg.bg });
          }
          renderBoxBorder(builder, rect, recipeResult.border, undefined, "left", borderStyle);
        }

        const triggerStyle = mergeTextStyle(
          parentStyle,
          recipeResult.triggerBg.bg
            ? { ...recipeResult.trigger, bg: recipeResult.triggerBg.bg }
            : recipeResult.trigger,
        );
        const availableLabelW =
          contentW <= 0
            ? 0
            : Math.max(0, contentW - indicatorWidth - (contentW > indicatorWidth ? 1 : 0));
        const displayLabel =
          availableLabelW <= 0
            ? ""
            : measureTextCells(label) > availableLabelW
              ? truncateWithEllipsis(label, availableLabelW)
              : label;
        const text =
          displayLabel.length > 0
            ? `${displayLabel}${availableLabelW > 0 ? " " : ""}${indicator}`
            : indicator;

        if (innerW > 0 && innerH > 0) {
          builder.pushClip(rect.x + borderInset, rect.y + borderInset, innerW, innerH);
          builder.drawText(contentX, contentY, text, triggerStyle);
          builder.popClip();
        }
      } else {
        const baseStyle = mergeTextStyle(
          parentStyle,
          disabled
            ? { fg: theme.colors.muted }
            : resolveWidgetFocusStyle(colorTokens, focusVisible, false),
        );
        const style = focusVisible
          ? resolveFocusedContentStyle(baseStyle, theme, focusConfig)
          : baseStyle;

        builder.pushClip(rect.x, rect.y, rect.w, rect.h);
        const text = ` ${label} ▼`;
        builder.drawText(rect.x, rect.y, text, style);
        builder.popClip();
      }
      break;
    }
    case "checkbox": {
      if (!isVisibleRect(rect)) break;
      const props = vnode.props as {
        id?: unknown;
        checked?: unknown;
        label?: unknown;
        disabled?: unknown;
        focusConfig?: unknown;
        dsTone?: unknown;
        dsSize?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const { focusVisible, focusConfig } = resolveFocusFlags(focusState, id, props.focusConfig);
      const disabled = props.disabled === true;
      const checked = props.checked === true;
      const label = typeof props.label === "string" ? props.label : "";
      const indicator = checked ? "[x]" : "[ ]";
      const colorTokens = getColorTokens(theme);
      const dsTone = readWidgetTone(props.dsTone);
      const dsSize = readWidgetSize(props.dsSize) ?? "md";
      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      if (colorTokens !== null) {
        const state = disabled
          ? ("disabled" as const)
          : focusVisible
            ? ("focus" as const)
            : checked
              ? ("selected" as const)
              : ("default" as const);
        const recipeResult = checkboxRecipe(
          colorTokens,
          dsTone === undefined
            ? { state, checked, size: dsSize }
            : { state, checked, tone: dsTone, size: dsSize },
        );
        const indicatorBaseStyle = mergeTextStyle(parentStyle, recipeResult.indicator);
        const labelBaseStyle = mergeTextStyle(parentStyle, recipeResult.label);
        const indicatorStyle = focusVisible
          ? resolveFocusedContentStyle(indicatorBaseStyle, theme, focusConfig)
          : indicatorBaseStyle;
        const labelStyle = focusVisible
          ? resolveFocusedContentStyle(labelBaseStyle, theme, focusConfig)
          : labelBaseStyle;
        builder.drawText(rect.x, rect.y, indicator, indicatorStyle);
        if (label.length > 0) {
          builder.drawText(rect.x + measureTextCells(indicator) + 1, rect.y, label, labelStyle);
        }
      } else {
        const text = label.length > 0 ? `${indicator} ${label}` : indicator;
        const baseStyle = mergeTextStyle(
          parentStyle,
          disabled
            ? { fg: theme.colors.muted }
            : resolveWidgetFocusStyle(colorTokens, focusVisible, false),
        );
        const style = focusVisible
          ? resolveFocusedContentStyle(baseStyle, theme, focusConfig)
          : baseStyle;
        builder.drawText(rect.x, rect.y, text, style);
      }
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
        focusConfig?: unknown;
        dsTone?: unknown;
        dsSize?: unknown;
      };
      const id = typeof props.id === "string" ? props.id : null;
      const { focusVisible, focusConfig } = resolveFocusFlags(focusState, id, props.focusConfig);
      const disabled = props.disabled === true;
      const value = typeof props.value === "string" ? props.value : "";
      const direction = props.direction === "horizontal" ? "horizontal" : "vertical";
      const options = Array.isArray(props.options) ? props.options : [];
      const colorTokens = getColorTokens(theme);
      const dsTone = readWidgetTone(props.dsTone);
      const dsSize = readWidgetSize(props.dsSize) ?? "md";

      builder.pushClip(rect.x, rect.y, rect.w, rect.h);
      let cx = rect.x;
      let cy = rect.y;
      for (const opt of options) {
        if (typeof opt !== "object" || opt === null) continue;
        const optionValue = (opt as { value?: unknown }).value;
        const optionLabel = (opt as { label?: unknown }).label;
        if (typeof optionValue !== "string" || typeof optionLabel !== "string") continue;

        const selected = optionValue === value;
        const mark = selected ? "(o)" : "( )";
        if (colorTokens !== null) {
          const state = disabled
            ? ("disabled" as const)
            : focusVisible && selected
              ? ("focus" as const)
              : selected
                ? ("selected" as const)
                : ("default" as const);
          const recipeResult = checkboxRecipe(
            colorTokens,
            dsTone === undefined
              ? { state, checked: selected, size: dsSize }
              : { state, checked: selected, tone: dsTone, size: dsSize },
          );
          const indicatorBaseStyle = mergeTextStyle(parentStyle, recipeResult.indicator);
          const labelBaseStyle = mergeTextStyle(parentStyle, recipeResult.label);
          const indicatorStyle = focusVisible
            ? resolveFocusedContentStyle(indicatorBaseStyle, theme, focusConfig)
            : indicatorBaseStyle;
          const labelStyle = focusVisible
            ? resolveFocusedContentStyle(labelBaseStyle, theme, focusConfig)
            : labelBaseStyle;
          builder.drawText(cx, cy, mark, indicatorStyle);
          if (optionLabel.length > 0) {
            builder.drawText(cx + measureTextCells(mark) + 1, cy, optionLabel, labelStyle);
          }
        } else {
          const focusStyle = focusVisible ? { underline: true, bold: true } : undefined;
          const baseStyle = mergeTextStyle(
            parentStyle,
            disabled ? { fg: theme.colors.muted, ...focusStyle } : focusStyle,
          );
          const style = focusVisible
            ? resolveFocusedContentStyle(baseStyle, theme, focusConfig)
            : baseStyle;
          const chunk = `${mark} ${optionLabel}`;
          builder.drawText(cx, cy, chunk, style);
        }

        const chunk = `${mark} ${optionLabel}`;
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
    default:
      return undefined;
  }

  return resolvedCursor;
}
