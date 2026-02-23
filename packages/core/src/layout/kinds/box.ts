import type { VNode } from "../../widgets/types.js";
import {
  measureContentBounds,
  resolveAbsolutePosition,
  resolveLayoutConstraints,
  resolveOverflow,
} from "../constraints.js";
import { clampNonNegative, clampWithin, toFiniteMax } from "../engine/bounds.js";
import { childHasAbsolutePosition } from "../engine/guards.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import {
  resolveMargin as resolveMarginProps,
  resolveSpacing as resolveSpacingProps,
} from "../spacing.js";
import type { Axis, Rect, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";
import { validateBoxProps } from "../validateProps.js";

type MeasureNodeFn = (vnode: VNode, maxW: number, maxH: number, axis: Axis) => LayoutResult<Size>;

type LayoutNodeFn = (
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

type SyntheticColumnCacheEntry = Readonly<{
  childrenRef: readonly VNode[];
  gap: number;
  flowSignature: string;
  columnNode: VNode;
}>;

const syntheticColumnCache = new WeakMap<VNode, SyntheticColumnCacheEntry>();

type VNodeWithChildren = VNode & Readonly<{ children: readonly VNode[] }>;

function computeFlowSignature(children: readonly VNode[]): string {
  let signature = `${children.length}:`;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    signature += child !== undefined && childHasAbsolutePosition(child) ? "1" : "0";
  }
  return signature;
}

function getSyntheticColumn(vnode: VNodeWithChildren, gap: number): VNode {
  const flowSignature = computeFlowSignature(vnode.children);
  const hit = syntheticColumnCache.get(vnode);
  if (
    hit &&
    hit.childrenRef === vnode.children &&
    hit.gap === gap &&
    hit.flowSignature === flowSignature
  ) {
    return hit.columnNode;
  }

  const flowChildren: VNode[] = [];
  for (let i = 0; i < vnode.children.length; i++) {
    const child = vnode.children[i];
    if (!child || childHasAbsolutePosition(child)) continue;
    flowChildren.push(child);
  }
  const columnNode: VNode = {
    kind: "column",
    props: { gap },
    children: Object.freeze(flowChildren),
  };
  syntheticColumnCache.set(
    vnode,
    Object.freeze({ childrenRef: vnode.children, gap, flowSignature, columnNode }),
  );
  return columnNode;
}

function shiftLayoutTree(node: LayoutTree, dx: number, dy: number): LayoutTree {
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

function shiftLayoutChildren(
  children: readonly LayoutTree[],
  dx: number,
  dy: number,
): LayoutTree[] {
  if (dx === 0 && dy === 0) return children as LayoutTree[];
  return children.map((child) => shiftLayoutTree(child, dx, dy));
}

export function measureBoxKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "box": {
      const propsRes = validateBoxProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const { border, borderTop, borderRight, borderBottom, borderLeft } = propsRes.value;
      const spacing = resolveSpacingProps(propsRes.value);
      const margin = resolveMarginProps(propsRes.value);
      const bt = border === "none" || !borderTop ? 0 : 1;
      const br = border === "none" || !borderRight ? 0 : 1;
      const bb = border === "none" || !borderBottom ? 0 : 1;
      const bl = border === "none" || !borderLeft ? 0 : 1;
      const marginX = margin.left + margin.right;
      const marginY = margin.top + margin.bottom;
      const innerMaxW = clampNonNegative(maxW - marginX);
      const innerMaxH = clampNonNegative(maxH - marginY);

      const self = resolveLayoutConstraints(propsRes.value, {
        x: 0,
        y: 0,
        w: innerMaxW,
        h: innerMaxH,
      });
      const maxWCap = clampNonNegative(Math.min(innerMaxW, toFiniteMax(self.maxWidth, innerMaxW)));
      const maxHCap = clampNonNegative(Math.min(innerMaxH, toFiniteMax(self.maxHeight, innerMaxH)));

      const minW = Math.min(self.minWidth, maxWCap);
      const minH = Math.min(self.minHeight, maxHCap);

      const forcedW = self.width === null ? null : clampWithin(self.width, minW, maxWCap);
      const forcedH = self.height === null ? null : clampWithin(self.height, minH, maxHCap);

      const outerWLimit = forcedW ?? maxWCap;
      const outerHLimit = forcedH ?? maxHCap;

      const cw = clampNonNegative(outerWLimit - bl - br - spacing.left - spacing.right);
      const ch = clampNonNegative(outerHLimit - bt - bb - spacing.top - spacing.bottom);

      // Children are laid out as a Column inside the content rect.
      let contentUsedW = 0;
      let contentUsedH = 0;

      if (vnode.children.length > 0) {
        const columnNode = getSyntheticColumn(vnode, propsRes.value.gap);
        const innerRes = measureNode(columnNode, cw, ch, "column");
        if (!innerRes.ok) return innerRes;
        contentUsedW = innerRes.value.w;
        contentUsedH = innerRes.value.h;
      }

      const naturalW = Math.min(maxWCap, bl + br + spacing.left + spacing.right + contentUsedW);
      const naturalH = Math.min(maxHCap, bt + bb + spacing.top + spacing.bottom + contentUsedH);

      const chosenW = forcedW ?? naturalW;
      const chosenH = forcedH ?? naturalH;
      const innerW = clampWithin(chosenW, minW, maxWCap);
      const innerH = clampWithin(chosenH, minH, maxHCap);

      return ok({
        w: clampNonNegative(Math.min(maxW, innerW + marginX)),
        h: clampNonNegative(Math.min(maxH, innerH + marginY)),
      });
    }
    case "field": {
      // Field wrappers take space based on their child + label/error.
      // Estimate: child width, height = child + 2 lines (label + error).
      const child = vnode.children[0];
      if (!child) {
        return ok({ w: 0, h: Math.min(maxH, 2) });
      }
      const childMaxH = clampNonNegative(maxH - 2);
      const childSize = measureNode(child, maxW, childMaxH, axis);
      if (!childSize.ok) return childSize;
      return ok({ w: childSize.value.w, h: Math.min(maxH, childSize.value.h + 2) });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureBoxKinds: unexpected vnode kind" },
      };
  }
}

export function layoutBoxKinds(
  vnode: VNode,
  x: number,
  y: number,
  rectW: number,
  rectH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  switch (vnode.kind) {
    case "box": {
      const propsRes = validateBoxProps(vnode.props);
      if (!propsRes.ok) return propsRes;
      const { border, borderTop, borderRight, borderBottom, borderLeft } = propsRes.value;
      const spacing = resolveSpacingProps(propsRes.value);
      const margin = resolveMarginProps(propsRes.value);
      const bt = border === "none" || !borderTop ? 0 : 1;
      const br = border === "none" || !borderRight ? 0 : 1;
      const bb = border === "none" || !borderBottom ? 0 : 1;
      const bl = border === "none" || !borderLeft ? 0 : 1;

      const boxX = x + margin.left;
      const boxY = y + margin.top;
      const boxW = clampNonNegative(rectW - margin.left - margin.right);
      const boxH = clampNonNegative(rectH - margin.top - margin.bottom);

      const cx = boxX + bl + spacing.left;
      const cy = boxY + bt + spacing.top;
      const cw = clampNonNegative(boxW - bl - br - spacing.left - spacing.right);
      const ch = clampNonNegative(boxH - bt - bb - spacing.top - spacing.bottom);

      const children: LayoutTree[] = [];
      if (vnode.children.length > 0) {
        const columnNode = getSyntheticColumn(vnode, propsRes.value.gap);
        // The synthetic column wrapper must fill the box content rect so that
        // percentage constraints resolve against the actual available space.
        const innerRes = layoutNode(columnNode, cx, cy, cw, ch, "column", cw, ch);
        if (!innerRes.ok) return innerRes;
        // Attach the box's children (not the synthetic column wrapper).
        children.push(...innerRes.value.children);
      }

      const contentRect: Rect = { x: cx, y: cy, w: cw, h: ch };
      for (let i = 0; i < vnode.children.length; i++) {
        const child = vnode.children[i];
        if (!child || !childHasAbsolutePosition(child)) continue;
        const naturalRes = measureNode(child, cw, ch, axis);
        if (!naturalRes.ok) return naturalRes;
        const absProps = (child.props ?? {}) as {
          top?: number;
          right?: number;
          bottom?: number;
          left?: number;
          width?: unknown;
          height?: unknown;
        };
        const absRect = resolveAbsolutePosition(absProps, contentRect, naturalRes.value);
        const childRes = layoutNode(
          child,
          absRect.x,
          absRect.y,
          absRect.w,
          absRect.h,
          axis,
          absRect.w,
          absRect.h,
          naturalRes.value,
        );
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
      }

      const { contentWidth, contentHeight } = measureContentBounds(children, cx, cy);
      const overflow = resolveOverflow(propsRes.value, cw, ch, contentWidth, contentHeight);
      const shiftedChildren = shiftLayoutChildren(
        children,
        -overflow.metadata.scrollX,
        -overflow.metadata.scrollY,
      );

      return ok({
        vnode,
        rect: { x: boxX, y: boxY, w: boxW, h: boxH },
        children: Object.freeze(shiftedChildren),
        meta: overflow.metadata,
      });
    }
    case "field": {
      // Field wrapper: label on top, child in middle, error/hint at bottom.
      const children: LayoutTree[] = [];
      // Layout the child input at offset y + 1 (below label)
      if (vnode.children.length > 0) {
        const child = vnode.children[0] as VNode;
        const childMaxH = clampNonNegative(rectH - 2);
        const childRes = layoutNode(child, x, y + 1, rectW, childMaxH, axis);
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
      }
      return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze(children) });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutBoxKinds: unexpected vnode kind" },
      };
  }
}
