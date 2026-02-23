/**
 * packages/core/src/layout/constraints.ts — Constraint resolution helpers.
 *
 * Why: Converts user-facing constraint values (numbers, percentages, "auto")
 * into concrete cell sizes for a given parent rectangle.
 */

import { resolveResponsiveValue } from "./responsive.js";
import type {
  Axis,
  LayoutConstraints,
  Rect,
  Size,
  SizeConstraint,
  SizeConstraintAtom,
} from "./types.js";

export type ResolvedConstraints = Readonly<{
  width: number | null;
  height: number | null;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  flex: number;
  flexShrink: number;
  flexBasis: number | null;
  aspectRatio: number | null;
}>;

export type OverflowMode = "visible" | "hidden" | "scroll";

export type LayoutOverflowMetadata = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

export type ResolvedOverflow = Readonly<{
  overflow: OverflowMode;
  metadata: LayoutOverflowMetadata;
}>;

type OverflowPropBag = Readonly<{
  overflow?: unknown;
  scrollX?: unknown;
  scrollY?: unknown;
}>;

type RectNode = Readonly<{ rect: Rect }>;

const I32_MAX = 2147483647;

/**
 * Resolve a single size constraint to a concrete cell count relative to `parentSize`.
 *
 * - numbers are returned as-is
 * - percentages are floored to an integer cell count
 * - "auto" resolves to `NaN` (caller decides meaning)
 */
export function resolveConstraint(value: SizeConstraintAtom, parentSize: number): number {
  if (value === "auto") return Number.NaN;
  if (value === "full") return parentSize;
  if (typeof value === "number") return value;
  const raw = Number.parseFloat(value.slice(0, -1));
  if (!Number.isFinite(raw)) return Number.NaN;
  return Math.floor((parentSize * raw) / 100);
}

function resolveOptional(value: SizeConstraint | undefined, parentSize: number): number | null {
  const resolved = resolveResponsiveValue(value);
  if (resolved === undefined) return null;
  if (typeof resolved !== "number" && typeof resolved !== "string") return null;
  const n = resolveConstraint(resolved as SizeConstraintAtom, parentSize);
  return Number.isFinite(n) ? (n as number) : null;
}

function or0(n: number | undefined): number {
  return n === undefined ? 0 : n;
}

function orInf(n: number | undefined): number {
  return n === undefined ? Number.POSITIVE_INFINITY : n;
}

export function resolveLayoutConstraints(
  props: LayoutConstraints,
  parent: Rect,
  mainAxis: Axis = "row",
): ResolvedConstraints {
  let width = resolveOptional(props.width, parent.w);
  let height = resolveOptional(props.height, parent.h);
  const flexShrink =
    typeof props.flexShrink === "number" &&
    Number.isFinite(props.flexShrink) &&
    props.flexShrink >= 0
      ? props.flexShrink
      : 0;
  const flexBasisRaw = props.flexBasis;
  const flexBasisParent = mainAxis === "row" ? parent.w : parent.h;
  const flexBasis =
    flexBasisRaw !== undefined ? resolveOptional(flexBasisRaw, flexBasisParent) : null;

  const aspectRatio =
    props.aspectRatio === undefined || props.aspectRatio === null ? null : props.aspectRatio;

  if (aspectRatio !== null && Number.isFinite(aspectRatio) && aspectRatio > 0) {
    if (width !== null && height === null) height = Math.floor(width / aspectRatio);
    else if (height !== null && width === null) width = Math.floor(height * aspectRatio);
  }

  return {
    width,
    height,
    minWidth: or0(props.minWidth),
    maxWidth: orInf(props.maxWidth),
    minHeight: or0(props.minHeight),
    maxHeight: orInf(props.maxHeight),
    flex: props.flex === undefined ? 0 : props.flex,
    flexShrink,
    flexBasis,
    aspectRatio,
  };
}

function readFiniteFloor(value: unknown): number | null {
  const resolved = resolveResponsiveValue(value);
  if (typeof resolved !== "number" || !Number.isFinite(resolved)) return null;
  return Math.floor(resolved);
}

function readOptionalSizeConstraintFloor(value: unknown, parentSize: number): number | null {
  const resolved = resolveResponsiveValue(value);
  if (resolved === undefined) return null;
  if (typeof resolved !== "number" && typeof resolved !== "string") return null;
  const n = resolveConstraint(resolved as SizeConstraintAtom, parentSize);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

/**
 * Resolve absolute positioning offsets against a parent content rect.
 */
export function resolveAbsolutePosition(
  props: Readonly<{
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
    width?: unknown;
    height?: unknown;
  }>,
  contentRect: Rect,
  naturalSize: Size,
): Rect {
  const left = readFiniteFloor(props.left);
  const right = readFiniteFloor(props.right);
  const top = readFiniteFloor(props.top);
  const bottom = readFiniteFloor(props.bottom);
  const explicitW = readOptionalSizeConstraintFloor(props.width, contentRect.w);
  const explicitH = readOptionalSizeConstraintFloor(props.height, contentRect.h);

  const hasLeft = left !== null;
  const hasRight = right !== null;
  const hasTop = top !== null;
  const hasBottom = bottom !== null;
  const hasExplicitW = explicitW !== null;
  const hasExplicitH = explicitH !== null;

  const naturalW = Math.max(0, Math.floor(naturalSize.w));
  const naturalH = Math.max(0, Math.floor(naturalSize.h));

  let ax: number;
  let aw: number;
  if (hasLeft && hasRight && !hasExplicitW) {
    ax = contentRect.x + (left ?? 0);
    aw = Math.max(0, contentRect.w - (left ?? 0) - (right ?? 0));
  } else if (hasLeft) {
    ax = contentRect.x + (left ?? 0);
    aw = hasExplicitW ? (explicitW ?? 0) : naturalW;
  } else if (hasRight) {
    aw = hasExplicitW ? (explicitW ?? 0) : naturalW;
    ax = contentRect.x + contentRect.w - (right ?? 0) - aw;
  } else {
    ax = contentRect.x;
    aw = hasExplicitW ? (explicitW ?? 0) : naturalW;
  }

  let ay: number;
  let ah: number;
  if (hasTop && hasBottom && !hasExplicitH) {
    ay = contentRect.y + (top ?? 0);
    ah = Math.max(0, contentRect.h - (top ?? 0) - (bottom ?? 0));
  } else if (hasTop) {
    ay = contentRect.y + (top ?? 0);
    ah = hasExplicitH ? (explicitH ?? 0) : naturalH;
  } else if (hasBottom) {
    ah = hasExplicitH ? (explicitH ?? 0) : naturalH;
    ay = contentRect.y + contentRect.h - (bottom ?? 0) - ah;
  } else {
    ay = contentRect.y;
    ah = hasExplicitH ? (explicitH ?? 0) : naturalH;
  }

  return {
    x: Math.floor(ax),
    y: Math.floor(ay),
    w: Math.max(0, Math.floor(aw)),
    h: Math.max(0, Math.floor(ah)),
  };
}

function normalizeOverflow(v: unknown): OverflowMode {
  if (v === "hidden" || v === "scroll") return v;
  return "visible";
}

function normalizeI32NonNegative(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  const n = Math.trunc(v);
  if (n <= 0) return 0;
  return n > I32_MAX ? I32_MAX : n;
}

/**
 * Measure content bounds from laid-out direct children.
 *
 * The returned size excludes container padding/border and represents only
 * the child content footprint measured from the content origin.
 */
export function measureContentBounds(
  children: readonly RectNode[],
  contentOriginX: number,
  contentOriginY: number,
): Readonly<{
  contentWidth: number;
  contentHeight: number;
}> {
  let hasRenderableChild = false;
  let maxRight = 0;
  let maxBottom = 0;

  for (const child of children) {
    const { rect } = child;
    if (rect.w <= 0 && rect.h <= 0) continue;
    hasRenderableChild = true;
    maxRight = Math.max(maxRight, rect.x + rect.w - contentOriginX);
    maxBottom = Math.max(maxBottom, rect.y + rect.h - contentOriginY);
  }

  if (!hasRenderableChild) {
    return { contentWidth: 0, contentHeight: 0 };
  }

  return {
    contentWidth: normalizeI32NonNegative(maxRight),
    contentHeight: normalizeI32NonNegative(maxBottom),
  };
}

/**
 * Resolve overflow mode and clamp requested scroll offsets to valid ranges.
 */
export function resolveOverflow(
  props: OverflowPropBag | null | undefined,
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
): ResolvedOverflow {
  const overflow = normalizeOverflow(props?.overflow);
  const viewportW = normalizeI32NonNegative(viewportWidth);
  const viewportH = normalizeI32NonNegative(viewportHeight);
  const contentW = normalizeI32NonNegative(contentWidth);
  const contentH = normalizeI32NonNegative(contentHeight);
  const requestedScrollX = normalizeI32NonNegative(props?.scrollX);
  const requestedScrollY = normalizeI32NonNegative(props?.scrollY);
  const maxScrollX = Math.max(0, contentW - viewportW);
  const maxScrollY = Math.max(0, contentH - viewportH);

  return {
    overflow,
    metadata: {
      scrollX: Math.min(requestedScrollX, maxScrollX),
      scrollY: Math.min(requestedScrollY, maxScrollY),
      contentWidth: contentW,
      contentHeight: contentH,
      viewportWidth: viewportW,
      viewportHeight: viewportH,
    },
  };
}
