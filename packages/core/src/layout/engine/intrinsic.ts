import { type WidgetSize, resolveSize } from "../../ui/designTokens.js";
import type { VNode } from "../../widgets/types.js";
import { resolveSpacing as resolveSpacingProps } from "../spacing.js";
import { measureTextCells } from "../textMeasure.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";
import {
  validateBoxProps,
  validateButtonProps,
  validateInputProps,
  validateSelectProps,
  validateStackProps,
  validateTextProps,
} from "../validateProps.js";
import { ok } from "./result.js";

type MeasureNodeFn = (vnode: VNode, maxW: number, maxH: number, axis: Axis) => LayoutResult<Size>;

type MeasureIntrinsicFn = (
  vnode: VNode,
  axis: Axis,
  measureNode: MeasureNodeFn,
) => LayoutResult<Size>;

const INTRINSIC_FALLBACK_LIMIT = 4096;
const I32_MAX = 2147483647;

function invalid(detail: string): LayoutResult<never> {
  return { ok: false, fatal: { code: "ZRUI_INVALID_PROPS", detail } };
}

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

function clampSize(size: Size): Size {
  const w = Number.isFinite(size.w) ? Math.max(0, Math.trunc(size.w)) : 0;
  const h = Number.isFinite(size.h) ? Math.max(0, Math.trunc(size.h)) : 0;
  return { w: Math.min(I32_MAX, w), h: Math.min(I32_MAX, h) };
}

function countRenderableChildren(children: readonly (VNode | undefined)[]): number {
  let count = 0;
  for (let i = 0; i < children.length; i++) {
    if (children[i]) count++;
  }
  return count;
}

function splitWords(text: string): readonly string[] {
  return text.split(/[\s\n\t\r]+/).filter((word) => word.length > 0);
}

function measureLongestWordCells(text: string): number {
  const words = splitWords(text);
  let maxWord = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    const width = measureTextCells(word);
    if (width > maxWord) maxWord = width;
  }
  return maxWord;
}

function measureMaxLineCells(text: string): number {
  const lines = text.split("\n");
  let maxLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const width = measureTextCells(lines[i] ?? "");
    if (width > maxLine) maxLine = width;
  }
  return maxLine;
}

function countExplicitLines(text: string): number {
  return text.split("\n").length;
}

function sumWithGap(values: readonly number[], gap: number): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i] ?? 0;
  if (values.length > 1) total += gap * (values.length - 1);
  return total;
}

function fallbackIntrinsic(
  vnode: VNode,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const fallback = measureNode(vnode, INTRINSIC_FALLBACK_LIMIT, INTRINSIC_FALLBACK_LIMIT, axis);
  if (!fallback.ok) return fallback;
  return ok(clampSize(fallback.value));
}

function measureLeafMinContent(
  vnode: VNode,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "text": {
      const propsRes = validateTextProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const longestWord = measureLongestWordCells(vnode.text);
      const capped =
        propsRes.value.maxWidth === undefined
          ? longestWord
          : Math.min(longestWord, propsRes.value.maxWidth);
      return ok(clampSize({ w: capped, h: countExplicitLines(vnode.text) }));
    }
    case "button": {
      const propsRes = validateButtonProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const px = resolveButtonPx(vnode);
      return ok(clampSize({ w: px * 2 + 1, h: 1 }));
    }
    case "input": {
      const propsRes = validateInputProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      if (propsRes.value.multiline) return ok(clampSize({ w: 3, h: propsRes.value.rows }));
      return ok({ w: 3, h: 1 });
    }
    case "progress": {
      return ok({ w: 10, h: 1 });
    }
    case "badge": {
      return ok({ w: 3, h: 1 });
    }
    case "select": {
      const propsRes = validateSelectProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      void propsRes;
      return ok({ w: 5, h: 1 });
    }
    case "spacer": {
      // Spacer still consumes minimum in the parent main axis.
      const size = (vnode.props as { size?: unknown }).size;
      const parsed =
        typeof size === "number" && Number.isFinite(size) && size >= 0 ? Math.floor(size) : 1;
      if (axis === "row") return ok({ w: parsed, h: 1 });
      return ok({ w: 0, h: parsed });
    }
    default:
      return fallbackIntrinsic(vnode, axis, measureNode);
  }
}

function measureLeafMaxContent(
  vnode: VNode,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "text": {
      const propsRes = validateTextProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const full = measureMaxLineCells(vnode.text);
      const capped =
        propsRes.value.maxWidth === undefined ? full : Math.min(full, propsRes.value.maxWidth);
      return ok(clampSize({ w: capped, h: countExplicitLines(vnode.text) }));
    }
    case "button": {
      const propsRes = validateButtonProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const px = resolveButtonPx(vnode);
      const labelW = measureTextCells(propsRes.value.label);
      return ok(clampSize({ w: labelW + px * 2, h: 1 }));
    }
    case "input": {
      const propsRes = validateInputProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      if (propsRes.value.multiline) {
        const placeholderRaw = (vnode.props as { placeholder?: unknown }).placeholder;
        const placeholder = typeof placeholderRaw === "string" ? placeholderRaw : "";
        const content = propsRes.value.value.length > 0 ? propsRes.value.value : placeholder;
        const maxLine = measureMaxLineCells(content);
        return ok(clampSize({ w: maxLine + 2, h: propsRes.value.rows }));
      }
      const placeholderRaw = (vnode.props as { placeholder?: unknown }).placeholder;
      const placeholder = typeof placeholderRaw === "string" ? placeholderRaw : "";
      const content = propsRes.value.value.length > 0 ? propsRes.value.value : placeholder;
      const textW = measureTextCells(content);
      return ok(clampSize({ w: textW + 2, h: 1 }));
    }
    case "progress": {
      const props = vnode.props as { width?: unknown; label?: unknown; showPercent?: unknown };
      const explicit =
        typeof props.width === "number" && Number.isFinite(props.width) && props.width >= 0
          ? Math.floor(props.width)
          : 10;
      const labelW = typeof props.label === "string" ? measureTextCells(props.label) + 1 : 0;
      const percentW = props.showPercent === true ? 5 : 0;
      return ok(clampSize({ w: labelW + explicit + percentW, h: 1 }));
    }
    case "badge": {
      const text = (vnode.props as { text?: unknown }).text;
      const textW = typeof text === "string" ? measureTextCells(text) : 0;
      return ok(clampSize({ w: textW + 2, h: 1 }));
    }
    case "select": {
      const propsRes = validateSelectProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      let maxText = measureTextCells(propsRes.value.placeholder ?? "Select...");
      for (let i = 0; i < propsRes.value.options.length; i++) {
        const option = propsRes.value.options[i];
        if (!option) continue;
        const width = measureTextCells(option.label);
        if (width > maxText) maxText = width;
      }
      return ok(clampSize({ w: maxText + 4, h: 1 }));
    }
    default:
      return fallbackIntrinsic(vnode, axis, measureNode);
  }
}

function measureStackIntrinsic(
  mode: MeasureIntrinsicFn,
  vnode: Extract<VNode, { kind: "row" | "column" }>,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const propsRes = validateStackProps(vnode.kind, vnode.props);
  if (!propsRes.ok) return propsRes;

  const spacing = resolveSpacingProps(propsRes.value);
  const padMain =
    vnode.kind === "row" ? spacing.left + spacing.right : spacing.top + spacing.bottom;
  const padCross =
    vnode.kind === "row" ? spacing.top + spacing.bottom : spacing.left + spacing.right;

  const childMain: number[] = [];
  let cross = 0;

  for (let i = 0; i < vnode.children.length; i++) {
    const child = vnode.children[i];
    if (!child) continue;
    const childRes = mode(child, vnode.kind, measureNode);
    if (!childRes.ok) return childRes;
    const main = vnode.kind === "row" ? childRes.value.w : childRes.value.h;
    const childCross = vnode.kind === "row" ? childRes.value.h : childRes.value.w;
    childMain.push(main);
    if (childCross > cross) cross = childCross;
  }

  const main = sumWithGap(childMain, propsRes.value.gap);
  if (vnode.kind === "row") {
    return ok(clampSize({ w: main + padMain, h: cross + padCross }));
  }
  return ok(clampSize({ w: cross + padCross, h: main + padMain }));
}

function measureBoxIntrinsic(
  mode: MeasureIntrinsicFn,
  vnode: Extract<VNode, { kind: "box" }>,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const propsRes = validateBoxProps(vnode.props);
  if (!propsRes.ok) return propsRes;

  const spacing = resolveSpacingProps(propsRes.value);
  const bt = propsRes.value.border === "none" || !propsRes.value.borderTop ? 0 : 1;
  const br = propsRes.value.border === "none" || !propsRes.value.borderRight ? 0 : 1;
  const bb = propsRes.value.border === "none" || !propsRes.value.borderBottom ? 0 : 1;
  const bl = propsRes.value.border === "none" || !propsRes.value.borderLeft ? 0 : 1;

  let contentW = 0;
  let contentH = 0;
  let childCount = 0;
  for (let i = 0; i < vnode.children.length; i++) {
    const child = vnode.children[i];
    if (!child) continue;
    const childRes = mode(child, "column", measureNode);
    if (!childRes.ok) return childRes;
    if (childRes.value.w > contentW) contentW = childRes.value.w;
    contentH += childRes.value.h;
    childCount++;
  }

  if (childCount > 1) contentH += propsRes.value.gap * (childCount - 1);

  return ok(
    clampSize({
      w: bl + br + spacing.left + spacing.right + contentW,
      h: bt + bb + spacing.top + spacing.bottom + contentH,
    }),
  );
}

function parseTrackCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    if (n > 0) return n;
    return null;
  }
  if (typeof raw === "string") {
    const parts = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return parts.length > 0 ? parts.length : null;
  }
  return null;
}

function parseRowCount(raw: unknown): number | null {
  if (raw === undefined) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n >= 0 ? n : null;
  }
  if (typeof raw === "string") {
    const parts = raw
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return parts.length;
  }
  return null;
}

function parseGap(raw: unknown, def: number): number | null {
  if (raw === undefined) return def;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const n = Math.floor(raw);
  if (n < 0) return null;
  return n;
}

function measureGridIntrinsic(
  mode: MeasureIntrinsicFn,
  vnode: Extract<VNode, { kind: "grid" }>,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const props = (vnode.props ?? {}) as {
    columns?: unknown;
    rows?: unknown;
    gap?: unknown;
    rowGap?: unknown;
    columnGap?: unknown;
  };
  const columnCount = parseTrackCount(props.columns);
  if (columnCount === null) return invalid("grid.columns must describe at least one track");
  const explicitRows = props.rows !== undefined;
  const explicitRowCount = parseRowCount(props.rows);
  if (explicitRows && explicitRowCount === null) {
    return invalid("grid.rows must be an int32 >= 0 or a non-empty track string");
  }
  const gap = parseGap(props.gap, 0);
  if (gap === null) return invalid("grid.gap must be an int32 >= 0");
  const rowGap = parseGap(props.rowGap, gap);
  if (rowGap === null) return invalid("grid.rowGap must be an int32 >= 0");
  const columnGap = parseGap(props.columnGap, gap);
  if (columnGap === null) return invalid("grid.columnGap must be an int32 >= 0");

  const capacity =
    explicitRows && explicitRowCount !== null
      ? Math.max(0, columnCount * explicitRowCount)
      : Number.POSITIVE_INFINITY;

  const placedChildren: VNode[] = [];
  for (let i = 0; i < vnode.children.length && placedChildren.length < capacity; i++) {
    const child = vnode.children[i];
    if (!child) continue;
    placedChildren.push(child);
  }

  const rowCount =
    explicitRows && explicitRowCount !== null
      ? explicitRowCount
      : Math.ceil(placedChildren.length / columnCount);

  const cols = new Array<number>(columnCount).fill(0);
  const rows = new Array<number>(rowCount).fill(0);
  for (let i = 0; i < placedChildren.length; i++) {
    const child = placedChildren[i];
    if (!child) continue;
    const childRes = mode(child, axis, measureNode);
    if (!childRes.ok) return childRes;
    const col = i % columnCount;
    const row = Math.floor(i / columnCount);
    if (row >= rowCount) break;
    if (childRes.value.w > (cols[col] ?? 0)) cols[col] = childRes.value.w;
    if (childRes.value.h > (rows[row] ?? 0)) rows[row] = childRes.value.h;
  }

  const width = sumWithGap(cols, columnGap);
  const height = sumWithGap(rows, rowGap);
  return ok(clampSize({ w: width, h: height }));
}

export function measureMinContent(
  vnode: VNode,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "row":
    case "column":
      return measureStackIntrinsic(measureMinContent, vnode, measureNode);
    case "box":
      return measureBoxIntrinsic(measureMinContent, vnode, measureNode);
    case "grid":
      return measureGridIntrinsic(measureMinContent, vnode, axis, measureNode);
    default:
      return measureLeafMinContent(vnode, axis, measureNode);
  }
}

export function measureMaxContent(
  vnode: VNode,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "row":
    case "column":
      return measureStackIntrinsic(measureMaxContent, vnode, measureNode);
    case "box":
      return measureBoxIntrinsic(measureMaxContent, vnode, measureNode);
    case "grid":
      return measureGridIntrinsic(measureMaxContent, vnode, axis, measureNode);
    default:
      return measureLeafMaxContent(vnode, axis, measureNode);
  }
}
