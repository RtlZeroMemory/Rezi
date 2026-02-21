import type { VNode } from "../../index.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";

let activeDirtySet: Set<VNode> | null = null;
const dirtySetStack: Array<Set<VNode> | null> = [];

export function computeDirtyLayoutSet(
  root: RuntimeInstance,
  mountedIds: readonly InstanceId[],
  changedIds: readonly InstanceId[],
): Set<InstanceId> {
  const parentById = new Map<InstanceId, InstanceId | null>();
  const stack: RuntimeInstance[] = [root];
  parentById.set(root.instanceId, null);

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (!child) continue;
      parentById.set(child.instanceId, node.instanceId);
      stack.push(child);
    }
  }

  const dirty = new Set<InstanceId>();

  function addWithAncestors(instanceId: InstanceId): void {
    if (!parentById.has(instanceId)) return;
    let current: InstanceId | null = instanceId;
    while (current !== null) {
      if (dirty.has(current)) break;
      dirty.add(current);
      current = parentById.get(current) ?? null;
    }
  }

  for (const mountedId of mountedIds) addWithAncestors(mountedId);
  for (const changedId of changedIds) addWithAncestors(changedId);

  return dirty;
}

export function instanceDirtySetToVNodeDirtySet(
  root: RuntimeInstance,
  dirtyInstanceIds: ReadonlySet<InstanceId>,
): Set<VNode> {
  const dirtyVNodes = new Set<VNode>();
  const stack: RuntimeInstance[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (dirtyInstanceIds.has(node.instanceId)) {
      dirtyVNodes.add(node.vnode);
    }
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) stack.push(child);
    }
  }

  return dirtyVNodes;
}

export function getActiveDirtySet(): Set<VNode> | null {
  return activeDirtySet;
}

export function pushDirtySet(dirtySet: Set<VNode> | null): void {
  dirtySetStack.push(dirtySet);
  activeDirtySet = dirtySet;
}

export function popDirtySet(): void {
  dirtySetStack.pop();
  activeDirtySet =
    dirtySetStack.length > 0 ? (dirtySetStack[dirtySetStack.length - 1] ?? null) : null;
}
