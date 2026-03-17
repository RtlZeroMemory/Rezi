import type { VNode } from "../../../widgets/types.js";
import { getActiveDirtySet } from "../../engine/dirtySet.js";
import { childHasAbsolutePosition, getConstraintProps } from "../../engine/guards.js";
import type { LayoutTree } from "../../engine/types.js";
import type { Axis, Size } from "../../types.js";
import type { LayoutResult } from "../../validateProps.js";
import type { AxisConfig } from "./axis.js";
import { toWH, toXY } from "./axis.js";

export type MeasureNodeFn = (
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
) => LayoutResult<Size>;

export type StackVNode = Extract<VNode, { kind: "row" | "column" }>;

export type LayoutNodeFn = (
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  axis: Axis,
  forcedW?: number | null,
  forcedH?: number | null,
  precomputedSize?: Size | null,
) => LayoutResult<LayoutTree>;

export type ConstraintPropBag = Readonly<{
  width?: unknown;
  height?: unknown;
  alignSelf?: unknown;
}>;

export type FlexPropBag = Readonly<{
  flexShrink?: unknown;
  flexBasis?: unknown;
}>;

export type EffectiveAlign = "start" | "center" | "end" | "stretch";

export function resolveEffectiveAlign(child: VNode, align: EffectiveAlign): EffectiveAlign {
  const childAlignSelfRaw = (getConstraintProps(child) as { alignSelf?: unknown } | null)
    ?.alignSelf;
  if (
    childAlignSelfRaw === "start" ||
    childAlignSelfRaw === "center" ||
    childAlignSelfRaw === "end" ||
    childAlignSelfRaw === "stretch"
  ) {
    return childAlignSelfRaw;
  }
  return align;
}

export function childHasAdvancedFlexProps(vnode: unknown): boolean {
  const props = getConstraintProps(vnode) as FlexPropBag | null;
  if (!props) return false;
  const rawShrink = props.flexShrink;
  if (typeof rawShrink === "number" && Number.isFinite(rawShrink) && rawShrink > 0) {
    return true;
  }
  return props.flexBasis !== undefined;
}

export function isStackVNode(vnode: VNode): vnode is StackVNode {
  return vnode.kind === "row" || vnode.kind === "column";
}

export function measureNodeOnAxis(
  axis: AxisConfig,
  child: VNode,
  maxMain: number,
  maxCross: number,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const { w, h } = toWH(axis, maxMain, maxCross);
  return measureNode(child, w, h, axis.axis);
}

export function layoutNodeOnAxis(
  axis: AxisConfig,
  child: VNode,
  main: number,
  cross: number,
  maxMain: number,
  maxCross: number,
  layoutNode: LayoutNodeFn,
  forcedMain?: number | null,
  forcedCross?: number | null,
  precomputedSize?: Size | null,
): LayoutResult<LayoutTree> {
  const { x, y } = toXY(axis, main, cross);
  const { w, h } = toWH(axis, maxMain, maxCross);
  const forcedW = axis.mainProp === "width" ? forcedMain : forcedCross;
  const forcedH = axis.mainProp === "width" ? forcedCross : forcedMain;
  return layoutNode(child, x, y, w, h, axis.axis, forcedW, forcedH, precomputedSize);
}

export function countNonEmptyChildren(children: readonly (VNode | undefined)[]): number {
  let count = 0;
  for (const child of children) {
    if (!child || childHasAbsolutePosition(child)) continue;
    count++;
  }
  return count;
}

export function shiftLayoutTree(node: LayoutTree, dx: number, dy: number): LayoutTree {
  if (dx === 0 && dy === 0) return node;
  const shiftedChildren =
    node.children.length === 0
      ? node.children
      : Object.freeze(node.children.map((child) => shiftLayoutTree(child, dx, dy)));
  return {
    vnode: node.vnode,
    rect: { x: node.rect.x + dx, y: node.rect.y + dy, w: node.rect.w, h: node.rect.h },
    ...(node.meta === undefined ? {} : { meta: node.meta }),
    children: shiftedChildren,
  };
}

export function shiftLayoutChildren(
  children: readonly LayoutTree[],
  dx: number,
  dy: number,
): LayoutTree[] {
  if (dx === 0 && dy === 0) return children as LayoutTree[];
  return children.map((child) => shiftLayoutTree(child, dx, dy));
}

const previousChildSizeCache = new WeakMap<VNode, Size>();

function recordChildLayoutSize(child: VNode, layout: LayoutTree): void {
  previousChildSizeCache.set(child, { w: layout.rect.w, h: layout.rect.h });
}

export function maybePruneRemainingDirtySiblings(
  children: readonly (VNode | undefined)[],
  index: number,
  child: VNode,
  laidOut: LayoutTree,
): void {
  const dirtySet = getActiveDirtySet();
  if (dirtySet === null || !dirtySet.has(child)) {
    recordChildLayoutSize(child, laidOut);
    return;
  }

  const prev = previousChildSizeCache.get(child);
  recordChildLayoutSize(child, laidOut);
  if (!prev) return;
  if (prev.w !== laidOut.rect.w || prev.h !== laidOut.rect.h) return;

  for (let i = index + 1; i < children.length; i++) {
    const sibling = children[i];
    if (!sibling) continue;
    dirtySet.delete(sibling);
  }
}

export function isWrapEnabled(props: unknown): boolean {
  if (typeof props !== "object" || props === null) return false;
  return (props as { wrap?: unknown }).wrap === true;
}
