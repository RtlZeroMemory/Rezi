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
 * Cursor Protocol:
 *   - Emits SET_CURSOR for focused Input widgets with proper position
 *
 * @see docs/guide/runtime-and-layout.md
 * @see docs/guide/lifecycle-and-updates.md
 */

import type { CursorShape } from "../abi.js";
import { BACKEND_RAW_WRITE_MARKER, type BackendRawWrite, type RuntimeBackend } from "../backend.js";
import { CURSOR_DEFAULTS } from "../cursor/index.js";
import {
  type DrawlistBuilderV1,
  type DrawlistBuilderV2,
  type DrawlistBuilderV3,
  createDrawlistBuilderV2,
  createDrawlistBuilderV3,
} from "../drawlist/index.js";
import type { ZrevEvent } from "../events.js";
import {
  buildTrie,
  matchKey,
  modsFromBitmask,
  parseKeySequence,
  resetChordState,
  sequenceToString,
} from "../keybindings/index.js";
import type { ChordState, KeyBinding, ParsedKey } from "../keybindings/index.js";
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
import type { LayoutOverflowMetadata } from "../layout/constraints.js";
import { computeDropdownGeometry } from "../layout/dropdownGeometry.js";
import {
  computeDirtyLayoutSet,
  instanceDirtySetToVNodeDirtySet,
} from "../layout/engine/dirtySet.js";
import { hitTestAnyId, hitTestFocusable } from "../layout/hitTest.js";
import { type LayoutTree, layout } from "../layout/layout.js";
import {
  type ResponsiveBreakpointThresholds,
  getResponsiveViewport,
  normalizeBreakpointThresholds,
  setResponsiveViewport,
} from "../layout/responsive.js";
import { measureTextCells } from "../layout/textMeasure.js";
import type { Rect } from "../layout/types.js";
import { PERF_DETAIL_ENABLED, PERF_ENABLED, perfMarkEnd, perfMarkStart } from "../perf/perf.js";
import { type CursorInfo, renderToDrawlist } from "../renderer/renderToDrawlist.js";
import { getRuntimeNodeDamageRect } from "../renderer/renderToDrawlist/damageBounds.js";
import { renderTree } from "../renderer/renderToDrawlist/renderTree.js";
import { DEFAULT_BASE_STYLE } from "../renderer/renderToDrawlist/textStyle.js";
import {
  type CommitOk,
  type PendingExitAnimation,
  type RuntimeInstance,
  commitVNodeTree,
} from "../runtime/commit.js";
import {
  type FocusManagerState,
  createFocusManagerState,
  finalizeFocusWithPreCollectedMetadata,
} from "../runtime/focus.js";
import {
  type InputEditorSnapshot,
  type InputSelection,
  type InputUndoStack,
  applyInputEditEvent,
  getInputSelectionText,
  normalizeInputCursor,
  normalizeInputSelection,
} from "../runtime/inputEditor.js";
import { type InstanceId, createInstanceIdAllocator } from "../runtime/instance.js";
import {
  createCompositeInstanceRegistry,
  runPendingCleanups,
  runPendingEffects,
} from "../runtime/instances.js";
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
  routeWheel,
} from "../runtime/router.js";
import {
  type CollectedTrap,
  type CollectedZone,
  type FocusInfo,
  type InputMeta,
  type WidgetMetadataCollector,
  createWidgetMetadataCollector,
} from "../runtime/widgetMeta.js";
import { DEFAULT_TERMINAL_PROFILE, type TerminalProfile } from "../terminalProfile.js";
import { getColorTokens } from "../theme/extract.js";
import type { Theme } from "../theme/theme.js";
import { deleteRange, getSelectedText, insertText } from "../widgets/codeEditor.js";
import { getHunkScrollPosition, navigateHunk } from "../widgets/diffViewer.js";
import { applyFilters } from "../widgets/logsConsole.js";
import { adjustSliderValue, normalizeSliderState } from "../widgets/slider.js";
import {
  computePanelCellSizes,
  handleDividerDrag,
  sizesToPercentages,
} from "../widgets/splitPane.js";
import { computeSelection, distributeColumnWidths } from "../widgets/table.js";
import { TOAST_HEIGHT, getToastActionFocusId, parseToastActionFocusId } from "../widgets/toast.js";
import { type FlattenedNode, flattenTree } from "../widgets/tree.js";
import type { VNode } from "../widgets/types.js";
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
} from "../widgets/types.js";
import {
  computeVisibleRange,
  getTotalHeight,
  resolveVirtualListItemHeightSpec,
} from "../widgets/virtualList.js";
import {
  EMPTY_WIDGET_RUNTIME_BREADCRUMBS,
  type RuntimeBreadcrumbCursorSummary,
  type RuntimeBreadcrumbDamageMode,
  type WidgetRuntimeBreadcrumbSnapshot,
} from "./runtimeBreadcrumbs.js";
import type { ViewFn } from "./types.js";
import {
  type ExitTransitionRenderNode,
  type ExitTransitionTrack,
  type PositionTransitionTrack,
  readContainerOpacity as readContainerOpacityImpl,
  rebuildAnimatedRectOverrides as rebuildAnimatedRectOverridesImpl,
  recomputeAnimatedWidgetPresence as recomputeAnimatedWidgetPresenceImpl,
  refreshPositionTransitionTracks as refreshPositionTransitionTracksImpl,
  sampleExitAnimations as sampleExitAnimationsImpl,
  scheduleExitAnimations as scheduleExitAnimationsImpl,
} from "./widgetRenderer/animationTracks.js";
import { routeCodeEditorKeyDown } from "./widgetRenderer/codeEditorRouting.js";
import {
  kickoffCommandPaletteItemFetches,
  routeCommandPaletteKeyDown,
} from "./widgetRenderer/commandPaletteRouting.js";
import {
  emitIncrementalCursor as emitIncrementalCursorImpl,
  resolveRuntimeCursorSummary as resolveRuntimeCursorSummaryImpl,
  snapshotRenderedFrameState as snapshotRenderedFrameStateImpl,
  updateRuntimeBreadcrumbSnapshot as updateRuntimeBreadcrumbSnapshotImpl,
} from "./widgetRenderer/cursorBreadcrumbs.js";
import {
  type IdentityDiffDamageResult,
  appendDamageRectForId as appendDamageRectForIdImpl,
  appendDamageRectForInstanceId as appendDamageRectForInstanceIdImpl,
  appendDamageRectsForFocusAnnouncers as appendDamageRectsForFocusAnnouncersImpl,
  clearRuntimeDirtyNodes as clearRuntimeDirtyNodesImpl,
  collectSelfDirtyInstanceIds as collectSelfDirtyInstanceIdsImpl,
  collectSpinnerDamageRects as collectSpinnerDamageRectsImpl,
  collectSubtreeDamageAndRouting as collectSubtreeDamageAndRoutingImpl,
  computeIdentityDiffDamage as computeIdentityDiffDamageImpl,
  isDamageAreaTooLarge as isDamageAreaTooLargeImpl,
  markLayoutDirtyNodes as markLayoutDirtyNodesImpl,
  markTransientDirtyNodes as markTransientDirtyNodesImpl,
  normalizeDamageRects as normalizeDamageRectsImpl,
  propagateDirtyFromPredicate as propagateDirtyFromPredicateImpl,
  refreshDamageRectIndexesForLayoutSkippedCommit as refreshDamageRectIndexesForLayoutSkippedCommitImpl,
  shouldAttemptIncrementalRender as shouldAttemptIncrementalRenderImpl,
} from "./widgetRenderer/damageTracking.js";
import {
  describeLayoutNode as describeLayoutNodeImpl,
  emitDevLayoutWarnings as emitDevLayoutWarningsImpl,
  warnLayoutIssue as warnLayoutIssueImpl,
  warnShortcutIssue as warnShortcutIssueImpl,
} from "./widgetRenderer/devWarnings.js";
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
  applyInputSnapshot as applyInputSnapshotImpl,
  getInputUndoStack as getInputUndoStackImpl,
  readInputSnapshot as readInputSnapshotImpl,
  routeInputEditingEvent,
} from "./widgetRenderer/inputEditing.js";
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
} from "./widgetRenderer/keyboardRouting.js";
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
} from "./widgetRenderer/mouseRouting.js";
import {
  type OverlayShortcutBinding,
  type OverlayShortcutContext,
  type OverlayShortcutOwner,
  type OverlayShortcutTarget,
  invokeOverlayShortcutTarget as invokeOverlayShortcutTargetImpl,
  rebuildOverlayShortcutBindings as rebuildOverlayShortcutBindingsImpl,
  registerOverlayShortcut as registerOverlayShortcutImpl,
  routeOverlayShortcut as routeOverlayShortcutImpl,
  selectCommandPaletteShortcutItem as selectCommandPaletteShortcutItemImpl,
  selectDropdownShortcutItem as selectDropdownShortcutItemImpl,
} from "./widgetRenderer/overlayShortcuts.js";
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
const UTF8_ENCODER = new TextEncoder();
const BASE64_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function encodeBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64_TABLE[(triple >> 18) & 0x3f] ?? "";
    out += BASE64_TABLE[(triple >> 12) & 0x3f] ?? "";
    out += i + 1 < bytes.length ? (BASE64_TABLE[(triple >> 6) & 0x3f] ?? "") : "=";
    out += i + 2 < bytes.length ? (BASE64_TABLE[triple & 0x3f] ?? "") : "=";
  }
  return out;
}

function buildOsc52ClipboardSequence(text: string): string {
  if (text.length === 0) return "";
  const encoded = encodeBase64(UTF8_ENCODER.encode(text));
  if (encoded.length === 0) return "";
  return `\u001b]52;c;${encoded}\u0007`;
}

function getBackendRawWriter(backend: RuntimeBackend): BackendRawWrite | null {
  const marker = (
    backend as RuntimeBackend & Readonly<Partial<Record<typeof BACKEND_RAW_WRITE_MARKER, unknown>>>
  )[BACKEND_RAW_WRITE_MARKER];
  return typeof marker === "function" ? (marker as BackendRawWrite) : null;
}

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
  /** Monotonic frame timestamp in milliseconds for animation sampling. */
  nowMs?: number;
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

/**
 * Focus snapshot used by app-level page routing for back-navigation restore.
 */
export type WidgetFocusSnapshot = Readonly<{
  focusState: FocusManagerState;
  focusList: readonly string[];
  baseFocusList: readonly string[];
  enabledById: ReadonlyMap<string, boolean>;
  baseEnabledById: ReadonlyMap<string, boolean>;
  pressableIds: ReadonlySet<string>;
  traps: ReadonlyMap<string, CollectedTrap>;
  zoneMetaById: ReadonlyMap<string, CollectedZone>;
}>;

/** Format thrown value for error message. */
function describeThrown(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  return String(v);
}

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
const DEFAULT_POSITION_TRANSITION_DURATION_MS = 180;
const EMPTY_FOCUS_ERRORS: readonly string[] = Object.freeze([]);
const EMPTY_FOCUS_INFO: FocusInfo = Object.freeze({
  id: null,
  kind: null,
  accessibleLabel: null,
  visibleLabel: null,
  required: false,
  errors: EMPTY_FOCUS_ERRORS,
  announcement: null,
});
const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
const DEV_MODE = NODE_ENV !== "production";
const LAYOUT_WARNINGS_ENV_RAW =
  (
    globalThis as {
      process?: { env?: { REZI_LAYOUT_WARNINGS?: string; ZRUI_LAYOUT_WARNINGS?: string } };
    }
  ).process?.env?.REZI_LAYOUT_WARNINGS ??
  (
    globalThis as {
      process?: { env?: { REZI_LAYOUT_WARNINGS?: string; ZRUI_LAYOUT_WARNINGS?: string } };
    }
  ).process?.env?.ZRUI_LAYOUT_WARNINGS ??
  "";
const LAYOUT_WARNINGS_ENV = LAYOUT_WARNINGS_ENV_RAW.toLowerCase();
const DEV_LAYOUT_WARNINGS =
  DEV_MODE && (LAYOUT_WARNINGS_ENV === "1" || LAYOUT_WARNINGS_ENV === "true");

function warnDev(message: string): void {
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

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

function isNonEmptyRect(rect: Rect | undefined): rect is Rect {
  return rect !== undefined && rect.w > 0 && rect.h > 0;
}

function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

function monotonicNowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = perf?.now;
  if (typeof perfNow === "function") return perfNow.call(perf);
  return Date.now();
}

function isV2Builder(builder: DrawlistBuilderV1 | DrawlistBuilderV2): builder is DrawlistBuilderV2 {
  return typeof (builder as DrawlistBuilderV2).setCursor === "function";
}

function cloneFocusManagerState(state: FocusManagerState): FocusManagerState {
  return Object.freeze({
    focusedId: state.focusedId,
    activeZoneId: state.activeZoneId,
    ...(state.pendingFocusedId === undefined ? {} : { pendingFocusedId: state.pendingFocusedId }),
    zones: new Map(state.zones),
    trapStack: Object.freeze([...state.trapStack]),
    lastFocusedByZone: new Map(state.lastFocusedByZone),
  });
}

type ErrorBoundaryState = Readonly<{
  code: "ZRUI_USER_CODE_THROW";
  detail: string;
  message: string;
  stack?: string;
}>;

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
  private readonly builder: DrawlistBuilderV1 | DrawlistBuilderV2 | DrawlistBuilderV3;
  private readonly cursorShape: CursorShape;
  private readonly cursorBlink: boolean;
  private collectRuntimeBreadcrumbs: boolean;
  private readonly requestRender: () => void;
  private readonly requestView: () => void;
  private readonly reportUserCodeError: (detail: string) => void;
  private readonly rootPadding: number;
  private readonly breakpointThresholds: ResponsiveBreakpointThresholds;
  private readonly devMode = DEV_LAYOUT_WARNINGS;
  private readonly warnedLayoutIssues = new Set<string>();
  private readonly warnedShortcutIssues = new Set<string>();

  /* --- Committed Tree State --- */
  private committedRoot: RuntimeInstance | null = null;
  private layoutTree: LayoutTree | null = null;
  private renderTick = 0;
  private lastViewport: Viewport = Object.freeze({ cols: 0, rows: 0 });
  private terminalProfile: TerminalProfile = DEFAULT_TERMINAL_PROFILE;

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
  private pressedFileTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null =
    null;
  private lastFileTreeClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null = null;
  private pressedFilePicker: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null =
    null;
  private lastFilePickerClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null = null;
  private pressedTree: Readonly<{ id: string; nodeIndex: number; nodeKey: string }> | null = null;
  private lastTreeClick: Readonly<{
    id: string;
    nodeIndex: number;
    nodeKey: string;
    timeMs: number;
  }> | null = null;
  private traps: ReadonlyMap<string, CollectedTrap> = new Map<string, CollectedTrap>();
  private zoneMetaById: ReadonlyMap<string, CollectedZone> = new Map<string, CollectedZone>();
  private focusInfoById: ReadonlyMap<string, FocusInfo> = new Map<string, FocusInfo>();

  /* --- Instance ID Allocation --- */
  private readonly allocator = createInstanceIdAllocator(1);

  /* --- Composite Widget State --- */
  private readonly compositeRegistry = createCompositeInstanceRegistry();
  private readonly errorBoundaryStatesByPath = new Map<string, ErrorBoundaryState>();
  private readonly retryErrorBoundaryPaths = new Set<string>();
  private readonly committedErrorBoundaryPathsScratch = new Set<string>();

  /* --- Input Widget State --- */
  private inputById: ReadonlyMap<string, InputMeta> = new Map<string, InputMeta>();
  private readonly inputCursorByInstanceId = new Map<InstanceId, number>();
  private readonly inputSelectionByInstanceId = new Map<InstanceId, InputSelection>();
  private readonly inputWorkingValueByInstanceId = new Map<InstanceId, string>();
  private readonly inputUndoByInstanceId = new Map<InstanceId, InputUndoStack>();

  /* --- Complex Widget Local State --- */
  private readonly virtualListStore = createVirtualListStateStore();
  private readonly tableStore = createTableStateStore();
  private readonly treeStore = createTreeStateStore();
  private readonly scrollOverrides = new Map<
    string,
    Readonly<{ scrollX: number; scrollY: number }>
  >();

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
  private readonly linkById = new Map<string, LinkProps>();
  private readonly tableById = new Map<string, TableProps<unknown>>();
  private readonly treeById = new Map<string, TreeProps<unknown>>();
  private readonly dropdownById = new Map<string, DropdownProps>();
  private readonly sliderById = new Map<string, SliderProps>();
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
  private toastActionLabelByFocusId: ReadonlyMap<string, string> = new Map<string, string>();
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
  private hasAnimatedWidgetsInCommittedTree = false;
  private hasActivePositionTransitions = false;
  private hasActiveExitTransitions = false;
  private hasViewportAwareCompositesInCommittedTree = false;
  private readonly positionTransitionTrackByInstanceId = new Map<
    InstanceId,
    PositionTransitionTrack
  >();
  private readonly exitTransitionTrackByInstanceId = new Map<InstanceId, ExitTransitionTrack>();
  private readonly exitRenderNodeByInstanceId = new Map<InstanceId, ExitTransitionRenderNode>();
  private readonly animatedRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly animatedOpacityByInstanceId = new Map<InstanceId, number>();
  private readonly exitAnimatedRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly exitAnimatedOpacityByInstanceId = new Map<InstanceId, number>();

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
  private overlayShortcutOwners: readonly OverlayShortcutOwner[] = Object.freeze([]);
  private readonly overlayShortcutBySequence = new Map<string, OverlayShortcutBinding>();
  private overlayShortcutTrie = buildTrie<OverlayShortcutContext>(Object.freeze([]));
  private overlayShortcutChordState: ChordState = resetChordState();

  /* --- Pooled Collections (reused per-frame to reduce GC pressure) --- */
  private readonly _metadataCollector: WidgetMetadataCollector = createWidgetMetadataCollector();
  private readonly _pooledRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly _pooledInteractiveIdIndex = new Map<string, string>();
  private readonly _pooledLayoutSigByInstanceId = new Map<InstanceId, number>();
  private readonly _pooledNextLayoutSigByInstanceId = new Map<InstanceId, number>();
  private readonly _pooledChangedRenderInstanceIds: InstanceId[] = [];
  private readonly _pooledRemovedRenderInstanceIds: InstanceId[] = [];
  private readonly _pooledRectById = new Map<string, Rect>();
  private readonly _pooledSplitPaneChildRectsById = new Map<string, readonly Rect[]>();
  private readonly _prevFrameRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly _prevFrameOpacityByInstanceId = new Map<InstanceId, number>();
  private readonly _prevFrameRectById = new Map<string, Rect>();
  private readonly _pooledDamageRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly _pooledDamageRectById = new Map<string, Rect>();
  private readonly _prevFrameDamageRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly _prevFrameDamageRectById = new Map<string, Rect>();
  private readonly _pooledDamageRects: Rect[] = [];
  private readonly _pooledMergedDamageRects: Rect[] = [];
  private _hasRenderedFrame = false;
  private _lastRenderedViewport: Viewport = Object.freeze({ cols: 0, rows: 0 });
  private _lastRenderedThemeRef: Theme | null = null;
  private _lastRenderedFocusedId: string | null = null;
  private _lastRenderedFocusAnnouncement: string | null = null;
  private _layoutMeasureCache: WeakMap<VNode, unknown> = new WeakMap<VNode, unknown>();
  private _layoutTreeCache: WeakMap<VNode, unknown> = new WeakMap<VNode, unknown>();
  private readonly _pooledCloseOnEscape = new Map<string, boolean>();
  private readonly _pooledCloseOnBackdrop = new Map<string, boolean>();
  private readonly _pooledOnClose = new Map<string, () => void>();
  private readonly _pooledToastActionByFocusId = new Map<string, () => void>();
  private readonly _pooledToastActionLabelByFocusId = new Map<string, string>();
  private readonly _pooledLayoutStack: LayoutTree[] = [];
  private readonly _pooledRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledParentInstanceIdStack: InstanceId[] = [];
  private readonly _pooledOffsetXStack: number[] = [];
  private readonly _pooledOffsetYStack: number[] = [];
  private readonly _pooledDirtyLayoutInstanceIds: InstanceId[] = [];
  private readonly _pooledPrevRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledPrevLayoutSubtreeByInstanceId = new Map<InstanceId, LayoutTree>();
  private readonly _pooledDamageRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledVisitedTransitionIds = new Set<InstanceId>();
  private readonly _pooledDropdownStack: string[] = [];
  private readonly _pooledOverlayShortcutOwners: OverlayShortcutOwner[] = [];
  private readonly _pooledToastContainers: { rect: Rect; props: ToastContainerProps }[] = [];
  private readonly _pooledToastFocusableActionIds: string[] = [];
  private readonly _pooledActiveExitKeys = new Set<string>();
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
  private _runtimeBreadcrumbs: WidgetRuntimeBreadcrumbSnapshot = EMPTY_WIDGET_RUNTIME_BREADCRUMBS;

  constructor(
    opts: Readonly<{
      backend: RuntimeBackend;
      builder?: DrawlistBuilderV1 | DrawlistBuilderV2 | DrawlistBuilderV3;
      drawlistVersion?: 2 | 3 | 4 | 5;
      maxDrawlistBytes?: number;
      drawlistValidateParams?: boolean;
      drawlistReuseOutputBuffer?: boolean;
      drawlistEncodedStringCacheCap?: number;
      /** Root viewport padding in terminal cells. */
      rootPadding?: number;
      /** Responsive breakpoint thresholds (inclusive max widths). */
      breakpointThresholds?: ResponsiveBreakpointThresholds;
      /** Called when composite widgets invalidate (useState/useEffect). */
      requestRender?: () => void;
      /** Called when composite widgets require a new view/commit pass. */
      requestView?: () => void;
      /** Optional user-code error sink for routed callbacks (onInput/onBlur). */
      onUserCodeError?: (detail: string) => void;
      /** Optional terminal capability profile for capability-gated widgets. */
      terminalProfile?: TerminalProfile;
      /** Cursor shape for focused inputs (default: bar) */
      cursorShape?: CursorShape;
      /** Whether cursor should blink (default: true) */
      cursorBlink?: boolean;
      /** Collect runtime breadcrumb snapshots for inspector/export hooks. */
      collectRuntimeBreadcrumbs?: boolean;
    }>,
  ) {
    this.backend = opts.backend;
    this.cursorShape = opts.cursorShape ?? CURSOR_DEFAULTS.input.shape;
    this.cursorBlink = opts.cursorBlink ?? CURSOR_DEFAULTS.input.blink;
    this.collectRuntimeBreadcrumbs = opts.collectRuntimeBreadcrumbs === true;
    this.requestRender = opts.requestRender ?? (() => {});
    this.requestView = opts.requestView ?? (() => {});
    this.reportUserCodeError =
      opts.onUserCodeError ??
      ((detail: string) => {
        warnDev(`[rezi][runtime] ${detail}`);
      });
    this.rootPadding = Math.max(0, Math.trunc(opts.rootPadding ?? 0));
    this.breakpointThresholds = normalizeBreakpointThresholds(opts.breakpointThresholds);
    this.terminalProfile = opts.terminalProfile ?? DEFAULT_TERMINAL_PROFILE;

    // Widget rendering is generated from validated layout/runtime data, so we
    // default builder param validation off here to reduce per-command overhead.
    const validateParams = opts.drawlistValidateParams ?? false;
    const builderOpts = {
      ...(opts.maxDrawlistBytes === undefined ? {} : { maxDrawlistBytes: opts.maxDrawlistBytes }),
      validateParams,
      ...(opts.drawlistReuseOutputBuffer === undefined
        ? {}
        : { reuseOutputBuffer: opts.drawlistReuseOutputBuffer }),
      encodedStringCacheCap: opts.drawlistEncodedStringCacheCap ?? 131072,
    };

    if (opts.builder) {
      this.builder = opts.builder;
      return;
    }
    const drawlistVersion = opts.drawlistVersion ?? 2;
    if (
      drawlistVersion !== 2 &&
      drawlistVersion !== 3 &&
      drawlistVersion !== 4 &&
      drawlistVersion !== 5
    ) {
      throw new Error(
        `drawlistVersion ${String(
          drawlistVersion,
        )} is no longer supported; use drawlistVersion 2, 3, 4, or 5.`,
      );
    }
    if (drawlistVersion >= 3) {
      this.builder = createDrawlistBuilderV3({
        ...builderOpts,
        drawlistVersion: drawlistVersion === 3 ? 3 : drawlistVersion === 4 ? 4 : 5,
      });
      return;
    }
    this.builder = createDrawlistBuilderV2(builderOpts);
  }

  hasAnimatedWidgets(): boolean {
    return (
      this.hasAnimatedWidgetsInCommittedTree ||
      this.hasActivePositionTransitions ||
      this.hasActiveExitTransitions
    );
  }

  hasViewportAwareComposites(): boolean {
    return this.hasViewportAwareCompositesInCommittedTree;
  }

  invalidateCompositeWidgets(): void {
    const ids = this.compositeRegistry.getAllIds();
    for (const id of ids) {
      this.compositeRegistry.invalidate(id);
    }
  }

  private describeLayoutNode(node: LayoutTree): string {
    return describeLayoutNodeImpl(node);
  }

  private warnLayoutIssue(key: string, detail: string): void {
    warnLayoutIssueImpl(
      {
        devMode: this.devMode,
        warnedLayoutIssues: this.warnedLayoutIssues,
        warn: warnDev,
      },
      key,
      detail,
    );
  }

  private warnShortcutIssue(key: string, detail: string): void {
    warnShortcutIssueImpl(
      {
        devMode: DEV_MODE,
        warnedShortcutIssues: this.warnedShortcutIssues,
        warn: warnDev,
      },
      key,
      detail,
    );
  }

  private selectDropdownShortcutItem(dropdownId: string, itemId: string): boolean {
    return selectDropdownShortcutItemImpl(
      {
        dropdownById: this.dropdownById,
        dropdownSelectedIndexById: this.dropdownSelectedIndexById,
        clearPressedDropdown: () => {
          this.pressedDropdown = null;
        },
      },
      dropdownId,
      itemId,
    );
  }

  private selectCommandPaletteShortcutItem(paletteId: string, itemId: string): boolean {
    return selectCommandPaletteShortcutItemImpl(
      {
        commandPaletteById: this.commandPaletteById,
        commandPaletteItemsById: this.commandPaletteItemsById,
      },
      paletteId,
      itemId,
    );
  }

  private invokeOverlayShortcutTarget(target: OverlayShortcutTarget): boolean {
    return invokeOverlayShortcutTargetImpl(
      {
        dropdownById: this.dropdownById,
        dropdownSelectedIndexById: this.dropdownSelectedIndexById,
        clearPressedDropdown: () => {
          this.pressedDropdown = null;
        },
        commandPaletteById: this.commandPaletteById,
        commandPaletteItemsById: this.commandPaletteItemsById,
      },
      target,
    );
  }

  private registerOverlayShortcut(
    shortcutRaw: string,
    target: OverlayShortcutTarget,
    ownerLabel: string,
  ): void {
    registerOverlayShortcutImpl(
      {
        overlayShortcutBySequence: this.overlayShortcutBySequence,
        warnShortcutIssue: (key, detail) => this.warnShortcutIssue(key, detail),
      },
      shortcutRaw,
      target,
      ownerLabel,
    );
  }

  private rebuildOverlayShortcutBindings(): void {
    const rebuilt = rebuildOverlayShortcutBindingsImpl({
      overlayShortcutBySequence: this.overlayShortcutBySequence,
      overlayShortcutOwners: this.overlayShortcutOwners,
      dropdownById: this.dropdownById,
      commandPaletteById: this.commandPaletteById,
      commandPaletteItemsById: this.commandPaletteItemsById,
      warnShortcutIssue: (key, detail) => this.warnShortcutIssue(key, detail),
    });
    this.overlayShortcutChordState = rebuilt.overlayShortcutChordState;
    this.overlayShortcutTrie = rebuilt.overlayShortcutTrie;
  }

  private routeOverlayShortcut(event: ZrevEvent): "matched" | "pending" | "none" {
    const routed = routeOverlayShortcutImpl(event, {
      overlayShortcutBySequence: this.overlayShortcutBySequence,
      overlayShortcutTrie: this.overlayShortcutTrie,
      overlayShortcutChordState: this.overlayShortcutChordState,
      invokeTarget: (target) => this.invokeOverlayShortcutTarget(target),
    });
    this.overlayShortcutChordState = routed.nextChordState;
    return routed.result;
  }

  private emitDevLayoutWarnings(root: LayoutTree, viewport: Viewport): void {
    emitDevLayoutWarningsImpl(
      {
        devMode: this.devMode,
        warnedLayoutIssues: this.warnedLayoutIssues,
        warn: warnDev,
        pooledLayoutStack: this._pooledLayoutStack,
      },
      root,
      viewport,
    );
  }

  private recomputeAnimatedWidgetPresence(runtimeRoot: RuntimeInstance): void {
    this.hasAnimatedWidgetsInCommittedTree = recomputeAnimatedWidgetPresenceImpl(
      runtimeRoot,
      this._pooledRuntimeStack,
    );
  }

  private readContainerOpacity(node: RuntimeInstance): number {
    return readContainerOpacityImpl(node);
  }

  private refreshPositionTransitionTracks(
    runtimeRoot: RuntimeInstance,
    layoutRoot: LayoutTree,
    frameNowMs: number,
  ): void {
    refreshPositionTransitionTracksImpl({
      runtimeRoot,
      layoutRoot,
      frameNowMs,
      pooledVisitedTransitionIds: this._pooledVisitedTransitionIds,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledLayoutStack: this._pooledLayoutStack,
      positionTransitionTrackByInstanceId: this.positionTransitionTrackByInstanceId,
      animatedRectByInstanceId: this.animatedRectByInstanceId,
      animatedOpacityByInstanceId: this.animatedOpacityByInstanceId,
      prevFrameRectByInstanceId: this._prevFrameRectByInstanceId,
      prevFrameOpacityByInstanceId: this._prevFrameOpacityByInstanceId,
    });
  }

  private rebuildAnimatedRectOverrides(
    runtimeRoot: RuntimeInstance,
    layoutRoot: LayoutTree,
    frameNowMs: number,
  ): void {
    this.hasActivePositionTransitions = rebuildAnimatedRectOverridesImpl({
      runtimeRoot,
      layoutRoot,
      frameNowMs,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledLayoutStack: this._pooledLayoutStack,
      pooledOffsetXStack: this._pooledOffsetXStack,
      pooledOffsetYStack: this._pooledOffsetYStack,
      positionTransitionTrackByInstanceId: this.positionTransitionTrackByInstanceId,
      animatedRectByInstanceId: this.animatedRectByInstanceId,
      animatedOpacityByInstanceId: this.animatedOpacityByInstanceId,
    });
  }

  private collectLayoutSubtreeByInstanceId(
    runtimeRoot: RuntimeInstance,
    layoutRoot: LayoutTree,
    out: Map<InstanceId, LayoutTree>,
  ): void {
    out.clear();
    this._pooledRuntimeStack.length = 0;
    this._pooledLayoutStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    this._pooledLayoutStack.push(layoutRoot);

    while (this._pooledRuntimeStack.length > 0 && this._pooledLayoutStack.length > 0) {
      const runtimeNode = this._pooledRuntimeStack.pop();
      const layoutNode = this._pooledLayoutStack.pop();
      if (!runtimeNode || !layoutNode) continue;
      out.set(runtimeNode.instanceId, layoutNode);

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

  private cleanupUnmountedInstanceIds(unmountedInstanceIds: readonly InstanceId[]): void {
    for (const unmountedId of unmountedInstanceIds) {
      this.inputCursorByInstanceId.delete(unmountedId);
      this.inputSelectionByInstanceId.delete(unmountedId);
      this.inputWorkingValueByInstanceId.delete(unmountedId);
      this.inputUndoByInstanceId.delete(unmountedId);
      this.positionTransitionTrackByInstanceId.delete(unmountedId);
      this.exitTransitionTrackByInstanceId.delete(unmountedId);
      this.exitRenderNodeByInstanceId.delete(unmountedId);
      this.animatedRectByInstanceId.delete(unmountedId);
      this.animatedOpacityByInstanceId.delete(unmountedId);
      this.exitAnimatedRectByInstanceId.delete(unmountedId);
      this.exitAnimatedOpacityByInstanceId.delete(unmountedId);
      this._prevFrameOpacityByInstanceId.delete(unmountedId);
      this.compositeRegistry.incrementGeneration(unmountedId);
      this.compositeRegistry.delete(unmountedId);
    }
  }

  private scheduleExitAnimations(
    pendingExitAnimations: readonly PendingExitAnimation[],
    frameNowMs: number,
    prevRuntimeRoot: RuntimeInstance | null,
    prevLayoutRoot: LayoutTree | null,
  ): void {
    if (pendingExitAnimations.length === 0) return;

    if (!prevRuntimeRoot || !prevLayoutRoot) {
      for (const pending of pendingExitAnimations) {
        pending.runDeferredLocalStateCleanup();
        this.cleanupUnmountedInstanceIds(pending.subtreeInstanceIds);
      }
      return;
    }

    this.collectLayoutSubtreeByInstanceId(
      prevRuntimeRoot,
      prevLayoutRoot,
      this._pooledPrevLayoutSubtreeByInstanceId,
    );
    const missingLayout = scheduleExitAnimationsImpl({
      pendingExitAnimations,
      frameNowMs,
      layoutSubtreeByInstanceId: this._pooledPrevLayoutSubtreeByInstanceId,
      prevFrameOpacityByInstanceId: this._prevFrameOpacityByInstanceId,
      exitTransitionTrackByInstanceId: this.exitTransitionTrackByInstanceId,
      exitRenderNodeByInstanceId: this.exitRenderNodeByInstanceId,
    });
    for (const pending of missingLayout) {
      pending.runDeferredLocalStateCleanup();
      this.cleanupUnmountedInstanceIds(pending.subtreeInstanceIds);
    }
  }

  private sampleExitAnimations(frameNowMs: number): readonly ExitTransitionRenderNode[] {
    const sampled = sampleExitAnimationsImpl({
      frameNowMs,
      exitTransitionTrackByInstanceId: this.exitTransitionTrackByInstanceId,
      exitRenderNodeByInstanceId: this.exitRenderNodeByInstanceId,
      exitAnimatedRectByInstanceId: this.exitAnimatedRectByInstanceId,
      exitAnimatedOpacityByInstanceId: this.exitAnimatedOpacityByInstanceId,
    });
    this.hasActiveExitTransitions = sampled.hasActiveExitTransitions;
    return sampled.completedExitNodes;
  }

  private cancelExitTransitionsForReappearedKeys(runtimeRoot: RuntimeInstance): void {
    if (this.exitRenderNodeByInstanceId.size === 0) return;
    this._pooledActiveExitKeys.clear();
    this._pooledRuntimeStack.length = 0;
    this._pooledParentInstanceIdStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    this._pooledParentInstanceIdStack.push(0);
    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      const parentInstanceId = this._pooledParentInstanceIdStack.pop();
      if (!node) continue;
      if (parentInstanceId === undefined) continue;
      const props = node.vnode.props as Readonly<{ key?: unknown }> | undefined;
      const key = typeof props?.key === "string" ? props.key : undefined;
      if (key) {
        this._pooledActiveExitKeys.add(`${String(parentInstanceId)}:${node.vnode.kind}:${key}`);
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) {
          this._pooledRuntimeStack.push(child);
          this._pooledParentInstanceIdStack.push(node.instanceId);
        }
      }
    }

    for (const exitNode of this.exitRenderNodeByInstanceId.values()) {
      if (!exitNode.key) continue;
      if (
        !this._pooledActiveExitKeys.has(
          `${String(exitNode.parentInstanceId)}:${exitNode.vnodeKind}:${exitNode.key}`,
        )
      ) {
        continue;
      }
      exitNode.runDeferredLocalStateCleanup();
      this.cleanupUnmountedInstanceIds(exitNode.subtreeInstanceIds);
    }
    this._pooledActiveExitKeys.clear();
    this._pooledParentInstanceIdStack.length = 0;
  }

  private renderExitTransitionNodes(
    viewport: Viewport,
    theme: Theme,
    tick: number,
    cursorInfo: CursorInfo | undefined,
    focusAnnouncement: string | null,
  ): void {
    if (this.exitRenderNodeByInstanceId.size === 0) return;
    for (const exitNode of this.exitRenderNodeByInstanceId.values()) {
      renderTree(
        this.builder,
        this.focusState,
        exitNode.layoutRoot,
        this._pooledRectById,
        viewport,
        theme,
        tick,
        DEFAULT_BASE_STYLE,
        exitNode.runtimeRoot,
        this.exitAnimatedRectByInstanceId,
        this.exitAnimatedOpacityByInstanceId,
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
        focusAnnouncement,
        undefined,
        this.terminalProfile,
        this.pressedId,
      );
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

  private buildFallbackFocusInfo(id: string): FocusInfo {
    const toastActionLabel = this.toastActionLabelByFocusId.get(id) ?? null;
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

  /**
   * Get structured focus semantics for the currently focused widget.
   */
  getCurrentFocusInfo(): FocusInfo {
    const focusedId = this.focusState.focusedId;
    if (focusedId === null) return EMPTY_FOCUS_INFO;
    return this.focusInfoById.get(focusedId) ?? this.buildFallbackFocusInfo(focusedId);
  }

  /**
   * Get the user-facing announcement string for the current focus target.
   */
  getFocusAnnouncement(): string | null {
    return this.getCurrentFocusInfo().announcement;
  }

  /**
   * Capture the current focus/routing metadata for app-level route restoration.
   */
  captureFocusSnapshot(): WidgetFocusSnapshot {
    return Object.freeze({
      focusState: cloneFocusManagerState(this.focusState),
      focusList: Object.freeze([...this.focusList]),
      baseFocusList: Object.freeze([...this.baseFocusList]),
      enabledById: new Map(this.enabledById),
      baseEnabledById: new Map(this.baseEnabledById),
      pressableIds: new Set(this.pressableIds),
      traps: new Map(this.traps),
      zoneMetaById: new Map(this.zoneMetaById),
    });
  }

  /**
   * Restore a previously captured focus snapshot.
   */
  restoreFocusSnapshot(snapshot: WidgetFocusSnapshot): void {
    this.focusState = cloneFocusManagerState(snapshot.focusState);
    this.focusList = Object.freeze([...snapshot.focusList]);
    this.baseFocusList = Object.freeze([...snapshot.baseFocusList]);
    this.enabledById = new Map(snapshot.enabledById);
    this.baseEnabledById = new Map(snapshot.baseEnabledById);
    this.pressableIds = new Set(snapshot.pressableIds);
    this.traps = new Map(snapshot.traps);
    this.zoneMetaById = new Map(snapshot.zoneMetaById);
  }

  /**
   * Get the latest committed id->rect layout index.
   */
  getRectByIdIndex(): ReadonlyMap<string, Rect> {
    return this.rectById;
  }

  setTerminalProfile(next: TerminalProfile): void {
    this.terminalProfile = next;
  }

  /**
   * Get the latest runtime breadcrumb snapshot for inspector/export.
   *
   * Returns null when breadcrumb capture is disabled.
   */
  getRuntimeBreadcrumbSnapshot(): WidgetRuntimeBreadcrumbSnapshot | null {
    return this.collectRuntimeBreadcrumbs ? this._runtimeBreadcrumbs : null;
  }

  /**
   * Enable or disable runtime breadcrumb snapshot capture.
   */
  setRuntimeBreadcrumbCaptureEnabled(enabled: boolean): void {
    if (this.collectRuntimeBreadcrumbs === enabled) return;
    this.collectRuntimeBreadcrumbs = enabled;
    if (!enabled) {
      this._runtimeBreadcrumbs = EMPTY_WIDGET_RUNTIME_BREADCRUMBS;
    }
  }

  hasActiveOverlay(): boolean {
    return this.dropdownStack.length > 0 || this.layerRegistry.getTopmostModal() !== undefined;
  }

  private reportInputCallbackError(name: "onInput" | "onBlur", error: unknown): void {
    const detail = `${name} handler threw: ${describeThrown(error)}`;
    try {
      this.reportUserCodeError(detail);
    } catch (sinkError: unknown) {
      const c = (globalThis as { console?: { error?: (message: string) => void } }).console;
      c?.error?.(
        `[rezi][runtime] onUserCodeError sink threw while reporting ${name}: ${describeThrown(
          sinkError,
        )}; original=${detail}`,
      );
    }
  }

  private invokeBlurCallbackSafely(callback: (() => void) | undefined): void {
    if (typeof callback !== "function") return;
    try {
      callback();
    } catch (error: unknown) {
      this.reportInputCallbackError("onBlur", error);
    }
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
    return this.hasActiveOverlay();
  }

  private writeSelectedTextToClipboard(text: string): void {
    if (text.length === 0) return;
    const writeRaw = getBackendRawWriter(this.backend);
    if (!writeRaw) return;
    const seq = buildOsc52ClipboardSequence(text);
    if (seq.length === 0) return;
    try {
      writeRaw(seq);
    } catch {
      // Clipboard writes are best-effort and must not break event routing.
    }
  }

  private readInputSnapshot(meta: InputMeta): InputEditorSnapshot {
    return readInputSnapshotImpl(
      meta,
      this.inputWorkingValueByInstanceId,
      this.inputCursorByInstanceId,
      this.inputSelectionByInstanceId,
    );
  }

  private applyInputSnapshot(instanceId: InstanceId, snap: InputEditorSnapshot): void {
    applyInputSnapshotImpl(
      instanceId,
      snap,
      this.inputWorkingValueByInstanceId,
      this.inputCursorByInstanceId,
      this.inputSelectionByInstanceId,
    );
  }

  private getInputUndoStack(instanceId: InstanceId): InputUndoStack {
    return getInputUndoStackImpl(instanceId, this.inputUndoByInstanceId);
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
    const mouseTargetAnyId =
      event.kind === "mouse" ? hitTestAnyId(this.layoutTree, event.x, event.y) : null;
    let localNeedsRender = false;

    // Overlay routing: dropdown key navigation, layer/modal ESC close, and modal backdrop blocking.
    if (event.kind === "key" && event.action === "down") {
      const shortcutResult = this.routeOverlayShortcut(event);
      if (shortcutResult === "matched") return ROUTE_RENDER;
      if (shortcutResult === "pending") return ROUTE_NO_RENDER;

      const topLayerId =
        this.layerStack.length > 0 ? (this.layerStack[this.layerStack.length - 1] ?? null) : null;
      const topDropdownId =
        this.dropdownStack.length > 0
          ? (this.dropdownStack[this.dropdownStack.length - 1] ?? null)
          : null;
      if (topDropdownId && topLayerId === `dropdown:${topDropdownId}`) {
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
      const dropdownMouse = routeDropdownMouse(event, {
        layerStack: this.layerStack,
        dropdownStack: this.dropdownStack,
        dropdownById: this.dropdownById,
        dropdownSelectedIndexById: this.dropdownSelectedIndexById,
        pressedDropdown: this.pressedDropdown,
        setPressedDropdown: (next) => {
          this.pressedDropdown = next;
        },
        computeDropdownRect: (props) => this.computeDropdownRect(props),
      });
      if (dropdownMouse) return dropdownMouse;

      const layerBackdrop = routeLayerBackdropMouse(event, {
        layerRegistry: this.layerRegistry,
        closeOnBackdropByLayerId: this.closeOnBackdropByLayerId,
        onCloseByLayerId: this.onCloseByLayerId,
      });
      if (layerBackdrop) return layerBackdrop;
    }

    const splitPaneRouting = routeSplitPaneMouse(event, {
      splitPaneDrag: this.splitPaneDrag,
      setSplitPaneDrag: (next) => {
        this.splitPaneDrag = next;
      },
      splitPaneLastDividerDown: this.splitPaneLastDividerDown,
      setSplitPaneLastDividerDown: (next) => {
        this.splitPaneLastDividerDown = next;
      },
      splitPaneById: this.splitPaneById,
      splitPaneChildRectsById: this.splitPaneChildRectsById,
      rectById: this.rectById,
    });
    if (splitPaneRouting) return splitPaneRouting;

    const toastMouse = routeToastMouseDown(
      event,
      {
        toastContainers: this.toastContainers,
        focusState: this.focusState,
        setFocusState: (next) => {
          this.focusState = next;
        },
        zoneMetaById: this.zoneMetaById,
        invokeFocusZoneCallbacks: (prevZoneId, nextZoneId, prevZones, nextZones) =>
          this.invokeFocusZoneCallbacks(prevZoneId, nextZoneId, prevZones, nextZones),
      },
      prevActiveZoneId,
    );
    if (toastMouse) return toastMouse;

    // Route complex widgets first (so arrow keys act "within" the widget, not as focus movement).
    if (event.kind === "key" && event.action === "down" && focusedId !== null) {
      const toastActionRoute = routeToastActionKeyDown(event, {
        focusedId,
        toastActionByFocusId: this.toastActionByFocusId,
      });
      if (toastActionRoute) return toastActionRoute;

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
          if (selected.length > 0) this.writeSelectedTextToClipboard(selected);

          if (isCut && editor.readOnly !== true) {
            const cut = selection ? deleteRange(editor.lines, selection) : null;
            if (!cut) return ROUTE_NO_RENDER;
            editor.onSelectionChange(null);
            editor.onChange(cut.lines, cut.cursor);
            return ROUTE_RENDER;
          }
          return ROUTE_NO_RENDER;
        }

        const rect = this.rectById.get(editor.id) ?? null;
        const r = routeCodeEditorKeyDown(event, editor, rect);
        if (r) return r;
      }

      const logsRoute = routeLogsConsoleKeyDown(event, {
        focusedId,
        logsConsoleById: this.logsConsoleById,
        rectById: this.rectById,
        logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
        logsConsoleLastGTimeById: this.logsConsoleLastGTimeById,
      });
      if (logsRoute) return logsRoute;

      const diffRoute = routeDiffViewerKeyDown(event, {
        focusedId,
        diffViewerById: this.diffViewerById,
        diffViewerFocusedHunkById: this.diffViewerFocusedHunkById,
        diffViewerExpandedHunksById: this.diffViewerExpandedHunksById,
      });
      if (diffRoute) return diffRoute;

      const virtualListRoute = routeVirtualListKeyDown(event, {
        focusedId,
        virtualListById: this.virtualListById,
        virtualListStore: this.virtualListStore,
      });
      if (virtualListRoute) return virtualListRoute;

      const tableRoute = routeTableKeyDown(event, {
        focusedId,
        tableById: this.tableById,
        tableRenderCacheById: this.tableRenderCacheById,
        tableStore: this.tableStore,
        emptyStringArray: EMPTY_STRING_ARRAY,
      });
      if (tableRoute) return tableRoute;

      const treeRoute = routeTreeKeyDown(event, {
        focusedId,
        treeById: this.treeById,
        treeStore: this.treeStore,
        loadedTreeChildrenByTreeId: this.loadedTreeChildrenByTreeId,
        treeLoadTokenByTreeAndKey: this.treeLoadTokenByTreeAndKey,
        allocNextTreeLoadToken: () => this.nextTreeLoadToken++,
        requestRender: this.requestRender,
      });
      if (treeRoute) return treeRoute;

      const sliderRoute = routeSliderKeyDown(event, {
        focusedId,
        sliderById: this.sliderById,
      });
      if (sliderRoute) return sliderRoute;

      const selectRoute = routeSelectKeyDown(event, {
        focusedId,
        selectById: this.selectById,
      });
      if (selectRoute) return selectRoute;

      const checkboxRoute = routeCheckboxKeyDown(event, {
        focusedId,
        checkboxById: this.checkboxById,
      });
      if (checkboxRoute) return checkboxRoute;

      const radioGroupRoute = routeRadioGroupKeyDown(event, {
        focusedId,
        radioGroupById: this.radioGroupById,
      });
      if (radioGroupRoute) return radioGroupRoute;
    }

    const wheelRoute = routeMouseWheel(event, {
      layerRegistry: this.layerRegistry,
      layerStack: this.layerStack,
      mouseTargetId,
      mouseTargetAnyId,
      focusedId,
      virtualListById: this.virtualListById,
      virtualListStore: this.virtualListStore,
      codeEditorById: this.codeEditorById,
      codeEditorRenderCacheById: this.codeEditorRenderCacheById,
      logsConsoleById: this.logsConsoleById,
      logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
      diffViewerById: this.diffViewerById,
      rectById: this.rectById,
      scrollOverrides: this.scrollOverrides,
      findNearestScrollableAncestor: (targetId) => this.findNearestScrollableAncestor(targetId),
    });
    if (wheelRoute) return wheelRoute;

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

    localNeedsRender =
      routeVirtualListMouseClick(event, {
        mouseTargetId,
        virtualListById: this.virtualListById,
        rectById: this.rectById,
        virtualListStore: this.virtualListStore,
        pressedVirtualList: this.pressedVirtualList,
        setPressedVirtualList: (next) => {
          this.pressedVirtualList = next;
        },
      }) || localNeedsRender;

    localNeedsRender =
      routeTableMouseClick(event, {
        mouseTargetId,
        tableById: this.tableById,
        rectById: this.rectById,
        tableRenderCacheById: this.tableRenderCacheById,
        tableStore: this.tableStore,
        pressedTable: this.pressedTable,
        setPressedTable: (next) => {
          this.pressedTable = next;
        },
        pressedTableHeader: this.pressedTableHeader,
        setPressedTableHeader: (next) => {
          this.pressedTableHeader = next;
        },
        lastTableClick: this.lastTableClick,
        setLastTableClick: (next) => {
          this.lastTableClick = next;
        },
        emptyStringArray: EMPTY_STRING_ARRAY,
      }) || localNeedsRender;

    localNeedsRender =
      routeFilePickerMouseClick(event, {
        mouseTargetId,
        filePickerById: this.filePickerById,
        rectById: this.rectById,
        treeStore: this.treeStore,
        pressedFilePicker: this.pressedFilePicker,
        setPressedFilePicker: (next) => {
          this.pressedFilePicker = next;
        },
        lastFilePickerClick: this.lastFilePickerClick,
        setLastFilePickerClick: (next) => {
          this.lastFilePickerClick = next;
        },
      }) || localNeedsRender;

    localNeedsRender =
      routeFileTreeExplorerMouseClick(event, {
        mouseTargetId,
        fileTreeExplorerById: this.fileTreeExplorerById,
        rectById: this.rectById,
        treeStore: this.treeStore,
        pressedFileTree: this.pressedFileTree,
        setPressedFileTree: (next) => {
          this.pressedFileTree = next;
        },
        lastFileTreeClick: this.lastFileTreeClick,
        setLastFileTreeClick: (next) => {
          this.lastFileTreeClick = next;
        },
      }) || localNeedsRender;

    localNeedsRender =
      routeTreeMouseClick(event, {
        mouseTargetId,
        treeById: this.treeById,
        rectById: this.rectById,
        treeStore: this.treeStore,
        loadedTreeChildrenByTreeId: this.loadedTreeChildrenByTreeId,
        pressedTree: this.pressedTree,
        setPressedTree: (next) => {
          this.pressedTree = next;
        },
        lastTreeClick: this.lastTreeClick,
        setLastTreeClick: (next) => {
          this.lastTreeClick = next;
        },
      }) || localNeedsRender;

    localNeedsRender =
      routeFileTreeExplorerContextMenuMouse(event, {
        mouseTargetId,
        fileTreeExplorerById: this.fileTreeExplorerById,
        rectById: this.rectById,
        treeStore: this.treeStore,
      }) || localNeedsRender;

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
      this.invokeBlurCallbackSafely(prevInput?.onBlur);
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
        const link = this.linkById.get(res.action.id);
        if (link?.onPress) link.onPress();
      }
      return Object.freeze({ needsRender, action: res.action });
    }

    const inputEditingRoute = routeInputEditingEvent(event, {
      focusedId: this.focusState.focusedId,
      enabledById,
      inputById: this.inputById,
      inputCursorByInstanceId: this.inputCursorByInstanceId,
      inputSelectionByInstanceId: this.inputSelectionByInstanceId,
      inputWorkingValueByInstanceId: this.inputWorkingValueByInstanceId,
      inputUndoByInstanceId: this.inputUndoByInstanceId,
      writeSelectedTextToClipboard: (text) => {
        this.writeSelectedTextToClipboard(text);
      },
      onInputCallbackError: (error) => {
        this.reportInputCallbackError("onInput", error);
      },
    });
    if (inputEditingRoute) return inputEditingRoute;

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

  private findNearestScrollableAncestor(
    targetId: string | null,
  ): Readonly<{ nodeId: string; meta: LayoutOverflowMetadata }> | null {
    if (targetId === null || !this.committedRoot || !this.layoutTree) return null;

    type ScrollableMatch = Readonly<{ nodeId: string; meta: LayoutOverflowMetadata }>;
    type Cursor = Readonly<{
      runtimeNode: RuntimeInstance;
      layoutNode: LayoutTree;
      nearest: ScrollableMatch | null;
    }>;

    const stack: Cursor[] = [
      {
        runtimeNode: this.committedRoot,
        layoutNode: this.layoutTree,
        nearest: null,
      },
    ];

    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) continue;

      const runtimeNode = frame.runtimeNode;
      const layoutNode = frame.layoutNode;
      let nearest = frame.nearest;

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
          nearest = { nodeId, meta };
        }
      }

      if (nodeId === targetId) return nearest;

      const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
      for (let i = childCount - 1; i >= 0; i--) {
        const runtimeChild = runtimeNode.children[i];
        const layoutChild = layoutNode.children[i];
        if (!runtimeChild || !layoutChild) continue;
        stack.push({
          runtimeNode: runtimeChild,
          layoutNode: layoutChild,
          nearest,
        });
      }
    }

    return null;
  }

  private applyScrollOverridesToVNode(vnode: VNode): VNode {
    const propsRecord = (vnode.props ?? {}) as Readonly<Record<string, unknown>>;
    const propsForRead = propsRecord as Readonly<{
      id?: unknown;
      scrollX?: unknown;
      scrollY?: unknown;
    }>;
    const idRaw = propsForRead.id;
    const nodeId = typeof idRaw === "string" && idRaw.length > 0 ? idRaw : null;
    const override = nodeId ? this.scrollOverrides.get(nodeId) : undefined;

    let propsChanged = false;
    let nextProps = vnode.props;
    if (override) {
      if (propsForRead.scrollX !== override.scrollX || propsForRead.scrollY !== override.scrollY) {
        nextProps = Object.freeze({
          ...propsRecord,
          scrollX: override.scrollX,
          scrollY: override.scrollY,
        }) as typeof vnode.props;
        propsChanged = true;
      }
    }

    const currentChildren = (vnode as Readonly<{ children?: readonly VNode[] }>).children;
    let childrenChanged = false;
    let nextChildren = currentChildren;
    if (Array.isArray(currentChildren) && currentChildren.length > 0) {
      const rebuiltChildren: VNode[] = new Array(currentChildren.length);
      for (let i = 0; i < currentChildren.length; i++) {
        const child = currentChildren[i];
        const nextChild = this.applyScrollOverridesToVNode(child);
        rebuiltChildren[i] = nextChild;
        if (nextChild !== child) childrenChanged = true;
      }
      if (childrenChanged) nextChildren = Object.freeze(rebuiltChildren);
    }

    if (!propsChanged && !childrenChanged) return vnode;

    const nextVNode = {
      ...vnode,
      ...(propsChanged ? { props: nextProps } : {}),
      ...(childrenChanged ? { children: nextChildren } : {}),
    };
    return Object.freeze(nextVNode) as VNode;
  }

  private computeDropdownRect(props: DropdownProps): Rect | null {
    const anchor = this.rectById.get(props.anchorId) ?? null;
    return computeDropdownGeometry(props, anchor, this.lastViewport);
  }

  private shouldAttemptIncrementalRender(
    doLayout: boolean,
    viewport: Viewport,
    theme: Theme,
  ): boolean {
    return shouldAttemptIncrementalRenderImpl({
      hasRenderedFrame: this._hasRenderedFrame,
      doLayout,
      hasActivePositionTransitions: this.hasActivePositionTransitions,
      hasActiveExitTransitions: this.hasActiveExitTransitions,
      lastRenderedViewport: this._lastRenderedViewport,
      viewport,
      lastRenderedThemeRef: this._lastRenderedThemeRef,
      theme,
      dropdownStack: this.dropdownStack,
      layerStack: this.layerStack,
      toastContainers: this.toastContainers,
    });
  }

  private propagateDirtyFromPredicate(
    runtimeRoot: RuntimeInstance,
    isNodeDirty: (node: RuntimeInstance) => boolean,
  ): void {
    propagateDirtyFromPredicateImpl(
      runtimeRoot,
      isNodeDirty,
      this._pooledRuntimeStack,
      this._pooledPrevRuntimeStack,
    );
  }

  private markLayoutDirtyNodes(runtimeRoot: RuntimeInstance): void {
    markLayoutDirtyNodesImpl({
      runtimeRoot,
      pooledRectByInstanceId: this._pooledRectByInstanceId,
      prevFrameRectByInstanceId: this._prevFrameRectByInstanceId,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledPrevRuntimeStack: this._pooledPrevRuntimeStack,
    });
  }

  private collectSelfDirtyInstanceIds(runtimeRoot: RuntimeInstance, out: InstanceId[]): void {
    collectSelfDirtyInstanceIdsImpl(runtimeRoot, out, this._pooledRuntimeStack);
  }

  private markTransientDirtyNodes(
    runtimeRoot: RuntimeInstance,
    prevFocusedId: string | null,
    nextFocusedId: string | null,
    includeSpinners: boolean,
  ): void {
    markTransientDirtyNodesImpl({
      runtimeRoot,
      prevFocusedId,
      nextFocusedId,
      includeSpinners,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledPrevRuntimeStack: this._pooledPrevRuntimeStack,
    });
  }

  private clearRuntimeDirtyNodes(runtimeRoot: RuntimeInstance): void {
    clearRuntimeDirtyNodesImpl(runtimeRoot, this._pooledRuntimeStack);
  }

  private collectSubtreeDamageAndRouting(
    root: RuntimeInstance,
    outInstanceIds: InstanceId[],
  ): boolean {
    return collectSubtreeDamageAndRoutingImpl(root, outInstanceIds, this._pooledDamageRuntimeStack);
  }

  private computeIdentityDiffDamage(
    prevRoot: RuntimeInstance | null,
    nextRoot: RuntimeInstance,
  ): IdentityDiffDamageResult {
    return computeIdentityDiffDamageImpl({
      prevRoot,
      nextRoot,
      pooledChangedRenderInstanceIds: this._pooledChangedRenderInstanceIds,
      pooledRemovedRenderInstanceIds: this._pooledRemovedRenderInstanceIds,
      pooledPrevRuntimeStack: this._pooledPrevRuntimeStack,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledDamageRuntimeStack: this._pooledDamageRuntimeStack,
    });
  }

  private resolveRuntimeCursorSummary(
    cursorInfo: CursorInfo | undefined,
  ): RuntimeBreadcrumbCursorSummary | null {
    return resolveRuntimeCursorSummaryImpl(
      {
        focusedId: this.focusState.focusedId,
        inputById: this.inputById,
        pooledRectByInstanceId: this._pooledRectByInstanceId,
        inputCursorByInstanceId: this.inputCursorByInstanceId,
        codeEditorById: this.codeEditorById,
        rectById: this.rectById,
        codeEditorRenderCacheById: this.codeEditorRenderCacheById,
        commandPaletteById: this.commandPaletteById,
      },
      cursorInfo,
    );
  }

  private emitIncrementalCursor(
    cursorInfo: CursorInfo | undefined,
  ): RuntimeBreadcrumbCursorSummary | null {
    return emitIncrementalCursorImpl(
      {
        collectRuntimeBreadcrumbs: this.collectRuntimeBreadcrumbs,
        builder: this.builder,
        focusedId: this.focusState.focusedId,
        inputById: this.inputById,
        pooledRectByInstanceId: this._pooledRectByInstanceId,
        inputCursorByInstanceId: this.inputCursorByInstanceId,
        codeEditorById: this.codeEditorById,
        rectById: this.rectById,
        codeEditorRenderCacheById: this.codeEditorRenderCacheById,
        commandPaletteById: this.commandPaletteById,
      },
      cursorInfo,
    );
  }

  private updateRuntimeBreadcrumbSnapshot(
    params: Readonly<{
      tick: number;
      commit: boolean;
      layout: boolean;
      incremental: boolean;
      damageMode: RuntimeBreadcrumbDamageMode;
      damageRectCount: number;
      damageArea: number;
      cursor: RuntimeBreadcrumbCursorSummary | null;
    }>,
  ): void {
    this._runtimeBreadcrumbs = updateRuntimeBreadcrumbSnapshotImpl(
      this._runtimeBreadcrumbs,
      {
        collectRuntimeBreadcrumbs: this.collectRuntimeBreadcrumbs,
        focusState: this.focusState,
        focusAnnouncement: this.getFocusAnnouncement(),
      },
      params,
    );
  }

  private appendDamageRectForInstanceId(instanceId: InstanceId): boolean {
    return appendDamageRectForInstanceIdImpl(
      instanceId,
      this._pooledDamageRectByInstanceId,
      this._prevFrameDamageRectByInstanceId,
      this._pooledDamageRects,
    );
  }

  private appendDamageRectForId(id: string): boolean {
    return appendDamageRectForIdImpl(
      id,
      this._pooledDamageRectById,
      this._prevFrameDamageRectById,
      this._pooledDamageRects,
    );
  }

  private refreshDamageRectIndexesForLayoutSkippedCommit(runtimeRoot: RuntimeInstance): void {
    refreshDamageRectIndexesForLayoutSkippedCommitImpl({
      runtimeRoot,
      pooledDamageRectByInstanceId: this._pooledDamageRectByInstanceId,
      pooledDamageRectById: this._pooledDamageRectById,
      pooledRectByInstanceId: this._pooledRectByInstanceId,
      pooledRuntimeStack: this._pooledRuntimeStack,
    });
  }

  private collectSpinnerDamageRects(runtimeRoot: RuntimeInstance, layoutRoot: LayoutTree): void {
    collectSpinnerDamageRectsImpl({
      runtimeRoot,
      layoutRoot,
      pooledDamageRects: this._pooledDamageRects,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledLayoutStack: this._pooledLayoutStack,
    });
  }

  private appendDamageRectsForFocusAnnouncers(runtimeRoot: RuntimeInstance): boolean {
    return appendDamageRectsForFocusAnnouncersImpl({
      runtimeRoot,
      pooledRuntimeStack: this._pooledRuntimeStack,
      pooledDamageRectByInstanceId: this._pooledDamageRectByInstanceId,
      prevFrameDamageRectByInstanceId: this._prevFrameDamageRectByInstanceId,
      pooledDamageRects: this._pooledDamageRects,
    });
  }

  private normalizeDamageRects(viewport: Viewport): readonly Rect[] {
    return normalizeDamageRectsImpl(
      viewport,
      this._pooledDamageRects,
      this._pooledMergedDamageRects,
    );
  }

  private isDamageAreaTooLarge(viewport: Viewport): boolean {
    return isDamageAreaTooLargeImpl(viewport, this._pooledMergedDamageRects);
  }

  private snapshotRenderedFrameState(
    runtimeRoot: RuntimeInstance,
    viewport: Viewport,
    theme: Theme,
    doLayout: boolean,
    focusAnnouncement: string | null,
  ): void {
    const nextFrameState = snapshotRenderedFrameStateImpl({
      runtimeRoot,
      viewport,
      theme,
      doLayout,
      focusAnnouncement,
      focusedId: this.focusState.focusedId,
      pooledRectByInstanceId: this._pooledRectByInstanceId,
      pooledRectById: this._pooledRectById,
      pooledDamageRectByInstanceId: this._pooledDamageRectByInstanceId,
      pooledDamageRectById: this._pooledDamageRectById,
      prevFrameRectByInstanceId: this._prevFrameRectByInstanceId,
      prevFrameRectById: this._prevFrameRectById,
      prevFrameDamageRectByInstanceId: this._prevFrameDamageRectByInstanceId,
      prevFrameDamageRectById: this._prevFrameDamageRectById,
      prevFrameOpacityByInstanceId: this._prevFrameOpacityByInstanceId,
      pooledRuntimeStack: this._pooledRuntimeStack,
      readContainerOpacity: (node) => this.readContainerOpacity(node),
    });
    this._hasRenderedFrame = nextFrameState.hasRenderedFrame;
    this._lastRenderedViewport = nextFrameState.lastRenderedViewport;
    this._lastRenderedThemeRef = nextFrameState.lastRenderedThemeRef;
    this._lastRenderedFocusedId = nextFrameState.lastRenderedFocusedId;
    this._lastRenderedFocusAnnouncement = nextFrameState.lastRenderedFocusAnnouncement;
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
    setResponsiveViewport(viewport.cols, viewport.rows, this.breakpointThresholds);
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
      if (this.scrollOverrides.size > 0) doLayout = true;
      const frameNowMs =
        typeof plan.nowMs === "number" && Number.isFinite(plan.nowMs)
          ? plan.nowMs
          : monotonicNowMs();

      let commitRes: CommitOk | null = null;
      let prevFocusedIdBeforeFinalize: string | null = null;
      const prevActiveZoneIdBeforeSubmit = this.focusState.activeZoneId;
      const prevZoneMetaByIdBeforeSubmit = this.zoneMetaById;
      const prevCommittedRoot = this.committedRoot;
      const prevLayoutTree = this.layoutTree;
      const hadRoutingWidgets = this.hadRoutingWidgets;
      let hasRoutingWidgets = hadRoutingWidgets;
      let didRoutingRebuild = false;
      let identityDamageFromCommit: IdentityDiffDamageResult | null = null;
      let layoutDirtyVNodeSet: Set<VNode> | null = null;

      if (doCommit) {
        let commitReadViewport = false;
        const colorTokens = getColorTokens(theme);
        const viewToken = PERF_DETAIL_ENABLED ? perfMarkStart("view") : 0;
        const vnode = viewFn(snapshot);
        if (PERF_DETAIL_ENABLED) perfMarkEnd("view", viewToken);

        const commitToken = PERF_DETAIL_ENABLED ? perfMarkStart("vnode_commit") : 0;
        this.committedErrorBoundaryPathsScratch.clear();
        const commitRes0 = commitVNodeTree(this.committedRoot, vnode, {
          allocator: this.allocator,
          collectLifecycleInstanceIds: false,
          interactiveIdIndex: this._pooledInteractiveIdIndex,
          composite: {
            registry: this.compositeRegistry,
            appState: snapshot,
            colorTokens,
            theme,
            getColorTokens,
            viewport: getResponsiveViewport(),
            onInvalidate: () => this.requestView(),
            onUseViewport: () => {
              commitReadViewport = true;
            },
          },
          errorBoundary: {
            errorsByPath: this.errorBoundaryStatesByPath,
            retryRequestedPaths: this.retryErrorBoundaryPaths,
            activePaths: this.committedErrorBoundaryPathsScratch,
            requestRetry: (retryPath: string) => {
              this.retryErrorBoundaryPaths.add(retryPath);
              this.requestView();
            },
          },
        });
        if (PERF_DETAIL_ENABLED) perfMarkEnd("vnode_commit", commitToken);
        if (!commitRes0.ok) {
          return { ok: false, code: commitRes0.fatal.code, detail: commitRes0.fatal.detail };
        }
        commitRes = commitRes0.value;
        if (commitReadViewport) {
          this.hasViewportAwareCompositesInCommittedTree = true;
        }
        this.committedRoot = commitRes.root;
        this.recomputeAnimatedWidgetPresence(this.committedRoot);

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
        this.cleanupUnmountedInstanceIds(commitRes.unmountedInstanceIds);
        this.scheduleExitAnimations(
          commitRes.pendingExitAnimations,
          frameNowMs,
          prevCommittedRoot,
          prevLayoutTree,
        );
        this.cancelExitTransitionsForReappearedKeys(this.committedRoot);

        for (const path of this.errorBoundaryStatesByPath.keys()) {
          if (!this.committedErrorBoundaryPathsScratch.has(path)) {
            this.errorBoundaryStatesByPath.delete(path);
          }
        }
        for (const path of this.retryErrorBoundaryPaths) {
          if (!this.committedErrorBoundaryPathsScratch.has(path)) {
            this.retryErrorBoundaryPaths.delete(path);
          }
        }
      }

      if (!this.committedRoot) {
        return {
          ok: false,
          code: "ZRUI_INVALID_PROPS",
          detail: "widgetRenderer: missing committed root",
        };
      }

      const forceFullRelayout =
        !this._hasRenderedFrame ||
        this._lastRenderedViewport.cols !== viewport.cols ||
        this._lastRenderedViewport.rows !== viewport.rows ||
        this._lastRenderedThemeRef !== theme;

      if (doLayout && doCommit && commitRes !== null && !forceFullRelayout) {
        this.collectSelfDirtyInstanceIds(this.committedRoot, this._pooledDirtyLayoutInstanceIds);
        const dirtyInstanceIds = computeDirtyLayoutSet(
          this.committedRoot,
          commitRes.mountedInstanceIds,
          this._pooledDirtyLayoutInstanceIds,
        );
        layoutDirtyVNodeSet = instanceDirtySetToVNodeDirtySet(this.committedRoot, dirtyInstanceIds);
      }

      if (doLayout) {
        const rootPad = this.rootPadding;
        const rootW = Math.max(0, viewport.cols - rootPad * 2);
        const rootH = Math.max(0, viewport.rows - rootPad * 2);
        const layoutToken = perfMarkStart("layout");
        const layoutRootVNode =
          this.scrollOverrides.size > 0
            ? this.applyScrollOverridesToVNode(this.committedRoot.vnode)
            : this.committedRoot.vnode;
        this.scrollOverrides.clear();
        const layoutRes = layout(
          layoutRootVNode,
          rootPad,
          rootPad,
          rootW,
          rootH,
          "column",
          this._layoutMeasureCache,
          this._layoutTreeCache,
          layoutDirtyVNodeSet,
        );
        perfMarkEnd("layout", layoutToken);
        if (!layoutRes.ok) {
          return { ok: false, code: layoutRes.fatal.code, detail: layoutRes.fatal.detail };
        }
        const nextLayoutTree = layoutRes.value;
        this.layoutTree = nextLayoutTree;
        this.emitDevLayoutWarnings(nextLayoutTree, viewport);

        // Build a fast instanceId->rect index for overlay routing (modal/layer hit testing),
        // plus an id->rect map for widget-local interactions (scrolling, divider drags).
        // Uses pooled collections to avoid per-frame allocations.
        const layoutIndexesToken = PERF_DETAIL_ENABLED ? perfMarkStart("layout_indexes") : 0;
        buildLayoutRectIndexes(
          nextLayoutTree,
          this.committedRoot,
          this._pooledRectByInstanceId,
          this._pooledDamageRectByInstanceId,
          this._pooledRectById,
          this._pooledDamageRectById,
          this._pooledSplitPaneChildRectsById,
          this._pooledLayoutStack,
          this._pooledRuntimeStack,
        );
        if (PERF_DETAIL_ENABLED) perfMarkEnd("layout_indexes", layoutIndexesToken);
        this.rectById = this._pooledRectById;
        this.splitPaneChildRectsById = this._pooledSplitPaneChildRectsById;
        this.markLayoutDirtyNodes(this.committedRoot);
      }

      if (!this.layoutTree) {
        return {
          ok: false,
          code: "ZRUI_INVALID_PROPS",
          detail: "widgetRenderer: missing layout tree",
        };
      }
      if (doCommit && !doLayout) {
        this.refreshDamageRectIndexesForLayoutSkippedCommit(this.committedRoot);
      }

      if (doCommit) {
        const canSkipMetadataCollect =
          prevCommittedRoot !== null &&
          hadRoutingWidgets === false &&
          identityDamageFromCommit !== null &&
          identityDamageFromCommit.routingRelevantChanged === false &&
          this.baseFocusList.length === 0 &&
          this.focusState.focusedId === null;

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
          this.focusInfoById = widgetMeta.focusInfoById;
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
        this.linkById.clear();
        this.tableById.clear();
        this.treeById.clear();
        this.dropdownById.clear();
        this.sliderById.clear();
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
        this._pooledOverlayShortcutOwners.length = 0;
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
              const rect = this.computeDropdownRect(p) ?? ZERO_RECT;
              const zIndex = overlaySeq++;
              const layerId = `dropdown:${p.id}`;
              const onClose = typeof p.onClose === "function" ? p.onClose : undefined;
              this._pooledCloseOnEscape.set(layerId, true);
              this._pooledCloseOnBackdrop.set(layerId, false);
              if (onClose) this._pooledOnClose.set(layerId, onClose);
              const layerInput = {
                id: layerId,
                rect,
                backdrop: "none",
                modal: false,
                closeOnEscape: true,
                zIndex,
              } as const;
              this.layerRegistry.register(onClose ? { ...layerInput, onClose } : layerInput);
              this._pooledOverlayShortcutOwners.push(Object.freeze({ kind: "dropdown", id: p.id }));
              break;
            }
            case "button": {
              const p = v.props as ButtonProps;
              this.buttonById.set(p.id, p);
              break;
            }
            case "link": {
              const p = v.props as LinkProps;
              if (typeof p.id === "string" && p.id.length > 0) {
                this.linkById.set(p.id, p);
              }
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
              this._pooledOverlayShortcutOwners.push(
                Object.freeze({ kind: "commandPalette", id: p.id }),
              );
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
              const zIndex = overlaySeq++;
              const toastIdRaw = (p as { id?: unknown }).id;
              const toastId = typeof toastIdRaw === "string" ? toastIdRaw : "default";
              const layerId = `toast:${toastId}`;
              this._pooledCloseOnEscape.set(layerId, false);
              this._pooledCloseOnBackdrop.set(layerId, false);
              this.layerRegistry.register({
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
            case "slider": {
              this.sliderById.set((v.props as SliderProps).id, v.props as SliderProps);
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
        this.overlayShortcutOwners = Object.freeze(this._pooledOverlayShortcutOwners.slice());
        this.toastContainers = Object.freeze(this._pooledToastContainers.slice());
        this.rebuildOverlayShortcutBindings();

        // Build toast action maps using pooled collections.
        this._pooledToastActionByFocusId.clear();
        this._pooledToastActionLabelByFocusId.clear();
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
            this._pooledToastActionLabelByFocusId.set(fid, toast.action.label);
            this._pooledToastFocusableActionIds.push(fid);
          }
        }

        this.toastActionByFocusId = this._pooledToastActionByFocusId;
        this.toastActionLabelByFocusId = this._pooledToastActionLabelByFocusId;
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
              this._pooledDropdownStack.push(p.id);
              const rect = this.computeDropdownRect(p) ?? ZERO_RECT;
              const zIndex = overlaySeq++;
              const layerId = `dropdown:${p.id}`;
              const onClose = typeof p.onClose === "function" ? p.onClose : undefined;
              this._pooledCloseOnEscape.set(layerId, true);
              this._pooledCloseOnBackdrop.set(layerId, false);
              if (onClose) this._pooledOnClose.set(layerId, onClose);
              const layerInput = {
                id: layerId,
                rect,
                backdrop: "none",
                modal: false,
                closeOnEscape: true,
                zIndex,
              } as const;
              this.layerRegistry.register(onClose ? { ...layerInput, onClose } : layerInput);
              break;
            }
            case "toastContainer": {
              const p = v.props as ToastContainerProps;
              const rect = getRectForInstance(cur.instanceId);
              this._pooledToastContainers.push({ rect, props: p });
              const zIndex = overlaySeq++;
              const toastIdRaw = (p as { id?: unknown }).id;
              const toastId = typeof toastIdRaw === "string" ? toastIdRaw : "default";
              const layerId = `toast:${toastId}`;
              this._pooledCloseOnEscape.set(layerId, false);
              this._pooledCloseOnBackdrop.set(layerId, false);
              this.layerRegistry.register({
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
        this.dropdownStack = Object.freeze(this._pooledDropdownStack.slice());
        this.toastContainers = Object.freeze(this._pooledToastContainers.slice());
        this.rebuildOverlayShortcutBindings();

        this._pooledToastActionByFocusId.clear();
        this._pooledToastActionLabelByFocusId.clear();
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
            this._pooledToastActionLabelByFocusId.set(fid, toast.action.label);
            this._pooledToastFocusableActionIds.push(fid);
          }
        }

        this.toastActionByFocusId = this._pooledToastActionByFocusId;
        this.toastActionLabelByFocusId = this._pooledToastActionLabelByFocusId;
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

        // Clear stale FileTreeExplorer click tracking state.
        if (this.pressedFileTree && !this.fileTreeExplorerById.has(this.pressedFileTree.id)) {
          this.pressedFileTree = null;
        }
        if (this.lastFileTreeClick && !this.fileTreeExplorerById.has(this.lastFileTreeClick.id)) {
          this.lastFileTreeClick = null;
        }
        if (this.pressedFilePicker && !this.filePickerById.has(this.pressedFilePicker.id)) {
          this.pressedFilePicker = null;
        }
        if (this.lastFilePickerClick && !this.filePickerById.has(this.lastFilePickerClick.id)) {
          this.lastFilePickerClick = null;
        }
        if (this.pressedTree && !this.treeById.has(this.pressedTree.id)) {
          this.pressedTree = null;
        }
        if (this.lastTreeClick && !this.treeById.has(this.lastTreeClick.id)) {
          this.lastTreeClick = null;
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
        // Reset per-commit working values to committed props.value, and normalize cursor (docs/18).
        // If the controlled value diverged from local working state, clear undo/redo to avoid stale history.
        for (const meta of this.inputById.values()) {
          const instanceId = meta.instanceId;
          const prevWorkingValue = this.inputWorkingValueByInstanceId.get(instanceId);
          if (prevWorkingValue !== undefined && prevWorkingValue !== meta.value) {
            this.inputUndoByInstanceId.get(instanceId)?.clear();
          }
          this.inputWorkingValueByInstanceId.set(instanceId, meta.value);
          const prev = this.inputCursorByInstanceId.get(instanceId);
          const init = prev === undefined ? meta.value.length : prev;
          const nextCursor = normalizeInputCursor(meta.value, init);
          this.inputCursorByInstanceId.set(instanceId, nextCursor);

          const prevSelection = this.inputSelectionByInstanceId.get(instanceId);
          if (prevSelection) {
            const normalizedSelection = normalizeInputSelection(
              meta.value,
              prevSelection.start,
              prevSelection.end,
            );
            if (normalizedSelection)
              this.inputSelectionByInstanceId.set(instanceId, normalizedSelection);
            else this.inputSelectionByInstanceId.delete(instanceId);
          }
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

      // Build cursor info for native cursor protocol.
      const cursorInfo: CursorInfo = {
        cursorByInstanceId: this.inputCursorByInstanceId,
        shape: this.cursorShape,
        blink: this.cursorBlink,
      };

      if (doCommit) {
        kickoffCommandPaletteItemFetches(
          this.commandPaletteById,
          this.commandPaletteItemsById,
          this.commandPaletteLoadingById,
          this.commandPaletteFetchTokenById,
          this.commandPaletteLastQueryById,
          this.commandPaletteLastSourcesRefById,
          this.requestView,
        );
      }

      if (doCommit || doLayout || this.positionTransitionTrackByInstanceId.size > 0) {
        this.refreshPositionTransitionTracks(this.committedRoot, this.layoutTree, frameNowMs);
      }
      this.rebuildAnimatedRectOverrides(this.committedRoot, this.layoutTree, frameNowMs);
      const completedExitNodes = this.sampleExitAnimations(frameNowMs);
      for (const completed of completedExitNodes) {
        completed.runDeferredLocalStateCleanup();
        this.cleanupUnmountedInstanceIds(completed.subtreeInstanceIds);
      }
      if (this.hasActivePositionTransitions || this.hasActiveExitTransitions) {
        this.requestRender();
      }

      const tick = this.renderTick;
      this.renderTick = (this.renderTick + 1) >>> 0;
      const focusAnnouncement = this.getFocusAnnouncement();

      const renderToken = perfMarkStart("render");
      let usedIncrementalRender = false;
      const captureRuntimeBreadcrumbs = this.collectRuntimeBreadcrumbs;
      let runtimeCursorSummary: RuntimeBreadcrumbCursorSummary | null = null;
      let runtimeDamageMode: RuntimeBreadcrumbDamageMode = "none";
      let runtimeDamageRectCount = 0;
      let runtimeDamageArea = 0;
      if (this.shouldAttemptIncrementalRender(doLayout, viewport, theme)) {
        if (!doCommit) {
          this.markTransientDirtyNodes(
            this.committedRoot,
            this._lastRenderedFocusedId,
            this.focusState.focusedId,
            true,
          );
        }
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
        if (
          !missingDamageRect &&
          this._lastRenderedFocusAnnouncement !== focusAnnouncement &&
          !this.appendDamageRectsForFocusAnnouncers(this.committedRoot)
        ) {
          missingDamageRect = true;
        }

        if (!missingDamageRect) {
          const damageRects = this.normalizeDamageRects(viewport);
          if (damageRects.length > 0 && !this.isDamageAreaTooLarge(viewport)) {
            if (captureRuntimeBreadcrumbs) {
              runtimeDamageMode = "incremental";
              runtimeDamageRectCount = damageRects.length;
              runtimeDamageArea = 0;
              for (const damageRect of damageRects) {
                runtimeDamageArea += damageRect.w * damageRect.h;
              }
            }
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
                this.animatedRectByInstanceId,
                this.animatedOpacityByInstanceId,
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
                focusAnnouncement,
                { damageRect },
                this.terminalProfile,
                this.pressedId,
              );
              this.builder.popClip();
            }
            runtimeCursorSummary = this.emitIncrementalCursor(cursorInfo);
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
          pressedId: this.pressedId,
          builder: this.builder,
          tick,
          theme,
          terminalProfile: this.terminalProfile,
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
          focusAnnouncement,
          layoutIndex: this._pooledRectByInstanceId,
          idRectIndex: this._pooledRectById,
          animatedRectByInstanceId: this.animatedRectByInstanceId,
          animatedOpacityByInstanceId: this.animatedOpacityByInstanceId,
          tableRenderCacheById: this.tableRenderCacheById,
          logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
          diffRenderCacheById: this.diffRenderCacheById,
          codeEditorRenderCacheById: this.codeEditorRenderCacheById,
        });
        if (captureRuntimeBreadcrumbs) {
          runtimeDamageMode = "full";
          runtimeDamageRectCount = viewport.cols > 0 && viewport.rows > 0 ? 1 : 0;
          runtimeDamageArea = viewport.cols * viewport.rows;
          runtimeCursorSummary = this.resolveRuntimeCursorSummary(cursorInfo);
        }
      }
      if (this.exitRenderNodeByInstanceId.size > 0) {
        this.renderExitTransitionNodes(viewport, theme, tick, cursorInfo, focusAnnouncement);
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
      this.clearRuntimeDirtyNodes(this.committedRoot);
      if (captureRuntimeBreadcrumbs) {
        this.updateRuntimeBreadcrumbSnapshot({
          tick,
          commit: doCommit,
          layout: doLayout,
          incremental: usedIncrementalRender,
          damageMode: runtimeDamageMode,
          damageRectCount: runtimeDamageRectCount,
          damageArea: runtimeDamageArea,
          cursor: runtimeCursorSummary,
        });
      }
      this.snapshotRenderedFrameState(
        this.committedRoot,
        viewport,
        theme,
        doLayout,
        focusAnnouncement,
      );

      // Render hooks are for preventing re-entrant app API calls during user render.
      hooks.exitRender();
      entered = false;

      // Run composite effects after a successful commit+render build.
      if (commitRes) {
        const effectsToken = PERF_DETAIL_ENABLED ? perfMarkStart("effects") : 0;
        try {
          runPendingCleanups(commitRes.pendingCleanups);
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
