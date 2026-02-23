import type { ZrevEvent } from "../../events.js";
import { ZR_MOD_CTRL, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { measureTextCells } from "../../layout/textMeasure.js";
import type { Rect } from "../../layout/types.js";
import type { FocusManagerState } from "../../runtime/focus.js";
import type { LayerRegistry } from "../../runtime/layers.js";
import { hitTestLayers } from "../../runtime/layers.js";
import type {
  TableLocalState,
  TableStateStore,
  TreeLocalState,
  TreeStateStore,
  VirtualListLocalState,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import { routeVirtualListWheel, routeWheel } from "../../runtime/router.js";
import type { CollectedZone } from "../../runtime/widgetMeta.js";
import { applyFilters } from "../../widgets/logsConsole.js";
import {
  computePanelCellSizes,
  handleDividerDrag,
  sizesToPercentages,
} from "../../widgets/splitPane.js";
import { computeSelection, distributeColumnWidths } from "../../widgets/table.js";
import { TOAST_HEIGHT, getToastActionFocusId } from "../../widgets/toast.js";
import { type FlattenedNode, flattenTree } from "../../widgets/tree.js";
import type {
  CodeEditorProps,
  DiffViewerProps,
  DropdownProps,
  FilePickerProps,
  FileTreeExplorerProps,
  LogsConsoleProps,
  SplitDirection,
  SplitPaneProps,
  TableProps,
  ToastContainerProps,
  TreeProps,
  VirtualListProps,
} from "../../widgets/types.js";
import {
  computeVisibleRange,
  getTotalHeight,
  resolveVirtualListItemHeightSpec,
} from "../../widgets/virtualList.js";
import {
  fileNodeGetChildren,
  fileNodeGetKey,
  fileNodeHasChildren,
  makeFileNodeFlatCache,
  readFileNodeFlatCache,
} from "./fileNodeCache.js";
import type {
  CodeEditorRenderCache,
  LogsConsoleRenderCache,
  TableRenderCache,
} from "./renderCaches.js";

export type MouseRoutingOutcome = Readonly<{
  needsRender: boolean;
}>;

export type SplitPaneDragState = Readonly<{
  id: string;
  dividerIndex: number;
  direction: SplitDirection;
  sizeMode: "percent" | "absolute";
  dividerSize: number;
  minSizes: readonly number[] | undefined;
  maxSizes: readonly number[] | undefined;
  startX: number;
  startY: number;
  startCellSizes: readonly number[];
  availableCells: number;
  didDrag: boolean;
}>;

export type SplitPaneLastDividerDownState = Readonly<{
  id: string;
  dividerIndex: number;
  timeMs: number;
}>;

type RouteDropdownMouseContext = Readonly<{
  layerStack: readonly string[];
  dropdownStack: readonly string[];
  dropdownById: ReadonlyMap<string, DropdownProps>;
  dropdownSelectedIndexById: Map<string, number>;
  pressedDropdown: Readonly<{ id: string; itemId: string }> | null;
  setPressedDropdown: (next: Readonly<{ id: string; itemId: string }> | null) => void;
  computeDropdownRect: (props: DropdownProps) => Rect | null;
}>;

type RouteLayerBackdropMouseContext = Readonly<{
  layerRegistry: LayerRegistry;
  closeOnBackdropByLayerId: ReadonlyMap<string, boolean>;
  onCloseByLayerId: ReadonlyMap<string, () => void>;
}>;

type RouteSplitPaneMouseContext = Readonly<{
  splitPaneDrag: SplitPaneDragState | null;
  setSplitPaneDrag: (next: SplitPaneDragState | null) => void;
  splitPaneLastDividerDown: SplitPaneLastDividerDownState | null;
  setSplitPaneLastDividerDown: (next: SplitPaneLastDividerDownState | null) => void;
  splitPaneById: ReadonlyMap<string, SplitPaneProps>;
  splitPaneChildRectsById: ReadonlyMap<string, readonly Rect[]>;
  rectById: ReadonlyMap<string, Rect>;
}>;

type RouteToastMouseDownContext = Readonly<{
  toastContainers: readonly Readonly<{ rect: Rect; props: ToastContainerProps }>[];
  focusState: FocusManagerState;
  setFocusState: (next: FocusManagerState) => void;
  zoneMetaById: ReadonlyMap<string, CollectedZone>;
  invokeFocusZoneCallbacks: (
    prevZoneId: string | null,
    nextZoneId: string | null,
    prevZones: ReadonlyMap<string, CollectedZone>,
    nextZones: ReadonlyMap<string, CollectedZone>,
  ) => void;
}>;

type RouteVirtualListMouseClickContext = Readonly<{
  mouseTargetId: string | null;
  virtualListById: ReadonlyMap<string, VirtualListProps<unknown>>;
  rectById: ReadonlyMap<string, Rect>;
  virtualListStore: VirtualListStateStore;
  pressedVirtualList: Readonly<{ id: string; index: number }> | null;
  setPressedVirtualList: (next: Readonly<{ id: string; index: number }> | null) => void;
}>;

type RouteTableMouseClickContext = Readonly<{
  mouseTargetId: string | null;
  tableById: ReadonlyMap<string, TableProps<unknown>>;
  rectById: ReadonlyMap<string, Rect>;
  tableRenderCacheById: ReadonlyMap<string, TableRenderCache>;
  tableStore: TableStateStore;
  pressedTable: Readonly<{ id: string; rowIndex: number }> | null;
  setPressedTable: (next: Readonly<{ id: string; rowIndex: number }> | null) => void;
  pressedTableHeader: Readonly<{ id: string; columnIndex: number }> | null;
  setPressedTableHeader: (next: Readonly<{ id: string; columnIndex: number }> | null) => void;
  lastTableClick: Readonly<{ id: string; rowIndex: number; timeMs: number }> | null;
  setLastTableClick: (
    next: Readonly<{ id: string; rowIndex: number; timeMs: number }> | null,
  ) => void;
  emptyStringArray: readonly string[];
}>;

type RouteFilePickerMouseClickContext = Readonly<{
  mouseTargetId: string | null;
  filePickerById: ReadonlyMap<string, FilePickerProps>;
  rectById: ReadonlyMap<string, Rect>;
  treeStore: TreeStateStore;
  pressedFilePicker: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
  setPressedFilePicker: (
    next: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null,
  ) => void;
  lastFilePickerClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null;
  setLastFilePickerClick: (
    next: Readonly<{ id: string; nodeIndex: number; nodeKey: string; timeMs: number }> | null,
  ) => void;
}>;

type RouteFileTreeExplorerMouseClickContext = Readonly<{
  mouseTargetId: string | null;
  fileTreeExplorerById: ReadonlyMap<string, FileTreeExplorerProps>;
  rectById: ReadonlyMap<string, Rect>;
  treeStore: TreeStateStore;
  pressedFileTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
  setPressedFileTree: (
    next: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null,
  ) => void;
  lastFileTreeClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null;
  setLastFileTreeClick: (
    next: Readonly<{ id: string; nodeIndex: number; nodeKey: string; timeMs: number }> | null,
  ) => void;
}>;

type RouteTreeMouseClickContext = Readonly<{
  mouseTargetId: string | null;
  treeById: ReadonlyMap<string, TreeProps<unknown>>;
  rectById: ReadonlyMap<string, Rect>;
  treeStore: TreeStateStore;
  loadedTreeChildrenByTreeId: ReadonlyMap<string, ReadonlyMap<string, readonly unknown[]>>;
  pressedTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
  setPressedTree: (
    next: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null,
  ) => void;
  lastTreeClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null;
  setLastTreeClick: (
    next: Readonly<{ id: string; nodeIndex: number; nodeKey: string; timeMs: number }> | null,
  ) => void;
}>;

type RouteFileTreeExplorerContextMenuMouseContext = Readonly<{
  mouseTargetId: string | null;
  fileTreeExplorerById: ReadonlyMap<string, FileTreeExplorerProps>;
  rectById: ReadonlyMap<string, Rect>;
  treeStore: TreeStateStore;
}>;

type RouteMouseWheelContext = Readonly<{
  mouseTargetId: string | null;
  mouseTargetAnyId: string | null;
  focusedId: string | null;
  virtualListById: ReadonlyMap<string, VirtualListProps<unknown>>;
  virtualListStore: VirtualListStateStore;
  codeEditorById: ReadonlyMap<string, CodeEditorProps>;
  codeEditorRenderCacheById: ReadonlyMap<string, CodeEditorRenderCache>;
  logsConsoleById: ReadonlyMap<string, LogsConsoleProps>;
  logsConsoleRenderCacheById: ReadonlyMap<string, LogsConsoleRenderCache>;
  diffViewerById: ReadonlyMap<string, DiffViewerProps>;
  rectById: ReadonlyMap<string, Rect>;
  scrollOverrides: Map<string, Readonly<{ scrollX: number; scrollY: number }>>;
  findNearestScrollableAncestor: (targetId: string | null) => Readonly<{
    nodeId: string;
    meta: Readonly<{
      scrollX: number;
      scrollY: number;
      contentWidth: number;
      contentHeight: number;
      viewportWidth: number;
      viewportHeight: number;
    }>;
  }> | null;
}>;

const ROUTE_RENDER: MouseRoutingOutcome = Object.freeze({ needsRender: true });
const ROUTE_NO_RENDER: MouseRoutingOutcome = Object.freeze({ needsRender: false });
const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);

function invokeCallbackSafely<TArgs extends readonly unknown[]>(
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): boolean {
  if (typeof callback !== "function") return false;
  try {
    callback(...args);
    return true;
  } catch {
    return false;
  }
}

function clampIndexScrollTopForRows(
  scrollTop: number,
  totalRows: number,
  viewportRows: number,
): number {
  const maxScrollTop = Math.max(0, totalRows - viewportRows);
  if (!Number.isFinite(scrollTop) || scrollTop <= 0) return 0;
  if (scrollTop >= maxScrollTop) return maxScrollTop;
  return Math.trunc(scrollTop);
}

export function routeDropdownMouse(
  event: ZrevEvent,
  ctx: RouteDropdownMouseContext,
): MouseRoutingOutcome | null {
  if (event.kind !== "mouse") return null;

  const topLayerId =
    ctx.layerStack.length > 0 ? (ctx.layerStack[ctx.layerStack.length - 1] ?? null) : null;
  const topDropdownId =
    ctx.dropdownStack.length > 0 ? (ctx.dropdownStack[ctx.dropdownStack.length - 1] ?? null) : null;

  if (!topDropdownId || topLayerId !== `dropdown:${topDropdownId}`) return null;

  const dropdown = ctx.dropdownById.get(topDropdownId);
  const dropdownRect = dropdown ? ctx.computeDropdownRect(dropdown) : null;
  if (!dropdown || !dropdownRect || dropdownRect.w <= 0 || dropdownRect.h <= 0) return null;

  const inside =
    event.x >= dropdownRect.x &&
    event.x < dropdownRect.x + dropdownRect.w &&
    event.y >= dropdownRect.y &&
    event.y < dropdownRect.y + dropdownRect.h;

  const contentX = dropdownRect.x + 1;
  const contentY = dropdownRect.y + 1;
  const contentW = Math.max(0, dropdownRect.w - 2);
  const contentH = Math.max(0, dropdownRect.h - 2);
  const inContent =
    event.x >= contentX &&
    event.x < contentX + contentW &&
    event.y >= contentY &&
    event.y < contentY + contentH;
  const itemIndex = inContent ? event.y - contentY : null;

  const MOUSE_KIND_DOWN = 3;
  const MOUSE_KIND_UP = 4;

  if (event.mouseKind === MOUSE_KIND_DOWN) {
    ctx.setPressedDropdown(null);

    if (!inside) {
      if (dropdown.onClose) {
        try {
          dropdown.onClose();
        } catch {
          // Swallow close callback errors to preserve routing determinism.
        }
      }
      return ROUTE_RENDER;
    }

    if (itemIndex !== null && itemIndex >= 0 && itemIndex < dropdown.items.length) {
      const item = dropdown.items[itemIndex];
      if (item && !item.divider && item.disabled !== true) {
        const prevSelected = ctx.dropdownSelectedIndexById.get(topDropdownId) ?? 0;
        ctx.dropdownSelectedIndexById.set(topDropdownId, itemIndex);
        ctx.setPressedDropdown(Object.freeze({ id: topDropdownId, itemId: item.id }));
        return Object.freeze({ needsRender: itemIndex !== prevSelected });
      }
    }

    return ROUTE_NO_RENDER;
  }

  if (event.mouseKind === MOUSE_KIND_UP) {
    const pressed = ctx.pressedDropdown;
    ctx.setPressedDropdown(null);

    if (pressed && pressed.id === topDropdownId && itemIndex !== null) {
      const item = dropdown.items[itemIndex];
      if (item && item.id === pressed.itemId && !item.divider && item.disabled !== true) {
        if (dropdown.onSelect) {
          try {
            dropdown.onSelect(item);
          } catch {
            // Swallow select callback errors to preserve routing determinism.
          }
        }
        if (dropdown.onClose) {
          try {
            dropdown.onClose();
          } catch {
            // Swallow close callback errors to preserve routing determinism.
          }
        }
        return ROUTE_RENDER;
      }
    }

    return ROUTE_NO_RENDER;
  }

  return ROUTE_NO_RENDER;
}

export function routeLayerBackdropMouse(
  event: ZrevEvent,
  ctx: RouteLayerBackdropMouseContext,
): MouseRoutingOutcome | null {
  if (event.kind !== "mouse") return null;

  const hit = hitTestLayers(ctx.layerRegistry, event.x, event.y);
  if (!hit.blocked) return null;

  const blocking = hit.blockingLayer;
  if (
    blocking &&
    event.mouseKind === 3 &&
    (ctx.closeOnBackdropByLayerId.get(blocking.id) ?? false) === true
  ) {
    const cb = ctx.onCloseByLayerId.get(blocking.id);
    if (cb) {
      try {
        cb();
      } catch {
        // Swallow close callback errors to preserve routing determinism.
      }
      return ROUTE_RENDER;
    }
  }

  return ROUTE_NO_RENDER;
}

export function routeSplitPaneMouse(
  event: ZrevEvent,
  ctx: RouteSplitPaneMouseContext,
): MouseRoutingOutcome | null {
  if (event.kind !== "mouse") return null;

  const MOUSE_KIND_DOWN = 3;
  const MOUSE_KIND_UP = 4;
  const MOUSE_KIND_WHEEL = 5;

  if (ctx.splitPaneDrag) {
    if (event.mouseKind === MOUSE_KIND_UP) {
      if (ctx.splitPaneDrag.didDrag) {
        ctx.setSplitPaneLastDividerDown(null);
      }
      ctx.setSplitPaneDrag(null);
      return ROUTE_RENDER;
    }

    if (event.mouseKind !== MOUSE_KIND_WHEEL) {
      const drag = ctx.splitPaneDrag;
      const pane = ctx.splitPaneById.get(drag.id);
      if (pane) {
        const delta =
          drag.direction === "horizontal" ? event.x - drag.startX : event.y - drag.startY;
        const didDrag = drag.didDrag || delta !== 0;
        if (didDrag && !drag.didDrag) {
          ctx.setSplitPaneDrag(Object.freeze({ ...drag, didDrag: true }));
        }
        if (didDrag) {
          ctx.setSplitPaneLastDividerDown(null);
        }
        const nextCellSizes = handleDividerDrag(
          drag.startCellSizes,
          drag.dividerIndex,
          delta,
          drag.minSizes,
          drag.maxSizes,
        );
        const nextSizes =
          drag.sizeMode === "percent" ? sizesToPercentages(nextCellSizes) : nextCellSizes;
        pane.onResize(Object.freeze(nextSizes.slice()));
        return ROUTE_RENDER;
      }

      ctx.setSplitPaneLastDividerDown(null);
      ctx.setSplitPaneDrag(null);
      return ROUTE_RENDER;
    }

    return null;
  }

  if (event.mouseKind !== MOUSE_KIND_DOWN) return null;

  for (const [id, pane] of ctx.splitPaneById) {
    const rect = ctx.rectById.get(id);
    if (!rect || rect.w <= 0 || rect.h <= 0) continue;

    if (
      event.x < rect.x ||
      event.x >= rect.x + rect.w ||
      event.y < rect.y ||
      event.y >= rect.y + rect.h
    ) {
      continue;
    }

    const childRects = ctx.splitPaneChildRectsById.get(id) ?? Object.freeze([]);
    if (childRects.length < 2) continue;

    const dividerSize = Math.max(1, pane.dividerSize ?? 1);
    const direction = pane.direction;
    const sizeMode = pane.sizeMode ?? "percent";
    const minSizes = pane.minSizes;
    const maxSizes = pane.maxSizes;
    const expand = 1;

    for (let i = 0; i < childRects.length - 1; i++) {
      const a = childRects[i];
      const b = childRects[i + 1];
      if (!a || !b) continue;

      if (direction === "horizontal") {
        const x0 = b.x - dividerSize;
        const hitX0 = x0 - expand;
        const hitX1 = x0 + dividerSize + expand;
        if (event.x >= hitX0 && event.x < hitX1) {
          if ((event.buttons & 1) === 0) continue;

          const prevDown = ctx.splitPaneLastDividerDown;
          const DOUBLE_CLICK_MS = 500;
          if (pane.collapsible === true && pane.onCollapse) {
            if (
              prevDown &&
              prevDown.id === id &&
              prevDown.dividerIndex === i &&
              event.timeMs - prevDown.timeMs <= DOUBLE_CLICK_MS
            ) {
              ctx.setSplitPaneLastDividerDown(null);

              const targetIndex = event.x < x0 ? i : event.x >= x0 + dividerSize ? i + 1 : i;
              const isCollapsed = pane.collapsed?.includes(targetIndex) ?? false;
              try {
                pane.onCollapse(targetIndex, !isCollapsed);
              } catch {
                // Swallow collapse callback errors to preserve routing determinism.
              }
              return ROUTE_RENDER;
            }

            ctx.setSplitPaneLastDividerDown(
              Object.freeze({
                id,
                dividerIndex: i,
                timeMs: event.timeMs,
              }),
            );
          } else {
            ctx.setSplitPaneLastDividerDown(null);
          }

          const availableCells = rect.w;
          const startCellSizes = computePanelCellSizes(
            childRects.length,
            pane.sizes,
            availableCells,
            sizeMode,
            dividerSize,
            minSizes,
            maxSizes,
          ).sizes;

          ctx.setSplitPaneDrag(
            Object.freeze({
              id,
              dividerIndex: i,
              direction,
              sizeMode,
              dividerSize,
              minSizes,
              maxSizes,
              startX: event.x,
              startY: event.y,
              startCellSizes,
              availableCells,
              didDrag: false,
            }),
          );
          return ROUTE_RENDER;
        }
      } else {
        const y0 = b.y - dividerSize;
        const hitY0 = y0 - expand;
        const hitY1 = y0 + dividerSize + expand;
        if (event.y >= hitY0 && event.y < hitY1) {
          if ((event.buttons & 1) === 0) continue;

          const prevDown = ctx.splitPaneLastDividerDown;
          const DOUBLE_CLICK_MS = 500;
          if (pane.collapsible === true && pane.onCollapse) {
            if (
              prevDown &&
              prevDown.id === id &&
              prevDown.dividerIndex === i &&
              event.timeMs - prevDown.timeMs <= DOUBLE_CLICK_MS
            ) {
              ctx.setSplitPaneLastDividerDown(null);

              const targetIndex = event.y < y0 ? i : event.y >= y0 + dividerSize ? i + 1 : i;
              const isCollapsed = pane.collapsed?.includes(targetIndex) ?? false;
              try {
                pane.onCollapse(targetIndex, !isCollapsed);
              } catch {
                // Swallow collapse callback errors to preserve routing determinism.
              }
              return ROUTE_RENDER;
            }

            ctx.setSplitPaneLastDividerDown(
              Object.freeze({
                id,
                dividerIndex: i,
                timeMs: event.timeMs,
              }),
            );
          } else {
            ctx.setSplitPaneLastDividerDown(null);
          }

          const availableCells = rect.h;
          const startCellSizes = computePanelCellSizes(
            childRects.length,
            pane.sizes,
            availableCells,
            sizeMode,
            dividerSize,
            minSizes,
            maxSizes,
          ).sizes;

          ctx.setSplitPaneDrag(
            Object.freeze({
              id,
              dividerIndex: i,
              direction,
              sizeMode,
              dividerSize,
              minSizes,
              maxSizes,
              startX: event.x,
              startY: event.y,
              startCellSizes,
              availableCells,
              didDrag: false,
            }),
          );
          return ROUTE_RENDER;
        }
      }
    }
  }

  return null;
}

export function routeToastMouseDown(
  event: ZrevEvent,
  ctx: RouteToastMouseDownContext,
  prevActiveZoneId: string | null,
): MouseRoutingOutcome | null {
  if (event.kind !== "mouse" || event.mouseKind !== 3 || ctx.toastContainers.length <= 0)
    return null;

  for (let i = ctx.toastContainers.length - 1; i >= 0; i--) {
    const tc = ctx.toastContainers[i];
    if (!tc) continue;
    const rect = tc.rect;
    if (rect.w <= 0 || rect.h <= 0) continue;
    if (
      event.x < rect.x ||
      event.x >= rect.x + rect.w ||
      event.y < rect.y ||
      event.y >= rect.y + rect.h
    ) {
      continue;
    }

    const toasts = tc.props.toasts;
    const maxVisible = tc.props.maxVisible ?? 5;
    const position = tc.props.position ?? "bottom-right";
    const maxByHeight = Math.floor(rect.h / TOAST_HEIGHT);
    const visibleCount = Math.min(toasts.length, maxVisible, maxByHeight);

    for (let t = 0; t < visibleCount; t++) {
      const toast = toasts[t];
      if (!toast) continue;
      const toastY = position.startsWith("top")
        ? rect.y + t * TOAST_HEIGHT
        : rect.y + rect.h - (t + 1) * TOAST_HEIGHT;

      if (event.y < toastY || event.y >= toastY + TOAST_HEIGHT) continue;

      if (toast.action && event.y === toastY + 1 && rect.w >= 10) {
        const label = `[${toast.action.label}]`;
        const lw = measureTextCells(label);
        const ax = rect.x + rect.w - 2 - lw;
        if (ax > rect.x + 4 && event.x >= ax && event.x < ax + lw) {
          const nextFocusState = Object.freeze({
            ...ctx.focusState,
            focusedId: getToastActionFocusId(toast.id),
            activeZoneId: null,
          });
          ctx.setFocusState(nextFocusState);
          if (nextFocusState.activeZoneId !== prevActiveZoneId) {
            ctx.invokeFocusZoneCallbacks(
              prevActiveZoneId,
              nextFocusState.activeZoneId,
              ctx.zoneMetaById,
              ctx.zoneMetaById,
            );
          }
          invokeCallbackSafely(toast.action.onAction);
          return ROUTE_RENDER;
        }
      }

      invokeCallbackSafely(tc.props.onDismiss, toast.id);
      return ROUTE_RENDER;
    }
  }

  return null;
}

export function routeVirtualListMouseClick(
  event: ZrevEvent,
  ctx: RouteVirtualListMouseClickContext,
): boolean {
  if (event.kind !== "mouse" || (event.mouseKind !== 3 && event.mouseKind !== 4)) return false;

  const targetId = ctx.mouseTargetId;
  let localNeedsRender = false;

  if (targetId !== null) {
    const vlist = ctx.virtualListById.get(targetId);
    const rect = ctx.rectById.get(targetId);
    if (vlist && rect) {
      const state = ctx.virtualListStore.get(targetId);
      const itemHeight = resolveVirtualListItemHeightSpec(vlist);
      const measuredHeights =
        vlist.estimateItemHeight !== undefined &&
        state.measuredHeights !== undefined &&
        state.measuredItemCount === vlist.items.length
          ? state.measuredHeights
          : undefined;
      const localY = event.y - rect.y;
      const inBounds = localY >= 0 && localY < rect.h;

      const computeIndex = (): number | null => {
        if (!inBounds) return null;
        const yInContent = state.scrollTop + localY;
        if (yInContent < 0) return null;
        if (vlist.items.length === 0) return null;

        if (typeof itemHeight === "number" && measuredHeights === undefined) {
          const h = itemHeight;
          if (h <= 0) return null;
          return Math.floor(yInContent / h);
        }

        const { itemOffsets } = computeVisibleRange(
          vlist.items,
          itemHeight,
          0,
          Number.MAX_SAFE_INTEGER,
          0,
          measuredHeights,
        );
        let lo = 0;
        let hi = vlist.items.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          const start = itemOffsets[mid] ?? 0;
          const end = itemOffsets[mid + 1] ?? start;
          if (yInContent < start) {
            hi = mid - 1;
          } else if (yInContent >= end) {
            lo = mid + 1;
          } else {
            return mid;
          }
        }
        return null;
      };

      if (event.mouseKind === 3) {
        const idx0 = computeIndex();
        if (idx0 !== null) {
          const idx = Math.max(0, Math.min(vlist.items.length - 1, idx0));
          const prev = state.selectedIndex;
          ctx.virtualListStore.set(targetId, { selectedIndex: idx });
          ctx.setPressedVirtualList(Object.freeze({ id: targetId, index: idx }));
          if (idx !== prev) localNeedsRender = true;
        } else {
          ctx.setPressedVirtualList(null);
        }
      } else {
        const idx0 = computeIndex();
        const pressed = ctx.pressedVirtualList;
        ctx.setPressedVirtualList(null);
        if (idx0 !== null && pressed && pressed.id === targetId) {
          const idx = Math.max(0, Math.min(vlist.items.length - 1, idx0));
          if (idx === pressed.index) {
            const item = vlist.items[idx];
            if (item !== undefined && typeof vlist.onSelect === "function") {
              invokeCallbackSafely(vlist.onSelect, item, idx);
              localNeedsRender = true;
            }
          }
        }
      }
    } else if (event.mouseKind === 4) {
      ctx.setPressedVirtualList(null);
    }
  } else if (event.mouseKind === 4) {
    ctx.setPressedVirtualList(null);
  }

  return localNeedsRender;
}

export function routeTableMouseClick(event: ZrevEvent, ctx: RouteTableMouseClickContext): boolean {
  if (event.kind !== "mouse" || (event.mouseKind !== 3 && event.mouseKind !== 4)) return false;

  const targetId = ctx.mouseTargetId;
  let localNeedsRender = false;

  if (targetId !== null) {
    const table = ctx.tableById.get(targetId);
    const rect = ctx.rectById.get(targetId);
    if (table && rect) {
      const tableCache = ctx.tableRenderCacheById.get(table.id);
      const rowKeys = tableCache?.rowKeys ?? table.data.map((row, i) => table.getRowKey(row, i));
      const rowKeyToIndex = tableCache?.rowKeyToIndex;
      const selection = (table.selection ??
        ctx.emptyStringArray ??
        EMPTY_STRING_ARRAY) as readonly string[];
      const selectionMode = table.selectionMode ?? "none";

      const state = ctx.tableStore.get(table.id);

      const border = table.border === "none" ? "none" : "single";
      const t = border === "none" ? 0 : 1;
      const innerX = rect.x + t;
      const innerY = rect.y + t;
      const innerW = Math.max(0, rect.w - t * 2);
      const innerH = Math.max(0, rect.h - t * 2);

      const headerHeight = table.showHeader === false ? 0 : (table.headerHeight ?? 1);
      const rowHeight = table.rowHeight ?? 1;
      const safeRowHeight = rowHeight > 0 ? rowHeight : 1;
      const bodyY = innerY + headerHeight;
      const bodyH = Math.max(0, innerH - headerHeight);
      const virtualized = table.virtualized !== false;
      const effectiveScrollTop = virtualized ? state.scrollTop : 0;

      const inHeader =
        headerHeight > 0 &&
        innerW > 0 &&
        event.x >= innerX &&
        event.x < innerX + innerW &&
        event.y >= innerY &&
        event.y < innerY + headerHeight;
      const inBody =
        bodyH > 0 &&
        innerW > 0 &&
        event.x >= innerX &&
        event.x < innerX + innerW &&
        event.y >= bodyY &&
        event.y < bodyY + bodyH;

      const computeColumnIndex = (): number | null => {
        if (!inHeader || innerW <= 0) return null;
        const { widths } = distributeColumnWidths(table.columns, innerW);
        let xCursor = innerX;
        for (let c = 0; c < widths.length; c++) {
          const w = widths[c] ?? 0;
          if (w <= 0) continue;
          if (event.x >= xCursor && event.x < xCursor + w) return c;
          xCursor += w;
        }
        return null;
      };

      const computeRowIndex = (): number | null => {
        if (!inBody) return null;
        if (table.data.length === 0) return null;

        const localY = event.y - bodyY;
        const yInContent = effectiveScrollTop + localY;
        if (yInContent < 0) return null;

        const idx0 = Math.floor(yInContent / safeRowHeight);
        if (idx0 < 0 || idx0 >= table.data.length) return null;
        return idx0;
      };

      if (event.mouseKind === 3) {
        ctx.setPressedTable(null);
        ctx.setPressedTableHeader(null);

        const colIndex = computeColumnIndex();
        if (colIndex !== null) {
          ctx.setLastTableClick(null);
          const prevRow = state.focusedRowIndex;
          const prevCol = state.focusedColumnIndex;
          ctx.tableStore.set(table.id, { focusedRowIndex: -1, focusedColumnIndex: colIndex });
          ctx.setPressedTableHeader(Object.freeze({ id: table.id, columnIndex: colIndex }));
          if (prevRow !== -1 || prevCol !== colIndex) localNeedsRender = true;
          ctx.setPressedTable(null);
        } else {
          const rowIndex = computeRowIndex();
          if (rowIndex !== null) {
            const rowKey = rowKeys[rowIndex];
            if (rowKey === undefined) {
              ctx.setPressedTable(null);
              ctx.setPressedTableHeader(null);
              ctx.setLastTableClick(null);
            } else {
              const hasShift = (event.mods & ZR_MOD_SHIFT) !== 0;
              const hasCtrl = (event.mods & ZR_MOD_CTRL) !== 0;

              const res = computeSelection(
                selection,
                rowKey,
                selectionMode,
                { shift: hasShift, ctrl: hasCtrl },
                rowKeys,
                state.lastClickedKey,
                rowKeyToIndex,
              );

              const prevRow = state.focusedRowIndex;
              ctx.tableStore.set(table.id, {
                focusedRowIndex: rowIndex,
                lastClickedKey: rowKey,
              });
              if (rowIndex !== prevRow) localNeedsRender = true;
              if (res.changed && typeof table.onSelectionChange === "function") {
                invokeCallbackSafely(table.onSelectionChange, res.selection);
                localNeedsRender = true;
              }

              ctx.setPressedTable(Object.freeze({ id: table.id, rowIndex }));
            }
          } else {
            ctx.setPressedTable(null);
            ctx.setPressedTableHeader(null);
            ctx.setLastTableClick(null);
          }
        }
      } else {
        const pressedRow = ctx.pressedTable;
        const pressedHeader = ctx.pressedTableHeader;
        ctx.setPressedTable(null);
        ctx.setPressedTableHeader(null);

        if (pressedHeader && pressedHeader.id === table.id) {
          ctx.setLastTableClick(null);
          const colIndex = computeColumnIndex();
          if (colIndex !== null && colIndex === pressedHeader.columnIndex) {
            const col = table.columns[colIndex];
            if (col && col.sortable === true && typeof table.onSort === "function") {
              const nextDirection: "asc" | "desc" =
                table.sortColumn === col.key && table.sortDirection === "asc" ? "desc" : "asc";
              invokeCallbackSafely(table.onSort, col.key, nextDirection);
              localNeedsRender = true;
            }
          }
        }

        if (pressedRow && pressedRow.id === table.id) {
          const rowIndex = computeRowIndex();
          if (rowIndex !== null && rowIndex === pressedRow.rowIndex) {
            const DOUBLE_PRESS_MS = 500;
            const last = ctx.lastTableClick;
            const dt = last ? event.timeMs - last.timeMs : Number.POSITIVE_INFINITY;
            const isDouble =
              last &&
              last.id === table.id &&
              last.rowIndex === rowIndex &&
              dt >= 0 &&
              dt <= DOUBLE_PRESS_MS;

            const row = table.data[rowIndex];
            if (row !== undefined) {
              if (isDouble && typeof table.onRowDoublePress === "function") {
                invokeCallbackSafely(table.onRowDoublePress, row, rowIndex);
                ctx.setLastTableClick(null);
              } else if (typeof table.onRowPress === "function") {
                invokeCallbackSafely(table.onRowPress, row, rowIndex);
                ctx.setLastTableClick(
                  Object.freeze({
                    id: table.id,
                    rowIndex,
                    timeMs: event.timeMs,
                  }),
                );
              } else {
                ctx.setLastTableClick(
                  Object.freeze({
                    id: table.id,
                    rowIndex,
                    timeMs: event.timeMs,
                  }),
                );
              }
              localNeedsRender = true;
            } else {
              ctx.setLastTableClick(null);
            }
          } else {
            ctx.setLastTableClick(null);
          }
        }
      }
    } else if (event.mouseKind === 4) {
      ctx.setPressedTable(null);
      ctx.setPressedTableHeader(null);
    }
  } else if (event.mouseKind === 4) {
    ctx.setPressedTable(null);
    ctx.setPressedTableHeader(null);
  }

  return localNeedsRender;
}

export function routeFilePickerMouseClick(
  event: ZrevEvent,
  ctx: RouteFilePickerMouseClickContext,
): boolean {
  if (event.kind !== "mouse" || (event.mouseKind !== 3 && event.mouseKind !== 4)) return false;

  const targetId = ctx.mouseTargetId;
  let localNeedsRender = false;

  if (targetId !== null) {
    const fp = ctx.filePickerById.get(targetId);
    const rect = ctx.rectById.get(targetId);
    if (fp && rect) {
      const state = ctx.treeStore.get(fp.id);
      const flatNodes =
        readFileNodeFlatCache(state, fp.data, fp.expandedPaths) ??
        (() => {
          const next = flattenTree(
            fp.data,
            fileNodeGetKey,
            fileNodeGetChildren,
            fileNodeHasChildren,
            fp.expandedPaths,
          );
          ctx.treeStore.set(fp.id, {
            flatCache: makeFileNodeFlatCache(fp.data, fp.expandedPaths, next),
          });
          return next;
        })();

      const computeNodeIndex = (): number | null => {
        const localY = event.y - rect.y;
        if (localY < 0 || localY >= rect.h) return null;
        if (flatNodes.length === 0) return null;
        const effectiveScrollTop = clampIndexScrollTopForRows(
          state.scrollTop,
          flatNodes.length,
          rect.h,
        );
        const idx = effectiveScrollTop + localY;
        if (idx < 0 || idx >= flatNodes.length) return null;
        return idx;
      };

      if (event.mouseKind === 3) {
        ctx.setPressedFilePicker(null);
        const RIGHT_BUTTON = 1 << 2;
        if ((event.buttons & RIGHT_BUTTON) !== 0) {
          // No right-click behavior for file picker.
        } else {
          const nodeIndex = computeNodeIndex();
          if (nodeIndex !== null) {
            const fn = flatNodes[nodeIndex];
            if (fn) {
              invokeCallbackSafely(fp.onSelect, fn.key);
              ctx.treeStore.set(fp.id, { focusedKey: fn.key });
              ctx.setPressedFilePicker(
                Object.freeze({
                  id: fp.id,
                  nodeIndex,
                  nodeKey: fn.key,
                }),
              );
              localNeedsRender = true;
            }
          } else {
            ctx.setPressedFilePicker(null);
            ctx.setLastFilePickerClick(null);
          }
        }
      } else {
        const pressed = ctx.pressedFilePicker;
        ctx.setPressedFilePicker(null);

        if (pressed && pressed.id === fp.id) {
          const nodeIndex = computeNodeIndex();
          if (nodeIndex !== null && nodeIndex === pressed.nodeIndex) {
            const fn = flatNodes[nodeIndex];
            if (!fn || fn.key !== pressed.nodeKey) {
              ctx.setLastFilePickerClick(null);
            } else {
              const DOUBLE_PRESS_MS = 500;
              const last = ctx.lastFilePickerClick;
              const dt = last ? event.timeMs - last.timeMs : Number.POSITIVE_INFINITY;
              const isDouble =
                last &&
                last.id === fp.id &&
                last.nodeIndex === nodeIndex &&
                last.nodeKey === fn.key &&
                dt >= 0 &&
                dt <= DOUBLE_PRESS_MS;

              if (isDouble) {
                if (fn.node.type === "directory") {
                  invokeCallbackSafely(fp.onToggle, fn.key, !fp.expandedPaths.includes(fn.key));
                } else {
                  invokeCallbackSafely(fp.onOpen, fn.key);
                }
                ctx.setLastFilePickerClick(null);
                localNeedsRender = true;
              } else {
                ctx.setLastFilePickerClick(
                  Object.freeze({
                    id: fp.id,
                    nodeIndex,
                    nodeKey: fn.key,
                    timeMs: event.timeMs,
                  }),
                );
                localNeedsRender = true;
              }
            }
          } else {
            ctx.setLastFilePickerClick(null);
          }
        }
      }
    } else if (event.mouseKind === 4) {
      ctx.setPressedFilePicker(null);
    }
  } else if (event.mouseKind === 4) {
    ctx.setPressedFilePicker(null);
  }

  return localNeedsRender;
}

export function routeFileTreeExplorerMouseClick(
  event: ZrevEvent,
  ctx: RouteFileTreeExplorerMouseClickContext,
): boolean {
  if (event.kind !== "mouse" || (event.mouseKind !== 3 && event.mouseKind !== 4)) return false;

  const targetId = ctx.mouseTargetId;
  let localNeedsRender = false;

  if (targetId !== null) {
    const fte = ctx.fileTreeExplorerById.get(targetId);
    const rect = ctx.rectById.get(targetId);
    if (fte && rect) {
      const state = ctx.treeStore.get(fte.id);
      const flatNodes =
        readFileNodeFlatCache(state, fte.data, fte.expanded) ??
        (() => {
          const next = flattenTree(
            fte.data,
            fileNodeGetKey,
            fileNodeGetChildren,
            fileNodeHasChildren,
            fte.expanded,
          );
          ctx.treeStore.set(fte.id, {
            flatCache: makeFileNodeFlatCache(fte.data, fte.expanded, next),
          });
          return next;
        })();

      const computeNodeIndex = (): number | null => {
        const localY = event.y - rect.y;
        if (localY < 0 || localY >= rect.h) return null;
        if (flatNodes.length === 0) return null;
        const effectiveScrollTop = clampIndexScrollTopForRows(
          state.scrollTop,
          flatNodes.length,
          rect.h,
        );
        const idx = effectiveScrollTop + localY;
        if (idx < 0 || idx >= flatNodes.length) return null;
        return idx;
      };

      if (event.mouseKind === 3) {
        ctx.setPressedFileTree(null);
        const RIGHT_BUTTON = 1 << 2;
        if ((event.buttons & RIGHT_BUTTON) !== 0) {
          // Right-click is handled by the context menu block.
        } else {
          const nodeIndex = computeNodeIndex();
          if (nodeIndex !== null) {
            const fn = flatNodes[nodeIndex];
            if (fn) {
              invokeCallbackSafely(fte.onSelect, fn.node);
              ctx.treeStore.set(fte.id, { focusedKey: fn.key });
              ctx.setPressedFileTree(
                Object.freeze({
                  id: fte.id,
                  nodeIndex,
                  nodeKey: fn.key,
                }),
              );
              localNeedsRender = true;
            }
          } else {
            ctx.setPressedFileTree(null);
            ctx.setLastFileTreeClick(null);
          }
        }
      } else {
        const pressedFT = ctx.pressedFileTree;
        ctx.setPressedFileTree(null);

        if (pressedFT && pressedFT.id === fte.id) {
          const nodeIndex = computeNodeIndex();
          if (nodeIndex !== null && nodeIndex === pressedFT.nodeIndex) {
            const fn = flatNodes[nodeIndex];
            if (!fn || fn.key !== pressedFT.nodeKey) {
              ctx.setLastFileTreeClick(null);
            } else {
              const DOUBLE_PRESS_MS = 500;
              const last = ctx.lastFileTreeClick;
              const dt = last ? event.timeMs - last.timeMs : Number.POSITIVE_INFINITY;
              const isDouble =
                last &&
                last.id === fte.id &&
                last.nodeIndex === nodeIndex &&
                last.nodeKey === fn.key &&
                dt >= 0 &&
                dt <= DOUBLE_PRESS_MS;

              if (isDouble) {
                if (fn.node.type === "directory") {
                  invokeCallbackSafely(fte.onToggle, fn.node, !fte.expanded.includes(fn.key));
                }
                invokeCallbackSafely(fte.onActivate, fn.node);
                ctx.setLastFileTreeClick(null);
              } else {
                ctx.setLastFileTreeClick(
                  Object.freeze({
                    id: fte.id,
                    nodeIndex,
                    nodeKey: fn.key,
                    timeMs: event.timeMs,
                  }),
                );
              }
              localNeedsRender = true;
            }
          } else {
            ctx.setLastFileTreeClick(null);
          }
        }
      }
    } else if (event.mouseKind === 4) {
      ctx.setPressedFileTree(null);
    }
  } else if (event.mouseKind === 4) {
    ctx.setPressedFileTree(null);
  }

  return localNeedsRender;
}

export function routeTreeMouseClick(event: ZrevEvent, ctx: RouteTreeMouseClickContext): boolean {
  if (event.kind !== "mouse" || (event.mouseKind !== 3 && event.mouseKind !== 4)) return false;

  const targetId = ctx.mouseTargetId;
  let localNeedsRender = false;

  if (targetId !== null) {
    const tree = ctx.treeById.get(targetId);
    const rect = ctx.rectById.get(targetId);
    if (tree && rect) {
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

      const computeNodeIndex = (): number | null => {
        const localY = event.y - rect.y;
        if (localY < 0 || localY >= rect.h) return null;
        if (flatNodes.length === 0) return null;
        const effectiveScrollTop = clampIndexScrollTopForRows(
          state.scrollTop,
          flatNodes.length,
          rect.h,
        );
        const idx = effectiveScrollTop + localY;
        if (idx < 0 || idx >= flatNodes.length) return null;
        return idx;
      };

      if (event.mouseKind === 3) {
        ctx.setPressedTree(null);
        const RIGHT_BUTTON = 1 << 2;
        if ((event.buttons & RIGHT_BUTTON) !== 0) {
          // No right-click behavior for generic tree.
        } else {
          const nodeIndex = computeNodeIndex();
          if (nodeIndex !== null) {
            const fn = flatNodes[nodeIndex];
            if (fn) {
              if (tree.onSelect) invokeCallbackSafely(tree.onSelect, fn.node as unknown);
              ctx.treeStore.set(tree.id, { focusedKey: fn.key });
              ctx.setPressedTree(
                Object.freeze({
                  id: tree.id,
                  nodeIndex,
                  nodeKey: fn.key,
                }),
              );
              localNeedsRender = true;
            }
          } else {
            ctx.setPressedTree(null);
            ctx.setLastTreeClick(null);
          }
        }
      } else {
        const pressedTree = ctx.pressedTree;
        ctx.setPressedTree(null);

        if (pressedTree && pressedTree.id === tree.id) {
          const nodeIndex = computeNodeIndex();
          if (nodeIndex !== null && nodeIndex === pressedTree.nodeIndex) {
            const fn = flatNodes[nodeIndex];
            if (!fn || fn.key !== pressedTree.nodeKey) {
              ctx.setLastTreeClick(null);
            } else {
              const DOUBLE_PRESS_MS = 500;
              const last = ctx.lastTreeClick;
              const dt = last ? event.timeMs - last.timeMs : Number.POSITIVE_INFINITY;
              const isDouble =
                last &&
                last.id === tree.id &&
                last.nodeIndex === nodeIndex &&
                last.nodeKey === fn.key &&
                dt >= 0 &&
                dt <= DOUBLE_PRESS_MS;

              if (isDouble) {
                if (fn.hasChildren) {
                  invokeCallbackSafely(
                    tree.onToggle,
                    fn.node as unknown,
                    !tree.expanded.includes(fn.key),
                  );
                }
                if (tree.onActivate) invokeCallbackSafely(tree.onActivate, fn.node as unknown);
                ctx.setLastTreeClick(null);
              } else {
                ctx.setLastTreeClick(
                  Object.freeze({
                    id: tree.id,
                    nodeIndex,
                    nodeKey: fn.key,
                    timeMs: event.timeMs,
                  }),
                );
              }
              localNeedsRender = true;
            }
          } else {
            ctx.setLastTreeClick(null);
          }
        }
      }
    } else if (event.mouseKind === 4) {
      ctx.setPressedTree(null);
    }
  } else if (event.mouseKind === 4) {
    ctx.setPressedTree(null);
  }

  return localNeedsRender;
}

export function routeFileTreeExplorerContextMenuMouse(
  event: ZrevEvent,
  ctx: RouteFileTreeExplorerContextMenuMouseContext,
): boolean {
  if (event.kind !== "mouse" || event.mouseKind !== 3) return false;

  const targetId = ctx.mouseTargetId;
  if (targetId === null) return false;

  const fte = ctx.fileTreeExplorerById.get(targetId);
  const rect = ctx.rectById.get(targetId);
  if (!fte || !rect || typeof fte.onContextMenu !== "function") return false;

  const RIGHT_BUTTON = 1 << 2;
  if ((event.buttons & RIGHT_BUTTON) === 0) return false;

  const localY = event.y - rect.y;
  const inBounds = localY >= 0 && localY < rect.h;
  if (!inBounds) return false;

  const state = ctx.treeStore.get(fte.id);
  const flatNodes =
    readFileNodeFlatCache(state, fte.data, fte.expanded) ??
    (() => {
      const next = flattenTree(
        fte.data,
        fileNodeGetKey,
        fileNodeGetChildren,
        fileNodeHasChildren,
        fte.expanded,
      );
      ctx.treeStore.set(fte.id, {
        flatCache: makeFileNodeFlatCache(fte.data, fte.expanded, next),
      });
      return next;
    })();

  const effectiveScrollTop = clampIndexScrollTopForRows(state.scrollTop, flatNodes.length, rect.h);
  const idx = effectiveScrollTop + localY;
  const fn = flatNodes[idx];
  if (!fn) return false;

  invokeCallbackSafely(fte.onContextMenu, fn.node);
  return true;
}

export function routeMouseWheel(
  event: ZrevEvent,
  ctx: RouteMouseWheelContext,
): MouseRoutingOutcome | null {
  if (event.kind !== "mouse" || event.mouseKind !== 5) return null;

  const targetId = ctx.mouseTargetId ?? ctx.focusedId;
  if (targetId !== null) {
    const vlist = ctx.virtualListById.get(targetId);
    if (vlist) {
      const state = ctx.virtualListStore.get(vlist.id);
      const itemHeight = resolveVirtualListItemHeightSpec(vlist);
      const measuredHeights =
        vlist.estimateItemHeight !== undefined &&
        state.measuredHeights !== undefined &&
        state.measuredItemCount === vlist.items.length
          ? state.measuredHeights
          : undefined;
      const totalHeight = getTotalHeight(vlist.items, itemHeight, measuredHeights);

      const r = routeVirtualListWheel(event, {
        scrollTop: state.scrollTop,
        totalHeight,
        viewportHeight: state.viewportHeight,
      });

      if (r.nextScrollTop !== undefined) {
        ctx.virtualListStore.set(vlist.id, { scrollTop: r.nextScrollTop });
        if (typeof vlist.onScroll === "function") {
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
        return ROUTE_RENDER;
      }
    }
  }

  for (const candidateId of [ctx.mouseTargetId, ctx.focusedId]) {
    if (candidateId === null) continue;

    const editor = ctx.codeEditorById.get(candidateId);
    if (editor) {
      const rect = ctx.rectById.get(editor.id) ?? null;
      const lineNumWidth =
        ctx.codeEditorRenderCacheById.get(editor.id)?.lineNumWidth ??
        (editor.lineNumbers === false ? 0 : Math.max(4, String(editor.lines.length).length + 1));
      const viewportWidth = rect ? Math.max(1, rect.w - lineNumWidth) : 1;
      const viewportHeight = rect ? Math.max(1, rect.h) : 1;
      let contentWidth = 1;
      for (const line of editor.lines) {
        const lineWidth = measureTextCells(line);
        if (lineWidth > contentWidth) contentWidth = lineWidth;
      }

      const r = routeWheel(event, {
        scrollX: editor.scrollLeft,
        scrollY: editor.scrollTop,
        contentWidth,
        contentHeight: editor.lines.length,
        viewportWidth,
        viewportHeight,
      });

      if (r.nextScrollY !== undefined || r.nextScrollX !== undefined) {
        editor.onScroll(r.nextScrollY ?? editor.scrollTop, r.nextScrollX ?? editor.scrollLeft);
        return ROUTE_RENDER;
      }
      break;
    }

    const logs = ctx.logsConsoleById.get(candidateId);
    if (logs) {
      const rect = ctx.rectById.get(logs.id) ?? null;
      const viewportWidth = rect ? Math.max(1, rect.w) : 1;
      const viewportHeight = rect ? Math.max(1, rect.h) : 1;
      const cached = ctx.logsConsoleRenderCacheById.get(logs.id);
      const filteredLen =
        cached?.filtered.length ??
        applyFilters(logs.entries, logs.levelFilter, logs.sourceFilter, logs.searchQuery).length;
      const r = routeWheel(event, {
        scrollX: 0,
        scrollY: logs.scrollTop,
        contentWidth: viewportWidth,
        contentHeight: filteredLen,
        viewportWidth,
        viewportHeight,
      });
      if (r.nextScrollY !== undefined) {
        logs.onScroll(r.nextScrollY);
        return ROUTE_RENDER;
      }
      break;
    }

    const diff = ctx.diffViewerById.get(candidateId);
    if (diff) {
      const rect = ctx.rectById.get(diff.id) ?? null;
      const viewportWidth = rect ? Math.max(1, rect.w) : 1;
      const viewportHeight = rect ? Math.max(1, rect.h) : 1;
      let totalLines = 0;
      for (const h of diff.diff.hunks) {
        if (!h) continue;
        totalLines += 1 + h.lines.length;
      }
      const r = routeWheel(event, {
        scrollX: 0,
        scrollY: diff.scrollTop,
        contentWidth: viewportWidth,
        contentHeight: totalLines,
        viewportWidth,
        viewportHeight,
      });
      if (r.nextScrollY !== undefined) {
        diff.onScroll(r.nextScrollY);
        return ROUTE_RENDER;
      }
      break;
    }
  }

  const scrollTarget = ctx.findNearestScrollableAncestor(ctx.mouseTargetAnyId);
  if (scrollTarget) {
    const { nodeId, meta } = scrollTarget;
    const r = routeWheel(event, {
      scrollX: meta.scrollX,
      scrollY: meta.scrollY,
      contentWidth: meta.contentWidth,
      contentHeight: meta.contentHeight,
      viewportWidth: meta.viewportWidth,
      viewportHeight: meta.viewportHeight,
    });
    if (r.nextScrollX !== undefined || r.nextScrollY !== undefined) {
      ctx.scrollOverrides.set(nodeId, {
        scrollX: r.nextScrollX ?? meta.scrollX,
        scrollY: r.nextScrollY ?? meta.scrollY,
      });
      return ROUTE_RENDER;
    }
  }

  return null;
}
