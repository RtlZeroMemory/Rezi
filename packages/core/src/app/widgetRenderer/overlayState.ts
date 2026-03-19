import type { Rect } from "../../layout/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { FocusManagerState } from "../../runtime/focus.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { LayerRegistry } from "../../runtime/layers.js";
import type {
  TableStateStore,
  TreeStateStore,
  VirtualListStateStore,
} from "../../runtime/localState.js";
import {
  TOAST_HEIGHT,
  getToastActionFocusId,
  parseToastActionFocusId,
} from "../../widgets/toast.js";
import { flattenTree } from "../../widgets/tree.js";
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
  SplitPaneProps,
  TableProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  TreeProps,
  VirtualListProps,
} from "../../widgets/types.js";
import {
  fileNodeGetChildren,
  fileNodeGetKey,
  fileNodeHasChildren,
  makeFileNodeFlatCache,
  readFileNodeFlatCache,
} from "./fileNodeCache.js";
import type { OverlayShortcutOwner } from "./overlayShortcuts.js";
import {
  type CodeEditorRenderCache,
  type DiffRenderCache,
  type LogsConsoleRenderCache,
  type TableRenderCache,
  rebuildRenderCaches,
} from "./renderCaches.js";

type RoutingWidgetMaps = Readonly<{
  virtualListById: Map<string, VirtualListProps<unknown>>;
  buttonById: Map<string, ButtonProps>;
  linkById: Map<string, LinkProps>;
  tableById: Map<string, TableProps<unknown>>;
  treeById: Map<string, TreeProps<unknown>>;
  dropdownById: Map<string, DropdownProps>;
  sliderById: Map<string, SliderProps>;
  selectById: Map<string, SelectProps>;
  checkboxById: Map<string, CheckboxProps>;
  radioGroupById: Map<string, RadioGroupProps>;
  commandPaletteById: Map<string, CommandPaletteProps>;
  filePickerById: Map<string, FilePickerProps>;
  fileTreeExplorerById: Map<string, FileTreeExplorerProps>;
  splitPaneById: Map<string, SplitPaneProps>;
  codeEditorById: Map<string, CodeEditorProps>;
  diffViewerById: Map<string, DiffViewerProps>;
  toolApprovalDialogById: Map<string, ToolApprovalDialogProps>;
  logsConsoleById: Map<string, LogsConsoleProps>;
}>;

type OverlayPoolingContext = Readonly<{
  layerRegistry: LayerRegistry;
  pooledCloseOnEscape: Map<string, boolean>;
  pooledCloseOnBackdrop: Map<string, boolean>;
  pooledOnClose: Map<string, () => void>;
  pooledDropdownStack: string[];
  pooledOverlayShortcutOwners: OverlayShortcutOwner[];
  pooledToastContainers: Array<{ rect: Rect; props: ToastContainerProps }>;
}>;

type RebuildRoutingWidgetMapsAndOverlayStateParams = RoutingWidgetMaps &
  OverlayPoolingContext &
  Readonly<{
    committedRoot: RuntimeInstance;
    hiddenConstraintInstanceIds: ReadonlySet<InstanceId>;
    pooledRuntimeStack: RuntimeInstance[];
    pooledPrevTreeIds: Set<string>;
    getRectForInstance: (instanceId: InstanceId) => Rect;
    computeDropdownRect: (props: DropdownProps) => Rect | null;
  }>;

type RebuildOverlayStateForLayoutParams = Omit<
  RebuildRoutingWidgetMapsAndOverlayStateParams,
  | "pooledPrevTreeIds"
  | "virtualListById"
  | "buttonById"
  | "linkById"
  | "tableById"
  | "treeById"
  | "dropdownById"
  | "sliderById"
  | "selectById"
  | "checkboxById"
  | "radioGroupById"
  | "commandPaletteById"
  | "filePickerById"
  | "fileTreeExplorerById"
  | "splitPaneById"
  | "codeEditorById"
  | "diffViewerById"
  | "toolApprovalDialogById"
  | "logsConsoleById"
>;

type FinalizeOverlayStateCommonParams = Readonly<{
  layerRegistry: LayerRegistry;
  pooledCloseOnEscape: Map<string, boolean>;
  pooledCloseOnBackdrop: Map<string, boolean>;
  pooledOnClose: Map<string, () => void>;
  pooledDropdownStack: string[];
  pooledToastContainers: Array<{ rect: Rect; props: ToastContainerProps }>;
  pooledToastActionByFocusId: Map<string, () => void>;
  pooledToastActionLabelByFocusId: Map<string, string>;
  pooledToastFocusableActionIds: string[];
  baseFocusList: readonly string[];
  baseEnabledById: ReadonlyMap<string, boolean>;
  focusState: FocusManagerState;
}>;

type FinalizeRebuiltOverlayStateParams = FinalizeOverlayStateCommonParams &
  Readonly<{
    pooledOverlayShortcutOwners: OverlayShortcutOwner[];
    preferredToastFocus: string | null;
  }>;

type FinalizeLayoutOnlyOverlayStateParams = FinalizeOverlayStateCommonParams;

export type FinalizedOverlayState = Readonly<{
  layerStack: readonly string[];
  closeOnEscapeByLayerId: ReadonlyMap<string, boolean>;
  closeOnBackdropByLayerId: ReadonlyMap<string, boolean>;
  onCloseByLayerId: ReadonlyMap<string, () => void>;
  dropdownStack: readonly string[];
  overlayShortcutOwners: readonly OverlayShortcutOwner[];
  toastContainers: readonly Readonly<{ rect: Rect; props: ToastContainerProps }>[];
  toastActionByFocusId: ReadonlyMap<string, () => void>;
  toastActionLabelByFocusId: ReadonlyMap<string, string>;
  toastFocusableActionIds: readonly string[];
  focusList: readonly string[];
  enabledById: ReadonlyMap<string, boolean>;
  focusState: FocusManagerState;
}>;

export type FinalizedLayoutOnlyOverlayState = Omit<FinalizedOverlayState, "overlayShortcutOwners">;

type CleanupRoutingStateParams = RoutingWidgetMaps &
  Readonly<{
    pooledPrevTreeIds: ReadonlySet<string>;
    treeStore: TreeStateStore;
    virtualListStore: VirtualListStateStore;
    tableStore: TableStateStore;
    loadedTreeChildrenByTreeId: Map<string, ReadonlyMap<string, readonly unknown[]>>;
    treeLoadTokenByTreeAndKey: Map<string, number>;
    dropdownSelectedIndexById: Map<string, number>;
    dropdownWindowStartById: Map<string, number>;
    pressedVirtualList: Readonly<{ id: string; index: number }> | null;
    pressedFileTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
    lastFileTreeClick: Readonly<{
      id: string;
      nodeIndex: number;
      nodeKey: string;
      timeMs: number;
    }> | null;
    pressedFilePicker: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
    lastFilePickerClick: Readonly<{
      id: string;
      nodeIndex: number;
      nodeKey: string;
      timeMs: number;
    }> | null;
    pressedTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
    lastTreeClick: Readonly<{
      id: string;
      nodeIndex: number;
      nodeKey: string;
      timeMs: number;
    }> | null;
    commandPaletteItemsById: Map<string, readonly CommandItem[]>;
    commandPaletteLoadingById: Map<string, boolean>;
    commandPaletteFetchTokenById: Map<string, number>;
    commandPaletteLastQueryById: Map<string, string>;
    commandPaletteLastSourcesRefById: Map<string, readonly unknown[]>;
    toolApprovalFocusedActionById: Map<string, "allow" | "deny" | "allowSession">;
    diffViewerFocusedHunkById: Map<string, number>;
    diffViewerExpandedHunksById: Map<string, ReadonlySet<number>>;
    logsConsoleLastGTimeById: Map<string, number>;
    tableRenderCacheById: Map<string, TableRenderCache>;
    logsConsoleRenderCacheById: Map<string, LogsConsoleRenderCache>;
    diffRenderCacheById: Map<string, DiffRenderCache>;
    codeEditorRenderCacheById: Map<string, CodeEditorRenderCache>;
    emptyStringArray: readonly string[];
  }>;

export type CleanupRoutingStateResult = Readonly<{
  pressedVirtualList: Readonly<{ id: string; index: number }> | null;
  pressedFileTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
  lastFileTreeClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null;
  pressedFilePicker: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
  lastFilePickerClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null;
  pressedTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null;
  lastTreeClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null;
}>;

const LAYER_ZINDEX_SCALE = 1_000_000;
const LAYER_ZINDEX_MAX_BASE = Math.floor(
  (Number.MAX_SAFE_INTEGER - (LAYER_ZINDEX_SCALE - 1)) / LAYER_ZINDEX_SCALE,
);

function clampInt(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function encodeLayerZIndex(baseZ: number | null, overlaySeq: number): number {
  if (baseZ === null) return overlaySeq;
  const clampedBaseZ = clampInt(baseZ, -LAYER_ZINDEX_MAX_BASE, LAYER_ZINDEX_MAX_BASE);
  return clampedBaseZ * LAYER_ZINDEX_SCALE + overlaySeq;
}

function clearRoutingWidgetMaps(ctx: RoutingWidgetMaps): void {
  ctx.virtualListById.clear();
  ctx.buttonById.clear();
  ctx.linkById.clear();
  ctx.tableById.clear();
  ctx.treeById.clear();
  ctx.dropdownById.clear();
  ctx.sliderById.clear();
  ctx.selectById.clear();
  ctx.checkboxById.clear();
  ctx.radioGroupById.clear();
  ctx.commandPaletteById.clear();
  ctx.filePickerById.clear();
  ctx.fileTreeExplorerById.clear();
  ctx.splitPaneById.clear();
  ctx.codeEditorById.clear();
  ctx.diffViewerById.clear();
  ctx.toolApprovalDialogById.clear();
  ctx.logsConsoleById.clear();
}

function resetOverlayPooling(ctx: OverlayPoolingContext): void {
  ctx.layerRegistry.clear();
  ctx.pooledCloseOnEscape.clear();
  ctx.pooledCloseOnBackdrop.clear();
  ctx.pooledOnClose.clear();
  ctx.pooledDropdownStack.length = 0;
  ctx.pooledOverlayShortcutOwners.length = 0;
  ctx.pooledToastContainers.length = 0;
}

function collectToastActions(
  pooledToastContainers: readonly { rect: Rect; props: ToastContainerProps }[],
  pooledToastActionByFocusId: Map<string, () => void>,
  pooledToastActionLabelByFocusId: Map<string, string>,
  pooledToastFocusableActionIds: string[],
): void {
  pooledToastActionByFocusId.clear();
  pooledToastActionLabelByFocusId.clear();
  pooledToastFocusableActionIds.length = 0;

  for (const tc of pooledToastContainers) {
    const rect = tc.rect;
    if (rect.w <= 0 || rect.h <= 0) continue;

    const toasts = tc.props.toasts;
    const maxVisible = tc.props.maxVisible ?? 5;
    const maxByHeight = Math.floor(rect.h / TOAST_HEIGHT);
    const visibleCount = Math.min(toasts.length, maxVisible, maxByHeight);
    for (let i = 0; i < visibleCount; i++) {
      const toast = toasts[i];
      if (!toast?.action) continue;
      const fid = getToastActionFocusId(toast.id);
      pooledToastActionByFocusId.set(fid, toast.action.onAction);
      pooledToastActionLabelByFocusId.set(fid, toast.action.label);
      pooledToastFocusableActionIds.push(fid);
    }
  }
}

function extendFocusListWithToastActions(
  baseFocusList: readonly string[],
  baseEnabledById: ReadonlyMap<string, boolean>,
  toastFocusableActionIds: readonly string[],
): Readonly<{ focusList: readonly string[]; enabledById: ReadonlyMap<string, boolean> }> {
  if (toastFocusableActionIds.length === 0) {
    return Object.freeze({
      focusList: baseFocusList,
      enabledById: baseEnabledById,
    });
  }

  const enabled = new Map(baseEnabledById);
  for (const id of toastFocusableActionIds) enabled.set(id, true);
  return Object.freeze({
    focusList: Object.freeze([...baseFocusList, ...toastFocusableActionIds]),
    enabledById: enabled,
  });
}

export function rebuildRoutingWidgetMapsAndOverlayState(
  params: RebuildRoutingWidgetMapsAndOverlayStateParams,
): void {
  params.pooledPrevTreeIds.clear();
  for (const treeId of params.treeById.keys()) params.pooledPrevTreeIds.add(treeId);
  clearRoutingWidgetMaps(params);
  resetOverlayPooling(params);

  let overlaySeq = 0;
  params.pooledRuntimeStack.length = 0;
  params.pooledRuntimeStack.push(params.committedRoot);
  while (params.pooledRuntimeStack.length > 0) {
    const cur = params.pooledRuntimeStack.pop();
    if (!cur) continue;
    if (params.hiddenConstraintInstanceIds.has(cur.instanceId)) continue;

    const v = cur.vnode;
    switch (v.kind) {
      case "dropdown": {
        const p = v.props as DropdownProps;
        params.dropdownById.set(p.id, p);
        params.pooledDropdownStack.push(p.id);
        const rect = params.computeDropdownRect(p) ?? { x: 0, y: 0, w: 0, h: 0 };
        const zIndex = overlaySeq++;
        const layerId = `dropdown:${p.id}`;
        const onClose = typeof p.onClose === "function" ? p.onClose : undefined;
        params.pooledCloseOnEscape.set(layerId, true);
        params.pooledCloseOnBackdrop.set(layerId, false);
        if (onClose) params.pooledOnClose.set(layerId, onClose);
        const layerInput = {
          id: layerId,
          rect,
          backdrop: "none",
          modal: false,
          closeOnEscape: true,
          zIndex,
        } as const;
        params.layerRegistry.register(onClose ? { ...layerInput, onClose } : layerInput);
        params.pooledOverlayShortcutOwners.push(Object.freeze({ kind: "dropdown", id: p.id }));
        break;
      }
      case "button":
        params.buttonById.set((v.props as ButtonProps).id, v.props as ButtonProps);
        break;
      case "link": {
        const p = v.props as LinkProps;
        if (typeof p.id === "string" && p.id.length > 0) params.linkById.set(p.id, p);
        break;
      }
      case "virtualList":
        params.virtualListById.set(
          (v.props as VirtualListProps<unknown>).id,
          v.props as VirtualListProps<unknown>,
        );
        break;
      case "table":
        params.tableById.set((v.props as TableProps<unknown>).id, v.props as TableProps<unknown>);
        break;
      case "tree":
        params.treeById.set((v.props as TreeProps<unknown>).id, v.props as TreeProps<unknown>);
        break;
      case "commandPalette": {
        const p = v.props as CommandPaletteProps;
        params.commandPaletteById.set(p.id, p);
        params.pooledOverlayShortcutOwners.push(
          Object.freeze({ kind: "commandPalette", id: p.id }),
        );
        break;
      }
      case "filePicker":
        params.filePickerById.set((v.props as FilePickerProps).id, v.props as FilePickerProps);
        break;
      case "fileTreeExplorer":
        params.fileTreeExplorerById.set(
          (v.props as FileTreeExplorerProps).id,
          v.props as FileTreeExplorerProps,
        );
        break;
      case "splitPane":
        params.splitPaneById.set((v.props as SplitPaneProps).id, v.props as SplitPaneProps);
        break;
      case "codeEditor":
        params.codeEditorById.set((v.props as CodeEditorProps).id, v.props as CodeEditorProps);
        break;
      case "diffViewer":
        params.diffViewerById.set((v.props as DiffViewerProps).id, v.props as DiffViewerProps);
        break;
      case "toolApprovalDialog":
        params.toolApprovalDialogById.set(
          (v.props as ToolApprovalDialogProps).id,
          v.props as ToolApprovalDialogProps,
        );
        break;
      case "logsConsole":
        params.logsConsoleById.set((v.props as LogsConsoleProps).id, v.props as LogsConsoleProps);
        break;
      case "toastContainer": {
        const p = v.props as ToastContainerProps;
        const rect = params.getRectForInstance(cur.instanceId);
        params.pooledToastContainers.push({ rect, props: p });
        const zIndex = overlaySeq++;
        const toastIdRaw = (p as { id?: unknown }).id;
        const toastId = typeof toastIdRaw === "string" ? toastIdRaw : "default";
        const layerId = `toast:${toastId}`;
        params.pooledCloseOnEscape.set(layerId, false);
        params.pooledCloseOnBackdrop.set(layerId, false);
        params.layerRegistry.register({
          id: layerId,
          rect,
          backdrop: "none",
          modal: false,
          closeOnEscape: false,
          zIndex,
        });
        break;
      }
      case "modal": {
        const p = v.props as {
          id?: unknown;
          backdrop?: unknown;
          closeOnEscape?: unknown;
          closeOnBackdrop?: unknown;
          onClose?: unknown;
        };
        const id = typeof p.id === "string" ? p.id : null;
        if (id) {
          const rect = params.getRectForInstance(cur.instanceId);
          const zIndex = overlaySeq++;
          const canClose = p.closeOnEscape !== false;
          params.pooledCloseOnEscape.set(id, canClose);
          params.pooledCloseOnBackdrop.set(id, p.closeOnBackdrop !== false);
          const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
          if (cb) params.pooledOnClose.set(id, cb);
          const layerInput = {
            id,
            rect,
            backdrop:
              p.backdrop === "none" || p.backdrop === "dim" || p.backdrop === "opaque"
                ? p.backdrop
                : "dim",
            modal: true,
            closeOnEscape: canClose,
            zIndex,
          } as const;
          params.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
        }
        break;
      }
      case "layer": {
        const p = v.props as {
          id?: unknown;
          zIndex?: unknown;
          backdrop?: unknown;
          modal?: unknown;
          closeOnEscape?: unknown;
          onClose?: unknown;
        };
        const id = typeof p.id === "string" ? p.id : null;
        if (id) {
          const rect = params.getRectForInstance(cur.instanceId);
          const baseZ =
            typeof p.zIndex === "number" && Number.isFinite(p.zIndex) ? Math.trunc(p.zIndex) : null;
          const zIndex = encodeLayerZIndex(baseZ, overlaySeq++);
          const modal = p.modal === true;
          const canClose = p.closeOnEscape !== false;
          params.pooledCloseOnEscape.set(id, canClose);
          params.pooledCloseOnBackdrop.set(id, false);
          const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
          if (cb) params.pooledOnClose.set(id, cb);
          const layerInput = {
            id,
            rect,
            backdrop:
              p.backdrop === "none" || p.backdrop === "dim" || p.backdrop === "opaque"
                ? p.backdrop
                : "none",
            modal,
            closeOnEscape: canClose,
            zIndex,
          } as const;
          params.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
        }
        break;
      }
      case "slider":
        params.sliderById.set((v.props as SliderProps).id, v.props as SliderProps);
        break;
      case "select":
        params.selectById.set((v.props as SelectProps).id, v.props as SelectProps);
        break;
      case "checkbox":
        params.checkboxById.set((v.props as CheckboxProps).id, v.props as CheckboxProps);
        break;
      case "radioGroup":
        params.radioGroupById.set((v.props as RadioGroupProps).id, v.props as RadioGroupProps);
        break;
      default:
        break;
    }

    for (let i = cur.children.length - 1; i >= 0; i--) {
      const c = cur.children[i];
      if (c) params.pooledRuntimeStack.push(c);
    }
  }
}

export function rebuildOverlayStateForLayout(params: RebuildOverlayStateForLayoutParams): void {
  params.layerRegistry.clear();
  params.pooledCloseOnEscape.clear();
  params.pooledCloseOnBackdrop.clear();
  params.pooledOnClose.clear();
  params.pooledDropdownStack.length = 0;
  params.pooledToastContainers.length = 0;

  let overlaySeq = 0;
  params.pooledRuntimeStack.length = 0;
  params.pooledRuntimeStack.push(params.committedRoot);
  while (params.pooledRuntimeStack.length > 0) {
    const cur = params.pooledRuntimeStack.pop();
    if (!cur) continue;
    if (params.hiddenConstraintInstanceIds.has(cur.instanceId)) continue;

    const v = cur.vnode;
    switch (v.kind) {
      case "dropdown": {
        const p = v.props as DropdownProps;
        params.pooledDropdownStack.push(p.id);
        const rect = params.computeDropdownRect(p) ?? { x: 0, y: 0, w: 0, h: 0 };
        const zIndex = overlaySeq++;
        const layerId = `dropdown:${p.id}`;
        const onClose = typeof p.onClose === "function" ? p.onClose : undefined;
        params.pooledCloseOnEscape.set(layerId, true);
        params.pooledCloseOnBackdrop.set(layerId, false);
        if (onClose) params.pooledOnClose.set(layerId, onClose);
        const layerInput = {
          id: layerId,
          rect,
          backdrop: "none",
          modal: false,
          closeOnEscape: true,
          zIndex,
        } as const;
        params.layerRegistry.register(onClose ? { ...layerInput, onClose } : layerInput);
        break;
      }
      case "toastContainer": {
        const p = v.props as ToastContainerProps;
        const rect = params.getRectForInstance(cur.instanceId);
        params.pooledToastContainers.push({ rect, props: p });
        const zIndex = overlaySeq++;
        const toastIdRaw = (p as { id?: unknown }).id;
        const toastId = typeof toastIdRaw === "string" ? toastIdRaw : "default";
        const layerId = `toast:${toastId}`;
        params.pooledCloseOnEscape.set(layerId, false);
        params.pooledCloseOnBackdrop.set(layerId, false);
        params.layerRegistry.register({
          id: layerId,
          rect,
          backdrop: "none",
          modal: false,
          closeOnEscape: false,
          zIndex,
        });
        break;
      }
      case "modal": {
        const p = v.props as {
          id?: unknown;
          backdrop?: unknown;
          closeOnEscape?: unknown;
          closeOnBackdrop?: unknown;
          onClose?: unknown;
        };
        const id = typeof p.id === "string" ? p.id : null;
        if (id) {
          const rect = params.getRectForInstance(cur.instanceId);
          const zIndex = overlaySeq++;
          const canClose = p.closeOnEscape !== false;
          params.pooledCloseOnEscape.set(id, canClose);
          params.pooledCloseOnBackdrop.set(id, p.closeOnBackdrop !== false);
          const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
          if (cb) params.pooledOnClose.set(id, cb);
          const layerInput = {
            id,
            rect,
            backdrop:
              p.backdrop === "none" || p.backdrop === "dim" || p.backdrop === "opaque"
                ? p.backdrop
                : "dim",
            modal: true,
            closeOnEscape: canClose,
            zIndex,
          } as const;
          params.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
        }
        break;
      }
      case "layer": {
        const p = v.props as {
          id?: unknown;
          zIndex?: unknown;
          backdrop?: unknown;
          modal?: unknown;
          closeOnEscape?: unknown;
          onClose?: unknown;
        };
        const id = typeof p.id === "string" ? p.id : null;
        if (id) {
          const rect = params.getRectForInstance(cur.instanceId);
          const baseZ =
            typeof p.zIndex === "number" && Number.isFinite(p.zIndex) ? Math.trunc(p.zIndex) : null;
          const zIndex = encodeLayerZIndex(baseZ, overlaySeq++);
          const modal = p.modal === true;
          const canClose = p.closeOnEscape !== false;
          params.pooledCloseOnEscape.set(id, canClose);
          params.pooledCloseOnBackdrop.set(id, false);
          const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
          if (cb) params.pooledOnClose.set(id, cb);
          const layerInput = {
            id,
            rect,
            backdrop:
              p.backdrop === "none" || p.backdrop === "dim" || p.backdrop === "opaque"
                ? p.backdrop
                : "none",
            modal,
            closeOnEscape: canClose,
            zIndex,
          } as const;
          params.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
        }
        break;
      }
      default:
        break;
    }

    for (let i = cur.children.length - 1; i >= 0; i--) {
      const c = cur.children[i];
      if (c) params.pooledRuntimeStack.push(c);
    }
  }
}

export function finalizeRebuiltOverlayState(
  params: FinalizeRebuiltOverlayStateParams,
): FinalizedOverlayState {
  collectToastActions(
    params.pooledToastContainers,
    params.pooledToastActionByFocusId,
    params.pooledToastActionLabelByFocusId,
    params.pooledToastFocusableActionIds,
  );

  const focusStateAndEnabled = extendFocusListWithToastActions(
    params.baseFocusList,
    params.baseEnabledById,
    params.pooledToastFocusableActionIds,
  );

  let nextFocusState = params.focusState;
  if (
    params.preferredToastFocus &&
    params.pooledToastActionByFocusId.has(params.preferredToastFocus)
  ) {
    nextFocusState = Object.freeze({
      ...nextFocusState,
      focusedId: params.preferredToastFocus,
      activeZoneId: null,
    });
  } else {
    const curFocus = nextFocusState.focusedId;
    if (
      curFocus !== null &&
      parseToastActionFocusId(curFocus) !== null &&
      !params.pooledToastActionByFocusId.has(curFocus)
    ) {
      nextFocusState = Object.freeze({
        ...nextFocusState,
        focusedId: null,
        activeZoneId: null,
      });
    }
  }

  return Object.freeze({
    layerStack: Object.freeze(params.layerRegistry.getAll().map((l) => l.id)),
    closeOnEscapeByLayerId: params.pooledCloseOnEscape,
    closeOnBackdropByLayerId: params.pooledCloseOnBackdrop,
    onCloseByLayerId: params.pooledOnClose,
    dropdownStack: params.pooledDropdownStack.slice(),
    overlayShortcutOwners: params.pooledOverlayShortcutOwners.slice(),
    toastContainers: params.pooledToastContainers.slice(),
    toastActionByFocusId: params.pooledToastActionByFocusId,
    toastActionLabelByFocusId: params.pooledToastActionLabelByFocusId,
    toastFocusableActionIds: params.pooledToastFocusableActionIds.slice(),
    focusList: focusStateAndEnabled.focusList,
    enabledById: focusStateAndEnabled.enabledById,
    focusState: nextFocusState,
  });
}

export function finalizeLayoutOnlyOverlayState(
  params: FinalizeLayoutOnlyOverlayStateParams,
): FinalizedLayoutOnlyOverlayState {
  collectToastActions(
    params.pooledToastContainers,
    params.pooledToastActionByFocusId,
    params.pooledToastActionLabelByFocusId,
    params.pooledToastFocusableActionIds,
  );

  const focusStateAndEnabled = extendFocusListWithToastActions(
    params.baseFocusList,
    params.baseEnabledById,
    params.pooledToastFocusableActionIds,
  );

  let nextFocusState = params.focusState;
  const curFocus = nextFocusState.focusedId;
  if (
    curFocus !== null &&
    parseToastActionFocusId(curFocus) !== null &&
    !params.pooledToastActionByFocusId.has(curFocus)
  ) {
    nextFocusState = Object.freeze({
      ...nextFocusState,
      focusedId: null,
      activeZoneId: null,
    });
  }

  return Object.freeze({
    layerStack: Object.freeze(params.layerRegistry.getAll().map((l) => l.id)),
    closeOnEscapeByLayerId: params.pooledCloseOnEscape,
    closeOnBackdropByLayerId: params.pooledCloseOnBackdrop,
    onCloseByLayerId: params.pooledOnClose,
    dropdownStack: params.pooledDropdownStack.slice(),
    toastContainers: params.pooledToastContainers.slice(),
    toastActionByFocusId: params.pooledToastActionByFocusId,
    toastActionLabelByFocusId: params.pooledToastActionLabelByFocusId,
    toastFocusableActionIds: params.pooledToastFocusableActionIds.slice(),
    focusList: focusStateAndEnabled.focusList,
    enabledById: focusStateAndEnabled.enabledById,
    focusState: nextFocusState,
  });
}

export function cleanupRoutingStateAfterRebuild(
  params: CleanupRoutingStateParams,
): CleanupRoutingStateResult {
  for (const fp of params.filePickerById.values()) {
    const s = params.treeStore.get(fp.id);
    if (!readFileNodeFlatCache(s, fp.data, fp.expandedPaths)) {
      const next = flattenTree(
        fp.data,
        fileNodeGetKey,
        fileNodeGetChildren,
        fileNodeHasChildren,
        fp.expandedPaths,
      );
      params.treeStore.set(fp.id, {
        flatCache: makeFileNodeFlatCache(fp.data, fp.expandedPaths, next),
      });
    }
  }
  for (const fte of params.fileTreeExplorerById.values()) {
    const s = params.treeStore.get(fte.id);
    if (!readFileNodeFlatCache(s, fte.data, fte.expanded)) {
      const next = flattenTree(
        fte.data,
        fileNodeGetKey,
        fileNodeGetChildren,
        fileNodeHasChildren,
        fte.expanded,
      );
      params.treeStore.set(fte.id, {
        flatCache: makeFileNodeFlatCache(fte.data, fte.expanded, next),
      });
    }
  }

  for (const dropdownId of params.dropdownSelectedIndexById.keys()) {
    if (!params.dropdownById.has(dropdownId)) params.dropdownSelectedIndexById.delete(dropdownId);
  }
  for (const dropdownId of params.dropdownWindowStartById.keys()) {
    if (!params.dropdownById.has(dropdownId)) params.dropdownWindowStartById.delete(dropdownId);
  }

  for (const virtualListId of params.virtualListStore.keys()) {
    if (!params.virtualListById.has(virtualListId)) params.virtualListStore.delete(virtualListId);
  }
  const pressedVirtualList =
    params.pressedVirtualList && !params.virtualListById.has(params.pressedVirtualList.id)
      ? null
      : params.pressedVirtualList;

  for (const tableId of params.tableStore.keys()) {
    if (!params.tableById.has(tableId)) params.tableStore.delete(tableId);
  }

  for (const prevTreeId of params.pooledPrevTreeIds) {
    if (!params.treeById.has(prevTreeId)) {
      params.loadedTreeChildrenByTreeId.delete(prevTreeId);
      const prefix = `${prevTreeId}\u0000`;
      for (const tokenKey of params.treeLoadTokenByTreeAndKey.keys()) {
        if (tokenKey.startsWith(prefix)) params.treeLoadTokenByTreeAndKey.delete(tokenKey);
      }
    }
  }

  for (const treeLikeId of params.treeStore.keys()) {
    if (
      !params.treeById.has(treeLikeId) &&
      !params.filePickerById.has(treeLikeId) &&
      !params.fileTreeExplorerById.has(treeLikeId)
    ) {
      params.treeStore.delete(treeLikeId);
    }
  }

  const pressedFileTree =
    params.pressedFileTree && !params.fileTreeExplorerById.has(params.pressedFileTree.id)
      ? null
      : params.pressedFileTree;
  const lastFileTreeClick =
    params.lastFileTreeClick && !params.fileTreeExplorerById.has(params.lastFileTreeClick.id)
      ? null
      : params.lastFileTreeClick;
  const pressedFilePicker =
    params.pressedFilePicker && !params.filePickerById.has(params.pressedFilePicker.id)
      ? null
      : params.pressedFilePicker;
  const lastFilePickerClick =
    params.lastFilePickerClick && !params.filePickerById.has(params.lastFilePickerClick.id)
      ? null
      : params.lastFilePickerClick;
  const pressedTree =
    params.pressedTree && !params.treeById.has(params.pressedTree.id) ? null : params.pressedTree;
  const lastTreeClick =
    params.lastTreeClick && !params.treeById.has(params.lastTreeClick.id)
      ? null
      : params.lastTreeClick;

  for (const id of params.commandPaletteItemsById.keys()) {
    if (!params.commandPaletteById.has(id)) params.commandPaletteItemsById.delete(id);
  }
  for (const id of params.commandPaletteLoadingById.keys()) {
    if (!params.commandPaletteById.has(id)) params.commandPaletteLoadingById.delete(id);
  }
  for (const id of params.commandPaletteFetchTokenById.keys()) {
    if (!params.commandPaletteById.has(id)) params.commandPaletteFetchTokenById.delete(id);
  }
  for (const id of params.commandPaletteLastQueryById.keys()) {
    if (!params.commandPaletteById.has(id)) params.commandPaletteLastQueryById.delete(id);
  }
  for (const id of params.commandPaletteLastSourcesRefById.keys()) {
    if (!params.commandPaletteById.has(id)) params.commandPaletteLastSourcesRefById.delete(id);
  }

  for (const id of params.toolApprovalFocusedActionById.keys()) {
    if (!params.toolApprovalDialogById.has(id)) params.toolApprovalFocusedActionById.delete(id);
  }
  for (const id of params.diffViewerFocusedHunkById.keys()) {
    if (!params.diffViewerById.has(id)) params.diffViewerFocusedHunkById.delete(id);
  }
  for (const id of params.diffViewerExpandedHunksById.keys()) {
    if (!params.diffViewerById.has(id)) params.diffViewerExpandedHunksById.delete(id);
  }
  for (const id of params.logsConsoleLastGTimeById.keys()) {
    if (!params.logsConsoleById.has(id)) params.logsConsoleLastGTimeById.delete(id);
  }

  rebuildRenderCaches({
    tableById: params.tableById,
    logsConsoleById: params.logsConsoleById,
    diffViewerById: params.diffViewerById,
    codeEditorById: params.codeEditorById,
    tableRenderCacheById: params.tableRenderCacheById,
    logsConsoleRenderCacheById: params.logsConsoleRenderCacheById,
    diffRenderCacheById: params.diffRenderCacheById,
    codeEditorRenderCacheById: params.codeEditorRenderCacheById,
    emptyStringArray: params.emptyStringArray,
  });

  return Object.freeze({
    pressedVirtualList,
    pressedFileTree,
    lastFileTreeClick,
    pressedFilePicker,
    lastFilePickerClick,
    pressedTree,
    lastTreeClick,
  });
}
