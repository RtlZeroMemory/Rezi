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

import type { VNode } from "../../widgets/types.js";
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
type LayoutCacheLeaf = Map<number, LayoutResult<LayoutTree>>;
type LayoutCacheByX = Map<number, LayoutCacheLeaf>;
type LayoutCacheByForcedH = Map<number, LayoutCacheByX>;
type LayoutCacheByForcedW = Map<number, LayoutCacheByForcedH>;
type LayoutCacheByMaxH = Map<number, LayoutCacheByForcedW>;
type LayoutAxisCache = Map<number, LayoutCacheByMaxH>;
type LayoutCacheEntry = Readonly<{
  row: LayoutAxisCache;
  column: LayoutAxisCache;
}>;
type LayoutCache = WeakMap<VNode, LayoutCacheEntry>;

type ThemedVNode = VNode & Readonly<{ kind: "themed"; children: readonly VNode[] }>;

type SyntheticThemedColumnCacheEntry = Readonly<{
  childrenRef: readonly VNode[];
  columnNode: VNode;
}>;

// Temporary profiling counters (remove after investigation)
export const __layoutProfile = {
  enabled: false,
  layoutNodeCalls: 0,
  measureNodeCalls: 0,
  measureCacheHits: 0,
  layoutCacheHits: 0,
  layoutByKind: {} as Record<string, number>,
  measureByKind: {} as Record<string, number>,
  reset(): void {
    this.layoutNodeCalls = 0;
    this.measureNodeCalls = 0;
    this.measureCacheHits = 0;
    this.layoutCacheHits = 0;
    this.layoutByKind = {};
    this.measureByKind = {};
  },
};

let activeMeasureCache: MeasureCache | null = null;
const measureCacheStack: MeasureCache[] = [];
let activeLayoutCache: LayoutCache | null = null;
const layoutCacheStack: LayoutCache[] = [];
const syntheticThemedColumnCache = new WeakMap<VNode, SyntheticThemedColumnCacheEntry>();
const NULL_FORCED_DIMENSION = -1;
const LEGACY_SIZE_PROP_NAMES: readonly string[] = Object.freeze([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexBasis",
]);

function isLegacyBreakpointMap(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if ((value as { kind?: unknown }).kind === "fluid") return false;
  const record = value as Record<string, unknown>;
  return "sm" in record || "md" in record || "lg" in record || "xl" in record;
}

function findLegacyConstraintUsage(root: VNode): string | null {
  const stack: Array<Readonly<{ node: VNode; path: string }>> = [{ node: root, path: root.kind }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) continue;
    const { node, path } = frame;
    const props = (node.props ?? {}) as Readonly<Record<string, unknown>>;

    for (const propName of LEGACY_SIZE_PROP_NAMES) {
      const value = props[propName];
      if (typeof value === "string" && value.trim().endsWith("%")) {
        return `${path}.${propName}: percentage strings are removed. Use expr("parent.${propName === "height" || propName === "minHeight" || propName === "maxHeight" ? "h" : "w"} * <ratio>"), "full", numbers, or fluid(...).`;
      }
      if (isLegacyBreakpointMap(value)) {
        return `${path}.${propName}: responsive maps are removed. Use expr("steps(...)"), fluid(...), or explicit values.`;
      }
    }

    const children = (node as Readonly<{ children?: readonly VNode[] }>).children;
    if (Array.isArray(children) && children.length > 0) {
      for (let i = children.length - 1; i >= 0; i--) {
        const child = children[i];
        if (!child) continue;
        stack.push({ node: child, path: `${path}>${child.kind}[${String(i)}]` });
      }
    }

    if (node.kind === "modal") {
      const modalProps = node.props as Readonly<{
        content?: unknown;
        actions?: readonly unknown[];
      }>;
      if (
        modalProps.content &&
        typeof modalProps.content === "object" &&
        "kind" in modalProps.content
      ) {
        stack.push({ node: modalProps.content as VNode, path: `${path}.content` });
      }
      if (Array.isArray(modalProps.actions)) {
        for (let i = modalProps.actions.length - 1; i >= 0; i--) {
          const action = modalProps.actions[i];
          if (!action || typeof action !== "object" || !("kind" in action)) continue;
          stack.push({ node: action as VNode, path: `${path}.actions[${String(i)}]` });
        }
      }
    } else if (node.kind === "layer") {
      const layerContent = (node.props as Readonly<{ content?: unknown }>).content;
      if (layerContent && typeof layerContent === "object" && "kind" in layerContent) {
        stack.push({ node: layerContent as VNode, path: `${path}.content` });
      }
    }
  }

  return null;
}

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

function forcedDimensionKey(value: number | null): number {
  if (value === null) return NULL_FORCED_DIMENSION;
  if (value < 0) {
    throw new RangeError("layout: forced dimensions must be >= 0");
  }
  return value;
}

function getLayoutCacheHit(
  axisMap: LayoutAxisCache,
  maxW: number,
  maxH: number,
  forcedW: number | null,
  forcedH: number | null,
  x: number,
  y: number,
): LayoutResult<LayoutTree> | null {
  const byMaxH = axisMap.get(maxW);
  if (!byMaxH) return null;
  const byForcedW = byMaxH.get(maxH);
  if (!byForcedW) return null;
  const byForcedH = byForcedW.get(forcedDimensionKey(forcedW));
  if (!byForcedH) return null;
  const byX = byForcedH.get(forcedDimensionKey(forcedH));
  if (!byX) return null;
  const byY = byX.get(x);
  if (!byY) return null;
  return byY.get(y) ?? null;
}

function setLayoutCacheValue(
  axisMap: LayoutAxisCache,
  maxW: number,
  maxH: number,
  forcedW: number | null,
  forcedH: number | null,
  x: number,
  y: number,
  value: LayoutResult<LayoutTree>,
): void {
  let byMaxH = axisMap.get(maxW);
  if (!byMaxH) {
    byMaxH = new Map();
    axisMap.set(maxW, byMaxH);
  }
  let byForcedW = byMaxH.get(maxH);
  if (!byForcedW) {
    byForcedW = new Map();
    byMaxH.set(maxH, byForcedW);
  }
  const forcedWKey = forcedDimensionKey(forcedW);
  let byForcedH = byForcedW.get(forcedWKey);
  if (!byForcedH) {
    byForcedH = new Map();
    byForcedW.set(forcedWKey, byForcedH);
  }
  const forcedHKey = forcedDimensionKey(forcedH);
  let byX = byForcedH.get(forcedHKey);
  if (!byX) {
    byX = new Map();
    byForcedH.set(forcedHKey, byX);
  }
  let byY = byX.get(x);
  if (!byY) {
    byY = new Map();
    byX.set(x, byY);
  }
  byY.set(y, value);
}

function getSyntheticThemedColumn(vnode: ThemedVNode): VNode {
  const hit = syntheticThemedColumnCache.get(vnode);
  if (hit && hit.childrenRef === vnode.children) return hit.columnNode;
  const columnNode: VNode = { kind: "column", props: { gap: 0 }, children: vnode.children };
  syntheticThemedColumnCache.set(vnode, Object.freeze({ childrenRef: vnode.children, columnNode }));
  return columnNode;
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

  const display = (vnode.props as Readonly<{ display?: unknown }> | undefined)?.display;
  if (display === false) {
    return { ok: true, value: { w: 0, h: 0 } };
  }

  if (__layoutProfile.enabled) {
    __layoutProfile.measureNodeCalls++;
    __layoutProfile.measureByKind[vnode.kind] =
      (__layoutProfile.measureByKind[vnode.kind] ?? 0) + 1;
  }

  const cache = activeMeasureCache;
  if (cache) {
    const entry = cache.get(vnode);
    if (entry) {
      const axisMap = axis === "row" ? entry.row : entry.column;
      const byH = axisMap.get(maxW);
      const hit = byH?.get(maxH);
      if (hit) {
        if (__layoutProfile.enabled) __layoutProfile.measureCacheHits++;
        return hit;
      }
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
    case "themed": {
      const themedVNode = vnode as ThemedVNode;
      if (themedVNode.children.length === 0) {
        computed = { ok: true, value: { w: 0, h: 0 } };
        break;
      }
      if (themedVNode.children.length === 1) {
        const child = themedVNode.children[0];
        computed = child
          ? measureNode(child, maxW, maxH, axis)
          : { ok: true, value: { w: 0, h: 0 } };
        break;
      }
      const syntheticColumn = getSyntheticThemedColumn(themedVNode);
      computed = measureNode(syntheticColumn, maxW, maxH, "column");
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

  if (__layoutProfile.enabled) {
    __layoutProfile.layoutNodeCalls++;
    __layoutProfile.layoutByKind[vnode.kind] = (__layoutProfile.layoutByKind[vnode.kind] ?? 0) + 1;
  }

  const cache = activeLayoutCache;
  const dirtySet = getActiveDirtySet();
  let cacheHit: LayoutResult<LayoutTree> | null = null;
  if (cache) {
    const entry = cache.get(vnode);
    if (entry) {
      const axisMap = axis === "row" ? entry.row : entry.column;
      cacheHit = getLayoutCacheHit(axisMap, maxW, maxH, forcedW, forcedH, x, y);
      if (cacheHit && (dirtySet === null || !dirtySet.has(vnode))) {
        if (__layoutProfile.enabled) __layoutProfile.layoutCacheHits++;
        return cacheHit;
      }
    }
  }

  const sizeRes: LayoutResult<Size> =
    precomputedSize === null
      ? measureNode(vnode, maxW, maxH, axis)
      : { ok: true, value: precomputedSize };
  if (!sizeRes.ok) return sizeRes;

  const hiddenByDisplay =
    (vnode.props as Readonly<{ display?: unknown }> | undefined)?.display === false;
  const rectW = hiddenByDisplay ? 0 : clampNonNegative(Math.min(maxW, forcedW ?? sizeRes.value.w));
  const rectH = hiddenByDisplay ? 0 : clampNonNegative(Math.min(maxH, forcedH ?? sizeRes.value.h));

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
    case "themed": {
      const themedVNode = vnode as ThemedVNode;
      if (themedVNode.children.length === 0) {
        computed = {
          ok: true,
          value: {
            vnode,
            rect: { x, y, w: rectW, h: rectH },
            children: Object.freeze([]),
          },
        };
        break;
      }
      if (themedVNode.children.length === 1) {
        const children: LayoutTree[] = [];
        const child = themedVNode.children[0];
        if (child) {
          const childRes = layoutNode(child, x, y, rectW, rectH, axis, rectW, rectH);
          if (!childRes.ok) {
            computed = childRes;
            break;
          }
          children.push(childRes.value);
        }
        computed = {
          ok: true,
          value: {
            vnode,
            rect: { x, y, w: rectW, h: rectH },
            children: Object.freeze(children),
          },
        };
        break;
      }
      const syntheticColumn = getSyntheticThemedColumn(themedVNode);
      const innerRes = layoutNode(syntheticColumn, x, y, rectW, rectH, "column", rectW, rectH);
      if (!innerRes.ok) {
        computed = innerRes;
        break;
      }
      computed = {
        ok: true,
        value: {
          vnode,
          rect: { x, y, w: rectW, h: rectH },
          children: innerRes.value.children,
        },
      };
      break;
    }
    case "grid": {
      computed = layoutGridKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
      break;
    }
    case "box": {
      computed = layoutBoxKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
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
      computed = layoutBoxKinds(vnode, x, y, rectW, rectH, axis, measureNode, layoutNode);
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
    setLayoutCacheValue(axisMap, maxW, maxH, forcedW, forcedH, x, y, computed);
  }

  return computed;
}

/** Measure a VNode tree without positioning (public API). */
export function measure(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutResult<Size> {
  const legacyUsage = findLegacyConstraintUsage(node);
  if (legacyUsage !== null) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: `Legacy size constraint usage detected: ${legacyUsage}`,
      },
    };
  }
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
  const legacyUsage = findLegacyConstraintUsage(node);
  if (legacyUsage !== null) {
    return {
      ok: false,
      fatal: {
        code: "ZRUI_INVALID_PROPS",
        detail: `Legacy size constraint usage detected: ${legacyUsage}`,
      },
    };
  }
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
