import type { VNode } from "../../../widgets/types.js";
import { resolveLayoutConstraints } from "../../constraints.js";
import { clampNonNegative, clampWithin, toFiniteMax } from "../../engine/bounds.js";
import { childHasAbsolutePosition, childHasFlexInMainAxis } from "../../engine/guards.js";
import { ok } from "../../engine/result.js";
import {
  resolveMargin as resolveMarginProps,
  resolveSpacing as resolveSpacingProps,
} from "../../spacing.js";
import type { Rect, Size } from "../../types.js";
import type { LayoutResult } from "../../validateProps.js";
import { validateStackProps } from "../../validateProps.js";
import type { AxisConfig } from "./axis.js";
import { crossFromSize, crossFromWH, mainFromSize, mainFromWH, toWH } from "./axis.js";
import { planConstraintCrossSizes, planConstraintMainSizes } from "./constraintPlan.js";
import type { MeasureNodeFn, StackVNode } from "./shared.js";
import {
  childHasAdvancedFlexProps,
  countNonEmptyChildren,
  isWrapEnabled,
  measureNodeOnAxis,
  resolveEffectiveAlign,
} from "./shared.js";
import { measureWrapConstraintLine, probeWrapChildMain } from "./wrap.js";

export function measureStack(
  axis: AxisConfig,
  vnode: StackVNode,
  maxW: number,
  maxH: number,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const propsRes = validateStackProps(axis.axis, vnode.props);
  if (!propsRes.ok) return propsRes;
  const { gap, align } = propsRes.value;
  const spacing = resolveSpacingProps(propsRes.value);
  const margin = resolveMarginProps(propsRes.value);
  const padX = spacing.left + spacing.right;
  const padY = spacing.top + spacing.bottom;
  const marginX = margin.left + margin.right;
  const marginY = margin.top + margin.bottom;
  const innerMaxW = clampNonNegative(maxW - marginX);
  const innerMaxH = clampNonNegative(maxH - marginY);

  const self = resolveLayoutConstraints(
    propsRes.value,
    {
      x: 0,
      y: 0,
      w: innerMaxW,
      h: innerMaxH,
    },
    axis.axis,
  );
  const maxWCap = clampNonNegative(Math.min(innerMaxW, toFiniteMax(self.maxWidth, innerMaxW)));
  const maxHCap = clampNonNegative(Math.min(innerMaxH, toFiniteMax(self.maxHeight, innerMaxH)));

  const minW = Math.min(self.minWidth, maxWCap);
  const minH = Math.min(self.minHeight, maxHCap);

  const forcedW = self.width === null ? null : clampWithin(self.width, minW, maxWCap);
  const forcedH = self.height === null ? null : clampWithin(self.height, minH, maxHCap);

  const forcedMain = axis.axis === "row" ? forcedW : forcedH;
  const forcedCross = axis.axis === "row" ? forcedH : forcedW;
  const minMain = axis.axis === "row" ? minW : minH;
  const minCross = axis.axis === "row" ? minH : minW;
  const maxMainCap = axis.axis === "row" ? maxWCap : maxHCap;
  const maxCrossCap = axis.axis === "row" ? maxHCap : maxWCap;
  const padMain = axis.axis === "row" ? padX : padY;
  const padCross = axis.axis === "row" ? padY : padX;

  const hasFlexInMainAxis = vnode.children.some(
    (c) => !childHasAbsolutePosition(c) && childHasFlexInMainAxis(c, axis.axis),
  );
  const hasAdvancedFlexChildren = vnode.children.some(
    (c) => !childHasAbsolutePosition(c) && childHasAdvancedFlexProps(c),
  );
  const needsConstraintPass = hasFlexInMainAxis || hasAdvancedFlexChildren;
  const childCount = countNonEmptyChildren(vnode.children);

  const outerWLimit = forcedW ?? maxWCap;
  const outerHLimit = forcedH ?? maxHCap;
  const cw = clampNonNegative(outerWLimit - padX);
  const ch = clampNonNegative(outerHLimit - padY);
  const mainLimit = mainFromWH(axis, cw, ch);
  const crossLimit = crossFromWH(axis, cw, ch);

  const finalizeSize = (contentMain: number, contentCross: number): LayoutResult<Size> => {
    const chosenMain = forcedMain ?? Math.min(maxMainCap, padMain + contentMain);
    const chosenCross = forcedCross ?? Math.min(maxCrossCap, padCross + contentCross);
    const innerMain = clampWithin(chosenMain, minMain, maxMainCap);
    const innerCross = clampWithin(chosenCross, minCross, maxCrossCap);
    const { w: innerW, h: innerH } = toWH(axis, innerMain, innerCross);
    return ok({
      w: clampNonNegative(Math.min(maxW, innerW + marginX)),
      h: clampNonNegative(Math.min(maxH, innerH + marginY)),
    });
  };

  const wrap = isWrapEnabled(vnode.props);
  if (wrap) {
    let maxLineMain = 0;
    let totalCross = 0;
    let lineCount = 0;

    if (needsConstraintPass) {
      const parentRect: Rect = { x: 0, y: 0, w: cw, h: ch };
      const lineChildren: VNode[] = [];
      let lineProbeMain = 0;

      for (let i = 0; i < vnode.children.length; i++) {
        const child = vnode.children[i];
        if (!child || childHasAbsolutePosition(child)) continue;

        const probeMainRes = probeWrapChildMain(axis, child, cw, ch, parentRect, measureNode);
        if (!probeMainRes.ok) return probeMainRes;
        const probeMain = probeMainRes.value;

        const wouldOverflow =
          lineChildren.length > 0 && lineProbeMain + gap + probeMain > mainLimit;
        if (wouldOverflow) {
          const lineRes = measureWrapConstraintLine(
            axis,
            lineChildren,
            cw,
            ch,
            gap,
            parentRect,
            measureNode,
          );
          if (!lineRes.ok) return lineRes;
          if (lineCount > 0) totalCross += gap;
          totalCross += lineRes.value.cross;
          if (lineRes.value.main > maxLineMain) maxLineMain = lineRes.value.main;
          lineCount++;
          lineChildren.length = 0;
          lineProbeMain = 0;
        }

        if (lineChildren.length === 0) lineProbeMain = probeMain;
        else lineProbeMain += gap + probeMain;
        lineChildren.push(child);
      }

      if (lineChildren.length > 0) {
        const lineRes = measureWrapConstraintLine(
          axis,
          lineChildren,
          cw,
          ch,
          gap,
          parentRect,
          measureNode,
        );
        if (!lineRes.ok) return lineRes;
        if (lineCount > 0) totalCross += gap;
        totalCross += lineRes.value.cross;
        if (lineRes.value.main > maxLineMain) maxLineMain = lineRes.value.main;
      }
    } else {
      let lineMain = 0;
      let lineCross = 0;
      let lineItems = 0;

      for (let i = 0; i < vnode.children.length; i++) {
        const child = vnode.children[i];
        if (!child || childHasAbsolutePosition(child)) continue;

        const childSizeRes = measureNode(child, cw, ch, axis.axis);
        if (!childSizeRes.ok) return childSizeRes;
        const childMain = mainFromSize(axis, childSizeRes.value);
        const childCross = crossFromSize(axis, childSizeRes.value);

        const wouldOverflow = lineItems > 0 && lineMain + gap + childMain > mainLimit;
        if (wouldOverflow) {
          if (lineCount > 0) totalCross += gap;
          totalCross += lineCross;
          if (lineMain > maxLineMain) maxLineMain = lineMain;
          lineCount++;
          lineMain = 0;
          lineCross = 0;
          lineItems = 0;
        }

        if (lineItems === 0) lineMain = childMain;
        else lineMain += gap + childMain;
        if (childCross > lineCross) lineCross = childCross;
        lineItems++;
      }

      if (lineItems > 0) {
        if (lineCount > 0) totalCross += gap;
        totalCross += lineCross;
        if (lineMain > maxLineMain) maxLineMain = lineMain;
      }
    }

    return finalizeSize(maxLineMain, totalCross);
  }

  let maxChildCross = 0;
  let usedMainInConstraintPass = 0;

  if (needsConstraintPass) {
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
      false,
    );
    if (!planRes.ok) return planRes;
    const { mainSizes, measureMaxMain } = planRes.value;
    const crossPlanRes = planConstraintCrossSizes(
      axis,
      vnode.children,
      mainSizes,
      measureMaxMain,
      crossLimit,
      align,
      measureNode,
    );
    if (!crossPlanRes.ok) return crossPlanRes;
    maxChildCross = crossPlanRes.value.maxCross;

    for (let i = 0; i < mainSizes.length; i++) {
      usedMainInConstraintPass += mainSizes[i] ?? 0;
    }
    usedMainInConstraintPass += childCount <= 1 ? 0 : gap * (childCount - 1);
  } else {
    let remainingMain = mainLimit;
    let cursorMain = 0;
    let laidOutCount = 0;

    for (const child of vnode.children) {
      if (!child || childHasAbsolutePosition(child)) continue;
      if (remainingMain === 0) {
        // Still validate subtree deterministically, even if it gets assigned {w:0,h:0}.
        const zeroRes = measureNodeOnAxis(axis, child, 0, 0, measureNode);
        if (!zeroRes.ok) return zeroRes;
        const zeroCross = crossFromSize(axis, zeroRes.value);
        if (zeroCross > 0) laidOutCount++;
        if (zeroCross > maxChildCross) maxChildCross = zeroCross;
        continue;
      }

      const childSizeRes = measureNodeOnAxis(axis, child, remainingMain, crossLimit, measureNode);
      if (!childSizeRes.ok) return childSizeRes;
      const childMain = mainFromSize(axis, childSizeRes.value);
      const effectiveAlign = resolveEffectiveAlign(child, align);
      const childCross =
        effectiveAlign === "stretch" ? crossLimit : crossFromSize(axis, childSizeRes.value);

      cursorMain = cursorMain + childMain + gap;
      remainingMain = clampNonNegative(remainingMain - childMain - gap);

      if (childMain > 0 || childCross > 0) laidOutCount++;
      if (childCross > maxChildCross) maxChildCross = childCross;
    }

    const usedMainExcludingTrailingGap =
      laidOutCount === 0 ? 0 : clampNonNegative(cursorMain - gap);
    return finalizeSize(Math.min(mainLimit, usedMainExcludingTrailingGap), maxChildCross);
  }

  return finalizeSize(Math.min(mainLimit, usedMainInConstraintPass), maxChildCross);
}
