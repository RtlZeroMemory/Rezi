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
import { layoutGridKinds, measureGridKinds } from "../kinds/grid.js";
import { layoutLeafKind, measureLeaf } from "../kinds/leaf.js";
import { layoutNavigationKinds, measureNavigationKinds } from "../kinds/navigation.js";
import { layoutOverlays, measureOverlays } from "../kinds/overlays.js";
import { layoutSplitPaneKinds, measureSplitPaneKinds } from "../kinds/splitPane.js";
import { layoutStackKinds, measureStackKinds } from "../kinds/stack.js";
import { clampNonNegative, isI32 } from "./bounds.js";
import { getActiveDirtySet, popDirtySet, pushDirtySet } from "./dirtySet.js";
import type { LayoutTree } from "./types.js";

type MeasureCacheEntry = Readonly<{
  row: Map<number, Map<number, LayoutResult<Size>>>;
  column: Map<number, Map<number, LayoutResult<Size>>>;
}>;

type MeasureCache = WeakMap<VNode, MeasureCacheEntry>;
type LayoutCacheEntry = Readonly<{
  row: Map<string, LayoutResult<LayoutTree>>;
  column: Map<string, LayoutResult<LayoutTree>>;
}>;
type LayoutCache = WeakMap<VNode, LayoutCacheEntry>;

let activeMeasureCache: MeasureCache | null = null;
const measureCacheStack: MeasureCache[] = [];
let activeLayoutCache: LayoutCache | null = null;
const layoutCacheStack: LayoutCache[] = [];

function pushMeasureCache(cache: MeasureCache): void {
  measureCacheStack.push(cache);
  activeMeasureCache = cache;
}

function popMeasureCache(): void {
  measureCacheStack.pop();
  activeMeasureCache =
    measureCacheStack.length > 0 ? (measureCacheStack[measureCacheStack.length - 1] ?? null) : null;
}

function pushLayoutCache(cache: LayoutCache): void {
  layoutCacheStack.push(cache);
  activeLayoutCache = cache;
}

function popLayoutCache(): void {
  layoutCacheStack.pop();
  activeLayoutCache =
    layoutCacheStack.length > 0 ? (layoutCacheStack[layoutCacheStack.length - 1] ?? null) : null;
}

function layoutCacheKey(
  maxW: number,
  maxH: number,
  forcedW: number | null,
  forcedH: number | null,
  x: number,
  y: number,
): string {
  return `${String(maxW)}:${String(maxH)}:${forcedW === null ? "n" : String(forcedW)}:${
    forcedH === null ? "n" : String(forcedH)
  }:${String(x)}:${String(y)}`;
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
    case "focusAnnouncer":
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
    case "link":
    case "canvas":
    case "image":
    case "lineChart":
    case "scatter":
    case "heatmap":
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
    case "grid": {
      computed = measureGridKinds(vnode, maxW, maxH, axis, measureNode);
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
    case "tabs":
    case "accordion":
    case "breadcrumb":
    case "pagination": {
      computed = measureNavigationKinds(vnode, maxW, maxH, measureNode);
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
  precomputedSize: Size | null = null,
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

  const cache = activeLayoutCache;
  const cacheKey = layoutCacheKey(maxW, maxH, forcedW, forcedH, x, y);
  const dirtySet = getActiveDirtySet();
  let cacheHit: LayoutResult<LayoutTree> | null = null;
  if (cache) {
    const entry = cache.get(vnode);
    if (entry) {
      const axisMap = axis === "row" ? entry.row : entry.column;
      cacheHit = axisMap.get(cacheKey) ?? null;
      if (cacheHit && (dirtySet === null || !dirtySet.has(vnode))) {
        return cacheHit;
      }
    }
  }

  const sizeRes: LayoutResult<Size> =
    precomputedSize === null
      ? measureNode(vnode, maxW, maxH, axis)
      : { ok: true, value: precomputedSize };
  if (!sizeRes.ok) return sizeRes;

  const rectW = clampNonNegative(Math.min(maxW, forcedW ?? sizeRes.value.w));
  const rectH = clampNonNegative(Math.min(maxH, forcedH ?? sizeRes.value.h));

  let computed: LayoutResult<LayoutTree>;
  switch (vnode.kind) {
    case "text":
    case "button":
    case "input":
    case "focusAnnouncer":
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
    case "link":
    case "canvas":
    case "image":
    case "lineChart":
    case "scatter":
    case "heatmap":
    case "sparkline":
    case "barChart":
    case "miniChart":
    case "select":
    case "checkbox":
    case "radioGroup": {
      computed = layoutLeafKind(vnode, x, y, rectW, rectH);
      break;
    }
    case "row": {
      computed = layoutStackKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
      break;
    }
    case "column": {
      computed = layoutStackKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
      break;
    }
    case "grid": {
      computed = layoutGridKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
      break;
    }
    case "box": {
      computed = layoutBoxKinds(vnode, x, y, rectW, rectH, axis, layoutNode);
      break;
    }
    case "focusZone":
    case "focusTrap": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "virtualList": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "layers": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "modal": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "dropdown": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "layer": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "table": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "tree": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "field": {
      computed = layoutBoxKinds(vnode, x, y, rectW, rectH, axis, layoutNode);
      break;
    }
    case "tabs":
    case "accordion":
    case "breadcrumb":
    case "pagination": {
      computed = layoutNavigationKinds(vnode, x, y, rectW, rectH, layoutNode);
      break;
    }

    /* ========== Advanced Widgets (GitHub issue #136) ========== */

    case "commandPalette": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "filePicker": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "fileTreeExplorer": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "splitPane":
    case "panelGroup":
    case "resizablePanel": {
      computed = layoutSplitPaneKinds(vnode, x, y, maxW, maxH, rectW, rectH, axis, layoutNode);
      break;
    }
    case "codeEditor": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "diffViewer": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "toolApprovalDialog": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    case "logsConsole": {
      computed = layoutCollections(vnode, x, y, rectW, rectH);
      break;
    }
    case "toastContainer": {
      computed = layoutOverlays(
        vnode,
        x,
        y,
        maxW,
        maxH,
        rectW,
        rectH,
        axis,
        measureNode,
        layoutNode,
      );
      break;
    }
    default: {
      computed = {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "layout: unexpected vnode kind",
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
    axisMap.set(cacheKey, computed);
  }

  return computed;
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
  layoutCache?: WeakMap<VNode, unknown>,
  dirtySet?: Set<VNode> | null,
): LayoutResult<LayoutTree> {
  const resolvedMeasureCache: MeasureCache = measureCache
    ? (measureCache as MeasureCache)
    : new WeakMap<VNode, MeasureCacheEntry>();
  const resolvedLayoutCache: LayoutCache = layoutCache
    ? (layoutCache as LayoutCache)
    : new WeakMap<VNode, LayoutCacheEntry>();
  pushMeasureCache(resolvedMeasureCache);
  pushLayoutCache(resolvedLayoutCache);
  pushDirtySet(dirtySet ?? null);
  try {
    return layoutNode(node, x, y, maxW, maxH, axis);
  } finally {
    popDirtySet();
    popLayoutCache();
    popMeasureCache();
  }
}
