import type { VNode } from "../../../widgets/types.js";
import type { Axis, Size } from "../../types.js";

export type AxisConfig = Readonly<{
  axis: Axis;
  crossAxis: Axis;
  mainSize: "w" | "h";
  crossSize: "w" | "h";
  mainPos: "x" | "y";
  crossPos: "x" | "y";
  mainProp: "width" | "height";
  crossProp: "width" | "height";
  minMainProp: "minWidth" | "minHeight";
  maxMainProp: "maxWidth" | "maxHeight";
  minCrossProp: "minWidth" | "minHeight";
  maxCrossProp: "maxWidth" | "maxHeight";
}>;

export const ROW_AXIS: AxisConfig = Object.freeze({
  axis: "row",
  crossAxis: "column",
  mainSize: "w",
  crossSize: "h",
  mainPos: "x",
  crossPos: "y",
  mainProp: "width",
  crossProp: "height",
  minMainProp: "minWidth",
  maxMainProp: "maxWidth",
  minCrossProp: "minHeight",
  maxCrossProp: "maxHeight",
});

export const COL_AXIS: AxisConfig = Object.freeze({
  axis: "column",
  crossAxis: "row",
  mainSize: "h",
  crossSize: "w",
  mainPos: "y",
  crossPos: "x",
  mainProp: "height",
  crossProp: "width",
  minMainProp: "minHeight",
  maxMainProp: "maxHeight",
  minCrossProp: "minWidth",
  maxCrossProp: "maxWidth",
});

export function getAxisConfig(kind: VNode["kind"]): AxisConfig | null {
  switch (kind) {
    case "row":
      return ROW_AXIS;
    case "column":
      return COL_AXIS;
    default:
      return null;
  }
}

export function mainFromWH(axis: AxisConfig, w: number, h: number): number {
  return axis.mainSize === "w" ? w : h;
}

export function crossFromWH(axis: AxisConfig, w: number, h: number): number {
  return axis.crossSize === "w" ? w : h;
}

export function mainFromSize(axis: AxisConfig, size: Size): number {
  return axis.mainSize === "w" ? size.w : size.h;
}

export function crossFromSize(axis: AxisConfig, size: Size): number {
  return axis.crossSize === "w" ? size.w : size.h;
}

export function toWH(
  axis: AxisConfig,
  main: number,
  cross: number,
): Readonly<{ w: number; h: number }> {
  if (axis.mainSize === "w") return { w: main, h: cross };
  return { w: cross, h: main };
}

export function toXY(
  axis: AxisConfig,
  main: number,
  cross: number,
): Readonly<{ x: number; y: number }> {
  if (axis.mainPos === "x") return { x: main, y: cross };
  return { x: cross, y: main };
}
