import type { LayoutTree } from "../../layout/layout.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import type { Rect } from "../../layout/types.js";
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
  "aspectRatio",
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
  "aspectRatio",
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
  "pad",
  "border",
  "title",
  "titleAlign",
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

function computeLayoutStabilitySignature(node: RuntimeInstance): number | null {
  switch (node.vnode.kind) {
    case "text": {
      const props = node.vnode.props as Readonly<{ maxWidth?: unknown }>;
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

      const measuredWidth = measureTextCellsFast(node.vnode.text);
      const cappedWidth =
        maxWidth === undefined ? measuredWidth : Math.min(measuredWidth, maxWidth);

      let hash = hashString(HASH_FNV_OFFSET, "text");
      hash = hashNumber(hash, cappedWidth);
      hash = hashString(hash, "maxWidth");
      const next = hashLayoutPropValue(hash, maxWidth);
      if (next === null) return null;
      hash = next;
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
  pooledRectById: Map<string, Rect>,
  pooledSplitPaneChildRectsById: Map<string, readonly Rect[]>,
  pooledLayoutStack: LayoutTree[],
  pooledRuntimeStack: RuntimeInstance[],
): void {
  pooledRectByInstanceId.clear();
  pooledRectById.clear();
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
    const id = (r.vnode as { props?: { id?: unknown } }).props?.id;
    if (typeof id === "string" && id.length > 0 && !pooledRectById.has(id)) {
      pooledRectById.set(id, n.rect);
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
