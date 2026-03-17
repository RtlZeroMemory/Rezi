import type { ConstraintExpr } from "../../constraints/types.js";
import type { DisplayConstraint, SizeConstraint } from "../types.js";
import {
  requireAlignSelf,
  requireAspectRatio,
  requireDisplayConstraint,
  requireFlex,
  requireFlexShrink,
  requireGridSpan,
  requireGridStart,
  requireOptionalIntNonNegativeOrConstraint,
  requireOptionalIntSigned,
  requirePosition,
  requireSizeConstraint,
} from "./primitives.js";
import type { LayoutResult } from "./shared.js";
import { validateMinMax } from "./spacing.js";

export type ValidatedLayoutConstraints = Readonly<{
  width?: SizeConstraint;
  height?: SizeConstraint;
  minWidth?: number | ConstraintExpr;
  maxWidth?: number | ConstraintExpr;
  minHeight?: number | ConstraintExpr;
  maxHeight?: number | ConstraintExpr;
  flex?: number;
  flexShrink?: number;
  flexBasis?: SizeConstraint;
  aspectRatio?: number;
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";
  position?: "static" | "absolute";
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
  gridColumn?: number;
  gridRow?: number;
  colSpan?: number;
  rowSpan?: number;
  display?: DisplayConstraint;
}>;

export type LayoutConstraintPropBag = Readonly<{
  width?: unknown;
  height?: unknown;
  minWidth?: unknown;
  maxWidth?: unknown;
  minHeight?: unknown;
  maxHeight?: unknown;
  flex?: unknown;
  flexShrink?: unknown;
  flexBasis?: unknown;
  aspectRatio?: unknown;
  alignSelf?: unknown;
  position?: unknown;
  top?: unknown;
  right?: unknown;
  bottom?: unknown;
  left?: unknown;
  gridColumn?: unknown;
  gridRow?: unknown;
  colSpan?: unknown;
  rowSpan?: unknown;
  display?: unknown;
}>;

export function validateLayoutConstraints(
  kind: string,
  p: LayoutConstraintPropBag,
): LayoutResult<ValidatedLayoutConstraints> {
  const widthRes = requireSizeConstraint(kind, "width", p.width);
  if (!widthRes.ok) return widthRes;
  const heightRes = requireSizeConstraint(kind, "height", p.height);
  if (!heightRes.ok) return heightRes;

  const minWidthRes = requireOptionalIntNonNegativeOrConstraint(kind, "minWidth", p.minWidth);
  if (!minWidthRes.ok) return minWidthRes;
  const maxWidthRes = requireOptionalIntNonNegativeOrConstraint(kind, "maxWidth", p.maxWidth);
  if (!maxWidthRes.ok) return maxWidthRes;
  const minHeightRes = requireOptionalIntNonNegativeOrConstraint(kind, "minHeight", p.minHeight);
  if (!minHeightRes.ok) return minHeightRes;
  const maxHeightRes = requireOptionalIntNonNegativeOrConstraint(kind, "maxHeight", p.maxHeight);
  if (!maxHeightRes.ok) return maxHeightRes;

  const mmw = validateMinMax(kind, "minWidth", "maxWidth", minWidthRes.value, maxWidthRes.value);
  if (!mmw.ok) return mmw;
  const mmh = validateMinMax(
    kind,
    "minHeight",
    "maxHeight",
    minHeightRes.value,
    maxHeightRes.value,
  );
  if (!mmh.ok) return mmh;

  const flexRes = requireFlex(kind, p.flex);
  if (!flexRes.ok) return flexRes;
  const flexShrinkRes = requireFlexShrink(kind, p.flexShrink);
  if (!flexShrinkRes.ok) return flexShrinkRes;
  const flexBasisRes = requireSizeConstraint(kind, "flexBasis", p.flexBasis);
  if (!flexBasisRes.ok) return flexBasisRes;
  const arRes = requireAspectRatio(kind, p.aspectRatio);
  if (!arRes.ok) return arRes;
  const alignSelfRes = requireAlignSelf(kind, p.alignSelf);
  if (!alignSelfRes.ok) return alignSelfRes;
  const positionRes = requirePosition(kind, p.position);
  if (!positionRes.ok) return positionRes;
  const topRes = requireOptionalIntSigned(kind, "top", p.top);
  if (!topRes.ok) return topRes;
  const rightRes = requireOptionalIntSigned(kind, "right", p.right);
  if (!rightRes.ok) return rightRes;
  const bottomRes = requireOptionalIntSigned(kind, "bottom", p.bottom);
  if (!bottomRes.ok) return bottomRes;
  const leftRes = requireOptionalIntSigned(kind, "left", p.left);
  if (!leftRes.ok) return leftRes;
  const gridColumnRes = requireGridStart(kind, "gridColumn", p.gridColumn);
  if (!gridColumnRes.ok) return gridColumnRes;
  const gridRowRes = requireGridStart(kind, "gridRow", p.gridRow);
  if (!gridRowRes.ok) return gridRowRes;
  const colSpanRes = requireGridSpan(kind, "colSpan", p.colSpan);
  if (!colSpanRes.ok) return colSpanRes;
  const rowSpanRes = requireGridSpan(kind, "rowSpan", p.rowSpan);
  if (!rowSpanRes.ok) return rowSpanRes;
  const displayRes = requireDisplayConstraint(kind, "display", p.display);
  if (!displayRes.ok) return displayRes;

  return {
    ok: true,
    value: {
      ...(widthRes.value === undefined ? {} : { width: widthRes.value }),
      ...(heightRes.value === undefined ? {} : { height: heightRes.value }),
      ...(minWidthRes.value === undefined ? {} : { minWidth: minWidthRes.value }),
      ...(maxWidthRes.value === undefined ? {} : { maxWidth: maxWidthRes.value }),
      ...(minHeightRes.value === undefined ? {} : { minHeight: minHeightRes.value }),
      ...(maxHeightRes.value === undefined ? {} : { maxHeight: maxHeightRes.value }),
      ...(flexRes.value === undefined ? {} : { flex: flexRes.value }),
      ...(flexShrinkRes.value === undefined ? {} : { flexShrink: flexShrinkRes.value }),
      ...(flexBasisRes.value === undefined ? {} : { flexBasis: flexBasisRes.value }),
      ...(arRes.value === undefined ? {} : { aspectRatio: arRes.value }),
      ...(alignSelfRes.value === undefined ? {} : { alignSelf: alignSelfRes.value }),
      ...(positionRes.value === undefined ? {} : { position: positionRes.value }),
      ...(topRes.value === undefined ? {} : { top: topRes.value }),
      ...(rightRes.value === undefined ? {} : { right: rightRes.value }),
      ...(bottomRes.value === undefined ? {} : { bottom: bottomRes.value }),
      ...(leftRes.value === undefined ? {} : { left: leftRes.value }),
      ...(gridColumnRes.value === undefined ? {} : { gridColumn: gridColumnRes.value }),
      ...(gridRowRes.value === undefined ? {} : { gridRow: gridRowRes.value }),
      ...(colSpanRes.value === undefined ? {} : { colSpan: colSpanRes.value }),
      ...(rowSpanRes.value === undefined ? {} : { rowSpan: rowSpanRes.value }),
      ...(displayRes.value === undefined ? {} : { display: displayRes.value }),
    },
  };
}
