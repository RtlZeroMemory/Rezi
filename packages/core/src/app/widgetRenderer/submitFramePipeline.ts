import type { LayoutTree } from "../../layout/layout.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import type { Rect } from "../../layout/types.js";
import { getRuntimeNodeDamageRect } from "../../renderer/renderToDrawlist/damageBounds.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";

const ZERO_RECT: Rect = { x: 0, y: 0, w: 0, h: 0 };
const HASH_FNV_OFFSET = 0x811c9dc5;
const HASH_FNV_PRIME = 0x01000193;

const STACK_LAYOUT_KEYS: readonly string[] = Object.freeze([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flex",
  "flexShrink",
  "flexBasis",
  "aspectRatio",
  "alignSelf",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "gridColumn",
  "gridRow",
  "colSpan",
  "rowSpan",
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "pad",
  "gap",
  "align",
  "justify",
  "items",
]);

const BOX_LAYOUT_KEYS: readonly string[] = Object.freeze([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flex",
  "flexShrink",
  "flexBasis",
  "aspectRatio",
  "alignSelf",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "gridColumn",
  "gridRow",
  "colSpan",
  "rowSpan",
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "pad",
  "gap",
  "border",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "title",
  "titleAlign",
]);

const GRID_LAYOUT_KEYS: readonly string[] = Object.freeze([
  "columns",
  "rows",
  "gap",
  "rowGap",
  "columnGap",
]);

function hashU32(hash: number, value: number): number {
  return Math.imul((hash ^ (value >>> 0)) >>> 0, HASH_FNV_PRIME) >>> 0;
}

function hashNumber(hash: number, value: number): number {
  if (!Number.isFinite(value)) return hashU32(hash, 0x7f800001);
  const normalized = Number.isInteger(value) ? value : Math.trunc(value * 1024);
  return hashU32(hash, normalized);
}

function hashString(hash: number, value: string): number {
  let out = hashU32(hash, value.length);
  for (let i = 0; i < value.length; i++) {
    out = hashU32(out, value.charCodeAt(i));
  }
  return out;
}

function measureTextCellsFast(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return measureTextCells(text);
  }
  return text.length;
}

function hashLayoutPropValue(hash: number, value: unknown): number | null {
  if (value === undefined) return hashU32(hash, 0);
  if (value === null) return hashU32(hash, 1);
  if (typeof value === "boolean") return hashU32(hash, value ? 2 : 3);
  if (typeof value === "number") return hashNumber(hash, value);
  if (typeof value === "string") return hashString(hash, value);
  return null;
}

function hashSelectedLayoutProps(
  hash: number,
  props: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): number | null {
  let out = hash;
  for (const key of keys) {
    out = hashString(out, key);
    const valueHash = hashLayoutPropValue(out, props[key]);
    if (valueHash === null) return null;
    out = valueHash;
  }
  return out;
}

function hashChildOrder(hash: number, node: RuntimeInstance): number {
  let out = hashNumber(hash, node.children.length);
  for (const child of node.children) {
    out = hashNumber(out, child.instanceId);
  }
  return out;
}

function hashPropsValue(hash: number, key: string, value: unknown): number | null {
  const withKey = hashString(hash, key);
  return hashLayoutPropValue(withKey, value);
}

function hashSizesArray(hash: number, sizes: readonly unknown[]): number | null {
  let out = hashNumber(hash, sizes.length);
  for (let i = 0; i < sizes.length; i++) {
    const valueHash = hashLayoutPropValue(out, sizes[i]);
    if (valueHash === null) return null;
    out = valueHash;
  }
  return out;
}

function computeLayoutStabilitySignature(node: RuntimeInstance): number | null {
  switch (node.vnode.kind) {
    case "text": {
      const props = node.vnode.props as Readonly<{ maxWidth?: unknown; wrap?: unknown }>;
      const maxWidthRaw = props.maxWidth;
      const maxWidth =
        maxWidthRaw === undefined
          ? undefined
          : typeof maxWidthRaw === "number" &&
              Number.isFinite(maxWidthRaw) &&
              Number.isInteger(maxWidthRaw) &&
              maxWidthRaw >= 0
            ? maxWidthRaw
            : null;
      if (maxWidth === null) return null;
      const wrap = props.wrap === true;

      const measuredWidth = measureTextCellsFast(node.vnode.text);
      const cappedWidth =
        maxWidth === undefined ? measuredWidth : Math.min(measuredWidth, maxWidth);

      let hash = hashString(HASH_FNV_OFFSET, "text");
      hash = hashNumber(hash, cappedWidth);
      hash = hashString(hash, "maxWidth");
      const next = hashLayoutPropValue(hash, maxWidth);
      if (next === null) return null;
      hash = next;
      const wrapHash = hashPropsValue(hash, "wrap", wrap);
      if (wrapHash === null) return null;
      hash = wrapHash;
      if (wrap) {
        hash = hashString(hash, "wrapText");
        hash = hashString(hash, node.vnode.text);
      }
      return hash;
    }
    case "button": {
      const props = node.vnode.props as Readonly<{ label?: unknown; px?: unknown }>;
      if (typeof props.label !== "string") return null;
      const px =
        typeof props.px === "number" && Number.isFinite(props.px) && props.px >= 0
          ? Math.trunc(props.px)
          : 1;
      let hash = hashString(HASH_FNV_OFFSET, "button");
      hash = hashNumber(hash, measureTextCellsFast(props.label));
      hash = hashNumber(hash, px);
      return hash;
    }
    case "input": {
      const props = node.vnode.props as Readonly<{ value?: unknown }>;
      if (typeof props.value !== "string") return null;
      let hash = hashString(HASH_FNV_OFFSET, "input");
      hash = hashNumber(hash, measureTextCellsFast(props.value));
      return hash;
    }
    case "spacer": {
      const props = node.vnode.props as Readonly<{ size?: unknown; flex?: unknown }>;
      let hash = hashString(HASH_FNV_OFFSET, "spacer");
      const size = typeof props.size === "number" && Number.isFinite(props.size) ? props.size : 1;
      const flex = typeof props.flex === "number" && Number.isFinite(props.flex) ? props.flex : 0;
      hash = hashNumber(hash, size);
      hash = hashNumber(hash, flex);
      return hash;
    }
    case "focusZone":
    case "focusTrap": {
      let hash = hashString(HASH_FNV_OFFSET, node.vnode.kind);
      hash = hashChildOrder(hash, node);
      return hash;
    }
    case "divider": {
      const props = node.vnode.props as Readonly<{ direction?: unknown }>;
      let hash = hashString(HASH_FNV_OFFSET, "divider");
      hash = hashString(hash, typeof props.direction === "string" ? props.direction : "horizontal");
      return hash;
    }
    case "row":
    case "column": {
      const props = node.vnode.props as Readonly<Record<string, unknown>>;
      let hash = hashString(HASH_FNV_OFFSET, node.vnode.kind);
      const next = hashSelectedLayoutProps(hash, props, STACK_LAYOUT_KEYS);
      if (next === null) return null;
      hash = hashChildOrder(next, node);
      return hash;
    }
    case "box": {
      const props = node.vnode.props as Readonly<Record<string, unknown>>;
      let hash = hashString(HASH_FNV_OFFSET, "box");
      const next = hashSelectedLayoutProps(hash, props, BOX_LAYOUT_KEYS);
      if (next === null) return null;
      hash = hashChildOrder(next, node);
      return hash;
    }
    case "grid": {
      const props = node.vnode.props as Readonly<Record<string, unknown>>;
      let hash = hashString(HASH_FNV_OFFSET, "grid");
      const next = hashSelectedLayoutProps(hash, props, GRID_LAYOUT_KEYS);
      if (next === null) return null;
      hash = next;
      hash = hashChildOrder(hash, node);
      return hash;
    }
    case "table": {
      const props = node.vnode.props as Readonly<{ columns?: unknown; data?: unknown }>;
      if (!Array.isArray(props.columns) || !Array.isArray(props.data)) return null;

      let hash = hashString(HASH_FNV_OFFSET, "table");
      hash = hashNumber(hash, props.columns.length);
      for (let i = 0; i < props.columns.length; i++) {
        const col = props.columns[i];
        if (!col || typeof col !== "object") return null;
        const widthHash = hashPropsValue(hash, "width", (col as { width?: unknown }).width);
        if (widthHash === null) return null;
        hash = widthHash;
        const flexHash = hashPropsValue(hash, "flex", (col as { flex?: unknown }).flex);
        if (flexHash === null) return null;
        hash = flexHash;
      }
      hash = hashNumber(hash, props.data.length);
      return hash;
    }
    case "tabs": {
      const props = node.vnode.props as Readonly<{ tabs?: unknown; activeTab?: unknown }>;
      if (!Array.isArray(props.tabs)) return null;

      let selectedIndex = -1;
      if (typeof props.activeTab === "string") {
        for (let i = 0; i < props.tabs.length; i++) {
          const tab = props.tabs[i];
          if (
            tab &&
            typeof tab === "object" &&
            (tab as { key?: unknown }).key === props.activeTab
          ) {
            selectedIndex = i;
            break;
          }
        }
      }

      let hash = hashString(HASH_FNV_OFFSET, "tabs");
      hash = hashNumber(hash, props.tabs.length);
      hash = hashNumber(hash, selectedIndex);
      return hash;
    }
    case "accordion": {
      const props = node.vnode.props as Readonly<{ items?: unknown; expanded?: unknown }>;
      if (!Array.isArray(props.items) || !Array.isArray(props.expanded)) return null;

      let hash = hashString(HASH_FNV_OFFSET, "accordion");
      hash = hashNumber(hash, props.items.length);
      hash = hashNumber(hash, props.expanded.length);
      for (let i = 0; i < props.expanded.length; i++) {
        const next = hashLayoutPropValue(hash, props.expanded[i]);
        if (next === null) return null;
        hash = next;
      }
      return hash;
    }
    case "modal": {
      const props = node.vnode.props as Readonly<{
        open?: unknown;
        width?: unknown;
        height?: unknown;
        minWidth?: unknown;
        minHeight?: unknown;
        maxWidth?: unknown;
      }>;
      let hash = hashString(HASH_FNV_OFFSET, "modal");
      const openHash = hashPropsValue(hash, "open", props.open === undefined ? true : props.open);
      if (openHash === null) return null;
      hash = openHash;
      const widthHash = hashPropsValue(hash, "width", props.width);
      if (widthHash === null) return null;
      hash = widthHash;
      const heightHash = hashPropsValue(hash, "height", props.height);
      if (heightHash === null) return null;
      hash = heightHash;
      const minWidthHash = hashPropsValue(hash, "minWidth", props.minWidth);
      if (minWidthHash === null) return null;
      hash = minWidthHash;
      const minHeightHash = hashPropsValue(hash, "minHeight", props.minHeight);
      if (minHeightHash === null) return null;
      hash = minHeightHash;
      const maxWidthHash = hashPropsValue(hash, "maxWidth", props.maxWidth);
      if (maxWidthHash === null) return null;
      hash = maxWidthHash;
      return hash;
    }
    case "virtualList": {
      const props = node.vnode.props as Readonly<{
        items?: unknown;
        itemHeight?: unknown;
        viewport?: unknown;
      }>;
      if (!Array.isArray(props.items)) return null;

      let hash = hashString(HASH_FNV_OFFSET, "virtualList");
      hash = hashNumber(hash, props.items.length);

      const itemHeightValue =
        typeof props.itemHeight === "function" ? "function" : props.itemHeight;
      const itemHeightHash = hashPropsValue(hash, "itemHeight", itemHeightValue);
      if (itemHeightHash === null) return null;
      hash = itemHeightHash;

      const viewport = props.viewport;
      if (viewport && typeof viewport === "object") {
        const v = viewport as { w?: unknown; h?: unknown; width?: unknown; height?: unknown };
        const vwHash = hashPropsValue(hash, "viewport.w", v.w ?? v.width);
        if (vwHash === null) return null;
        hash = vwHash;
        const vhHash = hashPropsValue(hash, "viewport.h", v.h ?? v.height);
        if (vhHash === null) return null;
        hash = vhHash;
      } else {
        const viewportHash = hashPropsValue(hash, "viewport", viewport);
        if (viewportHash === null) return null;
        hash = viewportHash;
      }
      return hash;
    }
    case "splitPane": {
      const props = node.vnode.props as Readonly<{
        direction?: unknown;
        sizes?: unknown;
        sizeMode?: unknown;
        minSizes?: unknown;
        maxSizes?: unknown;
        dividerSize?: unknown;
        collapsible?: unknown;
        collapsed?: unknown;
      }>;
      if (!Array.isArray(props.sizes)) return null;

      let hash = hashString(HASH_FNV_OFFSET, "splitPane");
      const directionHash = hashPropsValue(hash, "direction", props.direction);
      if (directionHash === null) return null;
      hash = directionHash;
      const sizeModeHash = hashPropsValue(hash, "sizeMode", props.sizeMode);
      if (sizeModeHash === null) return null;
      hash = sizeModeHash;
      const sizesHash = hashSizesArray(hash, props.sizes);
      if (sizesHash === null) return null;
      hash = sizesHash;
      const minSizes = props.minSizes;
      if (Array.isArray(minSizes)) {
        hash = hashString(hash, "minSizes");
        const minSizesHash = hashSizesArray(hash, minSizes);
        if (minSizesHash === null) return null;
        hash = minSizesHash;
      } else {
        const minSizesHash = hashPropsValue(hash, "minSizes", minSizes);
        if (minSizesHash === null) return null;
        hash = minSizesHash;
      }
      const maxSizes = props.maxSizes;
      if (Array.isArray(maxSizes)) {
        hash = hashString(hash, "maxSizes");
        const maxSizesHash = hashSizesArray(hash, maxSizes);
        if (maxSizesHash === null) return null;
        hash = maxSizesHash;
      } else {
        const maxSizesHash = hashPropsValue(hash, "maxSizes", maxSizes);
        if (maxSizesHash === null) return null;
        hash = maxSizesHash;
      }
      const dividerHash = hashPropsValue(hash, "dividerSize", props.dividerSize);
      if (dividerHash === null) return null;
      hash = dividerHash;
      const collapsibleHash = hashPropsValue(hash, "collapsible", props.collapsible);
      if (collapsibleHash === null) return null;
      hash = collapsibleHash;
      const collapsed = props.collapsed;
      if (Array.isArray(collapsed)) {
        hash = hashString(hash, "collapsed");
        const collapsedHash = hashSizesArray(hash, collapsed);
        if (collapsedHash === null) return null;
        hash = collapsedHash;
      } else {
        const collapsedHash = hashPropsValue(hash, "collapsed", collapsed);
        if (collapsedHash === null) return null;
        hash = collapsedHash;
      }
      hash = hashChildOrder(hash, node);
      return hash;
    }
    case "breadcrumb": {
      const props = node.vnode.props as Readonly<{ items?: unknown }>;
      const itemCount = Array.isArray(props.items) ? props.items.length : node.children.length;
      let hash = hashString(HASH_FNV_OFFSET, "breadcrumb");
      hash = hashNumber(hash, itemCount);
      return hash;
    }
    case "pagination": {
      const props = node.vnode.props as Readonly<{ totalPages?: unknown }>;
      const itemCount =
        node.children.length > 0
          ? node.children.length
          : typeof props.totalPages === "number" && Number.isFinite(props.totalPages)
            ? Math.max(0, Math.trunc(props.totalPages))
            : 0;
      let hash = hashString(HASH_FNV_OFFSET, "pagination");
      hash = hashNumber(hash, itemCount);
      return hash;
    }
    default:
      return null;
  }
}

/**
 * Update per-instance layout stability signatures and report whether layout
 * must be recomputed for the committed tree.
 *
 * This enables a fast path where state commits skip layout when:
 * - no layout-dirty signal was raised, and
 * - all committed nodes in this tree belong to the supported fingerprint set,
 * - and no fingerprint changed (including child order).
 *
 * For unsupported kinds, it conservatively requests layout.
 */
export function updateLayoutStabilitySignatures(
  runtimeRoot: RuntimeInstance,
  prevByInstanceId: Map<InstanceId, number>,
  nextByInstanceId: Map<InstanceId, number>,
  pooledRuntimeStack: RuntimeInstance[],
): boolean {
  nextByInstanceId.clear();
  pooledRuntimeStack.length = 0;
  pooledRuntimeStack.push(runtimeRoot);

  let changed = false;
  while (pooledRuntimeStack.length > 0) {
    const node = pooledRuntimeStack.pop();
    if (!node) continue;

    const signature = computeLayoutStabilitySignature(node);
    if (signature === null) {
      prevByInstanceId.clear();
      nextByInstanceId.clear();
      pooledRuntimeStack.length = 0;
      return true;
    }

    nextByInstanceId.set(node.instanceId, signature);
    const prev = prevByInstanceId.get(node.instanceId);
    if (prev !== signature) changed = true;

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) pooledRuntimeStack.push(child);
    }
  }

  if (!changed && prevByInstanceId.size !== nextByInstanceId.size) {
    changed = true;
  }

  prevByInstanceId.clear();
  for (const [instanceId, signature] of nextByInstanceId) {
    prevByInstanceId.set(instanceId, signature);
  }
  nextByInstanceId.clear();

  return changed;
}

export function buildLayoutRectIndexes(
  layoutTree: LayoutTree,
  runtimeRoot: RuntimeInstance,
  pooledRectByInstanceId: Map<InstanceId, Rect>,
  pooledDamageRectByInstanceId: Map<InstanceId, Rect>,
  pooledRectById: Map<string, Rect>,
  pooledDamageRectById: Map<string, Rect>,
  pooledSplitPaneChildRectsById: Map<string, readonly Rect[]>,
  pooledLayoutStack: LayoutTree[],
  pooledRuntimeStack: RuntimeInstance[],
): void {
  pooledRectByInstanceId.clear();
  pooledDamageRectByInstanceId.clear();
  pooledRectById.clear();
  pooledDamageRectById.clear();
  pooledSplitPaneChildRectsById.clear();
  pooledLayoutStack.length = 0;
  pooledRuntimeStack.length = 0;
  pooledLayoutStack.push(layoutTree);
  pooledRuntimeStack.push(runtimeRoot);
  while (pooledLayoutStack.length > 0 && pooledRuntimeStack.length > 0) {
    const n = pooledLayoutStack.pop();
    const r = pooledRuntimeStack.pop();
    if (!n || !r) continue;
    pooledRectByInstanceId.set(r.instanceId, n.rect);
    const damageRect = getRuntimeNodeDamageRect(r, n.rect);
    pooledDamageRectByInstanceId.set(r.instanceId, damageRect);
    const id = (r.vnode as { props?: { id?: unknown } }).props?.id;
    if (typeof id === "string" && id.length > 0 && !pooledRectById.has(id)) {
      pooledRectById.set(id, n.rect);
      pooledDamageRectById.set(id, damageRect);
    }
    if (r.vnode.kind === "splitPane") {
      const sid = (r.vnode.props as { id?: unknown }).id;
      if (typeof sid === "string" && sid.length > 0) {
        const childRects: Rect[] = new Array(n.children.length);
        for (let i = 0; i < n.children.length; i++) {
          const child = n.children[i];
          childRects[i] = child ? child.rect : ZERO_RECT;
        }
        pooledSplitPaneChildRectsById.set(sid, childRects);
      }
    }
    const childCount = Math.min(n.children.length, r.children.length);
    for (let i = childCount - 1; i >= 0; i--) {
      const lc = n.children[i];
      const rc = r.children[i];
      if (lc && rc) {
        pooledLayoutStack.push(lc);
        pooledRuntimeStack.push(rc);
      }
    }
  }
}
