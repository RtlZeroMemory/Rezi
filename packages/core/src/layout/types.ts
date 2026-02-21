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
  /** Width / height ratio (e.g. 2 for 2:1). */
  aspectRatio?: number;
}>;
