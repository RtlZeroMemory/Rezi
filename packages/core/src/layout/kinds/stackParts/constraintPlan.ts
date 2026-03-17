import type { VNode } from "../../../widgets/types.js";
import { resolveLayoutConstraints } from "../../constraints.js";
import {
  clampNonNegative,
  clampWithin,
  isPercentString,
  toFiniteMax,
} from "../../engine/bounds.js";
import { type FlexItem, distributeFlex, shrinkFlex } from "../../engine/flex.js";
import { childHasAbsolutePosition, getConstraintProps } from "../../engine/guards.js";
import { measureMaxContent, measureMinContent } from "../../engine/intrinsic.js";
import { acquireArray, releaseArray } from "../../engine/pool.js";
import { ok } from "../../engine/result.js";
import { resolveResponsiveValue } from "../../responsive.js";
import type { Rect, Size } from "../../types.js";
import type { LayoutResult } from "../../validateProps.js";
import { validateSpacerProps } from "../../validateProps.js";
import type { AxisConfig } from "./axis.js";
import { crossFromSize, mainFromSize } from "./axis.js";
import type { ConstraintPropBag, EffectiveAlign, FlexPropBag, MeasureNodeFn } from "./shared.js";
import { measureNodeOnAxis, resolveEffectiveAlign } from "./shared.js";
import { childMayNeedCrossAxisFeedback, maybeRebalanceNearFullPercentChildren } from "./wrap.js";

export type ConstraintPassPlan = Readonly<{
  mainSizes: number[];
  measureMaxMain: number[];
  precomputedSizes: (Size | null)[];
}>;

export type ConstraintCrossPlan = Readonly<{
  sizes: (Size | null)[];
  crossSizes: number[];
  maxCross: number;
}>;

export function planConstraintMainSizes(
  axis: AxisConfig,
  children: readonly (VNode | undefined)[],
  availableForChildren: number,
  mainLimit: number,
  crossLimit: number,
  parentRect: Rect,
  measureNode: MeasureNodeFn,
  collectPrecomputed: boolean,
): LayoutResult<ConstraintPassPlan> {
  const mainSizes = new Array(children.length).fill(0);
  const measureMaxMain = new Array(children.length).fill(0);
  const precomputedSizes = new Array<Size | null>(children.length).fill(null);

  let hasAdvancedFlex = false;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || child.kind === "spacer") continue;
    const props = getConstraintProps(child) as FlexPropBag | null;
    if (!props) continue;
    const rawShrink = props.flexShrink;
    const rawBasis = props.flexBasis;
    if (
      (typeof rawShrink === "number" && Number.isFinite(rawShrink) && rawShrink > 0) ||
      rawBasis !== undefined
    ) {
      hasAdvancedFlex = true;
      break;
    }
  }

  // Preserve legacy planning semantics when advanced flex-shrink/basis is not used.
  if (!hasAdvancedFlex) {
    const flexItems: FlexItem[] = [];
    const reservedMainByIndex = new Array<number>(children.length + 1).fill(0);
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const downstreamReserved = reservedMainByIndex[i + 1] ?? 0;
      if (!child || childHasAbsolutePosition(child)) {
        reservedMainByIndex[i] = downstreamReserved;
        continue;
      }
      if (child.kind === "spacer") {
        const sp = validateSpacerProps(child.props);
        if (!sp.ok) return sp;
        reservedMainByIndex[i] = downstreamReserved + Math.max(0, sp.value.size);
        continue;
      }
      const childProps = getConstraintProps(child) ?? {};
      const resolved = resolveLayoutConstraints(childProps as never, parentRect, axis.axis);
      const fixedMain = resolved[axis.mainProp];
      const minMain = resolved[axis.minMainProp];
      const maxMain = Math.min(
        toFiniteMax(resolved[axis.maxMainProp], availableForChildren),
        availableForChildren,
      );
      const required =
        fixedMain !== null || resolved.flex > 0 ? clampWithin(minMain, 0, maxMain) : 0;
      reservedMainByIndex[i] = downstreamReserved + required;
    }
    let remaining = availableForChildren;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child || childHasAbsolutePosition(child)) continue;
      const reserveForLater = reservedMainByIndex[i + 1] ?? 0;
      const budgetAfterReserve =
        reserveForLater <= remaining ? clampNonNegative(remaining - reserveForLater) : remaining;

      if (child.kind === "spacer") {
        const sp = validateSpacerProps(child.props);
        if (!sp.ok) return sp;

        const maxMain = availableForChildren;
        if (remaining === 0) {
          mainSizes[i] = 0;
          measureMaxMain[i] = 0;
          continue;
        }

        if (sp.value.flex > 0) {
          flexItems.push({
            index: i,
            flex: sp.value.flex,
            shrink: 0,
            basis: 0,
            min: sp.value.size,
            max: maxMain,
          });
          continue;
        }

        const size = Math.min(sp.value.size, budgetAfterReserve);
        mainSizes[i] = size;
        measureMaxMain[i] = size;
        remaining = clampNonNegative(remaining - size);
        continue;
      }

      const childProps = getConstraintProps(child) ?? {};
      const resolved = resolveLayoutConstraints(childProps as never, parentRect, axis.axis);

      const fixedMain = resolved[axis.mainProp];
      const minMain = resolved[axis.minMainProp];
      const maxMain = Math.min(
        toFiniteMax(resolved[axis.maxMainProp], availableForChildren),
        availableForChildren,
      );
      const flex = resolved.flex;

      const rawMain = (childProps as ConstraintPropBag)[axis.mainProp];
      const mainIsPercent = isPercentString(rawMain);

      if (remaining === 0) {
        mainSizes[i] = 0;
        measureMaxMain[i] = 0;
        continue;
      }

      if (fixedMain !== null) {
        const desired = clampWithin(fixedMain, minMain, maxMain);
        const size = Math.min(desired, budgetAfterReserve);
        mainSizes[i] = size;
        measureMaxMain[i] = mainIsPercent ? mainLimit : size;
        remaining = clampNonNegative(remaining - size);
        continue;
      }

      if (flex > 0) {
        flexItems.push({
          index: i,
          flex,
          shrink: 0,
          basis: 0,
          min: minMain,
          max: maxMain,
        });
        continue;
      }

      const childRes = measureNodeOnAxis(axis, child, remaining, crossLimit, measureNode);
      if (!childRes.ok) return childRes;
      const childMain = mainFromSize(axis, childRes.value);
      mainSizes[i] = childMain;
      measureMaxMain[i] = childMain;
      if (collectPrecomputed) precomputedSizes[i] = childRes.value;
      remaining = clampNonNegative(remaining - childMain);
    }

    if (flexItems.length > 0 && remaining > 0) {
      const alloc = distributeFlex(remaining, flexItems);
      for (let j = 0; j < flexItems.length; j++) {
        const it = flexItems[j];
        if (!it) continue;
        const size = alloc[j] ?? 0;
        mainSizes[it.index] = size;
        const child = children[it.index];
        if (child?.kind === "spacer") {
          measureMaxMain[it.index] = size;
        } else if (child) {
          const childProps = getConstraintProps(child) ?? {};
          const rawMain = (childProps as ConstraintPropBag)[axis.mainProp];
          measureMaxMain[it.index] = isPercentString(rawMain) ? mainLimit : size;
        }
        if (collectPrecomputed) precomputedSizes[it.index] = null;
      }
      releaseArray(alloc);
    }

    maybeRebalanceNearFullPercentChildren(
      axis,
      children,
      mainSizes,
      measureMaxMain,
      availableForChildren,
      parentRect,
    );

    return ok({
      mainSizes,
      measureMaxMain,
      precomputedSizes,
    });
  }

  // Advanced path: supports flexShrink/flexBasis while keeping legacy defaults.
  const minMains = acquireArray(children.length);
  const maxMains = acquireArray(children.length);
  maxMains.fill(availableForChildren, 0, children.length);
  const shrinkFactors = acquireArray(children.length);
  const reservedMainByIndex = new Array<number>(children.length + 1).fill(0);

  try {
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const downstreamReserved = reservedMainByIndex[i + 1] ?? 0;
      if (!child || childHasAbsolutePosition(child)) {
        reservedMainByIndex[i] = downstreamReserved;
        continue;
      }

      if (child.kind === "spacer") {
        const sp = validateSpacerProps(child.props);
        if (!sp.ok) return sp;
        reservedMainByIndex[i] = downstreamReserved + Math.max(0, sp.value.size);
        continue;
      }

      const childProps = (getConstraintProps(child) ?? {}) as Record<string, unknown> & FlexPropBag;
      const resolved = resolveLayoutConstraints(childProps as never, parentRect, axis.axis);
      const fixedMain = resolved[axis.mainProp];
      const minMain = resolved[axis.minMainProp];
      const maxMain = Math.min(
        toFiniteMax(resolved[axis.maxMainProp], availableForChildren),
        availableForChildren,
      );
      const required =
        fixedMain !== null || resolved.flex > 0 ? clampWithin(minMain, 0, maxMain) : 0;
      reservedMainByIndex[i] = downstreamReserved + required;
    }

    const growItems: FlexItem[] = [];
    let totalMain = 0;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child || childHasAbsolutePosition(child)) continue;
      const reserveForLater = reservedMainByIndex[i + 1] ?? 0;
      const remainingBudget = clampNonNegative(availableForChildren - totalMain);
      const budgetAfterReserve =
        reserveForLater <= remainingBudget
          ? clampNonNegative(remainingBudget - reserveForLater)
          : remainingBudget;

      if (child.kind === "spacer") {
        const sp = validateSpacerProps(child.props);
        if (!sp.ok) return sp;

        const basis = sp.value.flex > 0 ? 0 : Math.min(sp.value.size, budgetAfterReserve);
        mainSizes[i] = basis;
        measureMaxMain[i] = basis;
        minMains[i] = 0;
        maxMains[i] = availableForChildren;
        shrinkFactors[i] = 0;
        totalMain += basis;

        if (sp.value.flex > 0) {
          growItems.push({
            index: i,
            flex: sp.value.flex,
            shrink: 0,
            basis: 0,
            min: sp.value.size,
            max: availableForChildren,
          });
        }
        continue;
      }

      const childProps = (getConstraintProps(child) ?? {}) as Record<string, unknown> & FlexPropBag;
      const resolved = resolveLayoutConstraints(childProps as never, parentRect, axis.axis);

      const fixedMain = resolved[axis.mainProp];
      const maxMain = Math.min(
        toFiniteMax(resolved[axis.maxMainProp], availableForChildren),
        availableForChildren,
      );
      let minMain = Math.min(resolved[axis.minMainProp], availableForChildren);

      const rawMain = childProps[axis.mainProp];
      const rawMinMain = childProps[axis.minMainProp];
      const rawFlexBasis = childProps.flexBasis;
      const mainPercent = isPercentString(rawMain);
      const flexBasisIsAuto = resolveResponsiveValue(rawFlexBasis) === "auto";

      if (rawMinMain === undefined && resolved.flexShrink > 0) {
        const intrinsicMinRes = measureMinContent(child, axis.axis, measureNode);
        if (!intrinsicMinRes.ok) return intrinsicMinRes;
        const intrinsicMain = mainFromSize(axis, intrinsicMinRes.value);
        minMain = Math.max(minMain, Math.min(intrinsicMain, availableForChildren));
      }

      const normalizedMinMain = Math.min(minMain, maxMain);
      minMains[i] = normalizedMinMain;
      maxMains[i] = maxMain;
      shrinkFactors[i] = resolved.flexShrink;

      let measuredSize: Size | null = null;
      let basis: number;
      if (fixedMain !== null) {
        basis = clampWithin(fixedMain, normalizedMinMain, maxMain);
      } else if (resolved.flexBasis !== null) {
        basis = clampWithin(resolved.flexBasis, normalizedMinMain, maxMain);
      } else if (flexBasisIsAuto) {
        const intrinsicMaxRes = measureMaxContent(child, axis.axis, measureNode);
        if (!intrinsicMaxRes.ok) return intrinsicMaxRes;
        const intrinsicMain = mainFromSize(axis, intrinsicMaxRes.value);
        basis = clampWithin(intrinsicMain, normalizedMinMain, maxMain);
      } else if (resolved.flex > 0) {
        basis = 0;
      } else {
        const childRes = measureNodeOnAxis(
          axis,
          child,
          availableForChildren,
          crossLimit,
          measureNode,
        );
        if (!childRes.ok) return childRes;
        measuredSize = childRes.value;
        basis = clampWithin(mainFromSize(axis, childRes.value), normalizedMinMain, maxMain);
      }
      const reserveForLaterMins =
        fixedMain !== null &&
        resolved.flex === 0 &&
        resolved.flexShrink <= 0 &&
        resolved.flexBasis === null;
      if (reserveForLaterMins) {
        basis = Math.min(basis, budgetAfterReserve);
      }

      mainSizes[i] = basis;
      measureMaxMain[i] = mainPercent ? mainLimit : basis;
      if (collectPrecomputed && measuredSize !== null) precomputedSizes[i] = measuredSize;
      totalMain += basis;

      if (fixedMain === null && resolved.flex > 0) {
        const growMin = Math.max(0, normalizedMinMain - basis);
        const growCap = Math.max(0, maxMain - basis);
        growItems.push({
          index: i,
          flex: resolved.flex,
          shrink: 0,
          basis: 0,
          min: growMin,
          max: growCap,
        });
      }
    }

    let didResize = false;
    const growRemaining = availableForChildren - totalMain;
    if (growItems.length > 0 && growRemaining > 0) {
      const alloc = distributeFlex(growRemaining, growItems);
      for (let i = 0; i < growItems.length; i++) {
        const item = growItems[i];
        if (!item) continue;
        const add = alloc[i] ?? 0;
        if (add <= 0) continue;
        const current = mainSizes[item.index] ?? 0;
        const next = Math.min(maxMains[item.index] ?? availableForChildren, current + add);
        if (next !== current) didResize = true;
        mainSizes[item.index] = next;
      }
      releaseArray(alloc);
    }

    totalMain = 0;
    for (let i = 0; i < mainSizes.length; i++) {
      totalMain += mainSizes[i] ?? 0;
    }

    if (totalMain > availableForChildren) {
      const shrinkItems: FlexItem[] = [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!child || childHasAbsolutePosition(child)) continue;
        shrinkItems.push({
          index: i,
          flex: 0,
          shrink: shrinkFactors[i] ?? 0,
          basis: mainSizes[i] ?? 0,
          min: minMains[i] ?? 0,
          max: maxMains[i] ?? availableForChildren,
        });
      }
      if (shrinkItems.length > 0) {
        const shrunk = shrinkFlex(availableForChildren, shrinkItems);
        for (let i = 0; i < shrinkItems.length; i++) {
          const item = shrinkItems[i];
          if (!item) continue;
          const current = mainSizes[item.index] ?? 0;
          const next = clampWithin(shrunk[i] ?? 0, item.min, item.max);
          if (next !== current) didResize = true;
          mainSizes[item.index] = next;
        }
        releaseArray(shrunk);
      }
    }

    for (let i = 0; i < children.length; i++) {
      if (!children[i]) continue;
      if (didResize && collectPrecomputed) precomputedSizes[i] = null;
    }

    maybeRebalanceNearFullPercentChildren(
      axis,
      children,
      mainSizes,
      measureMaxMain,
      availableForChildren,
      parentRect,
    );

    return ok({
      mainSizes,
      measureMaxMain,
      precomputedSizes,
    });
  } finally {
    releaseArray(minMains);
    releaseArray(maxMains);
    releaseArray(shrinkFactors);
  }
}

export function planConstraintCrossSizes(
  axis: AxisConfig,
  children: readonly (VNode | undefined)[],
  mainSizes: readonly number[],
  measureMaxMain: readonly number[],
  crossLimit: number,
  align: EffectiveAlign,
  measureNode: MeasureNodeFn,
  seedSizes?: readonly (Size | null)[],
): LayoutResult<ConstraintCrossPlan> {
  const sizes = (seedSizes ?? []).slice();
  if (sizes.length < children.length) {
    sizes.length = children.length;
  }
  const crossSizes = new Array<number>(children.length).fill(0);
  const feedbackCandidates = new Array<boolean>(children.length).fill(false);
  let hasFeedbackCandidate = false;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || childHasAbsolutePosition(child)) continue;

    const main = mainSizes[i] ?? 0;
    const mm = measureMaxMain[i] ?? 0;
    let size = sizes[i] ?? null;
    if (size === null) {
      const firstRes =
        main === 0
          ? measureNodeOnAxis(axis, child, 0, 0, measureNode)
          : measureNodeOnAxis(axis, child, mm, crossLimit, measureNode);
      if (!firstRes.ok) return firstRes;
      size = firstRes.value;
      sizes[i] = size;
    }

    crossSizes[i] = crossFromSize(axis, size);
    const childProps = getConstraintProps(child) ?? {};
    const rawMain = (childProps as ConstraintPropBag)[axis.mainProp];
    const candidate =
      main > 0 && mm !== main && !isPercentString(rawMain) && childMayNeedCrossAxisFeedback(child);
    feedbackCandidates[i] = candidate;
    if (candidate) hasFeedbackCandidate = true;
  }

  if (hasFeedbackCandidate) {
    for (let i = 0; i < children.length; i++) {
      if (feedbackCandidates[i] !== true) continue;
      const child = children[i];
      if (!child || childHasAbsolutePosition(child)) continue;

      const main = mainSizes[i] ?? 0;
      const secondRes =
        main === 0
          ? measureNodeOnAxis(axis, child, 0, 0, measureNode)
          : measureNodeOnAxis(axis, child, main, crossLimit, measureNode);
      if (!secondRes.ok) return secondRes;
      const nextCross = crossFromSize(axis, secondRes.value);
      if (nextCross !== (crossSizes[i] ?? 0)) {
        sizes[i] = secondRes.value;
        crossSizes[i] = nextCross;
      }
    }
  }

  let maxCross = 0;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || childHasAbsolutePosition(child)) continue;
    const effectiveAlign = resolveEffectiveAlign(child, align);
    const cross = effectiveAlign === "stretch" ? crossLimit : (crossSizes[i] ?? 0);
    if (cross > maxCross) maxCross = cross;
  }

  return ok({ sizes, crossSizes, maxCross });
}
