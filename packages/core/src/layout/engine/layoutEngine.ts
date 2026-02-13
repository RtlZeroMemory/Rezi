/**
 * packages/core/src/layout/layout.ts — Widget tree layout computation.
 *
 * Why: Computes absolute positions and sizes for all widgets in a VNode tree.
 * Uses a constraint-based approach: parent provides max width/height, children
 * report their natural size, and the layout algorithm positions them accordingly.
 *
 * Layout rules:
 *   - Text/Button/Input: single row, width = content width
 *   - Spacer: size cells in stack axis, 0 or 1 in cross axis
 *   - Row: horizontal stack with pad/gap/align
 *   - Column: vertical stack with pad/gap/align
 *   - Box: optional border + pad, children laid out as column
 *
 * Invariants:
 *   - All coordinates are int32 in range [-2147483648, 2147483647]
 *   - Negative dimensions clamped to 0
 *   - Props validated before layout; invalid props produce fatal error
 *
 * @see docs/guide/layout.md
 */

import type { VNode } from "../../index.js";
import type { Axis, Size } from "../types.js";
import type { LayoutResult } from "../validateProps.js";

export type { LayoutTree } from "./types.js";
import { layoutBoxKinds, measureBoxKinds } from "../kinds/box.js";
import { layoutCollections, measureCollections } from "../kinds/collections.js";
import { layoutLeafKind, measureLeaf } from "../kinds/leaf.js";
import { layoutOverlays, measureOverlays } from "../kinds/overlays.js";
import { layoutSplitPaneKinds, measureSplitPaneKinds } from "../kinds/splitPane.js";
import { layoutStackKinds, measureStackKinds } from "../kinds/stack.js";
import { clampNonNegative, isI32 } from "./bounds.js";
import type { LayoutTree } from "./types.js";

type MeasureCacheEntry = Readonly<{
  row: Map<number, Map<number, LayoutResult<Size>>>;
  column: Map<number, Map<number, LayoutResult<Size>>>;
}>;

type MeasureCache = WeakMap<VNode, MeasureCacheEntry>;

let activeMeasureCache: MeasureCache | null = null;
const measureCacheStack: MeasureCache[] = [];

function pushMeasureCache(cache: MeasureCache): void {
  measureCacheStack.push(cache);
  activeMeasureCache = cache;
}

function popMeasureCache(): void {
  measureCacheStack.pop();
  activeMeasureCache =
    measureCacheStack.length > 0 ? (measureCacheStack[measureCacheStack.length - 1] ?? null) : null;
}

/**
 * Measure the natural size of a VNode given constraints.
 * Does not position; only computes width and height.
 */
function measureNode(vnode: VNode, maxW: number, maxH: number, axis: Axis): LayoutResult<Size> {
  if (!isI32(maxW) || maxW < 0) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "measure: maxW must be an int32 >= 0" },
    };
  }
  if (!isI32(maxH) || maxH < 0) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "measure: maxH must be an int32 >= 0" },
    };
  }

  const cache = activeMeasureCache;
  if (cache) {
    const entry = cache.get(vnode);
    if (entry) {
      const axisMap = axis === "row" ? entry.row : entry.column;
      const byH = axisMap.get(maxW);
      const hit = byH?.get(maxH);
      if (hit) return hit;
    }
  }

  let computed: LayoutResult<Size>;
  switch (vnode.kind) {
    case "text":
    case "button":
    case "input":
    case "slider":
    case "spacer":
    case "divider":
    case "icon":
    case "spinner":
    case "progress":
    case "skeleton":
    case "richText":
    case "kbd":
    case "badge":
    case "status":
    case "tag":
    case "gauge":
    case "empty":
    case "errorDisplay":
    case "callout":
    case "sparkline":
    case "barChart":
    case "miniChart": {
      computed = measureLeaf(vnode, maxW, maxH, axis);
      break;
    }
    case "row": {
      computed = measureStackKinds(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "column": {
      computed = measureStackKinds(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "box": {
      computed = measureBoxKinds(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "focusZone":
    case "focusTrap": {
      computed = measureOverlays(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "virtualList": {
      computed = measureCollections(vnode, maxW, maxH);
      break;
    }
    case "layers":
    case "modal":
    case "dropdown":
    case "layer": {
      computed = measureOverlays(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "table":
    case "tree": {
      computed = measureCollections(vnode, maxW, maxH);
      break;
    }
    case "field": {
      computed = measureBoxKinds(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "select":
    case "checkbox":
    case "radioGroup": {
      computed = measureLeaf(vnode, maxW, maxH, axis);
      break;
    }

    /* ========== Advanced Widgets (GitHub issue #136) ========== */

    case "commandPalette": {
      computed = measureOverlays(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "filePicker":
    case "fileTreeExplorer": {
      computed = measureCollections(vnode, maxW, maxH);
      break;
    }
    case "splitPane":
    case "panelGroup":
    case "resizablePanel": {
      computed = measureSplitPaneKinds(vnode, maxW, maxH);
      break;
    }
    case "codeEditor":
    case "diffViewer": {
      computed = measureCollections(vnode, maxW, maxH);
      break;
    }
    case "toolApprovalDialog": {
      computed = measureOverlays(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    case "logsConsole": {
      computed = measureCollections(vnode, maxW, maxH);
      break;
    }
    case "toastContainer": {
      computed = measureOverlays(vnode, maxW, maxH, axis, measureNode);
      break;
    }
    default: {
      computed = {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "measure: unexpected vnode kind",
        },
      };
      break;
    }
  }

  if (cache) {
    let entry = cache.get(vnode);
    if (!entry) {
      entry = Object.freeze({ row: new Map(), column: new Map() });
      cache.set(vnode, entry);
    }
    const axisMap = axis === "row" ? entry.row : entry.column;
    let byH = axisMap.get(maxW);
    if (!byH) {
      byH = new Map();
      axisMap.set(maxW, byH);
    }
    byH.set(maxH, computed);
  }

  return computed;
}

/**
 * Layout a VNode and its children, producing a positioned LayoutTree.
 * Combines measurement with positioning based on stack axis and alignment.
 */
function layoutNode(
  vnode: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  axis: Axis,
  forcedW: number | null = null,
  forcedH: number | null = null,
): LayoutResult<LayoutTree> {
  if (!isI32(x)) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "layout: x must be an int32" },
    };
  }
  if (!isI32(y)) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "layout: y must be an int32" },
    };
  }
  if (!isI32(maxW) || maxW < 0) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "layout: maxW must be an int32 >= 0" },
    };
  }
  if (!isI32(maxH) || maxH < 0) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "layout: maxH must be an int32 >= 0" },
    };
  }

  const sizeRes = measureNode(vnode, maxW, maxH, axis);
  if (!sizeRes.ok) return sizeRes;

  const rectW = clampNonNegative(Math.min(maxW, forcedW ?? sizeRes.value.w));
  const rectH = clampNonNegative(Math.min(maxH, forcedH ?? sizeRes.value.h));

  switch (vnode.kind) {
    case "text":
    case "button":
    case "input":
    case "slider":
    case "spacer":
    case "divider":
    case "icon":
    case "spinner":
    case "progress":
    case "skeleton":
    case "richText":
    case "kbd":
    case "badge":
    case "status":
    case "tag":
    case "gauge":
    case "empty":
    case "errorDisplay":
    case "callout":
    case "sparkline":
    case "barChart":
    case "miniChart":
    case "select":
    case "checkbox":
    case "radioGroup": {
      return layoutLeafKind(vnode, x, y, rectW, rectH);
    }
    case "row": {
      return layoutStackKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "column": {
      return layoutStackKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "box": {
      return layoutBoxKinds(vnode, x, y, rectW, rectH, axis, layoutNode);
    }
    case "focusZone":
    case "focusTrap": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "virtualList": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "layers": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "modal": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "dropdown": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "layer": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "table": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "tree": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "field": {
      return layoutBoxKinds(vnode, x, y, rectW, rectH, axis, layoutNode);
    }

    /* ========== Advanced Widgets (GitHub issue #136) ========== */

    case "commandPalette": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "filePicker": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "fileTreeExplorer": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "splitPane":
    case "panelGroup":
    case "resizablePanel": {
      return layoutSplitPaneKinds(vnode, x, y, maxW, maxH, rectW, rectH, axis, layoutNode);
    }
    case "codeEditor": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "diffViewer": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "toolApprovalDialog": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    case "logsConsole": {
      return layoutCollections(vnode, x, y, rectW, rectH);
    }
    case "toastContainer": {
      return layoutOverlays(vnode, x, y, maxW, maxH, rectW, rectH, axis, measureNode, layoutNode);
    }
    default: {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "layout: unexpected vnode kind",
        },
      };
    }
  }
}

/** Measure a VNode tree without positioning (public API). */
export function measure(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutResult<Size> {
  return measureNode(node, maxW, maxH, axis);
}

/**
 * Compute layout for a VNode tree starting at position (x,y) with constraints.
 *
 * @param node - Root VNode to layout
 * @param x - Starting X position in terminal cells
 * @param y - Starting Y position in terminal cells
 * @param maxW - Maximum available width
 * @param maxH - Maximum available height
 * @param axis - Stack axis for root container behavior
 * @returns LayoutTree on success, fatal error on invalid props
 */
export function layout(
  node: VNode,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
  axis: Axis,
  measureCache?: WeakMap<VNode, unknown>,
): LayoutResult<LayoutTree> {
  const cache: MeasureCache = measureCache
    ? (measureCache as MeasureCache)
    : new WeakMap<VNode, MeasureCacheEntry>();
  pushMeasureCache(cache);
  try {
    return layoutNode(node, x, y, maxW, maxH, axis);
  } finally {
    popMeasureCache();
  }
}
