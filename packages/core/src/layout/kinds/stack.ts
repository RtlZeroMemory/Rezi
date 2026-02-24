import type { VNode } from "../../widgets/types.js";
import {
  measureContentBounds,
  resolveAbsolutePosition,
  resolveLayoutConstraints,
  resolveOverflow,
} from "../constraints.js";
import { clampNonNegative, clampWithin, isPercentString, toFiniteMax } from "../engine/bounds.js";
import { getActiveDirtySet } from "../engine/dirtySet.js";
import { distributeInteger } from "../engine/distributeInteger.js";
import {
  type FlexItem,
  type Justify,
  computeJustifyExtraGap,
  computeJustifyStartOffset,
  distributeFlex,
  shrinkFlex,
} from "../engine/flex.js";
import {
  childHasAbsolutePosition,
  childHasFlexInMainAxis,
  childHasPercentInCrossAxis,
  childHasPercentInMainAxis,
  getConstraintProps,
} from "../engine/guards.js";
import { measureMaxContent, measureMinContent } from "../engine/intrinsic.js";
import { releaseArray } from "../engine/pool.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import { resolveResponsiveValue } from "../responsive.js";
import {
  resolveMargin as resolveMarginProps,
  resolveSpacing as resolveSpacingProps,
} from "../spacing.js";
import type { Axis, Rect, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";
import { validateSpacerProps, validateStackProps } from "../validateProps.js";

type MeasureNodeFn = (vnode: VNode, maxW: number, maxH: number, axis: Axis) => LayoutResult<Size>;
type StackVNode = Extract<VNode, { kind: "row" | "column" }>;

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

type AxisConfig = Readonly<{
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

const ROW_AXIS: AxisConfig = Object.freeze({
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

const COL_AXIS: AxisConfig = Object.freeze({
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

type ConstraintPropBag = Readonly<{
  width?: unknown;
  height?: unknown;
  alignSelf?: unknown;
}>;

type FlexPropBag = Readonly<{
  flexShrink?: unknown;
  flexBasis?: unknown;
}>;

type EffectiveAlign = "start" | "center" | "end" | "stretch";

function resolveEffectiveAlign(child: VNode, align: EffectiveAlign): EffectiveAlign {
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

function childHasAdvancedFlexProps(vnode: unknown): boolean {
  const props = getConstraintProps(vnode) as FlexPropBag | null;
  if (!props) return false;
  const rawShrink = props.flexShrink;
  if (typeof rawShrink === "number" && Number.isFinite(rawShrink) && rawShrink > 0) {
    return true;
  }
  return props.flexBasis !== undefined;
}

function getAxisConfig(kind: VNode["kind"]): AxisConfig | null {
  switch (kind) {
    case "row":
      return ROW_AXIS;
    case "column":
      return COL_AXIS;
    default:
      return null;
  }
}

function isStackVNode(vnode: VNode): vnode is StackVNode {
  return vnode.kind === "row" || vnode.kind === "column";
}

function mainFromWH(axis: AxisConfig, w: number, h: number): number {
  return axis.mainSize === "w" ? w : h;
}

function crossFromWH(axis: AxisConfig, w: number, h: number): number {
  return axis.crossSize === "w" ? w : h;
}

function mainFromSize(axis: AxisConfig, size: Size): number {
  return axis.mainSize === "w" ? size.w : size.h;
}

function crossFromSize(axis: AxisConfig, size: Size): number {
  return axis.crossSize === "w" ? size.w : size.h;
}

function toWH(axis: AxisConfig, main: number, cross: number): Readonly<{ w: number; h: number }> {
  if (axis.mainSize === "w") return { w: main, h: cross };
  return { w: cross, h: main };
}

function toXY(axis: AxisConfig, main: number, cross: number): Readonly<{ x: number; y: number }> {
  if (axis.mainPos === "x") return { x: main, y: cross };
  return { x: cross, y: main };
}

function measureNodeOnAxis(
  axis: AxisConfig,
  child: VNode,
  maxMain: number,
  maxCross: number,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  const { w, h } = toWH(axis, maxMain, maxCross);
  return measureNode(child, w, h, axis.axis);
}

function layoutNodeOnAxis(
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

function countNonEmptyChildren(children: readonly (VNode | undefined)[]): number {
  let count = 0;
  for (const child of children) {
    if (!child || childHasAbsolutePosition(child)) continue;
    count++;
  }
  return count;
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

type WrapLineMetrics = Readonly<{
  main: number;
  cross: number;
}>;

type WrapLineChildLayout = Readonly<{
  child: VNode;
  main: number;
  measureMaxMain: number;
  cross: number;
}>;

type WrapLineLayout = Readonly<{
  children: readonly WrapLineChildLayout[];
  main: number;
  cross: number;
}>;

const previousChildSizeCache = new WeakMap<VNode, Size>();

function recordChildLayoutSize(child: VNode, layout: LayoutTree): void {
  previousChildSizeCache.set(child, { w: layout.rect.w, h: layout.rect.h });
}

function maybePruneRemainingDirtySiblings(
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

function isWrapEnabled(props: unknown): boolean {
  if (typeof props !== "object" || props === null) return false;
  return (props as { wrap?: unknown }).wrap === true;
}

const FEEDBACK_COMPLEX_LEAF_KINDS: ReadonlySet<VNode["kind"]> = new Set([
  "table",
  "virtualList",
  "codeEditor",
  "diffViewer",
  "logsConsole",
]);

const crossFeedbackPotentialCache = new WeakMap<VNode, boolean>();

function childMayNeedCrossAxisFeedback(vnode: VNode): boolean {
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

function maybeRebalanceNearFullPercentChildren(
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

function probeWrapChildMain(
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

  const mainSizes = new Array(lineChildCount).fill(0);
  const measureMaxMain = new Array(lineChildCount).fill(0);
  const crossSizes = includeChildren ? new Array(lineChildCount).fill(0) : null;

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
  for (let i = 0; i < mainSizes.length; i++) {
    lineMain += mainSizes[i] ?? 0;
  }
  lineMain += lineChildCount <= 1 ? 0 : gap * (lineChildCount - 1);

  let lineCross = 0;
  const sizeCache = new Array<Size | null>(lineChildCount).fill(null);
  const mayFeedback = new Array<boolean>(lineChildCount).fill(false);
  const crossPass1 = new Array<number>(lineChildCount).fill(0);
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
      main > 0 && mm !== main && !isPercentString(rawMain) && childMayNeedCrossAxisFeedback(child);
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
}

function measureWrapConstraintLine(
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

function planWrapConstraintLine(
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

type ConstraintPassPlan = Readonly<{
  mainSizes: number[];
  measureMaxMain: number[];
  precomputedSizes: (Size | null)[];
}>;

type ConstraintCrossPlan = Readonly<{
  sizes: (Size | null)[];
  crossSizes: number[];
  maxCross: number;
}>;

function planConstraintMainSizes(
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
    let remaining = availableForChildren;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
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
  const minMains = new Array<number>(children.length).fill(0);
  const maxMains = new Array<number>(children.length).fill(availableForChildren);
  const shrinkFactors = new Array<number>(children.length).fill(0);

  const growItems: FlexItem[] = [];
  let totalMain = 0;

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (!child || childHasAbsolutePosition(child)) continue;

    if (child.kind === "spacer") {
      const sp = validateSpacerProps(child.props);
      if (!sp.ok) return sp;

      const basis = sp.value.flex > 0 ? 0 : sp.value.size;
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
}

function planConstraintCrossSizes(
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

function measureStack(
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
  const hasPercentInMainAxis = vnode.children.some(
    (c) => !childHasAbsolutePosition(c) && childHasPercentInMainAxis(c, axis.axis),
  );
  const hasAdvancedFlexProps = vnode.children.some(
    (c) => !childHasAbsolutePosition(c) && childHasAdvancedFlexProps(c),
  );
  const needsConstraintPass = hasFlexInMainAxis || hasPercentInMainAxis || hasAdvancedFlexProps;
  const fillMain = forcedMain === null && hasPercentInMainAxis;
  const fillCross =
    forcedCross === null &&
    vnode.children.some(
      (c) => !childHasAbsolutePosition(c) && childHasPercentInCrossAxis(c, axis.axis),
    );
  const childCount = countNonEmptyChildren(vnode.children);

  const outerWLimit = forcedW ?? maxWCap;
  const outerHLimit = forcedH ?? maxHCap;
  const cw = clampNonNegative(outerWLimit - padX);
  const ch = clampNonNegative(outerHLimit - padY);
  const mainLimit = mainFromWH(axis, cw, ch);
  const crossLimit = crossFromWH(axis, cw, ch);

  const finalizeSize = (contentMain: number, contentCross: number): LayoutResult<Size> => {
    const chosenMain =
      forcedMain ?? (fillMain ? maxMainCap : Math.min(maxMainCap, padMain + contentMain));
    const chosenCross =
      forcedCross ?? (fillCross ? maxCrossCap : Math.min(maxCrossCap, padCross + contentCross));
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

export function measureStackKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  void axis;
  if (!isStackVNode(vnode)) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureStackKinds: unexpected vnode kind" },
    };
  }
  const stackAxis = getAxisConfig(vnode.kind);
  if (stackAxis === null) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureStackKinds: unexpected vnode kind" },
    };
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
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutStackKinds: unexpected vnode kind" },
    };
  }
  const stackAxis = getAxisConfig(vnode.kind);
  if (stackAxis === null) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutStackKinds: unexpected vnode kind" },
    };
  }
  return layoutStack(stackAxis, vnode, x, y, rectW, rectH, measureNode, layoutNode);
}

function layoutStack(
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
      (childHasFlexInMainAxis(c, axis.axis) ||
        childHasPercentInMainAxis(c, axis.axis) ||
        childHasAdvancedFlexProps(c)),
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
    const mainSizes = new Array(count).fill(0);
    const crossSizes = new Array(count).fill(0);

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
        let precomputed = plannedSizes[i];
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
      let childSize = plannedSizes[i];
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

  const { contentWidth, contentHeight } = measureContentBounds(children, cx, cy);
  const overflow = resolveOverflow(propsRes.value, cw, ch, contentWidth, contentHeight);
  const shiftedChildren = shiftLayoutChildren(
    children,
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
