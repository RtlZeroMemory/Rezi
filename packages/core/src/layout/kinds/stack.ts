import type { VNode } from "../../widgets/types.js";
import type { LayoutTree } from "../engine/types.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";
import { getAxisConfig } from "./stackParts/axis.js";
import { layoutStack } from "./stackParts/layout.js";
import { measureStack } from "./stackParts/measure.js";
import type { LayoutNodeFn, MeasureNodeFn } from "./stackParts/shared.js";
import { isStackVNode } from "./stackParts/shared.js";

function invalid(detail: string): LayoutResult<never> {
  return {
    ok: false as const,
    fatal: { code: "ZRUI_INVALID_PROPS" as const, detail },
  };
}

export function measureStackKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  void axis;
  if (!isStackVNode(vnode)) {
    return invalid("measureStackKinds: unexpected vnode kind");
  }
  const stackAxis = getAxisConfig(vnode.kind);
  if (stackAxis === null) {
    return invalid("measureStackKinds: unexpected vnode kind");
  }
  return measureStack(stackAxis, vnode, maxW, maxH, measureNode);
}

export function layoutStackKinds(
  vnode: VNode,
  x: number,
  y: number,
  rectW: number,
  rectH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  void axis;
  if (!isStackVNode(vnode)) {
    return invalid("layoutStackKinds: unexpected vnode kind");
  }
  const stackAxis = getAxisConfig(vnode.kind);
  if (stackAxis === null) {
    return invalid("layoutStackKinds: unexpected vnode kind");
  }
  return layoutStack(stackAxis, vnode, x, y, rectW, rectH, measureNode, layoutNode);
}
