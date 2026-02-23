/**
 * packages/core/src/layout/types.ts — Layout primitive type definitions.
 *
 * Why: Defines the fundamental geometric types used throughout the layout
 * system. All coordinates are in terminal cell units (not pixels).
 *
 * @see docs/guide/layout.md
 */
import type { ResponsiveValue } from "./responsive.js";

/** Rectangle with position (x,y) and dimensions (w,h) in terminal cells. */
export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

/** Size dimensions (width and height) in terminal cells. */
export type Size = Readonly<{ w: number; h: number }>;

/** Layout axis: row (horizontal) or column (vertical) stacking. */
export type Axis = "row" | "column";

/** Base size constraint scalar value. */
export type SizeConstraintAtom = number | `${number}%` | "full" | "auto";
/** Size constraint: scalar value or responsive breakpoint map. */
export type SizeConstraint = ResponsiveValue<SizeConstraintAtom>;

/**
 * Generic layout constraints supported by container widgets.
 *
 * Notes:
 * - `width`/`height` are resolved against the parent content size when expressed as percentages.
 * - `flex` participates in main-axis space distribution inside Row/Column.
 */
export type LayoutConstraints = Readonly<{
  width?: SizeConstraint;
  height?: SizeConstraint;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  flex?: number;
  /** Flex shrink factor. How much this child shrinks when siblings overflow. Default 0. */
  flexShrink?: number;
  /** Flex basis. Starting main-axis size before grow/shrink. Default "auto" (natural size). */
  flexBasis?: SizeConstraint;
  /** Width / height ratio (e.g. 2 for 2:1). */
  aspectRatio?: number;
  /** Per-child cross-axis alignment override. "auto" inherits parent align. */
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";
  /** Positioning mode. "absolute" removes from flow, relative to parent content rect. */
  position?: "static" | "absolute";
  /** Top offset for absolute positioning (cells). */
  top?: number;
  /** Right offset for absolute positioning (cells). */
  right?: number;
  /** Bottom offset for absolute positioning (cells). */
  bottom?: number;
  /** Left offset for absolute positioning (cells). */
  left?: number;
  /** Grid column start (1-based). Only used when parent is a grid. */
  gridColumn?: number;
  /** Grid row start (1-based). Only used when parent is a grid. */
  gridRow?: number;
  /** Number of columns to span (default 1). Only used when parent is a grid. */
  colSpan?: number;
  /** Number of rows to span (default 1). Only used when parent is a grid. */
  rowSpan?: number;
}>;
