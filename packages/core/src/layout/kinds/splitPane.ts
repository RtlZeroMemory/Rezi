import type { ResizablePanelProps, VNode } from "../../index.js";
import { computePanelCellSizes } from "../../widgets/splitPane.js";
import { clampNonNegative, toFiniteMax } from "../engine/bounds.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";

function resolvePanelGroupPercentSpecs(children: readonly VNode[]): readonly number[] {
  const panelCount = children.length;
  if (panelCount <= 0) return Object.freeze([]);

  const defaultSizes = new Array<number | null>(panelCount);

  let specifiedCount = 0;
  let specifiedSum = 0;

  for (let i = 0; i < panelCount; i++) {
    const child = children[i];
    if (child?.kind === "resizablePanel") {
      const raw = (child.props as ResizablePanelProps).defaultSize;
      if (Number.isFinite(raw) && (raw as number) >= 0) {
        const v = raw as number;
        defaultSizes[i] = v;
        specifiedCount++;
        specifiedSum += v;
        continue;
      }
    }
    defaultSizes[i] = null;
  }

  // No defaultSize hints → equal weights.
  if (specifiedCount === 0) {
    const each = 100 / panelCount;
    return Object.freeze(new Array<number>(panelCount).fill(each));
  }

  const unspecifiedCount = panelCount - specifiedCount;
  const out = new Array<number>(panelCount);

  // All panels specified: treat defaultSize as weights and normalize to sum=100.
  if (unspecifiedCount === 0) {
    if (specifiedSum <= 0) {
      const each = 100 / panelCount;
      out.fill(each);
      return Object.freeze(out);
    }
    for (let i = 0; i < panelCount; i++) {
      const w = defaultSizes[i] ?? 0;
      out[i] = (w / specifiedSum) * 100;
    }
    return Object.freeze(out);
  }

  // Some specified:
  // - If sum<=100, treat specified values as percentages and distribute the remainder evenly.
  // - If sum>100, treat values as weights; give unspecified panels a weight=1.
  if (specifiedSum <= 100) {
    const remaining = 100 - specifiedSum;
    const each = remaining / unspecifiedCount;
    for (let i = 0; i < panelCount; i++) {
      out[i] = defaultSizes[i] ?? each;
    }
    return Object.freeze(out);
  }

  const totalWeight = specifiedSum + unspecifiedCount;
  for (let i = 0; i < panelCount; i++) {
    const w = defaultSizes[i] ?? 1;
    out[i] = (w / totalWeight) * 100;
  }
  return Object.freeze(out);
}

type LayoutNodeFn = (
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  axis: Axis,
  forcedW?: number | null,
  forcedH?: number | null,
) => LayoutResult<LayoutTree>;

export function measureSplitPaneKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "splitPane": {
      // Split pane container: fills available space
      return ok({ w: maxW, h: maxH });
    }
    case "panelGroup": {
      // Panel group container: fills available space
      return ok({ w: maxW, h: maxH });
    }
    case "resizablePanel": {
      // Resizable panel: fills available space
      return ok({ w: maxW, h: maxH });
    }
    default:
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "measureSplitPaneKinds: unexpected vnode kind",
        },
      };
  }
}

export function layoutSplitPaneKinds(
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  rectW: number,
  rectH: number,
  axis: Axis,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  switch (vnode.kind) {
    case "splitPane": {
      // Split pane: layout children according to direction and sizes
      const { direction, sizes } = vnode.props;
      const dividerSize = clampNonNegative(
        Math.trunc(toFiniteMax(vnode.props.dividerSize ?? 1, 1)),
      );
      const childCount = vnode.children.length;
      if (childCount === 0) {
        return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze([]) });
      }

      const sizeMode = vnode.props.sizeMode ?? "percent";
      const available = direction === "horizontal" ? rectW : rectH;
      const panelSizes = computePanelCellSizes(
        childCount,
        sizes,
        available,
        sizeMode,
        dividerSize,
        vnode.props.minSizes,
        vnode.props.maxSizes,
      ).sizes;

      const childTrees: LayoutTree[] = [];
      let offset = 0;

      for (let i = 0; i < childCount; i++) {
        const child = vnode.children[i];
        if (!child) continue;
        const panelSize = panelSizes[i] ?? 0;

        const childX = direction === "horizontal" ? x + offset : x;
        const childY = direction === "vertical" ? y + offset : y;
        const childW = direction === "horizontal" ? panelSize : rectW;
        const childH = direction === "vertical" ? panelSize : rectH;

        const childRes = layoutNode(child, childX, childY, childW, childH, axis);
        if (!childRes.ok) return childRes;
        childTrees.push(childRes.value);

        offset += panelSize + (i < childCount - 1 ? dividerSize : 0);
      }

      return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze(childTrees) });
    }
    case "panelGroup": {
      // Panel group: resizablePanel children can provide size hints (defaultSize/minSize/maxSize)
      const childCount = vnode.children.length;
      if (childCount === 0) {
        return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze([]) });
      }

      const { direction } = vnode.props;
      const childTrees: LayoutTree[] = [];
      const total = direction === "horizontal" ? rectW : rectH;

      const percentSpecs = resolvePanelGroupPercentSpecs(vnode.children);

      const minSizes = new Array<number>(childCount).fill(0);
      const maxSizes = new Array<number>(childCount).fill(total);
      let hasConstraints = false;

      for (let i = 0; i < childCount; i++) {
        const child = vnode.children[i];
        if (child?.kind !== "resizablePanel") continue;

        const p = child.props as ResizablePanelProps;
        if (Number.isFinite(p.minSize) && (p.minSize as number) >= 0) {
          minSizes[i] = Math.floor((total * (p.minSize as number)) / 100);
          hasConstraints = true;
        }
        if (Number.isFinite(p.maxSize) && (p.maxSize as number) >= 0) {
          maxSizes[i] = Math.floor((total * (p.maxSize as number)) / 100);
          hasConstraints = true;
        }
      }

      const panelSizes = computePanelCellSizes(
        childCount,
        percentSpecs,
        total,
        "percent",
        0 /* dividerSize */,
        hasConstraints ? minSizes : undefined,
        hasConstraints ? maxSizes : undefined,
      ).sizes;

      let offset = 0;
      for (let i = 0; i < childCount; i++) {
        const child = vnode.children[i];
        if (!child) continue;
        const panelSize = panelSizes[i] ?? 0;

        const childX = direction === "horizontal" ? x + offset : x;
        const childY = direction === "vertical" ? y + offset : y;
        const childW = direction === "horizontal" ? panelSize : rectW;
        const childH = direction === "vertical" ? panelSize : rectH;

        const childRes = layoutNode(child, childX, childY, childW, childH, axis);
        if (!childRes.ok) return childRes;
        childTrees.push(childRes.value);

        offset += panelSize;
      }

      return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze(childTrees) });
    }
    case "resizablePanel": {
      // Resizable panel: layout single child within bounds
      if (vnode.children.length === 0) {
        return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze([]) });
      }
      const child = vnode.children[0];
      if (!child) {
        return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze([]) });
      }
      const childRes = layoutNode(child, x, y, rectW, rectH, axis);
      if (!childRes.ok) return childRes;
      return ok({
        vnode,
        rect: { x, y, w: rectW, h: rectH },
        children: Object.freeze([childRes.value]),
      });
    }
    default:
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "layoutSplitPaneKinds: unexpected vnode kind",
        },
      };
  }
}
