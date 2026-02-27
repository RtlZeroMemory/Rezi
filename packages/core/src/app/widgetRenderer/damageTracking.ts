import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import { getRuntimeNodeDamageRect } from "../../renderer/renderToDrawlist/damageBounds.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { Theme } from "../../theme/theme.js";

export type DamageViewport = Readonly<{ cols: number; rows: number }>;

type WidgetKind = RuntimeInstance["vnode"]["kind"];

export type IdentityDiffDamageResult = Readonly<{
  changedInstanceIds: readonly InstanceId[];
  removedInstanceIds: readonly InstanceId[];
  routingRelevantChanged: boolean;
}>;

type ShouldAttemptIncrementalRenderParams = Readonly<{
  hasRenderedFrame: boolean;
  doLayout: boolean;
  hasActivePositionTransitions: boolean;
  hasActiveExitTransitions: boolean;
  lastRenderedViewport: DamageViewport;
  viewport: DamageViewport;
  lastRenderedThemeRef: Theme | null;
  theme: Theme;
  dropdownStack: readonly string[];
  layerStack: readonly string[];
  toastContainers: readonly unknown[];
}>;

type MarkLayoutDirtyNodesParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  pooledRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  prevFrameRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  pooledRuntimeStack: RuntimeInstance[];
  pooledPrevRuntimeStack: RuntimeInstance[];
}>;

type MarkTransientDirtyNodesParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  prevFocusedId: string | null;
  nextFocusedId: string | null;
  includeSpinners: boolean;
  pooledRuntimeStack: RuntimeInstance[];
  pooledPrevRuntimeStack: RuntimeInstance[];
}>;

type ComputeIdentityDiffDamageParams = Readonly<{
  prevRoot: RuntimeInstance | null;
  nextRoot: RuntimeInstance;
  pooledChangedRenderInstanceIds: InstanceId[];
  pooledRemovedRenderInstanceIds: InstanceId[];
  pooledPrevRuntimeStack: RuntimeInstance[];
  pooledRuntimeStack: RuntimeInstance[];
  pooledDamageRuntimeStack: RuntimeInstance[];
}>;

type RefreshDamageRectIndexesForLayoutSkippedCommitParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  pooledDamageRectByInstanceId: Map<InstanceId, Rect>;
  pooledDamageRectById: Map<string, Rect>;
  pooledRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  pooledRuntimeStack: RuntimeInstance[];
}>;

type CollectSpinnerDamageRectsParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  layoutRoot: LayoutTree;
  pooledDamageRects: Rect[];
  pooledRuntimeStack: RuntimeInstance[];
  pooledLayoutStack: LayoutTree[];
}>;

type AppendDamageRectsForFocusAnnouncersParams = Readonly<{
  runtimeRoot: RuntimeInstance;
  pooledRuntimeStack: RuntimeInstance[];
  pooledDamageRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  prevFrameDamageRectByInstanceId: ReadonlyMap<InstanceId, Rect>;
  pooledDamageRects: Rect[];
}>;

const INCREMENTAL_DAMAGE_AREA_FRACTION = 0.45;

function clipRectToViewport(rect: Rect, viewport: DamageViewport): Rect | null {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(viewport.cols, rect.x + rect.w);
  const y1 = Math.min(viewport.rows, rect.y + rect.h);
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return null;
  return { x: x0, y: y0, w, h };
}

function rectOverlapsOrTouches(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function unionRect(a: Rect, b: Rect): Rect {
  const x0 = Math.min(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.w, b.x + b.w);
  const y1 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function isNonEmptyRect(rect: Rect | undefined): rect is Rect {
  return rect !== undefined && rect.w > 0 && rect.h > 0;
}

function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function isRoutingRelevantKind(kind: WidgetKind): boolean {
  switch (kind) {
    case "button":
    case "link":
    case "input":
    case "slider":
    case "focusZone":
    case "focusTrap":
    case "virtualList":
    case "layers":
    case "modal":
    case "dropdown":
    case "layer":
    case "table":
    case "tree":
    case "select":
    case "checkbox":
    case "radioGroup":
    case "tabs":
    case "accordion":
    case "breadcrumb":
    case "pagination":
    case "commandPalette":
    case "filePicker":
    case "fileTreeExplorer":
    case "splitPane":
    case "panelGroup":
    case "codeEditor":
    case "diffViewer":
    case "toolApprovalDialog":
    case "logsConsole":
    case "toastContainer":
      return true;
    default:
      return false;
  }
}

export function isDamageGranularityKind(kind: WidgetKind): boolean {
  if (kind === "row") return true;
  switch (kind) {
    case "text":
    case "divider":
    case "spacer":
    case "button":
    case "link":
    case "input":
    case "focusAnnouncer":
    case "slider":
    case "select":
    case "checkbox":
    case "radioGroup":
    case "tabs":
    case "accordion":
    case "breadcrumb":
    case "pagination":
    case "richText":
    case "badge":
    case "spinner":
    case "progress":
    case "skeleton":
    case "icon":
    case "kbd":
    case "status":
    case "tag":
    case "gauge":
    case "empty":
    case "errorDisplay":
    case "callout":
    case "sparkline":
    case "barChart":
    case "miniChart":
    case "virtualList":
    case "table":
    case "tree":
    case "dropdown":
    case "commandPalette":
    case "filePicker":
    case "fileTreeExplorer":
    case "codeEditor":
    case "diffViewer":
    case "toolApprovalDialog":
    case "logsConsole":
    case "toastContainer":
      return true;
    default:
      return false;
  }
}

export function shouldAttemptIncrementalRender(
  params: ShouldAttemptIncrementalRenderParams,
): boolean {
  if (!params.hasRenderedFrame) return false;
  if (params.doLayout) return false;
  if (params.hasActivePositionTransitions) return false;
  if (params.hasActiveExitTransitions) return false;

  if (
    params.lastRenderedViewport.cols !== params.viewport.cols ||
    params.lastRenderedViewport.rows !== params.viewport.rows
  ) {
    return false;
  }
  if (params.lastRenderedThemeRef !== params.theme) return false;

  if (
    params.dropdownStack.length > 0 ||
    params.layerStack.length > 0 ||
    params.toastContainers.length > 0
  ) {
    return false;
  }
  return true;
}

export function propagateDirtyFromPredicate(
  runtimeRoot: RuntimeInstance,
  isNodeDirty: (node: RuntimeInstance) => boolean,
  pooledRuntimeStack: RuntimeInstance[],
  pooledPrevRuntimeStack: RuntimeInstance[],
): void {
  pooledRuntimeStack.length = 0;
  pooledPrevRuntimeStack.length = 0;
  pooledRuntimeStack.push(runtimeRoot);

  while (pooledRuntimeStack.length > 0) {
    const node = pooledRuntimeStack.pop();
    if (!node) continue;
    pooledPrevRuntimeStack.push(node);
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) pooledRuntimeStack.push(child);
    }
  }

  for (let i = pooledPrevRuntimeStack.length - 1; i >= 0; i--) {
    const node = pooledPrevRuntimeStack[i];
    if (!node) continue;
    const markedSelfDirty = isNodeDirty(node);
    if (markedSelfDirty) node.selfDirty = true;
    let dirty = node.dirty || markedSelfDirty;
    for (const child of node.children) {
      if (child.dirty) {
        dirty = true;
        break;
      }
    }
    node.dirty = dirty;
  }

  pooledPrevRuntimeStack.length = 0;
}

export function markLayoutDirtyNodes(params: MarkLayoutDirtyNodesParams): void {
  propagateDirtyFromPredicate(
    params.runtimeRoot,
    (node) => {
      const nextRect = params.pooledRectByInstanceId.get(node.instanceId);
      if (!nextRect) return false;
      const prevRect = params.prevFrameRectByInstanceId.get(node.instanceId);
      return !prevRect || !rectEquals(nextRect, prevRect);
    },
    params.pooledRuntimeStack,
    params.pooledPrevRuntimeStack,
  );
}

export function collectSelfDirtyInstanceIds(
  runtimeRoot: RuntimeInstance,
  out: InstanceId[],
  pooledRuntimeStack: RuntimeInstance[],
): void {
  out.length = 0;
  pooledRuntimeStack.length = 0;
  pooledRuntimeStack.push(runtimeRoot);

  while (pooledRuntimeStack.length > 0) {
    const node = pooledRuntimeStack.pop();
    if (!node) continue;
    if (node.selfDirty) out.push(node.instanceId);
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) pooledRuntimeStack.push(child);
    }
  }
}

export function markTransientDirtyNodes(params: MarkTransientDirtyNodesParams): void {
  if (params.prevFocusedId === params.nextFocusedId && !params.includeSpinners) return;

  propagateDirtyFromPredicate(
    params.runtimeRoot,
    (node) => {
      if (params.includeSpinners && node.vnode.kind === "spinner") return true;
      if (params.prevFocusedId === null && params.nextFocusedId === null) return false;
      const id = (node.vnode as { props?: { id?: unknown } }).props?.id;
      if (typeof id !== "string" || id.length === 0) return false;
      return id === params.prevFocusedId || id === params.nextFocusedId;
    },
    params.pooledRuntimeStack,
    params.pooledPrevRuntimeStack,
  );
}

export function clearRuntimeDirtyNodes(
  runtimeRoot: RuntimeInstance,
  pooledRuntimeStack: RuntimeInstance[],
): void {
  pooledRuntimeStack.length = 0;
  pooledRuntimeStack.push(runtimeRoot);
  while (pooledRuntimeStack.length > 0) {
    const node = pooledRuntimeStack.pop();
    if (!node) continue;
    node.dirty = false;
    node.selfDirty = false;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) pooledRuntimeStack.push(child);
    }
  }
}

export function collectSubtreeDamageAndRouting(
  root: RuntimeInstance,
  outInstanceIds: InstanceId[],
  pooledDamageRuntimeStack: RuntimeInstance[],
): boolean {
  let routingRelevant = false;
  pooledDamageRuntimeStack.length = 0;
  pooledDamageRuntimeStack.push(root);

  while (pooledDamageRuntimeStack.length > 0) {
    const node = pooledDamageRuntimeStack.pop();
    if (!node) continue;

    const kind = node.vnode.kind;
    if (isRoutingRelevantKind(kind)) routingRelevant = true;

    if (isDamageGranularityKind(kind) || node.children.length === 0) {
      outInstanceIds.push(node.instanceId);
      continue;
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) pooledDamageRuntimeStack.push(child);
    }
  }

  return routingRelevant;
}

export function computeIdentityDiffDamage(
  params: ComputeIdentityDiffDamageParams,
): IdentityDiffDamageResult {
  params.pooledChangedRenderInstanceIds.length = 0;
  params.pooledRemovedRenderInstanceIds.length = 0;

  if (params.prevRoot === null) {
    const routingRelevantChanged = collectSubtreeDamageAndRouting(
      params.nextRoot,
      params.pooledChangedRenderInstanceIds,
      params.pooledDamageRuntimeStack,
    );
    return {
      changedInstanceIds: params.pooledChangedRenderInstanceIds,
      removedInstanceIds: params.pooledRemovedRenderInstanceIds,
      routingRelevantChanged,
    };
  }

  let routingRelevantChanged = false;
  params.pooledPrevRuntimeStack.length = 0;
  params.pooledRuntimeStack.length = 0;
  params.pooledPrevRuntimeStack.push(params.prevRoot);
  params.pooledRuntimeStack.push(params.nextRoot);

  while (params.pooledPrevRuntimeStack.length > 0 && params.pooledRuntimeStack.length > 0) {
    const prevNode = params.pooledPrevRuntimeStack.pop();
    const nextNode = params.pooledRuntimeStack.pop();
    if (!prevNode || !nextNode) continue;

    if (prevNode === nextNode) {
      if (!nextNode.dirty) continue;

      const nextKind = nextNode.vnode.kind;
      if (nextNode.selfDirty) {
        routingRelevantChanged =
          collectSubtreeDamageAndRouting(
            nextNode,
            params.pooledChangedRenderInstanceIds,
            params.pooledDamageRuntimeStack,
          ) || routingRelevantChanged;
        continue;
      }

      if (isRoutingRelevantKind(nextKind)) routingRelevantChanged = true;
      if (nextNode.children.length === 0) {
        params.pooledChangedRenderInstanceIds.push(nextNode.instanceId);
        continue;
      }

      let pushedDirtyChild = false;
      for (let i = nextNode.children.length - 1; i >= 0; i--) {
        const child = nextNode.children[i];
        if (!child || !child.dirty) continue;
        pushedDirtyChild = true;
        params.pooledPrevRuntimeStack.push(child);
        params.pooledRuntimeStack.push(child);
      }
      if (!pushedDirtyChild) {
        params.pooledChangedRenderInstanceIds.push(nextNode.instanceId);
      }
      continue;
    }

    const prevKind = prevNode.vnode.kind;
    const nextKind = nextNode.vnode.kind;

    if (prevNode.instanceId !== nextNode.instanceId || prevKind !== nextKind) {
      routingRelevantChanged =
        collectSubtreeDamageAndRouting(
          prevNode,
          params.pooledRemovedRenderInstanceIds,
          params.pooledDamageRuntimeStack,
        ) || routingRelevantChanged;
      routingRelevantChanged =
        collectSubtreeDamageAndRouting(
          nextNode,
          params.pooledChangedRenderInstanceIds,
          params.pooledDamageRuntimeStack,
        ) || routingRelevantChanged;
      continue;
    }

    if (isRoutingRelevantKind(nextKind)) routingRelevantChanged = true;

    if (isDamageGranularityKind(nextKind)) {
      params.pooledChangedRenderInstanceIds.push(nextNode.instanceId);
      continue;
    }

    const prevChildren = prevNode.children;
    const nextChildren = nextNode.children;
    const sharedCount = Math.min(prevChildren.length, nextChildren.length);
    let hadChildChanges = prevChildren.length !== nextChildren.length;

    for (let i = sharedCount - 1; i >= 0; i--) {
      const prevChild = prevChildren[i];
      const nextChild = nextChildren[i];
      if (!prevChild || !nextChild) continue;
      if (prevChild === nextChild) {
        if (!nextChild.dirty) continue;
        hadChildChanges = true;
        params.pooledPrevRuntimeStack.push(prevChild);
        params.pooledRuntimeStack.push(nextChild);
        continue;
      }
      hadChildChanges = true;
      params.pooledPrevRuntimeStack.push(prevChild);
      params.pooledRuntimeStack.push(nextChild);
    }

    if (nextChildren.length > sharedCount) {
      hadChildChanges = true;
      for (let i = sharedCount; i < nextChildren.length; i++) {
        const child = nextChildren[i];
        if (!child) continue;
        routingRelevantChanged =
          collectSubtreeDamageAndRouting(
            child,
            params.pooledChangedRenderInstanceIds,
            params.pooledDamageRuntimeStack,
          ) || routingRelevantChanged;
      }
    }

    if (prevChildren.length > sharedCount) {
      hadChildChanges = true;
      for (let i = sharedCount; i < prevChildren.length; i++) {
        const child = prevChildren[i];
        if (!child) continue;
        routingRelevantChanged =
          collectSubtreeDamageAndRouting(
            child,
            params.pooledRemovedRenderInstanceIds,
            params.pooledDamageRuntimeStack,
          ) || routingRelevantChanged;
      }
    }

    if (!hadChildChanges) {
      params.pooledChangedRenderInstanceIds.push(nextNode.instanceId);
    }
  }

  params.pooledPrevRuntimeStack.length = 0;
  params.pooledRuntimeStack.length = 0;

  return {
    changedInstanceIds: params.pooledChangedRenderInstanceIds,
    removedInstanceIds: params.pooledRemovedRenderInstanceIds,
    routingRelevantChanged,
  };
}

export function appendDamageRectForInstanceId(
  instanceId: InstanceId,
  pooledDamageRectByInstanceId: ReadonlyMap<InstanceId, Rect>,
  prevFrameDamageRectByInstanceId: ReadonlyMap<InstanceId, Rect>,
  pooledDamageRects: Rect[],
): boolean {
  const current = pooledDamageRectByInstanceId.get(instanceId);
  const prev = prevFrameDamageRectByInstanceId.get(instanceId);
  if (isNonEmptyRect(current) && isNonEmptyRect(prev)) {
    pooledDamageRects.push(unionRect(current, prev));
    return true;
  }
  if (isNonEmptyRect(current)) {
    pooledDamageRects.push(current);
    return true;
  }
  if (isNonEmptyRect(prev)) {
    pooledDamageRects.push(prev);
    return true;
  }
  return false;
}

export function appendDamageRectForId(
  id: string,
  pooledDamageRectById: ReadonlyMap<string, Rect>,
  prevFrameDamageRectById: ReadonlyMap<string, Rect>,
  pooledDamageRects: Rect[],
): boolean {
  const current = pooledDamageRectById.get(id);
  const prev = prevFrameDamageRectById.get(id);
  if (isNonEmptyRect(current) && isNonEmptyRect(prev)) {
    pooledDamageRects.push(unionRect(current, prev));
    return true;
  }
  if (isNonEmptyRect(current)) {
    pooledDamageRects.push(current);
    return true;
  }
  if (isNonEmptyRect(prev)) {
    pooledDamageRects.push(prev);
    return true;
  }
  return false;
}

export function refreshDamageRectIndexesForLayoutSkippedCommit(
  params: RefreshDamageRectIndexesForLayoutSkippedCommitParams,
): void {
  params.pooledDamageRectByInstanceId.clear();
  params.pooledDamageRectById.clear();
  params.pooledRuntimeStack.length = 0;
  params.pooledRuntimeStack.push(params.runtimeRoot);

  while (params.pooledRuntimeStack.length > 0) {
    const node = params.pooledRuntimeStack.pop();
    if (!node) continue;

    const rect = params.pooledRectByInstanceId.get(node.instanceId);
    if (rect) {
      const damageRect = getRuntimeNodeDamageRect(node, rect);
      params.pooledDamageRectByInstanceId.set(node.instanceId, damageRect);
      const id = (node.vnode as { props?: { id?: unknown } }).props?.id;
      if (typeof id === "string" && id.length > 0 && !params.pooledDamageRectById.has(id)) {
        params.pooledDamageRectById.set(id, damageRect);
      }
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) params.pooledRuntimeStack.push(child);
    }
  }
}

export function collectSpinnerDamageRects(params: CollectSpinnerDamageRectsParams): void {
  params.pooledRuntimeStack.length = 0;
  params.pooledLayoutStack.length = 0;
  params.pooledRuntimeStack.push(params.runtimeRoot);
  params.pooledLayoutStack.push(params.layoutRoot);

  while (params.pooledRuntimeStack.length > 0 && params.pooledLayoutStack.length > 0) {
    const runtimeNode = params.pooledRuntimeStack.pop();
    const layoutNode = params.pooledLayoutStack.pop();
    if (!runtimeNode || !layoutNode) continue;

    if (runtimeNode.vnode.kind === "spinner") {
      const rect = layoutNode.rect;
      if (rect.w > 0 && rect.h > 0) params.pooledDamageRects.push(rect);
    }

    const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
    for (let i = childCount - 1; i >= 0; i--) {
      const runtimeChild = runtimeNode.children[i];
      const layoutChild = layoutNode.children[i];
      if (runtimeChild && layoutChild) {
        params.pooledRuntimeStack.push(runtimeChild);
        params.pooledLayoutStack.push(layoutChild);
      }
    }
  }
}

export function appendDamageRectsForFocusAnnouncers(
  params: AppendDamageRectsForFocusAnnouncersParams,
): boolean {
  params.pooledRuntimeStack.length = 0;
  params.pooledRuntimeStack.push(params.runtimeRoot);

  while (params.pooledRuntimeStack.length > 0) {
    const node = params.pooledRuntimeStack.pop();
    if (!node) continue;

    if (node.vnode.kind === "focusAnnouncer") {
      if (
        !appendDamageRectForInstanceId(
          node.instanceId,
          params.pooledDamageRectByInstanceId,
          params.prevFrameDamageRectByInstanceId,
          params.pooledDamageRects,
        )
      ) {
        return false;
      }
    }

    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) params.pooledRuntimeStack.push(child);
    }
  }

  return true;
}

export function normalizeDamageRects(
  viewport: DamageViewport,
  pooledDamageRects: readonly Rect[],
  pooledMergedDamageRects: Rect[],
): readonly Rect[] {
  pooledMergedDamageRects.length = 0;
  for (const raw of pooledDamageRects) {
    const clipped = clipRectToViewport(raw, viewport);
    if (!clipped) continue;

    let merged = clipped;
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (let i = 0; i < pooledMergedDamageRects.length; i++) {
        const existing = pooledMergedDamageRects[i];
        if (!existing) continue;
        if (!rectOverlapsOrTouches(existing, merged)) continue;
        merged = unionRect(existing, merged);
        pooledMergedDamageRects.splice(i, 1);
        expanded = true;
        break;
      }
    }
    pooledMergedDamageRects.push(merged);
  }

  pooledMergedDamageRects.sort((a, b) => a.y - b.y || a.x - b.x);
  return pooledMergedDamageRects;
}

export function isDamageAreaTooLarge(
  viewport: DamageViewport,
  pooledMergedDamageRects: readonly Rect[],
): boolean {
  const totalCells = viewport.cols * viewport.rows;
  if (totalCells <= 0) return true;
  let area = 0;
  for (const rect of pooledMergedDamageRects) {
    area += rect.w * rect.h;
  }
  return area > totalCells * INCREMENTAL_DAMAGE_AREA_FRACTION;
}
