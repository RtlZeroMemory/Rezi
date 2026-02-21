/**
 * packages/core/src/runtime/localState.ts — Per-instance local state storage.
 *
 * Why: Provides a key-value store for runtime-local state associated with
 * widget instances. State is keyed by instanceId and persists across renders
 * for reused instances, but is cleaned up when instances are unmounted.
 *
 * Stored state:
 *   - layout: computed rect from layout pass
 *   - hover: mouse hover state
 *   - pressed: mouse press state
 *   - focusable: whether widget can receive focus
 *   - tabIndex: position in focus traversal order
 *
 * @see docs/guide/runtime-and-layout.md
 */

import type { InstanceId } from "./instance.js";

/** Rectangle in terminal cell coordinates. */
export type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

/** Local state stored per widget instance. */
export type RuntimeLocalState = Readonly<{
  layout: Rect | null;
  hover: boolean;
  pressed: boolean;
  focusable: boolean;
  tabIndex: number | null;
}>;

/** Local state for virtualList instances. */
export type VirtualListLocalState = Readonly<{
  scrollTop: number;
  selectedIndex: number;
  viewportHeight: number;
  /** First visible item index (derived from scrollTop). */
  startIndex: number;
  /** One past last visible item index (derived from scrollTop + viewportHeight). */
  endIndex: number;
  /**
   * Cached measured heights (index -> height) used by estimateItemHeight mode.
   * Internal detail; consumers should treat this as read-only snapshot state.
   */
  measuredHeights?: ReadonlyMap<number, number>;
  /** Width used when building `measuredHeights`. */
  measuredWidth?: number;
  /** Item count used when building `measuredHeights`. */
  measuredItemCount?: number;
}>;

/** Partial update to local state (undefined fields are not changed). */
export type RuntimeLocalStatePatch = Readonly<{
  layout?: Rect | null;
  hover?: boolean;
  pressed?: boolean;
  focusable?: boolean;
  tabIndex?: number | null;
}>;

/** Store interface for per-instance local state. */
export type RuntimeLocalStateStore = Readonly<{
  get: (instanceId: InstanceId) => RuntimeLocalState | undefined;
  set: (instanceId: InstanceId, patch: RuntimeLocalStatePatch) => RuntimeLocalState;
  delete: (instanceId: InstanceId) => void;
}>;

const DEFAULT_STATE: RuntimeLocalState = Object.freeze({
  layout: null,
  hover: false,
  pressed: false,
  focusable: false,
  tabIndex: null,
});

function freezeRect(r: Rect): Rect {
  return Object.freeze({ x: r.x, y: r.y, w: r.w, h: r.h });
}

function freezeState(s: RuntimeLocalState): RuntimeLocalState {
  const layout = s.layout ? freezeRect(s.layout) : null;
  return Object.freeze({
    layout,
    hover: s.hover,
    pressed: s.pressed,
    focusable: s.focusable,
    tabIndex: s.tabIndex,
  });
}

/** Create a new local state store instance. */
export function createRuntimeLocalStateStore(): RuntimeLocalStateStore {
  const table = new Map<InstanceId, RuntimeLocalState>();

  return Object.freeze({
    get: (instanceId) => table.get(instanceId),
    set: (instanceId, patch) => {
      const prev = table.get(instanceId) ?? DEFAULT_STATE;
      const next: RuntimeLocalState = {
        layout: patch.layout !== undefined ? patch.layout : prev.layout,
        hover: patch.hover !== undefined ? patch.hover : prev.hover,
        pressed: patch.pressed !== undefined ? patch.pressed : prev.pressed,
        focusable: patch.focusable !== undefined ? patch.focusable : prev.focusable,
        tabIndex: patch.tabIndex !== undefined ? patch.tabIndex : prev.tabIndex,
      };
      const frozen = freezeState(next);
      table.set(instanceId, frozen);
      return frozen;
    },
    delete: (instanceId) => {
      table.delete(instanceId);
    },
  });
}

/* ========== Virtual List State Store ========== */

const DEFAULT_VLIST_STATE: VirtualListLocalState = Object.freeze({
  scrollTop: 0,
  selectedIndex: 0,
  viewportHeight: 0,
  startIndex: 0,
  endIndex: 0,
});

/** Partial update to virtual list state. */
export type VirtualListLocalStatePatch = Readonly<{
  scrollTop?: number;
  selectedIndex?: number;
  viewportHeight?: number;
  startIndex?: number;
  endIndex?: number;
  measuredHeights?: ReadonlyMap<number, number>;
  measuredWidth?: number;
  measuredItemCount?: number;
}>;

/** Store interface for per-instance virtual list state. */
export type VirtualListStateStore = Readonly<{
  get: (id: string) => VirtualListLocalState;
  set: (id: string, patch: VirtualListLocalStatePatch) => VirtualListLocalState;
  delete: (id: string) => void;
}>;

/** Create a new virtual list state store instance. */
export function createVirtualListStateStore(): VirtualListStateStore {
  const table = new Map<string, VirtualListLocalState>();

  return Object.freeze({
    get: (id) => table.get(id) ?? DEFAULT_VLIST_STATE,
    set: (id, patch) => {
      const prev = table.get(id) ?? DEFAULT_VLIST_STATE;
      const measuredHeights =
        patch.measuredHeights !== undefined ? patch.measuredHeights : prev.measuredHeights;
      const measuredWidth =
        patch.measuredWidth !== undefined ? patch.measuredWidth : prev.measuredWidth;
      const measuredItemCount =
        patch.measuredItemCount !== undefined ? patch.measuredItemCount : prev.measuredItemCount;
      const next: VirtualListLocalState = Object.freeze({
        scrollTop: patch.scrollTop !== undefined ? patch.scrollTop : prev.scrollTop,
        selectedIndex: patch.selectedIndex !== undefined ? patch.selectedIndex : prev.selectedIndex,
        viewportHeight:
          patch.viewportHeight !== undefined ? patch.viewportHeight : prev.viewportHeight,
        startIndex: patch.startIndex !== undefined ? patch.startIndex : prev.startIndex,
        endIndex: patch.endIndex !== undefined ? patch.endIndex : prev.endIndex,
        ...(measuredHeights === undefined ? {} : { measuredHeights }),
        ...(measuredWidth === undefined ? {} : { measuredWidth }),
        ...(measuredItemCount === undefined ? {} : { measuredItemCount }),
      });
      table.set(id, next);
      return next;
    },
    delete: (id) => {
      table.delete(id);
    },
  });
}

/* ========== Table State Store (GitHub issue #118) ========== */

/** Local state for table instances. */
export type TableLocalState = Readonly<{
  /** Current scroll position (row offset). */
  scrollTop: number;
  /** Index of the focused row (-1 if none). */
  focusedRowIndex: number;
  /** Index of the focused header column (when focusedRowIndex === -1). */
  focusedColumnIndex: number;
  /** Last clicked row key (for shift-select). */
  lastClickedKey: string | null;
  /** Viewport height in rows. */
  viewportHeight: number;
  /** First visible row index (derived). */
  startIndex: number;
  /** One past last visible row index (derived). */
  endIndex: number;
}>;

const DEFAULT_TABLE_STATE: TableLocalState = Object.freeze({
  scrollTop: 0,
  focusedRowIndex: 0,
  focusedColumnIndex: 0,
  lastClickedKey: null,
  viewportHeight: 0,
  startIndex: 0,
  endIndex: 0,
});

/** Partial update to table state. */
export type TableLocalStatePatch = Readonly<{
  scrollTop?: number;
  focusedRowIndex?: number;
  focusedColumnIndex?: number;
  lastClickedKey?: string | null;
  viewportHeight?: number;
  startIndex?: number;
  endIndex?: number;
}>;

/** Store interface for per-instance table state. */
export type TableStateStore = Readonly<{
  get: (id: string) => TableLocalState;
  set: (id: string, patch: TableLocalStatePatch) => TableLocalState;
  delete: (id: string) => void;
}>;

/** Create a new table state store instance. */
export function createTableStateStore(): TableStateStore {
  const table = new Map<string, TableLocalState>();

  return Object.freeze({
    get: (id) => table.get(id) ?? DEFAULT_TABLE_STATE,
    set: (id, patch) => {
      const prev = table.get(id) ?? DEFAULT_TABLE_STATE;
      const next: TableLocalState = Object.freeze({
        scrollTop: patch.scrollTop !== undefined ? patch.scrollTop : prev.scrollTop,
        focusedRowIndex:
          patch.focusedRowIndex !== undefined ? patch.focusedRowIndex : prev.focusedRowIndex,
        focusedColumnIndex:
          patch.focusedColumnIndex !== undefined
            ? patch.focusedColumnIndex
            : prev.focusedColumnIndex,
        lastClickedKey:
          patch.lastClickedKey !== undefined ? patch.lastClickedKey : prev.lastClickedKey,
        viewportHeight:
          patch.viewportHeight !== undefined ? patch.viewportHeight : prev.viewportHeight,
        startIndex: patch.startIndex !== undefined ? patch.startIndex : prev.startIndex,
        endIndex: patch.endIndex !== undefined ? patch.endIndex : prev.endIndex,
      });
      table.set(id, next);
      return next;
    },
    delete: (id) => {
      table.delete(id);
    },
  });
}

/* ========== Tree State Store (GitHub issue #122) ========== */

/** Local state for tree instances. */
export type TreeLocalState = Readonly<{
  /** Key of the focused node (null if none). */
  focusedKey: string | null;
  /** Set of node keys currently loading. */
  loadingKeys: ReadonlySet<string>;
  /** Scroll position for virtualized trees. */
  scrollTop: number;
  /** Viewport height for virtualization. */
  viewportHeight: number;
  /**
   * Cached flattened nodes for tree-like widgets (tree/filePicker/fileTreeExplorer).
   * Used to avoid per-frame allocations when inputs are referentially stable.
   */
  flatCache: TreeFlatCache | null;
  /** Cached expanded set (for faster lookup). */
  expandedSetRef: readonly string[] | undefined;
  expandedSet: ReadonlySet<string> | undefined;
  /** Cached tree line prefixes keyed to flatNodes/showLines/indentSize. */
  prefixCache: TreePrefixCache | null;
}>;

export type TreePrefixCache = Readonly<{
  flatNodesRef: readonly unknown[];
  showLines: boolean;
  indentSize: number;
  prefixes: readonly string[];
}>;

export type TreeFlatCache = Readonly<{
  kind: "fileNode" | "tree";
  dataRef: unknown;
  expandedRef: readonly string[];
  /** Loaded-children map identity (only used for kind="tree"). */
  loadedRef?: unknown;
  /** Key function identity (only used for kind="tree"). */
  getKeyRef: unknown;
  /** Children function identity (only used for kind="tree"). */
  getChildrenRef: unknown;
  /** hasChildren function identity (only used for kind="tree"). */
  hasChildrenRef: unknown;
  /** Flattened nodes (typed by kind at call sites). */
  flatNodes: readonly unknown[];
}>;

const DEFAULT_TREE_STATE: TreeLocalState = Object.freeze({
  focusedKey: null,
  loadingKeys: Object.freeze(new Set<string>()),
  scrollTop: 0,
  viewportHeight: 0,
  flatCache: null,
  expandedSetRef: undefined,
  expandedSet: undefined,
  prefixCache: null,
});

/** Partial update to tree state. */
export type TreeLocalStatePatch = Readonly<{
  focusedKey?: string | null;
  loadingKeys?: ReadonlySet<string>;
  scrollTop?: number;
  viewportHeight?: number;
  flatCache?: TreeFlatCache | null;
  expandedSetRef?: readonly string[];
  expandedSet?: ReadonlySet<string>;
  prefixCache?: TreePrefixCache | null;
}>;

/** Store interface for per-instance tree state. */
export type TreeStateStore = Readonly<{
  get: (id: string) => TreeLocalState;
  set: (id: string, patch: TreeLocalStatePatch) => TreeLocalState;
  delete: (id: string) => void;
  /** Add a key to the loading set. */
  startLoading: (id: string, nodeKey: string) => TreeLocalState;
  /** Remove a key from the loading set. */
  finishLoading: (id: string, nodeKey: string) => TreeLocalState;
}>;

/** Create a new tree state store instance. */
export function createTreeStateStore(): TreeStateStore {
  const table = new Map<string, TreeLocalState>();

  const store: TreeStateStore = Object.freeze({
    get: (id) => table.get(id) ?? DEFAULT_TREE_STATE,
    set: (id, patch) => {
      const prev = table.get(id) ?? DEFAULT_TREE_STATE;
      const next: TreeLocalState = Object.freeze({
        focusedKey: patch.focusedKey !== undefined ? patch.focusedKey : prev.focusedKey,
        loadingKeys: patch.loadingKeys !== undefined ? patch.loadingKeys : prev.loadingKeys,
        scrollTop: patch.scrollTop !== undefined ? patch.scrollTop : prev.scrollTop,
        viewportHeight:
          patch.viewportHeight !== undefined ? patch.viewportHeight : prev.viewportHeight,
        flatCache: patch.flatCache !== undefined ? patch.flatCache : prev.flatCache,
        expandedSetRef:
          patch.expandedSetRef !== undefined ? patch.expandedSetRef : prev.expandedSetRef,
        expandedSet: patch.expandedSet !== undefined ? patch.expandedSet : prev.expandedSet,
        prefixCache: patch.prefixCache !== undefined ? patch.prefixCache : prev.prefixCache,
      });
      table.set(id, next);
      return next;
    },
    delete: (id) => {
      table.delete(id);
    },
    startLoading: (id, nodeKey) => {
      const prev = table.get(id) ?? DEFAULT_TREE_STATE;
      const newLoading = new Set(prev.loadingKeys);
      newLoading.add(nodeKey);
      const next: TreeLocalState = Object.freeze({
        ...prev,
        loadingKeys: Object.freeze(newLoading) as ReadonlySet<string>,
      });
      table.set(id, next);
      return next;
    },
    finishLoading: (id, nodeKey) => {
      const prev = table.get(id) ?? DEFAULT_TREE_STATE;
      if (!prev.loadingKeys.has(nodeKey)) {
        return prev;
      }
      const newLoading = new Set(prev.loadingKeys);
      newLoading.delete(nodeKey);
      const next: TreeLocalState = Object.freeze({
        ...prev,
        loadingKeys: Object.freeze(newLoading) as ReadonlySet<string>,
      });
      table.set(id, next);
      return next;
    },
  });

  return store;
}
