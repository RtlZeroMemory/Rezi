/**
 * packages/core/src/runtime/reconcile.ts — VNode tree reconciliation.
 *
 * Why: Matches new VNode children against previous children to determine which
 * instances can be reused, which are new, and which should be unmounted. Uses
 * key-based matching when keys are provided, index-based otherwise.
 *
 * Reconciliation rules:
 *   - Keyed children match by key (deterministic across reordering)
 *   - Unkeyed children match by index (position-based)
 *   - Duplicate keys within siblings are fatal errors
 *   - Reused instances keep their instanceId; new instances get fresh IDs
 *
 * @see docs/guide/runtime-and-layout.md
 */

import type { VNode } from "../index.js";
import type { InstanceId, InstanceIdAllocator } from "./instance.js";

/** Slot identifier: keyed ("k:mykey") or indexed ("i:0"). */
export type SlotId = `k:${string}` | `i:${number}`;

/** Fatal error from reconciliation (duplicate keys). */
export type ReconcileFatal = Readonly<{
  code: "ZRUI_DUPLICATE_KEY";
  detail: string;
}>;

/** Result of matching a single child in reconciliation. */
export type ReconciledChild = Readonly<{
  slotId: SlotId;
  vnode: VNode;
  instanceId: InstanceId;
  kind: "reused" | "new";
  prevIndex: number | null;
}>;

/** Successful reconciliation result with instance lifecycle information. */
export type ReconcileChildrenOk = Readonly<{
  nextChildren: readonly ReconciledChild[];
  reusedInstanceIds: readonly InstanceId[];
  newInstanceIds: readonly InstanceId[];
  unmountedInstanceIds: readonly InstanceId[];
}>;

export type ReconcileChildrenResult =
  | Readonly<{ ok: true; value: ReconcileChildrenOk }>
  | Readonly<{ ok: false; fatal: ReconcileFatal }>;

type PrevChild = Readonly<{ instanceId: InstanceId; vnode: VNode }>;

function getVNodeKey(v: VNode): string | undefined {
  switch (v.kind) {
    case "text":
      return v.props.key;
    case "box":
    case "row":
    case "column":
      return v.props.key;
    case "spacer":
      return v.props.key;
    case "button":
      return v.props.key;
    case "input":
      return v.props.key;
    case "focusZone":
    case "focusTrap":
      return v.props.key;
    case "virtualList":
      return v.props.key;
    case "layers":
      return v.props.key;
    case "modal":
      return v.props.key;
    case "dropdown":
      return v.props.key;
    case "layer":
      return v.props.key;
    case "table":
      return v.props.key;
    case "tree":
      return v.props.key;
    case "field":
      return v.props.key;
    case "select":
      return v.props.key;
    case "checkbox":
      return v.props.key;
    case "radioGroup":
      return v.props.key;
  }
}

/** Compute the slot ID for a child: keyed if key present, indexed otherwise. */
export function slotIdForChild(child: VNode, childIndex: number): SlotId {
  const key = getVNodeKey(child);
  if (key !== undefined) return `k:${key}`;
  return `i:${childIndex}`;
}

function duplicateKeyDetail(
  parentInstanceId: InstanceId,
  key: string,
  aIndex: number,
  bIndex: number,
): string {
  // Deterministic, stable detail string (no object dumps, no JSON ordering concerns).
  return `duplicate sibling key "${key}" under parent instanceId=${String(parentInstanceId)} (child indices ${String(
    aIndex,
  )} and ${String(bIndex)})`;
}

function containsAnyKeyInPrevChildren(prevChildren: readonly PrevChild[]): boolean {
  for (let i = 0; i < prevChildren.length; i++) {
    const prev = prevChildren[i];
    if (!prev) continue;
    if (getVNodeKey(prev.vnode) !== undefined) return true;
  }
  return false;
}

function containsAnyKeyInNextChildren(nextVChildren: readonly VNode[]): boolean {
  for (let i = 0; i < nextVChildren.length; i++) {
    const vnode = nextVChildren[i];
    if (!vnode) continue;
    if (getVNodeKey(vnode) !== undefined) return true;
  }
  return false;
}

/** Shared empty InstanceId arrays to avoid allocation in common reconciliation cases. */
const EMPTY_INSTANCE_IDS: readonly InstanceId[] = Object.freeze([]);

function reconcileUnkeyedChildren(
  prevChildren: readonly PrevChild[],
  nextVChildren: readonly VNode[],
  allocator: InstanceIdAllocator,
): ReconcileChildrenOk {
  const prevLen = prevChildren.length;
  const nextLen = nextVChildren.length;
  const sharedLength = Math.min(prevLen, nextLen);

  // Pre-allocate with known sizes to avoid array growth.
  const nextChildren: ReconciledChild[] = new Array(nextLen);
  let nextChildrenCount = 0;
  const reusedInstanceIds: InstanceId[] = new Array(sharedLength);
  let reusedCount = 0;
  const hasNewChildren = nextLen > prevLen;
  const newInstanceIds: InstanceId[] = hasNewChildren ? new Array(nextLen - prevLen) : [];
  let newCount = 0;

  for (let i = 0; i < sharedLength; i++) {
    const prev = prevChildren[i];
    const vnode = nextVChildren[i];
    if (!vnode) continue;
    const slotId: SlotId = `i:${i}`;
    if (prev) {
      const instanceId = prev.instanceId;
      reusedInstanceIds[reusedCount++] = instanceId;
      nextChildren[nextChildrenCount++] = {
        slotId,
        vnode,
        instanceId,
        kind: "reused",
        prevIndex: i,
      };
      continue;
    }
    const instanceId = allocator.allocate();
    newInstanceIds[newCount++] = instanceId;
    nextChildren[nextChildrenCount++] = { slotId, vnode, instanceId, kind: "new", prevIndex: null };
  }

  for (let i = sharedLength; i < nextLen; i++) {
    const vnode = nextVChildren[i];
    if (!vnode) continue;
    const slotId: SlotId = `i:${i}`;
    const instanceId = allocator.allocate();
    newInstanceIds[newCount++] = instanceId;
    nextChildren[nextChildrenCount++] = { slotId, vnode, instanceId, kind: "new", prevIndex: null };
  }

  // Trim pre-allocated arrays to actual size.
  nextChildren.length = nextChildrenCount;
  reusedInstanceIds.length = reusedCount;
  newInstanceIds.length = newCount;

  const unmountedInstanceIds: InstanceId[] = [];
  if (prevLen > nextLen) {
    for (let i = sharedLength; i < prevLen; i++) {
      const prev = prevChildren[i];
      if (prev) unmountedInstanceIds.push(prev.instanceId);
    }
  }

  return {
    nextChildren,
    reusedInstanceIds,
    newInstanceIds,
    unmountedInstanceIds:
      unmountedInstanceIds.length === 0
        ? (EMPTY_INSTANCE_IDS as InstanceId[])
        : unmountedInstanceIds,
  };
}

/**
 * Reconcile previous children against new VNode children.
 *
 * @param parentInstanceId - ID of parent instance (for error messages)
 * @param prevChildren - Previous children with instance IDs
 * @param nextVChildren - New VNode children to reconcile
 * @param allocator - Instance ID allocator for new children
 * @returns Reconciliation result or fatal error for duplicate keys
 */
export function reconcileChildren(
  parentInstanceId: InstanceId,
  prevChildren: readonly PrevChild[],
  nextVChildren: readonly VNode[],
  allocator: InstanceIdAllocator,
): ReconcileChildrenResult {
  const prevContainsKeys = containsAnyKeyInPrevChildren(prevChildren);
  const nextContainsKeys = containsAnyKeyInNextChildren(nextVChildren);
  if (!prevContainsKeys && !nextContainsKeys) {
    return {
      ok: true,
      value: reconcileUnkeyedChildren(prevChildren, nextVChildren, allocator),
    };
  }

  const prevBySlotId = new Map<SlotId, number>();

  for (let i = 0; i < prevChildren.length; i++) {
    const prev = prevChildren[i];
    if (!prev) continue;
    const slotId = slotIdForChild(prev.vnode, i);
    if (slotId.startsWith("k:")) {
      const existing = prevBySlotId.get(slotId);
      if (existing !== undefined) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_DUPLICATE_KEY",
            detail: duplicateKeyDetail(parentInstanceId, slotId.slice(2), existing, i),
          },
        };
      }
    }
    prevBySlotId.set(slotId, i);
  }

  const seenNextKeySlot = new Map<string, number>();

  const usedPrev = new Array<boolean>(prevChildren.length).fill(false);
  const nextChildren: ReconciledChild[] = [];
  const reusedInstanceIds: InstanceId[] = [];
  const newInstanceIds: InstanceId[] = [];

  for (let nextIndex = 0; nextIndex < nextVChildren.length; nextIndex++) {
    const vnode = nextVChildren[nextIndex];
    if (!vnode) continue;
    const slotId = slotIdForChild(vnode, nextIndex);

    if (slotId.startsWith("k:")) {
      const key = slotId.slice(2);
      const existing = seenNextKeySlot.get(key);
      if (existing !== undefined) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_DUPLICATE_KEY",
            detail: duplicateKeyDetail(parentInstanceId, key, existing, nextIndex),
          },
        };
      }
      seenNextKeySlot.set(key, nextIndex);
    }

    const prevIndex = prevBySlotId.get(slotId);
    const prevChild = prevIndex !== undefined ? prevChildren[prevIndex] : undefined;
    if (prevIndex !== undefined && prevChild !== undefined && usedPrev[prevIndex] === false) {
      usedPrev[prevIndex] = true;
      const instanceId = prevChild.instanceId;
      reusedInstanceIds.push(instanceId);
      nextChildren.push({ slotId, vnode, instanceId, kind: "reused", prevIndex });
      continue;
    }

    const instanceId = allocator.allocate();
    newInstanceIds.push(instanceId);
    nextChildren.push({ slotId, vnode, instanceId, kind: "new", prevIndex: null });
  }

  const unmountedInstanceIds: InstanceId[] = [];
  for (let i = 0; i < prevChildren.length; i++) {
    const prev = prevChildren[i];
    if (!usedPrev[i] && prev) unmountedInstanceIds.push(prev.instanceId);
  }

  return {
    ok: true,
    value: {
      nextChildren,
      reusedInstanceIds,
      newInstanceIds,
      unmountedInstanceIds,
    },
  };
}
