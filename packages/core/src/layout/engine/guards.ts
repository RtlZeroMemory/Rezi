import type { VNode } from "../../widgets/types.js";
import type { Axis } from "../types.js";

type ConstraintPropsBag = Readonly<{
  width?: unknown;
  height?: unknown;
  flex?: unknown;
  flexShrink?: unknown;
  flexBasis?: unknown;
  alignSelf?: unknown;
  gridColumn?: unknown;
  gridRow?: unknown;
  colSpan?: unknown;
  rowSpan?: unknown;
}>;

export function isVNode(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "kind" in v;
}

export function getConstraintProps(vnode: unknown): ConstraintPropsBag | null {
  if (!isVNode(vnode)) return null;
  if (
    vnode.kind === "box" ||
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "grid" ||
    vnode.kind === "virtualList" ||
    vnode.kind === "table" ||
    vnode.kind === "tree" ||
    vnode.kind === "filePicker" ||
    vnode.kind === "fileTreeExplorer" ||
    vnode.kind === "codeEditor" ||
    vnode.kind === "diffViewer" ||
    vnode.kind === "logsConsole" ||
    vnode.kind === "canvas" ||
    vnode.kind === "image" ||
    vnode.kind === "lineChart" ||
    vnode.kind === "scatter" ||
    vnode.kind === "heatmap" ||
    vnode.kind === "sparkline" ||
    vnode.kind === "barChart" ||
    vnode.kind === "miniChart" ||
    vnode.kind === "gauge"
  ) {
    return vnode.props as ConstraintPropsBag;
  }
  return null;
}

export function childHasFlexInMainAxis(vnode: unknown, axis: Axis): boolean {
  if (!isVNode(vnode)) return false;
  if (vnode.kind === "spacer") {
    const flex = (vnode.props as { flex?: unknown }).flex;
    return typeof flex === "number" && Number.isFinite(flex) && flex > 0;
  }
  const p = getConstraintProps(vnode);
  if (!p) return false;
  const flex = p.flex;
  return typeof flex === "number" && Number.isFinite(flex) && flex > 0;
}

export function childHasPercentInMainAxis(vnode: unknown, axis: Axis): boolean {
  void vnode;
  void axis;
  return false;
}

export function childHasPercentInCrossAxis(vnode: unknown, axis: Axis): boolean {
  void vnode;
  void axis;
  return false;
}

export function childHasAbsolutePosition(vnode: unknown): boolean {
  if (!isVNode(vnode)) return false;
  const p = vnode.props as { position?: unknown };
  return p.position === "absolute";
}
