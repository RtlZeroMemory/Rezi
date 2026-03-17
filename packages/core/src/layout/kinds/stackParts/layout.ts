import type { VNode } from "../../../widgets/types.js";
import {
  measureContentBounds,
  resolveAbsolutePosition,
  resolveOverflow,
} from "../../constraints.js";
import { clampNonNegative } from "../../engine/bounds.js";
import {
  type Justify,
  computeJustifyExtraGap,
  computeJustifyStartOffset,
} from "../../engine/flex.js";
import { childHasAbsolutePosition, childHasFlexInMainAxis } from "../../engine/guards.js";
import { acquireArray, releaseArray } from "../../engine/pool.js";
import { ok } from "../../engine/result.js";
import type { LayoutTree } from "../../engine/types.js";
import {
  resolveMargin as resolveMarginProps,
  resolveSpacing as resolveSpacingProps,
} from "../../spacing.js";
import type { Rect } from "../../types.js";
import type { LayoutResult } from "../../validateProps.js";
import { validateStackProps } from "../../validateProps.js";
import type { AxisConfig } from "./axis.js";
import { crossFromSize, crossFromWH, mainFromSize, mainFromWH } from "./axis.js";
import { planConstraintCrossSizes, planConstraintMainSizes } from "./constraintPlan.js";
import type { LayoutNodeFn, MeasureNodeFn, StackVNode } from "./shared.js";
import {
  childHasAdvancedFlexProps,
  countNonEmptyChildren,
  isWrapEnabled,
  layoutNodeOnAxis,
  maybePruneRemainingDirtySiblings,
  measureNodeOnAxis,
  resolveEffectiveAlign,
  shiftLayoutChildren,
} from "./shared.js";
import {
  type WrapLineChildLayout,
  type WrapLineLayout,
  planWrapConstraintLine,
  probeWrapChildMain,
} from "./wrap.js";

export function layoutStack(
  axis: AxisConfig,
  vnode: StackVNode,
  x: number,
  y: number,
  rectW: number,
  rectH: number,
  measureNode: MeasureNodeFn,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  const propsRes = validateStackProps(axis.axis, vnode.props);
  if (!propsRes.ok) return propsRes;
  const { gap, align } = propsRes.value;
  const justify = propsRes.value.justify as Justify;
  const spacing = resolveSpacingProps(propsRes.value);
  const margin = resolveMarginProps(propsRes.value);

  const stackX = x + margin.left;
  const stackY = y + margin.top;
  const stackW = clampNonNegative(rectW - margin.left - margin.right);
  const stackH = clampNonNegative(rectH - margin.top - margin.bottom);

  const cx = stackX + spacing.left;
  const cy = stackY + spacing.top;
  const cw = clampNonNegative(stackW - spacing.left - spacing.right);
  const ch = clampNonNegative(stackH - spacing.top - spacing.bottom);

  const mainOrigin = mainFromWH(axis, cx, cy);
  const crossOrigin = crossFromWH(axis, cx, cy);
  const mainLimit = mainFromWH(axis, cw, ch);
  const crossLimit = crossFromWH(axis, cw, ch);

  const count = vnode.children.length;
  const childCount = countNonEmptyChildren(vnode.children);
  const children: LayoutTree[] = [];

  const needsConstraintPass = vnode.children.some(
    (c) =>
      !childHasAbsolutePosition(c) &&
      (childHasFlexInMainAxis(c, axis.axis) || childHasAdvancedFlexProps(c)),
  );
  const wrap = isWrapEnabled(vnode.props);

  if (wrap) {
    const lines: WrapLineLayout[] = [];

    if (needsConstraintPass) {
      const parentRect: Rect = { x: 0, y: 0, w: cw, h: ch };
      const lineChildren: VNode[] = [];
      let lineProbeMain = 0;

      for (let i = 0; i < count; i++) {
        const child = vnode.children[i];
        if (!child || childHasAbsolutePosition(child)) continue;

        const probeMainRes = probeWrapChildMain(axis, child, cw, ch, parentRect, measureNode);
        if (!probeMainRes.ok) return probeMainRes;
        const probeMain = probeMainRes.value;

        const wouldOverflow =
          lineChildren.length > 0 && lineProbeMain + gap + probeMain > mainLimit;
        if (wouldOverflow) {
          const linePlanRes = planWrapConstraintLine(
            axis,
            lineChildren,
            cw,
            ch,
            gap,
            parentRect,
            measureNode,
          );
          if (!linePlanRes.ok) return linePlanRes;
          lines.push(linePlanRes.value);
          lineChildren.length = 0;
          lineProbeMain = 0;
        }

        if (lineChildren.length === 0) lineProbeMain = probeMain;
        else lineProbeMain += gap + probeMain;
        lineChildren.push(child);
      }

      if (lineChildren.length > 0) {
        const linePlanRes = planWrapConstraintLine(
          axis,
          lineChildren,
          cw,
          ch,
          gap,
          parentRect,
          measureNode,
        );
        if (!linePlanRes.ok) return linePlanRes;
        lines.push(linePlanRes.value);
      }
    } else {
      let lineMain = 0;
      let lineCross = 0;
      let lineChildren: WrapLineChildLayout[] = [];

      for (let i = 0; i < count; i++) {
        const child = vnode.children[i];
        if (!child || childHasAbsolutePosition(child)) continue;

        const childSizeRes = measureNode(child, cw, ch, axis.axis);
        if (!childSizeRes.ok) return childSizeRes;
        const childMain = mainFromSize(axis, childSizeRes.value);
        const childCross = crossFromSize(axis, childSizeRes.value);

        const wouldOverflow = lineChildren.length > 0 && lineMain + gap + childMain > mainLimit;
        if (wouldOverflow) {
          lines.push({
            children: Object.freeze(lineChildren),
            main: lineMain,
            cross: lineCross,
          });
          lineMain = 0;
          lineCross = 0;
          lineChildren = [];
        }

        if (lineChildren.length === 0) lineMain = childMain;
        else lineMain += gap + childMain;
        if (childCross > lineCross) lineCross = childCross;

        lineChildren.push({
          child,
          main: childMain,
          measureMaxMain: childMain,
          cross: childCross,
        });
      }

      if (lineChildren.length > 0) {
        lines.push({
          children: Object.freeze(lineChildren),
          main: lineMain,
          cross: lineCross,
        });
      }
    }

    let lineCrossPos = crossOrigin;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      if (!line) continue;

      const lineChildCount = line.children.length;
      const extra = clampNonNegative(mainLimit - line.main);
      const startOffset = computeJustifyStartOffset(justify, extra, lineChildCount);

      let cursorMain = mainOrigin + startOffset;
      let remainingMain = clampNonNegative(mainLimit - startOffset);

      for (let childOrdinal = 0; childOrdinal < lineChildCount; childOrdinal++) {
        const planned = line.children[childOrdinal];
        if (!planned) continue;
        const child = planned.child;

        if (remainingMain === 0) {
          const childRes = layoutNodeOnAxis(
            axis,
            child,
            cursorMain,
            lineCrossPos,
            0,
            0,
            layoutNode,
          );
          if (!childRes.ok) return childRes;
          children.push(childRes.value);
        } else {
          const childCross = planned.cross;
          let childCrossPos = lineCrossPos;
          let forceCross: number | null = null;
          const effectiveAlign = resolveEffectiveAlign(child, align);
          if (effectiveAlign === "center") {
            childCrossPos = lineCrossPos + Math.floor((line.cross - childCross) / 2);
          } else if (effectiveAlign === "end") {
            childCrossPos = lineCrossPos + (line.cross - childCross);
          } else if (effectiveAlign === "stretch") {
            forceCross = line.cross;
          }

          const childRes = needsConstraintPass
            ? layoutNodeOnAxis(
                axis,
                child,
                cursorMain,
                childCrossPos,
                Math.max(planned.measureMaxMain, planned.main),
                crossLimit,
                layoutNode,
                planned.main,
                forceCross,
              )
            : layoutNodeOnAxis(
                axis,
                child,
                cursorMain,
                childCrossPos,
                remainingMain,
                crossLimit,
                layoutNode,
                null,
                forceCross,
              );
          if (!childRes.ok) return childRes;
          children.push(childRes.value);
        }

        const hasNextChild = childOrdinal < lineChildCount - 1;
        const extraGap = hasNextChild
          ? computeJustifyExtraGap(justify, extra, lineChildCount, childOrdinal)
          : 0;
        const step = planned.main + (hasNextChild ? gap + extraGap : 0);
        cursorMain = cursorMain + step;
        remainingMain = clampNonNegative(remainingMain - step);
      }

      if (lineIndex < lines.length - 1) {
        lineCrossPos = lineCrossPos + line.cross + gap;
      }
    }
  } else if (!needsConstraintPass) {
    const mainSizes = acquireArray(count);
    const crossSizes = acquireArray(count);

    try {
      let rem = mainLimit;
      for (let i = 0; i < count; i++) {
        const child = vnode.children[i];
        if (!child || childHasAbsolutePosition(child)) continue;
        if (rem === 0) continue;

        const childSizeRes = measureNodeOnAxis(axis, child, rem, crossLimit, measureNode);
        if (!childSizeRes.ok) return childSizeRes;
        mainSizes[i] = mainFromSize(axis, childSizeRes.value);
        crossSizes[i] = crossFromSize(axis, childSizeRes.value);
        rem = clampNonNegative(rem - (mainSizes[i] ?? 0) - gap);
      }

      let usedMain = 0;
      for (let i = 0; i < count; i++) {
        usedMain += mainSizes[i] ?? 0;
      }
      usedMain += childCount <= 1 ? 0 : gap * (childCount - 1);
      const extra = clampNonNegative(mainLimit - usedMain);
      const startOffset = computeJustifyStartOffset(justify, extra, childCount);

      let cursorMain = mainOrigin + startOffset;
      let remainingMain = clampNonNegative(mainLimit - startOffset);
      let childOrdinal = 0;

      for (let i = 0; i < count; i++) {
        const child = vnode.children[i];
        if (!child || childHasAbsolutePosition(child)) continue;

        if (remainingMain === 0) {
          const childRes = layoutNodeOnAxis(axis, child, cursorMain, crossOrigin, 0, 0, layoutNode);
          if (!childRes.ok) return childRes;
          children.push(childRes.value);
          childOrdinal++;
          continue;
        }

        const childMain = mainSizes[i] ?? 0;
        const childCross = crossSizes[i] ?? 0;

        let childCrossPos = crossOrigin;
        let forceCross: number | null = null;
        const effectiveAlign = resolveEffectiveAlign(child, align);
        if (effectiveAlign === "center") {
          childCrossPos = crossOrigin + Math.floor((crossLimit - childCross) / 2);
        } else if (effectiveAlign === "end") {
          childCrossPos = crossOrigin + (crossLimit - childCross);
        } else if (effectiveAlign === "stretch") {
          forceCross = crossLimit;
        }

        const childRes = layoutNodeOnAxis(
          axis,
          child,
          cursorMain,
          childCrossPos,
          remainingMain,
          crossLimit,
          layoutNode,
          null,
          forceCross,
        );
        if (!childRes.ok) return childRes;
        children.push(childRes.value);

        const hasNextChild = childOrdinal < childCount - 1;
        const extraGap = hasNextChild
          ? computeJustifyExtraGap(justify, extra, childCount, childOrdinal)
          : 0;
        const step = childMain + (hasNextChild ? gap + extraGap : 0);
        cursorMain = cursorMain + step;
        remainingMain = clampNonNegative(remainingMain - step);
        childOrdinal++;
      }
    } finally {
      releaseArray(mainSizes);
      releaseArray(crossSizes);
    }
  } else {
    const parentRect: Rect = { x: 0, y: 0, w: cw, h: ch };
    const gapTotal = childCount <= 1 ? 0 : gap * (childCount - 1);
    const availableForChildren = clampNonNegative(mainLimit - gapTotal);
    const planRes = planConstraintMainSizes(
      axis,
      vnode.children,
      availableForChildren,
      mainLimit,
      crossLimit,
      parentRect,
      measureNode,
      true,
    );
    if (!planRes.ok) return planRes;
    const { mainSizes, measureMaxMain, precomputedSizes } = planRes.value;
    const crossPlanRes = planConstraintCrossSizes(
      axis,
      vnode.children,
      mainSizes,
      measureMaxMain,
      crossLimit,
      align,
      measureNode,
      precomputedSizes,
    );
    if (!crossPlanRes.ok) return crossPlanRes;
    const plannedSizes = crossPlanRes.value.sizes;
    const plannedCrossSizes = crossPlanRes.value.crossSizes;

    let usedMain = 0;
    for (let i = 0; i < mainSizes.length; i++) {
      usedMain += mainSizes[i] ?? 0;
    }
    usedMain += childCount <= 1 ? 0 : gap * (childCount - 1);
    const extra = clampNonNegative(mainLimit - usedMain);
    const startOffset = computeJustifyStartOffset(justify, extra, childCount);

    let cursorMain = mainOrigin + startOffset;
    let remainingMain = clampNonNegative(mainLimit - startOffset);
    let childOrdinal = 0;

    for (let i = 0; i < count; i++) {
      const child = vnode.children[i];
      if (!child || childHasAbsolutePosition(child)) continue;

      if (remainingMain === 0) {
        let precomputed = plannedSizes[i] ?? null;
        if (precomputed == null) {
          const zeroSizeRes = measureNodeOnAxis(axis, child, 0, 0, measureNode);
          if (!zeroSizeRes.ok) return zeroSizeRes;
          precomputed = zeroSizeRes.value;
          plannedSizes[i] = precomputed;
        }
        const childRes = layoutNodeOnAxis(
          axis,
          child,
          cursorMain,
          crossOrigin,
          0,
          0,
          layoutNode,
          null,
          null,
          precomputed,
        );
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
        maybePruneRemainingDirtySiblings(vnode.children, i, child, childRes.value);
        childOrdinal++;
        continue;
      }

      const main = mainSizes[i] ?? 0;
      const mm = measureMaxMain[i] ?? 0;
      let childSize = plannedSizes[i] ?? null;
      if (childSize == null) {
        const childSizeRes = measureNodeOnAxis(axis, child, mm, crossLimit, measureNode);
        if (!childSizeRes.ok) return childSizeRes;
        childSize = childSizeRes.value;
        plannedSizes[i] = childSize;
      }
      const childCross = plannedCrossSizes[i] ?? crossFromSize(axis, childSize);

      let childCrossPos = crossOrigin;
      let forceCross: number | null = null;
      const effectiveAlign = resolveEffectiveAlign(child, align);
      if (effectiveAlign === "center") {
        childCrossPos = crossOrigin + Math.floor((crossLimit - childCross) / 2);
      } else if (effectiveAlign === "end") {
        childCrossPos = crossOrigin + (crossLimit - childCross);
      } else if (effectiveAlign === "stretch") {
        forceCross = crossLimit;
      }

      const childRes = layoutNodeOnAxis(
        axis,
        child,
        cursorMain,
        childCrossPos,
        Math.max(mm, main),
        crossLimit,
        layoutNode,
        main,
        forceCross,
        childSize,
      );
      if (!childRes.ok) return childRes;
      children.push(childRes.value);
      maybePruneRemainingDirtySiblings(vnode.children, i, child, childRes.value);

      const hasNextChild = childOrdinal < childCount - 1;
      const extraGap = hasNextChild
        ? computeJustifyExtraGap(justify, extra, childCount, childOrdinal)
        : 0;
      const step = main + (hasNextChild ? gap + extraGap : 0);
      cursorMain = cursorMain + step;
      remainingMain = clampNonNegative(remainingMain - step);
      childOrdinal++;
    }
  }

  const contentRect: Rect = { x: cx, y: cy, w: cw, h: ch };
  for (let i = 0; i < count; i++) {
    const child = vnode.children[i];
    if (!child || !childHasAbsolutePosition(child)) continue;

    const naturalRes = measureNode(child, cw, ch, axis.axis);
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
      axis.axis,
      absRect.w,
      absRect.h,
      naturalRes.value,
    );
    if (!childRes.ok) return childRes;
    children.push(childRes.value);
  }

  const flowChildren = children.slice(0, childCount);
  const absChildren = children.slice(childCount);
  const orderedChildren: LayoutTree[] = [];
  let flowIndex = 0;
  let absIndex = 0;
  for (let i = 0; i < count; i++) {
    const child = vnode.children[i];
    if (!child) continue;
    if (childHasAbsolutePosition(child)) {
      const absChild = absChildren[absIndex];
      absIndex++;
      if (absChild) orderedChildren.push(absChild);
      continue;
    }
    const flowChild = flowChildren[flowIndex];
    flowIndex++;
    if (flowChild) orderedChildren.push(flowChild);
  }

  const { contentWidth, contentHeight } = measureContentBounds(orderedChildren, cx, cy);
  const overflow = resolveOverflow(propsRes.value, cw, ch, contentWidth, contentHeight);
  const shiftedChildren = shiftLayoutChildren(
    orderedChildren,
    -overflow.metadata.scrollX,
    -overflow.metadata.scrollY,
  );

  return ok({
    vnode,
    rect: { x: stackX, y: stackY, w: stackW, h: stackH },
    children: Object.freeze(shiftedChildren),
    meta: overflow.metadata,
  });
}
