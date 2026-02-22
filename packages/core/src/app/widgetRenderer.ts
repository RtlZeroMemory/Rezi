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
import { resolveEasing } from "../animation/easing.js";
import { interpolateNumber, normalizeDurationMs } from "../animation/interpolate.js";
import { BACKEND_RAW_WRITE_MARKER, type BackendRawWrite, type RuntimeBackend } from "../backend.js";
import { CURSOR_DEFAULTS } from "../cursor/index.js";
import {
  type DrawlistBuilderV1,
  type DrawlistBuilderV2,
  type DrawlistBuilderV3,
  createDrawlistBuilderV1,
  createDrawlistBuilderV2,
  createDrawlistBuilderV3,
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
import {
  computeDirtyLayoutSet,
  instanceDirtySetToVNodeDirtySet,
} from "../layout/engine/dirtySet.js";
import { hitTestFocusable } from "../layout/hitTest.js";
import { type LayoutTree, layout } from "../layout/layout.js";
import { calculateAnchorPosition } from "../layout/positioning.js";
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
import { type CommitOk, type RuntimeInstance, commitVNodeTree } from "../runtime/commit.js";
import {
  type FocusManagerState,
  createFocusManagerState,
  finalizeFocusWithPreCollectedMetadata,
} from "../runtime/focus.js";
import {
  type InputEditorSnapshot,
  type InputSelection,
  InputUndoStack,
  applyInputEditEvent,
  getInputSelectionText,
  normalizeInputCursor,
  normalizeInputSelection,
} from "../runtime/inputEditor.js";
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
  type FocusInfo,
  type InputMeta,
  type WidgetMetadataCollector,
  createWidgetMetadataCollector,
} from "../runtime/widgetMeta.js";
import { DEFAULT_TERMINAL_PROFILE, type TerminalProfile } from "../terminalProfile.js";
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
  TransitionSpec,
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

type PositionTransitionTrack = Readonly<{
  from: Rect;
  to: Rect;
  fromOpacity: number;
  toOpacity: number;
  startMs: number;
  durationMs: number;
  easing: (t: number) => number;
  animatePosition: boolean;
  animateSize: boolean;
  animateOpacity: boolean;
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

function transitionSupportsPosition(transition: TransitionSpec): boolean {
  const properties = transition.properties;
  if (properties === undefined || properties === "all") return true;
  if (!Array.isArray(properties)) return false;
  return properties.includes("position");
}

function transitionSupportsSize(transition: TransitionSpec): boolean {
  const properties = transition.properties;
  if (properties === undefined || properties === "all") return true;
  if (!Array.isArray(properties)) return false;
  return properties.includes("size");
}

function transitionSupportsOpacity(transition: TransitionSpec): boolean {
  const properties = transition.properties;
  if (properties === undefined || properties === "all") return true;
  if (!Array.isArray(properties)) return false;
  return properties.includes("opacity");
}

function clampOpacity(opacity: unknown): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) return 1;
  if (opacity <= 0) return 0;
  if (opacity >= 1) return 1;
  return opacity;
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

function wrapInputLineForCursor(line: string, width: number): readonly string[] {
  if (width <= 0) return Object.freeze([""]);
  if (line.length === 0) return Object.freeze([""]);

  const out: string[] = [];
  const cps = Array.from(line);
  let chunk = "";
  let chunkWidth = 0;
  for (const cp of cps) {
    const cpWidth = Math.max(0, measureTextCells(cp));
    if (chunk.length > 0 && chunkWidth + cpWidth > width) {
      out.push(chunk);
      chunk = cp;
      chunkWidth = cpWidth;
      continue;
    }
    chunk += cp;
    chunkWidth += cpWidth;
  }
  if (chunk.length > 0) out.push(chunk);
  return Object.freeze(out.length > 0 ? out : [""]);
}

function resolveInputMultilineCursor(
  value: string,
  cursorOffset: number,
  contentWidth: number,
  wordWrap: boolean,
): Readonly<{ visualLine: number; visualX: number; totalVisualLines: number }> {
  const width = Math.max(1, contentWidth);
  const lineStarts: number[] = [];
  const lineEnds: number[] = [];
  const lines: string[] = [];
  let lineStart = 0;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 0x0a) {
      lineStarts.push(lineStart);
      lineEnds.push(i);
      lines.push(value.slice(lineStart, i));
      lineStart = i + 1;
    }
  }
  lineStarts.push(lineStart);
  lineEnds.push(value.length);
  lines.push(value.slice(lineStart));

  let lineIndex = Math.max(0, lines.length - 1);
  for (let i = 0; i < lineEnds.length; i++) {
    const end = lineEnds[i] ?? 0;
    if (cursorOffset <= end) {
      lineIndex = i;
      break;
    }
  }

  let visualLine = 0;
  for (let i = 0; i < lineIndex; i++) {
    const line = lines[i] ?? "";
    visualLine += wordWrap ? wrapInputLineForCursor(line, width).length : 1;
  }

  const currentLine = lines[lineIndex] ?? "";
  const currentStart = lineStarts[lineIndex] ?? 0;
  const currentEnd = lineEnds[lineIndex] ?? value.length;
  const col = Math.max(
    0,
    Math.min(Math.max(0, currentEnd - currentStart), cursorOffset - currentStart),
  );

  if (!wordWrap) {
    let totalVisualLines = 0;
    for (const line of lines) totalVisualLines += 1;
    return Object.freeze({
      visualLine,
      visualX: measureTextCells(currentLine.slice(0, col)),
      totalVisualLines,
    });
  }

  const wrappedPrefix = wrapInputLineForCursor(currentLine.slice(0, col), width);
  const localWrappedLine = Math.max(0, wrappedPrefix.length - 1);
  const visualX = measureTextCells(wrappedPrefix[localWrappedLine] ?? "");
  let totalVisualLines = 0;
  for (const line of lines) totalVisualLines += wrapInputLineForCursor(line, width).length;
  return Object.freeze({
    visualLine: visualLine + localWrappedLine,
    visualX,
    totalVisualLines,
  });
}

type WidgetKind = RuntimeInstance["vnode"]["kind"];
type IdentityDiffDamageResult = Readonly<{
  changedInstanceIds: readonly InstanceId[];
  removedInstanceIds: readonly InstanceId[];
  routingRelevantChanged: boolean;
}>;
type ErrorBoundaryState = Readonly<{
  code: "ZRUI_USER_CODE_THROW";
  detail: string;
  message: string;
  stack?: string;
}>;

function isRoutingRelevantKind(kind: WidgetKind): boolean {
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

function isDamageGranularityKind(kind: WidgetKind): boolean {
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
  private readonly useV2Cursor: boolean;
  private readonly cursorShape: CursorShape;
  private readonly cursorBlink: boolean;
  private collectRuntimeBreadcrumbs: boolean;
  private readonly requestRender: () => void;
  private readonly requestView: () => void;
  private readonly rootPadding: number;
  private readonly breakpointThresholds: ResponsiveBreakpointThresholds;
  private readonly devMode = DEV_LAYOUT_WARNINGS;
  private readonly warnedLayoutIssues = new Set<string>();

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
  private hasViewportAwareCompositesInCommittedTree = false;
  private readonly positionTransitionTrackByInstanceId = new Map<
    InstanceId,
    PositionTransitionTrack
  >();
  private readonly animatedRectByInstanceId = new Map<InstanceId, Rect>();
  private readonly animatedOpacityByInstanceId = new Map<InstanceId, number>();

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
  private readonly _pooledInteractiveIdIndex = new Map<string, InstanceId>();
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
  private readonly _pooledOffsetXStack: number[] = [];
  private readonly _pooledOffsetYStack: number[] = [];
  private readonly _pooledDirtyLayoutInstanceIds: InstanceId[] = [];
  private readonly _pooledPrevRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledDamageRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledVisitedTransitionIds = new Set<InstanceId>();
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
  private _runtimeBreadcrumbs: WidgetRuntimeBreadcrumbSnapshot = EMPTY_WIDGET_RUNTIME_BREADCRUMBS;

  constructor(
    opts: Readonly<{
      backend: RuntimeBackend;
      builder?: DrawlistBuilderV1 | DrawlistBuilderV2 | DrawlistBuilderV3;
      drawlistVersion?: 1 | 2 | 3 | 4 | 5;
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
      /** Optional terminal capability profile for capability-gated widgets. */
      terminalProfile?: TerminalProfile;
      /** Enable v2 cursor protocol for native cursor support */
      useV2Cursor?: boolean;
      /** Cursor shape for focused inputs (default: bar) */
      cursorShape?: CursorShape;
      /** Whether cursor should blink (default: true) */
      cursorBlink?: boolean;
      /** Collect runtime breadcrumb snapshots for inspector/export hooks. */
      collectRuntimeBreadcrumbs?: boolean;
    }>,
  ) {
    this.backend = opts.backend;
    this.useV2Cursor = opts.useV2Cursor === true;
    this.cursorShape = opts.cursorShape ?? CURSOR_DEFAULTS.input.shape;
    this.cursorBlink = opts.cursorBlink ?? CURSOR_DEFAULTS.input.blink;
    this.collectRuntimeBreadcrumbs = opts.collectRuntimeBreadcrumbs === true;
    this.requestRender = opts.requestRender ?? (() => {});
    this.requestView = opts.requestView ?? (() => {});
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
    const drawlistVersion = opts.drawlistVersion ?? (this.useV2Cursor ? 2 : 1);
    if (drawlistVersion >= 3) {
      this.builder = createDrawlistBuilderV3({
        ...builderOpts,
        drawlistVersion: drawlistVersion === 3 ? 3 : drawlistVersion === 4 ? 4 : 5,
      });
      return;
    }
    if (drawlistVersion === 2 || this.useV2Cursor) {
      this.builder = createDrawlistBuilderV2(builderOpts);
      return;
    }
    this.builder = createDrawlistBuilderV1(builderOpts);
  }

  hasAnimatedWidgets(): boolean {
    return this.hasAnimatedWidgetsInCommittedTree || this.hasActivePositionTransitions;
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
    const props = node.vnode.props as { id?: unknown } | undefined;
    const id = typeof props?.id === "string" && props.id.length > 0 ? `#${props.id}` : "";
    return `${node.vnode.kind}${id}`;
  }

  private warnLayoutIssue(key: string, detail: string): void {
    if (!this.devMode) return;
    if (this.warnedLayoutIssues.has(key)) return;
    this.warnedLayoutIssues.add(key);
    warnDev(`[rezi][layout] ${detail}`);
  }

  private emitDevLayoutWarnings(root: LayoutTree, viewport: Viewport): void {
    if (!this.devMode) return;
    this._pooledLayoutStack.length = 0;
    this._pooledLayoutStack.push(root);
    while (this._pooledLayoutStack.length > 0) {
      const node = this._pooledLayoutStack.pop();
      if (!node) continue;

      const desc = this.describeLayoutNode(node);
      const props = node.vnode.props as
        | Readonly<{
            minWidth?: unknown;
            minHeight?: unknown;
          }>
        | undefined;
      const minWidth = typeof props?.minWidth === "number" ? Math.trunc(props.minWidth) : null;
      const minHeight = typeof props?.minHeight === "number" ? Math.trunc(props.minHeight) : null;
      if (minWidth !== null && Number.isFinite(minWidth) && minWidth > viewport.cols) {
        this.warnLayoutIssue(
          `minWidth:${desc}:${minWidth}`,
          `${desc} minWidth=${String(minWidth)} exceeds viewport width=${String(viewport.cols)}.`,
        );
      }
      if (minHeight !== null && Number.isFinite(minHeight) && minHeight > viewport.rows) {
        this.warnLayoutIssue(
          `minHeight:${desc}:${minHeight}`,
          `${desc} minHeight=${String(minHeight)} exceeds viewport height=${String(viewport.rows)}.`,
        );
      }

      if (node.rect.w <= 0 || node.rect.h <= 0) {
        this.warnLayoutIssue(
          `zeroRect:${desc}:${node.rect.w}x${node.rect.h}`,
          `${desc} resolved to zero-size rect ${String(node.rect.w)}x${String(node.rect.h)} and may be invisible.`,
        );
      }

      if (node.meta && node.meta.viewportWidth <= 0 && node.meta.viewportHeight <= 0) {
        this.warnLayoutIssue(
          `scrollViewport:${desc}`,
          `${desc} overflow viewport collapsed to 0x0.`,
        );
      }

      for (let i = 0; i < node.children.length; i++) {
        this._pooledLayoutStack.push(node.children[i] as LayoutTree);
      }
    }
  }

  private recomputeAnimatedWidgetPresence(runtimeRoot: RuntimeInstance): void {
    this._pooledRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;
      if (node.vnode.kind === "spinner") {
        this.hasAnimatedWidgetsInCommittedTree = true;
        this._pooledRuntimeStack.length = 0;
        return;
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }
    this.hasAnimatedWidgetsInCommittedTree = false;
  }

  private readBoxOpacity(node: RuntimeInstance): number {
    if (node.vnode.kind !== "box") return 1;
    const props = node.vnode.props as Readonly<{ opacity?: unknown }> | undefined;
    return clampOpacity(props?.opacity);
  }

  private resolvePositionTransition(node: RuntimeInstance): Readonly<{
    durationMs: number;
    easing: (t: number) => number;
    animatePosition: boolean;
    animateSize: boolean;
    animateOpacity: boolean;
  }> | null {
    if (node.vnode.kind !== "box") return null;
    const props = node.vnode.props as Readonly<{ transition?: TransitionSpec }> | undefined;
    const transition = props?.transition;
    if (!transition) return null;
    const animatePosition = transitionSupportsPosition(transition);
    const animateSize = transitionSupportsSize(transition);
    const animateOpacity = transitionSupportsOpacity(transition);
    if (!animatePosition && !animateSize && !animateOpacity) return null;
    return Object.freeze({
      durationMs: normalizeDurationMs(transition.duration, DEFAULT_POSITION_TRANSITION_DURATION_MS),
      easing: resolveEasing(transition.easing),
      animatePosition,
      animateSize,
      animateOpacity,
    });
  }

  private refreshPositionTransitionTracks(
    runtimeRoot: RuntimeInstance,
    layoutRoot: LayoutTree,
    frameNowMs: number,
  ): void {
    this._pooledVisitedTransitionIds.clear();
    this._pooledRuntimeStack.length = 0;
    this._pooledLayoutStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    this._pooledLayoutStack.push(layoutRoot);

    while (this._pooledRuntimeStack.length > 0 && this._pooledLayoutStack.length > 0) {
      const runtimeNode = this._pooledRuntimeStack.pop();
      const layoutNode = this._pooledLayoutStack.pop();
      if (!runtimeNode || !layoutNode) continue;

      const transition = this.resolvePositionTransition(runtimeNode);
      if (transition) {
        const instanceId = runtimeNode.instanceId;
        this._pooledVisitedTransitionIds.add(instanceId);

        const nextRect = layoutNode.rect;
        const nextOpacity = this.readBoxOpacity(runtimeNode);
        const existingTrack = this.positionTransitionTrackByInstanceId.get(instanceId);
        const previousRect = this._prevFrameRectByInstanceId.get(instanceId);
        const previousOpacity = this._prevFrameOpacityByInstanceId.get(instanceId) ?? nextOpacity;

        const targetChanged =
          existingTrack !== undefined &&
          (existingTrack.to.x !== nextRect.x ||
            existingTrack.to.y !== nextRect.y ||
            existingTrack.to.w !== nextRect.w ||
            existingTrack.to.h !== nextRect.h ||
            !Object.is(existingTrack.toOpacity, nextOpacity));

        if (transition.durationMs <= 0) {
          this.positionTransitionTrackByInstanceId.delete(instanceId);
        } else if (existingTrack && targetChanged) {
          const fromRect = this.animatedRectByInstanceId.get(instanceId) ?? existingTrack.to;
          const fromOpacity =
            this.animatedOpacityByInstanceId.get(instanceId) ?? existingTrack.toOpacity;
          const animatePosition =
            transition.animatePosition && (fromRect.x !== nextRect.x || fromRect.y !== nextRect.y);
          const animateSize =
            transition.animateSize && (fromRect.w !== nextRect.w || fromRect.h !== nextRect.h);
          const animateOpacity = transition.animateOpacity && !Object.is(fromOpacity, nextOpacity);
          if (animatePosition || animateSize || animateOpacity) {
            this.positionTransitionTrackByInstanceId.set(
              instanceId,
              Object.freeze({
                from: fromRect,
                to: nextRect,
                fromOpacity,
                toOpacity: nextOpacity,
                startMs: frameNowMs,
                durationMs: transition.durationMs,
                easing: transition.easing,
                animatePosition,
                animateSize,
                animateOpacity,
              }),
            );
          } else {
            this.positionTransitionTrackByInstanceId.delete(instanceId);
          }
        } else if (!existingTrack && previousRect) {
          const fromRect = this.animatedRectByInstanceId.get(instanceId) ?? previousRect;
          const fromOpacity = previousOpacity;
          const animatePosition =
            transition.animatePosition && (fromRect.x !== nextRect.x || fromRect.y !== nextRect.y);
          const animateSize =
            transition.animateSize && (fromRect.w !== nextRect.w || fromRect.h !== nextRect.h);
          const animateOpacity = transition.animateOpacity && !Object.is(fromOpacity, nextOpacity);
          if (animatePosition || animateSize || animateOpacity) {
            this.positionTransitionTrackByInstanceId.set(
              instanceId,
              Object.freeze({
                from: fromRect,
                to: nextRect,
                fromOpacity,
                toOpacity: nextOpacity,
                startMs: frameNowMs,
                durationMs: transition.durationMs,
                easing: transition.easing,
                animatePosition,
                animateSize,
                animateOpacity,
              }),
            );
          }
        }
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

    for (const instanceId of this.positionTransitionTrackByInstanceId.keys()) {
      if (!this._pooledVisitedTransitionIds.has(instanceId)) {
        this.positionTransitionTrackByInstanceId.delete(instanceId);
      }
    }
    this._pooledVisitedTransitionIds.clear();
  }

  private rebuildAnimatedRectOverrides(
    runtimeRoot: RuntimeInstance,
    layoutRoot: LayoutTree,
    frameNowMs: number,
  ): void {
    this.animatedRectByInstanceId.clear();
    this.animatedOpacityByInstanceId.clear();
    this._pooledRuntimeStack.length = 0;
    this._pooledLayoutStack.length = 0;
    this._pooledOffsetXStack.length = 0;
    this._pooledOffsetYStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    this._pooledLayoutStack.push(layoutRoot);
    this._pooledOffsetXStack.push(0);
    this._pooledOffsetYStack.push(0);

    let activeCount = 0;

    while (
      this._pooledRuntimeStack.length > 0 &&
      this._pooledLayoutStack.length > 0 &&
      this._pooledOffsetXStack.length > 0 &&
      this._pooledOffsetYStack.length > 0
    ) {
      const runtimeNode = this._pooledRuntimeStack.pop();
      const layoutNode = this._pooledLayoutStack.pop();
      const parentOffsetX = this._pooledOffsetXStack.pop();
      const parentOffsetY = this._pooledOffsetYStack.pop();
      if (runtimeNode === undefined || layoutNode === undefined) continue;
      if (parentOffsetX === undefined || parentOffsetY === undefined) continue;

      const baseRect = layoutNode.rect;
      const track = this.positionTransitionTrackByInstanceId.get(runtimeNode.instanceId);
      let localOffsetX = 0;
      let localOffsetY = 0;
      let animatedWidth = baseRect.w;
      let animatedHeight = baseRect.h;
      let animatedOpacity: number | null = null;

      if (track) {
        const elapsedMs = Math.max(0, frameNowMs - track.startMs);
        const progress = track.durationMs <= 0 ? 1 : Math.min(1, elapsedMs / track.durationMs);
        if (progress >= 1) {
          this.positionTransitionTrackByInstanceId.delete(runtimeNode.instanceId);
        } else {
          activeCount++;
          const eased = track.easing(progress);
          const animatedX = track.animatePosition
            ? Math.round(interpolateNumber(track.from.x, track.to.x, eased))
            : baseRect.x;
          const animatedY = track.animatePosition
            ? Math.round(interpolateNumber(track.from.y, track.to.y, eased))
            : baseRect.y;
          if (track.animateSize) {
            animatedWidth = Math.max(
              0,
              Math.round(interpolateNumber(track.from.w, track.to.w, eased)),
            );
            animatedHeight = Math.max(
              0,
              Math.round(interpolateNumber(track.from.h, track.to.h, eased)),
            );
          }
          if (track.animateOpacity) {
            animatedOpacity = clampOpacity(
              interpolateNumber(track.fromOpacity, track.toOpacity, eased),
            );
          }
          localOffsetX = animatedX - baseRect.x;
          localOffsetY = animatedY - baseRect.y;
        }
      }

      const totalOffsetX = parentOffsetX + localOffsetX;
      const totalOffsetY = parentOffsetY + localOffsetY;
      if (
        totalOffsetX !== 0 ||
        totalOffsetY !== 0 ||
        animatedWidth !== baseRect.w ||
        animatedHeight !== baseRect.h
      ) {
        this.animatedRectByInstanceId.set(
          runtimeNode.instanceId,
          Object.freeze({
            x: baseRect.x + totalOffsetX,
            y: baseRect.y + totalOffsetY,
            w: animatedWidth,
            h: animatedHeight,
          }),
        );
      }
      if (animatedOpacity !== null) {
        this.animatedOpacityByInstanceId.set(runtimeNode.instanceId, animatedOpacity);
      }

      const childCount = Math.min(runtimeNode.children.length, layoutNode.children.length);
      for (let i = childCount - 1; i >= 0; i--) {
        const runtimeChild = runtimeNode.children[i];
        const layoutChild = layoutNode.children[i];
        if (runtimeChild && layoutChild) {
          this._pooledRuntimeStack.push(runtimeChild);
          this._pooledLayoutStack.push(layoutChild);
          this._pooledOffsetXStack.push(totalOffsetX);
          this._pooledOffsetYStack.push(totalOffsetY);
        }
      }
    }

    this.hasActivePositionTransitions = activeCount > 0;
    if (!this.hasActivePositionTransitions) {
      this.animatedRectByInstanceId.clear();
      this.animatedOpacityByInstanceId.clear();
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
    const value = this.inputWorkingValueByInstanceId.get(meta.instanceId) ?? meta.value;
    const cursor = normalizeInputCursor(
      value,
      this.inputCursorByInstanceId.get(meta.instanceId) ?? value.length,
    );
    const selection = this.inputSelectionByInstanceId.get(meta.instanceId);
    const normalizedSelection = normalizeInputSelection(
      value,
      selection?.start ?? null,
      selection?.end ?? null,
    );
    return Object.freeze({
      value,
      cursor,
      selectionStart: normalizedSelection?.start ?? null,
      selectionEnd: normalizedSelection?.end ?? null,
    });
  }

  private applyInputSnapshot(instanceId: InstanceId, snap: InputEditorSnapshot): void {
    this.inputWorkingValueByInstanceId.set(instanceId, snap.value);
    this.inputCursorByInstanceId.set(instanceId, snap.cursor);
    if (snap.selectionStart === null || snap.selectionEnd === null) {
      this.inputSelectionByInstanceId.delete(instanceId);
      return;
    }
    this.inputSelectionByInstanceId.set(
      instanceId,
      Object.freeze({ start: snap.selectionStart, end: snap.selectionEnd }),
    );
  }

  private getInputUndoStack(instanceId: InstanceId): InputUndoStack {
    const existing = this.inputUndoByInstanceId.get(instanceId);
    if (existing) return existing;
    const stack = new InputUndoStack();
    this.inputUndoByInstanceId.set(instanceId, stack);
    return stack;
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
            itemHeight,
            r.nextScrollTop,
            state.viewportHeight,
            overscan,
            measuredHeights,
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

      // Slider routing (arrows, page keys, home/end)
      const slider = this.sliderById.get(focusedId);
      if (slider && slider.disabled !== true) {
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

        if (adjustment !== null) {
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
          this.virtualListStore.set(vlist.id, { scrollTop: r.nextScrollTop });
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

      // Prefer editor widget under mouse cursor; fall back to focused widget.
      // mouseTargetId may point at a non-editor widget (e.g. a button), so we
      // must check each editor map and only fall back when the target isn't one.
      for (const candidateId of [mouseTargetId, focusedId]) {
        if (candidateId === null) continue;

        const editor = this.codeEditorById.get(candidateId);
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
          break;
        }

        const logs = this.logsConsoleById.get(candidateId);
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
          break;
        }

        const diff = this.diffViewerById.get(candidateId);
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
          break;
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

    // Mouse click for FilePicker:
    // - on down: select clicked node (skip right button)
    // - on up: detect double-click to open file or toggle directory
    if (event.kind === "mouse" && (event.mouseKind === 3 || event.mouseKind === 4)) {
      const targetId = mouseTargetId;
      if (targetId !== null) {
        const fp = this.filePickerById.get(targetId);
        const rect = this.rectById.get(targetId);
        if (fp && rect) {
          const state = this.treeStore.get(fp.id);
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
              this.treeStore.set(fp.id, {
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
            this.pressedFilePicker = null;
            const RIGHT_BUTTON = 1 << 2;
            if ((event.buttons & RIGHT_BUTTON) !== 0) {
              // No right-click behavior for file picker.
            } else {
              const nodeIndex = computeNodeIndex();
              if (nodeIndex !== null) {
                const fn = flatNodes[nodeIndex];
                if (fn) {
                  invokeCallbackSafely(fp.onSelect, fn.key);
                  this.treeStore.set(fp.id, { focusedKey: fn.key });
                  this.pressedFilePicker = Object.freeze({
                    id: fp.id,
                    nodeIndex,
                    nodeKey: fn.key,
                  });
                  localNeedsRender = true;
                }
              } else {
                this.pressedFilePicker = null;
                this.lastFilePickerClick = null;
              }
            }
          } else {
            const pressed = this.pressedFilePicker;
            this.pressedFilePicker = null;

            if (pressed && pressed.id === fp.id) {
              const nodeIndex = computeNodeIndex();
              if (nodeIndex !== null && nodeIndex === pressed.nodeIndex) {
                const fn = flatNodes[nodeIndex];
                if (!fn || fn.key !== pressed.nodeKey) {
                  this.lastFilePickerClick = null;
                } else {
                  const DOUBLE_PRESS_MS = 500;
                  const last = this.lastFilePickerClick;
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
                    this.lastFilePickerClick = null;
                    localNeedsRender = true;
                  } else {
                    this.lastFilePickerClick = Object.freeze({
                      id: fp.id,
                      nodeIndex,
                      nodeKey: fn.key,
                      timeMs: event.timeMs,
                    });
                    localNeedsRender = true;
                  }
                }
              } else {
                this.lastFilePickerClick = null;
              }
            }
          }
        } else if (event.mouseKind === 4) {
          this.pressedFilePicker = null;
        }
      } else if (event.mouseKind === 4) {
        this.pressedFilePicker = null;
      }
    }

    // Mouse click for FileTreeExplorer:
    // - on down: select clicked node (skip right button)
    // - on up: detect double-click and fire onActivate
    if (event.kind === "mouse" && (event.mouseKind === 3 || event.mouseKind === 4)) {
      const targetId = mouseTargetId;
      if (targetId !== null) {
        const fte = this.fileTreeExplorerById.get(targetId);
        const rect = this.rectById.get(targetId);
        if (fte && rect) {
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
            this.pressedFileTree = null;
            const RIGHT_BUTTON = 1 << 2;
            if ((event.buttons & RIGHT_BUTTON) !== 0) {
              // Right-click is handled by the context menu block below.
            } else {
              const nodeIndex = computeNodeIndex();
              if (nodeIndex !== null) {
                const fn = flatNodes[nodeIndex];
                if (fn) {
                  invokeCallbackSafely(fte.onSelect, fn.node);
                  this.treeStore.set(fte.id, { focusedKey: fn.key });
                  this.pressedFileTree = Object.freeze({
                    id: fte.id,
                    nodeIndex,
                    nodeKey: fn.key,
                  });
                  localNeedsRender = true;
                }
              } else {
                this.pressedFileTree = null;
                this.lastFileTreeClick = null;
              }
            }
          } else {
            const pressedFT = this.pressedFileTree;
            this.pressedFileTree = null;

            if (pressedFT && pressedFT.id === fte.id) {
              const nodeIndex = computeNodeIndex();
              if (nodeIndex !== null && nodeIndex === pressedFT.nodeIndex) {
                const fn = flatNodes[nodeIndex];
                if (!fn || fn.key !== pressedFT.nodeKey) {
                  this.lastFileTreeClick = null;
                } else {
                  const DOUBLE_PRESS_MS = 500;
                  const last = this.lastFileTreeClick;
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
                    this.lastFileTreeClick = null;
                  } else {
                    this.lastFileTreeClick = Object.freeze({
                      id: fte.id,
                      nodeIndex,
                      nodeKey: fn.key,
                      timeMs: event.timeMs,
                    });
                  }
                  localNeedsRender = true;
                }
              } else {
                this.lastFileTreeClick = null;
              }
            }
          }
        } else if (event.mouseKind === 4) {
          this.pressedFileTree = null;
        }
      } else if (event.mouseKind === 4) {
        this.pressedFileTree = null;
      }
    }

    // Mouse click for generic tree:
    // - on down: select clicked node (skip right button)
    // - on up: detect double-click and fire onActivate, with optional onToggle for expandable nodes
    if (event.kind === "mouse" && (event.mouseKind === 3 || event.mouseKind === 4)) {
      const targetId = mouseTargetId;
      if (targetId !== null) {
        const tree = this.treeById.get(targetId);
        const rect = this.rectById.get(targetId);
        if (tree && rect) {
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
            this.pressedTree = null;
            const RIGHT_BUTTON = 1 << 2;
            if ((event.buttons & RIGHT_BUTTON) !== 0) {
              // No right-click behavior for generic tree.
            } else {
              const nodeIndex = computeNodeIndex();
              if (nodeIndex !== null) {
                const fn = flatNodes[nodeIndex];
                if (fn) {
                  if (tree.onSelect) invokeCallbackSafely(tree.onSelect, fn.node as unknown);
                  this.treeStore.set(tree.id, { focusedKey: fn.key });
                  this.pressedTree = Object.freeze({
                    id: tree.id,
                    nodeIndex,
                    nodeKey: fn.key,
                  });
                  localNeedsRender = true;
                }
              } else {
                this.pressedTree = null;
                this.lastTreeClick = null;
              }
            }
          } else {
            const pressedTree = this.pressedTree;
            this.pressedTree = null;

            if (pressedTree && pressedTree.id === tree.id) {
              const nodeIndex = computeNodeIndex();
              if (nodeIndex !== null && nodeIndex === pressedTree.nodeIndex) {
                const fn = flatNodes[nodeIndex];
                if (!fn || fn.key !== pressedTree.nodeKey) {
                  this.lastTreeClick = null;
                } else {
                  const DOUBLE_PRESS_MS = 500;
                  const last = this.lastTreeClick;
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
                    this.lastTreeClick = null;
                  } else {
                    this.lastTreeClick = Object.freeze({
                      id: tree.id,
                      nodeIndex,
                      nodeKey: fn.key,
                      timeMs: event.timeMs,
                    });
                  }
                  localNeedsRender = true;
                }
              } else {
                this.lastTreeClick = null;
              }
            }
          }
        } else if (event.mouseKind === 4) {
          this.pressedTree = null;
        }
      } else if (event.mouseKind === 4) {
        this.pressedTree = null;
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

              const effectiveScrollTop = clampIndexScrollTopForRows(
                state.scrollTop,
                flatNodes.length,
                rect.h,
              );
              const idx = effectiveScrollTop + localY;
              const fn = flatNodes[idx];
              if (fn) {
                invokeCallbackSafely(fte.onContextMenu, fn.node);
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
        const link = this.linkById.get(res.action.id);
        if (link?.onPress) link.onPress();
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
          const current = this.readInputSnapshot(meta);
          const history = this.getInputUndoStack(instanceId);

          if (
            event.kind === "key" &&
            (event.action === "down" || event.action === "repeat") &&
            (event.mods & ZR_MOD_CTRL) !== 0
          ) {
            const isShift = (event.mods & ZR_MOD_SHIFT) !== 0;

            if (event.key === 67 /* C */ || event.key === 88 /* X */) {
              const selected = getInputSelectionText(
                current.value,
                current.selectionStart,
                current.selectionEnd,
              );
              if (selected && selected.length > 0) {
                this.writeSelectedTextToClipboard(selected);
                if (event.key === 88 /* X */) {
                  const selection = normalizeInputSelection(
                    current.value,
                    current.selectionStart,
                    current.selectionEnd,
                  );
                  if (selection) {
                    const start = Math.min(selection.start, selection.end);
                    const end = Math.max(selection.start, selection.end);
                    const nextValue = current.value.slice(0, start) + current.value.slice(end);
                    const nextCursor = normalizeInputCursor(nextValue, start);
                    const next: InputEditorSnapshot = Object.freeze({
                      value: nextValue,
                      cursor: nextCursor,
                      selectionStart: null,
                      selectionEnd: null,
                    });
                    this.applyInputSnapshot(instanceId, next);
                    history.push(current, next, event.timeMs, false);

                    if (meta.onInput) meta.onInput(next.value, next.cursor);
                    const action: RoutedAction = Object.freeze({
                      id: focusedId,
                      action: "input",
                      value: next.value,
                      cursor: next.cursor,
                    });
                    return Object.freeze({ needsRender: true, action });
                  }
                }
                return ROUTE_NO_RENDER;
              }
            }

            if (event.key === 90 /* Z */ || event.key === 89 /* Y */) {
              const snap =
                event.key === 89 || isShift ? history.redoSnapshot() : history.undoSnapshot();
              if (snap) {
                this.applyInputSnapshot(instanceId, snap);
                if (meta.onInput) meta.onInput(snap.value, snap.cursor);
                const action: RoutedAction = Object.freeze({
                  id: focusedId,
                  action: "input",
                  value: snap.value,
                  cursor: snap.cursor,
                });
                return Object.freeze({ needsRender: true, action });
              }
              return ROUTE_NO_RENDER;
            }
          }

          const edit = applyInputEditEvent(event, {
            id: focusedId,
            value: current.value,
            cursor: current.cursor,
            selectionStart: current.selectionStart,
            selectionEnd: current.selectionEnd,
            multiline: meta.multiline,
          });
          if (edit) {
            const next: InputEditorSnapshot = Object.freeze({
              value: edit.nextValue,
              cursor: edit.nextCursor,
              selectionStart: edit.nextSelectionStart,
              selectionEnd: edit.nextSelectionEnd,
            });
            this.applyInputSnapshot(instanceId, next);
            if (edit.action) {
              history.push(current, next, event.timeMs, event.kind === "text");
              if (meta.onInput) meta.onInput(edit.action.value, edit.action.cursor);
              return Object.freeze({ needsRender: true, action: edit.action });
            }
            return ROUTE_RENDER;
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
    if (this.hasActivePositionTransitions) return false;
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

  private propagateDirtyFromPredicate(
    runtimeRoot: RuntimeInstance,
    isNodeDirty: (node: RuntimeInstance) => boolean,
  ): void {
    this._pooledRuntimeStack.length = 0;
    this._pooledPrevRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);

    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;
      this._pooledPrevRuntimeStack.push(node);
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }

    for (let i = this._pooledPrevRuntimeStack.length - 1; i >= 0; i--) {
      const node = this._pooledPrevRuntimeStack[i];
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
    this._pooledPrevRuntimeStack.length = 0;
  }

  private markLayoutDirtyNodes(runtimeRoot: RuntimeInstance): void {
    this.propagateDirtyFromPredicate(runtimeRoot, (node) => {
      const nextRect = this._pooledRectByInstanceId.get(node.instanceId);
      if (!nextRect) return false;
      const prevRect = this._prevFrameRectByInstanceId.get(node.instanceId);
      return !prevRect || !rectEquals(nextRect, prevRect);
    });
  }

  private collectSelfDirtyInstanceIds(runtimeRoot: RuntimeInstance, out: InstanceId[]): void {
    out.length = 0;
    this._pooledRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);

    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;
      if (node.selfDirty) out.push(node.instanceId);
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }
  }

  private markTransientDirtyNodes(
    runtimeRoot: RuntimeInstance,
    prevFocusedId: string | null,
    nextFocusedId: string | null,
    includeSpinners: boolean,
  ): void {
    if (prevFocusedId === nextFocusedId && !includeSpinners) return;
    this.propagateDirtyFromPredicate(runtimeRoot, (node) => {
      if (includeSpinners && node.vnode.kind === "spinner") return true;
      if (prevFocusedId === null && nextFocusedId === null) return false;
      const id = (node.vnode as { props?: { id?: unknown } }).props?.id;
      if (typeof id !== "string" || id.length === 0) return false;
      return id === prevFocusedId || id === nextFocusedId;
    });
  }

  private clearRuntimeDirtyNodes(runtimeRoot: RuntimeInstance): void {
    this._pooledRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;
      node.dirty = false;
      node.selfDirty = false;
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }
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

  private resolveRuntimeCursorSummary(
    cursorInfo: CursorInfo | undefined,
  ): RuntimeBreadcrumbCursorSummary | null {
    if (!cursorInfo || !this.useV2Cursor) return null;

    const hidden: RuntimeBreadcrumbCursorSummary = Object.freeze({
      visible: false,
      shape: cursorInfo.shape,
      blink: cursorInfo.blink,
    });

    const focusedId = this.focusState.focusedId;
    if (!focusedId) return hidden;

    const input = this.inputById.get(focusedId);
    if (input && !input.disabled) {
      const rect = this._pooledRectByInstanceId.get(input.instanceId);
      if (!rect || rect.w <= 1 || rect.h <= 0) return hidden;

      const graphemeOffset =
        this.inputCursorByInstanceId.get(input.instanceId) ?? input.value.length;
      let cursorX = 0;
      let cursorY = rect.y;
      if (input.multiline) {
        const contentW = Math.max(1, rect.w - 2);
        const resolved = resolveInputMultilineCursor(
          input.value,
          graphemeOffset,
          contentW,
          input.wordWrap,
        );
        const maxStartVisual = Math.max(0, resolved.totalVisualLines - rect.h);
        const startVisual = Math.max(0, Math.min(maxStartVisual, resolved.visualLine - rect.h + 1));
        const localY = resolved.visualLine - startVisual;
        if (localY < 0 || localY >= rect.h) return hidden;
        cursorX = Math.max(0, Math.min(Math.max(0, rect.w - 2), resolved.visualX));
        cursorY = rect.y + localY;
      } else {
        cursorX = Math.max(
          0,
          Math.min(Math.max(0, rect.w - 2), measureTextCells(input.value.slice(0, graphemeOffset))),
        );
      }
      return Object.freeze({
        visible: true,
        x: rect.x + 1 + cursorX,
        y: cursorY,
        shape: cursorInfo.shape,
        blink: cursorInfo.blink,
      });
    }

    const editor = this.codeEditorById.get(focusedId);
    if (editor) {
      const rect = this.rectById.get(editor.id);
      if (!rect || rect.w <= 0 || rect.h <= 0) return hidden;
      const lineNumWidth =
        this.codeEditorRenderCacheById.get(editor.id)?.lineNumWidth ??
        (editor.lineNumbers === false ? 0 : Math.max(4, String(editor.lines.length).length + 1));
      const cy = editor.cursor.line - editor.scrollTop;
      if (cy < 0 || cy >= rect.h) return hidden;
      const cx = editor.cursor.column - editor.scrollLeft;
      const x = rect.x + lineNumWidth + cx;
      if (x < rect.x + lineNumWidth || x >= rect.x + rect.w) return hidden;
      return Object.freeze({
        visible: true,
        x,
        y: rect.y + cy,
        shape: cursorInfo.shape,
        blink: cursorInfo.blink,
      });
    }

    const palette = this.commandPaletteById.get(focusedId);
    if (palette?.open === true) {
      const rect = this.rectById.get(palette.id);
      if (!rect || rect.w <= 0 || rect.h <= 0) return hidden;
      const inputW = Math.max(0, rect.w - 6);
      if (inputW <= 0) return hidden;
      const qx = measureTextCells(palette.query);
      return Object.freeze({
        visible: true,
        x: rect.x + 4 + Math.min(qx, Math.max(0, inputW - 1)),
        y: rect.y + 1,
        shape: cursorInfo.shape,
        blink: cursorInfo.blink,
      });
    }

    return hidden;
  }

  private emitIncrementalCursor(
    cursorInfo: CursorInfo | undefined,
  ): RuntimeBreadcrumbCursorSummary | null {
    if (!cursorInfo || !this.useV2Cursor || !isV2Builder(this.builder)) {
      return this.collectRuntimeBreadcrumbs ? this.resolveRuntimeCursorSummary(cursorInfo) : null;
    }

    const focusedId = this.focusState.focusedId;
    if (!focusedId) {
      this.builder.hideCursor();
      return this.collectRuntimeBreadcrumbs ? this.resolveRuntimeCursorSummary(cursorInfo) : null;
    }

    const input = this.inputById.get(focusedId);
    if (!input || input.disabled) {
      this.builder.hideCursor();
      return this.collectRuntimeBreadcrumbs ? this.resolveRuntimeCursorSummary(cursorInfo) : null;
    }

    const rect = this._pooledRectByInstanceId.get(input.instanceId);
    if (!rect || rect.w <= 1 || rect.h <= 0) {
      this.builder.hideCursor();
      return this.collectRuntimeBreadcrumbs ? this.resolveRuntimeCursorSummary(cursorInfo) : null;
    }

    const graphemeOffset = this.inputCursorByInstanceId.get(input.instanceId) ?? input.value.length;
    let cursorX = 0;
    let cursorY = rect.y;
    if (input.multiline) {
      const contentW = Math.max(1, rect.w - 2);
      const resolved = resolveInputMultilineCursor(
        input.value,
        graphemeOffset,
        contentW,
        input.wordWrap,
      );
      const maxStartVisual = Math.max(0, resolved.totalVisualLines - rect.h);
      const startVisual = Math.max(0, Math.min(maxStartVisual, resolved.visualLine - rect.h + 1));
      const localY = resolved.visualLine - startVisual;
      if (localY < 0 || localY >= rect.h) {
        this.builder.hideCursor();
        return this.collectRuntimeBreadcrumbs ? this.resolveRuntimeCursorSummary(cursorInfo) : null;
      }
      cursorX = Math.max(0, Math.min(Math.max(0, rect.w - 2), resolved.visualX));
      cursorY = rect.y + localY;
    } else {
      cursorX = Math.max(
        0,
        Math.min(Math.max(0, rect.w - 2), measureTextCells(input.value.slice(0, graphemeOffset))),
      );
    }
    this.builder.setCursor({
      x: rect.x + 1 + cursorX,
      y: cursorY,
      shape: cursorInfo.shape,
      visible: true,
      blink: cursorInfo.blink,
    });

    return this.collectRuntimeBreadcrumbs ? this.resolveRuntimeCursorSummary(cursorInfo) : null;
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
    if (!this.collectRuntimeBreadcrumbs) return;
    const activeTrapId =
      this.focusState.trapStack.length > 0
        ? (this.focusState.trapStack[this.focusState.trapStack.length - 1] ?? null)
        : null;
    this._runtimeBreadcrumbs = Object.freeze({
      focus: Object.freeze({
        focusedId: this.focusState.focusedId,
        activeZoneId: this.focusState.activeZoneId,
        activeTrapId,
        announcement: this.getFocusAnnouncement(),
      }),
      cursor: params.cursor,
      damage: Object.freeze({
        mode: params.damageMode,
        rectCount: Math.max(0, params.damageRectCount),
        area: Math.max(0, params.damageArea),
      }),
      frame: Object.freeze({
        tick: params.tick,
        commit: params.commit,
        layout: params.layout,
        incremental: params.incremental,
        renderTimeMs: 0,
      }),
    });
  }

  private appendDamageRectForInstanceId(instanceId: InstanceId): boolean {
    const current = this._pooledDamageRectByInstanceId.get(instanceId);
    const prev = this._prevFrameDamageRectByInstanceId.get(instanceId);
    if (isNonEmptyRect(current) && isNonEmptyRect(prev)) {
      this._pooledDamageRects.push(unionRect(current, prev));
      return true;
    }
    if (isNonEmptyRect(current)) {
      this._pooledDamageRects.push(current);
      return true;
    }
    if (isNonEmptyRect(prev)) {
      this._pooledDamageRects.push(prev);
      return true;
    }
    return false;
  }

  private appendDamageRectForId(id: string): boolean {
    const current = this._pooledDamageRectById.get(id);
    const prev = this._prevFrameDamageRectById.get(id);
    if (isNonEmptyRect(current) && isNonEmptyRect(prev)) {
      this._pooledDamageRects.push(unionRect(current, prev));
      return true;
    }
    if (isNonEmptyRect(current)) {
      this._pooledDamageRects.push(current);
      return true;
    }
    if (isNonEmptyRect(prev)) {
      this._pooledDamageRects.push(prev);
      return true;
    }
    return false;
  }

  private refreshDamageRectIndexesForLayoutSkippedCommit(runtimeRoot: RuntimeInstance): void {
    this._pooledDamageRectByInstanceId.clear();
    this._pooledDamageRectById.clear();
    this._pooledRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);

    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;

      const rect = this._pooledRectByInstanceId.get(node.instanceId);
      if (rect) {
        const damageRect = getRuntimeNodeDamageRect(node, rect);
        this._pooledDamageRectByInstanceId.set(node.instanceId, damageRect);
        const id = (node.vnode as { props?: { id?: unknown } }).props?.id;
        if (typeof id === "string" && id.length > 0 && !this._pooledDamageRectById.has(id)) {
          this._pooledDamageRectById.set(id, damageRect);
        }
      }

      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }
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

  private appendDamageRectsForFocusAnnouncers(runtimeRoot: RuntimeInstance): boolean {
    this._pooledRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;
      if (node.vnode.kind === "focusAnnouncer") {
        if (!this.appendDamageRectForInstanceId(node.instanceId)) {
          return false;
        }
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }
    return true;
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

  private snapshotRenderedFrameState(
    runtimeRoot: RuntimeInstance,
    viewport: Viewport,
    theme: Theme,
    doLayout: boolean,
    focusAnnouncement: string | null,
  ): void {
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
    this._prevFrameDamageRectByInstanceId.clear();
    for (const [instanceId, rect] of this._pooledDamageRectByInstanceId) {
      this._prevFrameDamageRectByInstanceId.set(instanceId, rect);
    }
    this._prevFrameDamageRectById.clear();
    for (const [id, rect] of this._pooledDamageRectById) {
      this._prevFrameDamageRectById.set(id, rect);
    }
    this._prevFrameOpacityByInstanceId.clear();
    this._pooledRuntimeStack.length = 0;
    this._pooledRuntimeStack.push(runtimeRoot);
    while (this._pooledRuntimeStack.length > 0) {
      const node = this._pooledRuntimeStack.pop();
      if (!node) continue;
      if (node.vnode.kind === "box") {
        this._prevFrameOpacityByInstanceId.set(node.instanceId, this.readBoxOpacity(node));
      }
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (child) this._pooledRuntimeStack.push(child);
      }
    }
    this._hasRenderedFrame = true;
    this._lastRenderedViewport = Object.freeze({ cols: viewport.cols, rows: viewport.rows });
    this._lastRenderedThemeRef = theme;
    this._lastRenderedFocusedId = this.focusState.focusedId;
    this._lastRenderedFocusAnnouncement = focusAnnouncement;
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

      let commitRes: CommitOk | null = null;
      let prevFocusedIdBeforeFinalize: string | null = null;
      const prevActiveZoneIdBeforeSubmit = this.focusState.activeZoneId;
      const prevZoneMetaByIdBeforeSubmit = this.zoneMetaById;
      const prevCommittedRoot = this.committedRoot;
      const hadRoutingWidgets = this.hadRoutingWidgets;
      let hasRoutingWidgets = hadRoutingWidgets;
      let didRoutingRebuild = false;
      let identityDamageFromCommit: IdentityDiffDamageResult | null = null;
      let layoutDirtyVNodeSet: Set<VNode> | null = null;

      if (doCommit) {
        let commitReadViewport = false;
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
        for (const unmountedId of commitRes.unmountedInstanceIds) {
          this.inputCursorByInstanceId.delete(unmountedId);
          this.inputSelectionByInstanceId.delete(unmountedId);
          this.inputWorkingValueByInstanceId.delete(unmountedId);
          this.inputUndoByInstanceId.delete(unmountedId);
          this.positionTransitionTrackByInstanceId.delete(unmountedId);
          this.animatedRectByInstanceId.delete(unmountedId);
          this.animatedOpacityByInstanceId.delete(unmountedId);
          this._prevFrameOpacityByInstanceId.delete(unmountedId);
          // Composite instances: invalidate stale closures and run effect cleanups.
          this.compositeRegistry.incrementGeneration(unmountedId);
          this.compositeRegistry.delete(unmountedId);
        }

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
        const layoutRes = layout(
          this.committedRoot.vnode,
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
        this.toastContainers = Object.freeze(this._pooledToastContainers.slice());

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

      const frameNowMs =
        typeof plan.nowMs === "number" && Number.isFinite(plan.nowMs)
          ? plan.nowMs
          : monotonicNowMs();
      if (doCommit || doLayout || this.positionTransitionTrackByInstanceId.size > 0) {
        this.refreshPositionTransitionTracks(this.committedRoot, this.layoutTree, frameNowMs);
      }
      this.rebuildAnimatedRectOverrides(this.committedRoot, this.layoutTree, frameNowMs);
      if (this.hasActivePositionTransitions) {
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
