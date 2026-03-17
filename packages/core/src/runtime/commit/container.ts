import type { VNode } from "../../widgets/types.js";
import type { InstanceId } from "../instance.js";
import { reconcileChildren } from "../reconcile.js";
import { currentCompositeTheme, resolveCompositeChildTheme } from "./composite.js";
import {
  __commitDiag,
  canFastReuseContainerSelf,
  diagWhichPropFails,
  hasDirtyChild,
  runtimeChildrenChanged,
} from "./equality.js";
import type { CommitCtx, CommitNodeFn, CommitNodeResult, RuntimeInstance } from "./shared.js";
import {
  collectSubtreeInstanceIds,
  deleteLocalStateForSubtree,
  markCompositeSubtreeStale,
  tryScheduleExitAnimation,
} from "./transitions.js";
import { commitChildrenForVNode, isVNode } from "./validation.js";

export function appendNodePath(nodePath: readonly string[], segment: string): string[] {
  return [...nodePath, segment];
}

export function formatNodePath(nodePath: readonly string[]): string {
  return nodePath.join("/");
}

function rewriteCommittedVNode(next: VNode, committedChildren: readonly VNode[]): VNode {
  if (next.kind === "modal") {
    const props = next.props as { content?: unknown; actions?: unknown };
    const contentPresent = isVNode(props.content);
    const nextContent = contentPresent ? (committedChildren[0] ?? props.content) : props.content;
    const actionsStart = contentPresent ? 1 : 0;
    const actions = committedChildren.slice(actionsStart);

    return {
      ...next,
      props: {
        ...(next.props as Record<string, unknown>),
        ...(isVNode(nextContent) ? { content: nextContent } : {}),
        actions: actions.length > 0 ? actions : undefined,
      },
    } as unknown as VNode;
  }

  if (next.kind === "layer") {
    const props = next.props as { content?: unknown };
    const nextContent = committedChildren[0] ?? props.content;
    return {
      ...next,
      props: {
        ...(next.props as Record<string, unknown>),
        ...(isVNode(nextContent) ? { content: nextContent } : {}),
      },
    } as unknown as VNode;
  }

  if (
    next.kind === "fragment" ||
    next.kind === "box" ||
    next.kind === "row" ||
    next.kind === "column" ||
    next.kind === "themed" ||
    next.kind === "grid" ||
    next.kind === "focusZone" ||
    next.kind === "focusTrap" ||
    next.kind === "layers" ||
    next.kind === "field" ||
    next.kind === "tabs" ||
    next.kind === "accordion" ||
    next.kind === "breadcrumb" ||
    next.kind === "pagination" ||
    next.kind === "splitPane" ||
    next.kind === "panelGroup" ||
    next.kind === "resizablePanel"
  ) {
    return {
      ...next,
      children: committedChildren,
    } as unknown as VNode;
  }

  return next;
}

export function commitContainer(
  instanceId: InstanceId,
  vnode: VNode,
  prev: RuntimeInstance | null,
  ctx: CommitCtx,
  nodePath: string[],
  depth: number,
  commitNode: CommitNodeFn,
): CommitNodeResult {
  void depth;
  const parentProps = vnode.props as { id?: unknown } | undefined;
  const parentId =
    typeof parentProps?.id === "string" && parentProps.id.length > 0 ? parentProps.id : undefined;

  const prevChildren = prev ? prev.children : [];
  const compositeWrapperChildren = ctx.containerChildOverrides.get(instanceId) ?? null;
  const res = reconcileChildren(
    instanceId,
    prevChildren,
    compositeWrapperChildren ? compositeWrapperChildren : commitChildrenForVNode(vnode),
    ctx.allocator,
    {
      kind: vnode.kind,
      ...(parentId === undefined ? {} : { id: parentId }),
    },
  );
  if (!res.ok) return { ok: false, fatal: res.fatal };

  const byPrevIndex = prevChildren;
  let byPrevInstanceId: Map<InstanceId, RuntimeInstance> | null = null;
  if (res.value.unmountedInstanceIds.length > 0) {
    byPrevInstanceId = new Map<InstanceId, RuntimeInstance>();
    for (const c of prevChildren) byPrevInstanceId.set(c.instanceId, c);
  }

  const parentCompositeTheme = currentCompositeTheme(ctx);
  let pushedCompositeTheme = false;
  if (parentCompositeTheme !== null) {
    const nextCompositeTheme = resolveCompositeChildTheme(parentCompositeTheme, vnode);
    if (nextCompositeTheme !== parentCompositeTheme) {
      ctx.compositeThemeStack.push(nextCompositeTheme);
      pushedCompositeTheme = true;
    }
  }

  try {
    const canTryFastReuse =
      prev !== null &&
      res.value.newInstanceIds.length === 0 &&
      res.value.unmountedInstanceIds.length === 0 &&
      res.value.nextChildren.length === prevChildren.length;
    let childOrderStable = true;
    if (canTryFastReuse) {
      for (let i = 0; i < res.value.nextChildren.length; i++) {
        const child = res.value.nextChildren[i];
        if (!child || child.prevIndex !== i) {
          childOrderStable = false;
          break;
        }
      }
    }

    let nextChildren: readonly RuntimeInstance[] | null = null;
    let committedChildVNodes: readonly VNode[] | null = null;

    if (canTryFastReuse) {
      let allChildrenSame = true;
      for (let i = 0; i < res.value.nextChildren.length; i++) {
        const child = res.value.nextChildren[i];
        if (!child) continue;
        const prevChild = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        const committed = commitNode(
          prevChild ?? null,
          child.instanceId,
          child.vnode,
          ctx,
          formatNodePath(appendNodePath(nodePath, child.slotId)),
        );
        if (!committed.ok) return committed;

        if (allChildrenSame && committed.value.root !== prevChild) {
          allChildrenSame = false;
          const len = res.value.nextChildren.length;
          const nextChildrenArr: RuntimeInstance[] = new Array(len);
          const committedChildVNodesArr: VNode[] = new Array(len);
          nextChildren = nextChildrenArr;
          committedChildVNodes = committedChildVNodesArr;
          for (let j = 0; j < i; j++) {
            const plan = res.value.nextChildren[j];
            if (!plan) continue;
            const pc = plan.prevIndex !== null ? byPrevIndex[plan.prevIndex] : null;
            if (!pc) continue;
            nextChildrenArr[j] = pc;
            committedChildVNodesArr[j] = pc.vnode;
          }
        }

        if (!allChildrenSame) {
          if (!nextChildren || !committedChildVNodes) {
            return {
              ok: false,
              fatal: {
                code: "ZRUI_INVALID_PROPS",
                detail: "commitNode: internal fast-reuse invariant",
              },
            };
          }
          (nextChildren as RuntimeInstance[])[i] = committed.value.root;
          (committedChildVNodes as VNode[])[i] = committed.value.root.vnode;
        }
      }

      if (
        allChildrenSame &&
        prev !== null &&
        childOrderStable &&
        canFastReuseContainerSelf(prev.vnode, vnode)
      ) {
        const fastReuseCommittedChildren = prev.children.map((child) => child.vnode);
        (prev as { vnode: VNode }).vnode = rewriteCommittedVNode(vnode, fastReuseCommittedChildren);
        if (__commitDiag.enabled) {
          const wasDirty = prev.selfDirty;
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "fast-reuse",
            detail: wasDirty ? "was-dirty" : undefined,
          });
        }
        prev.selfDirty = false;
        prev.dirty = hasDirtyChild(prev.children);
        return { ok: true, value: { root: prev } };
      }

      if (
        !allChildrenSame &&
        prev !== null &&
        nextChildren !== null &&
        committedChildVNodes !== null &&
        canFastReuseContainerSelf(prev.vnode, vnode)
      ) {
        if (__commitDiag.enabled) {
          let childDiffs = 0;
          for (let ci = 0; ci < prevChildren.length; ci++) {
            if (prevChildren[ci] !== (nextChildren as readonly RuntimeInstance[])[ci]) childDiffs++;
          }
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "fast-reuse",
            detail: "children-changed" as "was-dirty" | undefined,
            childDiffs,
            prevChildren: prevChildren.length,
            nextChildren: (nextChildren as readonly RuntimeInstance[]).length,
          });
        }
        (prev as { children: readonly RuntimeInstance[] }).children = nextChildren;
        (prev as { vnode: VNode }).vnode = rewriteCommittedVNode(vnode, committedChildVNodes);
        prev.selfDirty = true;
        prev.dirty = true;
        return { ok: true, value: { root: prev } };
      }

      if (__commitDiag.enabled && prev !== null && canTryFastReuse) {
        if (!allChildrenSame) {
          let childDiffs = 0;
          for (let ci = 0; ci < prevChildren.length; ci++) {
            if (
              nextChildren &&
              prevChildren[ci] !== (nextChildren as readonly RuntimeInstance[])[ci]
            )
              childDiffs++;
          }
          const propsOk = canFastReuseContainerSelf(prev.vnode, vnode);
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "new-instance",
            detail: propsOk ? "children-changed" : "props+children",
            failingProp: propsOk ? undefined : diagWhichPropFails(prev.vnode, vnode),
            childDiffs,
            prevChildren: prevChildren.length,
            nextChildren: nextChildren
              ? (nextChildren as readonly RuntimeInstance[]).length
              : res.value.nextChildren.length,
          });
        } else if (!childOrderStable) {
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "new-instance",
            detail: "children-changed",
          });
        } else {
          __commitDiag.push({
            id: instanceId as number,
            kind: vnode.kind,
            reason: "new-instance",
            detail: "props-changed",
            failingProp: diagWhichPropFails(prev.vnode, vnode),
          });
        }
      }
    } else {
      const nextChildrenArr: RuntimeInstance[] = [];
      const committedChildVNodesArr: VNode[] = [];
      for (const child of res.value.nextChildren) {
        const prevChild = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        const committed = commitNode(
          prevChild ?? null,
          child.instanceId,
          child.vnode,
          ctx,
          formatNodePath(appendNodePath(nodePath, child.slotId)),
        );
        if (!committed.ok) return committed;
        nextChildrenArr.push(committed.value.root);
        committedChildVNodesArr.push(committed.value.root.vnode);
      }
      nextChildren = nextChildrenArr;
      committedChildVNodes = committedChildVNodesArr;
    }

    for (const unmountedId of res.value.unmountedInstanceIds) {
      const prevNode = byPrevInstanceId?.get(unmountedId);
      if (!prevNode) continue;
      if (tryScheduleExitAnimation(ctx, prevNode, instanceId)) {
        continue;
      }
      if (ctx.composite) {
        markCompositeSubtreeStale(ctx.composite.registry, prevNode);
      }
      deleteLocalStateForSubtree(ctx.localState, prevNode);
      collectSubtreeInstanceIds(prevNode, ctx.lists.unmounted);
    }

    if (!nextChildren || !committedChildVNodes) {
      const reorderedChildren: RuntimeInstance[] = [];
      const reorderedVNodes: VNode[] = [];
      for (const child of res.value.nextChildren) {
        const reused = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        if (!reused) continue;
        reorderedChildren.push(reused);
        reorderedVNodes.push(reused.vnode);
      }
      nextChildren = reorderedChildren;
      committedChildVNodes = reorderedVNodes;
    }
    if (!committedChildVNodes) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "commit invariant violated: missing committed child VNodes",
        },
      };
    }

    const propsChanged = prev === null || !canFastReuseContainerSelf(prev.vnode, vnode);
    const childrenChanged = prev === null || runtimeChildrenChanged(prevChildren, nextChildren);
    const selfDirty = propsChanged || childrenChanged;

    if (__commitDiag.enabled && !canTryFastReuse && prev !== null) {
      let cDiffs = 0;
      const minLen = Math.min(prevChildren.length, nextChildren.length);
      for (let ci = 0; ci < minLen; ci++) {
        if (prevChildren[ci] !== nextChildren[ci]) cDiffs++;
      }
      cDiffs += Math.abs(prevChildren.length - nextChildren.length);
      __commitDiag.push({
        id: instanceId as number,
        kind: vnode.kind,
        reason: "new-instance",
        detail:
          propsChanged && childrenChanged
            ? "props+children"
            : propsChanged
              ? "props-changed"
              : childrenChanged
                ? "children-changed"
                : "general-path",
        failingProp: propsChanged ? diagWhichPropFails(prev.vnode, vnode) : undefined,
        childDiffs: cDiffs,
        prevChildren: prevChildren.length,
        nextChildren: nextChildren.length,
      });
    } else if (__commitDiag.enabled && prev === null) {
      __commitDiag.push({
        id: instanceId as number,
        kind: vnode.kind,
        reason: "new-instance",
        detail: "no-prev",
      });
    }

    if (prev !== null && !propsChanged && childrenChanged) {
      (prev as { children: readonly RuntimeInstance[] }).children = nextChildren;
      (prev as { vnode: VNode }).vnode = rewriteCommittedVNode(vnode, committedChildVNodes);
      prev.selfDirty = true;
      prev.dirty = true;
      return { ok: true, value: { root: prev } };
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode: rewriteCommittedVNode(vnode, committedChildVNodes),
          children: nextChildren,
          dirty: selfDirty || childrenChanged || hasDirtyChild(nextChildren),
          selfDirty,
          renderPacketKey: prev?.renderPacketKey ?? 0,
          renderPacket: prev?.renderPacket ?? null,
        },
      },
    };
  } finally {
    if (pushedCompositeTheme) {
      ctx.compositeThemeStack.pop();
    }
  }
}
