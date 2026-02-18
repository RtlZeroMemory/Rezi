/**
 * packages/core/src/layout/constraints.ts — Constraint resolution helpers.
 *
 * Why: Converts user-facing constraint values (numbers, percentages, "auto")
 * into concrete cell sizes for a given parent rectangle.
 */

import type { LayoutConstraints, Rect, SizeConstraint } from "./types.js";

export type ResolvedConstraints = Readonly<{
  width: number | null;
  height: number | null;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
  flex: number;
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
export function resolveConstraint(value: SizeConstraint, parentSize: number): number {
  if (value === "auto") return Number.NaN;
  if (typeof value === "number") return value;
  const raw = Number.parseFloat(value.slice(0, -1));
  if (!Number.isFinite(raw)) return Number.NaN;
  return Math.floor((parentSize * raw) / 100);
}

function resolveOptional(value: SizeConstraint | undefined, parentSize: number): number | null {
  if (value === undefined) return null;
  const n = resolveConstraint(value, parentSize);
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
): ResolvedConstraints {
  let width = resolveOptional(props.width, parent.w);
  let height = resolveOptional(props.height, parent.h);

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
    aspectRatio,
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
