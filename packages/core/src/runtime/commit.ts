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

import {
  type CompositeWidgetMeta,
  createWidgetContext,
  getCompositeMeta,
} from "../widgets/composition.js";
import type { VNode } from "../widgets/types.js";
import type { InstanceId, InstanceIdAllocator } from "./instance.js";
import {
  type CompositeInstanceRegistry,
  type EffectState,
  createHookContext,
} from "./instances.js";
import type { RuntimeLocalStateStore } from "./localState.js";
import { type ReconcileFatal, reconcileChildren } from "./reconcile.js";

/**
 * Committed runtime instance with stable ID and children.
 * Mirrors VNode structure but with lifecycle tracking.
 */
export type RuntimeInstance = Readonly<{
  instanceId: InstanceId;
  vnode: VNode;
  children: readonly RuntimeInstance[];
}>;

/** Shared frozen empty array for leaf RuntimeInstance children. Avoids per-node allocation. */
const EMPTY_CHILDREN: readonly RuntimeInstance[] = Object.freeze([]);

/**
 * Fast shallow equality for text style objects.
 * Returns true if both styles produce identical render output.
 */
function textStyleEqual(
  a:
    | {
        bold?: boolean;
        dim?: boolean;
        italic?: boolean;
        underline?: boolean;
        inverse?: boolean;
        fg?: unknown;
        bg?: unknown;
      }
    | undefined,
  b:
    | {
        bold?: boolean;
        dim?: boolean;
        italic?: boolean;
        underline?: boolean;
        inverse?: boolean;
        fg?: unknown;
        bg?: unknown;
      }
    | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.bold === b.bold &&
    a.dim === b.dim &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.inverse === b.inverse &&
    a.fg === b.fg &&
    a.bg === b.bg
  );
}

/**
 * Check if two leaf VNodes are semantically equal (same render output).
 * Used to skip allocating new RuntimeInstance objects for unchanged leaves.
 * Only covers common leaf kinds; returns false for unknown kinds (safe fallback).
 */
function leafVNodeEqual(a: VNode, b: VNode): boolean {
  switch (a.kind) {
    case "text": {
      if (b.kind !== "text") return false;
      if (a.text !== b.text) return false;
      const ap = a.props as {
        id?: unknown;
        style?: unknown;
        textOverflow?: unknown;
        variant?: unknown;
        maxWidth?: unknown;
      };
      const bp = b.props as {
        id?: unknown;
        style?: unknown;
        textOverflow?: unknown;
        variant?: unknown;
        maxWidth?: unknown;
      };
      // Even when render output is identical, `id` changes must re-commit so downstream
      // id-based lookups (layout rect indexing, anchors, etc) don't observe stale ids.
      if (ap.id !== bp.id) return false;
      if (ap.textOverflow !== bp.textOverflow) return false;
      if (ap.variant !== bp.variant) return false;
      if (ap.maxWidth !== bp.maxWidth) return false;
      return textStyleEqual(
        ap.style as Parameters<typeof textStyleEqual>[0],
        bp.style as Parameters<typeof textStyleEqual>[0],
      );
    }
    case "spacer": {
      if (b.kind !== "spacer") return false;
      const ap = a.props as { size?: number; flex?: number };
      const bp = b.props as { size?: number; flex?: number };
      return ap.size === bp.size && ap.flex === bp.flex;
    }
    case "divider": {
      if (b.kind !== "divider") return false;
      const ap = a.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      const bp = b.props as {
        direction?: unknown;
        char?: unknown;
        label?: unknown;
        color?: unknown;
      };
      return (
        ap.direction === bp.direction &&
        ap.char === bp.char &&
        ap.label === bp.label &&
        ap.color === bp.color
      );
    }
    default:
      return false;
  }
}

function boxShadowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  const ao = a as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  const bo = b as { offsetX?: unknown; offsetY?: unknown; density?: unknown };
  return ao.offsetX === bo.offsetX && ao.offsetY === bo.offsetY && ao.density === bo.density;
}

function layoutConstraintsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    width?: unknown;
    height?: unknown;
    minWidth?: unknown;
    maxWidth?: unknown;
    minHeight?: unknown;
    maxHeight?: unknown;
    flex?: unknown;
    aspectRatio?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.width === bo.width &&
    ao.height === bo.height &&
    ao.minWidth === bo.minWidth &&
    ao.maxWidth === bo.maxWidth &&
    ao.minHeight === bo.minHeight &&
    ao.maxHeight === bo.maxHeight &&
    ao.flex === bo.flex &&
    ao.aspectRatio === bo.aspectRatio
  );
}

function spacingPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    p?: unknown;
    px?: unknown;
    py?: unknown;
    pt?: unknown;
    pb?: unknown;
    pl?: unknown;
    pr?: unknown;
    m?: unknown;
    mx?: unknown;
    my?: unknown;
    mt?: unknown;
    mr?: unknown;
    mb?: unknown;
    ml?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.p === bo.p &&
    ao.px === bo.px &&
    ao.py === bo.py &&
    ao.pt === bo.pt &&
    ao.pb === bo.pb &&
    ao.pl === bo.pl &&
    ao.pr === bo.pr &&
    ao.m === bo.m &&
    ao.mx === bo.mx &&
    ao.my === bo.my &&
    ao.mt === bo.mt &&
    ao.mr === bo.mr &&
    ao.mb === bo.mb &&
    ao.ml === bo.ml
  );
}

function boxPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    title?: unknown;
    titleAlign?: unknown;
    pad?: unknown;
    border?: unknown;
    borderTop?: unknown;
    borderRight?: unknown;
    borderBottom?: unknown;
    borderLeft?: unknown;
    shadow?: unknown;
    style?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.title === bo.title &&
    ao.titleAlign === bo.titleAlign &&
    ao.pad === bo.pad &&
    ao.border === bo.border &&
    ao.borderTop === bo.borderTop &&
    ao.borderRight === bo.borderRight &&
    ao.borderBottom === bo.borderBottom &&
    ao.borderLeft === bo.borderLeft &&
    boxShadowEqual(ao.shadow, bo.shadow) &&
    textStyleEqual(
      ao.style as Parameters<typeof textStyleEqual>[0],
      bo.style as Parameters<typeof textStyleEqual>[0],
    ) &&
    spacingPropsEqual(ao, bo) &&
    layoutConstraintsEqual(ao, bo)
  );
}

function stackPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    pad?: unknown;
    gap?: unknown;
    align?: unknown;
    justify?: unknown;
    items?: unknown;
    style?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.pad === bo.pad &&
    ao.gap === bo.gap &&
    ao.align === bo.align &&
    ao.justify === bo.justify &&
    ao.items === bo.items &&
    textStyleEqual(
      ao.style as Parameters<typeof textStyleEqual>[0],
      bo.style as Parameters<typeof textStyleEqual>[0],
    ) &&
    spacingPropsEqual(ao, bo) &&
    layoutConstraintsEqual(ao, bo)
  );
}

function focusZonePropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    id?: unknown;
    tabIndex?: unknown;
    navigation?: unknown;
    columns?: unknown;
    wrapAround?: unknown;
    onEnter?: unknown;
    onExit?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.id === bo.id &&
    ao.tabIndex === bo.tabIndex &&
    ao.navigation === bo.navigation &&
    ao.columns === bo.columns &&
    ao.wrapAround === bo.wrapAround &&
    ao.onEnter === bo.onEnter &&
    ao.onExit === bo.onExit
  );
}

function focusTrapPropsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ao = (a ?? {}) as {
    id?: unknown;
    active?: unknown;
    returnFocusTo?: unknown;
    initialFocus?: unknown;
  };
  const bo = (b ?? {}) as typeof ao;
  return (
    ao.id === bo.id &&
    ao.active === bo.active &&
    ao.returnFocusTo === bo.returnFocusTo &&
    ao.initialFocus === bo.initialFocus
  );
}

function canFastReuseContainerSelf(prev: VNode, next: VNode): boolean {
  if (prev.kind !== next.kind) return false;
  switch (prev.kind) {
    case "box":
      return boxPropsEqual(prev.props, (next as typeof prev).props);
    case "row":
    case "column":
      return stackPropsEqual(prev.props, (next as typeof prev).props);
    case "focusZone":
      return focusZonePropsEqual(prev.props, (next as typeof prev).props);
    case "focusTrap":
      return focusTrapPropsEqual(prev.props, (next as typeof prev).props);
    default:
      return false;
  }
}

/** Fatal errors from tree commitment. */
export type CommitFatal =
  | ReconcileFatal
  | Readonly<{ code: "ZRUI_DUPLICATE_ID"; detail: string }>
  | Readonly<{ code: "ZRUI_INVALID_PROPS"; detail: string }>
  | Readonly<{ code: "ZRUI_USER_CODE_THROW"; detail: string }>;

/** Successful commit result with lifecycle instance lists. */
export type CommitOk = Readonly<{
  root: RuntimeInstance;
  mountedInstanceIds: readonly InstanceId[];
  reusedInstanceIds: readonly InstanceId[];
  unmountedInstanceIds: readonly InstanceId[];
  /** Pending effects scheduled by composite widgets during this commit. */
  pendingEffects: readonly EffectState[];
}>;

export type CommitResult =
  | Readonly<{ ok: true; value: CommitOk }>
  | Readonly<{ ok: false; fatal: CommitFatal }>;

type CommitNodeResult =
  | Readonly<{ ok: true; value: Readonly<{ root: RuntimeInstance }> }>
  | Readonly<{ ok: false; fatal: CommitFatal }>;

type MutableLists = {
  mounted: InstanceId[];
  reused: InstanceId[];
  unmounted: InstanceId[];
};

function isInteractiveVNode(v: VNode): boolean {
  // Interactive set: widgets with required `id` that participate in focus/routing.
  return (
    v.kind === "button" ||
    v.kind === "input" ||
    v.kind === "slider" ||
    v.kind === "virtualList" ||
    v.kind === "table" ||
    v.kind === "tree" ||
    v.kind === "select" ||
    v.kind === "checkbox" ||
    v.kind === "radioGroup" ||
    v.kind === "modal" ||
    v.kind === "layer" ||
    v.kind === "dropdown" ||
    // Advanced widgets (GitHub issue #136)
    v.kind === "commandPalette" ||
    v.kind === "filePicker" ||
    v.kind === "fileTreeExplorer" ||
    v.kind === "splitPane" ||
    v.kind === "panelGroup" ||
    v.kind === "codeEditor" ||
    v.kind === "diffViewer" ||
    v.kind === "toolApprovalDialog" ||
    v.kind === "logsConsole"
  );
}

function ensureInteractiveId(
  seen: Map<string, InstanceId>,
  instanceId: InstanceId,
  vnode: VNode,
): CommitFatal | null {
  if (!isInteractiveVNode(vnode)) return null;

  // Runtime validation (even though ButtonProps is typed).
  const id = (vnode as { props: { id?: unknown } }).props.id;
  if (typeof id !== "string" || id.length === 0) {
    return {
      code: "ZRUI_INVALID_PROPS",
      detail: `interactive node missing required id (kind=${vnode.kind}, instanceId=${String(instanceId)})`,
    };
  }

  const existing = seen.get(id);
  if (existing !== undefined) {
    return {
      code: "ZRUI_DUPLICATE_ID",
      detail: `duplicate interactive id "${id}" on instanceId=${String(instanceId)} (already used by instanceId=${String(
        existing,
      )})`,
    };
  }
  seen.set(id, instanceId);
  return null;
}

function isVNode(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "kind" in v;
}

function commitChildrenForVNode(vnode: VNode): readonly VNode[] {
  if (
    vnode.kind === "box" ||
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "focusZone" ||
    vnode.kind === "focusTrap" ||
    vnode.kind === "layers" ||
    vnode.kind === "field" ||
    // Advanced container widgets (GitHub issue #136)
    vnode.kind === "splitPane" ||
    vnode.kind === "panelGroup" ||
    vnode.kind === "resizablePanel"
  ) {
    return vnode.children;
  }

  if (vnode.kind === "layer") {
    const content = (vnode.props as { content?: unknown }).content;
    return isVNode(content) ? [content] : [];
  }

  if (vnode.kind === "modal") {
    const props = vnode.props as { content?: unknown; actions?: unknown };
    const content = isVNode(props.content) ? props.content : null;

    const actionsRaw = Array.isArray(props.actions) ? props.actions : [];
    const actions: VNode[] = [];
    for (const a of actionsRaw) {
      if (isVNode(a)) actions.push(a);
    }

    const children: VNode[] = [];
    if (content) children.push(content);
    children.push(...actions);
    return children;
  }

  return [];
}

function collectSubtreeInstanceIds(node: RuntimeInstance, out: InstanceId[]): void {
  out.push(node.instanceId);
  for (const c of node.children) collectSubtreeInstanceIds(c, out);
}

function deleteLocalStateForSubtree(
  store: RuntimeLocalStateStore | undefined,
  node: RuntimeInstance,
): void {
  if (!store) return;
  const stack: RuntimeInstance[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    store.delete(cur.instanceId);
    for (const c of cur.children) stack.push(c);
  }
}

type CommitCtx = Readonly<{
  allocator: InstanceIdAllocator;
  localState: RuntimeLocalStateStore | undefined;
  seenInteractiveIds: Map<string, InstanceId>;
  lists: MutableLists;
  collectLifecycleInstanceIds: boolean;
  composite: Readonly<{
    registry: CompositeInstanceRegistry;
    appState: unknown;
    onInvalidate: (instanceId: InstanceId) => void;
  }> | null;
  pendingEffects: EffectState[];
}>;

function commitNode(
  prev: RuntimeInstance | null,
  instanceId: InstanceId,
  vnode: VNode,
  ctx: CommitCtx,
): CommitNodeResult {
  // Leaf nodes — fast path: reuse previous RuntimeInstance when content is unchanged.
  // Do this before any bookkeeping so unchanged leaf-heavy subtrees (lists, tables)
  // don't pay per-node validation overhead.
  if (prev && prev.vnode.kind === vnode.kind && leafVNodeEqual(prev.vnode, vnode)) {
    if (ctx.collectLifecycleInstanceIds) ctx.lists.reused.push(instanceId);
    return { ok: true, value: { root: prev } };
  }

  const idFatal = ensureInteractiveId(ctx.seenInteractiveIds, instanceId, vnode);
  if (idFatal) return { ok: false, fatal: idFatal };

  if (ctx.collectLifecycleInstanceIds) {
    if (prev) ctx.lists.reused.push(instanceId);
    else ctx.lists.mounted.push(instanceId);
  }

  // Composite widgets: execute render function and treat result as the node's children.
  // This integrates defineWidget() into the commit pipeline.
  let compositeMeta: CompositeWidgetMeta | null = null;
  let compositeChild: VNode | null = null;
  if (ctx.composite) {
    compositeMeta = getCompositeMeta(vnode);
    if (compositeMeta) {
      const registry = ctx.composite.registry;
      const existing = registry.get(instanceId);

      if (existing && existing.widgetKey !== compositeMeta.widgetKey) {
        // Same instanceId but different widget type: invalidate stale closures and remount hooks.
        registry.incrementGeneration(instanceId);
        registry.delete(instanceId);
      }

      if (!registry.get(instanceId)) {
        try {
          registry.create(instanceId, compositeMeta.widgetKey);
        } catch (e: unknown) {
          return {
            ok: false,
            fatal: {
              code: "ZRUI_USER_CODE_THROW",
              detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
            },
          };
        }
      }

      const state = registry.get(instanceId);
      if (!state) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_INVALID_PROPS",
            detail: `composite state missing for instanceId=${String(instanceId)}`,
          },
        };
      }

      registry.beginRender(instanceId);
      const hookCtx = createHookContext(state, () => {
        registry.invalidate(instanceId);
        ctx.composite?.onInvalidate(instanceId);
      });
      const widgetCtx = createWidgetContext(
        compositeMeta.widgetKey,
        instanceId,
        hookCtx,
        ctx.composite.appState,
        () => {
          registry.invalidate(instanceId);
          ctx.composite?.onInvalidate(instanceId);
        },
      );

      try {
        compositeChild = compositeMeta.render(widgetCtx);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          },
        };
      }

      try {
        const pending = registry.endRender(instanceId);
        for (const eff of pending) ctx.pendingEffects.push(eff);
      } catch (e: unknown) {
        return {
          ok: false,
          fatal: {
            code: "ZRUI_USER_CODE_THROW",
            detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          },
        };
      }
    }
  }

  const compositeWrapperChildren = compositeMeta && compositeChild ? [compositeChild] : null;

  const rewriteCommittedVNode = (next: VNode, committedChildren: readonly VNode[]): VNode => {
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
      next.kind === "box" ||
      next.kind === "row" ||
      next.kind === "column" ||
      next.kind === "focusZone" ||
      next.kind === "focusTrap" ||
      next.kind === "layers" ||
      next.kind === "field" ||
      // Advanced container widgets (GitHub issue #136)
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
  };

  if (
    vnode.kind === "box" ||
    vnode.kind === "row" ||
    vnode.kind === "column" ||
    vnode.kind === "focusZone" ||
    vnode.kind === "focusTrap" ||
    vnode.kind === "layers" ||
    vnode.kind === "field" ||
    // Advanced container widgets (GitHub issue #136)
    vnode.kind === "splitPane" ||
    vnode.kind === "panelGroup" ||
    vnode.kind === "resizablePanel" ||
    vnode.kind === "modal" ||
    vnode.kind === "layer"
  ) {
    const vnodeForCommit = compositeWrapperChildren
      ? ({
          ...vnode,
          children: compositeWrapperChildren,
        } as VNode)
      : vnode;

    const prevChildren = prev ? prev.children : [];
    const res = reconcileChildren(
      instanceId,
      prevChildren,
      compositeWrapperChildren ? compositeWrapperChildren : commitChildrenForVNode(vnodeForCommit),
      ctx.allocator,
    );
    if (!res.ok) return { ok: false, fatal: res.fatal };

    const byPrevIndex = prevChildren;
    let byPrevInstanceId: Map<InstanceId, RuntimeInstance> | null = null;
    if (res.value.unmountedInstanceIds.length > 0) {
      byPrevInstanceId = new Map<InstanceId, RuntimeInstance>();
      for (const c of prevChildren) byPrevInstanceId.set(c.instanceId, c);
    }

    // Container fast path: when reconciliation reuses all children with no
    // additions/removals, commit each child and check if all return the exact
    // same RuntimeInstance reference. If so, reuse the parent's RuntimeInstance,
    // avoiding new arrays, VNode spreads, and RuntimeInstance allocation.
    const canTryFastReuse =
      prev !== null &&
      res.value.newInstanceIds.length === 0 &&
      res.value.unmountedInstanceIds.length === 0 &&
      res.value.nextChildren.length === prevChildren.length;

    // Avoid allocating nextChildren/committedChildVNodes for the common case where
    // everything is reused (e.g., list updates where only a couple rows change).
    let nextChildren: readonly RuntimeInstance[] | null = null;
    let committedChildVNodes: readonly VNode[] | null = null;

    if (canTryFastReuse) {
      let allChildrenSame = true;
      for (let i = 0; i < res.value.nextChildren.length; i++) {
        const child = res.value.nextChildren[i];
        if (!child) continue;
        const prevChild = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        const committed = commitNode(prevChild ?? null, child.instanceId, child.vnode, ctx);
        if (!committed.ok) return committed;

        if (allChildrenSame && committed.value.root !== prevChild) {
          allChildrenSame = false;
          // First mismatch: allocate arrays and backfill prior entries with the prevChild refs
          // we already proved were identical in earlier iterations.
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
          // Arrays are allocated after the first mismatch.
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
        canFastReuseContainerSelf(prev.vnode, vnodeForCommit)
      ) {
        // All children are identical references → reuse parent entirely.
        return { ok: true, value: { root: prev } };
      }
    } else {
      // General path: commit children and build next arrays.
      const nextChildrenArr: RuntimeInstance[] = [];
      const committedChildVNodesArr: VNode[] = [];
      for (const child of res.value.nextChildren) {
        const prevChild = child.prevIndex !== null ? byPrevIndex[child.prevIndex] : null;
        const committed = commitNode(prevChild ?? null, child.instanceId, child.vnode, ctx);
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
      deleteLocalStateForSubtree(ctx.localState, prevNode);
      collectSubtreeInstanceIds(prevNode, ctx.lists.unmounted);
    }

    if (!nextChildren || !committedChildVNodes) {
      // canTryFastReuse=true and there was at least one mismatch, so arrays must exist.
      nextChildren = prevChildren;
      committedChildVNodes = prevChildren.map((c) => c.vnode);
    }

    return {
      ok: true,
      value: {
        root: {
          instanceId,
          vnode: rewriteCommittedVNode(vnodeForCommit, committedChildVNodes),
          children: nextChildren,
        },
      },
    };
  }

  return {
    ok: true,
    value: {
      root: { instanceId, vnode, children: EMPTY_CHILDREN },
    },
  };
}

/**
 * Deterministically commit a VNode tree into a runtime instance tree, applying
 * locked reconciliation rules (docs/10) and enforcing interactive id uniqueness.
 *
 * Notes:
 * - Uses an implicit root parent instanceId=0 for reconciliation of the returned root VNode.
 * - Does not perform layout, focus, routing, or drawlist building.
 */
export function commitVNodeTree(
  prevRoot: RuntimeInstance | null,
  nextRootVNode: VNode,
  opts: Readonly<{
    allocator: InstanceIdAllocator;
    localState?: RuntimeLocalStateStore;
    /** Skip mounted/reused instanceId tracking (unmounted tracking remains). */
    collectLifecycleInstanceIds?: boolean;
    composite?: Readonly<{
      registry: CompositeInstanceRegistry;
      appState: unknown;
      onInvalidate: (instanceId: InstanceId) => void;
    }>;
  }>,
): CommitResult {
  const collectLifecycleInstanceIds = opts.collectLifecycleInstanceIds !== false;
  const ctx: CommitCtx = {
    allocator: opts.allocator,
    localState: opts.localState,
    seenInteractiveIds: new Map<string, InstanceId>(),
    lists: { mounted: [], reused: [], unmounted: [] },
    collectLifecycleInstanceIds,
    composite: opts.composite ?? null,
    pendingEffects: [],
  };

  const prevChildren = prevRoot ? [{ instanceId: prevRoot.instanceId, vnode: prevRoot.vnode }] : [];
  const res = reconcileChildren(0, prevChildren, [nextRootVNode], opts.allocator);
  if (!res.ok) return { ok: false, fatal: res.fatal };

  const rootPlan = res.value.nextChildren[0];
  if (!rootPlan) {
    return {
      ok: false,
      fatal: { code: "ZRUI_INVALID_PROPS", detail: "commitVNodeTree: missing root vnode" },
    };
  }

  if (prevRoot && rootPlan.prevIndex === null) {
    // Root was replaced; unmount the entire previous tree before committing the new one so
    // the returned lists include the unmount lifecycle deterministically.
    deleteLocalStateForSubtree(opts.localState, prevRoot);
    collectSubtreeInstanceIds(prevRoot, ctx.lists.unmounted);
  }

  const prevMatch = rootPlan.prevIndex === 0 ? prevRoot : null;
  const committedRoot = commitNode(prevMatch, rootPlan.instanceId, rootPlan.vnode, ctx);
  if (!committedRoot.ok) return committedRoot;

  return {
    ok: true,
    value: {
      root: committedRoot.value.root,
      mountedInstanceIds: ctx.lists.mounted,
      reusedInstanceIds: ctx.lists.reused,
      unmountedInstanceIds: ctx.lists.unmounted,
      pendingEffects: ctx.pendingEffects,
    },
  };
}
