import { resolveIconGlyph } from "../../icons/index.js";
import { type WidgetSize, resolveSize } from "../../ui/designTokens.js";
import {
  DEFAULT_SLIDER_TRACK_WIDTH,
  formatSliderValue,
  normalizeSliderState,
} from "../../widgets/slider.js";
import type { VNode } from "../../widgets/types.js";
import { layoutLeaf } from "../engine/layoutTree.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import { measureTextCells, measureTextWrapped } from "../textMeasure.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";
import {
  validateButtonProps,
  validateCheckboxProps,
  validateInputProps,
  validateRadioGroupProps,
  validateSelectProps,
  validateSliderProps,
  validateSpacerProps,
  validateTextProps,
} from "../validateProps.js";

function isWidgetSize(value: unknown): value is WidgetSize {
  return value === "sm" || value === "md" || value === "lg";
}

function isButtonVariant(value: unknown): value is "solid" | "soft" | "outline" | "ghost" {
  return value === "solid" || value === "soft" || value === "outline" || value === "ghost";
}

function resolveButtonPx(vnode: VNode): number {
  const props = vnode.props as { px?: unknown; dsVariant?: unknown; dsSize?: unknown };
  if (isButtonVariant(props.dsVariant)) {
    const size: WidgetSize = isWidgetSize(props.dsSize) ? props.dsSize : "md";
    return resolveSize(size).px;
  }
  const rawPx = props.px;
  return typeof rawPx === "number" && Number.isFinite(rawPx) && rawPx >= 0 ? Math.trunc(rawPx) : 1;
}

export function measureLeaf(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "text": {
      const propsRes = validateTextProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const intrinsicW = measureTextCells(vnode.text);
      const cappedW =
        propsRes.value.maxWidth === undefined
          ? intrinsicW
          : Math.min(intrinsicW, propsRes.value.maxWidth);
      const maxLineW = Math.min(maxW, cappedW);
      if (propsRes.value.wrap) {
        const wrapped = measureTextWrapped(vnode.text, maxLineW);
        return ok({ w: Math.min(maxLineW, wrapped.width), h: Math.min(maxH, wrapped.height) });
      }
      const w = maxLineW;
      const h = Math.min(maxH, 1);
      return ok({ w, h });
    }
    case "button": {
      const propsRes = validateButtonProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const px = resolveButtonPx(vnode);
      const labelW = measureTextCells(propsRes.value.label);
      const w = Math.min(maxW, labelW + px * 2);
      const h = Math.min(maxH, 1);
      return ok({ w, h });
    }
    case "input": {
      const propsRes = validateInputProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      if (propsRes.value.multiline) {
        return ok({ w: maxW, h: Math.min(maxH, propsRes.value.rows) });
      }
      const placeholderRaw = (vnode.props as { placeholder?: unknown }).placeholder;
      const placeholder = typeof placeholderRaw === "string" ? placeholderRaw : "";
      const content = propsRes.value.value.length > 0 ? propsRes.value.value : placeholder;
      const textW = measureTextCells(content);
      const w = Math.min(maxW, textW + 2);
      const h = Math.min(maxH, 1);
      return ok({ w, h });
    }
    case "focusAnnouncer": {
      return ok({ w: maxW, h: Math.min(maxH, 1) });
    }
    case "slider": {
      const propsRes = validateSliderProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const props = propsRes.value;
      const normalized = normalizeSliderState({
        value: props.value,
        min: props.min,
        max: props.max,
        step: props.step,
      });
      const labelText =
        props.label !== undefined && props.label.length > 0 ? `${props.label} ` : "";
      const showValue = props.showValue;
      const valueText = showValue ? ` ${formatSliderValue(normalized.value, normalized.step)}` : "";
      const explicitTrack = props.width !== undefined && props.width > 0 ? props.width : undefined;
      const trackWidth = explicitTrack ?? DEFAULT_SLIDER_TRACK_WIDTH;
      const intrinsicW = measureTextCells(labelText) + 2 + trackWidth + measureTextCells(valueText);
      return ok({ w: Math.min(maxW, intrinsicW), h: Math.min(maxH, 1) });
    }
    case "spacer": {
      const propsRes = validateSpacerProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      if (axis === "row") {
        return ok({ w: Math.min(maxW, propsRes.value.size), h: Math.min(maxH, 1) });
      }
      return ok({ w: Math.min(maxW, 0), h: Math.min(maxH, propsRes.value.size) });
    }
    case "divider": {
      const direction = (vnode.props as { direction?: unknown }).direction;
      const d = direction === undefined ? "horizontal" : direction;
      if (d === "vertical") return ok({ w: Math.min(maxW, 1), h: Math.min(maxH, maxH) });
      return ok({ w: Math.min(maxW, maxW), h: Math.min(maxH, 1) });
    }
    case "icon": {
      const props = vnode.props as { icon?: unknown; fallback?: unknown };
      const iconPath = typeof props.icon === "string" ? props.icon : "";
      const glyph = resolveIconGlyph(iconPath, props.fallback === true);
      return ok({ w: Math.min(maxW, glyph.width), h: Math.min(maxH, 1) });
    }
    case "spinner": {
      // Spinner: 1 char + optional label
      const label = (vnode.props as { label?: string }).label;
      const labelW = label ? measureTextCells(label) + 1 : 0;
      return ok({ w: Math.min(maxW, 1 + labelW), h: Math.min(maxH, 1) });
    }
    case "progress": {
      // Progress bar: [====    ] 75% or custom width
      const props = vnode.props as {
        width?: number;
        showPercent?: boolean;
        label?: string;
      };
      const labelW = props.label ? measureTextCells(props.label) + 1 : 0;
      const percentW = props.showPercent ? 5 : 0; // " 100%"
      const barW = props.width ?? Math.max(10, maxW - labelW - percentW);
      return ok({ w: Math.min(maxW, labelW + barW + percentW), h: Math.min(maxH, 1) });
    }
    case "skeleton": {
      // Skeleton: fixed width placeholder
      const props = vnode.props as { width: number; height?: number };
      const h = props.height ?? 1;
      return ok({ w: Math.min(maxW, props.width), h: Math.min(maxH, h) });
    }
    case "richText": {
      // RichText: sum of all span widths
      const props = vnode.props as { spans: readonly { text: string }[] };
      let totalW = 0;
      for (const span of props.spans) {
        totalW += measureTextCells(span.text);
      }
      return ok({ w: Math.min(maxW, totalW), h: Math.min(maxH, 1) });
    }
    case "kbd": {
      // Kbd: [Key]+[Key] format
      const props = vnode.props as { keys: string | readonly string[]; separator?: string };
      const keys = typeof props.keys === "string" ? props.keys.split("+") : props.keys;
      const sep = props.separator ?? "+";
      // Each key gets brackets: [Ctrl]+[S]
      let totalW = 0;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k !== undefined) {
          totalW += measureTextCells(k) + 2; // brackets
          if (i < keys.length - 1) totalW += measureTextCells(sep);
        }
      }
      return ok({ w: Math.min(maxW, totalW), h: Math.min(maxH, 1) });
    }
    case "badge": {
      // Badge: text with padding
      const props = vnode.props as { text: string };
      const textW = measureTextCells(props.text);
      return ok({ w: Math.min(maxW, textW + 2), h: Math.min(maxH, 1) });
    }
    case "status": {
      // Status: dot + optional label
      const props = vnode.props as { label?: string; showLabel?: boolean };
      const showLabel = props.showLabel ?? props.label !== undefined;
      const labelW = showLabel && props.label ? measureTextCells(props.label) + 1 : 0;
      return ok({ w: Math.min(maxW, 1 + labelW), h: Math.min(maxH, 1) });
    }
    case "tag": {
      // Tag: text with brackets/padding
      const props = vnode.props as { text: string; removable?: boolean };
      const textW = measureTextCells(props.text);
      const removeW = props.removable ? 2 : 0; // " x"
      return ok({ w: Math.min(maxW, textW + 2 + removeW), h: Math.min(maxH, 1) });
    }
    case "gauge": {
      // Gauge: label + bar + percentage
      const props = vnode.props as { label?: string; variant?: string };
      const labelW = props.label ? measureTextCells(props.label) + 1 : 0;
      const variant = props.variant ?? "linear";
      if (variant === "compact") {
        // Compact: "CPU 42% ████"
        return ok({ w: Math.min(maxW, labelW + 5 + 8), h: Math.min(maxH, 1) });
      }
      // Linear: "CPU [████░░░░] 42%"
      return ok({ w: Math.min(maxW, labelW + 12 + 5), h: Math.min(maxH, 1) });
    }
    case "empty": {
      // Empty: icon + title + description + action (multi-line)
      const props = vnode.props as {
        title: string;
        description?: string;
        icon?: string;
        action?: unknown;
      };
      const titleW = measureTextCells(props.title);
      const descW = props.description ? measureTextCells(props.description) : 0;
      const w = Math.max(titleW, descW, 20); // Min 20 cells wide
      let h = 1; // Title line
      if (props.icon) h += 2; // Icon + spacing
      if (props.description) h += 1;
      if (props.action) h += 2; // Spacing + action
      return ok({ w: Math.min(maxW, w), h: Math.min(maxH, h) });
    }
    case "errorDisplay": {
      // Error: title + message + optional stack + retry button
      const props = vnode.props as {
        title?: string;
        message: string;
        stack?: string;
        showStack?: boolean;
        onRetry?: () => void;
      };
      const titleW = measureTextCells(props.title ?? "Error");
      const msgW = measureTextCells(props.message);
      const w = Math.max(titleW, msgW, 30);
      let h = 2; // Title + message
      if (props.showStack && props.stack) {
        const stackLines = props.stack.split("\n").length;
        h += Math.min(stackLines, 5) + 1; // Cap at 5 lines + separator
      }
      if (props.onRetry) h += 2; // Spacing + retry button
      return ok({ w: Math.min(maxW, w), h: Math.min(maxH, h) });
    }
    case "callout": {
      // Callout: icon + title + message in a bordered box
      const props = vnode.props as { title?: string; message: string; icon?: string };
      const titleW = props.title ? measureTextCells(props.title) : 0;
      const msgW = measureTextCells(props.message);
      const iconWidth =
        typeof props.icon === "string" && props.icon.length > 0
          ? resolveIconGlyph(props.icon, false).width
          : 1;
      const iconPrefixW = iconWidth > 0 ? iconWidth + 1 : 0; // "ℹ " / "✓ "
      const titleLineW = titleW > 0 ? titleW + iconPrefixW : 0;
      const messageLineW = titleW > 0 ? msgW : msgW + iconPrefixW;
      const w = Math.max(titleLineW, messageLineW) + 4; // Border + left accent + inset/padding
      const h = props.title ? 4 : 3; // Border top/bottom + content
      return ok({ w: Math.min(maxW, w), h: Math.min(maxH, h) });
    }
    case "link": {
      const props = vnode.props as { url?: string; label?: string };
      const text = props.label && props.label.length > 0 ? props.label : (props.url ?? "");
      return ok({ w: Math.min(maxW, measureTextCells(text)), h: Math.min(maxH, 1) });
    }
    case "canvas":
    case "image":
    case "lineChart":
    case "scatter":
    case "heatmap": {
      const props = vnode.props as { width?: unknown; height?: unknown };
      const width =
        typeof props.width === "number" && Number.isFinite(props.width) ? props.width : 0;
      const height =
        typeof props.height === "number" && Number.isFinite(props.height) ? props.height : 0;
      return ok({
        w: Math.min(maxW, Math.max(0, Math.trunc(width))),
        h: Math.min(maxH, Math.max(0, Math.trunc(height))),
      });
    }
    case "sparkline": {
      // Sparkline: mini inline chart using block characters
      const props = vnode.props as { data: readonly number[]; width?: number };
      const w = props.width ?? props.data.length;
      return ok({ w: Math.min(maxW, w), h: Math.min(maxH, 1) });
    }
    case "barChart": {
      // Bar chart: horizontal or vertical bars with optional labels
      const props = vnode.props as {
        data: readonly { label: string; value: number }[];
        orientation?: "horizontal" | "vertical";
        showValues?: boolean;
        showLabels?: boolean;
        maxBarLength?: number;
      };
      const orientation = props.orientation ?? "horizontal";
      const showLabels = props.showLabels ?? true;
      const showValues = props.showValues ?? true;

      if (orientation === "horizontal") {
        // Horizontal: each item is a row, width = label + bar + value
        let maxLabelW = 0;
        for (const item of props.data) {
          const lw = measureTextCells(item.label);
          if (lw > maxLabelW) maxLabelW = lw;
        }
        const labelW = showLabels ? maxLabelW + 1 : 0;
        const barW = props.maxBarLength ?? 20;
        const valueW = showValues ? 6 : 0; // " 100%"
        return ok({
          w: Math.min(maxW, labelW + barW + valueW),
          h: Math.min(maxH, props.data.length),
        });
      }
      // Vertical: bars side by side, labels below
      const barW = 3; // Each bar is 3 cells wide
      const barH = props.maxBarLength ?? 8;
      const w = props.data.length === 0 ? 0 : props.data.length * barW + (props.data.length - 1); // bars + gaps
      const h = barH + (showLabels ? 1 : 0) + (showValues ? 1 : 0);
      return ok({ w: Math.min(maxW, w), h: Math.min(maxH, h) });
    }
    case "miniChart": {
      // Mini chart: compact multi-value display
      const props = vnode.props as {
        values: readonly { label: string; value: number; max?: number }[];
        variant?: "bars" | "pills";
      };
      // Each value: "label: ████ 42%" or "label: ●●●○○ 42%"
      let totalW = 0;
      for (let i = 0; i < props.values.length; i++) {
        const v = props.values[i];
        if (v !== undefined) {
          const labelW = measureTextCells(v.label);
          totalW += labelW + 2 + 5 + 4; // label: + bars/pills + value
          if (i < props.values.length - 1) totalW += 2; // separator
        }
      }
      return ok({ w: Math.min(maxW, totalW), h: Math.min(maxH, 1) });
    }
    case "select": {
      const propsRes = validateSelectProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const selected = propsRes.value.options.find(
        (option) => option.value === propsRes.value.value,
      );
      const displayText = selected?.label ?? propsRes.value.placeholder ?? "Select…";
      const textW = measureTextCells(displayText);
      return ok({ w: Math.min(maxW, textW + 4), h: Math.min(maxH, 1) });
    }
    case "checkbox": {
      const propsRes = validateCheckboxProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const labelW =
        propsRes.value.label === undefined ? 0 : measureTextCells(propsRes.value.label) + 1;
      return ok({ w: Math.min(maxW, 3 + labelW), h: Math.min(maxH, 1) });
    }
    case "radioGroup": {
      const propsRes = validateRadioGroupProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const direction = propsRes.value.direction;
      if (direction === "horizontal") {
        let totalW = 0;
        for (const opt of propsRes.value.options) {
          totalW += measureTextCells(opt.label) + 5; // "(x) label "
        }
        return ok({ w: Math.min(maxW, totalW), h: Math.min(maxH, 1) });
      }
      // Vertical: max width of options, height = num options
      let maxOptW = 0;
      for (const opt of propsRes.value.options) {
        const w = measureTextCells(opt.label) + 4; // "(x) label"
        if (w > maxOptW) maxOptW = w;
      }
      return ok({ w: Math.min(maxW, maxOptW), h: Math.min(maxH, propsRes.value.options.length) });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureLeaf: unexpected vnode kind" },
      };
  }
}

export function layoutLeafKind(
  vnode: VNode,
  x: number,
  y: number,
  rectW: number,
  rectH: number,
): LayoutResult<LayoutTree> {
  switch (vnode.kind) {
    case "text":
    case "button":
    case "input":
    case "focusAnnouncer":
    case "spacer":
    case "divider":
    case "icon":
    case "spinner":
    case "progress": {
      return layoutLeaf(vnode, x, y, rectW, rectH);
    }
    case "skeleton": {
      // Skeleton can be multi-line
      const props = vnode.props as { height?: number };
      const h = props.height ?? 1;
      return ok({ vnode, rect: { x, y, w: rectW, h }, children: Object.freeze([]) });
    }
    case "richText":
    case "kbd":
    case "badge":
    case "status":
    case "tag":
    case "gauge": {
      return layoutLeaf(vnode, x, y, rectW, rectH);
    }
    case "empty":
    case "errorDisplay":
    case "callout": {
      // These are multi-line compound widgets
      const props = vnode.props as { title?: string; description?: string; message?: string };
      // Calculate actual height based on content
      let h = 1;
      if (vnode.kind === "empty") {
        const p = vnode.props as { icon?: string; description?: string; action?: unknown };
        if (p.icon) h += 2;
        if (p.description) h += 1;
        if (p.action) h += 2;
      } else if (vnode.kind === "errorDisplay") {
        const p = vnode.props as { showStack?: boolean; stack?: string; onRetry?: () => void };
        h = 2;
        if (p.showStack && p.stack) h += Math.min(p.stack.split("\n").length, 5) + 1;
        if (p.onRetry) h += 2;
      } else {
        h = props.title ? 4 : 3;
      }
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, h) },
        children: Object.freeze([]),
      });
    }
    case "sparkline": {
      // Sparkline is a single-line chart
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, 1) },
        children: Object.freeze([]),
      });
    }
    case "link": {
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, 1) },
        children: Object.freeze([]),
      });
    }
    case "canvas":
    case "image":
    case "lineChart":
    case "scatter":
    case "heatmap": {
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: rectH },
        children: Object.freeze([]),
      });
    }
    case "barChart": {
      // Bar chart: calculate height based on orientation
      const props = vnode.props as {
        data: readonly { label: string; value: number }[];
        orientation?: "horizontal" | "vertical";
        showLabels?: boolean;
        showValues?: boolean;
        maxBarLength?: number;
      };
      const orientation = props.orientation ?? "horizontal";
      let h: number;
      if (orientation === "horizontal") {
        h = props.data.length;
      } else {
        const barH = props.maxBarLength ?? 8;
        const showLabels = props.showLabels ?? true;
        const showValues = props.showValues ?? true;
        h = barH + (showLabels ? 1 : 0) + (showValues ? 1 : 0);
      }
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, h) },
        children: Object.freeze([]),
      });
    }
    case "miniChart": {
      // Mini chart is a single-line display
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, 1) },
        children: Object.freeze([]),
      });
    }
    case "select": {
      const propsRes = validateSelectProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, 1) },
        children: Object.freeze([]),
      });
    }
    case "slider": {
      const propsRes = validateSliderProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, 1) },
        children: Object.freeze([]),
      });
    }
    case "checkbox": {
      const propsRes = validateCheckboxProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, 1) },
        children: Object.freeze([]),
      });
    }
    case "radioGroup": {
      const propsRes = validateRadioGroupProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const naturalH = propsRes.value.direction === "vertical" ? propsRes.value.options.length : 1;
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: Math.min(rectH, naturalH) },
        children: Object.freeze([]),
      });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutLeafKind: unexpected vnode kind" },
      };
  }
}
