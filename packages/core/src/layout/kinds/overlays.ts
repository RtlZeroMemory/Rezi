import { TOAST_HEIGHT } from "../../widgets/toast.js";
import type { VNode } from "../../widgets/types.js";
import { clampNonNegative, clampWithin } from "../engine/bounds.js";
import { isVNode } from "../engine/guards.js";
import { ok } from "../engine/result.js";
import type { LayoutTree } from "../engine/types.js";
import { measureTextCells } from "../textMeasure.js";
import type { Axis, Rect, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";

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

const I32_MAX = 2147483647;

type SyntheticColumnCacheEntry = Readonly<{
  childrenRef: readonly VNode[];
  columnNode: VNode;
}>;

const syntheticColumnCache = new WeakMap<VNode, SyntheticColumnCacheEntry>();

type VNodeWithChildren = VNode & Readonly<{ children: readonly VNode[] }>;

function getSyntheticColumn(vnode: VNodeWithChildren): VNode {
  const hit = syntheticColumnCache.get(vnode);
  if (hit && hit.childrenRef === vnode.children) return hit.columnNode;

  const columnNode: VNode = { kind: "column", props: { gap: 0 }, children: vnode.children };
  syntheticColumnCache.set(vnode, Object.freeze({ childrenRef: vnode.children, columnNode }));
  return columnNode;
}

type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

function readNonNegativeInt(raw: unknown, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return fallback;
  }
  const truncated = Math.trunc(raw);
  if (truncated < 0) {
    return 0;
  }
  if (truncated > I32_MAX) {
    return I32_MAX;
  }
  return truncated;
}

function readToastPosition(raw: unknown): ToastPosition {
  switch (raw) {
    case "top-left":
    case "top-center":
    case "top-right":
    case "bottom-left":
    case "bottom-center":
    case "bottom-right":
      return raw;
    default:
      return "bottom-right";
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function hasFrameBorder(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const border = (raw as { border?: unknown }).border;
  if (!border || typeof border !== "object") return false;
  const rgb = border as { r?: unknown; g?: unknown; b?: unknown };
  return isFiniteNumber(rgb.r) && isFiniteNumber(rgb.g) && isFiniteNumber(rgb.b);
}

export function measureOverlays(
  vnode: VNode,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
): LayoutResult<Size> {
  switch (vnode.kind) {
    case "focusZone":
    case "focusTrap": {
      if (vnode.children.length === 0) {
        return ok({ w: 0, h: 0 });
      }
      if (vnode.children.length === 1) {
        // Truly transparent: forward to single child.
        const child = vnode.children[0];
        if (!child) return ok({ w: 0, h: 0 });
        return measureNode(child, maxW, maxH, axis);
      }

      // Multi-child fallback (deprecated): wrap children in an explicit row/column.
      const columnNode = getSyntheticColumn(vnode);
      const innerRes = measureNode(columnNode, maxW, maxH, "column");
      if (!innerRes.ok) return innerRes;
      return ok({ w: innerRes.value.w, h: innerRes.value.h });
    }
    case "layers": {
      // Layers container: size is determined by the largest child.
      // Children are stacked on top of each other, not laid out sequentially.
      if (vnode.children.length === 0) {
        return ok({ w: 0, h: 0 });
      }

      let maxChildW = 0;
      let maxChildH = 0;

      for (const child of vnode.children) {
        const childRes = measureNode(child, maxW, maxH, axis);
        if (!childRes.ok) return childRes;
        if (childRes.value.w > maxChildW) maxChildW = childRes.value.w;
        if (childRes.value.h > maxChildH) maxChildH = childRes.value.h;
      }

      return ok({ w: maxChildW, h: maxChildH });
    }
    case "modal": {
      // Modals are positioned absolutely - they don't affect parent size.
      // Return the full available space as modal will be centered.
      return ok({ w: maxW, h: maxH });
    }
    case "dropdown": {
      // Dropdowns are positioned absolutely relative to anchor.
      // Don't contribute to parent size.
      return ok({ w: 0, h: 0 });
    }
    case "layer": {
      // Generic layers fill available space.
      return ok({ w: maxW, h: maxH });
    }
    case "commandPalette": {
      // Command palette: centered modal with input + list
      const props = vnode.props as { open?: unknown; maxVisible?: unknown; width?: unknown };
      if (props.open !== true) {
        return ok({ w: 0, h: 0 }); // Hidden when closed
      }
      const widthProp = props.width;
      const paletteWidth = Math.min(
        maxW,
        typeof widthProp === "number" && widthProp > 0 ? Math.floor(widthProp) : 60,
      );
      const maxVisible = readNonNegativeInt(props.maxVisible, 10);
      const paletteHeight = Math.min(maxH, maxVisible + 4); // border + input + separator + items
      return ok({ w: paletteWidth, h: paletteHeight });
    }
    case "toolApprovalDialog": {
      // Tool approval dialog: modal with fixed-ish size
      const props = vnode.props as { open?: unknown; width?: unknown; height?: unknown };
      if (props.open !== true) {
        return ok({ w: 0, h: 0 }); // Hidden when closed
      }
      const widthProp = props.width;
      const heightProp = props.height;
      const dialogWidth = Math.min(
        maxW,
        typeof widthProp === "number" && widthProp > 0 ? Math.floor(widthProp) : 50,
      );
      const dialogHeight = Math.min(
        maxH,
        typeof heightProp === "number" && heightProp > 0 ? Math.floor(heightProp) : 15,
      );
      return ok({ w: dialogWidth, h: dialogHeight });
    }
    case "toastContainer": {
      // Toast container: positioned at edge, minimal intrinsic size
      const props = vnode.props as { maxVisible?: unknown; width?: unknown };
      const maxVisible = readNonNegativeInt(props.maxVisible, 5);
      const widthProp = props.width;
      const toastWidth = Math.min(
        maxW,
        typeof widthProp === "number" && widthProp > 0 ? Math.floor(widthProp) : 40,
      );
      const toastHeight = Math.min(maxH, maxVisible * TOAST_HEIGHT);
      return ok({ w: toastWidth, h: toastHeight });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "measureOverlays: unexpected vnode kind" },
      };
  }
}

export function layoutOverlays(
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  rectW: number,
  rectH: number,
  axis: Axis,
  measureNode: MeasureNodeFn,
  layoutNode: LayoutNodeFn,
): LayoutResult<LayoutTree> {
  switch (vnode.kind) {
    case "focusZone":
    case "focusTrap": {
      const children: LayoutTree[] = [];
      if (vnode.children.length === 1) {
        // Truly transparent: forward to single child.
        const child = vnode.children[0];
        if (!child) {
          return ok({
            vnode,
            rect: { x, y, w: rectW, h: rectH },
            children: Object.freeze(children),
          });
        }
        const childRes = layoutNode(child, x, y, rectW, rectH, axis, rectW, rectH);
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
      } else if (vnode.children.length > 1) {
        // Multi-child fallback (deprecated).
        const columnNode = getSyntheticColumn(vnode);
        const innerRes = layoutNode(columnNode, x, y, rectW, rectH, "column", rectW, rectH);
        if (!innerRes.ok) return innerRes;
        children.push(...innerRes.value.children);
      }

      return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze(children) });
    }
    case "layers": {
      // Layers container: children are stacked at the same position.
      // Each child gets the full available space.
      const children: LayoutTree[] = [];
      for (const child of vnode.children) {
        const childRes = layoutNode(child, x, y, rectW, rectH, axis);
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
      }
      return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze(children) });
    }
    case "modal": {
      // Centered modal that participates in layout via its content/actions VNodes.
      const props = vnode.props as {
        title?: unknown;
        width?: unknown;
        height?: unknown;
        minWidth?: unknown;
        minHeight?: unknown;
        maxWidth?: unknown;
        content?: unknown;
        actions?: unknown;
      };

      const title = typeof props.title === "string" ? props.title : undefined;

      const content = isVNode(props.content) ? props.content : null;
      const actionsRaw = Array.isArray(props.actions) ? props.actions : [];
      const actions: VNode[] = [];
      for (const a of actionsRaw) {
        if (isVNode(a)) actions.push(a);
      }

      const border = 1;
      const titleH = title ? 1 : 0;
      const actionsH = actions.length > 0 ? 1 : 0;

      const maxWidth =
        typeof props.maxWidth === "number" && props.maxWidth > 0
          ? Math.floor(props.maxWidth)
          : rectW;

      let modalH = Math.floor(rectH * 0.6);
      const heightProp = props.height;
      if (typeof heightProp === "number" && heightProp > 0) {
        modalH = Math.floor(heightProp);
      }
      const minHeightProp = props.minHeight;
      if (typeof minHeightProp === "number" && minHeightProp > 0) {
        modalH = Math.max(modalH, Math.floor(minHeightProp));
      }
      modalH = clampWithin(modalH, Math.min(5, rectH), rectH);
      if (rectH >= 4) modalH = Math.min(modalH, rectH - 2);

      const maxModalW = clampNonNegative(Math.min(rectW, maxWidth));
      const maxInnerW = clampNonNegative(maxModalW - border * 2);
      const maxInnerH = clampNonNegative(modalH - border * 2 - titleH - actionsH);

      let modalW: number;
      if (typeof props.width === "number" && props.width > 0) {
        modalW = Math.floor(props.width);
      } else if (props.width === "auto") {
        let contentW = 0;
        if (content) {
          const sizeRes = measureNode(content, maxInnerW, maxInnerH, "column");
          if (!sizeRes.ok) return sizeRes;
          contentW = clampNonNegative(Math.min(maxInnerW, sizeRes.value.w));
        }

        let actionsW = 0;
        if (actions.length > 0) {
          const gap = 1;
          let total = 0;
          for (let i = 0; i < actions.length; i++) {
            const a = actions[i];
            if (!a) continue;
            const sizeRes = measureNode(a, maxInnerW, 1, "row");
            if (!sizeRes.ok) return sizeRes;
            const aw = clampNonNegative(Math.min(maxInnerW, sizeRes.value.w));
            total += aw;
            if (i < actions.length - 1) total += gap;
          }
          actionsW = total;
        }

        const innerW = Math.max(contentW, actionsW);
        const titleW = title ? measureTextCells(title) + 4 : 0;
        modalW = Math.max(innerW + border * 2, titleW);
      } else {
        modalW = Math.floor(rectW * 0.7);
      }

      const minWidthProp = props.minWidth;
      if (typeof minWidthProp === "number" && minWidthProp > 0) {
        modalW = Math.max(modalW, Math.floor(minWidthProp));
      }
      modalW = clampNonNegative(Math.min(modalW, maxWidth));
      modalW = clampWithin(modalW, Math.min(10, rectW), rectW);
      if (rectW >= 4) modalW = Math.min(modalW, rectW - 2);

      const mx = x + Math.floor((rectW - modalW) / 2);
      const my = y + Math.floor((rectH - modalH) / 2);

      const innerX = mx + border;
      const innerY = my + border + titleH;
      const innerW = clampNonNegative(modalW - border * 2);
      const innerH = clampNonNegative(modalH - border * 2 - titleH - actionsH);

      const children: LayoutTree[] = [];

      if (content) {
        const contentRes = layoutNode(
          content,
          innerX,
          innerY,
          innerW,
          innerH,
          "column",
          innerW,
          innerH,
        );
        if (!contentRes.ok) return contentRes;
        children.push(contentRes.value);
      }

      if (actions.length > 0) {
        const ay = my + modalH - border - 1;
        const gap = 1;
        let cursorX = innerX + innerW;

        for (let i = actions.length - 1; i >= 0; i--) {
          const a = actions[i];
          if (!a) continue;

          const sizeRes = measureNode(a, innerW, 1, "row");
          if (!sizeRes.ok) return sizeRes;

          const aw = clampNonNegative(Math.min(innerW, sizeRes.value.w));
          cursorX -= aw;
          const actionRes = layoutNode(a, cursorX, ay, aw, 1, "row", aw, 1);
          if (!actionRes.ok) return actionRes;
          children.push(actionRes.value);

          cursorX -= gap;
          if (cursorX <= innerX) break;
        }
      }

      return ok({
        vnode,
        rect: { x: mx, y: my, w: modalW, h: modalH },
        children: Object.freeze(children),
      });
    }
    case "dropdown": {
      // Dropdowns are rendered separately by the renderer with anchor positioning.
      // They don't occupy space in the layout tree.
      return ok({ vnode, rect: { x, y, w: 0, h: 0 }, children: Object.freeze([]) });
    }
    case "layer": {
      const props = vnode.props as { content?: unknown; frameStyle?: unknown };
      const content = isVNode(props.content) ? props.content : null;
      const borderInset = hasFrameBorder(props.frameStyle) ? 1 : 0;
      const innerX = x + borderInset;
      const innerY = y + borderInset;
      const innerW = clampNonNegative(rectW - borderInset * 2);
      const innerH = clampNonNegative(rectH - borderInset * 2);
      const children: LayoutTree[] = [];
      if (content) {
        const childRes = layoutNode(content, innerX, innerY, innerW, innerH, axis, innerW, innerH);
        if (!childRes.ok) return childRes;
        children.push(childRes.value);
      }
      return ok({ vnode, rect: { x, y, w: rectW, h: rectH }, children: Object.freeze(children) });
    }
    case "commandPalette": {
      // Command palette is a modal overlay, hidden when closed
      const props = vnode.props as { open?: unknown; maxVisible?: unknown; width?: unknown };
      if (props.open !== true) {
        return ok({ vnode, rect: { x, y, w: 0, h: 0 }, children: Object.freeze([]) });
      }
      const widthProp = props.width;
      const paletteWidth = Math.min(
        rectW,
        typeof widthProp === "number" && widthProp > 0 ? Math.floor(widthProp) : 60,
      );
      const maxVisible = readNonNegativeInt(props.maxVisible, 10);
      const paletteHeight = Math.min(rectH, maxVisible + 4);
      const maxX = x + Math.max(0, maxW - paletteWidth);
      const mx = clampWithin(x + Math.floor((maxW - paletteWidth) / 2), x, maxX);
      // Place the palette roughly 1/3 from the top of the available region (PLAN.md).
      const desiredTop = y + Math.floor(maxH / 3);
      const maxY = y + Math.max(0, maxH - paletteHeight);
      const my = clampWithin(desiredTop, y, maxY);
      return ok({
        vnode,
        rect: { x: mx, y: my, w: paletteWidth, h: paletteHeight },
        children: Object.freeze([]),
      });
    }
    case "toolApprovalDialog": {
      // Tool approval dialog: modal, hidden when closed
      const props = vnode.props as { open?: unknown; width?: unknown; height?: unknown };
      if (props.open !== true) {
        return ok({ vnode, rect: { x, y, w: 0, h: 0 }, children: Object.freeze([]) });
      }
      const widthProp = props.width;
      const heightProp = props.height;
      const dialogWidth = Math.min(
        rectW,
        typeof widthProp === "number" && widthProp > 0 ? Math.floor(widthProp) : 50,
      );
      const dialogHeight = Math.min(
        rectH,
        typeof heightProp === "number" && heightProp > 0 ? Math.floor(heightProp) : 15,
      );
      const maxX = x + Math.max(0, maxW - dialogWidth);
      const maxY = y + Math.max(0, maxH - dialogHeight);
      const mx = clampWithin(x + Math.floor((maxW - dialogWidth) / 2), x, maxX);
      const my = clampWithin(y + Math.floor((maxH - dialogHeight) / 2), y, maxY);
      return ok({
        vnode,
        rect: { x: mx, y: my, w: dialogWidth, h: dialogHeight },
        children: Object.freeze([]),
      });
    }
    case "toastContainer": {
      // Toast container: positioned based on position prop
      const props = vnode.props as { maxVisible?: unknown; position?: unknown; width?: unknown };
      const maxVisible = readNonNegativeInt(props.maxVisible, 5);
      const widthProp = props.width;
      const toastWidth = Math.min(
        rectW,
        typeof widthProp === "number" && widthProp > 0 ? Math.floor(widthProp) : 40,
      );
      const toastHeight = Math.min(rectH, maxVisible * TOAST_HEIGHT);
      const position = readToastPosition(props.position);
      const maxX = x + Math.max(0, maxW - toastWidth);
      const maxY = y + Math.max(0, maxH - toastHeight);
      const desiredX = position.endsWith("left")
        ? x
        : position.endsWith("center")
          ? x + Math.floor((maxW - toastWidth) / 2)
          : x + maxW - toastWidth;
      const desiredY = position.startsWith("top") ? y : y + maxH - toastHeight;
      const tx = clampWithin(desiredX, x, maxX);
      const ty = clampWithin(desiredY, y, maxY);
      return ok({
        vnode,
        rect: { x: tx, y: ty, w: toastWidth, h: toastHeight },
        children: Object.freeze([]),
      });
    }
    default:
      return {
        ok: false,
        fatal: { code: "ZRUI_INVALID_PROPS", detail: "layoutOverlays: unexpected vnode kind" },
      };
  }
}
