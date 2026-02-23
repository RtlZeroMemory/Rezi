import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_KEY_UP,
  ZR_MOD_CTRL,
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import type { Rect } from "../../layout/types.js";
import type {
  TableLocalState,
  TableStateStore,
  TreeLocalState,
  TreeStateStore,
  VirtualListLocalState,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import { routeTableKey, routeTreeKey, routeVirtualListKey } from "../../runtime/router.js";
import type { RoutedAction } from "../../runtime/router.js";
import { getHunkScrollPosition, navigateHunk } from "../../widgets/diffViewer.js";
import { applyFilters } from "../../widgets/logsConsole.js";
import { adjustSliderValue, normalizeSliderState } from "../../widgets/slider.js";
import { distributeColumnWidths } from "../../widgets/table.js";
import { parseToastActionFocusId } from "../../widgets/toast.js";
import { type FlattenedNode, flattenTree } from "../../widgets/tree.js";
import type {
  CheckboxProps,
  DiffViewerProps,
  LogsConsoleProps,
  RadioGroupProps,
  SelectProps,
  SliderProps,
  TableProps,
  TreeProps,
  VirtualListProps,
} from "../../widgets/types.js";
import {
  computeVisibleRange,
  resolveVirtualListItemHeightSpec,
} from "../../widgets/virtualList.js";
import type { DiffRenderCache, LogsConsoleRenderCache, TableRenderCache } from "./renderCaches.js";

export type KeyboardRoutingOutcome = Readonly<{
  needsRender: boolean;
  action?: RoutedAction;
}>;

type RouteToastActionKeyDownContext = Readonly<{
  focusedId: string | null;
  toastActionByFocusId: ReadonlyMap<string, () => void>;
}>;

type RouteLogsConsoleKeyDownContext = Readonly<{
  focusedId: string | null;
  logsConsoleById: ReadonlyMap<string, LogsConsoleProps>;
  rectById: ReadonlyMap<string, Rect>;
  logsConsoleRenderCacheById: ReadonlyMap<string, LogsConsoleRenderCache>;
  logsConsoleLastGTimeById: Map<string, number>;
}>;

type RouteDiffViewerKeyDownContext = Readonly<{
  focusedId: string | null;
  diffViewerById: ReadonlyMap<string, DiffViewerProps>;
  diffViewerFocusedHunkById: Map<string, number>;
  diffViewerExpandedHunksById: Map<string, ReadonlySet<number>>;
}>;

type RouteVirtualListKeyDownContext = Readonly<{
  focusedId: string | null;
  virtualListById: ReadonlyMap<string, VirtualListProps<unknown>>;
  virtualListStore: VirtualListStateStore;
}>;

type RouteTableKeyDownContext = Readonly<{
  focusedId: string | null;
  tableById: ReadonlyMap<string, TableProps<unknown>>;
  tableRenderCacheById: ReadonlyMap<string, TableRenderCache>;
  tableStore: TableStateStore;
  emptyStringArray: readonly string[];
}>;

type RouteTreeKeyDownContext = Readonly<{
  focusedId: string | null;
  treeById: ReadonlyMap<string, TreeProps<unknown>>;
  treeStore: TreeStateStore;
  loadedTreeChildrenByTreeId: Map<string, ReadonlyMap<string, readonly unknown[]>>;
  treeLoadTokenByTreeAndKey: Map<string, number>;
  allocNextTreeLoadToken: () => number;
  requestRender: () => void;
}>;

type RouteSliderKeyDownContext = Readonly<{
  focusedId: string | null;
  sliderById: ReadonlyMap<string, SliderProps>;
}>;

type RouteSelectKeyDownContext = Readonly<{
  focusedId: string | null;
  selectById: ReadonlyMap<string, SelectProps>;
}>;

type RouteCheckboxKeyDownContext = Readonly<{
  focusedId: string | null;
  checkboxById: ReadonlyMap<string, CheckboxProps>;
}>;

type RouteRadioGroupKeyDownContext = Readonly<{
  focusedId: string | null;
  radioGroupById: ReadonlyMap<string, RadioGroupProps>;
}>;

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);
const ROUTE_RENDER: KeyboardRoutingOutcome = Object.freeze({ needsRender: true });
const ROUTE_NO_RENDER: KeyboardRoutingOutcome = Object.freeze({ needsRender: false });

export function routeToastActionKeyDown(
  event: ZrevEvent,
  ctx: RouteToastActionKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  if (
    parseToastActionFocusId(focusedId) !== null &&
    (event.key === ZR_KEY_ENTER || event.key === ZR_KEY_SPACE)
  ) {
    const cb = ctx.toastActionByFocusId.get(focusedId);
    if (cb) {
      cb();
      return ROUTE_RENDER;
    }
  }

  return null;
}

export function routeLogsConsoleKeyDown(
  event: ZrevEvent,
  ctx: RouteLogsConsoleKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const logs = ctx.logsConsoleById.get(focusedId);
  if (!logs) return null;

  const rect = ctx.rectById.get(logs.id) ?? null;
  const viewportHeight = rect ? Math.max(1, rect.h) : 1;

  const cached = ctx.logsConsoleRenderCacheById.get(logs.id);
  const filtered =
    cached?.filtered ??
    applyFilters(logs.entries, logs.levelFilter, logs.sourceFilter, logs.searchQuery);
  const filteredLen = filtered.length;
  const maxScroll = Math.max(0, filteredLen - viewportHeight);

  const isShift = (event.mods & ZR_MOD_SHIFT) !== 0;
  const key = event.key;

  const isDown = key === ZR_KEY_DOWN || (!isShift && key === 74) /* J */;
  const isUp = key === ZR_KEY_UP || (!isShift && key === 75) /* K */;

  if (isDown || isUp) {
    const delta = isUp ? -1 : 1;
    const nextScrollTop = Math.max(0, Math.min(maxScroll, logs.scrollTop + delta));
    if (nextScrollTop !== logs.scrollTop) {
      logs.onScroll(nextScrollTop);
      return ROUTE_RENDER;
    }
    return ROUTE_NO_RENDER;
  }

  if (key === 71 /* G */) {
    if (isShift) {
      if (logs.scrollTop !== maxScroll) {
        logs.onScroll(maxScroll);
        return ROUTE_RENDER;
      }
      return ROUTE_NO_RENDER;
    }

    const prevG = ctx.logsConsoleLastGTimeById.get(logs.id);
    ctx.logsConsoleLastGTimeById.set(logs.id, event.timeMs);
    if (prevG !== undefined && event.timeMs - prevG <= 500) {
      ctx.logsConsoleLastGTimeById.delete(logs.id);
      if (logs.scrollTop !== 0) {
        logs.onScroll(0);
        return ROUTE_RENDER;
      }
      return ROUTE_NO_RENDER;
    }
    return ROUTE_NO_RENDER;
  }

  if (!isShift && key === 67 /* C */ && logs.onClear) {
    logs.onClear();
    return ROUTE_RENDER;
  }

  if (key === ZR_KEY_ENTER && logs.onEntryToggle) {
    const idx = Math.max(0, Math.min(filtered.length - 1, logs.scrollTop));
    const entry = filtered[idx];
    if (entry) {
      const expanded = logs.expandedEntries?.includes(entry.id) ?? false;
      logs.onEntryToggle(entry.id, !expanded);
      return ROUTE_RENDER;
    }
    return ROUTE_NO_RENDER;
  }

  return null;
}

export function routeDiffViewerKeyDown(
  event: ZrevEvent,
  ctx: RouteDiffViewerKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const diff = ctx.diffViewerById.get(focusedId);
  if (!diff) return null;

  const isShift = (event.mods & ZR_MOD_SHIFT) !== 0;
  const key = event.key;

  const hunkCount = diff.diff.hunks.length;
  const curFocused = ctx.diffViewerFocusedHunkById.get(diff.id) ?? diff.focusedHunk ?? 0;
  const focusedHunk = Math.max(0, Math.min(hunkCount - 1, curFocused));

  const isNext = key === ZR_KEY_DOWN || (!isShift && key === 74) /* J */;
  const isPrev = key === ZR_KEY_UP || (!isShift && key === 75) /* K */;

  if (isNext || isPrev) {
    const nextFocused = navigateHunk(focusedHunk, isNext ? "next" : "prev", hunkCount);
    ctx.diffViewerFocusedHunkById.set(diff.id, nextFocused);
    diff.onScroll(getHunkScrollPosition(nextFocused, diff.diff.hunks));
    return ROUTE_RENDER;
  }

  if (key === ZR_KEY_ENTER) {
    const base =
      ctx.diffViewerExpandedHunksById.get(diff.id) ?? new Set<number>(diff.expandedHunks ?? []);
    const next = new Set<number>(base);
    const expanded = next.has(focusedHunk);
    if (expanded) next.delete(focusedHunk);
    else next.add(focusedHunk);
    ctx.diffViewerExpandedHunksById.set(diff.id, next);
    diff.onHunkToggle?.(focusedHunk, !expanded);
    return ROUTE_RENDER;
  }

  if (!isShift && key === 83 /* S */ && diff.onStageHunk) {
    diff.onStageHunk(focusedHunk);
    return ROUTE_RENDER;
  }
  if (!isShift && key === 85 /* U */ && diff.onUnstageHunk) {
    diff.onUnstageHunk(focusedHunk);
    return ROUTE_RENDER;
  }
  if (!isShift && key === 65 /* A */ && diff.onApplyHunk) {
    diff.onApplyHunk(focusedHunk);
    return ROUTE_RENDER;
  }
  if (!isShift && key === 82 /* R */ && diff.onRevertHunk) {
    diff.onRevertHunk(focusedHunk);
    return ROUTE_RENDER;
  }

  return null;
}

export function routeVirtualListKeyDown(
  event: ZrevEvent,
  ctx: RouteVirtualListKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const vlist = ctx.virtualListById.get(focusedId);
  if (!vlist) return null;

  const state: VirtualListLocalState = ctx.virtualListStore.get(vlist.id);
  const itemHeight = resolveVirtualListItemHeightSpec(vlist);
  const measuredHeights =
    vlist.estimateItemHeight !== undefined &&
    state.measuredHeights !== undefined &&
    state.measuredItemCount === vlist.items.length
      ? state.measuredHeights
      : undefined;
  const prevScrollTop = state.scrollTop;
  const r = routeVirtualListKey(event, {
    virtualListId: vlist.id,
    items: vlist.items,
    itemHeight,
    ...(measuredHeights === undefined ? {} : { measuredHeights }),
    state,
    keyboardNavigation: vlist.keyboardNavigation !== false,
    wrapAround: vlist.wrapAround === true,
  });

  let changed = false;
  if (r.nextSelectedIndex !== undefined || r.nextScrollTop !== undefined) {
    const patch: { selectedIndex?: number; scrollTop?: number } = {};
    if (r.nextSelectedIndex !== undefined) patch.selectedIndex = r.nextSelectedIndex;
    if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
    ctx.virtualListStore.set(vlist.id, patch);
    changed = true;
  }

  if (
    r.nextScrollTop !== undefined &&
    r.nextScrollTop !== prevScrollTop &&
    typeof vlist.onScroll === "function"
  ) {
    const overscan = vlist.overscan ?? 3;
    const { startIndex, endIndex } = computeVisibleRange(
      vlist.items,
      itemHeight,
      r.nextScrollTop,
      state.viewportHeight,
      overscan,
      measuredHeights,
    );
    vlist.onScroll(r.nextScrollTop, [startIndex, endIndex]);
  }

  let routedAction: RoutedAction | undefined;
  if (r.action) {
    const item = vlist.items[r.action.index];
    if (item !== undefined && vlist.onSelect) vlist.onSelect(item, r.action.index);
    routedAction = Object.freeze({
      id: r.action.id,
      action: "select",
      index: r.action.index,
      ...(item !== undefined ? { item } : {}),
    });
    changed = true;
  }

  if (changed) {
    if (routedAction) return Object.freeze({ needsRender: true, action: routedAction });
    return ROUTE_RENDER;
  }

  return null;
}

export function routeTableKeyDown(
  event: ZrevEvent,
  ctx: RouteTableKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const table = ctx.tableById.get(focusedId);
  if (!table) return null;

  const rowHeight = table.rowHeight ?? 1;
  const tableCache = ctx.tableRenderCacheById.get(table.id);
  const rowKeys = tableCache?.rowKeys ?? table.data.map((row, i) => table.getRowKey(row, i));
  const state: TableLocalState = ctx.tableStore.get(table.id);

  const headerHeight = table.showHeader === false ? 0 : (table.headerHeight ?? 1);
  if (headerHeight <= 0 && state.focusedRowIndex === -1) {
    ctx.tableStore.set(table.id, { focusedRowIndex: 0 });
    return ROUTE_RENDER;
  }

  if (headerHeight > 0) {
    const colCount = table.columns.length;
    const clampColIndex = (idx: number): number => {
      if (colCount <= 0) return 0;
      return Math.max(0, Math.min(colCount - 1, idx));
    };

    if (state.focusedRowIndex === 0 && event.key === ZR_KEY_UP) {
      ctx.tableStore.set(table.id, {
        focusedRowIndex: -1,
        focusedColumnIndex: clampColIndex(state.focusedColumnIndex),
      });
      return ROUTE_RENDER;
    }

    if (state.focusedRowIndex === -1) {
      const colIndex = clampColIndex(state.focusedColumnIndex);
      if (colIndex !== state.focusedColumnIndex) {
        ctx.tableStore.set(table.id, { focusedColumnIndex: colIndex });
        return ROUTE_RENDER;
      }

      if (event.key === ZR_KEY_DOWN) {
        ctx.tableStore.set(table.id, { focusedRowIndex: 0 });
        return ROUTE_RENDER;
      }

      if (event.key === ZR_KEY_HOME) {
        if (colIndex !== 0) {
          ctx.tableStore.set(table.id, { focusedColumnIndex: 0 });
          return ROUTE_RENDER;
        }
        return ROUTE_NO_RENDER;
      }
      if (event.key === ZR_KEY_END) {
        const last = Math.max(0, colCount - 1);
        if (colIndex !== last) {
          ctx.tableStore.set(table.id, { focusedColumnIndex: last });
          return ROUTE_RENDER;
        }
        return ROUTE_NO_RENDER;
      }

      if (event.key === ZR_KEY_LEFT || event.key === ZR_KEY_RIGHT) {
        const delta = event.key === ZR_KEY_RIGHT ? 1 : -1;
        const next = clampColIndex(colIndex + delta);
        if (next !== colIndex) {
          ctx.tableStore.set(table.id, { focusedColumnIndex: next });
          return ROUTE_RENDER;
        }
        return ROUTE_NO_RENDER;
      }

      if (event.key === ZR_KEY_ENTER || event.key === ZR_KEY_SPACE) {
        const col = table.columns[colIndex];
        if (col && col.sortable === true && typeof table.onSort === "function") {
          const nextDirection: "asc" | "desc" =
            table.sortColumn === col.key && table.sortDirection === "asc" ? "desc" : "asc";
          table.onSort(col.key, nextDirection);
          return ROUTE_RENDER;
        }
        return ROUTE_NO_RENDER;
      }

      if (event.key === ZR_KEY_UP) {
        return ROUTE_NO_RENDER;
      }
    }
  }

  if (state.focusedRowIndex !== -1) {
    const r = routeTableKey(event, {
      tableId: table.id,
      rowKeys,
      ...(tableCache?.rowKeyToIndex ? { rowKeyToIndex: tableCache.rowKeyToIndex } : {}),
      data: table.data,
      rowHeight,
      state,
      selection: (table.selection ??
        ctx.emptyStringArray ??
        EMPTY_STRING_ARRAY) as readonly string[],
      selectionMode: table.selectionMode ?? "none",
      keyboardNavigation: true,
    });

    if (r.consumed) {
      if (
        r.nextFocusedRowIndex !== undefined ||
        r.nextScrollTop !== undefined ||
        r.nextLastClickedKey !== undefined
      ) {
        const patch: {
          focusedRowIndex?: number;
          scrollTop?: number;
          lastClickedKey?: string | null;
        } = {};
        if (r.nextFocusedRowIndex !== undefined) {
          patch.focusedRowIndex = r.nextFocusedRowIndex;
        }
        if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
        if (r.nextLastClickedKey !== undefined) patch.lastClickedKey = r.nextLastClickedKey;
        ctx.tableStore.set(table.id, patch);
      }

      if (r.nextSelection !== undefined && table.onSelectionChange) {
        table.onSelectionChange(r.nextSelection);
      }

      let routedAction: RoutedAction | undefined;
      if (r.action) {
        const row = table.data[r.action.rowIndex];
        if (row !== undefined && table.onRowPress) table.onRowPress(row, r.action.rowIndex);
        routedAction = Object.freeze({
          id: r.action.id,
          action: "rowPress",
          rowIndex: r.action.rowIndex,
          ...(row !== undefined ? { row } : {}),
        });
      }

      if (routedAction) return Object.freeze({ needsRender: true, action: routedAction });
      return ROUTE_RENDER;
    }
  }

  return null;
}

export function routeTreeKeyDown(
  event: ZrevEvent,
  ctx: RouteTreeKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const tree = ctx.treeById.get(focusedId);
  if (!tree) return null;

  const state: TreeLocalState = ctx.treeStore.get(tree.id);
  const expandedSet =
    state.expandedSetRef === tree.expanded && state.expandedSet
      ? state.expandedSet
      : new Set(tree.expanded);
  if (state.expandedSetRef !== tree.expanded) {
    ctx.treeStore.set(tree.id, { expandedSetRef: tree.expanded, expandedSet });
  }

  const loaded = ctx.loadedTreeChildrenByTreeId.get(tree.id);
  const getChildrenRaw = tree.getChildren as
    | ((n: unknown) => readonly unknown[] | undefined)
    | undefined;
  const getKey = tree.getKey as (n: unknown) => string;
  const getChildren = loaded
    ? (n: unknown) => {
        const k = getKey(n);
        const cached = loaded.get(k);
        return cached ?? getChildrenRaw?.(n);
      }
    : getChildrenRaw;

  const cached = state.flatCache;
  const canReuseFlatCache =
    cached &&
    cached.kind === "tree" &&
    cached.dataRef === tree.data &&
    cached.expandedRef === tree.expanded &&
    cached.getKeyRef === tree.getKey &&
    cached.getChildrenRef === tree.getChildren &&
    cached.hasChildrenRef === tree.hasChildren &&
    cached.loadedRef === loaded;

  const flatNodes: readonly FlattenedNode<unknown>[] = canReuseFlatCache
    ? (cached.flatNodes as readonly FlattenedNode<unknown>[])
    : flattenTree(
        tree.data,
        getKey,
        getChildren,
        tree.hasChildren as ((n: unknown) => boolean) | undefined,
        tree.expanded,
        expandedSet,
      );

  if (!canReuseFlatCache) {
    ctx.treeStore.set(tree.id, {
      flatCache: Object.freeze({
        kind: "tree",
        dataRef: tree.data,
        expandedRef: tree.expanded,
        loadedRef: loaded,
        getKeyRef: tree.getKey,
        getChildrenRef: tree.getChildren,
        hasChildrenRef: tree.hasChildren,
        flatNodes: flatNodes as readonly unknown[],
      }),
    });
  }

  const r = routeTreeKey(event, {
    treeId: tree.id,
    flatNodes,
    expanded: tree.expanded,
    state,
    keyboardNavigation: true,
  });

  if (!r.consumed) return null;

  if (r.nextFocusedKey !== undefined || r.nextScrollTop !== undefined) {
    const patch: { focusedKey?: string | null; scrollTop?: number } = {};
    if (r.nextFocusedKey !== undefined) patch.focusedKey = r.nextFocusedKey;
    if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
    ctx.treeStore.set(tree.id, patch);
  }

  if (r.nodeToSelect && tree.onSelect) {
    const found = flatNodes.find((n) => n.key === r.nodeToSelect);
    if (found) tree.onSelect(found.node as unknown);
  }

  let routedAction: RoutedAction | undefined;

  if (r.nodeToActivate) {
    const found = flatNodes.find((n) => n.key === r.nodeToActivate);
    if (found && tree.onActivate) tree.onActivate(found.node as unknown);
    routedAction = Object.freeze({
      id: tree.id,
      action: "activate",
      nodeKey: r.nodeToActivate,
    });
  }

  if (r.nodeToLoad && tree.loadChildren) {
    const nodeKey = r.nodeToLoad;
    const alreadyLoaded = ctx.loadedTreeChildrenByTreeId.get(tree.id)?.get(nodeKey) !== undefined;
    const alreadyLoading = state.loadingKeys.has(nodeKey);
    const found = flatNodes.find((n) => n.key === nodeKey);

    if (!alreadyLoaded && !alreadyLoading && found) {
      ctx.treeStore.startLoading(tree.id, nodeKey);
      const token = ctx.allocNextTreeLoadToken();
      const tokenKey = `${tree.id}\u0000${nodeKey}`;
      ctx.treeLoadTokenByTreeAndKey.set(tokenKey, token);

      void tree.loadChildren(found.node as unknown).then(
        (children) => {
          if (ctx.treeLoadTokenByTreeAndKey.get(tokenKey) !== token) return;
          ctx.treeLoadTokenByTreeAndKey.delete(tokenKey);

          const prev = ctx.loadedTreeChildrenByTreeId.get(tree.id);
          const next = new Map<string, readonly unknown[]>(prev ? Array.from(prev.entries()) : []);
          next.set(nodeKey, Object.freeze(children.slice()));
          ctx.loadedTreeChildrenByTreeId.set(tree.id, next);

          ctx.treeStore.finishLoading(tree.id, nodeKey);
          ctx.requestRender();
        },
        () => {
          if (ctx.treeLoadTokenByTreeAndKey.get(tokenKey) !== token) return;
          ctx.treeLoadTokenByTreeAndKey.delete(tokenKey);
          ctx.treeStore.finishLoading(tree.id, nodeKey);
          ctx.requestRender();
        },
      );
    }
  }

  if (r.nextExpanded !== undefined) {
    const prev = new Set(tree.expanded);
    const next = new Set(r.nextExpanded);
    const diffs: string[] = [];
    for (const k of next) if (!prev.has(k)) diffs.push(k);
    for (const k of prev) if (!next.has(k)) diffs.push(k);

    for (const k of diffs) {
      const found = flatNodes.find((n) => n.key === k);
      if (found) tree.onToggle(found.node as unknown, next.has(k));
    }
  }

  if (routedAction) return Object.freeze({ needsRender: true, action: routedAction });
  return ROUTE_RENDER;
}

export function routeSliderKeyDown(
  event: ZrevEvent,
  ctx: RouteSliderKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const slider = ctx.sliderById.get(focusedId);
  if (!slider || slider.disabled === true) return null;

  const adjustment =
    event.key === ZR_KEY_LEFT || event.key === ZR_KEY_DOWN
      ? "decrease"
      : event.key === ZR_KEY_RIGHT || event.key === ZR_KEY_UP
        ? "increase"
        : event.key === ZR_KEY_PAGE_DOWN
          ? "decreasePage"
          : event.key === ZR_KEY_PAGE_UP
            ? "increasePage"
            : event.key === ZR_KEY_HOME
              ? "toMin"
              : event.key === ZR_KEY_END
                ? "toMax"
                : null;

  if (adjustment === null) return null;
  if (slider.readOnly === true || !slider.onChange) return ROUTE_NO_RENDER;

  const normalized = normalizeSliderState({
    value: slider.value,
    min: slider.min,
    max: slider.max,
    step: slider.step,
  });
  const nextValue = adjustSliderValue(normalized.value, normalized, adjustment);
  if (nextValue !== normalized.value) {
    slider.onChange(nextValue);
    return ROUTE_RENDER;
  }
  return ROUTE_NO_RENDER;
}

export function routeSelectKeyDown(
  event: ZrevEvent,
  ctx: RouteSelectKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const select = ctx.selectById.get(focusedId);
  if (!select || select.disabled === true || select.options.length <= 0) return null;

  const KEY_UP = 20;
  const KEY_DOWN = 21;
  const KEY_ENTER = 2;
  const KEY_SPACE = 32;

  const dir =
    event.key === KEY_UP
      ? -1
      : event.key === KEY_DOWN
        ? 1
        : event.key === KEY_ENTER || event.key === KEY_SPACE
          ? 1
          : 0;

  if (dir === 0 || !select.onChange) return null;

  const opts = select.options.filter((o) => o.disabled !== true);
  if (opts.length > 0) {
    const idx = opts.findIndex((o) => o.value === select.value);
    const nextIdx = idx < 0 ? 0 : (idx + dir + opts.length) % opts.length;
    const next = opts[nextIdx];
    if (next && next.value !== select.value) {
      select.onChange(next.value);
      return ROUTE_RENDER;
    }
  }

  return null;
}

export function routeCheckboxKeyDown(
  event: ZrevEvent,
  ctx: RouteCheckboxKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const checkbox = ctx.checkboxById.get(focusedId);
  if (!checkbox || checkbox.disabled === true || !checkbox.onChange) return null;

  const KEY_ENTER = 2;
  const KEY_SPACE = 32;
  if (event.key !== KEY_ENTER && event.key !== KEY_SPACE) return null;

  const nextChecked = !checkbox.checked;
  checkbox.onChange(nextChecked);
  const action: RoutedAction = Object.freeze({
    id: focusedId,
    action: "toggle",
    checked: nextChecked,
  });
  return Object.freeze({ needsRender: true, action });
}

export function routeRadioGroupKeyDown(
  event: ZrevEvent,
  ctx: RouteRadioGroupKeyDownContext,
): KeyboardRoutingOutcome | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const focusedId = ctx.focusedId;
  if (!focusedId) return null;

  const radio = ctx.radioGroupById.get(focusedId);
  if (!radio || radio.disabled === true || !radio.onChange) return null;

  const KEY_UP = 20;
  const KEY_DOWN = 21;
  const KEY_LEFT = 22;
  const KEY_RIGHT = 23;
  const isHorizontal = radio.direction === "horizontal";
  const dir =
    (isHorizontal && event.key === KEY_LEFT) || (!isHorizontal && event.key === KEY_UP)
      ? -1
      : (isHorizontal && event.key === KEY_RIGHT) || (!isHorizontal && event.key === KEY_DOWN)
        ? 1
        : 0;

  if (dir === 0) return null;

  const opts = radio.options.filter((o) => o.disabled !== true);
  if (opts.length > 0) {
    const idx = opts.findIndex((o) => o.value === radio.value);
    const nextIdx = idx < 0 ? 0 : (idx + dir + opts.length) % opts.length;
    const next = opts[nextIdx];
    if (next && next.value !== radio.value) {
      radio.onChange(next.value);
      const action: RoutedAction = Object.freeze({
        id: focusedId,
        action: "change",
        value: next.value,
      });
      return Object.freeze({ needsRender: true, action });
    }
  }

  return null;
}
