/**
 * packages/core/src/app/widgetRenderer.ts — Widget tree renderer with focus and event routing.
 *
 * Why: Handles the "view mode" rendering path where users return VNode trees
 * from a view function. Orchestrates the full widget pipeline: tree commit,
 * layout computation, focus management, event routing, input editing, and
 * drawlist rendering.
 *
 * Responsibilities:
 *   - Commit VNode tree (reconciliation, instance ID allocation)
 *   - Compute layout for viewport
 *   - Manage focus state (traversal, pending changes)
 *   - Route engine events to widgets (keyboard/mouse -> actions)
 *   - Handle input widget editing (text/key/paste events)
 *   - Render committed tree to drawlist
 *
 * v2 Cursor Protocol:
 *   - When useV2Cursor is enabled, uses DrawlistBuilderV2
 *   - Emits SET_CURSOR for focused Input widgets with proper position
 *
 * @see docs/guide/runtime-and-layout.md
 * @see docs/guide/lifecycle-and-updates.md
 */

import type { CursorShape } from "../abi.js";
import type { RuntimeBackend } from "../backend.js";
import { CURSOR_DEFAULTS } from "../cursor/index.js";
import {
  type DrawlistBuilderV1,
  type DrawlistBuilderV2,
  createDrawlistBuilderV1,
  createDrawlistBuilderV2,
} from "../drawlist/index.js";
import type { ZrevEvent } from "../events.js";
import type { VNode, ViewFn } from "../index.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DELETE,
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_RIGHT,
  ZR_KEY_SPACE,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  ZR_MOD_CTRL,
  ZR_MOD_SHIFT,
} from "../keybindings/keyCodes.js";
import { hitTestFocusable } from "../layout/hitTest.js";
import { type LayoutTree, layout } from "../layout/layout.js";
import { calculateAnchorPosition } from "../layout/positioning.js";
import { measureTextCells } from "../layout/textMeasure.js";
import type { Rect } from "../layout/types.js";
import { PERF_DETAIL_ENABLED, PERF_ENABLED, perfMarkEnd, perfMarkStart } from "../perf/perf.js";
import { type CursorInfo, renderToDrawlist } from "../renderer/renderToDrawlist.js";
import { renderTree } from "../renderer/renderToDrawlist/renderTree.js";
import { DEFAULT_BASE_STYLE } from "../renderer/renderToDrawlist/textStyle.js";
import { type CommitOk, type RuntimeInstance, commitVNodeTree } from "../runtime/commit.js";
import {
  type FocusManagerState,
  createFocusManagerState,
  finalizeFocusWithPreCollectedMetadata,
} from "../runtime/focus.js";
import { applyInputEditEvent, normalizeInputCursor } from "../runtime/inputEditor.js";
import { type InstanceId, createInstanceIdAllocator } from "../runtime/instance.js";
import { createCompositeInstanceRegistry, runPendingEffects } from "../runtime/instances.js";
import { createLayerRegistry, hitTestLayers } from "../runtime/layers.js";
import {
  type TableLocalState,
  type TreeFlatCache,
  type TreeLocalState,
  type VirtualListLocalState,
  createTableStateStore,
  createTreeStateStore,
  createVirtualListStateStore,
} from "../runtime/localState.js";
import {
  type RoutedAction,
  type RoutingResult,
  routeDropdownKey,
  routeKeyWithZones,
  routeLayerEscape,
  routeMouse,
  routeTableKey,
  routeTreeKey,
  routeVirtualListKey,
  routeVirtualListWheel,
} from "../runtime/router.js";
import {
  type CollectedTrap,
  type CollectedZone,
  type InputMeta,
  type WidgetMetadataCollector,
  createWidgetMetadataCollector,
} from "../runtime/widgetMeta.js";
import type { Theme } from "../theme/theme.js";
import { deleteRange, insertText } from "../widgets/codeEditor.js";
import { getHunkScrollPosition, navigateHunk } from "../widgets/diffViewer.js";
import { applyFilters } from "../widgets/logsConsole.js";
import {
  computePanelCellSizes,
  handleDividerDrag,
  sizesToPercentages,
} from "../widgets/splitPane.js";
import { computeSelection, distributeColumnWidths } from "../widgets/table.js";
import { TOAST_HEIGHT, getToastActionFocusId, parseToastActionFocusId } from "../widgets/toast.js";
import { type FlattenedNode, flattenTree } from "../widgets/tree.js";
import type {
  ButtonProps,
  CheckboxProps,
  CodeEditorProps,
  CommandItem,
  CommandPaletteProps,
  DiffViewerProps,
  DropdownProps,
  FileNode,
  FilePickerProps,
  FileTreeExplorerProps,
  LogsConsoleProps,
  RadioGroupProps,
  SelectProps,
  SplitDirection,
  SplitPaneProps,
  TableProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  TreeProps,
  VirtualListProps,
} from "../widgets/types.js";
import { computeVisibleRange, getTotalHeight } from "../widgets/virtualList.js";
import { routeCodeEditorKeyDown } from "./widgetRenderer/codeEditorRouting.js";
import {
  kickoffCommandPaletteItemFetches,
  routeCommandPaletteKeyDown,
} from "./widgetRenderer/commandPaletteRouting.js";
import {
  fileNodeGetChildren,
  fileNodeGetKey,
  fileNodeHasChildren,
  makeFileNodeFlatCache,
  readFileNodeFlatCache,
} from "./widgetRenderer/fileNodeCache.js";
import {
  routeFilePickerKeyDown,
  routeFileTreeExplorerKeyDown,
} from "./widgetRenderer/filePickerRouting.js";
import {
  type CodeEditorRenderCache,
  type DiffRenderCache,
  type LogsConsoleRenderCache,
  type TableRenderCache,
  rebuildRenderCaches,
} from "./widgetRenderer/renderCaches.js";
import {
  buildLayoutRectIndexes,
  updateLayoutStabilitySignatures,
} from "./widgetRenderer/submitFramePipeline.js";
import { routeToolApprovalDialogKeyDown } from "./widgetRenderer/toolApprovalRouting.js";

/** Callbacks for render lifecycle tracking (used by app to set inRender flag). */
export type WidgetRendererHooks = Readonly<{
  enterRender: () => void;
  exitRender: () => void;
}>;

const UTF8_DECODER = new TextDecoder();

/** Terminal viewport dimensions in columns and rows. */
export type Viewport = Readonly<{ cols: number; rows: number }>;

/**
 * Result of submitting a widget render frame.
 * On success, inFlight resolves when backend acknowledges the frame.
 */
export type WidgetRenderSubmitResult =
  | Readonly<{ ok: true; inFlight: Promise<void> }>
  | Readonly<{
      ok: false;
      code:
        | "ZRUI_USER_CODE_THROW"
        | "ZRUI_DRAWLIST_BUILD_ERROR"
        | "ZRUI_BACKEND_ERROR"
        | "ZRUI_DUPLICATE_KEY"
        | "ZRUI_DUPLICATE_ID"
        | "ZRUI_INVALID_PROPS";
      detail: string;
    }>;

export type WidgetRenderPlan = Readonly<{
  /** Re-run view + commit (required when state or view outputs changed). */
  commit: boolean;
  /** Recompute layout explicitly (e.g. viewport resize). */
  layout: boolean;
  /**
   * Allow commit-time layout stability checks.
   * When true, the renderer may still relayout even if `layout` is false.
   */
  checkLayoutStability: boolean;
}>;

/**
 * Outcome of routing an engine event through the widget tree.
 * needsRender indicates if focus/pressed state changed (requires re-render).
 * action is emitted when a pressable widget is activated.
 */
export type WidgetRoutingOutcome = Readonly<{
  needsRender: boolean;
  action?: RoutedAction;
}>;

/** Format thrown value for error message. */
function describeThrown(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  return String(v);
}

function isI32NonNegative(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 2147483647;
}

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

const EMPTY_ROUTING: RoutingResult = Object.freeze({});
const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);
const ROUTE_RENDER: WidgetRoutingOutcome = Object.freeze({ needsRender: true });
const ROUTE_NO_RENDER: WidgetRoutingOutcome = Object.freeze({ needsRender: false });
const ZERO_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });
const INCREMENTAL_DAMAGE_AREA_FRACTION = 0.45;

function clipRectToViewport(rect: Rect, viewport: Viewport): Rect | null {
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

function isV2Builder(builder: DrawlistBuilderV1 | DrawlistBuilderV2): builder is DrawlistBuilderV2 {
  return typeof (builder as DrawlistBuilderV2).setCursor === "function";
}

type WidgetKind = RuntimeInstance["vnode"]["kind"];
type IdentityDiffDamageResult = Readonly<{
  changedInstanceIds: readonly InstanceId[];
  removedInstanceIds: readonly InstanceId[];
  routingRelevantChanged: boolean;
}>;

function isRoutingRelevantKind(kind: WidgetKind): boolean {
  switch (kind) {
    case "button":
    case "input":
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

function isDamageGranularityKind(kind: WidgetKind): boolean {
  if (kind === "row") return true;
  switch (kind) {
    case "text":
    case "divider":
    case "spacer":
    case "button":
    case "input":
    case "select":
    case "checkbox":
    case "radioGroup":
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

/**
 * Renderer for widget view mode.
 *
 * Maintains committed tree, layout, focus state, and input widget state
 * across frames. Routes engine events to produce UI actions.
 *
 * @typeParam S - Application state type
 */
export class WidgetRenderer<S> {
  private readonly backend: RuntimeBackend;
  private readonly builder: DrawlistBuilderV1 | DrawlistBuilderV2;
  private readonly useV2Cursor: boolean;
  private readonly cursorShape: CursorShape;
  private readonly cursorBlink: boolean;
  private readonly requestRender: () => void;
  private readonly requestView: () => void;

  /* --- Committed Tree State --- */
  private committedRoot: RuntimeInstance | null = null;
  private layoutTree: LayoutTree | null = null;
  private renderTick = 0;
  private lastViewport: Viewport = Object.freeze({ cols: 0, rows: 0 });

  /* --- Focus/Interaction State --- */
  private focusState: FocusManagerState = createFocusManagerState();
  private focusList: readonly string[] = Object.freeze([]);
  private baseFocusList: readonly string[] = Object.freeze([]);
  private enabledById: ReadonlyMap<string, boolean> = new Map<string, boolean>();
  private baseEnabledById: ReadonlyMap<string, boolean> = new Map<string, boolean>();
  private pressableIds: ReadonlySet<string> = new Set<string>();
  private pressedId: string | null = null;
  private pressedDropdown: Readonly<{ id: string; itemId: string }> | null = null;
  private pressedVirtualList: Readonly<{ id: string; index: number }> | null = null;
  private pressedTable: Readonly<{ id: string; rowIndex: number }> | null = null;
  private pressedTableHeader: Readonly<{ id: string; columnIndex: number }> | null = null;
  private lastTableClick: Readonly<{ id: string; rowIndex: number; timeMs: number }> | null = null;
  private traps: ReadonlyMap<string, CollectedTrap> = new Map<string, CollectedTrap>();
  private zoneMetaById: ReadonlyMap<string, CollectedZone> = new Map<string, CollectedZone>();

  /* --- Instance ID Allocation --- */
  private readonly allocator = createInstanceIdAllocator(1);

  /* --- Composite Widget State --- */
  private readonly compositeRegistry = createCompositeInstanceRegistry();

  /* --- Input Widget State --- */
  private inputById: ReadonlyMap<string, InputMeta> = new Map<string, InputMeta>();
  private readonly inputCursorByInstanceId = new Map<InstanceId, number>();
  private readonly inputWorkingValueByInstanceId = new Map<InstanceId, string>();

  /* --- Complex Widget Local State --- */
  private readonly virtualListStore = createVirtualListStateStore();
  private readonly tableStore = createTableStateStore();
  private readonly treeStore = createTreeStateStore();

  /* --- Tree Lazy-Loading Cache (per tree id, per node key) --- */
  private readonly loadedTreeChildrenByTreeId = new Map<
    string,
    ReadonlyMap<string, readonly unknown[]>
  >();
  private readonly treeLoadTokenByTreeAndKey = new Map<string, number>();
  private nextTreeLoadToken = 1;

  /* --- Complex Widget Metadata (rebuilt each commit) --- */
  private readonly virtualListById = new Map<string, VirtualListProps<unknown>>();
  private readonly buttonById = new Map<string, ButtonProps>();
  private readonly tableById = new Map<string, TableProps<unknown>>();
  private readonly treeById = new Map<string, TreeProps<unknown>>();
  private readonly dropdownById = new Map<string, DropdownProps>();
  private readonly selectById = new Map<string, SelectProps>();
  private readonly checkboxById = new Map<string, CheckboxProps>();
  private readonly radioGroupById = new Map<string, RadioGroupProps>();
  // Advanced widgets (GitHub issue #136)
  private readonly commandPaletteById = new Map<string, CommandPaletteProps>();
  private readonly filePickerById = new Map<string, FilePickerProps>();
  private readonly fileTreeExplorerById = new Map<string, FileTreeExplorerProps>();
  private readonly splitPaneById = new Map<string, SplitPaneProps>();
  private readonly codeEditorById = new Map<string, CodeEditorProps>();
  private readonly diffViewerById = new Map<string, DiffViewerProps>();
  private readonly toolApprovalDialogById = new Map<string, ToolApprovalDialogProps>();
  private readonly logsConsoleById = new Map<string, LogsConsoleProps>();

  /* --- Advanced Widget Runtime State --- */
  private rectById: ReadonlyMap<string, Rect> = new Map<string, Rect>();
  private splitPaneChildRectsById: ReadonlyMap<string, readonly Rect[]> = new Map<
    string,
    readonly Rect[]
  >();
  private toastContainers: readonly Readonly<{ rect: Rect; props: ToastContainerProps }>[] =
    Object.freeze([]);
  private toastActionByFocusId: ReadonlyMap<string, () => void> = new Map<string, () => void>();
  private toastFocusableActionIds: readonly string[] = Object.freeze([]);

  private readonly commandPaletteItemsById = new Map<string, readonly CommandItem[]>();
  private readonly commandPaletteLoadingById = new Map<string, boolean>();
  private readonly commandPaletteFetchTokenById = new Map<string, number>();
  private readonly commandPaletteLastQueryById = new Map<string, string>();
  private readonly commandPaletteLastSourcesRefById = new Map<string, readonly unknown[]>();

  private readonly toolApprovalFocusedActionById = new Map<
    string,
    "allow" | "deny" | "allowSession"
  >();

  private readonly diffViewerFocusedHunkById = new Map<string, number>();
  private readonly diffViewerExpandedHunksById = new Map<string, ReadonlySet<number>>();

  private readonly logsConsoleLastGTimeById = new Map<string, number>();

  // Tracks whether the currently committed tree needs routing rebuild traversals.
  private hadRoutingWidgets = false;

  /* --- Render Caches (avoid per-frame recompute) --- */
  private readonly tableRenderCacheById = new Map<string, TableRenderCache>();
  private readonly logsConsoleRenderCacheById = new Map<string, LogsConsoleRenderCache>();
  private readonly diffRenderCacheById = new Map<string, DiffRenderCache>();
  private readonly codeEditorRenderCacheById = new Map<string, CodeEditorRenderCache>();

  private splitPaneDrag: Readonly<{
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
  }> | null = null;

  private splitPaneLastDividerDown: Readonly<{
    id: string;
    dividerIndex: number;
    timeMs: number;
  }> | null = null;

  /* --- Overlay Routing State (rebuilt each commit) --- */
  private readonly layerRegistry = createLayerRegistry();
  private layerStack: readonly string[] = Object.freeze([]);
  private closeOnEscapeByLayerId: ReadonlyMap<string, boolean> = new Map<string, boolean>();
  private closeOnBackdropByLayerId: ReadonlyMap<string, boolean> = new Map<string, boolean>();
  private onCloseByLayerId: ReadonlyMap<string, () => void> = new Map<string, () => void>();
  private dropdownStack: readonly string[] = Object.freeze([]);
  private readonly dropdownSelectedIndexById = new Map<string, number>();

  /* --- Pooled Collections (reused per-frame to reduce GC pressure) --- */
  private readonly _metadataCollector: WidgetMetadataCollector = createWidgetMetadataCollector();
  private readonly _pooledRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly _pooledLayoutSigByInstanceId = new Map<InstanceId, number>();
  private readonly _pooledNextLayoutSigByInstanceId = new Map<InstanceId, number>();
  private readonly _pooledChangedRenderInstanceIds: InstanceId[] = [];
  private readonly _pooledRemovedRenderInstanceIds: InstanceId[] = [];
  private readonly _pooledRectById = new Map<string, Rect>();
  private readonly _pooledSplitPaneChildRectsById = new Map<string, readonly Rect[]>();
  private readonly _prevFrameRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly _prevFrameRectById = new Map<string, Rect>();
  private readonly _pooledDamageRects: Rect[] = [];
  private readonly _pooledMergedDamageRects: Rect[] = [];
  private _hasRenderedFrame = false;
  private _lastRenderedViewport: Viewport = Object.freeze({ cols: 0, rows: 0 });
  private _lastRenderedThemeRef: Theme | null = null;
  private _lastRenderedFocusedId: string | null = null;
  private _layoutMeasureCache: WeakMap<VNode, unknown> = new WeakMap<VNode, unknown>();
  private readonly _pooledCloseOnEscape = new Map<string, boolean>();
  private readonly _pooledCloseOnBackdrop = new Map<string, boolean>();
  private readonly _pooledOnClose = new Map<string, () => void>();
  private readonly _pooledToastActionByFocusId = new Map<string, () => void>();
  private readonly _pooledLayoutStack: LayoutTree[] = [];
  private readonly _pooledRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledPrevRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledDamageRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledDropdownStack: string[] = [];
  private readonly _pooledToastContainers: { rect: Rect; props: ToastContainerProps }[] = [];
  private readonly _pooledToastFocusableActionIds: string[] = [];
  // Pooled Sets for tracking previous IDs (GC cleanup detection)
  private readonly _pooledPrevTreeIds = new Set<string>();
  private readonly _pooledPrevDropdownIds = new Set<string>();
  private readonly _pooledPrevVirtualListIds = new Set<string>();
  private readonly _pooledPrevTableIds = new Set<string>();
  private readonly _pooledPrevTreeStoreIds = new Set<string>();
  private readonly _pooledPrevCommandPaletteIds = new Set<string>();
  private readonly _pooledPrevToolApprovalDialogIds = new Set<string>();
  private readonly _pooledPrevDiffViewerIds = new Set<string>();
  private readonly _pooledPrevLogsConsoleIds = new Set<string>();

  constructor(
    opts: Readonly<{
      backend: RuntimeBackend;
      builder?: DrawlistBuilderV1 | DrawlistBuilderV2;
      maxDrawlistBytes?: number;
      drawlistValidateParams?: boolean;
      drawlistReuseOutputBuffer?: boolean;
      drawlistEncodedStringCacheCap?: number;
      /** Called when composite widgets invalidate (useState/useEffect). */
      requestRender?: () => void;
      /** Called when composite widgets require a new view/commit pass. */
      requestView?: () => void;
      /** Enable v2 cursor protocol for native cursor support */
      useV2Cursor?: boolean;
      /** Cursor shape for focused inputs (default: bar) */
      cursorShape?: CursorShape;
      /** Whether cursor should blink (default: true) */
      cursorBlink?: boolean;
    }>,
  ) {
    this.backend = opts.backend;
    this.useV2Cursor = opts.useV2Cursor === true;
    this.cursorShape = opts.cursorShape ?? CURSOR_DEFAULTS.input.shape;
    this.cursorBlink = opts.cursorBlink ?? CURSOR_DEFAULTS.input.blink;
    this.requestRender = opts.requestRender ?? (() => {});
    this.requestView = opts.requestView ?? (() => {});

    // Widget rendering is generated from validated layout/runtime data, so we
    // default builder param validation off here to reduce per-command overhead.
    const validateParams = opts.drawlistValidateParams ?? false;
    const builderOpts = {
      ...(opts.maxDrawlistBytes === undefined ? {} : { maxDrawlistBytes: opts.maxDrawlistBytes }),
      validateParams,
      ...(opts.drawlistReuseOutputBuffer === undefined
        ? {}
        : { reuseOutputBuffer: opts.drawlistReuseOutputBuffer }),
      ...(opts.drawlistEncodedStringCacheCap === undefined
        ? {}
        : { encodedStringCacheCap: opts.drawlistEncodedStringCacheCap }),
    };

    if (opts.builder) {
      this.builder = opts.builder;
    } else if (this.useV2Cursor) {
      this.builder = createDrawlistBuilderV2(builderOpts);
    } else {
      this.builder = createDrawlistBuilderV1(builderOpts);
    }
  }

  /**
   * Get the currently focused widget ID.
   *
   * @returns Focused widget ID or null if nothing focused
   */
  getFocusedId(): string | null {
    return this.focusState.focusedId;
  }

  /**
   * Get the latest committed id->rect layout index.
   */
  getRectByIdIndex(): ReadonlyMap<string, Rect> {
    return this.rectById;
  }

  /**
   * Determine whether a key event should bypass the keybinding system.
   *
   * Why: When dropdowns or modal overlays are active, widgets must be able to
   * consume Escape to close/deny/exit without being preempted by global
   * keybindings (e.g., "Escape => menu").
   */
  shouldBypassKeybindings(event: ZrevEvent): boolean {
    if (event.kind !== "key" || event.action !== "down") return false;
    if (event.key !== ZR_KEY_ESCAPE) return false;

    // Dropdown stack should always receive Escape for close behavior.
    if (this.dropdownStack.length > 0) return true;

    // Modal layers should receive Escape (even if closeOnEscape=false, the
    // focused widget inside the modal may handle Escape, e.g. CommandPalette).
    return this.layerRegistry.getTopmostModal() !== undefined;
  }

  /**
   * Route an engine event through the widget tree.
   *
   * Handles focus traversal (Tab/Shift+Tab), mouse interactions,
   * keyboard activation (Enter/Space), and input widget editing.
   *
   * @param event - Engine event from ZREV parsing
   * @returns Routing outcome with render flag and optional action
   */
  routeEngineEvent(event: ZrevEvent): WidgetRoutingOutcome {
    if (!this.committedRoot || !this.layoutTree) return ROUTE_NO_RENDER;

    const enabledById = this.enabledById;

    const prevFocusedId = this.focusState.focusedId;
    const prevActiveZoneId = this.focusState.activeZoneId;
    const prevPressedId = this.pressedId;

    const focusedId = this.focusState.focusedId;
    const mouseTargetId =
      event.kind === "mouse"
        ? hitTestFocusable(this.committedRoot.vnode, this.layoutTree, event.x, event.y)
        : null;
    let localNeedsRender = false;

    // Overlay routing: dropdown key navigation, layer/modal ESC close, and modal backdrop blocking.
    if (event.kind === "key" && event.action === "down") {
      const topDropdownId =
        this.dropdownStack.length > 0
          ? (this.dropdownStack[this.dropdownStack.length - 1] ?? null)
          : null;
      if (topDropdownId) {
        const dropdown = this.dropdownById.get(topDropdownId);
        if (dropdown) {
          const selectedIndex = this.dropdownSelectedIndexById.get(topDropdownId) ?? 0;
          const ctx: Parameters<typeof routeDropdownKey>[1] = {
            dropdownId: topDropdownId,
            items: dropdown.items,
            selectedIndex,
            ...(dropdown.onSelect ? { onSelect: dropdown.onSelect } : {}),
            ...(dropdown.onClose ? { onClose: dropdown.onClose } : {}),
          };
          const r = routeDropdownKey(event, ctx);
          if (r.nextSelectedIndex !== undefined) {
            this.dropdownSelectedIndexById.set(topDropdownId, r.nextSelectedIndex);
          }
          if (r.consumed) return ROUTE_RENDER;
        }
      }

      const layerRes = routeLayerEscape(event, {
        layerStack: this.layerStack,
        closeOnEscape: this.closeOnEscapeByLayerId,
        onClose: this.onCloseByLayerId,
      });
      if (layerRes.consumed) return ROUTE_RENDER;
    }

    if (event.kind === "mouse") {
      const topDropdownId =
        this.dropdownStack.length > 0
          ? (this.dropdownStack[this.dropdownStack.length - 1] ?? null)
          : null;
      if (topDropdownId) {
        const dropdown = this.dropdownById.get(topDropdownId);
        const dropdownRect = dropdown ? this.computeDropdownRect(dropdown) : null;
        if (dropdown && dropdownRect && dropdownRect.w > 0 && dropdownRect.h > 0) {
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
            this.pressedDropdown = null;

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
                const prevSelected = this.dropdownSelectedIndexById.get(topDropdownId) ?? 0;
                this.dropdownSelectedIndexById.set(topDropdownId, itemIndex);
                this.pressedDropdown = Object.freeze({ id: topDropdownId, itemId: item.id });
                return Object.freeze({ needsRender: itemIndex !== prevSelected });
              }
            }

            // Click inside dropdown but not on a selectable item: consume.
            return ROUTE_NO_RENDER;
          }

          if (event.mouseKind === MOUSE_KIND_UP) {
            const pressed = this.pressedDropdown;
            this.pressedDropdown = null;

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

            // Mouse up while dropdown is open: consume.
            return ROUTE_NO_RENDER;
          }

          // Dropdown open: block mouse events to lower layers.
          return ROUTE_NO_RENDER;
        }
      }

      const hit = hitTestLayers(this.layerRegistry, event.x, event.y);
      if (hit.blocked) {
        const blocking = hit.blockingLayer;
        // Mouse kind 3 = down (locked by ABI).
        if (
          blocking &&
          event.mouseKind === 3 &&
          (this.closeOnBackdropByLayerId.get(blocking.id) ?? false) === true
        ) {
          const cb = this.onCloseByLayerId.get(blocking.id);
          if (cb) {
            try {
              cb();
            } catch {
              // Swallow close callback errors to preserve routing determinism.
            }
            return ROUTE_RENDER;
          }
        }
        // Block all input to lower layers.
        return ROUTE_NO_RENDER;
      }
    }

    // SplitPane divider dragging (GitHub issue #136). SplitPane is intentionally not focusable;
    // divider drags are handled directly from mouse events.
    if (event.kind === "mouse") {
      const MOUSE_KIND_DOWN = 3;
      const MOUSE_KIND_UP = 4;
      const MOUSE_KIND_WHEEL = 5;

      if (this.splitPaneDrag) {
        if (event.mouseKind === MOUSE_KIND_UP) {
          if (this.splitPaneDrag.didDrag) {
            this.splitPaneLastDividerDown = null;
          }
          this.splitPaneDrag = null;
          return ROUTE_RENDER;
        }
        if (event.mouseKind !== MOUSE_KIND_WHEEL) {
          const drag = this.splitPaneDrag;
          const pane = this.splitPaneById.get(drag.id);
          if (pane) {
            const delta =
              drag.direction === "horizontal" ? event.x - drag.startX : event.y - drag.startY;
            const didDrag = drag.didDrag || delta !== 0;
            if (didDrag && !drag.didDrag) {
              this.splitPaneDrag = Object.freeze({ ...drag, didDrag: true });
            }
            if (didDrag) {
              this.splitPaneLastDividerDown = null;
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
          // SplitPane removed mid-drag.
          this.splitPaneLastDividerDown = null;
          this.splitPaneDrag = null;
          return ROUTE_RENDER;
        }
      } else if (event.mouseKind === MOUSE_KIND_DOWN) {
        // Detect divider under cursor.
        for (const [id, pane] of this.splitPaneById) {
          const rect = this.rectById.get(id);
          if (!rect || rect.w <= 0 || rect.h <= 0) continue;

          if (
            event.x < rect.x ||
            event.x >= rect.x + rect.w ||
            event.y < rect.y ||
            event.y >= rect.y + rect.h
          ) {
            continue;
          }

          const childRects = this.splitPaneChildRectsById.get(id) ?? Object.freeze([]);
          if (childRects.length < 2) continue;

          const dividerSize = Math.max(1, pane.dividerSize ?? 1);
          const direction = pane.direction;
          const sizeMode = pane.sizeMode ?? "percent";
          const minSizes = pane.minSizes;
          const maxSizes = pane.maxSizes;

          // Hit expansion for easier grabbing: dividerSize + 2 (one cell on each side).
          const expand = 1;

          for (let i = 0; i < childRects.length - 1; i++) {
            const a = childRects[i];
            const b = childRects[i + 1];
            if (!a || !b) continue;
            if (direction === "horizontal") {
              // Divider starts immediately before the next panel's x.
              const x0 = b.x - dividerSize;
              const hitX0 = x0 - expand;
              const hitX1 = x0 + dividerSize + expand;
              if (event.x >= hitX0 && event.x < hitX1) {
                // Only allow primary-button drags/double-click collapse.
                if ((event.buttons & 1) === 0) continue;

                const prevDown = this.splitPaneLastDividerDown;
                const DOUBLE_CLICK_MS = 500;
                if (pane.collapsible === true && pane.onCollapse) {
                  if (
                    prevDown &&
                    prevDown.id === id &&
                    prevDown.dividerIndex === i &&
                    event.timeMs - prevDown.timeMs <= DOUBLE_CLICK_MS
                  ) {
                    this.splitPaneLastDividerDown = null;

                    // Select which panel to toggle based on which side of the divider was clicked.
                    const targetIndex = event.x < x0 ? i : event.x >= x0 + dividerSize ? i + 1 : i;
                    const isCollapsed = pane.collapsed?.includes(targetIndex) ?? false;
                    try {
                      pane.onCollapse(targetIndex, !isCollapsed);
                    } catch {
                      // Swallow collapse callback errors to preserve routing determinism.
                    }
                    return ROUTE_RENDER;
                  }

                  this.splitPaneLastDividerDown = Object.freeze({
                    id,
                    dividerIndex: i,
                    timeMs: event.timeMs,
                  });
                } else {
                  this.splitPaneLastDividerDown = null;
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

                this.splitPaneDrag = Object.freeze({
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
                });
                return ROUTE_RENDER;
              }
            } else {
              // Divider starts immediately before the next panel's y.
              const y0 = b.y - dividerSize;
              const hitY0 = y0 - expand;
              const hitY1 = y0 + dividerSize + expand;
              if (event.y >= hitY0 && event.y < hitY1) {
                // Only allow primary-button drags/double-click collapse.
                if ((event.buttons & 1) === 0) continue;

                const prevDown = this.splitPaneLastDividerDown;
                const DOUBLE_CLICK_MS = 500;
                if (pane.collapsible === true && pane.onCollapse) {
                  if (
                    prevDown &&
                    prevDown.id === id &&
                    prevDown.dividerIndex === i &&
                    event.timeMs - prevDown.timeMs <= DOUBLE_CLICK_MS
                  ) {
                    this.splitPaneLastDividerDown = null;

                    const targetIndex = event.y < y0 ? i : event.y >= y0 + dividerSize ? i + 1 : i;
                    const isCollapsed = pane.collapsed?.includes(targetIndex) ?? false;
                    try {
                      pane.onCollapse(targetIndex, !isCollapsed);
                    } catch {
                      // Swallow collapse callback errors to preserve routing determinism.
                    }
                    return ROUTE_RENDER;
                  }

                  this.splitPaneLastDividerDown = Object.freeze({
                    id,
                    dividerIndex: i,
                    timeMs: event.timeMs,
                  });
                } else {
                  this.splitPaneLastDividerDown = null;
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

                this.splitPaneDrag = Object.freeze({
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
                });
                return ROUTE_RENDER;
              }
            }
          }
        }
      }
    }

    // Toast interactions (GitHub issue #136): click toast to dismiss, click action to run.
    if (event.kind === "mouse" && event.mouseKind === 3 && this.toastContainers.length > 0) {
      for (let i = this.toastContainers.length - 1; i >= 0; i--) {
        const tc = this.toastContainers[i];
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
              this.focusState = Object.freeze({
                ...this.focusState,
                focusedId: getToastActionFocusId(toast.id),
                activeZoneId: null,
              });
              if (this.focusState.activeZoneId !== prevActiveZoneId) {
                this.invokeFocusZoneCallbacks(
                  prevActiveZoneId,
                  this.focusState.activeZoneId,
                  this.zoneMetaById,
                  this.zoneMetaById,
                );
              }
              toast.action.onAction();
              return ROUTE_RENDER;
            }
          }

          tc.props.onDismiss(toast.id);
          return ROUTE_RENDER;
        }
      }
    }

    // Route complex widgets first (so arrow keys act "within" the widget, not as focus movement).
    if (event.kind === "key" && event.action === "down" && focusedId !== null) {
      // Toast action routing (keyboard). ToastContainer itself is not focusable; individual
      // toast actions become focusable via runtime-local synthetic ids (PLAN.md).
      if (
        parseToastActionFocusId(focusedId) !== null &&
        (event.key === ZR_KEY_ENTER || event.key === ZR_KEY_SPACE)
      ) {
        const cb = this.toastActionByFocusId.get(focusedId);
        if (cb) {
          cb();
          return ROUTE_RENDER;
        }
      }

      // Command palette routing (GitHub issue #136)
      const palette = this.commandPaletteById.get(focusedId);
      if (palette?.open === true) {
        const items = this.commandPaletteItemsById.get(palette.id) ?? Object.freeze([]);
        if (routeCommandPaletteKeyDown(event, palette, items)) {
          return ROUTE_RENDER;
        }
      }

      // Tool approval dialog routing (GitHub issue #136)
      const toolDialog = this.toolApprovalDialogById.get(focusedId);
      if (toolDialog?.open === true) {
        if (routeToolApprovalDialogKeyDown(event, toolDialog, this.toolApprovalFocusedActionById)) {
          return ROUTE_RENDER;
        }
      }

      // File tree explorer routing (GitHub issue #136)
      const fte = this.fileTreeExplorerById.get(focusedId);
      if (fte) {
        if (routeFileTreeExplorerKeyDown(event, fte, this.treeStore)) {
          return ROUTE_RENDER;
        }
      }

      // File picker routing (GitHub issue #136)
      const fp = this.filePickerById.get(focusedId);
      if (fp) {
        if (routeFilePickerKeyDown(event, fp, this.treeStore)) {
          return ROUTE_RENDER;
        }
      }

      // Code editor routing (GitHub issue #136)
      const editor = this.codeEditorById.get(focusedId);
      if (editor) {
        const rect = this.rectById.get(editor.id) ?? null;
        const r = routeCodeEditorKeyDown(event, editor, rect);
        if (r) return r;
      }

      // Logs console routing (GitHub issue #136)
      const logs = this.logsConsoleById.get(focusedId);
      if (logs) {
        const rect = this.rectById.get(logs.id) ?? null;
        const viewportHeight = rect ? Math.max(1, rect.h) : 1;

        const cached = this.logsConsoleRenderCacheById.get(logs.id);
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

          const prevG = this.logsConsoleLastGTimeById.get(logs.id);
          this.logsConsoleLastGTimeById.set(logs.id, event.timeMs);
          if (prevG !== undefined && event.timeMs - prevG <= 500) {
            this.logsConsoleLastGTimeById.delete(logs.id);
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
      }

      // Diff viewer routing (GitHub issue #136)
      const diff = this.diffViewerById.get(focusedId);
      if (diff) {
        const isShift = (event.mods & ZR_MOD_SHIFT) !== 0;
        const key = event.key;

        const hunkCount = diff.diff.hunks.length;
        const curFocused = this.diffViewerFocusedHunkById.get(diff.id) ?? diff.focusedHunk ?? 0;
        const focusedHunk = Math.max(0, Math.min(hunkCount - 1, curFocused));

        const isNext = key === ZR_KEY_DOWN || (!isShift && key === 74) /* J */;
        const isPrev = key === ZR_KEY_UP || (!isShift && key === 75) /* K */;

        if (isNext || isPrev) {
          const nextFocused = navigateHunk(focusedHunk, isNext ? "next" : "prev", hunkCount);
          this.diffViewerFocusedHunkById.set(diff.id, nextFocused);
          diff.onScroll(getHunkScrollPosition(nextFocused, diff.diff.hunks));
          return ROUTE_RENDER;
        }

        if (key === ZR_KEY_ENTER) {
          const base =
            this.diffViewerExpandedHunksById.get(diff.id) ??
            new Set<number>(diff.expandedHunks ?? []);
          const next = new Set<number>(base);
          const expanded = next.has(focusedHunk);
          if (expanded) next.delete(focusedHunk);
          else next.add(focusedHunk);
          this.diffViewerExpandedHunksById.set(diff.id, next);
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
      }

      // Virtual list routing
      const vlist = this.virtualListById.get(focusedId);
      if (vlist) {
        const state: VirtualListLocalState = this.virtualListStore.get(vlist.id);
        const prevScrollTop = state.scrollTop;
        const r = routeVirtualListKey(event, {
          virtualListId: vlist.id,
          items: vlist.items,
          itemHeight: vlist.itemHeight,
          state,
          keyboardNavigation: vlist.keyboardNavigation !== false,
          wrapAround: vlist.wrapAround === true,
        });

        let changed = false;
        if (r.nextSelectedIndex !== undefined || r.nextScrollTop !== undefined) {
          const patch: { selectedIndex?: number; scrollTop?: number } = {};
          if (r.nextSelectedIndex !== undefined) patch.selectedIndex = r.nextSelectedIndex;
          if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
          this.virtualListStore.set(vlist.id, patch);
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
            vlist.itemHeight,
            r.nextScrollTop,
            state.viewportHeight,
            overscan,
          );
          vlist.onScroll(r.nextScrollTop, [startIndex, endIndex]);
        }

        if (r.action && vlist.onSelect) {
          const item = vlist.items[r.action.index];
          if (item !== undefined) vlist.onSelect(item, r.action.index);
          changed = true;
        }

        if (changed) return ROUTE_RENDER;
      }

      // Table routing
      const table = this.tableById.get(focusedId);
      if (table) {
        const rowHeight = table.rowHeight ?? 1;
        const tableCache = this.tableRenderCacheById.get(table.id);
        const rowKeys = tableCache?.rowKeys ?? table.data.map((row, i) => table.getRowKey(row, i));
        const state: TableLocalState = this.tableStore.get(table.id);

        const headerHeight = table.showHeader === false ? 0 : (table.headerHeight ?? 1);
        if (headerHeight <= 0 && state.focusedRowIndex === -1) {
          this.tableStore.set(table.id, { focusedRowIndex: 0 });
          return ROUTE_RENDER;
        }

        if (headerHeight > 0) {
          const colCount = table.columns.length;
          const clampColIndex = (idx: number): number => {
            if (colCount <= 0) return 0;
            return Math.max(0, Math.min(colCount - 1, idx));
          };

          // Enter header focus with Up from the first row.
          if (state.focusedRowIndex === 0 && event.key === ZR_KEY_UP) {
            this.tableStore.set(table.id, {
              focusedRowIndex: -1,
              focusedColumnIndex: clampColIndex(state.focusedColumnIndex),
            });
            return ROUTE_RENDER;
          }

          // Header focus: left/right moves columns; Enter toggles sort.
          if (state.focusedRowIndex === -1) {
            const colIndex = clampColIndex(state.focusedColumnIndex);
            if (colIndex !== state.focusedColumnIndex) {
              this.tableStore.set(table.id, { focusedColumnIndex: colIndex });
              return ROUTE_RENDER;
            }

            if (event.key === ZR_KEY_DOWN) {
              this.tableStore.set(table.id, { focusedRowIndex: 0 });
              return ROUTE_RENDER;
            }

            if (event.key === ZR_KEY_HOME) {
              if (colIndex !== 0) {
                this.tableStore.set(table.id, { focusedColumnIndex: 0 });
                return ROUTE_RENDER;
              }
              return ROUTE_NO_RENDER;
            }
            if (event.key === ZR_KEY_END) {
              const last = Math.max(0, colCount - 1);
              if (colIndex !== last) {
                this.tableStore.set(table.id, { focusedColumnIndex: last });
                return ROUTE_RENDER;
              }
              return ROUTE_NO_RENDER;
            }

            if (event.key === ZR_KEY_LEFT || event.key === ZR_KEY_RIGHT) {
              const delta = event.key === ZR_KEY_RIGHT ? 1 : -1;
              const next = clampColIndex(colIndex + delta);
              if (next !== colIndex) {
                this.tableStore.set(table.id, { focusedColumnIndex: next });
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
              // Already in header focus.
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
            selection: (table.selection ?? EMPTY_STRING_ARRAY) as readonly string[],
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
              this.tableStore.set(table.id, patch);
            }

            if (r.nextSelection !== undefined && table.onSelectionChange) {
              table.onSelectionChange(r.nextSelection);
            }

            if (r.action && table.onRowPress) {
              const row = table.data[r.action.rowIndex];
              if (row !== undefined) table.onRowPress(row, r.action.rowIndex);
            }

            return ROUTE_RENDER;
          }
        }
      }

      // Tree routing
      const tree = this.treeById.get(focusedId);
      if (tree) {
        const state: TreeLocalState = this.treeStore.get(tree.id);
        const expandedSet =
          state.expandedSetRef === tree.expanded && state.expandedSet
            ? state.expandedSet
            : new Set(tree.expanded);
        if (state.expandedSetRef !== tree.expanded) {
          this.treeStore.set(tree.id, { expandedSetRef: tree.expanded, expandedSet });
        }
        const loaded = this.loadedTreeChildrenByTreeId.get(tree.id);
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
          this.treeStore.set(tree.id, {
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

        if (r.consumed) {
          if (r.nextFocusedKey !== undefined || r.nextScrollTop !== undefined) {
            const patch: { focusedKey?: string | null; scrollTop?: number } = {};
            if (r.nextFocusedKey !== undefined) patch.focusedKey = r.nextFocusedKey;
            if (r.nextScrollTop !== undefined) patch.scrollTop = r.nextScrollTop;
            this.treeStore.set(tree.id, patch);
          }

          if (r.nodeToSelect && tree.onSelect) {
            const found = flatNodes.find((n) => n.key === r.nodeToSelect);
            if (found) tree.onSelect(found.node as unknown);
          }

          if (r.nodeToActivate && tree.onActivate) {
            const found = flatNodes.find((n) => n.key === r.nodeToActivate);
            if (found) tree.onActivate(found.node as unknown);
          }

          if (r.nodeToLoad && tree.loadChildren) {
            const nodeKey = r.nodeToLoad;
            const alreadyLoaded =
              this.loadedTreeChildrenByTreeId.get(tree.id)?.get(nodeKey) !== undefined;
            const alreadyLoading = state.loadingKeys.has(nodeKey);
            const found = flatNodes.find((n) => n.key === nodeKey);

            if (!alreadyLoaded && !alreadyLoading && found) {
              this.treeStore.startLoading(tree.id, nodeKey);
              const token = this.nextTreeLoadToken++;
              const tokenKey = `${tree.id}\u0000${nodeKey}`;
              this.treeLoadTokenByTreeAndKey.set(tokenKey, token);

              void tree.loadChildren(found.node as unknown).then(
                (children) => {
                  if (this.treeLoadTokenByTreeAndKey.get(tokenKey) !== token) return;
                  this.treeLoadTokenByTreeAndKey.delete(tokenKey);

                  const prev = this.loadedTreeChildrenByTreeId.get(tree.id);
                  const next = new Map<string, readonly unknown[]>(
                    prev ? Array.from(prev.entries()) : [],
                  );
                  next.set(nodeKey, Object.freeze(children.slice()));
                  this.loadedTreeChildrenByTreeId.set(tree.id, next);

                  this.treeStore.finishLoading(tree.id, nodeKey);
                  this.requestRender();
                },
                () => {
                  if (this.treeLoadTokenByTreeAndKey.get(tokenKey) !== token) return;
                  this.treeLoadTokenByTreeAndKey.delete(tokenKey);
                  this.treeStore.finishLoading(tree.id, nodeKey);
                  this.requestRender();
                },
              );
            }
          }

          if (r.nextExpanded !== undefined) {
            // Best-effort: detect toggled keys and invoke onToggle for each diff.
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

          return ROUTE_RENDER;
        }
      }

      // Select routing (simple: arrow keys cycle; Enter/Space cycles)
      const select = this.selectById.get(focusedId);
      if (select && select.disabled !== true && select.options.length > 0) {
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

        if (dir !== 0 && select.onChange) {
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
        }
      }

      // Checkbox routing (Space/Enter toggles)
      const checkbox = this.checkboxById.get(focusedId);
      if (checkbox && checkbox.disabled !== true && checkbox.onChange) {
        const KEY_ENTER = 2;
        const KEY_SPACE = 32;
        if (event.key === KEY_ENTER || event.key === KEY_SPACE) {
          checkbox.onChange(!checkbox.checked);
          return ROUTE_RENDER;
        }
      }

      // Radio group routing (arrow keys change selection)
      const radio = this.radioGroupById.get(focusedId);
      if (radio && radio.disabled !== true && radio.onChange) {
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

        if (dir !== 0) {
          const opts = radio.options.filter((o) => o.disabled !== true);
          if (opts.length > 0) {
            const idx = opts.findIndex((o) => o.value === radio.value);
            const nextIdx = idx < 0 ? 0 : (idx + dir + opts.length) % opts.length;
            const next = opts[nextIdx];
            if (next && next.value !== radio.value) {
              radio.onChange(next.value);
              return ROUTE_RENDER;
            }
          }
        }
      }
    }

    // Mouse wheel for virtual list (prefer list under cursor; fallback to focused list).
    if (event.kind === "mouse" && event.mouseKind === 5) {
      const targetId = mouseTargetId ?? focusedId;
      if (targetId === null) return ROUTE_NO_RENDER;
      const vlist = this.virtualListById.get(targetId);
      if (vlist) {
        const state = this.virtualListStore.get(vlist.id);
        const totalHeight = getTotalHeight(vlist.items, vlist.itemHeight);

        const r = routeVirtualListWheel(event, {
          scrollTop: state.scrollTop,
          totalHeight,
          viewportHeight: state.viewportHeight,
        });

        if (r.nextScrollTop !== undefined) {
          this.virtualListStore.set(vlist.id, { scrollTop: r.nextScrollTop });
          if (typeof vlist.onScroll === "function") {
            const overscan = vlist.overscan ?? 3;
            const { startIndex, endIndex } = computeVisibleRange(
              vlist.items,
              vlist.itemHeight,
              r.nextScrollTop,
              state.viewportHeight,
              overscan,
            );
            vlist.onScroll(r.nextScrollTop, [startIndex, endIndex]);
          }
          return ROUTE_RENDER;
        }
      }

      if (focusedId !== null) {
        const editor = this.codeEditorById.get(focusedId);
        if (editor) {
          const rect = this.rectById.get(editor.id) ?? null;
          const viewportHeight = rect ? Math.max(1, rect.h) : 1;
          const maxScrollTop = Math.max(0, editor.lines.length - viewportHeight);
          const nextScrollTop = Math.max(
            0,
            Math.min(maxScrollTop, editor.scrollTop + event.wheelY * 3),
          );
          const nextScrollLeft = Math.max(0, editor.scrollLeft + event.wheelX * 3);
          if (nextScrollTop !== editor.scrollTop || nextScrollLeft !== editor.scrollLeft) {
            editor.onScroll(nextScrollTop, nextScrollLeft);
            return ROUTE_RENDER;
          }
        }

        const logs = this.logsConsoleById.get(focusedId);
        if (logs) {
          const rect = this.rectById.get(logs.id) ?? null;
          const viewportHeight = rect ? Math.max(1, rect.h) : 1;
          const cached = this.logsConsoleRenderCacheById.get(logs.id);
          const filteredLen =
            cached?.filtered.length ??
            applyFilters(logs.entries, logs.levelFilter, logs.sourceFilter, logs.searchQuery)
              .length;
          const maxScroll = Math.max(0, filteredLen - viewportHeight);
          const nextScrollTop = Math.max(0, Math.min(maxScroll, logs.scrollTop + event.wheelY * 3));
          if (nextScrollTop !== logs.scrollTop) {
            logs.onScroll(nextScrollTop);
            return ROUTE_RENDER;
          }
        }

        const diff = this.diffViewerById.get(focusedId);
        if (diff) {
          const rect = this.rectById.get(diff.id) ?? null;
          const viewportHeight = rect ? Math.max(1, rect.h) : 1;
          let totalLines = 0;
          for (const h of diff.diff.hunks) {
            if (!h) continue;
            totalLines += 1 + h.lines.length;
          }
          const maxScroll = Math.max(0, totalLines - viewportHeight);
          const nextScrollTop = Math.max(0, Math.min(maxScroll, diff.scrollTop + event.wheelY * 3));
          if (nextScrollTop !== diff.scrollTop) {
            diff.onScroll(nextScrollTop);
            return ROUTE_RENDER;
          }
        }
      }
    }

    // Text/paste input for command palette and code editor (docs/18 text events are distinct from keys).
    if ((event.kind === "text" || event.kind === "paste") && this.focusState.focusedId !== null) {
      const focusedId = this.focusState.focusedId;

      const palette = this.commandPaletteById.get(focusedId);
      if (palette?.open === true) {
        const append =
          event.kind === "text"
            ? event.codepoint >= 0 && event.codepoint <= 0x10ffff
              ? String.fromCodePoint(event.codepoint)
              : ""
            : UTF8_DECODER.decode(event.bytes);
        if (append.length > 0) {
          palette.onQueryChange(palette.query + append);
          palette.onSelectionChange?.(0);
          return ROUTE_RENDER;
        }
      }

      const editor = this.codeEditorById.get(focusedId);
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
          if (editor.selection !== null) editor.onSelectionChange(null);
          editor.onChange(next.lines, next.cursor);
          return ROUTE_RENDER;
        }
      }
    }

    // Mouse click for virtual list:
    // - on down: update selectedIndex
    // - on up: activate onSelect if released on the same item
    if (event.kind === "mouse" && (event.mouseKind === 3 || event.mouseKind === 4)) {
      const targetId = mouseTargetId;
      if (targetId !== null) {
        const vlist = this.virtualListById.get(targetId);
        const rect = this.rectById.get(targetId);
        if (vlist && rect) {
          const state = this.virtualListStore.get(targetId);
          const localY = event.y - rect.y;
          const inBounds = localY >= 0 && localY < rect.h;

          const computeIndex = (): number | null => {
            if (!inBounds) return null;
            const yInContent = state.scrollTop + localY;
            if (yInContent < 0) return null;
            if (vlist.items.length === 0) return null;

            if (typeof vlist.itemHeight === "number") {
              const h = vlist.itemHeight;
              if (h <= 0) return null;
              return Math.floor(yInContent / h);
            }

            const { itemOffsets } = computeVisibleRange(
              vlist.items,
              vlist.itemHeight,
              0,
              Number.MAX_SAFE_INTEGER,
              0,
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
              this.virtualListStore.set(targetId, { selectedIndex: idx });
              this.pressedVirtualList = Object.freeze({ id: targetId, index: idx });
              if (idx !== prev) localNeedsRender = true;
            } else {
              this.pressedVirtualList = null;
            }
          } else {
            const idx0 = computeIndex();
            const pressed = this.pressedVirtualList;
            this.pressedVirtualList = null;
            if (idx0 !== null && pressed && pressed.id === targetId) {
              const idx = Math.max(0, Math.min(vlist.items.length - 1, idx0));
              if (idx === pressed.index) {
                if (vlist.onSelect) {
                  const item = vlist.items[idx];
                  if (item !== undefined) vlist.onSelect(item, idx);
                }
                localNeedsRender = true;
              }
            }
          }
        } else if (event.mouseKind === 4) {
          this.pressedVirtualList = null;
        }
      } else if (event.mouseKind === 4) {
        this.pressedVirtualList = null;
      }
    }

    // Mouse click for table:
    // - on down: focus row + update selection, or focus header column
    // - on up: activate onRowPress/onRowDoublePress, or toggle sort on header
    if (event.kind === "mouse" && (event.mouseKind === 3 || event.mouseKind === 4)) {
      const targetId = mouseTargetId;
      if (targetId !== null) {
        const table = this.tableById.get(targetId);
        const rect = this.rectById.get(targetId);
        if (table && rect) {
          const tableCache = this.tableRenderCacheById.get(table.id);
          const rowKeys =
            tableCache?.rowKeys ?? table.data.map((row, i) => table.getRowKey(row, i));
          const rowKeyToIndex = tableCache?.rowKeyToIndex;
          const selection = (table.selection ?? EMPTY_STRING_ARRAY) as readonly string[];
          const selectionMode = table.selectionMode ?? "none";

          const state = this.tableStore.get(table.id);

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
            this.pressedTable = null;
            this.pressedTableHeader = null;

            const colIndex = computeColumnIndex();
            if (colIndex !== null) {
              this.lastTableClick = null;
              const prevRow = state.focusedRowIndex;
              const prevCol = state.focusedColumnIndex;
              this.tableStore.set(table.id, { focusedRowIndex: -1, focusedColumnIndex: colIndex });
              this.pressedTableHeader = Object.freeze({ id: table.id, columnIndex: colIndex });
              if (prevRow !== -1 || prevCol !== colIndex) localNeedsRender = true;
              // Header press does not affect selection.
              this.pressedTable = null;
            } else {
              const rowIndex = computeRowIndex();
              if (rowIndex !== null) {
                const rowKey = rowKeys[rowIndex];
                if (rowKey === undefined) {
                  this.pressedTable = null;
                  this.pressedTableHeader = null;
                  this.lastTableClick = null;
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
                  this.tableStore.set(table.id, {
                    focusedRowIndex: rowIndex,
                    lastClickedKey: rowKey,
                  });
                  if (rowIndex !== prevRow) localNeedsRender = true;
                  if (res.changed && typeof table.onSelectionChange === "function") {
                    table.onSelectionChange(res.selection);
                    localNeedsRender = true;
                  }

                  this.pressedTable = Object.freeze({ id: table.id, rowIndex });
                }
              } else {
                this.pressedTable = null;
                this.pressedTableHeader = null;
                this.lastTableClick = null;
              }
            }
          } else {
            const pressedRow = this.pressedTable;
            const pressedHeader = this.pressedTableHeader;
            this.pressedTable = null;
            this.pressedTableHeader = null;

            if (pressedHeader && pressedHeader.id === table.id) {
              this.lastTableClick = null;
              const colIndex = computeColumnIndex();
              if (colIndex !== null && colIndex === pressedHeader.columnIndex) {
                const col = table.columns[colIndex];
                if (col && col.sortable === true && typeof table.onSort === "function") {
                  const nextDirection: "asc" | "desc" =
                    table.sortColumn === col.key && table.sortDirection === "asc" ? "desc" : "asc";
                  table.onSort(col.key, nextDirection);
                  localNeedsRender = true;
                }
              }
            }

            if (pressedRow && pressedRow.id === table.id) {
              const rowIndex = computeRowIndex();
              if (rowIndex !== null && rowIndex === pressedRow.rowIndex) {
                const DOUBLE_PRESS_MS = 500;
                const last = this.lastTableClick;
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
                    table.onRowDoublePress(row, rowIndex);
                    this.lastTableClick = null;
                  } else if (typeof table.onRowPress === "function") {
                    table.onRowPress(row, rowIndex);
                    this.lastTableClick = Object.freeze({
                      id: table.id,
                      rowIndex,
                      timeMs: event.timeMs,
                    });
                  } else {
                    this.lastTableClick = Object.freeze({
                      id: table.id,
                      rowIndex,
                      timeMs: event.timeMs,
                    });
                  }
                  localNeedsRender = true;
                } else {
                  this.lastTableClick = null;
                }
              } else {
                this.lastTableClick = null;
              }
            }
          }
        } else if (event.mouseKind === 4) {
          this.pressedTable = null;
          this.pressedTableHeader = null;
        }
      } else if (event.mouseKind === 4) {
        this.pressedTable = null;
        this.pressedTableHeader = null;
      }
    }

    // Right-click context menu for FileTreeExplorer.
    if (event.kind === "mouse" && event.mouseKind === 3) {
      const targetId = mouseTargetId;
      if (targetId !== null) {
        const fte = this.fileTreeExplorerById.get(targetId);
        const rect = this.rectById.get(targetId);
        if (fte && rect && typeof fte.onContextMenu === "function") {
          const RIGHT_BUTTON = 1 << 2;
          if ((event.buttons & RIGHT_BUTTON) !== 0) {
            const localY = event.y - rect.y;
            const inBounds = localY >= 0 && localY < rect.h;
            if (inBounds) {
              const state = this.treeStore.get(fte.id);
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
                  this.treeStore.set(fte.id, {
                    flatCache: makeFileNodeFlatCache(fte.data, fte.expanded, next),
                  });
                  return next;
                })();

              const idx = Math.max(0, state.scrollTop) + localY;
              const fn = flatNodes[idx];
              if (fn) {
                fte.onContextMenu(fn.node);
                localNeedsRender = true;
              }
            }
          }
        }
      }
    }

    const res: RoutingResult & { nextZoneId?: string | null } =
      event.kind === "key"
        ? routeKeyWithZones(event, {
            focusedId: this.focusState.focusedId,
            activeZoneId: this.focusState.activeZoneId,
            focusList: this.focusList,
            zones: this.focusState.zones,
            lastFocusedByZone: this.focusState.lastFocusedByZone,
            traps: this.traps,
            trapStack: this.focusState.trapStack,
            enabledById,
            pressableIds: this.pressableIds,
          })
        : event.kind === "mouse"
          ? routeMouse(event, {
              pressedId: this.pressedId,
              hitTestTargetId: mouseTargetId,
              enabledById,
              pressableIds: this.pressableIds,
            })
          : EMPTY_ROUTING;

    if (res.nextPressedId !== undefined) this.pressedId = res.nextPressedId;

    if (res.nextZoneId !== undefined) {
      this.focusState = Object.freeze({ ...this.focusState, activeZoneId: res.nextZoneId ?? null });
    }

    if (res.nextFocusedId !== undefined) {
      const nextFocused = res.nextFocusedId;
      let nextZoneId: string | null = this.focusState.activeZoneId;
      if (nextFocused !== null) {
        for (const [zoneId, zone] of this.focusState.zones) {
          if (zone.focusableIds.includes(nextFocused)) {
            nextZoneId = zoneId;
            break;
          }
        }
      }

      const nextLastFocusedByZone = new Map(this.focusState.lastFocusedByZone);
      if (nextFocused !== null && nextZoneId !== null) {
        nextLastFocusedByZone.set(nextZoneId, nextFocused);
      }

      this.focusState = Object.freeze({
        ...this.focusState,
        focusedId: nextFocused,
        activeZoneId: nextZoneId,
        lastFocusedByZone: nextLastFocusedByZone,
      });
    }

    const didFocusChange = this.focusState.focusedId !== prevFocusedId;
    const needsRender = didFocusChange || this.pressedId !== prevPressedId || localNeedsRender;

    if (didFocusChange && prevFocusedId !== null) {
      const prevInput = this.inputById.get(prevFocusedId);
      if (prevInput?.onBlur) prevInput.onBlur();
    }

    if (this.focusState.activeZoneId !== prevActiveZoneId) {
      this.invokeFocusZoneCallbacks(
        prevActiveZoneId,
        this.focusState.activeZoneId,
        this.zoneMetaById,
        this.zoneMetaById,
      );
    }

    if (res.action) {
      if (res.action.action === "press") {
        const btn = this.buttonById.get(res.action.id);
        if (btn?.onPress) btn.onPress();
      }
      return Object.freeze({ needsRender, action: res.action });
    }

    // Input editing (docs/18): focused enabled Input is the routing target for key/text/paste events.
    if (event.kind === "key" || event.kind === "text" || event.kind === "paste") {
      const focusedId = this.focusState.focusedId;
      if (focusedId !== null && enabledById.get(focusedId) === true) {
        const meta = this.inputById.get(focusedId);
        if (meta) {
          const instanceId = meta.instanceId;
          const value = this.inputWorkingValueByInstanceId.get(instanceId) ?? meta.value;
          const cursor = this.inputCursorByInstanceId.get(instanceId) ?? value.length;
          const edit = applyInputEditEvent(event, { id: focusedId, value, cursor });
          if (edit) {
            this.inputWorkingValueByInstanceId.set(instanceId, edit.nextValue);
            this.inputCursorByInstanceId.set(instanceId, edit.nextCursor);
            if (edit.action) {
              if (meta.onInput) meta.onInput(edit.action.value, edit.action.cursor);
              return Object.freeze({ needsRender, action: edit.action });
            }
          }
        }
      }
    }

    return Object.freeze({ needsRender });
  }

  private invokeFocusZoneCallbacks(
    prevZoneId: string | null,
    nextZoneId: string | null,
    prevZones: ReadonlyMap<string, CollectedZone>,
    nextZones: ReadonlyMap<string, CollectedZone>,
  ): void {
    if (prevZoneId === nextZoneId) return;

    if (prevZoneId !== null) {
      const prev = prevZones.get(prevZoneId);
      if (prev?.onExit) {
        try {
          prev.onExit();
        } catch {
          // Swallow callback errors to preserve routing determinism.
        }
      }
    }

    if (nextZoneId !== null) {
      const next = nextZones.get(nextZoneId);
      if (next?.onEnter) {
        try {
          next.onEnter();
        } catch {
          // Swallow callback errors to preserve routing determinism.
        }
      }
    }
  }

  private computeDropdownRect(props: DropdownProps): Rect | null {
    const viewport = this.lastViewport;
    if (viewport.cols <= 0 || viewport.rows <= 0) return null;

    const anchor = this.rectById.get(props.anchorId) ?? null;
    if (!anchor) return null;

    const items = Array.isArray(props.items) ? props.items : [];
    let maxLabelW = 0;
    let maxShortcutW = 0;
    for (const item of items) {
      if (!item || item.divider) continue;
      const labelW = measureTextCells(item.label);
      if (labelW > maxLabelW) maxLabelW = labelW;
      const shortcut = item.shortcut;
      if (shortcut && shortcut.length > 0) {
        const shortcutW = measureTextCells(shortcut);
        if (shortcutW > maxShortcutW) maxShortcutW = shortcutW;
      }
    }

    const gapW = maxShortcutW > 0 ? 1 : 0;
    const contentW = Math.max(1, maxLabelW + gapW + maxShortcutW);
    const totalW = Math.max(2, contentW + 2); // +2 for border
    const totalH = Math.max(2, items.length + 2); // +2 for border

    const pos = calculateAnchorPosition({
      anchor,
      overlaySize: { w: totalW, h: totalH },
      position: props.position ?? "below-start",
      viewport: { x: 0, y: 0, width: viewport.cols, height: viewport.rows },
      gap: 0,
      flip: true,
    });
    return pos.rect;
  }

  private shouldAttemptIncrementalRender(
    doLayout: boolean,
    viewport: Viewport,
    theme: Theme,
  ): boolean {
    if (!this._hasRenderedFrame) return false;
    if (doLayout) return false;
    if (
      this._lastRenderedViewport.cols !== viewport.cols ||
      this._lastRenderedViewport.rows !== viewport.rows
    ) {
      return false;
    }
    if (this._lastRenderedThemeRef !== theme) return false;

    // Conservative correctness: overlays can draw outside local rects.
    if (
      this.dropdownStack.length > 0 ||
      this.layerStack.length > 0 ||
      this.toastContainers.length > 0
    ) {
      return false;
    }
    return true;
  }

  private collectSubtreeDamageAndRouting(
    root: RuntimeInstance,
    outInstanceIds: InstanceId[],
  ): boolean {
    let routingRelevant = false;
    this._pooledDamageRuntimeStack.length = 0;
    this._pooledDamageRuntimeStack.push(root);
    while (this._pooledDamageRuntimeStack.length > 0) {
      const node = this._pooledDamageRuntimeStack.pop();
      if (!node) continue;
      const kind = node.vnode.kind;
      if (isRoutingRelevantKind(kind)) routingRelevant = true;
      if (isDamageGranularityKind(kind) || node.children.length === 0) {
        outInstanceIds.push(node.instanceId);
        continue;
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledDamageRuntimeStack.push(child);
      }
    }
    return routingRelevant;
  }

  private computeIdentityDiffDamage(
    prevRoot: RuntimeInstance | null,
    nextRoot: RuntimeInstance,
  ): IdentityDiffDamageResult {
    this._pooledChangedRenderInstanceIds.length = 0;
    this._pooledRemovedRenderInstanceIds.length = 0;

    if (prevRoot === null) {
      const routingRelevantChanged = this.collectSubtreeDamageAndRouting(
        nextRoot,
        this._pooledChangedRenderInstanceIds,
      );
      return {
        changedInstanceIds: this._pooledChangedRenderInstanceIds,
        removedInstanceIds: this._pooledRemovedRenderInstanceIds,
        routingRelevantChanged,
      };
    }

    let routingRelevantChanged = false;
    this._pooledPrevRuntimeStack.length = 0;
    this._pooledRuntimeStack.length = 0;
    this._pooledPrevRuntimeStack.push(prevRoot);
    this._pooledRuntimeStack.push(nextRoot);

    while (this._pooledPrevRuntimeStack.length > 0 && this._pooledRuntimeStack.length > 0) {
      const prevNode = this._pooledPrevRuntimeStack.pop();
      const nextNode = this._pooledRuntimeStack.pop();
      if (!prevNode || !nextNode) continue;
      if (prevNode === nextNode) continue;

      const prevKind = prevNode.vnode.kind;
      const nextKind = nextNode.vnode.kind;

      if (prevNode.instanceId !== nextNode.instanceId || prevKind !== nextKind) {
        routingRelevantChanged =
          this.collectSubtreeDamageAndRouting(prevNode, this._pooledRemovedRenderInstanceIds) ||
          routingRelevantChanged;
        routingRelevantChanged =
          this.collectSubtreeDamageAndRouting(nextNode, this._pooledChangedRenderInstanceIds) ||
          routingRelevantChanged;
        continue;
      }

      if (isRoutingRelevantKind(nextKind)) routingRelevantChanged = true;

      if (isDamageGranularityKind(nextKind)) {
        this._pooledChangedRenderInstanceIds.push(nextNode.instanceId);
        continue;
      }

      const prevChildren = prevNode.children;
      const nextChildren = nextNode.children;
      const sharedCount = Math.min(prevChildren.length, nextChildren.length);
      let hadChildChanges = prevChildren.length !== nextChildren.length;

      for (let i = sharedCount - 1; i >= 0; i--) {
        const prevChild = prevChildren[i];
        const nextChild = nextChildren[i];
        if (!prevChild || !nextChild || prevChild === nextChild) continue;
        hadChildChanges = true;
        this._pooledPrevRuntimeStack.push(prevChild);
        this._pooledRuntimeStack.push(nextChild);
      }

      if (nextChildren.length > sharedCount) {
        hadChildChanges = true;
        for (let i = sharedCount; i < nextChildren.length; i++) {
          const child = nextChildren[i];
          if (!child) continue;
          routingRelevantChanged =
            this.collectSubtreeDamageAndRouting(child, this._pooledChangedRenderInstanceIds) ||
            routingRelevantChanged;
        }
      }

      if (prevChildren.length > sharedCount) {
        hadChildChanges = true;
        for (let i = sharedCount; i < prevChildren.length; i++) {
          const child = prevChildren[i];
          if (!child) continue;
          routingRelevantChanged =
            this.collectSubtreeDamageAndRouting(child, this._pooledRemovedRenderInstanceIds) ||
            routingRelevantChanged;
        }
      }

      // If only this node changed (children are reference-identical), treat as self-damage.
      if (!hadChildChanges) {
        this._pooledChangedRenderInstanceIds.push(nextNode.instanceId);
      }
    }

    this._pooledPrevRuntimeStack.length = 0;
    this._pooledRuntimeStack.length = 0;

    return {
      changedInstanceIds: this._pooledChangedRenderInstanceIds,
      removedInstanceIds: this._pooledRemovedRenderInstanceIds,
      routingRelevantChanged,
    };
  }

  private emitIncrementalCursor(cursorInfo: CursorInfo | undefined): void {
    if (!cursorInfo || !this.useV2Cursor || !isV2Builder(this.builder)) return;

    const focusedId = this.focusState.focusedId;
    if (!focusedId) {
      this.builder.hideCursor();
      return;
    }

    const input = this.inputById.get(focusedId);
    if (!input || input.disabled) {
      this.builder.hideCursor();
      return;
    }

    const rect = this._pooledRectByInstanceId.get(input.instanceId);
    if (!rect || rect.w <= 0 || rect.h <= 0) {
      this.builder.hideCursor();
      return;
    }

    const graphemeOffset = this.inputCursorByInstanceId.get(input.instanceId) ?? input.value.length;
    const cursorX = measureTextCells(input.value.slice(0, graphemeOffset));
    this.builder.setCursor({
      x: rect.x + 1 + cursorX,
      y: rect.y,
      shape: cursorInfo.shape,
      visible: true,
      blink: cursorInfo.blink,
    });
  }

  private appendDamageRectForInstanceId(instanceId: InstanceId): boolean {
    const current = this._pooledRectByInstanceId.get(instanceId);
    if (current && current.w > 0 && current.h > 0) {
      this._pooledDamageRects.push(current);
      return true;
    }
    const prev = this._prevFrameRectByInstanceId.get(instanceId);
    if (prev && prev.w > 0 && prev.h > 0) {
      this._pooledDamageRects.push(prev);
      return true;
    }
    return false;
  }

  private appendDamageRectForId(id: string): boolean {
    const current = this._pooledRectById.get(id);
    if (current && current.w > 0 && current.h > 0) {
      this._pooledDamageRects.push(current);
      return true;
    }
    const prev = this._prevFrameRectById.get(id);
    if (prev && prev.w > 0 && prev.h > 0) {
      this._pooledDamageRects.push(prev);
      return true;
    }
    return false;
  }

  private collectSpinnerDamageRects(runtimeRoot: RuntimeInstance, layoutRoot: LayoutTree): void {
    this._pooledRuntimeStack.length = 0;
    this._pooledLayoutStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    this._pooledLayoutStack.push(layoutRoot);
    while (this._pooledRuntimeStack.length > 0 && this._pooledLayoutStack.length > 0) {
      const runtimeNode = this._pooledRuntimeStack.pop();
      const layoutNode = this._pooledLayoutStack.pop();
      if (!runtimeNode || !layoutNode) continue;
      if (runtimeNode.vnode.kind === "spinner") {
        const rect = layoutNode.rect;
        if (rect.w > 0 && rect.h > 0) this._pooledDamageRects.push(rect);
      }
      const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
      for (let i = childCount - 1; i >= 0; i--) {
        const runtimeChild = runtimeNode.children[i];
        const layoutChild = layoutNode.children[i];
        if (runtimeChild && layoutChild) {
          this._pooledRuntimeStack.push(runtimeChild);
          this._pooledLayoutStack.push(layoutChild);
        }
      }
    }
  }

  private normalizeDamageRects(viewport: Viewport): readonly Rect[] {
    this._pooledMergedDamageRects.length = 0;
    for (const raw of this._pooledDamageRects) {
      const clipped = clipRectToViewport(raw, viewport);
      if (!clipped) continue;

      let merged = clipped;
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (let i = 0; i < this._pooledMergedDamageRects.length; i++) {
          const existing = this._pooledMergedDamageRects[i];
          if (!existing) continue;
          if (!rectOverlapsOrTouches(existing, merged)) continue;
          merged = unionRect(existing, merged);
          this._pooledMergedDamageRects.splice(i, 1);
          expanded = true;
          break;
        }
      }
      this._pooledMergedDamageRects.push(merged);
    }
    this._pooledMergedDamageRects.sort((a, b) => a.y - b.y || a.x - b.x);
    return this._pooledMergedDamageRects;
  }

  private isDamageAreaTooLarge(viewport: Viewport): boolean {
    const totalCells = viewport.cols * viewport.rows;
    if (totalCells <= 0) return true;
    let area = 0;
    for (const rect of this._pooledMergedDamageRects) {
      area += rect.w * rect.h;
    }
    return area > totalCells * INCREMENTAL_DAMAGE_AREA_FRACTION;
  }

  private snapshotRenderedFrameState(viewport: Viewport, theme: Theme, doLayout: boolean): void {
    if (doLayout) {
      this._prevFrameRectByInstanceId.clear();
      for (const [instanceId, rect] of this._pooledRectByInstanceId) {
        this._prevFrameRectByInstanceId.set(instanceId, rect);
      }
      this._prevFrameRectById.clear();
      for (const [id, rect] of this._pooledRectById) {
        this._prevFrameRectById.set(id, rect);
      }
    }
    this._hasRenderedFrame = true;
    this._lastRenderedViewport = Object.freeze({ cols: viewport.cols, rows: viewport.rows });
    this._lastRenderedThemeRef = theme;
    this._lastRenderedFocusedId = this.focusState.focusedId;
  }

  /**
   * Execute view function, commit tree, compute layout, and render to drawlist.
   *
   * Pipeline:
   *   1. Call viewFn(snapshot) to get VNode tree
   *   2. Commit VNode tree (reconciliation, instance allocation)
   *   3. Compute layout for viewport dimensions
   *   4. Finalize focus state for committed tree
   *   5. Render tree to drawlist
   *   6. Submit drawlist to backend
   *
   * @param viewFn - User view function returning VNode tree
   * @param snapshot - Current application state (read-only)
   * @param viewport - Terminal dimensions
   * @param hooks - Lifecycle hooks for render tracking
   * @returns Success with in-flight promise, or error with code/detail
   */
  submitFrame(
    viewFn: ViewFn<S>,
    snapshot: Readonly<S>,
    viewport: Viewport,
    theme: Theme,
    hooks: WidgetRendererHooks,
    plan: WidgetRenderPlan = { commit: true, layout: true, checkLayoutStability: true },
  ): WidgetRenderSubmitResult {
    if (!isI32NonNegative(viewport.cols) || !isI32NonNegative(viewport.rows)) {
      return {
        ok: false,
        code: "ZRUI_INVALID_PROPS",
        detail: `viewport must be int32 cols/rows >= 0 (got cols=${String(viewport.cols)}, rows=${String(viewport.rows)})`,
      };
    }

    this.lastViewport = viewport;
    this.builder.reset();

    let entered = false;
    try {
      hooks.enterRender();
      entered = true;

      const doCommit = plan.commit || this.committedRoot === null;
      // Layout is no longer an unconditional consequence of commit. We rerun
      // layout when explicitly requested (resize/layout dirty), bootstrap lacks
      // a tree, or committed layout signatures changed.
      let doLayout = plan.layout || this.layoutTree === null;

      let commitRes: CommitOk | null = null;
      let prevFocusedIdBeforeFinalize: string | null = null;
      const prevActiveZoneIdBeforeSubmit = this.focusState.activeZoneId;
      const prevZoneMetaByIdBeforeSubmit = this.zoneMetaById;
      const prevCommittedRoot = this.committedRoot;
      const hadRoutingWidgets = this.hadRoutingWidgets;
      let hasRoutingWidgets = hadRoutingWidgets;
      let didRoutingRebuild = false;
      let identityDamageFromCommit: IdentityDiffDamageResult | null = null;

      if (doCommit) {
        const viewToken = PERF_DETAIL_ENABLED ? perfMarkStart("view") : 0;
        const vnode = viewFn(snapshot);
        if (PERF_DETAIL_ENABLED) perfMarkEnd("view", viewToken);

        const commitToken = PERF_DETAIL_ENABLED ? perfMarkStart("vnode_commit") : 0;
        const commitRes0 = commitVNodeTree(this.committedRoot, vnode, {
          allocator: this.allocator,
          collectLifecycleInstanceIds: false,
          composite: {
            registry: this.compositeRegistry,
            appState: snapshot,
            onInvalidate: () => this.requestView(),
          },
        });
        if (PERF_DETAIL_ENABLED) perfMarkEnd("vnode_commit", commitToken);
        if (!commitRes0.ok) {
          return { ok: false, code: commitRes0.fatal.code, detail: commitRes0.fatal.detail };
        }
        commitRes = commitRes0.value;
        this.committedRoot = commitRes.root;

        const damageToken = PERF_DETAIL_ENABLED ? perfMarkStart("damage_identity_diff") : 0;
        identityDamageFromCommit = this.computeIdentityDiffDamage(
          prevCommittedRoot,
          this.committedRoot,
        );
        if (PERF_DETAIL_ENABLED) perfMarkEnd("damage_identity_diff", damageToken);

        if (!doLayout && plan.checkLayoutStability) {
          // Detect layout-relevant commit changes (including child order changes)
          // using per-instance stability signatures.
          if (
            updateLayoutStabilitySignatures(
              this.committedRoot,
              this._pooledLayoutSigByInstanceId,
              this._pooledNextLayoutSigByInstanceId,
              this._pooledRuntimeStack,
            )
          ) {
            doLayout = true;
          }
        }
        for (const unmountedId of commitRes.unmountedInstanceIds) {
          this.inputCursorByInstanceId.delete(unmountedId);
          this.inputWorkingValueByInstanceId.delete(unmountedId);
          // Composite instances: invalidate stale closures and run effect cleanups.
          this.compositeRegistry.incrementGeneration(unmountedId);
          this.compositeRegistry.delete(unmountedId);
        }
      }

      if (!this.committedRoot) {
        return {
          ok: false,
          code: "ZRUI_INVALID_PROPS",
          detail: "widgetRenderer: missing committed root",
        };
      }

      if (doLayout) {
        if (doCommit) {
          // Commit can replace vnode identities; reset cross-frame measure memoization.
          this._layoutMeasureCache = new WeakMap<VNode, unknown>();
        }
        const layoutToken = perfMarkStart("layout");
        const layoutRes = layout(
          this.committedRoot.vnode,
          0,
          0,
          viewport.cols,
          viewport.rows,
          "column",
          this._layoutMeasureCache,
        );
        perfMarkEnd("layout", layoutToken);
        if (!layoutRes.ok) {
          return { ok: false, code: layoutRes.fatal.code, detail: layoutRes.fatal.detail };
        }
        const nextLayoutTree = layoutRes.value;
        this.layoutTree = nextLayoutTree;

        // Build a fast instanceId->rect index for overlay routing (modal/layer hit testing),
        // plus an id->rect map for widget-local interactions (scrolling, divider drags).
        // Uses pooled collections to avoid per-frame allocations.
        const layoutIndexesToken = PERF_DETAIL_ENABLED ? perfMarkStart("layout_indexes") : 0;
        buildLayoutRectIndexes(
          nextLayoutTree,
          this.committedRoot,
          this._pooledRectByInstanceId,
          this._pooledRectById,
          this._pooledSplitPaneChildRectsById,
          this._pooledLayoutStack,
          this._pooledRuntimeStack,
        );
        if (PERF_DETAIL_ENABLED) perfMarkEnd("layout_indexes", layoutIndexesToken);
        this.rectById = this._pooledRectById;
        this.splitPaneChildRectsById = this._pooledSplitPaneChildRectsById;
      }

      if (!this.layoutTree) {
        return {
          ok: false,
          code: "ZRUI_INVALID_PROPS",
          detail: "widgetRenderer: missing layout tree",
        };
      }

      if (doCommit) {
        const canSkipMetadataCollect =
          prevCommittedRoot !== null &&
          hadRoutingWidgets === false &&
          identityDamageFromCommit !== null &&
          identityDamageFromCommit.routingRelevantChanged === false;

        if (!canSkipMetadataCollect) {
          const metaToken = PERF_DETAIL_ENABLED ? perfMarkStart("metadata_collect") : 0;
          // Single-pass metadata collection using pooled collector (avoids per-frame allocations)
          const widgetMeta = this._metadataCollector.collect(this.committedRoot);
          hasRoutingWidgets = widgetMeta.hasRoutingWidgets;

          const nextZoneMetaById = new Map(widgetMeta.zones);

          prevFocusedIdBeforeFinalize = this.focusState.focusedId;
          this.focusState = finalizeFocusWithPreCollectedMetadata(
            this.focusState,
            widgetMeta.focusableIds,
            widgetMeta.zones,
            widgetMeta.traps,
          );
          this.baseFocusList = widgetMeta.focusableIds;
          this.baseEnabledById = widgetMeta.enabledById;
          this.focusList = widgetMeta.focusableIds;
          this.enabledById = widgetMeta.enabledById;
          this.pressableIds = widgetMeta.pressableIds;
          this.inputById = widgetMeta.inputById;
          this.traps = widgetMeta.traps;
          this.zoneMetaById = nextZoneMetaById;
          if (PERF_DETAIL_ENABLED) perfMarkEnd("metadata_collect", metaToken);
        }
      }

      if (doCommit && (hasRoutingWidgets || hadRoutingWidgets)) {
        didRoutingRebuild = true;
        this.hadRoutingWidgets = hasRoutingWidgets;
        const routingToken = PERF_DETAIL_ENABLED ? perfMarkStart("routing_rebuild") : 0;
        const getRectForInstance = (instanceId: InstanceId) =>
          this._pooledRectByInstanceId.get(instanceId) ?? ZERO_RECT;

        // Rebuild complex widget metadata maps (id -> props) for routing.
        // Use pooled Sets to track previous IDs for GC cleanup detection (avoids per-frame allocations).
        this._pooledPrevTreeIds.clear();
        for (const k of this.treeById.keys()) this._pooledPrevTreeIds.add(k);
        this._pooledPrevDropdownIds.clear();
        for (const k of this.dropdownById.keys()) this._pooledPrevDropdownIds.add(k);
        this._pooledPrevVirtualListIds.clear();
        for (const k of this.virtualListById.keys()) this._pooledPrevVirtualListIds.add(k);
        this._pooledPrevTableIds.clear();
        for (const k of this.tableById.keys()) this._pooledPrevTableIds.add(k);
        this._pooledPrevTreeStoreIds.clear();
        for (const k of this.treeById.keys()) this._pooledPrevTreeStoreIds.add(k);
        for (const k of this.filePickerById.keys()) this._pooledPrevTreeStoreIds.add(k);
        for (const k of this.fileTreeExplorerById.keys()) this._pooledPrevTreeStoreIds.add(k);
        this._pooledPrevCommandPaletteIds.clear();
        for (const k of this.commandPaletteById.keys()) this._pooledPrevCommandPaletteIds.add(k);
        this._pooledPrevToolApprovalDialogIds.clear();
        for (const k of this.toolApprovalDialogById.keys())
          this._pooledPrevToolApprovalDialogIds.add(k);
        this._pooledPrevDiffViewerIds.clear();
        for (const k of this.diffViewerById.keys()) this._pooledPrevDiffViewerIds.add(k);
        this._pooledPrevLogsConsoleIds.clear();
        for (const k of this.logsConsoleById.keys()) this._pooledPrevLogsConsoleIds.add(k);

        this.virtualListById.clear();
        this.buttonById.clear();
        this.tableById.clear();
        this.treeById.clear();
        this.dropdownById.clear();
        this.selectById.clear();
        this.checkboxById.clear();
        this.radioGroupById.clear();
        this.commandPaletteById.clear();
        this.filePickerById.clear();
        this.fileTreeExplorerById.clear();
        this.splitPaneById.clear();
        this.codeEditorById.clear();
        this.diffViewerById.clear();
        this.toolApprovalDialogById.clear();
        this.logsConsoleById.clear();

        // Rebuild overlay routing state using pooled collections.
        this.layerRegistry.clear();
        this._pooledCloseOnEscape.clear();
        this._pooledCloseOnBackdrop.clear();
        this._pooledOnClose.clear();
        this._pooledDropdownStack.length = 0;
        this._pooledToastContainers.length = 0;
        let overlaySeq = 0;

        this._pooledRuntimeStack.length = 0;
        this._pooledRuntimeStack.push(this.committedRoot);
        while (this._pooledRuntimeStack.length > 0) {
          const cur = this._pooledRuntimeStack.pop();
          if (!cur) continue;

          const v = cur.vnode;
          switch (v.kind) {
            case "dropdown": {
              const p = v.props as DropdownProps;
              this.dropdownById.set(p.id, p);
              this._pooledDropdownStack.push(p.id);
              break;
            }
            case "button": {
              const p = v.props as ButtonProps;
              this.buttonById.set(p.id, p);
              break;
            }
            case "virtualList": {
              const p = v.props as VirtualListProps<unknown>;
              this.virtualListById.set(p.id, p);
              break;
            }
            case "table": {
              const p = v.props as TableProps<unknown>;
              this.tableById.set(p.id, p);
              break;
            }
            case "tree": {
              const p = v.props as TreeProps<unknown>;
              this.treeById.set(p.id, p);
              break;
            }
            case "commandPalette": {
              const p = v.props as CommandPaletteProps;
              this.commandPaletteById.set(p.id, p);
              break;
            }
            case "filePicker": {
              const p = v.props as FilePickerProps;
              this.filePickerById.set(p.id, p);
              break;
            }
            case "fileTreeExplorer": {
              const p = v.props as FileTreeExplorerProps;
              this.fileTreeExplorerById.set(p.id, p);
              break;
            }
            case "splitPane": {
              const p = v.props as SplitPaneProps;
              this.splitPaneById.set(p.id, p);
              break;
            }
            case "codeEditor": {
              const p = v.props as CodeEditorProps;
              this.codeEditorById.set(p.id, p);
              break;
            }
            case "diffViewer": {
              const p = v.props as DiffViewerProps;
              this.diffViewerById.set(p.id, p);
              break;
            }
            case "toolApprovalDialog": {
              const p = v.props as ToolApprovalDialogProps;
              this.toolApprovalDialogById.set(p.id, p);
              break;
            }
            case "logsConsole": {
              const p = v.props as LogsConsoleProps;
              this.logsConsoleById.set(p.id, p);
              break;
            }
            case "toastContainer": {
              const p = v.props as ToastContainerProps;
              const rect = getRectForInstance(cur.instanceId);
              this._pooledToastContainers.push({ rect, props: p });
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
                const rect = getRectForInstance(cur.instanceId);
                const zIndex = overlaySeq++;
                const canClose = p.closeOnEscape !== false;
                this._pooledCloseOnEscape.set(id, canClose);
                this._pooledCloseOnBackdrop.set(id, p.closeOnBackdrop !== false);
                const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
                if (cb) this._pooledOnClose.set(id, cb);
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
                this.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
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
                const rect = getRectForInstance(cur.instanceId);
                const baseZ =
                  typeof p.zIndex === "number" && Number.isFinite(p.zIndex)
                    ? Math.trunc(p.zIndex)
                    : null;
                const zIndex = encodeLayerZIndex(baseZ, overlaySeq++);
                const modal = p.modal === true;
                const canClose = p.closeOnEscape !== false;
                this._pooledCloseOnEscape.set(id, canClose);
                this._pooledCloseOnBackdrop.set(id, false);
                const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
                if (cb) this._pooledOnClose.set(id, cb);
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
                this.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
              }
              break;
            }
            case "select": {
              this.selectById.set((v.props as SelectProps).id, v.props as SelectProps);
              break;
            }
            case "checkbox": {
              this.checkboxById.set((v.props as CheckboxProps).id, v.props as CheckboxProps);
              break;
            }
            case "radioGroup": {
              this.radioGroupById.set((v.props as RadioGroupProps).id, v.props as RadioGroupProps);
              break;
            }
            default:
              break;
          }

          for (let i = cur.children.length - 1; i >= 0; i--) {
            const c = cur.children[i];
            if (c) this._pooledRuntimeStack.push(c);
          }
        }

        this.layerStack = Object.freeze(this.layerRegistry.getAll().map((l) => l.id));
        this.closeOnEscapeByLayerId = this._pooledCloseOnEscape;
        this.closeOnBackdropByLayerId = this._pooledCloseOnBackdrop;
        this.onCloseByLayerId = this._pooledOnClose;
        this.dropdownStack = Object.freeze(this._pooledDropdownStack.slice());
        this.toastContainers = Object.freeze(this._pooledToastContainers.slice());

        // Build toast action maps using pooled collections.
        this._pooledToastActionByFocusId.clear();
        this._pooledToastFocusableActionIds.length = 0;

        for (const tc of this._pooledToastContainers) {
          if (!tc) continue;
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
            this._pooledToastActionByFocusId.set(fid, toast.action.onAction);
            this._pooledToastFocusableActionIds.push(fid);
          }
        }

        this.toastActionByFocusId = this._pooledToastActionByFocusId;
        this.toastFocusableActionIds = Object.freeze(this._pooledToastFocusableActionIds.slice());

        const baseFocusList = this.baseFocusList;
        const baseEnabledById = this.baseEnabledById;
        this.focusList = baseFocusList;
        this.enabledById = baseEnabledById;

        if (this._pooledToastFocusableActionIds.length > 0) {
          this.focusList = Object.freeze([...baseFocusList, ...this.toastFocusableActionIds]);
          const enabled = new Map(baseEnabledById);
          for (const id of this.toastFocusableActionIds) enabled.set(id, true);
          this.enabledById = enabled;
        }

        const preferredToastFocus =
          prevFocusedIdBeforeFinalize !== null &&
          parseToastActionFocusId(prevFocusedIdBeforeFinalize) !== null
            ? prevFocusedIdBeforeFinalize
            : null;
        if (preferredToastFocus && this._pooledToastActionByFocusId.has(preferredToastFocus)) {
          this.focusState = Object.freeze({
            ...this.focusState,
            focusedId: preferredToastFocus,
            activeZoneId: null,
          });
        } else {
          const curFocus = this.focusState.focusedId;
          if (
            curFocus !== null &&
            parseToastActionFocusId(curFocus) !== null &&
            !this._pooledToastActionByFocusId.has(curFocus)
          ) {
            this.focusState = Object.freeze({
              ...this.focusState,
              focusedId: null,
              activeZoneId: null,
            });
          }
        }

        rebuildRenderCaches({
          tableById: this.tableById,
          logsConsoleById: this.logsConsoleById,
          diffViewerById: this.diffViewerById,
          codeEditorById: this.codeEditorById,
          tableRenderCacheById: this.tableRenderCacheById,
          logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
          diffRenderCacheById: this.diffRenderCacheById,
          codeEditorRenderCacheById: this.codeEditorRenderCacheById,
          emptyStringArray: EMPTY_STRING_ARRAY,
        });
        if (PERF_DETAIL_ENABLED) perfMarkEnd("routing_rebuild", routingToken);
      } else if (doLayout && hadRoutingWidgets) {
        // Layout-only turns (e.g. resize) keep the committed widget maps intact.
        // Rebuild only rect-dependent overlay/ toast routing state.
        const routingToken = PERF_DETAIL_ENABLED ? perfMarkStart("routing_rebuild") : 0;
        const getRectForInstance = (instanceId: InstanceId) =>
          this._pooledRectByInstanceId.get(instanceId) ?? ZERO_RECT;

        this.layerRegistry.clear();
        this._pooledCloseOnEscape.clear();
        this._pooledCloseOnBackdrop.clear();
        this._pooledOnClose.clear();
        this._pooledToastContainers.length = 0;
        let overlaySeq = 0;

        this._pooledRuntimeStack.length = 0;
        this._pooledRuntimeStack.push(this.committedRoot);
        while (this._pooledRuntimeStack.length > 0) {
          const cur = this._pooledRuntimeStack.pop();
          if (!cur) continue;

          const v = cur.vnode;
          switch (v.kind) {
            case "toastContainer": {
              const p = v.props as ToastContainerProps;
              const rect = getRectForInstance(cur.instanceId);
              this._pooledToastContainers.push({ rect, props: p });
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
                const rect = getRectForInstance(cur.instanceId);
                const zIndex = overlaySeq++;
                const canClose = p.closeOnEscape !== false;
                this._pooledCloseOnEscape.set(id, canClose);
                this._pooledCloseOnBackdrop.set(id, p.closeOnBackdrop !== false);
                const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
                if (cb) this._pooledOnClose.set(id, cb);
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
                this.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
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
                const rect = getRectForInstance(cur.instanceId);
                const baseZ =
                  typeof p.zIndex === "number" && Number.isFinite(p.zIndex)
                    ? Math.trunc(p.zIndex)
                    : null;
                const zIndex = encodeLayerZIndex(baseZ, overlaySeq++);
                const modal = p.modal === true;
                const canClose = p.closeOnEscape !== false;
                this._pooledCloseOnEscape.set(id, canClose);
                this._pooledCloseOnBackdrop.set(id, false);
                const cb = typeof p.onClose === "function" ? (p.onClose as () => void) : undefined;
                if (cb) this._pooledOnClose.set(id, cb);
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
                this.layerRegistry.register(cb ? { ...layerInput, onClose: cb } : layerInput);
              }
              break;
            }
            default:
              break;
          }

          for (let i = cur.children.length - 1; i >= 0; i--) {
            const c = cur.children[i];
            if (c) this._pooledRuntimeStack.push(c);
          }
        }

        this.layerStack = Object.freeze(this.layerRegistry.getAll().map((l) => l.id));
        this.closeOnEscapeByLayerId = this._pooledCloseOnEscape;
        this.closeOnBackdropByLayerId = this._pooledCloseOnBackdrop;
        this.onCloseByLayerId = this._pooledOnClose;
        this.toastContainers = Object.freeze(this._pooledToastContainers.slice());

        this._pooledToastActionByFocusId.clear();
        this._pooledToastFocusableActionIds.length = 0;

        for (const tc of this._pooledToastContainers) {
          if (!tc) continue;
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
            this._pooledToastActionByFocusId.set(fid, toast.action.onAction);
            this._pooledToastFocusableActionIds.push(fid);
          }
        }

        this.toastActionByFocusId = this._pooledToastActionByFocusId;
        this.toastFocusableActionIds = Object.freeze(this._pooledToastFocusableActionIds.slice());

        const baseFocusList = this.baseFocusList;
        const baseEnabledById = this.baseEnabledById;
        this.focusList = baseFocusList;
        this.enabledById = baseEnabledById;

        if (this._pooledToastFocusableActionIds.length > 0) {
          this.focusList = Object.freeze([...baseFocusList, ...this.toastFocusableActionIds]);
          const enabled = new Map(baseEnabledById);
          for (const id of this.toastFocusableActionIds) enabled.set(id, true);
          this.enabledById = enabled;
        }

        const curFocus = this.focusState.focusedId;
        if (
          curFocus !== null &&
          parseToastActionFocusId(curFocus) !== null &&
          !this._pooledToastActionByFocusId.has(curFocus)
        ) {
          this.focusState = Object.freeze({
            ...this.focusState,
            focusedId: null,
            activeZoneId: null,
          });
        }

        if (PERF_DETAIL_ENABLED) perfMarkEnd("routing_rebuild", routingToken);
      }

      if (doCommit && !didRoutingRebuild) {
        this.hadRoutingWidgets = hasRoutingWidgets;
      }

      if (doCommit && didRoutingRebuild) {
        // Precompute flattened file trees for filePicker/fileTreeExplorer to avoid per-frame allocations.
        for (const fp of this.filePickerById.values()) {
          const s = this.treeStore.get(fp.id);
          if (!readFileNodeFlatCache(s, fp.data, fp.expandedPaths)) {
            const next = flattenTree(
              fp.data,
              fileNodeGetKey,
              fileNodeGetChildren,
              fileNodeHasChildren,
              fp.expandedPaths,
            );
            this.treeStore.set(fp.id, {
              flatCache: makeFileNodeFlatCache(fp.data, fp.expandedPaths, next),
            });
          }
        }
        for (const fte of this.fileTreeExplorerById.values()) {
          const s = this.treeStore.get(fte.id);
          if (!readFileNodeFlatCache(s, fte.data, fte.expanded)) {
            const next = flattenTree(
              fte.data,
              fileNodeGetKey,
              fileNodeGetChildren,
              fileNodeHasChildren,
              fte.expanded,
            );
            this.treeStore.set(fte.id, {
              flatCache: makeFileNodeFlatCache(fte.data, fte.expanded, next),
            });
          }
        }

        // Garbage collect per-dropdown routing state for dropdowns that were removed.
        for (const prevDropdownId of this._pooledPrevDropdownIds) {
          if (!this.dropdownById.has(prevDropdownId)) {
            this.dropdownSelectedIndexById.delete(prevDropdownId);
          }
        }

        // Garbage collect local state for virtual lists that were removed.
        for (const prevId of this._pooledPrevVirtualListIds) {
          if (!this.virtualListById.has(prevId)) {
            this.virtualListStore.delete(prevId);
            if (this.pressedVirtualList?.id === prevId) {
              this.pressedVirtualList = null;
            }
          }
        }

        // Garbage collect local state for tables that were removed.
        for (const prevId of this._pooledPrevTableIds) {
          if (!this.tableById.has(prevId)) {
            this.tableStore.delete(prevId);
          }
        }

        // Garbage collect per-tree lazy-loading caches for trees that were removed.
        for (const prevTreeId of this._pooledPrevTreeIds) {
          if (!this.treeById.has(prevTreeId)) {
            this.loadedTreeChildrenByTreeId.delete(prevTreeId);
            const prefix = `${prevTreeId}\u0000`;
            for (const tokenKey of this.treeLoadTokenByTreeAndKey.keys()) {
              if (tokenKey.startsWith(prefix)) this.treeLoadTokenByTreeAndKey.delete(tokenKey);
            }
          }
        }

        // Garbage collect treeStore entries for tree-like widgets that were removed.
        for (const prevId of this._pooledPrevTreeStoreIds) {
          if (
            !this.treeById.has(prevId) &&
            !this.filePickerById.has(prevId) &&
            !this.fileTreeExplorerById.has(prevId)
          ) {
            this.treeStore.delete(prevId);
          }
        }

        // Garbage collect command palette async state for palettes that were removed.
        for (const prevId of this._pooledPrevCommandPaletteIds) {
          if (!this.commandPaletteById.has(prevId)) {
            this.commandPaletteItemsById.delete(prevId);
            this.commandPaletteLoadingById.delete(prevId);
            this.commandPaletteFetchTokenById.delete(prevId);
            this.commandPaletteLastQueryById.delete(prevId);
            this.commandPaletteLastSourcesRefById.delete(prevId);
          }
        }

        for (const prevId of this._pooledPrevToolApprovalDialogIds) {
          if (!this.toolApprovalDialogById.has(prevId)) {
            this.toolApprovalFocusedActionById.delete(prevId);
          }
        }

        for (const prevId of this._pooledPrevDiffViewerIds) {
          if (!this.diffViewerById.has(prevId)) {
            this.diffViewerFocusedHunkById.delete(prevId);
            this.diffViewerExpandedHunksById.delete(prevId);
          }
        }

        for (const prevId of this._pooledPrevLogsConsoleIds) {
          if (!this.logsConsoleById.has(prevId)) {
            this.logsConsoleLastGTimeById.delete(prevId);
          }
        }
      }

      if (doCommit) {
        // Reset per-commit working values to the committed props.value, and normalize cursor (docs/18).
        for (const meta of this.inputById.values()) {
          const instanceId = meta.instanceId;
          this.inputWorkingValueByInstanceId.set(instanceId, meta.value);
          const prev = this.inputCursorByInstanceId.get(instanceId);
          const init = prev === undefined ? meta.value.length : prev;
          this.inputCursorByInstanceId.set(instanceId, normalizeInputCursor(meta.value, init));
        }
      }

      if ((doCommit || doLayout) && this.pressedId !== null) {
        if (this.enabledById.get(this.pressedId) !== true) {
          this.pressedId = null;
        }
      }

      if (this.focusState.activeZoneId !== prevActiveZoneIdBeforeSubmit) {
        this.invokeFocusZoneCallbacks(
          prevActiveZoneIdBeforeSubmit,
          this.focusState.activeZoneId,
          prevZoneMetaByIdBeforeSubmit,
          this.zoneMetaById,
        );
      }

      // Build cursor info for v2 protocol
      const cursorInfo: CursorInfo | undefined = this.useV2Cursor
        ? {
            cursorByInstanceId: this.inputCursorByInstanceId,
            shape: this.cursorShape,
            blink: this.cursorBlink,
          }
        : undefined;

      if (doCommit) {
        kickoffCommandPaletteItemFetches(
          this.commandPaletteById,
          this.commandPaletteItemsById,
          this.commandPaletteLoadingById,
          this.commandPaletteFetchTokenById,
          this.commandPaletteLastQueryById,
          this.commandPaletteLastSourcesRefById,
          this.requestRender,
        );
      }

      const tick = this.renderTick;
      this.renderTick = (this.renderTick + 1) >>> 0;

      const renderToken = perfMarkStart("render");
      let usedIncrementalRender = false;
      if (this.shouldAttemptIncrementalRender(doLayout, viewport, theme)) {
        this._pooledDamageRects.length = 0;
        let missingDamageRect = false;

        if (doCommit) {
          if (!identityDamageFromCommit) {
            missingDamageRect = true;
          } else {
            for (const instanceId of identityDamageFromCommit.changedInstanceIds) {
              if (!this.appendDamageRectForInstanceId(instanceId)) {
                missingDamageRect = true;
                break;
              }
            }
            if (!missingDamageRect) {
              for (const instanceId of identityDamageFromCommit.removedInstanceIds) {
                if (!this.appendDamageRectForInstanceId(instanceId)) {
                  missingDamageRect = true;
                  break;
                }
              }
            }
          }
        } else {
          this.collectSpinnerDamageRects(this.committedRoot, this.layoutTree);
        }

        const prevFocusedId = this._lastRenderedFocusedId;
        const nextFocusedId = this.focusState.focusedId;
        if (!missingDamageRect && prevFocusedId !== nextFocusedId) {
          if (prevFocusedId !== null && !this.appendDamageRectForId(prevFocusedId)) {
            missingDamageRect = true;
          }
          if (
            !missingDamageRect &&
            nextFocusedId !== null &&
            !this.appendDamageRectForId(nextFocusedId)
          ) {
            missingDamageRect = true;
          }
        }

        if (!missingDamageRect) {
          const damageRects = this.normalizeDamageRects(viewport);
          if (damageRects.length > 0 && !this.isDamageAreaTooLarge(viewport)) {
            for (const damageRect of damageRects) {
              this.builder.fillRect(
                damageRect.x,
                damageRect.y,
                damageRect.w,
                damageRect.h,
                DEFAULT_BASE_STYLE,
              );
            }
            for (const damageRect of damageRects) {
              this.builder.pushClip(damageRect.x, damageRect.y, damageRect.w, damageRect.h);
              renderTree(
                this.builder,
                this.focusState,
                this.layoutTree,
                this._pooledRectById,
                viewport,
                theme,
                tick,
                DEFAULT_BASE_STYLE,
                this.committedRoot,
                cursorInfo,
                this.virtualListStore,
                this.tableStore,
                this.treeStore,
                this.loadedTreeChildrenByTreeId,
                this.commandPaletteItemsById,
                this.commandPaletteLoadingById,
                this.toolApprovalFocusedActionById,
                this.dropdownSelectedIndexById,
                this.diffViewerFocusedHunkById,
                this.diffViewerExpandedHunksById,
                this.tableRenderCacheById,
                this.logsConsoleRenderCacheById,
                this.diffRenderCacheById,
                this.codeEditorRenderCacheById,
                { damageRect },
              );
              this.builder.popClip();
            }
            this.emitIncrementalCursor(cursorInfo);
            usedIncrementalRender = true;
          }
        }
      }

      if (!usedIncrementalRender) {
        renderToDrawlist({
          tree: this.committedRoot,
          layout: this.layoutTree,
          viewport,
          focusState: this.focusState,
          builder: this.builder,
          tick,
          theme,
          cursorInfo,
          virtualListStore: this.virtualListStore,
          tableStore: this.tableStore,
          treeStore: this.treeStore,
          loadedTreeChildrenById: this.loadedTreeChildrenByTreeId,
          commandPaletteItemsById: this.commandPaletteItemsById,
          commandPaletteLoadingById: this.commandPaletteLoadingById,
          toolApprovalFocusedActionById: this.toolApprovalFocusedActionById,
          dropdownSelectedIndexById: this.dropdownSelectedIndexById,
          diffViewerFocusedHunkById: this.diffViewerFocusedHunkById,
          diffViewerExpandedHunksById: this.diffViewerExpandedHunksById,
          layoutIndex: this._pooledRectByInstanceId,
          idRectIndex: this._pooledRectById,
          tableRenderCacheById: this.tableRenderCacheById,
          logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
          diffRenderCacheById: this.diffRenderCacheById,
          codeEditorRenderCacheById: this.codeEditorRenderCacheById,
        });
      }
      perfMarkEnd("render", renderToken);

      const buildToken = perfMarkStart("drawlist_build");
      const built = this.builder.build();
      perfMarkEnd("drawlist_build", buildToken);
      if (!built.ok) {
        return {
          ok: false,
          code: "ZRUI_DRAWLIST_BUILD_ERROR",
          detail: `${built.error.code}: ${built.error.detail}`,
        };
      }
      this.snapshotRenderedFrameState(viewport, theme, doLayout);

      // Render hooks are for preventing re-entrant app API calls during user render.
      hooks.exitRender();
      entered = false;

      // Run composite effects after a successful commit+render build.
      if (commitRes) {
        const effectsToken = PERF_DETAIL_ENABLED ? perfMarkStart("effects") : 0;
        try {
          runPendingEffects(commitRes.pendingEffects);
        } catch (e: unknown) {
          return { ok: false, code: "ZRUI_USER_CODE_THROW", detail: describeThrown(e) };
        } finally {
          if (PERF_DETAIL_ENABLED) perfMarkEnd("effects", effectsToken);
        }
      }

      try {
        const backendToken = PERF_ENABLED ? perfMarkStart("backend_request") : 0;
        try {
          const inFlight = this.backend.requestFrame(built.bytes);
          return { ok: true, inFlight };
        } finally {
          if (PERF_ENABLED) perfMarkEnd("backend_request", backendToken);
        }
      } catch (e: unknown) {
        return { ok: false, code: "ZRUI_BACKEND_ERROR", detail: describeThrown(e) };
      }
    } catch (e: unknown) {
      return { ok: false, code: "ZRUI_USER_CODE_THROW", detail: describeThrown(e) };
    } finally {
      if (entered) hooks.exitRender();
    }
  }
}
