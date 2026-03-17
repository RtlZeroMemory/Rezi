import type { VNode } from "../../../widgets/types.js";
import { resolveLayoutConstraints } from "../../constraints.js";
import {
  clampNonNegative,
  clampWithin,
  isPercentString,
  toFiniteMax,
} from "../../engine/bounds.js";
import { distributeInteger } from "../../engine/distributeInteger.js";
import { type FlexItem, distributeFlex } from "../../engine/flex.js";
import { childHasAbsolutePosition, getConstraintProps } from "../../engine/guards.js";
import { acquireArray, releaseArray } from "../../engine/pool.js";
import { ok } from "../../engine/result.js";
import type { Rect, Size } from "../../types.js";
import type { LayoutResult } from "../../validateProps.js";
import { validateSpacerProps } from "../../validateProps.js";
import type { AxisConfig } from "./axis.js";
import { crossFromSize, crossFromWH, mainFromSize, mainFromWH } from "./axis.js";
import type { ConstraintPropBag, MeasureNodeFn } from "./shared.js";
import { measureNodeOnAxis } from "./shared.js";

export type WrapLineMetrics = Readonly<{
  main: number;
  cross: number;
}>;

export type WrapLineChildLayout = Readonly<{
  child: VNode;
  main: number;
  measureMaxMain: number;
  cross: number;
}>;

export type WrapLineLayout = Readonly<{
  children: readonly WrapLineChildLayout[];
  main: number;
  cross: number;
}>;

const FEEDBACK_COMPLEX_LEAF_KINDS: ReadonlySet<VNode["kind"]> = new Set([
  "table",
  "virtualList",
  "codeEditor",
  "diffViewer",
  "logsConsole",
]);

const crossFeedbackPotentialCache = new WeakMap<VNode, boolean>();

export function childMayNeedCrossAxisFeedback(vnode: VNode): boolean {
  const hit = crossFeedbackPotentialCache.get(vnode);
  if (hit !== undefined) return hit;

  let out = false;
  if (vnode.kind === "text") {
    out = (vnode.props as { wrap?: unknown }).wrap === true;
  } else if (FEEDBACK_COMPLEX_LEAF_KINDS.has(vnode.kind)) {
    out = true;
  } else if ("children" in vnode) {
    const children = vnode.children as readonly (VNode | undefined)[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!child) continue;
      if (childMayNeedCrossAxisFeedback(child)) {
        out = true;
        break;
      }
    }
  }

  crossFeedbackPotentialCache.set(vnode, out);
  return out;
}

function parseMainPercentWeight(value: unknown): number | null {
  if (!isPercentString(value)) return null;
  const raw = Number.parseFloat(value.slice(0, -1));
  if (!Number.isFinite(raw)) return null;
  return raw;
}

export function maybeRebalanceNearFullPercentChildren(
  axis: AxisConfig,
  children: readonly (VNode | undefined)[],
  mainSizes: number[],
  measureMaxMain: number[],
  availableForChildren: number,
  parentRect: Rect,
): void {
  if (availableForChildren <= 0) return;

  const indices: number[] = [];
  const percentWeights: number[] = [];
  const flexWeights: number[] = [];
  let percentSum = 0;
  let hasFlexChildren = false;
  let hasNonFlexChildren = false;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || childHasAbsolutePosition(child)) continue;
    if (child.kind === "spacer") return;

    const childProps = getConstraintProps(child) ?? {};
    const rawMain = (childProps as ConstraintPropBag)[axis.mainProp];
    const percent = parseMainPercentWeight(rawMain);
    if (percent === null) return;

    const resolved = resolveLayoutConstraints(childProps as never, parentRect, axis.axis);
    if (resolved.flex > 0) {
      hasFlexChildren = true;
      flexWeights.push(resolved.flex);
    } else {
      hasNonFlexChildren = true;
      flexWeights.push(0);
    }
    if (resolved[axis.minMainProp] > 0) return;
    const maxMain = toFiniteMax(resolved[axis.maxMainProp], availableForChildren);
    if (maxMain < availableForChildren) return;

    indices.push(i);
    percentWeights.push(percent);
    percentSum += percent;
  }

  if (indices.length <= 1) return;
  if (hasFlexChildren && !hasNonFlexChildren) {
    // For flex rows where all children also declare percent widths (for example 100%+100%),
    // legacy fixed-size planning can collapse later siblings to zero. Rebalance only when
    // collapse happened so normal flex-percentage cases keep their existing sizing behavior.
    let hasCollapsedSibling = false;
    for (let i = 0; i < indices.length; i++) {
      const slot = indices[i];
      if (slot === undefined) continue;
      if ((mainSizes[slot] ?? 0) <= 0) {
        hasCollapsedSibling = true;
        break;
      }
    }
    if (!hasCollapsedSibling) return;

    const flexAlloc = distributeInteger(availableForChildren, flexWeights);
    for (let i = 0; i < indices.length; i++) {
      const slot = indices[i];
      if (slot === undefined) continue;
      const next = flexAlloc[i] ?? 0;
      mainSizes[slot] = next;
      measureMaxMain[slot] = Math.max(measureMaxMain[slot] ?? 0, next);
    }
    return;
  }

  if (hasFlexChildren) return;
  // Only normalize near-full percentage groups (e.g. 33/33/33).
  if (percentSum < 99 || percentSum > 101) return;

  const alloc = distributeInteger(availableForChildren, percentWeights);
  for (let i = 0; i < indices.length; i++) {
    const slot = indices[i];
    if (slot === undefined) continue;
    const next = alloc[i] ?? 0;
    mainSizes[slot] = next;
    measureMaxMain[slot] = Math.max(measureMaxMain[slot] ?? 0, next);
  }
}

export function probeWrapChildMain(
  axis: AxisConfig,
  child: VNode,
  cw: number,
  ch: number,
  parentRect: Rect,
  measureNode: MeasureNodeFn,
): LayoutResult<number> {
  const mainLimit = mainFromWH(axis, cw, ch);
  const crossLimit = crossFromWH(axis, cw, ch);

  if (child.kind === "spacer") {
    const sp = validateSpacerProps(child.props);
    if (!sp.ok) return sp;
    return ok(Math.min(sp.value.size, mainLimit));
  }

  const childProps = getConstraintProps(child) ?? {};
  const resolved = resolveLayoutConstraints(childProps as never, parentRect, axis.axis);

  const fixedMain = resolved[axis.mainProp];
  const minMain = Math.min(resolved[axis.minMainProp], mainLimit);
  const maxMain = Math.min(toFiniteMax(resolved[axis.maxMainProp], mainLimit), mainLimit);
  const flex = resolved.flex;

  if (fixedMain !== null) return ok(clampWithin(fixedMain, minMain, maxMain));
  if (flex > 0) return ok(Math.min(minMain, maxMain));

  const childRes = measureNodeOnAxis(axis, child, mainLimit, crossLimit, measureNode);
  if (!childRes.ok) return childRes;
  return ok(Math.min(mainFromSize(axis, childRes.value), maxMain));
}

function computeWrapConstraintLine(
  axis: AxisConfig,
  lineChildren: readonly VNode[],
  cw: number,
  ch: number,
  gap: number,
  parentRect: Rect,
  measureNode: MeasureNodeFn,
  includeChildren: boolean,
): LayoutResult<WrapLineMetrics | WrapLineLayout> {
  const lineChildCount = lineChildren.length;
  if (lineChildCount === 0) {
    if (includeChildren) return ok({ children: Object.freeze([]), main: 0, cross: 0 });
    return ok({ main: 0, cross: 0 });
  }

  const mainLimit = mainFromWH(axis, cw, ch);
  const crossLimit = crossFromWH(axis, cw, ch);
  const gapTotal = lineChildCount <= 1 ? 0 : gap * (lineChildCount - 1);
  const availableForChildren = clampNonNegative(mainLimit - gapTotal);

  const mainSizes = acquireArray(lineChildCount);
  const measureMaxMain = acquireArray(lineChildCount);
  const crossSizes = includeChildren ? acquireArray(lineChildCount) : null;
  const crossPass1 = acquireArray(lineChildCount);

  try {
    const flexItems: FlexItem[] = [];
    let remaining = availableForChildren;

    for (let i = 0; i < lineChildCount; i++) {
      const child = lineChildren[i];
      if (!child || childHasAbsolutePosition(child)) continue;

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

        const size = Math.min(sp.value.size, remaining);
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
        const size = Math.min(desired, remaining);
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
      remaining = clampNonNegative(remaining - childMain);
    }

    if (flexItems.length > 0 && remaining > 0) {
      const alloc = distributeFlex(remaining, flexItems);
      for (let j = 0; j < flexItems.length; j++) {
        const it = flexItems[j];
        if (!it) continue;
        const size = alloc[j] ?? 0;
        mainSizes[it.index] = size;
        const child = lineChildren[it.index];
        if (child?.kind === "spacer") {
          measureMaxMain[it.index] = size;
          continue;
        }
        const childProps = getConstraintProps(child as VNode) ?? {};
        const rawMain = (childProps as ConstraintPropBag)[axis.mainProp];
        measureMaxMain[it.index] = isPercentString(rawMain) ? mainLimit : size;
      }
      releaseArray(alloc);
    }

    maybeRebalanceNearFullPercentChildren(
      axis,
      lineChildren,
      mainSizes,
      measureMaxMain,
      availableForChildren,
      parentRect,
    );

    let lineMain = 0;
    for (let i = 0; i < lineChildCount; i++) {
      lineMain += mainSizes[i] ?? 0;
    }
    lineMain += lineChildCount <= 1 ? 0 : gap * (lineChildCount - 1);

    let lineCross = 0;
    const sizeCache = new Array<Size | null>(lineChildCount).fill(null);
    const mayFeedback = new Array<boolean>(lineChildCount).fill(false);
    let feedbackCandidate = false;

    for (let i = 0; i < lineChildCount; i++) {
      const child = lineChildren[i];
      if (!child || childHasAbsolutePosition(child)) continue;
      const main = mainSizes[i] ?? 0;
      const mm = measureMaxMain[i] ?? 0;
      const childSizeRes =
        main === 0
          ? measureNodeOnAxis(axis, child, 0, 0, measureNode)
          : measureNodeOnAxis(axis, child, mm, crossLimit, measureNode);
      if (!childSizeRes.ok) return childSizeRes;
      const childCross = crossFromSize(axis, childSizeRes.value);
      if (crossSizes) crossSizes[i] = childCross;
      sizeCache[i] = childSizeRes.value;
      const childProps = getConstraintProps(child) ?? {};
      const rawMain = (childProps as ConstraintPropBag)[axis.mainProp];
      const needsFeedback =
        main > 0 &&
        mm !== main &&
        !isPercentString(rawMain) &&
        childMayNeedCrossAxisFeedback(child);
      mayFeedback[i] = needsFeedback;
      crossPass1[i] = childCross;
      if (needsFeedback) feedbackCandidate = true;
      if (childCross > lineCross) lineCross = childCross;
    }

    if (feedbackCandidate) {
      lineCross = 0;
      for (let i = 0; i < lineChildCount; i++) {
        const child = lineChildren[i];
        if (!child || childHasAbsolutePosition(child)) continue;

        const needsFeedback = mayFeedback[i] === true;
        let size = sizeCache[i] ?? null;
        if (needsFeedback) {
          const main = mainSizes[i] ?? 0;
          const nextSizeRes =
            main === 0
              ? measureNodeOnAxis(axis, child, 0, 0, measureNode)
              : measureNodeOnAxis(axis, child, main, crossLimit, measureNode);
          if (!nextSizeRes.ok) return nextSizeRes;
          const nextCross = crossFromSize(axis, nextSizeRes.value);
          if (nextCross !== (crossPass1[i] ?? 0)) {
            size = nextSizeRes.value;
            sizeCache[i] = size;
            if (crossSizes) crossSizes[i] = nextCross;
            crossPass1[i] = nextCross;
          }
        }

        const cross =
          crossSizes?.[i] ?? crossPass1[i] ?? (size === null ? 0 : crossFromSize(axis, size));
        if (cross > lineCross) lineCross = cross;
      }
    }

    if (!includeChildren) return ok({ main: lineMain, cross: lineCross });

    const plannedChildren: WrapLineChildLayout[] = [];
    for (let i = 0; i < lineChildCount; i++) {
      const child = lineChildren[i];
      if (!child || childHasAbsolutePosition(child)) continue;
      plannedChildren.push({
        child,
        main: mainSizes[i] ?? 0,
        measureMaxMain: measureMaxMain[i] ?? 0,
        cross: crossSizes?.[i] ?? 0,
      });
    }

    return ok({
      children: Object.freeze(plannedChildren),
      main: lineMain,
      cross: lineCross,
    });
  } finally {
    releaseArray(mainSizes);
    releaseArray(measureMaxMain);
    if (crossSizes) releaseArray(crossSizes);
    releaseArray(crossPass1);
  }
}

export function measureWrapConstraintLine(
  axis: AxisConfig,
  lineChildren: readonly VNode[],
  cw: number,
  ch: number,
  gap: number,
  parentRect: Rect,
  measureNode: MeasureNodeFn,
): LayoutResult<WrapLineMetrics> {
  const lineRes = computeWrapConstraintLine(
    axis,
    lineChildren,
    cw,
    ch,
    gap,
    parentRect,
    measureNode,
    false,
  );
  if (!lineRes.ok) return lineRes;
  return ok(lineRes.value as WrapLineMetrics);
}

export function planWrapConstraintLine(
  axis: AxisConfig,
  lineChildren: readonly VNode[],
  cw: number,
  ch: number,
  gap: number,
  parentRect: Rect,
  measureNode: MeasureNodeFn,
): LayoutResult<WrapLineLayout> {
  const lineRes = computeWrapConstraintLine(
    axis,
    lineChildren,
    cw,
    ch,
    gap,
    parentRect,
    measureNode,
    true,
  );
  if (!lineRes.ok) return lineRes;
  return ok(lineRes.value as WrapLineLayout);
}
