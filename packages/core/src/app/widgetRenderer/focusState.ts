import type { LayoutOverflowMetadata } from "../../layout/constraints.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusManagerState } from "../../runtime/focus.js";
import type { CollectedTrap, CollectedZone, FocusInfo } from "../../runtime/widgetMeta.js";

const EMPTY_FOCUS_ERRORS: readonly string[] = Object.freeze([]);

export type FocusSnapshotState = Readonly<{
  focusState: FocusManagerState;
  focusList: readonly string[];
  baseFocusList: readonly string[];
  enabledById: ReadonlyMap<string, boolean>;
  baseEnabledById: ReadonlyMap<string, boolean>;
  pressableIds: ReadonlySet<string>;
  traps: ReadonlyMap<string, CollectedTrap>;
  zoneMetaById: ReadonlyMap<string, CollectedZone>;
}>;

export type RestoredFocusSnapshotState = Readonly<{
  focusState: FocusManagerState;
  focusList: readonly string[];
  baseFocusList: readonly string[];
  enabledById: ReadonlyMap<string, boolean>;
  baseEnabledById: ReadonlyMap<string, boolean>;
  pressableIds: ReadonlySet<string>;
  traps: ReadonlyMap<string, CollectedTrap>;
  zoneMetaById: ReadonlyMap<string, CollectedZone>;
}>;

type BuildFallbackFocusInfoContext = Readonly<{
  toastActionLabelByFocusId: ReadonlyMap<string, string>;
}>;

type InvokeFocusZoneCallbacksContext = Readonly<{
  prevZoneId: string | null;
  nextZoneId: string | null;
  prevZones: ReadonlyMap<string, CollectedZone>;
  nextZones: ReadonlyMap<string, CollectedZone>;
  reportFocusZoneCallbackError: (phase: "onEnter" | "onExit", error: unknown) => void;
}>;

export function buildFallbackFocusInfo(ctx: BuildFallbackFocusInfoContext, id: string): FocusInfo {
  const toastActionLabel = ctx.toastActionLabelByFocusId.get(id) ?? null;
  const primary = toastActionLabel ?? id;
  return Object.freeze({
    id,
    kind: null,
    accessibleLabel: toastActionLabel,
    visibleLabel: toastActionLabel,
    required: false,
    errors: EMPTY_FOCUS_ERRORS,
    announcement: primary,
  });
}

export function cloneFocusManagerState(state: FocusManagerState): FocusManagerState {
  return Object.freeze({
    focusedId: state.focusedId,
    activeZoneId: state.activeZoneId,
    ...(state.pendingFocusedId === undefined ? {} : { pendingFocusedId: state.pendingFocusedId }),
    zones: new Map(state.zones),
    trapStack: Object.freeze([...state.trapStack]),
    ...(state.trapReturnFocusById === undefined
      ? {}
      : { trapReturnFocusById: new Map(state.trapReturnFocusById) }),
    lastFocusedByZone: new Map(state.lastFocusedByZone),
  });
}

export function captureFocusSnapshotState(
  focusState: FocusManagerState,
  focusList: readonly string[],
  baseFocusList: readonly string[],
  enabledById: ReadonlyMap<string, boolean>,
  baseEnabledById: ReadonlyMap<string, boolean>,
  pressableIds: ReadonlySet<string>,
  traps: ReadonlyMap<string, CollectedTrap>,
  zoneMetaById: ReadonlyMap<string, CollectedZone>,
): FocusSnapshotState {
  return Object.freeze({
    focusState: cloneFocusManagerState(focusState),
    focusList: Object.freeze([...focusList]),
    baseFocusList: Object.freeze([...baseFocusList]),
    enabledById: new Map(enabledById),
    baseEnabledById: new Map(baseEnabledById),
    pressableIds: new Set(pressableIds),
    traps: new Map(traps),
    zoneMetaById: new Map(zoneMetaById),
  });
}

export function restoreFocusSnapshotState(
  snapshot: FocusSnapshotState,
): RestoredFocusSnapshotState {
  return Object.freeze({
    focusState: cloneFocusManagerState(snapshot.focusState),
    focusList: Object.freeze([...snapshot.focusList]),
    baseFocusList: Object.freeze([...snapshot.baseFocusList]),
    enabledById: new Map(snapshot.enabledById),
    baseEnabledById: new Map(snapshot.baseEnabledById),
    pressableIds: new Set(snapshot.pressableIds),
    traps: new Map(snapshot.traps),
    zoneMetaById: new Map(snapshot.zoneMetaById),
  });
}

export function invokeFocusZoneCallbacks(ctx: InvokeFocusZoneCallbacksContext): void {
  if (ctx.prevZoneId === ctx.nextZoneId) return;

  if (ctx.prevZoneId !== null) {
    const prev = ctx.prevZones.get(ctx.prevZoneId);
    if (prev?.onExit) {
      try {
        prev.onExit();
      } catch (error: unknown) {
        ctx.reportFocusZoneCallbackError("onExit", error);
      }
    }
  }

  if (ctx.nextZoneId !== null) {
    const next = ctx.nextZones.get(ctx.nextZoneId);
    if (next?.onEnter) {
      try {
        next.onEnter();
      } catch (error: unknown) {
        ctx.reportFocusZoneCallbackError("onEnter", error);
      }
    }
  }
}

export function findScrollableAncestors(
  targetId: string | null,
  committedRoot: RuntimeInstance | null,
  layoutTree: LayoutTree | null,
): readonly Readonly<{ nodeId: string; meta: LayoutOverflowMetadata }>[] {
  if (targetId === null || !committedRoot || !layoutTree) return Object.freeze([]);

  type ScrollableMatch = Readonly<{ nodeId: string; meta: LayoutOverflowMetadata }>;
  type Cursor = Readonly<{
    runtimeNode: RuntimeInstance;
    layoutNode: LayoutTree;
    scrollables: readonly ScrollableMatch[];
  }>;

  const stack: Cursor[] = [
    {
      runtimeNode: committedRoot,
      layoutNode: layoutTree,
      scrollables: Object.freeze([]),
    },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) continue;

    const runtimeNode = frame.runtimeNode;
    const layoutNode = frame.layoutNode;
    let scrollables = frame.scrollables;

    const props = runtimeNode.vnode.props as Readonly<{
      id?: unknown;
      overflow?: unknown;
    }>;
    const nodeId =
      typeof props.id === "string" && props.id.length > 0 ? (props.id as string) : null;
    if (nodeId !== null && props.overflow === "scroll" && layoutNode.meta) {
      const meta = layoutNode.meta;
      const hasScrollableAxis =
        meta.contentWidth > meta.viewportWidth || meta.contentHeight > meta.viewportHeight;
      if (hasScrollableAxis) {
        scrollables = Object.freeze([...scrollables, { nodeId, meta }]);
      }
    }

    if (nodeId === targetId) {
      return Object.freeze([...scrollables].reverse());
    }

    const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
    for (let i = childCount - 1; i >= 0; i--) {
      const runtimeChild = runtimeNode.children[i];
      const layoutChild = layoutNode.children[i];
      if (!runtimeChild || !layoutChild) continue;
      stack.push({
        runtimeNode: runtimeChild,
        layoutNode: layoutChild,
        scrollables,
      });
    }
  }

  return Object.freeze([]);
}
