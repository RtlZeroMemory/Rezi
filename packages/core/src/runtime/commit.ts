/**
 * packages/core/src/runtime/commit.ts — VNode tree commitment.
 *
 * Why: Transforms a VNode tree into a RuntimeInstance tree with stable instance
 * IDs, validating interactive widget uniqueness and managing instance lifecycle.
 * The committed tree is the authoritative representation used for layout, focus,
 * and rendering.
 *
 * Commit responsibilities:
 *   - Reconcile VNode tree against previous committed tree
 *   - Allocate instance IDs for new nodes
 *   - Validate interactive widget ID uniqueness (no duplicate IDs)
 *   - Track mounted/reused/unmounted instance lifecycle
 *   - Clean up local state for unmounted instances
 *
 * @see docs/guide/runtime-and-layout.md
 */

import { getCompositeMeta } from "../widgets/composition.js";
import type { VNode } from "../widgets/types.js";
import { executeCompositeRender } from "./commit/composite.js";
import { commitContainer } from "./commit/container.js";
import { __commitDiag, leafVNodeEqual } from "./commit/equality.js";
import { captureErrorBoundaryState, commitErrorBoundaryFallback } from "./commit/errorBoundary.js";
import {
  type CommitCtx,
  type CommitErrorBoundaryController,
  type CommitNodeResult,
  type CommitResult,
  type CompositeCommitRuntime,
  DEV_MODE,
  EMPTY_CHILDREN,
  type FocusContainerKind,
  LAYOUT_DEPTH_PATH_TRACK_START,
  LAYOUT_DEPTH_WARN_THRESHOLD,
  MAX_LAYOUT_NESTING_DEPTH,
  type RuntimeInstance,
} from "./commit/shared.js";
import {
  collectSubtreeInstanceIds,
  deleteLocalStateForSubtree,
  tryScheduleExitAnimation,
} from "./commit/transitions.js";
import {
  ensureFocusContainerId,
  ensureInteractiveId,
  formatWidgetPath,
  isContainerVNode,
  isVNode,
  warnDev,
  widgetPathEntry,
} from "./commit/validation.js";
import type { InstanceId, InstanceIdAllocator } from "./instance.js";
import type { RuntimeLocalStateStore } from "./localState.js";
import { reconcileChildren } from "./reconcile.js";

export type {
  CommitDiagEntry,
  CommitFatal,
  CommitOk,
  CommitResult,
  PendingExitAnimation,
  RuntimeInstance,
} from "./commit/shared.js";
export { __commitDiag } from "./commit/equality.js";

function commitNode(
  prev: RuntimeInstance | null,
  instanceId: InstanceId,
  vnode: VNode,
  ctx: CommitCtx,
  nodePath: string,
): CommitNodeResult {
  ctx.layoutDepthRef.value += 1;
  const layoutDepth = ctx.layoutDepthRef.value;
  const trackPath = layoutDepth >= LAYOUT_DEPTH_PATH_TRACK_START;
  if (trackPath) ctx.layoutPathTail.push(widgetPathEntry(vnode));
  ctx.prevNodeStack.push(prev);
  try {
    if (
      DEV_MODE &&
      layoutDepth > LAYOUT_DEPTH_WARN_THRESHOLD &&
      !ctx.emittedWarnings.has("layout_depth")
    ) {
      ctx.emittedWarnings.add("layout_depth");
      warnDev(
        `[rezi][commit] layout depth ${String(layoutDepth)} exceeds warning threshold ${String(
          LAYOUT_DEPTH_WARN_THRESHOLD,
        )}. Deep trees may fail near depth ${String(
          MAX_LAYOUT_NESTING_DEPTH,
        )}. Path: ${formatWidgetPath(layoutDepth, ctx.layoutPathTail)}`,
      );
    }
    if (layoutDepth > MAX_LAYOUT_NESTING_DEPTH) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: `ZRUI_MAX_DEPTH: layout nesting depth ${String(layoutDepth)} exceeds max ${String(
            MAX_LAYOUT_NESTING_DEPTH,
          )}. Path: ${formatWidgetPath(layoutDepth, ctx.layoutPathTail)}`,
        },
      };
    }

    const commitDebug = globalThis as Record<string, unknown> & {
      __commitDebug?: unknown;
      __commitDebugLog?: string[] | undefined;
    };
    if (commitDebug.__commitDebug) {
      const debugLog = commitDebug.__commitDebugLog;
      if (debugLog) {
        debugLog.push(
          `commitNode(${String(instanceId)}, ${vnode.kind}, prev=${prev ? `${prev.vnode.kind}:${String(prev.instanceId)}` : "null"})`,
        );
      }
    }

    if (prev && prev.vnode.kind === vnode.kind && leafVNodeEqual(prev.vnode, vnode)) {
      if (__commitDiag.enabled) {
        const wasDirty = prev.selfDirty;
        __commitDiag.push({
          id: instanceId as number,
          kind: vnode.kind,
          reason: "leaf-reuse",
          detail: wasDirty ? "was-dirty" : undefined,
        });
      }
      if (ctx.collectLifecycleInstanceIds) ctx.lists.reused.push(instanceId);
      prev.dirty = false;
      prev.selfDirty = false;
      return { ok: true, value: { root: prev } };
    }
    if (__commitDiag.enabled && prev && !isContainerVNode(vnode)) {
      if (prev.vnode.kind !== vnode.kind) {
        __commitDiag.push({
          id: instanceId as number,
          kind: vnode.kind,
          reason: "new-instance",
          detail: "leaf-kind-mismatch",
        });
      } else {
        __commitDiag.push({
          id: instanceId as number,
          kind: vnode.kind,
          reason: "new-instance",
          detail: "leaf-content-changed",
        });
      }
    }

    if (vnode.kind === "errorBoundary") {
      ctx.errorBoundary?.activePaths.add(nodePath);
      const props = vnode.props as Readonly<{
        children?: unknown;
        fallback?: unknown;
      }>;
      const protectedChild = props.children;
      if (!isVNode(protectedChild)) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_INVALID_PROPS",
            detail: "errorBoundary children must be a VNode",
          },
        };
      }

      const protectedPath = `${nodePath}/b:protected`;
      const fallbackPath = `${nodePath}/b:fallback`;

      const retryRequested = ctx.errorBoundary?.retryRequestedPaths.delete(nodePath) === true;
      const existingState = ctx.errorBoundary?.errorsByPath.get(nodePath);

      if (existingState && !retryRequested) {
        return commitErrorBoundaryFallback(
          prev,
          instanceId,
          nodePath,
          fallbackPath,
          props,
          existingState,
          ctx,
          commitNode,
        );
      }

      const committedProtected = commitNode(prev, instanceId, protectedChild, ctx, protectedPath);
      if (committedProtected.ok) {
        ctx.errorBoundary?.errorsByPath.delete(nodePath);
        return committedProtected;
      }

      if (committedProtected.fatal.code !== "ZRUI_USER_CODE_THROW") {
        return committedProtected;
      }

      const trappedState = captureErrorBoundaryState(committedProtected.fatal.detail);
      ctx.errorBoundary?.errorsByPath.set(nodePath, trappedState);
      return commitErrorBoundaryFallback(
        prev,
        instanceId,
        nodePath,
        fallbackPath,
        props,
        trappedState,
        ctx,
        commitNode,
      );
    }

    const idFatal = ensureInteractiveId(ctx.seenInteractiveIds, instanceId, vnode);
    if (idFatal) return { ok: false, fatal: idFatal };
    const focusContainerFatal = ensureFocusContainerId(
      ctx.seenFocusContainerIds,
      instanceId,
      vnode,
    );
    if (focusContainerFatal) return { ok: false, fatal: focusContainerFatal };

    if (ctx.collectLifecycleInstanceIds) {
      if (prev) ctx.lists.reused.push(instanceId);
      else {
        ctx.lists.mounted.push(instanceId);
        if (__commitDiag.enabled)
          __commitDiag.push({ id: instanceId as number, kind: vnode.kind, reason: "new-mount" });
      }
    }

    if (ctx.composite) {
      const compositeMeta = getCompositeMeta(vnode);
      if (compositeMeta) {
        return executeCompositeRender(
          instanceId,
          vnode,
          compositeMeta,
          ctx,
          [nodePath],
          layoutDepth,
          (nextInstanceId, nextVnode, nextPrev, nextCtx, nextNodePath, nextDepth) =>
            commitContainer(
              nextInstanceId,
              nextVnode,
              nextPrev,
              nextCtx,
              nextNodePath,
              nextDepth,
              commitNode,
            ),
        );
      }
    }

    if (isContainerVNode(vnode)) {
      return commitContainer(instanceId, vnode, prev, ctx, [nodePath], layoutDepth, commitNode);
    }

    if (prev !== null && prev.vnode.kind === vnode.kind) {
      prev.vnode = vnode;
      prev.selfDirty = true;
      prev.dirty = true;
      return { ok: true, value: { root: prev } };
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode,
          children: EMPTY_CHILDREN,
          dirty: true,
          selfDirty: true,
          renderPacketKey: 0,
          renderPacket: null,
        },
      },
    };
  } finally {
    ctx.prevNodeStack.pop();
    if (trackPath) ctx.layoutPathTail.pop();
    ctx.layoutDepthRef.value -= 1;
  }
}

export function commitVNodeTree(
  prevRoot: RuntimeInstance | null,
  nextRootVNode: VNode,
  opts: Readonly<{
    allocator: InstanceIdAllocator;
    localState?: RuntimeLocalStateStore;
    collectLifecycleInstanceIds?: boolean;
    interactiveIdIndex?: Map<string, string>;
    composite?: CompositeCommitRuntime;
    errorBoundary?: CommitErrorBoundaryController;
  }>,
): CommitResult {
  const collectLifecycleInstanceIds = opts.collectLifecycleInstanceIds !== false;
  const interactiveIdIndex = opts.interactiveIdIndex ?? new Map<string, string>();
  interactiveIdIndex.clear();
  const ctx: CommitCtx = {
    allocator: opts.allocator,
    localState: opts.localState,
    seenInteractiveIds: interactiveIdIndex,
    seenFocusContainerIds: new Map<string, FocusContainerKind>(),
    prevNodeStack: [],
    containerChildOverrides: new Map<InstanceId, readonly VNode[]>(),
    layoutDepthRef: { value: 0 },
    layoutPathTail: [],
    emittedWarnings: new Set<string>(),
    lists: { mounted: [], reused: [], unmounted: [] },
    collectLifecycleInstanceIds,
    composite: opts.composite ?? null,
    compositeThemeStack: opts.composite?.theme ? [opts.composite.theme] : [],
    compositeRenderStack: [],
    pendingExitAnimations: [],
    pendingCleanups: [],
    pendingEffects: [],
    errorBoundary: opts.errorBoundary ?? null,
  };

  const prevChildren = prevRoot ? [{ instanceId: prevRoot.instanceId, vnode: prevRoot.vnode }] : [];
  const res = reconcileChildren(0, prevChildren, [nextRootVNode], opts.allocator, {
    kind: "root",
  });
  if (!res.ok) return { ok: false, fatal: res.fatal };

  const rootPlan = res.value.nextChildren[0];
  if (!rootPlan) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "commitVNodeTree: missing root vnode" },
    };
  }

  if (prevRoot && rootPlan.prevIndex === null) {
    if (!tryScheduleExitAnimation(ctx, prevRoot, 0)) {
      deleteLocalStateForSubtree(opts.localState, prevRoot);
      collectSubtreeInstanceIds(prevRoot, ctx.lists.unmounted);
    }
  }

  const prevMatch = rootPlan.prevIndex === 0 ? prevRoot : null;
  const committedRoot = commitNode(prevMatch, rootPlan.instanceId, rootPlan.vnode, ctx, "root");
  if (!committedRoot.ok) return committedRoot;

  return {
    ok: true,
    value: {
      root: committedRoot.value.root,
      mountedInstanceIds: ctx.lists.mounted,
      reusedInstanceIds: ctx.lists.reused,
      unmountedInstanceIds: ctx.lists.unmounted,
      pendingExitAnimations: ctx.pendingExitAnimations,
      pendingCleanups: ctx.pendingCleanups,
      pendingEffects: ctx.pendingEffects,
    },
  };
}
