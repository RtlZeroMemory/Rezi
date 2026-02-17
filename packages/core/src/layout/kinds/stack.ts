import type { VNode } from "../../index.js";
import { resolveLayoutConstraints } from "../constraints.js";
import { clampNonNegative, clampWithin, isPercentString, toFiniteMax } from "../engine/bounds.js";
import {
  type FlexItem,
  type Justify,
  computeJustifyExtraGap,
  computeJustifyStartOffset,
  distributeFlex,
} from "../engine/flex.js";
import {
  childHasFlexInMainAxis,
  childHasPercentInCrossAxis,
  childHasPercentInMainAxis,
  getConstraintProps,
} from "../engine/guards.js";
import { releaseArray } from "../engine/pool.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import {
  resolveMargin as resolveMarginProps,
  resolveSpacing as resolveSpacingProps,
} from "../spacing.js";
import type { Axis, Rect, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";
import { validateSpacerProps, validateStackProps } from "../validateProps.js";

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
) => LayoutResult<LayoutTree>;

function countNonEmptyChildren(children: readonly (VNode | undefined)[]): number {
  let count = 0;
  for (const child of children) {
    if (!child) continue;
    count++;
  }
  return count;
}

export function measureStackKinds(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "row": {
      const propsRes = validateStackProps("row", vnode.props);
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

      const hasFlexInMainAxis = vnode.children.some((c) => childHasFlexInMainAxis(c, "row"));
      const hasPercentInMainAxis = vnode.children.some((c) => childHasPercentInMainAxis(c, "row"));
      const needsConstraintPass = hasFlexInMainAxis || hasPercentInMainAxis;
      const fillMain = forcedW === null && hasPercentInMainAxis;
      const fillCross =
        forcedH === null && vnode.children.some((c) => childHasPercentInCrossAxis(c, "row"));
      const childCount = countNonEmptyChildren(vnode.children);

      const outerWLimit = forcedW ?? maxWCap;
      const outerHLimit = forcedH ?? maxHCap;

      const cw = clampNonNegative(outerWLimit - padX);
      const chLimit = clampNonNegative(outerHLimit - padY);

      let maxChildH = 0;
      let usedMainInConstraintPass = 0;

      if (needsConstraintPass) {
        const parentRect: Rect = { x: 0, y: 0, w: cw, h: chLimit };
        const gapTotal = childCount <= 1 ? 0 : gap * (childCount - 1);
        const availableForChildren = clampNonNegative(cw - gapTotal);

        const mainSizes = new Array(vnode.children.length).fill(0);
        const measureMaxMain = new Array(vnode.children.length).fill(0);

        const flexItems: FlexItem[] = [];
        let remaining = availableForChildren;

        for (let i = 0; i < vnode.children.length; i++) {
          const child = vnode.children[i];
          if (!child) continue;

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
              flexItems.push({ index: i, flex: sp.value.flex, min: sp.value.size, max: maxMain });
              continue;
            }

            const w = Math.min(sp.value.size, remaining);
            mainSizes[i] = w;
            measureMaxMain[i] = w;
            remaining = clampNonNegative(remaining - w);
            continue;
          }

          const childProps = getConstraintProps(child) ?? {};
          const resolved = resolveLayoutConstraints(childProps as never, parentRect);

          const fixedMain = resolved.width;
          const minMain = resolved.minWidth;
          const maxMain = Math.min(
            toFiniteMax(resolved.maxWidth, availableForChildren),
            availableForChildren,
          );
          const flex = resolved.flex;

          const rawMain = (childProps as { width?: unknown }).width;
          const mainIsPercent = isPercentString(rawMain);

          if (remaining === 0) {
            mainSizes[i] = 0;
            measureMaxMain[i] = 0;
            continue;
          }

          if (fixedMain !== null) {
            const desired = clampWithin(fixedMain, minMain, maxMain);
            const w = Math.min(desired, remaining);
            mainSizes[i] = w;
            measureMaxMain[i] = mainIsPercent ? cw : w;
            remaining = clampNonNegative(remaining - w);
            continue;
          }

          if (flex > 0) {
            flexItems.push({ index: i, flex, min: minMain, max: maxMain });
            continue;
          }

          const childRes = measureNode(child, remaining, chLimit, "row");
          if (!childRes.ok) return childRes;
          mainSizes[i] = childRes.value.w;
          measureMaxMain[i] = childRes.value.w;
          remaining = clampNonNegative(remaining - childRes.value.w);
        }

        if (flexItems.length > 0 && remaining > 0) {
          const alloc = distributeFlex(remaining, flexItems);
          for (let j = 0; j < flexItems.length; j++) {
            const it = flexItems[j];
            if (!it) continue;
            const size = alloc[j] ?? 0;
            mainSizes[it.index] = size;
            const childProps = getConstraintProps(vnode.children[it.index] as VNode) ?? {};
            const rawMain = (childProps as { width?: unknown }).width;
            measureMaxMain[it.index] = isPercentString(rawMain) ? cw : size;
          }
          releaseArray(alloc);
        }

        for (let i = 0; i < vnode.children.length; i++) {
          const child = vnode.children[i];
          if (!child) continue;
          const main = mainSizes[i] ?? 0;
          const mm = measureMaxMain[i] ?? 0;
          const sizeRes =
            main === 0 ? measureNode(child, 0, 0, "row") : measureNode(child, mm, chLimit, "row");
          if (!sizeRes.ok) return sizeRes;
          const childH = align === "stretch" ? chLimit : sizeRes.value.h;
          if (childH > maxChildH) maxChildH = childH;
        }

        for (let i = 0; i < mainSizes.length; i++) {
          usedMainInConstraintPass += mainSizes[i] ?? 0;
        }
        usedMainInConstraintPass += childCount <= 1 ? 0 : gap * (childCount - 1);
      } else {
        let remainingWidth = cw;
        let cursorX = 0;
        let laidOutCount = 0;

        for (const child of vnode.children) {
          if (!child) continue;
          if (remainingWidth === 0) {
            // Still validate subtree deterministically, even if it gets assigned {w:0,h:0}.
            const zeroRes = measureNode(child, 0, 0, "row");
            if (!zeroRes.ok) return zeroRes;
            continue;
          }

          const childSizeRes = measureNode(child, remainingWidth, chLimit, "row");
          if (!childSizeRes.ok) return childSizeRes;
          const childW = childSizeRes.value.w;
          const childH = align === "stretch" ? chLimit : childSizeRes.value.h;

          cursorX = cursorX + childW + gap;
          remainingWidth = clampNonNegative(remainingWidth - childW - gap);

          if (childW > 0 || childH > 0) laidOutCount++;
          if (childH > maxChildH) maxChildH = childH;
        }

        const usedWidthExcludingTrailingGap =
          laidOutCount === 0 ? 0 : clampNonNegative(cursorX - gap);
        const shrinkW = padX + Math.min(cw, usedWidthExcludingTrailingGap);
        const chosenW = forcedW ?? (fillMain ? maxWCap : Math.min(maxWCap, shrinkW));
        const chosenH = forcedH ?? (fillCross ? maxHCap : Math.min(maxHCap, padY + maxChildH));
        const innerW = clampWithin(chosenW, minW, maxWCap);
        const innerH = clampWithin(chosenH, minH, maxHCap);
        return ok({
          w: clampNonNegative(Math.min(maxW, innerW + marginX)),
          h: clampNonNegative(Math.min(maxH, innerH + marginY)),
        });
      }

      const shrinkW = padX + Math.min(cw, usedMainInConstraintPass);
      const chosenW = forcedW ?? (fillMain ? maxWCap : Math.min(maxWCap, shrinkW));
      const chosenH = forcedH ?? (fillCross ? maxHCap : Math.min(maxHCap, padY + maxChildH));
      const innerW = clampWithin(chosenW, minW, maxWCap);
      const innerH = clampWithin(chosenH, minH, maxHCap);
      return ok({
        w: clampNonNegative(Math.min(maxW, innerW + marginX)),
        h: clampNonNegative(Math.min(maxH, innerH + marginY)),
      });
    }
    case "column": {
      const propsRes = validateStackProps("column", vnode.props);
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

      const hasFlexInMainAxis = vnode.children.some((c) => childHasFlexInMainAxis(c, "column"));
      const hasPercentInMainAxis = vnode.children.some((c) =>
        childHasPercentInMainAxis(c, "column"),
      );
      const needsConstraintPass = hasFlexInMainAxis || hasPercentInMainAxis;
      const fillMain = forcedH === null && hasPercentInMainAxis;
      const fillCross =
        forcedW === null && vnode.children.some((c) => childHasPercentInCrossAxis(c, "column"));
      const childCount = countNonEmptyChildren(vnode.children);

      const outerWLimit = forcedW ?? maxWCap;
      const outerHLimit = forcedH ?? maxHCap;

      const cw = clampNonNegative(outerWLimit - padX);
      const ch = clampNonNegative(outerHLimit - padY);

      let maxChildW = 0;
      let usedMainInConstraintPass = 0;

      if (needsConstraintPass) {
        const parentRect: Rect = { x: 0, y: 0, w: cw, h: ch };
        const gapTotal = childCount <= 1 ? 0 : gap * (childCount - 1);
        const availableForChildren = clampNonNegative(ch - gapTotal);

        const mainSizes = new Array(vnode.children.length).fill(0);
        const measureMaxMain = new Array(vnode.children.length).fill(0);

        const flexItems: FlexItem[] = [];
        let remaining = availableForChildren;

        for (let i = 0; i < vnode.children.length; i++) {
          const child = vnode.children[i];
          if (!child) continue;

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
              flexItems.push({ index: i, flex: sp.value.flex, min: sp.value.size, max: maxMain });
              continue;
            }

            const h = Math.min(sp.value.size, remaining);
            mainSizes[i] = h;
            measureMaxMain[i] = h;
            remaining = clampNonNegative(remaining - h);
            continue;
          }

          const childProps = getConstraintProps(child) ?? {};
          const resolved = resolveLayoutConstraints(childProps as never, parentRect);

          const fixedMain = resolved.height;
          const minMain = resolved.minHeight;
          const maxMain = Math.min(
            toFiniteMax(resolved.maxHeight, availableForChildren),
            availableForChildren,
          );
          const flex = resolved.flex;

          const rawMain = (childProps as { height?: unknown }).height;
          const mainIsPercent = isPercentString(rawMain);

          if (remaining === 0) {
            mainSizes[i] = 0;
            measureMaxMain[i] = 0;
            continue;
          }

          if (fixedMain !== null) {
            const desired = clampWithin(fixedMain, minMain, maxMain);
            const h = Math.min(desired, remaining);
            mainSizes[i] = h;
            measureMaxMain[i] = mainIsPercent ? ch : h;
            remaining = clampNonNegative(remaining - h);
            continue;
          }

          if (flex > 0) {
            flexItems.push({ index: i, flex, min: minMain, max: maxMain });
            continue;
          }

          const childRes = measureNode(child, cw, remaining, "column");
          if (!childRes.ok) return childRes;
          mainSizes[i] = childRes.value.h;
          measureMaxMain[i] = childRes.value.h;
          remaining = clampNonNegative(remaining - childRes.value.h);
        }

        if (flexItems.length > 0 && remaining > 0) {
          const alloc = distributeFlex(remaining, flexItems);
          for (let j = 0; j < flexItems.length; j++) {
            const it = flexItems[j];
            if (!it) continue;
            const size = alloc[j] ?? 0;
            mainSizes[it.index] = size;
            const childProps = getConstraintProps(vnode.children[it.index] as VNode) ?? {};
            const rawMain = (childProps as { height?: unknown }).height;
            measureMaxMain[it.index] = isPercentString(rawMain) ? ch : size;
          }
          releaseArray(alloc);
        }

        for (let i = 0; i < vnode.children.length; i++) {
          const child = vnode.children[i];
          if (!child) continue;
          const main = mainSizes[i] ?? 0;
          const mm = measureMaxMain[i] ?? 0;
          const sizeRes =
            main === 0 ? measureNode(child, 0, 0, "column") : measureNode(child, cw, mm, "column");
          if (!sizeRes.ok) return sizeRes;
          const childW = align === "stretch" ? cw : sizeRes.value.w;
          if (childW > maxChildW) maxChildW = childW;
        }

        for (let i = 0; i < mainSizes.length; i++) {
          usedMainInConstraintPass += mainSizes[i] ?? 0;
        }
        usedMainInConstraintPass += childCount <= 1 ? 0 : gap * (childCount - 1);
      } else {
        let remainingHeight = ch;
        let cursorY = 0;
        let laidOutCount = 0;

        for (const child of vnode.children) {
          if (!child) continue;
          if (remainingHeight === 0) {
            // Still validate subtree deterministically, even if it gets assigned {w:0,h:0}.
            const zeroRes = measureNode(child, 0, 0, "column");
            if (!zeroRes.ok) return zeroRes;
            continue;
          }

          const childSizeRes = measureNode(child, cw, remainingHeight, "column");
          if (!childSizeRes.ok) return childSizeRes;
          const childW = align === "stretch" ? cw : childSizeRes.value.w;
          const childH = childSizeRes.value.h;

          cursorY = cursorY + childH + gap;
          remainingHeight = clampNonNegative(remainingHeight - childH - gap);

          if (childW > 0 || childH > 0) laidOutCount++;
          if (childW > maxChildW) maxChildW = childW;
        }

        const usedHeightExcludingTrailingGap =
          laidOutCount === 0 ? 0 : clampNonNegative(cursorY - gap);
        const shrinkH = padY + Math.min(ch, usedHeightExcludingTrailingGap);
        const chosenW = forcedW ?? (fillCross ? maxWCap : Math.min(maxWCap, padX + maxChildW));
        const chosenH = forcedH ?? (fillMain ? maxHCap : Math.min(maxHCap, shrinkH));
        const innerW = clampWithin(chosenW, minW, maxWCap);
        const innerH = clampWithin(chosenH, minH, maxHCap);
        return ok({
          w: clampNonNegative(Math.min(maxW, innerW + marginX)),
          h: clampNonNegative(Math.min(maxH, innerH + marginY)),
        });
      }

      const shrinkH = padY + Math.min(ch, usedMainInConstraintPass);
      const chosenW = forcedW ?? (fillCross ? maxWCap : Math.min(maxWCap, padX + maxChildW));
      const chosenH = forcedH ?? (fillMain ? maxHCap : Math.min(maxHCap, shrinkH));
      const innerW = clampWithin(chosenW, minW, maxWCap);
      const innerH = clampWithin(chosenH, minH, maxHCap);
      return ok({
        w: clampNonNegative(Math.min(maxW, innerW + marginX)),
        h: clampNonNegative(Math.min(maxH, innerH + marginY)),
      });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureStackKinds: unexpected vnode kind" },
      };
  }
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
  switch (vnode.kind) {
    case "row": {
      const propsRes = validateStackProps("row", vnode.props);
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

      const count = vnode.children.length;
      const childCount = countNonEmptyChildren(vnode.children);
      const children: LayoutTree[] = [];

      const needsConstraintPass = vnode.children.some(
        (c) => childHasFlexInMainAxis(c, "row") || childHasPercentInMainAxis(c, "row"),
      );

      if (!needsConstraintPass) {
        const mainSizes = new Array(count).fill(0);
        const crossSizes = new Array(count).fill(0);

        let rem = cw;
        for (let i = 0; i < count; i++) {
          const child = vnode.children[i];
          if (!child) continue;
          if (rem === 0) continue;

          const childSizeRes = measureNode(child, rem, ch, "row");
          if (!childSizeRes.ok) return childSizeRes;
          mainSizes[i] = childSizeRes.value.w;
          crossSizes[i] = childSizeRes.value.h;
          rem = clampNonNegative(rem - childSizeRes.value.w - gap);
        }

        let usedMain = 0;
        for (let i = 0; i < mainSizes.length; i++) {
          usedMain += mainSizes[i] ?? 0;
        }
        usedMain += childCount <= 1 ? 0 : gap * (childCount - 1);
        const extra = clampNonNegative(cw - usedMain);
        const startOffset = computeJustifyStartOffset(justify, extra, childCount);

        let cursorX = cx + startOffset;
        let remainingWidth = clampNonNegative(cw - startOffset);
        let childOrdinal = 0;

        for (let i = 0; i < count; i++) {
          const child = vnode.children[i];
          if (!child) continue;

          if (remainingWidth === 0) {
            const childRes = layoutNode(child, cursorX, cy, 0, 0, "row");
            if (!childRes.ok) return childRes;
            children.push(childRes.value);
            childOrdinal++;
            continue;
          }

          const childW = mainSizes[i] ?? 0;
          const childH = crossSizes[i] ?? 0;

          let childY = cy;
          let forceH: number | null = null;
          if (align === "center") {
            childY = cy + Math.floor((ch - childH) / 2);
          } else if (align === "end") {
            childY = cy + (ch - childH);
          } else if (align === "stretch") {
            forceH = ch;
          }

          const childRes = layoutNode(
            child,
            cursorX,
            childY,
            remainingWidth,
            ch,
            "row",
            null,
            forceH,
          );
          if (!childRes.ok) return childRes;
          children.push(childRes.value);

          const hasNextChild = childOrdinal < childCount - 1;
          const extraGap = hasNextChild
            ? computeJustifyExtraGap(justify, extra, childCount, childOrdinal)
            : 0;
          const step = childW + (hasNextChild ? gap + extraGap : 0);
          cursorX = cursorX + step;
          remainingWidth = clampNonNegative(remainingWidth - step);
          childOrdinal++;
        }
      } else {
        const parentRect: Rect = { x: 0, y: 0, w: cw, h: ch };
        const gapTotal = childCount <= 1 ? 0 : gap * (childCount - 1);
        const availableForChildren = clampNonNegative(cw - gapTotal);

        const mainSizes = new Array(vnode.children.length).fill(0);
        const measureMaxMain = new Array(vnode.children.length).fill(0);

        const flexItems: FlexItem[] = [];
        let remaining = availableForChildren;

        for (let i = 0; i < vnode.children.length; i++) {
          const child = vnode.children[i];
          if (!child) continue;

          if (child.kind === "spacer") {
            const sp = validateSpacerProps(child.props);
            if (!sp.ok) return sp;

            if (remaining === 0) {
              mainSizes[i] = 0;
              measureMaxMain[i] = 0;
              continue;
            }

            if (sp.value.flex > 0) {
              flexItems.push({
                index: i,
                flex: sp.value.flex,
                min: sp.value.size,
                max: availableForChildren,
              });
              continue;
            }

            const w = Math.min(sp.value.size, remaining);
            mainSizes[i] = w;
            measureMaxMain[i] = w;
            remaining = clampNonNegative(remaining - w);
            continue;
          }

          const childProps = getConstraintProps(child) ?? {};
          const resolved = resolveLayoutConstraints(childProps as never, parentRect);

          const fixedMain = resolved.width;
          const minMain = resolved.minWidth;
          const maxMain = Math.min(
            toFiniteMax(resolved.maxWidth, availableForChildren),
            availableForChildren,
          );
          const flex = resolved.flex;

          const rawMain = (childProps as { width?: unknown }).width;
          const mainIsPercent = isPercentString(rawMain);

          if (remaining === 0) {
            mainSizes[i] = 0;
            measureMaxMain[i] = 0;
            continue;
          }

          if (fixedMain !== null) {
            const desired = clampWithin(fixedMain, minMain, maxMain);
            const w = Math.min(desired, remaining);
            mainSizes[i] = w;
            measureMaxMain[i] = mainIsPercent ? cw : w;
            remaining = clampNonNegative(remaining - w);
            continue;
          }

          if (flex > 0) {
            flexItems.push({ index: i, flex, min: minMain, max: maxMain });
            continue;
          }

          const childRes = measureNode(child, remaining, ch, "row");
          if (!childRes.ok) return childRes;
          mainSizes[i] = childRes.value.w;
          measureMaxMain[i] = childRes.value.w;
          remaining = clampNonNegative(remaining - childRes.value.w);
        }

        if (flexItems.length > 0 && remaining > 0) {
          const alloc = distributeFlex(remaining, flexItems);
          for (let j = 0; j < flexItems.length; j++) {
            const it = flexItems[j];
            if (!it) continue;
            const size = alloc[j] ?? 0;
            mainSizes[it.index] = size;
            const child = vnode.children[it.index];
            if (child?.kind === "spacer") {
              measureMaxMain[it.index] = size;
              continue;
            }
            const childProps = getConstraintProps(child as VNode) ?? {};
            const rawMain = (childProps as { width?: unknown }).width;
            measureMaxMain[it.index] = isPercentString(rawMain) ? cw : size;
          }
          releaseArray(alloc);
        }

        let usedMain = 0;
        for (let i = 0; i < mainSizes.length; i++) {
          usedMain += mainSizes[i] ?? 0;
        }
        usedMain += childCount <= 1 ? 0 : gap * (childCount - 1);
        const extra = clampNonNegative(cw - usedMain);
        const startOffset = computeJustifyStartOffset(justify, extra, childCount);

        let cursorX = cx + startOffset;
        let remainingWidth = clampNonNegative(cw - startOffset);
        let childOrdinal = 0;

        for (let i = 0; i < count; i++) {
          const child = vnode.children[i];
          if (!child) continue;

          if (remainingWidth === 0) {
            const childRes = layoutNode(child, cursorX, cy, 0, 0, "row");
            if (!childRes.ok) return childRes;
            children.push(childRes.value);
            childOrdinal++;
            continue;
          }

          const main = mainSizes[i] ?? 0;
          const mm = measureMaxMain[i] ?? 0;

          const childSizeRes = measureNode(child, mm, ch, "row");
          if (!childSizeRes.ok) return childSizeRes;
          const childH = childSizeRes.value.h;

          let childY = cy;
          let forceH: number | null = null;
          if (align === "center") {
            childY = cy + Math.floor((ch - childH) / 2);
          } else if (align === "end") {
            childY = cy + (ch - childH);
          } else if (align === "stretch") {
            forceH = ch;
          }

          const childRes = layoutNode(child, cursorX, childY, mm, ch, "row", main, forceH);
          if (!childRes.ok) return childRes;
          children.push(childRes.value);

          const hasNextChild = childOrdinal < childCount - 1;
          const extraGap = hasNextChild
            ? computeJustifyExtraGap(justify, extra, childCount, childOrdinal)
            : 0;
          const step = main + (hasNextChild ? gap + extraGap : 0);
          cursorX = cursorX + step;
          remainingWidth = clampNonNegative(remainingWidth - step);
          childOrdinal++;
        }
      }

      return ok({
        vnode,
        rect: { x: stackX, y: stackY, w: stackW, h: stackH },
        children: Object.freeze(children),
      });
    }
    case "column": {
      const propsRes = validateStackProps("column", vnode.props);
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

      const count = vnode.children.length;
      const childCount = countNonEmptyChildren(vnode.children);
      const children: LayoutTree[] = [];

      const needsConstraintPass = vnode.children.some(
        (c) => childHasFlexInMainAxis(c, "column") || childHasPercentInMainAxis(c, "column"),
      );

      if (!needsConstraintPass) {
        const mainSizes = new Array(count).fill(0);
        const crossSizes = new Array(count).fill(0);

        let rem = ch;
        for (let i = 0; i < count; i++) {
          const child = vnode.children[i];
          if (!child) continue;
          if (rem === 0) continue;

          const childSizeRes = measureNode(child, cw, rem, "column");
          if (!childSizeRes.ok) return childSizeRes;
          crossSizes[i] = childSizeRes.value.w;
          mainSizes[i] = childSizeRes.value.h;
          rem = clampNonNegative(rem - childSizeRes.value.h - gap);
        }

        let usedMain = 0;
        for (let i = 0; i < mainSizes.length; i++) {
          usedMain += mainSizes[i] ?? 0;
        }
        usedMain += childCount <= 1 ? 0 : gap * (childCount - 1);
        const extra = clampNonNegative(ch - usedMain);
        const startOffset = computeJustifyStartOffset(justify, extra, childCount);

        let cursorY = cy + startOffset;
        let remainingHeight = clampNonNegative(ch - startOffset);
        let childOrdinal = 0;

        for (let i = 0; i < count; i++) {
          const child = vnode.children[i];
          if (!child) continue;

          if (remainingHeight === 0) {
            const childRes = layoutNode(child, cx, cursorY, 0, 0, "column");
            if (!childRes.ok) return childRes;
            children.push(childRes.value);
            childOrdinal++;
            continue;
          }

          const childW = crossSizes[i] ?? 0;
          const childH = mainSizes[i] ?? 0;

          let childX = cx;
          let forceW: number | null = null;
          if (align === "center") {
            childX = cx + Math.floor((cw - childW) / 2);
          } else if (align === "end") {
            childX = cx + (cw - childW);
          } else if (align === "stretch") {
            forceW = cw;
          }

          const childRes = layoutNode(
            child,
            childX,
            cursorY,
            cw,
            remainingHeight,
            "column",
            forceW,
            null,
          );
          if (!childRes.ok) return childRes;
          children.push(childRes.value);

          const hasNextChild = childOrdinal < childCount - 1;
          const extraGap = hasNextChild
            ? computeJustifyExtraGap(justify, extra, childCount, childOrdinal)
            : 0;
          const step = childH + (hasNextChild ? gap + extraGap : 0);
          cursorY = cursorY + step;
          remainingHeight = clampNonNegative(remainingHeight - step);
          childOrdinal++;
        }
      } else {
        const parentRect: Rect = { x: 0, y: 0, w: cw, h: ch };
        const gapTotal = childCount <= 1 ? 0 : gap * (childCount - 1);
        const availableForChildren = clampNonNegative(ch - gapTotal);

        const mainSizes = new Array(vnode.children.length).fill(0);
        const measureMaxMain = new Array(vnode.children.length).fill(0);

        const flexItems: FlexItem[] = [];
        let remaining = availableForChildren;

        for (let i = 0; i < vnode.children.length; i++) {
          const child = vnode.children[i];
          if (!child) continue;

          if (child.kind === "spacer") {
            const sp = validateSpacerProps(child.props);
            if (!sp.ok) return sp;

            if (remaining === 0) {
              mainSizes[i] = 0;
              measureMaxMain[i] = 0;
              continue;
            }

            if (sp.value.flex > 0) {
              flexItems.push({
                index: i,
                flex: sp.value.flex,
                min: sp.value.size,
                max: availableForChildren,
              });
              continue;
            }

            const h = Math.min(sp.value.size, remaining);
            mainSizes[i] = h;
            measureMaxMain[i] = h;
            remaining = clampNonNegative(remaining - h);
            continue;
          }

          const childProps = getConstraintProps(child) ?? {};
          const resolved = resolveLayoutConstraints(childProps as never, parentRect);

          const fixedMain = resolved.height;
          const minMain = resolved.minHeight;
          const maxMain = Math.min(
            toFiniteMax(resolved.maxHeight, availableForChildren),
            availableForChildren,
          );
          const flex = resolved.flex;

          const rawMain = (childProps as { height?: unknown }).height;
          const mainIsPercent = isPercentString(rawMain);

          if (remaining === 0) {
            mainSizes[i] = 0;
            measureMaxMain[i] = 0;
            continue;
          }

          if (fixedMain !== null) {
            const desired = clampWithin(fixedMain, minMain, maxMain);
            const h = Math.min(desired, remaining);
            mainSizes[i] = h;
            measureMaxMain[i] = mainIsPercent ? ch : h;
            remaining = clampNonNegative(remaining - h);
            continue;
          }

          if (flex > 0) {
            flexItems.push({ index: i, flex, min: minMain, max: maxMain });
            continue;
          }

          const childRes = measureNode(child, cw, remaining, "column");
          if (!childRes.ok) return childRes;
          mainSizes[i] = childRes.value.h;
          measureMaxMain[i] = childRes.value.h;
          remaining = clampNonNegative(remaining - childRes.value.h);
        }

        if (flexItems.length > 0 && remaining > 0) {
          const alloc = distributeFlex(remaining, flexItems);
          for (let j = 0; j < flexItems.length; j++) {
            const it = flexItems[j];
            if (!it) continue;
            const size = alloc[j] ?? 0;
            mainSizes[it.index] = size;
            const child = vnode.children[it.index];
            if (child?.kind === "spacer") {
              measureMaxMain[it.index] = size;
              continue;
            }
            const childProps = getConstraintProps(child as VNode) ?? {};
            const rawMain = (childProps as { height?: unknown }).height;
            measureMaxMain[it.index] = isPercentString(rawMain) ? ch : size;
          }
          releaseArray(alloc);
        }

        let usedMain = 0;
        for (let i = 0; i < mainSizes.length; i++) {
          usedMain += mainSizes[i] ?? 0;
        }
        usedMain += childCount <= 1 ? 0 : gap * (childCount - 1);
        const extra = clampNonNegative(ch - usedMain);
        const startOffset = computeJustifyStartOffset(justify, extra, childCount);

        let cursorY = cy + startOffset;
        let remainingHeight = clampNonNegative(ch - startOffset);
        let childOrdinal = 0;

        for (let i = 0; i < count; i++) {
          const child = vnode.children[i];
          if (!child) continue;

          if (remainingHeight === 0) {
            const childRes = layoutNode(child, cx, cursorY, 0, 0, "column");
            if (!childRes.ok) return childRes;
            children.push(childRes.value);
            childOrdinal++;
            continue;
          }

          const main = mainSizes[i] ?? 0;
          const mm = measureMaxMain[i] ?? 0;

          const childSizeRes = measureNode(child, cw, mm, "column");
          if (!childSizeRes.ok) return childSizeRes;
          const childW = childSizeRes.value.w;

          let childX = cx;
          let forceW: number | null = null;
          if (align === "center") {
            childX = cx + Math.floor((cw - childW) / 2);
          } else if (align === "end") {
            childX = cx + (cw - childW);
          } else if (align === "stretch") {
            forceW = cw;
          }

          const childRes = layoutNode(child, childX, cursorY, cw, mm, "column", forceW, main);
          if (!childRes.ok) return childRes;
          children.push(childRes.value);

          const hasNextChild = childOrdinal < childCount - 1;
          const extraGap = hasNextChild
            ? computeJustifyExtraGap(justify, extra, childCount, childOrdinal)
            : 0;
          const step = main + (hasNextChild ? gap + extraGap : 0);
          cursorY = cursorY + step;
          remainingHeight = clampNonNegative(remainingHeight - step);
          childOrdinal++;
        }
      }

      return ok({
        vnode,
        rect: { x: stackX, y: stackY, w: stackW, h: stackH },
        children: Object.freeze(children),
      });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutStackKinds: unexpected vnode kind" },
      };
  }
}
