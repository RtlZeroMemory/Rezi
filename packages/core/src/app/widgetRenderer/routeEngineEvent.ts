import type { ZrevEvent } from "../../events.js";
import { ZR_MOD_CTRL } from "../../keybindings/keyCodes.js";
import type { LayoutOverflowMetadata } from "../../layout/constraints.js";
import { computeDropdownWindow } from "../../layout/dropdownGeometry.js";
import { hitTestAnyId, hitTestFocusable } from "../../layout/hitTest.js";
import type { LayoutTree } from "../../layout/layout.js";
import type { Rect } from "../../layout/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusManagerState } from "../../runtime/focus.js";
import type { InputSelection, InputUndoStack } from "../../runtime/inputEditor.js";
import type { InstanceId } from "../../runtime/instance.js";
import { type LayerRegistry, hitTestLayers } from "../../runtime/layers.js";
import type {
  TableStateStore,
  TreeStateStore,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import {
  type RoutedAction,
  type RoutingResult,
  routeDropdownKey,
  routeKeyWithZones,
  routeLayerEscape,
  routeMouse,
} from "../../runtime/router.js";
import type { CollectedTrap, CollectedZone, InputMeta } from "../../runtime/widgetMeta.js";
import { deleteRange, getSelectedText, insertText } from "../../widgets/codeEditor.js";
import type {
  ButtonProps,
  CheckboxProps,
  CodeEditorProps,
  CommandItem,
  CommandPaletteProps,
  DiffViewerProps,
  DropdownProps,
  FilePickerProps,
  FileTreeExplorerProps,
  LinkProps,
  LogsConsoleProps,
  RadioGroupProps,
  SelectProps,
  SliderProps,
  SplitDirection,
  SplitPaneProps,
  TableProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  TreeProps,
  VirtualListProps,
} from "../../widgets/types.js";
import { routeCodeEditorKeyDown } from "./codeEditorRouting.js";
import { routeCommandPaletteKeyDown } from "./commandPaletteRouting.js";
import { routeFilePickerKeyDown, routeFileTreeExplorerKeyDown } from "./filePickerRouting.js";
import { type InputEditingRoutingOutcome, routeInputEditingEvent } from "./inputEditing.js";
import {
  routeCheckboxKeyDown,
  routeDiffViewerKeyDown,
  routeLogsConsoleKeyDown,
  routeRadioGroupKeyDown,
  routeSelectKeyDown,
  routeSliderKeyDown,
  routeTableKeyDown,
  routeToastActionKeyDown,
  routeTreeKeyDown,
  routeVirtualListKeyDown,
} from "./keyboardRouting.js";
import {
  routeDropdownMouse,
  routeFilePickerMouseClick,
  routeFileTreeExplorerContextMenuMouse,
  routeFileTreeExplorerMouseClick,
  routeLayerBackdropMouse,
  routeMouseWheel,
  routeSplitPaneMouse,
  routeTableMouseClick,
  routeToastMouseDown,
  routeTreeMouseClick,
  routeVirtualListMouseClick,
} from "./mouseRouting.js";
import type {
  CodeEditorRenderCache,
  DiffRenderCache,
  LogsConsoleRenderCache,
  TableRenderCache,
} from "./renderCaches.js";
import { routeToolApprovalDialogKeyDown } from "./toolApprovalRouting.js";
import { invokeCallbackSafely } from "./safeCallback.js";

const UTF8_DECODER = new TextDecoder();
const EMPTY_ROUTING: RoutingResult = Object.freeze({});
const ROUTE_RENDER: RouteEngineEventOutcome = Object.freeze({ needsRender: true });
const ROUTE_NO_RENDER: RouteEngineEventOutcome = Object.freeze({ needsRender: false });
const ROUTE_NO_RENDER_CONSUMED: RouteEngineEventOutcome = Object.freeze({
  needsRender: false,
  consumed: true,
});
const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);
const EMPTY_COMMAND_ITEMS: readonly CommandItem[] = Object.freeze([]);
const EMPTY_MOUSE_TARGETS: Readonly<{ focusableId: string | null; anyId: string | null }> =
  Object.freeze({ focusableId: null, anyId: null });

type PressedDropdown = Readonly<{ id: string; itemId: string }> | null;
type PressedVirtualList = Readonly<{ id: string; index: number }> | null;
type PressedTable = Readonly<{ id: string; rowIndex: number }> | null;
type PressedTableHeader = Readonly<{ id: string; columnIndex: number }> | null;
type LastTableClick = Readonly<{ id: string; rowIndex: number; timeMs: number }> | null;
type PressedFileTree = Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
type LastFileTreeClick = Readonly<{
  id: string;
  nodeIndex: number;
  nodeKey: string;
  timeMs: number;
}> | null;
type PressedFilePicker = Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
type LastFilePickerClick = Readonly<{
  id: string;
  nodeIndex: number;
  nodeKey: string;
  timeMs: number;
}> | null;
type PressedTree = Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
type LastTreeClick = Readonly<{
  id: string;
  nodeIndex: number;
  nodeKey: string;
  timeMs: number;
}> | null;
type SplitPaneDrag = Readonly<{
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
}> | null;
type SplitPaneLastDividerDown = Readonly<{
  id: string;
  dividerIndex: number;
  timeMs: number;
}> | null;

function extendMousePressableIds(
  pressableIds: ReadonlySet<string>,
  checkboxById: ReadonlyMap<string, CheckboxProps>,
): ReadonlySet<string> {
  let merged: Set<string> | null = null;

  for (const [id, checkbox] of checkboxById) {
    if (
      typeof checkbox.onChange !== "function" ||
      checkbox.disabled === true ||
      pressableIds.has(id)
    ) {
      continue;
    }
    if (merged === null) {
      merged = new Set(pressableIds);
    }
    merged.add(id);
  }

  return merged ?? pressableIds;
}

function readNodeId(layout: LayoutTree): string | null {
  const raw = (layout.vnode.props as { id?: unknown }).id;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function findLayoutNodeById(layout: LayoutTree, id: string): LayoutTree | null {
  const stack: LayoutTree[] = [layout];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    if (readNodeId(node) === id) return node;
    for (let i = node.children.length - 1; i >= 0; i--) {
      const child = node.children[i];
      if (child) stack.push(child);
    }
  }
  return null;
}

function containsPoint(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
}

function resolveMouseTargets(
  ctx: RouteEngineEventContext,
  x: number,
  y: number,
): Readonly<{ focusableId: string | null; anyId: string | null }> {
  if (!ctx.committedRoot || !ctx.layoutTree) {
    return EMPTY_MOUSE_TARGETS;
  }

  const topmostModal = ctx.layerRegistry.getTopmostModal();
  const layerHit = topmostModal ? hitTestLayers(ctx.layerRegistry, x, y) : null;
  if (
    topmostModal &&
    layerHit?.layer?.id === topmostModal.id &&
    containsPoint(topmostModal.rect, x, y)
  ) {
    const modalLayout = findLayoutNodeById(ctx.layoutTree, topmostModal.id);
    if (!modalLayout) return EMPTY_MOUSE_TARGETS;
    return Object.freeze({
      focusableId: hitTestFocusable(modalLayout.vnode, modalLayout, x, y),
      anyId: hitTestAnyId(modalLayout, x, y),
    });
  }

  return Object.freeze({
    focusableId: hitTestFocusable(ctx.committedRoot.vnode, ctx.layoutTree, x, y),
    anyId: hitTestAnyId(ctx.layoutTree, x, y),
  });
}

export type RouteEngineEventOutcome = Readonly<{
  needsRender: boolean;
  action?: RoutedAction;
  consumed?: boolean;
}>;

export type RouteEngineEventState = {
  focusState: FocusManagerState;
  pressedId: string | null;
  pressedDropdown: PressedDropdown;
  pressedVirtualList: PressedVirtualList;
  pressedTable: PressedTable;
  pressedTableHeader: PressedTableHeader;
  lastTableClick: LastTableClick;
  pressedFileTree: PressedFileTree;
  lastFileTreeClick: LastFileTreeClick;
  pressedFilePicker: PressedFilePicker;
  lastFilePickerClick: LastFilePickerClick;
  pressedTree: PressedTree;
  lastTreeClick: LastTreeClick;
  splitPaneDrag: SplitPaneDrag;
  splitPaneLastDividerDown: SplitPaneLastDividerDown;
};

export type RouteEngineEventContext = Readonly<{
  committedRoot: RuntimeInstance | null;
  layoutTree: LayoutTree | null;
  enabledById: ReadonlyMap<string, boolean>;
  focusList: readonly string[];
  pressableIds: ReadonlySet<string>;
  traps: ReadonlyMap<string, CollectedTrap>;
  zoneMetaById: ReadonlyMap<string, CollectedZone>;
  inputById: ReadonlyMap<string, InputMeta>;
  buttonById: ReadonlyMap<string, ButtonProps>;
  linkById: ReadonlyMap<string, LinkProps>;
  virtualListById: ReadonlyMap<string, VirtualListProps<unknown>>;
  tableById: ReadonlyMap<string, TableProps<unknown>>;
  treeById: ReadonlyMap<string, TreeProps<unknown>>;
  dropdownById: ReadonlyMap<string, DropdownProps>;
  sliderById: ReadonlyMap<string, SliderProps>;
  selectById: ReadonlyMap<string, SelectProps>;
  checkboxById: ReadonlyMap<string, CheckboxProps>;
  radioGroupById: ReadonlyMap<string, RadioGroupProps>;
  commandPaletteById: ReadonlyMap<string, CommandPaletteProps>;
  commandPaletteItemsById: ReadonlyMap<string, readonly CommandItem[]>;
  filePickerById: ReadonlyMap<string, FilePickerProps>;
  fileTreeExplorerById: ReadonlyMap<string, FileTreeExplorerProps>;
  splitPaneById: ReadonlyMap<string, SplitPaneProps>;
  codeEditorById: ReadonlyMap<string, CodeEditorProps>;
  diffViewerById: ReadonlyMap<string, DiffViewerProps>;
  toolApprovalDialogById: ReadonlyMap<string, ToolApprovalDialogProps>;
  logsConsoleById: ReadonlyMap<string, LogsConsoleProps>;
  rectById: ReadonlyMap<string, Rect>;
  splitPaneChildRectsById: ReadonlyMap<string, readonly Rect[]>;
  toastContainers: readonly Readonly<{ rect: Rect; props: ToastContainerProps }>[];
  toastActionByFocusId: ReadonlyMap<string, () => void>;
  dropdownSelectedIndexById: Map<string, number>;
  dropdownWindowStartById: Map<string, number>;
  toolApprovalFocusedActionById: Map<string, "allow" | "deny" | "allowSession">;
  diffViewerFocusedHunkById: Map<string, number>;
  diffViewerExpandedHunksById: Map<string, ReadonlySet<number>>;
  logsConsoleLastGTimeById: Map<string, number>;
  logsConsoleRenderCacheById: ReadonlyMap<string, LogsConsoleRenderCache>;
  diffRenderCacheById: ReadonlyMap<string, DiffRenderCache>;
  codeEditorRenderCacheById: ReadonlyMap<string, CodeEditorRenderCache>;
  tableRenderCacheById: ReadonlyMap<string, TableRenderCache>;
  inputCursorByInstanceId: Map<InstanceId, number>;
  inputSelectionByInstanceId: Map<InstanceId, InputSelection>;
  inputWorkingValueByInstanceId: Map<InstanceId, string>;
  inputUndoByInstanceId: Map<InstanceId, InputUndoStack>;
  virtualListStore: VirtualListStateStore;
  tableStore: TableStateStore;
  treeStore: TreeStateStore;
  loadedTreeChildrenByTreeId: Map<string, ReadonlyMap<string, readonly unknown[]>>;
  treeLoadTokenByTreeAndKey: Map<string, number>;
  layerRegistry: LayerRegistry;
  layerStack: readonly string[];
  closeOnEscapeByLayerId: ReadonlyMap<string, boolean>;
  closeOnBackdropByLayerId: ReadonlyMap<string, boolean>;
  onCloseByLayerId: ReadonlyMap<string, () => void>;
  dropdownStack: readonly string[];
  scrollOverrides: Map<string, Readonly<{ scrollX: number; scrollY: number }>>;
  routeOverlayShortcut: (event: ZrevEvent) => "matched" | "pending" | "none";
  invokeFocusZoneCallbacks: (
    prevZoneId: string | null,
    nextZoneId: string | null,
    prevZones: ReadonlyMap<string, CollectedZone>,
    nextZones: ReadonlyMap<string, CollectedZone>,
  ) => void;
  invokeBlurCallbackSafely: (callback: (() => void) | undefined) => void;
  computeDropdownRect: (props: DropdownProps) => Rect | null;
  findScrollableAncestors: (
    targetId: string | null,
  ) => readonly Readonly<{ nodeId: string; meta: LayoutOverflowMetadata }>[];
  writeSelectedTextToClipboard: (text: string) => void;
  reportInputCallbackError: (name: "onInput" | "onBlur", error: unknown) => void;
  requestRender: () => void;
  allocNextTreeLoadToken: () => number;
}>;

export function routeEngineEventImpl(
  event: ZrevEvent,
  ctx: RouteEngineEventContext,
  state: RouteEngineEventState,
): RouteEngineEventOutcome {
  if (!ctx.committedRoot || !ctx.layoutTree) return ROUTE_NO_RENDER;

  const enabledById = ctx.enabledById;

  const prevFocusedId = state.focusState.focusedId;
  const prevActiveZoneId = state.focusState.activeZoneId;
  const prevPressedId = state.pressedId;

  const focusedId = state.focusState.focusedId;
  const mouseTargets = event.kind === "mouse" ? resolveMouseTargets(ctx, event.x, event.y) : null;
  const mouseTargetId = mouseTargets?.focusableId ?? null;
  const mouseTargetAnyId = mouseTargets?.anyId ?? null;
  let localNeedsRender = false;

  // Overlay routing: dropdown key navigation, layer/modal ESC close, and modal backdrop blocking.
  if (event.kind === "key" && event.action === "down") {
    const shortcutResult = ctx.routeOverlayShortcut(event);
    if (shortcutResult === "matched") return ROUTE_RENDER;
    if (shortcutResult === "pending") return ROUTE_NO_RENDER_CONSUMED;

    const topLayerId =
      ctx.layerStack.length > 0 ? (ctx.layerStack[ctx.layerStack.length - 1] ?? null) : null;
    const topDropdownId =
      ctx.dropdownStack.length > 0
        ? (ctx.dropdownStack[ctx.dropdownStack.length - 1] ?? null)
        : null;
    if (topDropdownId && topLayerId === `dropdown:${topDropdownId}`) {
      const dropdown = ctx.dropdownById.get(topDropdownId);
      if (dropdown) {
        const selectedIndex = ctx.dropdownSelectedIndexById.get(topDropdownId) ?? 0;
        const dropdownResult = routeDropdownKey(event, {
          dropdownId: topDropdownId,
          items: dropdown.items,
          selectedIndex,
          ...(dropdown.onSelect ? { onSelect: dropdown.onSelect } : {}),
          ...(dropdown.onClose ? { onClose: dropdown.onClose } : {}),
        });
        if (dropdownResult.nextSelectedIndex !== undefined) {
          ctx.dropdownSelectedIndexById.set(topDropdownId, dropdownResult.nextSelectedIndex);
          const dropdownRect = ctx.computeDropdownRect(dropdown);
          const visibleRows = Math.max(0, (dropdownRect?.h ?? 0) - 2);
          ctx.dropdownWindowStartById.set(
            topDropdownId,
            computeDropdownWindow(
              dropdown.items.length,
              dropdownResult.nextSelectedIndex,
              visibleRows,
              ctx.dropdownWindowStartById.get(topDropdownId) ?? 0,
            ).startIndex,
          );
        }
        if (dropdownResult.consumed) return ROUTE_RENDER;
      }
    }

    const layerRes = routeLayerEscape(event, {
      layerStack: ctx.layerStack,
      closeOnEscape: ctx.closeOnEscapeByLayerId,
      onClose: ctx.onCloseByLayerId,
    });
    if (layerRes.consumed) return ROUTE_RENDER;
  }

  if (event.kind === "mouse") {
    const dropdownMouse = routeDropdownMouse(event, {
      layerStack: ctx.layerStack,
      dropdownStack: ctx.dropdownStack,
      dropdownById: ctx.dropdownById,
      dropdownSelectedIndexById: ctx.dropdownSelectedIndexById,
      dropdownWindowStartById: ctx.dropdownWindowStartById,
      pressedDropdown: state.pressedDropdown,
      setPressedDropdown: (next) => {
        state.pressedDropdown = next;
      },
      computeDropdownRect: ctx.computeDropdownRect,
    });
    if (dropdownMouse) return dropdownMouse;

    const layerBackdrop = routeLayerBackdropMouse(event, {
      layerRegistry: ctx.layerRegistry,
      closeOnBackdropByLayerId: ctx.closeOnBackdropByLayerId,
      onCloseByLayerId: ctx.onCloseByLayerId,
    });
    if (layerBackdrop) return layerBackdrop;
  }

  const splitPaneRouting = routeSplitPaneMouse(event, {
    splitPaneDrag: state.splitPaneDrag,
    setSplitPaneDrag: (next) => {
      state.splitPaneDrag = next;
    },
    splitPaneLastDividerDown: state.splitPaneLastDividerDown,
    setSplitPaneLastDividerDown: (next) => {
      state.splitPaneLastDividerDown = next;
    },
    splitPaneById: ctx.splitPaneById,
    splitPaneChildRectsById: ctx.splitPaneChildRectsById,
    rectById: ctx.rectById,
  });
  if (splitPaneRouting) return splitPaneRouting;

  const toastMouse = routeToastMouseDown(
    event,
    {
      toastContainers: ctx.toastContainers,
      focusState: state.focusState,
      setFocusState: (next) => {
        state.focusState = next;
      },
      zoneMetaById: ctx.zoneMetaById,
      invokeFocusZoneCallbacks: ctx.invokeFocusZoneCallbacks,
    },
    prevActiveZoneId,
  );
  if (toastMouse) return toastMouse;

  // Route complex widgets first (so arrow keys act "within" the widget, not as focus movement).
  if (event.kind === "key" && event.action === "down" && focusedId !== null) {
    const toastActionRoute = routeToastActionKeyDown(event, {
      focusedId,
      toastActionByFocusId: ctx.toastActionByFocusId,
    });
    if (toastActionRoute) return toastActionRoute;

    const palette = ctx.commandPaletteById.get(focusedId);
    if (palette?.open === true) {
      const items = ctx.commandPaletteItemsById.get(palette.id) ?? EMPTY_COMMAND_ITEMS;
      if (routeCommandPaletteKeyDown(event, palette, items)) {
        return ROUTE_RENDER;
      }
    }

    const toolDialog = ctx.toolApprovalDialogById.get(focusedId);
    if (toolDialog?.open === true) {
      if (routeToolApprovalDialogKeyDown(event, toolDialog, ctx.toolApprovalFocusedActionById)) {
        return ROUTE_RENDER;
      }
    }

    const fte = ctx.fileTreeExplorerById.get(focusedId);
    if (fte) {
      if (routeFileTreeExplorerKeyDown(event, fte, ctx.treeStore)) {
        return ROUTE_RENDER;
      }
    }

    const fp = ctx.filePickerById.get(focusedId);
    if (fp) {
      if (routeFilePickerKeyDown(event, fp, ctx.treeStore)) {
        return ROUTE_RENDER;
      }
    }

    const editor = ctx.codeEditorById.get(focusedId);
    if (editor) {
      const isCtrl = (event.mods & ZR_MOD_CTRL) !== 0;
      const isCopy = event.key === 67;
      const isCut = event.key === 88;
      const selection = editor.selection;
      const hasSelection =
        selection !== null &&
        (selection.anchor.line !== selection.active.line ||
          selection.anchor.column !== selection.active.column);
      if (isCtrl && hasSelection && (isCopy || isCut)) {
        const selected = selection ? getSelectedText(editor.lines, selection) : "";
        if (selected.length > 0) ctx.writeSelectedTextToClipboard(selected);

        if (isCut && editor.readOnly !== true) {
          const cut = selection ? deleteRange(editor.lines, selection) : null;
          if (!cut) return ROUTE_NO_RENDER_CONSUMED;
          invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
          invokeCallbackSafely("codeEditor.onChange", editor.onChange, cut.lines, cut.cursor);
          return ROUTE_RENDER;
        }
        return ROUTE_NO_RENDER_CONSUMED;
      }

      const rect = ctx.rectById.get(editor.id) ?? null;
      const route = routeCodeEditorKeyDown(event, editor, rect);
      if (route) return route;
    }

    const logsRoute = routeLogsConsoleKeyDown(event, {
      focusedId,
      logsConsoleById: ctx.logsConsoleById,
      rectById: ctx.rectById,
      logsConsoleRenderCacheById: ctx.logsConsoleRenderCacheById,
      logsConsoleLastGTimeById: ctx.logsConsoleLastGTimeById,
    });
    if (logsRoute) return logsRoute;

    const diffRoute = routeDiffViewerKeyDown(event, {
      focusedId,
      diffViewerById: ctx.diffViewerById,
      diffViewerFocusedHunkById: ctx.diffViewerFocusedHunkById,
      diffViewerExpandedHunksById: ctx.diffViewerExpandedHunksById,
    });
    if (diffRoute) return diffRoute;

    const virtualListRoute = routeVirtualListKeyDown(event, {
      focusedId,
      virtualListById: ctx.virtualListById,
      virtualListStore: ctx.virtualListStore,
    });
    if (virtualListRoute) return virtualListRoute;

    const tableRoute = routeTableKeyDown(event, {
      focusedId,
      tableById: ctx.tableById,
      tableRenderCacheById: ctx.tableRenderCacheById,
      tableStore: ctx.tableStore,
      emptyStringArray: EMPTY_STRING_ARRAY,
    });
    if (tableRoute) return tableRoute;

    const treeRoute = routeTreeKeyDown(event, {
      focusedId,
      treeById: ctx.treeById,
      treeStore: ctx.treeStore,
      loadedTreeChildrenByTreeId: ctx.loadedTreeChildrenByTreeId,
      treeLoadTokenByTreeAndKey: ctx.treeLoadTokenByTreeAndKey,
      allocNextTreeLoadToken: ctx.allocNextTreeLoadToken,
      requestRender: ctx.requestRender,
    });
    if (treeRoute) return treeRoute;

    const sliderRoute = routeSliderKeyDown(event, {
      focusedId,
      sliderById: ctx.sliderById,
    });
    if (sliderRoute) return sliderRoute;

    const selectRoute = routeSelectKeyDown(event, {
      focusedId,
      selectById: ctx.selectById,
    });
    if (selectRoute) return selectRoute;

    const checkboxRoute = routeCheckboxKeyDown(event, {
      focusedId,
      checkboxById: ctx.checkboxById,
    });
    if (checkboxRoute) return checkboxRoute;

    const radioGroupRoute = routeRadioGroupKeyDown(event, {
      focusedId,
      radioGroupById: ctx.radioGroupById,
    });
    if (radioGroupRoute) return radioGroupRoute;
  }

  const wheelRoute = routeMouseWheel(event, {
    layerRegistry: ctx.layerRegistry,
    layerStack: ctx.layerStack,
    mouseTargetId,
    mouseTargetAnyId,
    focusedId,
    virtualListById: ctx.virtualListById,
    virtualListStore: ctx.virtualListStore,
    fileTreeExplorerById: ctx.fileTreeExplorerById,
    treeStore: ctx.treeStore,
    tableById: ctx.tableById,
    tableStore: ctx.tableStore,
    codeEditorById: ctx.codeEditorById,
    codeEditorRenderCacheById: ctx.codeEditorRenderCacheById,
    logsConsoleById: ctx.logsConsoleById,
    logsConsoleRenderCacheById: ctx.logsConsoleRenderCacheById,
    diffViewerById: ctx.diffViewerById,
    rectById: ctx.rectById,
    scrollOverrides: ctx.scrollOverrides,
    findScrollableAncestors: ctx.findScrollableAncestors,
  });
  if (wheelRoute) return wheelRoute;

  // Text/paste input for command palette and code editor (docs/18 text events are distinct from keys).
  if ((event.kind === "text" || event.kind === "paste") && state.focusState.focusedId !== null) {
    const currentFocusedId = state.focusState.focusedId;

    const palette = ctx.commandPaletteById.get(currentFocusedId);
    if (palette?.open === true) {
      const append =
        event.kind === "text"
          ? event.codepoint >= 0 && event.codepoint <= 0x10ffff
            ? String.fromCodePoint(event.codepoint)
            : ""
          : UTF8_DECODER.decode(event.bytes);
      if (append.length > 0) {
        invokeCallbackSafely("commandPalette.onChange", palette.onChange, palette.query + append);
        invokeCallbackSafely("commandPalette.onSelectionChange", palette.onSelectionChange, 0);
        return ROUTE_RENDER;
      }
    }

    const editor = ctx.codeEditorById.get(currentFocusedId);
    if (editor && editor.readOnly !== true) {
      const insert =
        event.kind === "text"
          ? event.codepoint >= 0 && event.codepoint <= 0x10ffff
            ? String.fromCodePoint(event.codepoint)
            : ""
          : UTF8_DECODER.decode(event.bytes);
      if (insert.length > 0) {
        const base = editor.selection ? deleteRange(editor.lines, editor.selection) : null;
        const next = insertText(
          base ? base.lines : editor.lines,
          base ? base.cursor : editor.cursor,
          insert,
        );
        if (editor.selection !== null) {
          invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
        }
        invokeCallbackSafely("codeEditor.onChange", editor.onChange, next.lines, next.cursor);
        return ROUTE_RENDER;
      }
    }
  }

  localNeedsRender =
    routeVirtualListMouseClick(event, {
      mouseTargetId,
      virtualListById: ctx.virtualListById,
      rectById: ctx.rectById,
      virtualListStore: ctx.virtualListStore,
      pressedVirtualList: state.pressedVirtualList,
      setPressedVirtualList: (next) => {
        state.pressedVirtualList = next;
      },
    }) || localNeedsRender;

  localNeedsRender =
    routeTableMouseClick(event, {
      mouseTargetId,
      tableById: ctx.tableById,
      rectById: ctx.rectById,
      tableRenderCacheById: ctx.tableRenderCacheById,
      tableStore: ctx.tableStore,
      pressedTable: state.pressedTable,
      setPressedTable: (next) => {
        state.pressedTable = next;
      },
      pressedTableHeader: state.pressedTableHeader,
      setPressedTableHeader: (next) => {
        state.pressedTableHeader = next;
      },
      lastTableClick: state.lastTableClick,
      setLastTableClick: (next) => {
        state.lastTableClick = next;
      },
      emptyStringArray: EMPTY_STRING_ARRAY,
    }) || localNeedsRender;

  localNeedsRender =
    routeFilePickerMouseClick(event, {
      mouseTargetId,
      filePickerById: ctx.filePickerById,
      rectById: ctx.rectById,
      treeStore: ctx.treeStore,
      pressedFilePicker: state.pressedFilePicker,
      setPressedFilePicker: (next) => {
        state.pressedFilePicker = next;
      },
      lastFilePickerClick: state.lastFilePickerClick,
      setLastFilePickerClick: (next) => {
        state.lastFilePickerClick = next;
      },
    }) || localNeedsRender;

  localNeedsRender =
    routeFileTreeExplorerMouseClick(event, {
      mouseTargetId,
      fileTreeExplorerById: ctx.fileTreeExplorerById,
      rectById: ctx.rectById,
      treeStore: ctx.treeStore,
      pressedFileTree: state.pressedFileTree,
      setPressedFileTree: (next) => {
        state.pressedFileTree = next;
      },
      lastFileTreeClick: state.lastFileTreeClick,
      setLastFileTreeClick: (next) => {
        state.lastFileTreeClick = next;
      },
    }) || localNeedsRender;

  localNeedsRender =
    routeTreeMouseClick(event, {
      mouseTargetId,
      treeById: ctx.treeById,
      rectById: ctx.rectById,
      treeStore: ctx.treeStore,
      loadedTreeChildrenByTreeId: ctx.loadedTreeChildrenByTreeId,
      pressedTree: state.pressedTree,
      setPressedTree: (next) => {
        state.pressedTree = next;
      },
      lastTreeClick: state.lastTreeClick,
      setLastTreeClick: (next) => {
        state.lastTreeClick = next;
      },
    }) || localNeedsRender;

  localNeedsRender =
    routeFileTreeExplorerContextMenuMouse(event, {
      mouseTargetId,
      fileTreeExplorerById: ctx.fileTreeExplorerById,
      rectById: ctx.rectById,
      treeStore: ctx.treeStore,
    }) || localNeedsRender;

  if (event.kind === "key") {
    const inputEditingRoute = routeInputEditingEvent(event, {
      focusedId: state.focusState.focusedId,
      enabledById,
      inputById: ctx.inputById,
      inputCursorByInstanceId: ctx.inputCursorByInstanceId,
      inputSelectionByInstanceId: ctx.inputSelectionByInstanceId,
      inputWorkingValueByInstanceId: ctx.inputWorkingValueByInstanceId,
      inputUndoByInstanceId: ctx.inputUndoByInstanceId,
      writeSelectedTextToClipboard: ctx.writeSelectedTextToClipboard,
      onInputCallbackError: (error) => {
        ctx.reportInputCallbackError("onInput", error);
      },
    });
    if (inputEditingRoute) return inputEditingRoute as InputEditingRoutingOutcome;
  }

  const res: RoutingResult & { nextZoneId?: string | null } =
    event.kind === "key"
      ? routeKeyWithZones(event, {
          focusedId: state.focusState.focusedId,
          activeZoneId: state.focusState.activeZoneId,
          focusList: ctx.focusList,
          zones: state.focusState.zones,
          lastFocusedByZone: state.focusState.lastFocusedByZone,
          traps: ctx.traps,
          trapStack: state.focusState.trapStack,
          enabledById,
          pressableIds: ctx.pressableIds,
        })
      : event.kind === "mouse"
        ? routeMouse(event, {
            pressedId: state.pressedId,
            hitTestTargetId: mouseTargetId,
            enabledById,
            pressableIds: extendMousePressableIds(ctx.pressableIds, ctx.checkboxById),
          })
        : EMPTY_ROUTING;

  if (res.nextPressedId !== undefined) state.pressedId = res.nextPressedId;

  if (res.nextZoneId !== undefined) {
    state.focusState = Object.freeze({ ...state.focusState, activeZoneId: res.nextZoneId ?? null });
  }

  if (res.nextFocusedId !== undefined) {
    const nextFocused = res.nextFocusedId;
    let nextZoneId: string | null = state.focusState.activeZoneId;
    if (nextFocused !== null) {
      for (const [zoneId, zone] of state.focusState.zones) {
        if (zone.focusableIds.includes(nextFocused)) {
          nextZoneId = zoneId;
          break;
        }
      }
    }

    const nextLastFocusedByZone = new Map(state.focusState.lastFocusedByZone);
    if (nextFocused !== null && nextZoneId !== null) {
      nextLastFocusedByZone.set(nextZoneId, nextFocused);
    }

    state.focusState = Object.freeze({
      ...state.focusState,
      focusedId: nextFocused,
      activeZoneId: nextZoneId,
      lastFocusedByZone: nextLastFocusedByZone,
    });
  }

  const didFocusChange = state.focusState.focusedId !== prevFocusedId;
  const needsRender = didFocusChange || state.pressedId !== prevPressedId || localNeedsRender;

  if (didFocusChange && prevFocusedId !== null) {
    const prevInput = ctx.inputById.get(prevFocusedId);
    ctx.invokeBlurCallbackSafely(prevInput?.onBlur);
  }

  if (state.focusState.activeZoneId !== prevActiveZoneId) {
    ctx.invokeFocusZoneCallbacks(
      prevActiveZoneId,
      state.focusState.activeZoneId,
      ctx.zoneMetaById,
      ctx.zoneMetaById,
    );
  }

  if (res.action) {
    if (res.action.action === "press") {
      const checkbox = ctx.checkboxById.get(res.action.id);
      if (checkbox && typeof checkbox.onChange === "function" && checkbox.disabled !== true) {
        const nextChecked = !checkbox.checked;
        invokeCallbackSafely("checkbox.onChange", checkbox.onChange, nextChecked);
        return Object.freeze({
          needsRender,
          action: Object.freeze({
            id: res.action.id,
            action: "toggle",
            checked: nextChecked,
          }),
        });
      }

      const btn = ctx.buttonById.get(res.action.id);
      if (btn?.onPress) invokeCallbackSafely("button.onPress", btn.onPress);
      const link = ctx.linkById.get(res.action.id);
      if (link?.onPress) invokeCallbackSafely("link.onPress", link.onPress);
    }
    return Object.freeze({ needsRender, action: res.action });
  }

  const inputEditingRoute =
    event.kind === "key"
      ? null
      : routeInputEditingEvent(event, {
          focusedId: state.focusState.focusedId,
          enabledById,
          inputById: ctx.inputById,
          inputCursorByInstanceId: ctx.inputCursorByInstanceId,
          inputSelectionByInstanceId: ctx.inputSelectionByInstanceId,
          inputWorkingValueByInstanceId: ctx.inputWorkingValueByInstanceId,
          inputUndoByInstanceId: ctx.inputUndoByInstanceId,
          writeSelectedTextToClipboard: ctx.writeSelectedTextToClipboard,
          onInputCallbackError: (error) => {
            ctx.reportInputCallbackError("onInput", error);
          },
        });
  if (inputEditingRoute) return inputEditingRoute as InputEditingRoutingOutcome;

  return Object.freeze({ needsRender });
}
