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
import {
  BACKEND_BEGIN_FRAME_MARKER,
  BACKEND_RAW_WRITE_MARKER,
  type BackendBeginFrame,
  type BackendRawWrite,
  FRAME_ACCEPTED_ACK_MARKER,
  type RuntimeBackend,
} from "../backend.js";
import { isConstraintExpr } from "../constraints/expr.js";
import {
  type ConstraintGraph,
  type ConstraintGraphError,
  type ConstraintNodeProp,
  buildConstraintGraph,
} from "../constraints/graph.js";
import {
  ConstraintResolutionCache,
  type RefValuesInput,
  type ResolvedConstraintValues,
  resolveConstraints,
} from "../constraints/resolver.js";
import { CURSOR_DEFAULTS } from "../cursor/index.js";
import { type DrawlistBuilder, createDrawlistBuilder } from "../drawlist/index.js";
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
import { hitTestAnyId, hitTestFocusable } from "../layout/hitTest.js";
import { type LayoutTree, layout, measure } from "../layout/layout.js";
import {
  type ResponsiveBreakpointThresholds,
  getResponsiveViewport,
  normalizeBreakpointThresholds,
  setResponsiveViewport,
} from "../layout/responsive.js";
import { measureTextCells } from "../layout/textMeasure.js";
import type { Rect } from "../layout/types.js";
import { FRAME_AUDIT_ENABLED, drawlistFingerprint, emitFrameAudit } from "../perf/frameAudit.js";
import {
  PERF_DETAIL_ENABLED,
  PERF_ENABLED,
  perfCount,
  perfMarkEnd,
  perfMarkStart,
  perfNow,
} from "../perf/perf.js";
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
  type RuntimeBreadcrumbConstraintsSummary,
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
        | "ZRUI_INVALID_PROPS"
        | "ZRUI_INVALID_CONSTRAINT"
        | "ZRUI_CIRCULAR_CONSTRAINT";
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
  try {
    return String(v);
  } catch {
    return "[unstringifiable thrown value]";
  }
}

function invokeCallbackSafely<TArgs extends readonly unknown[]>(
  callback: ((...args: TArgs) => void) | undefined,
  ...args: TArgs
): boolean {
  if (typeof callback !== "function") return false;
  try {
    callback(...args);
    return true;
  } catch (e) {
    if (DEV_MODE) {
      const message = describeThrown(e);
      warnDev(`[rezi] widget callback threw: ${message}`);
    }
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
const EMPTY_INSTANCE_ID_ARRAY: readonly InstanceId[] = Object.freeze([]);
const CONSTRAINT_NODE_PROPS: readonly ConstraintNodeProp[] = Object.freeze([
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "flexBasis",
  "display",
]);
const CONSTRAINT_RESOLUTION_NONE = Object.freeze({ kind: "none" as const });
const CONSTRAINT_RESOLUTION_REUSED = Object.freeze({ kind: "reused" as const });
const CONSTRAINT_RESOLUTION_CACHE_HIT = Object.freeze({ kind: "cacheHit" as const });
const CONSTRAINT_RESOLUTION_COMPUTED = Object.freeze({ kind: "computed" as const });
const EMPTY_CONSTRAINT_BREADCRUMBS: RuntimeBreadcrumbConstraintsSummary = Object.freeze({
  enabled: false,
  graphFingerprint: 0,
  nodeCount: 0,
  cacheKey: null,
  resolution: CONSTRAINT_RESOLUTION_NONE,
  hiddenInstanceCount: 0,
  focused: null,
});
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
const FRAME_AUDIT_TREE_ENABLED =
  FRAME_AUDIT_ENABLED &&
  (
    globalThis as {
      process?: { env?: { REZI_FRAME_AUDIT_TREE?: string } };
    }
  ).process?.env?.REZI_FRAME_AUDIT_TREE === "1";

function warnDev(message: string): void {
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

function isVNodeLike(v: unknown): boolean {
  return typeof v === "object" && v !== null && "kind" in v;
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

function pushLimited(list: string[], value: string, max: number): void {
  if (list.length >= max) return;
  list.push(value);
}

function normalizeAuditText(value: string, maxChars = 96): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

function describeAuditVNode(vnode: VNode): string {
  const kind = vnode.kind;
  const props = vnode.props as Readonly<{ id?: unknown; title?: unknown }> | undefined;
  const id = typeof props?.id === "string" && props.id.length > 0 ? props.id : null;
  const title =
    typeof props?.title === "string" && props.title.length > 0
      ? normalizeAuditText(props.title, 24)
      : null;
  if (id !== null) return `${kind}#${id}`;
  if (title !== null) return `${kind}[${title}]`;
  return kind;
}

function summarizeRuntimeTreeForAudit(
  root: RuntimeInstance,
  layoutRoot: LayoutTree,
): Readonly<Record<string, unknown>> {
  const kindCounts = new Map<string, number>();
  const zeroAreaKindCounts = new Map<string, number>();
  const textSamples: string[] = [];
  const titleSamples: string[] = [];
  const titleRectSamples: string[] = [];
  const zeroAreaTitleSamples: string[] = [];
  const mismatchSamples: string[] = [];
  const needleHits = new Set<string>();
  const needles = [
    "Engineering Controls",
    "Subsystem Tree",
    "Crew Manifest",
    "Search Crew",
    "Channel Controls",
    "Ship Settings",
  ];

  let nodeCount = 0;
  let textNodeCount = 0;
  let boxTitleCount = 0;
  let compositeNodeCount = 0;
  let zeroAreaNodes = 0;
  let maxDepth = 0;
  let maxChildrenDelta = 0;

  const stack: Array<
    Readonly<{ node: RuntimeInstance; layout: LayoutTree; depth: number; path: string }>
  > = [Object.freeze({ node: root, layout: layoutRoot, depth: 0, path: "root" })];
  const rootRect = layoutRoot.rect;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const { node, layout, depth, path } = current;
    nodeCount += 1;
    if (depth > maxDepth) maxDepth = depth;

    const kind = node.vnode.kind;
    const layoutKind = layout.vnode.kind;
    kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    if ("__composite" in (node.vnode as object)) {
      compositeNodeCount += 1;
    }
    if (kind !== layoutKind) {
      const runtimeLabel = describeAuditVNode(node.vnode);
      const layoutLabel = describeAuditVNode(layout.vnode);
      pushLimited(mismatchSamples, `${path}:${runtimeLabel}!${layoutLabel}`, 24);
    }

    const rect = layout.rect;
    if (rect.w <= 0 || rect.h <= 0) {
      zeroAreaNodes += 1;
      zeroAreaKindCounts.set(kind, (zeroAreaKindCounts.get(kind) ?? 0) + 1);
    }

    if (kind === "text") {
      textNodeCount += 1;
      const text = (node.vnode as Readonly<{ text: string }>).text;
      pushLimited(textSamples, normalizeAuditText(text), 24);
      for (const needle of needles) {
        if (text.includes(needle)) needleHits.add(needle);
      }
    } else {
      const props = node.vnode.props as Readonly<{ title?: unknown }> | undefined;
      if (typeof props?.title === "string" && props.title.length > 0) {
        boxTitleCount += 1;
        pushLimited(titleSamples, normalizeAuditText(props.title), 24);
        const offRoot =
          rect.x + rect.w <= rootRect.x ||
          rect.y + rect.h <= rootRect.y ||
          rect.x >= rootRect.x + rootRect.w ||
          rect.y >= rootRect.y + rootRect.h;
        const titleRectSummary = `${normalizeAuditText(props.title, 48)}@${String(rect.x)},${String(rect.y)},${String(rect.w)},${String(rect.h)}${offRoot ? ":off-root" : ""}`;
        pushLimited(titleRectSamples, titleRectSummary, 24);
        if (rect.w <= 0 || rect.h <= 0) {
          pushLimited(zeroAreaTitleSamples, titleRectSummary, 24);
        }
        for (const needle of needles) {
          if (props.title.includes(needle)) needleHits.add(needle);
        }
      }
    }

    const childCount = Math.min(node.children.length, layout.children.length);
    const delta = Math.abs(node.children.length - layout.children.length);
    if (delta > 0) {
      const id = (node.vnode.props as Readonly<{ id?: unknown }> | undefined)?.id;
      const props = node.vnode.props as Readonly<{ title?: unknown }> | undefined;
      const label =
        typeof id === "string" && id.length > 0
          ? `${kind}#${id}`
          : typeof props?.title === "string" && props.title.length > 0
            ? `${kind}[${normalizeAuditText(props.title, 32)}]`
            : kind;
      pushLimited(
        mismatchSamples,
        `${path}/${label}:runtimeChildren=${String(node.children.length)} layoutChildren=${String(layout.children.length)} layoutNode=${describeAuditVNode(layout.vnode)}`,
        24,
      );
    }
    if (delta > maxChildrenDelta) maxChildrenDelta = delta;
    for (let i = childCount - 1; i >= 0; i--) {
      const child = node.children[i];
      const childLayout = layout.children[i];
      if (!child || !childLayout) continue;
      stack.push(
        Object.freeze({
          node: child,
          layout: childLayout,
          depth: depth + 1,
          path: `${path}/${child.vnode.kind}[${String(i)}]`,
        }),
      );
    }
  }

  const topKinds = Object.fromEntries(
    [...kindCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  );
  const topZeroAreaKinds = Object.fromEntries(
    [...zeroAreaKindCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12),
  );

  return Object.freeze({
    nodeCount,
    textNodeCount,
    boxTitleCount,
    compositeNodeCount,
    zeroAreaNodes,
    maxDepth,
    maxChildrenDelta,
    topKinds,
    topZeroAreaKinds,
    textSamples,
    titleSamples,
    titleRectSamples,
    zeroAreaTitleSamples,
    mismatchSamples,
    needleHits: [...needleHits].sort(),
  });
}

type RuntimeLayoutShapeMismatch = Readonly<{
  path: string;
  depth: number;
  reason: "kind" | "children";
  runtimeKind: string;
  layoutKind: string;
  runtimeChildCount: number;
  layoutChildCount: number;
  runtimeTrail: readonly string[];
  layoutTrail: readonly string[];
}>;

function findRuntimeLayoutShapeMismatch(
  root: RuntimeInstance,
  layoutRoot: LayoutTree,
): RuntimeLayoutShapeMismatch | null {
  const queue: Array<
    Readonly<{
      runtimeNode: RuntimeInstance;
      layoutNode: LayoutTree;
      path: string;
      depth: number;
      runtimeTrail: readonly string[];
      layoutTrail: readonly string[];
    }>
  > = [
    Object.freeze({
      runtimeNode: root,
      layoutNode: layoutRoot,
      path: "root",
      depth: 0,
      runtimeTrail: Object.freeze([describeAuditVNode(root.vnode)]),
      layoutTrail: Object.freeze([describeAuditVNode(layoutRoot.vnode)]),
    }),
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const { runtimeNode, layoutNode, path, depth, runtimeTrail, layoutTrail } = current;
    const runtimeKind = runtimeNode.vnode.kind;
    const layoutKind = layoutNode.vnode.kind;
    const runtimeChildCount = runtimeNode.children.length;
    const layoutChildCount = layoutNode.children.length;
    if (runtimeKind !== layoutKind) {
      return Object.freeze({
        path,
        depth,
        reason: "kind",
        runtimeKind,
        layoutKind,
        runtimeChildCount,
        layoutChildCount,
        runtimeTrail,
        layoutTrail,
      });
    }
    if (runtimeChildCount !== layoutChildCount) {
      return Object.freeze({
        path,
        depth,
        reason: "children",
        runtimeKind,
        layoutKind,
        runtimeChildCount,
        layoutChildCount,
        runtimeTrail,
        layoutTrail,
      });
    }

    for (let i = 0; i < runtimeChildCount; i++) {
      const runtimeChild = runtimeNode.children[i];
      const layoutChild = layoutNode.children[i];
      if (!runtimeChild || !layoutChild) {
        return Object.freeze({
          path: `${path}/${runtimeChild ? runtimeChild.vnode.kind : "missing"}[${String(i)}]`,
          depth: depth + 1,
          reason: "children",
          runtimeKind: runtimeChild?.vnode.kind ?? "<missing>",
          layoutKind: layoutChild?.vnode.kind ?? "<missing>",
          runtimeChildCount: runtimeChild?.children.length ?? -1,
          layoutChildCount: layoutChild?.children.length ?? -1,
          runtimeTrail,
          layoutTrail,
        });
      }
      const nextRuntimeTrail = Object.freeze([
        ...runtimeTrail.slice(-11),
        describeAuditVNode(runtimeChild.vnode),
      ]);
      const nextLayoutTrail = Object.freeze([
        ...layoutTrail.slice(-11),
        describeAuditVNode(layoutChild.vnode),
      ]);
      queue.push(
        Object.freeze({
          runtimeNode: runtimeChild,
          layoutNode: layoutChild,
          path: `${path}/${runtimeChild.vnode.kind}[${String(i)}]`,
          depth: depth + 1,
          runtimeTrail: nextRuntimeTrail,
          layoutTrail: nextLayoutTrail,
        }),
      );
    }
  }

  return null;
}

function hasRuntimeLayoutShapeMismatch(root: RuntimeInstance, layoutRoot: LayoutTree): boolean {
  const runtimeStack: RuntimeInstance[] = [root];
  const layoutStack: LayoutTree[] = [layoutRoot];

  while (runtimeStack.length > 0 && layoutStack.length > 0) {
    const runtimeNode = runtimeStack.pop();
    const layoutNode = layoutStack.pop();
    if (!runtimeNode || !layoutNode) continue;

    if (runtimeNode.vnode.kind !== layoutNode.vnode.kind) return true;
    if (runtimeNode.children.length !== layoutNode.children.length) return true;

    for (let i = runtimeNode.children.length - 1; i >= 0; i--) {
      const runtimeChild = runtimeNode.children[i];
      const layoutChild = layoutNode.children[i];
      if (!runtimeChild || !layoutChild) return true;
      runtimeStack.push(runtimeChild);
      layoutStack.push(layoutChild);
    }
  }

  return runtimeStack.length !== layoutStack.length;
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
  private readonly builder: DrawlistBuilder;
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
  private _constraintGraph: ConstraintGraph | null = null;
  private _constraintInputKey: string | null = null;
  private _constraintValuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null =
    null;
  private _constraintInputSignatureValid = false;
  private readonly _constraintInputSignature: number[] = [];
  private readonly _constraintResolutionCache = new ConstraintResolutionCache(8);
  private _constraintHasStaticHiddenDisplay = false;
  private _constraintAffectedPathInstanceIds: ReadonlySet<InstanceId> = new Set<InstanceId>();
  private _constraintNodesWithAffectedDescendants: ReadonlySet<InstanceId> = new Set<InstanceId>();
  private _hiddenConstraintInstanceIds: ReadonlySet<InstanceId> = new Set<InstanceId>();
  private _hiddenConstraintWidgetIds: ReadonlySet<string> = new Set<string>();
  private readonly _pooledConstraintBaseValues = new Map<InstanceId, ResolvedConstraintValues>();
  private readonly _pooledConstraintParentValues = new Map<InstanceId, RefValuesInput>();
  private readonly _pooledConstraintIntrinsicValues = new Map<InstanceId, RefValuesInput>();
  private readonly _pooledConstraintParentByInstanceId = new Map<InstanceId, InstanceId | null>();
  private readonly _pooledConstraintAffectedPathInstanceIds = new Set<InstanceId>();
  private readonly _pooledConstraintNodesWithAffectedDescendants = new Set<InstanceId>();
  private readonly _pooledConstraintRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledConstraintParentStack: Array<InstanceId | null> = [];
  private readonly _pooledConstraintAxisStack: Array<"row" | "column"> = [];
  private readonly _pooledConstraintVisibilityStack: boolean[] = [];
  private readonly _pooledHiddenConstraintInstanceIds = new Set<InstanceId>();
  private readonly _pooledHiddenConstraintWidgetIds = new Set<string>();
  private readonly _pooledCloseOnEscape = new Map<string, boolean>();
  private readonly _pooledCloseOnBackdrop = new Map<string, boolean>();
  private readonly _pooledOnClose = new Map<string, () => void>();
  private readonly _pooledToastActionByFocusId = new Map<string, () => void>();
  private readonly _pooledToastActionLabelByFocusId = new Map<string, string>();
  private readonly _pooledLayoutStack: LayoutTree[] = [];
  private readonly _pooledRuntimeStack: RuntimeInstance[] = [];
  private readonly _pooledRuntimeParentKindStack: (string | undefined)[] = [];
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
  private _constraintBreadcrumbs: RuntimeBreadcrumbConstraintsSummary | null = null;
  private _constraintExprIndexByInstanceId: ReadonlyMap<
    InstanceId,
    readonly Readonly<{ prop: string; source: string }>[]
  > | null = null;
  private _constraintLastResolution:
    | Readonly<{ kind: "none" }>
    | Readonly<{ kind: "reused" }>
    | Readonly<{ kind: "cacheHit" }>
    | Readonly<{ kind: "computed" }> = CONSTRAINT_RESOLUTION_NONE;
  private _constraintLastCacheKey: string | null = null;

  constructor(
    opts: Readonly<{
      backend: RuntimeBackend;
      builder?: DrawlistBuilder;
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
    this.builder = createDrawlistBuilder(builderOpts);
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

  private cleanupUnmountedInstanceIds(
    unmountedInstanceIds: readonly InstanceId[],
    opts: Readonly<{ skipIds?: ReadonlySet<InstanceId> }> = {},
  ): void {
    const skipIds = opts.skipIds;
    for (const unmountedId of unmountedInstanceIds) {
      if (skipIds?.has(unmountedId)) continue;
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
    prevLayoutSubtreeByInstanceId: ReadonlyMap<InstanceId, LayoutTree> | null,
  ): void {
    if (pendingExitAnimations.length === 0) return;

    if (!prevLayoutSubtreeByInstanceId) {
      for (const pending of pendingExitAnimations) {
        pending.runDeferredLocalStateCleanup();
        this.cleanupUnmountedInstanceIds(pending.subtreeInstanceIds);
      }
      return;
    }

    const missingLayout = scheduleExitAnimationsImpl({
      pendingExitAnimations,
      frameNowMs,
      layoutSubtreeByInstanceId: prevLayoutSubtreeByInstanceId,
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
      this._constraintBreadcrumbs = null;
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
    type MutableLayoutProps = Record<string, unknown> & {
      display?: boolean;
      width?: number;
      height?: number;
      minWidth?: number;
      maxWidth?: number;
      minHeight?: number;
      maxHeight?: number;
      flex?: number;
      flexBasis?: number;
    };

    const propsRecord = (vnode.props ?? {}) as Readonly<MutableLayoutProps>;
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

  private describeConstraintGraphFatal(fatal: ConstraintGraphError): string {
    if (fatal.code === "ZRUI_CIRCULAR_CONSTRAINT") {
      return `Circular constraint dependency: ${fatal.cycle.join(" -> ")}`;
    }
    return fatal.detail;
  }

  private readWidgetIdFromRuntimeNode(node: RuntimeInstance): string | null {
    const id = (node.vnode.props as Readonly<{ id?: unknown }> | undefined)?.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  }

  private hasConstraintSourceDiff(node: RuntimeInstance, graph: ConstraintGraph): boolean {
    const props = (node.vnode.props ?? {}) as Readonly<Record<string, unknown>>;
    for (const prop of CONSTRAINT_NODE_PROPS) {
      const prev = graph.nodeByKey.get(`${String(node.instanceId)}:${prop}`);
      const prevSource = prev?.expr.source ?? null;
      const nextRaw = props[prop];
      const nextSource = isConstraintExpr(nextRaw) ? nextRaw.source : null;
      if (prevSource !== nextSource) return true;
    }
    return false;
  }

  private hasRuntimeConstraintExpr(node: RuntimeInstance): boolean {
    const props = node.vnode.props as Readonly<Record<string, unknown>> | null | undefined;
    if (props === undefined || props === null) return false;
    for (const prop of CONSTRAINT_NODE_PROPS) {
      if (isConstraintExpr(props[prop])) return true;
    }
    return false;
  }

  private resolveConstraintChildAxis(
    node: RuntimeInstance,
    parentAxis: "row" | "column",
  ): "row" | "column" {
    switch (node.vnode.kind) {
      case "row":
        return "row";
      case "column":
      case "box":
        return "column";
      default:
        return parentAxis;
    }
  }

  private measureConstraintIntrinsicValues(
    node: RuntimeInstance,
    parentW: number,
    parentH: number,
    axis: "row" | "column",
  ): RefValuesInput | null {
    const measured = measure(node.vnode, parentW, parentH, axis);
    if (!measured.ok) return null;
    const w = Math.max(0, Math.floor(measured.value.w));
    const h = Math.max(0, Math.floor(measured.value.h));
    return {
      w,
      h,
      min_w: w,
      min_h: h,
    };
  }

  private shouldRebuildConstraintGraph(
    root: RuntimeInstance,
    prevGraph: ConstraintGraph,
    removedInstanceIds: readonly InstanceId[],
  ): boolean {
    if (removedInstanceIds.length > 0) {
      for (const instanceId of removedInstanceIds) {
        if (
          prevGraph.constrainedInstanceIds.has(instanceId) ||
          prevGraph.instanceIdToWidgetId.has(instanceId)
        ) {
          return true;
        }
      }
    }

    this._pooledConstraintRuntimeStack.length = 0;
    this._pooledConstraintRuntimeStack.push(root);
    while (this._pooledConstraintRuntimeStack.length > 0) {
      const node = this._pooledConstraintRuntimeStack.pop();
      if (!node) continue;
      if (!node.dirty) continue;

      if (node.selfDirty) {
        const prevWidgetId = prevGraph.instanceIdToWidgetId.get(node.instanceId) ?? null;
        const nextWidgetId = this.readWidgetIdFromRuntimeNode(node);
        if (prevWidgetId !== nextWidgetId) {
          return true;
        }
        const hadConstraintExpr = prevGraph.constrainedInstanceIds.has(node.instanceId);
        if (
          (hadConstraintExpr || this.hasRuntimeConstraintExpr(node)) &&
          this.hasConstraintSourceDiff(node, prevGraph)
        ) {
          return true;
        }
      }

      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (!child) continue;
        if (!child.dirty) continue;
        this._pooledConstraintRuntimeStack.push(child);
      }
    }
    return false;
  }

  private buildConstraintResolutionInputs(
    root: RuntimeInstance,
    graph: ConstraintGraph,
    rootW: number,
    rootH: number,
  ): void {
    this._pooledConstraintBaseValues.clear();
    this._pooledConstraintParentValues.clear();
    this._pooledConstraintIntrinsicValues.clear();
    this._pooledConstraintParentByInstanceId.clear();
    this._pooledConstraintRuntimeStack.length = 0;
    this._pooledConstraintParentStack.length = 0;
    this._pooledConstraintAxisStack.length = 0;
    let hasStaticHiddenDisplay = false;
    const requiredInstanceIds = graph.requiredRuntimeInstanceIds;
    const intrinsicInstanceIds = graph.intrinsicRuntimeInstanceIds;
    let remainingRequiredInstanceCount = requiredInstanceIds.size;

    this._pooledConstraintRuntimeStack.push(root);
    this._pooledConstraintParentStack.push(null);
    this._pooledConstraintAxisStack.push("column");
    let head = 0;
    while (head < this._pooledConstraintRuntimeStack.length) {
      const node = this._pooledConstraintRuntimeStack[head];
      const parentInstanceId = this._pooledConstraintParentStack[head] ?? null;
      const axis = this._pooledConstraintAxisStack[head] ?? "column";
      head++;
      if (!node) continue;
      this._pooledConstraintParentByInstanceId.set(node.instanceId, parentInstanceId);

      const needsNodeData = requiredInstanceIds.has(node.instanceId);
      if (needsNodeData) {
        remainingRequiredInstanceCount--;
        const parentRect =
          parentInstanceId === null ? null : this._pooledRectByInstanceId.get(parentInstanceId);
        const parentW = parentRect?.w ?? rootW;
        const parentH = parentRect?.h ?? rootH;
        const displayRaw = (node.vnode.props as Readonly<{ display?: unknown }> | undefined)
          ?.display;
        if (displayRaw === false) hasStaticHiddenDisplay = true;
        const staticDisplay = displayRaw === false ? 0 : displayRaw === true ? 1 : undefined;

        if (graph.constrainedInstanceIds.has(node.instanceId)) {
          this._pooledConstraintParentValues.set(node.instanceId, {
            w: parentW,
            h: parentH,
            min_w: parentW,
            min_h: parentH,
          });
        }

        const rect = this._pooledRectByInstanceId.get(node.instanceId);
        if (rect) {
          const base: {
            width: number;
            height: number;
            minWidth: number;
            minHeight: number;
            display?: number;
          } = {
            width: rect.w,
            height: rect.h,
            minWidth: rect.w,
            minHeight: rect.h,
          };
          if (staticDisplay !== undefined) {
            base.display = staticDisplay;
          }
          this._pooledConstraintBaseValues.set(node.instanceId, {
            ...base,
          });
        } else if (staticDisplay !== undefined) {
          this._pooledConstraintBaseValues.set(node.instanceId, {
            display: staticDisplay,
          });
        }
        if (intrinsicInstanceIds.has(node.instanceId)) {
          const intrinsicValues = this.measureConstraintIntrinsicValues(
            node,
            parentW,
            parentH,
            axis,
          );
          if (intrinsicValues !== null) {
            this._pooledConstraintIntrinsicValues.set(node.instanceId, intrinsicValues);
          }
        }
      }

      if (remainingRequiredInstanceCount === 0) break;
      const childAxis = this.resolveConstraintChildAxis(node, axis);
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (!child) continue;
        this._pooledConstraintRuntimeStack.push(child);
        this._pooledConstraintParentStack.push(node.instanceId);
        this._pooledConstraintAxisStack.push(childAxis);
      }
    }
    this._pooledConstraintRuntimeStack.length = 0;
    this._pooledConstraintParentStack.length = 0;
    this._pooledConstraintAxisStack.length = 0;
    this._constraintHasStaticHiddenDisplay = hasStaticHiddenDisplay;
  }

  private rebuildConstraintHiddenState(
    root: RuntimeInstance,
    valuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null,
  ): void {
    this._pooledHiddenConstraintInstanceIds.clear();
    this._pooledHiddenConstraintWidgetIds.clear();
    this._pooledConstraintRuntimeStack.length = 0;
    this._pooledConstraintVisibilityStack.length = 0;
    this._pooledConstraintRuntimeStack.push(root);
    this._pooledConstraintVisibilityStack.push(false);

    while (this._pooledConstraintRuntimeStack.length > 0) {
      const node = this._pooledConstraintRuntimeStack.pop();
      const parentHidden = this._pooledConstraintVisibilityStack.pop() ?? false;
      if (!node) continue;

      const props = (node.vnode.props ?? {}) as Readonly<{
        id?: unknown;
        display?: unknown;
      }>;
      const displayResolved = valuesByInstanceId?.get(node.instanceId)?.display;
      const hiddenByResolved =
        typeof displayResolved === "number" && Number.isFinite(displayResolved)
          ? displayResolved <= 0
          : false;
      const hiddenByStatic = props.display === false;
      const hidden = parentHidden || hiddenByResolved || hiddenByStatic;

      if (hidden) {
        this._pooledHiddenConstraintInstanceIds.add(node.instanceId);
        const id = props.id;
        if (typeof id === "string" && id.length > 0) {
          this._pooledHiddenConstraintWidgetIds.add(id);
        }
      }

      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i];
        if (!child) continue;
        this._pooledConstraintRuntimeStack.push(child);
        this._pooledConstraintVisibilityStack.push(hidden);
      }
    }

    this._hiddenConstraintInstanceIds = this._pooledHiddenConstraintInstanceIds;
    this._hiddenConstraintWidgetIds = this._pooledHiddenConstraintWidgetIds;
  }

  private rebuildConstraintAffectedPathSet(
    graph: ConstraintGraph,
    hiddenInstanceIds: ReadonlySet<InstanceId>,
  ): void {
    this._pooledConstraintAffectedPathInstanceIds.clear();
    this._pooledConstraintNodesWithAffectedDescendants.clear();

    const addWithAncestors = (instanceId: InstanceId): void => {
      let cursor: InstanceId | null = instanceId;
      while (cursor !== null) {
        this._pooledConstraintAffectedPathInstanceIds.add(cursor);
        const parentInstanceId: InstanceId | null =
          this._pooledConstraintParentByInstanceId.get(cursor) ?? null;
        if (parentInstanceId !== null) {
          this._pooledConstraintNodesWithAffectedDescendants.add(parentInstanceId);
        }
        cursor = parentInstanceId;
      }
    };

    for (const node of graph.nodes) {
      addWithAncestors(node.instanceId);
    }
    for (const instanceId of hiddenInstanceIds) {
      addWithAncestors(instanceId);
    }

    this._constraintAffectedPathInstanceIds = this._pooledConstraintAffectedPathInstanceIds;
    this._constraintNodesWithAffectedDescendants =
      this._pooledConstraintNodesWithAffectedDescendants;
  }

  private hasConstraintInputSignatureChange(
    graph: ConstraintGraph,
    viewport: Viewport,
    rootW: number,
    rootH: number,
  ): boolean {
    const signature = this._constraintInputSignature;
    let index = 0;
    let changed = !this._constraintInputSignatureValid;
    const write = (value: number): void => {
      if (!changed && !Object.is(signature[index], value)) changed = true;
      signature[index] = value;
      index++;
    };
    const writeOrNaN = (value: number | undefined): void => {
      write(value === undefined ? Number.NaN : value);
    };

    write(graph.fingerprint);
    write(viewport.cols);
    write(viewport.rows);
    write(rootW);
    write(rootH);

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      if (!node) continue;
      const base = this._pooledConstraintBaseValues.get(node.instanceId);
      const parent = this._pooledConstraintParentValues.get(node.instanceId);
      const intrinsic = this._pooledConstraintIntrinsicValues.get(node.instanceId);
      write(node.instanceId);
      writeOrNaN(base?.width);
      writeOrNaN(base?.height);
      writeOrNaN(base?.minWidth);
      writeOrNaN(base?.minHeight);
      writeOrNaN(base?.display);
      writeOrNaN(parent?.w);
      writeOrNaN(parent?.h);
      writeOrNaN(parent?.min_w);
      writeOrNaN(parent?.min_h);
      writeOrNaN(intrinsic?.w);
      writeOrNaN(intrinsic?.h);
      writeOrNaN(intrinsic?.min_w);
      writeOrNaN(intrinsic?.min_h);
    }

    if (!changed && signature.length !== index) changed = true;
    signature.length = index;
    this._constraintInputSignatureValid = true;
    return changed;
  }

  private invalidateConstraintInputSignature(): void {
    this._constraintInputSignatureValid = false;
    this._constraintInputSignature.length = 0;
  }

  private computeConstraintInputKey(
    graph: ConstraintGraph,
    viewport: Viewport,
    rootW: number,
    rootH: number,
  ): string {
    const parts: string[] = [
      String(graph.fingerprint),
      String(viewport.cols),
      String(viewport.rows),
      String(rootW),
      String(rootH),
    ];

    for (let i = 0; i < graph.nodes.length; i++) {
      const node = graph.nodes[i];
      if (!node) continue;
      const base = this._pooledConstraintBaseValues.get(node.instanceId);
      const parent = this._pooledConstraintParentValues.get(node.instanceId);
      const intrinsic = this._pooledConstraintIntrinsicValues.get(node.instanceId);
      parts.push(
        String(node.instanceId),
        String(base?.width ?? "u"),
        String(base?.height ?? "u"),
        String(base?.minWidth ?? "u"),
        String(base?.minHeight ?? "u"),
        String(base?.display ?? "u"),
        String(parent?.w ?? rootW),
        String(parent?.h ?? rootH),
        String(parent?.min_w ?? rootW),
        String(parent?.min_h ?? rootH),
        String(intrinsic?.w ?? "u"),
        String(intrinsic?.h ?? "u"),
        String(intrinsic?.min_w ?? "u"),
        String(intrinsic?.min_h ?? "u"),
      );
    }

    return parts.join("|");
  }

  private rebuildConstraintExprIndex(graph: ConstraintGraph): void {
    const mutable = new Map<InstanceId, Array<Readonly<{ prop: string; source: string }>>>();
    for (const node of graph.nodes) {
      const entry = Object.freeze({ prop: node.prop, source: node.expr.source });
      const bucket = mutable.get(node.instanceId);
      if (bucket) bucket.push(entry);
      else mutable.set(node.instanceId, [entry]);
    }

    const frozen = new Map<InstanceId, readonly Readonly<{ prop: string; source: string }>[]>();
    for (const [instanceId, list] of mutable.entries()) {
      frozen.set(instanceId, Object.freeze(list.slice()));
    }
    this._constraintExprIndexByInstanceId = frozen;
  }

  private computeConstraintBreadcrumbs(): RuntimeBreadcrumbConstraintsSummary {
    const graph = this._constraintGraph;
    if (graph === null || graph.nodes.length === 0) return EMPTY_CONSTRAINT_BREADCRUMBS;

    if (this._constraintExprIndexByInstanceId === null) {
      this.rebuildConstraintExprIndex(graph);
    }

    const focusedId = this.focusState.focusedId;
    const resolvedByInstanceId = this._constraintValuesByInstanceId;
    const hiddenInstanceCount = this._hiddenConstraintInstanceIds.size;

    let focused: RuntimeBreadcrumbConstraintsSummary["focused"] = null;
    if (focusedId) {
      const instances = graph.idToInstances.get(focusedId) ?? EMPTY_INSTANCE_ID_ARRAY;
      const instanceCount = instances.length;
      const instanceId = instances[0] ?? null;
      const resolved = instanceId !== null ? (resolvedByInstanceId?.get(instanceId) ?? null) : null;
      const expressions =
        instanceId !== null
          ? (this._constraintExprIndexByInstanceId?.get(instanceId) ?? null)
          : null;

      focused = Object.freeze({
        id: focusedId,
        instanceCount,
        instanceId,
        resolved: resolved
          ? (() => {
              const out: {
                display?: number;
                width?: number;
                height?: number;
                minWidth?: number;
                maxWidth?: number;
                minHeight?: number;
                maxHeight?: number;
                flexBasis?: number;
              } = {};
              if (typeof resolved.display === "number" && Number.isFinite(resolved.display))
                out.display = resolved.display;
              if (typeof resolved.width === "number" && Number.isFinite(resolved.width))
                out.width = resolved.width;
              if (typeof resolved.height === "number" && Number.isFinite(resolved.height))
                out.height = resolved.height;
              if (typeof resolved.minWidth === "number" && Number.isFinite(resolved.minWidth))
                out.minWidth = resolved.minWidth;
              if (typeof resolved.maxWidth === "number" && Number.isFinite(resolved.maxWidth))
                out.maxWidth = resolved.maxWidth;
              if (typeof resolved.minHeight === "number" && Number.isFinite(resolved.minHeight))
                out.minHeight = resolved.minHeight;
              if (typeof resolved.maxHeight === "number" && Number.isFinite(resolved.maxHeight))
                out.maxHeight = resolved.maxHeight;
              if (typeof resolved.flexBasis === "number" && Number.isFinite(resolved.flexBasis))
                out.flexBasis = resolved.flexBasis;
              return Object.freeze(out);
            })()
          : null,
        expressions,
      });
    }

    return Object.freeze({
      enabled: true,
      graphFingerprint: graph.fingerprint,
      nodeCount: graph.nodes.length,
      cacheKey: this._constraintLastCacheKey,
      resolution: this._constraintLastResolution,
      hiddenInstanceCount,
      focused,
    });
  }

  private applyConstraintOverridesToVNode(
    runtimeNode: RuntimeInstance,
    valuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null,
    hiddenInstanceIds: ReadonlySet<InstanceId>,
    affectedPathInstanceIds: ReadonlySet<InstanceId>,
  ): VNode {
    const vnode = runtimeNode.vnode;
    type MutableConstraintOverrideProps = Record<string, unknown> & {
      display?: boolean;
      width?: number;
      height?: number;
      minWidth?: number;
      maxWidth?: number;
      minHeight?: number;
      maxHeight?: number;
      flex?: number;
      flexBasis?: number;
    };

    const propsRecord = (vnode.props ?? {}) as Readonly<MutableConstraintOverrideProps>;
    const resolved = valuesByInstanceId?.get(runtimeNode.instanceId);
    const isHidden = hiddenInstanceIds.has(runtimeNode.instanceId);
    const shouldTraverseChildren = this._constraintNodesWithAffectedDescendants.has(
      runtimeNode.instanceId,
    );
    let propsChanged = false;
    let nextProps = vnode.props;

    let nextPropsMutable: MutableConstraintOverrideProps | null = null;
    const ensureMutableProps = (): MutableConstraintOverrideProps => {
      if (nextPropsMutable === null)
        nextPropsMutable = { ...propsRecord } as MutableConstraintOverrideProps;
      return nextPropsMutable;
    };

    if (resolved) {
      const write = (name: Exclude<keyof ResolvedConstraintValues, "display">): void => {
        const raw = resolved[name];
        if (raw === undefined || !Number.isFinite(raw)) return;
        const nextValue = Math.floor(raw);
        if (propsRecord[name] === nextValue) return;
        ensureMutableProps()[name] = nextValue;
      };

      write("width");
      write("height");
      write("minWidth");
      write("maxWidth");
      write("minHeight");
      write("maxHeight");
      write("flexBasis");

      if (typeof resolved.display === "number" && Number.isFinite(resolved.display)) {
        const displayVisible = resolved.display > 0;
        if (propsRecord.display !== displayVisible) {
          ensureMutableProps().display = displayVisible;
        }
      }
    }

    if (isHidden) {
      const mutable = ensureMutableProps();
      mutable.display = false;
      mutable.width = 0;
      mutable.height = 0;
      mutable.minWidth = 0;
      mutable.maxWidth = 0;
      mutable.minHeight = 0;
      mutable.maxHeight = 0;
      mutable.flex = 0;
      mutable.flexBasis = 0;
    }

    if (nextPropsMutable !== null) {
      nextProps = Object.freeze(nextPropsMutable) as typeof vnode.props;
      propsChanged = true;
    }

    const currentChildren = (vnode as Readonly<{ children?: readonly VNode[] }>).children;
    let childrenChanged = false;
    let nextChildren = currentChildren;
    if (Array.isArray(currentChildren) && currentChildren.length > 0 && shouldTraverseChildren) {
      let rebuiltChildren: VNode[] | null = null;
      for (let i = 0; i < currentChildren.length; i++) {
        const childVNode = currentChildren[i] as VNode;
        const runtimeChild = runtimeNode.children[i];
        if (!runtimeChild || !childVNode || !affectedPathInstanceIds.has(runtimeChild.instanceId)) {
          if (rebuiltChildren !== null) rebuiltChildren[i] = childVNode;
          continue;
        }
        const nextChild = this.applyConstraintOverridesToVNode(
          runtimeChild,
          valuesByInstanceId,
          hiddenInstanceIds,
          affectedPathInstanceIds,
        );
        if (nextChild !== childVNode) {
          if (rebuiltChildren === null) {
            rebuiltChildren = currentChildren.slice() as VNode[];
          }
          rebuiltChildren[i] = nextChild;
          childrenChanged = true;
        } else if (rebuiltChildren !== null) {
          rebuiltChildren[i] = childVNode;
        }
      }
      if (rebuiltChildren !== null && childrenChanged) {
        nextChildren = Object.freeze(rebuiltChildren);
      }
    }

    if (!propsChanged && !childrenChanged) return vnode;
    return Object.freeze({
      ...vnode,
      ...(propsChanged ? { props: nextProps } : {}),
      ...(childrenChanged ? { children: nextChildren } : {}),
    }) as VNode;
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
        constraintBreadcrumbs: this._constraintBreadcrumbs,
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
      let prevLayoutSubtreeByInstanceId: ReadonlyMap<InstanceId, LayoutTree> | null = null;
      if (doCommit && prevCommittedRoot && prevLayoutTree) {
        this.collectLayoutSubtreeByInstanceId(
          prevCommittedRoot,
          prevLayoutTree,
          this._pooledPrevLayoutSubtreeByInstanceId,
        );
        prevLayoutSubtreeByInstanceId = this._pooledPrevLayoutSubtreeByInstanceId;
      }
      const hadRoutingWidgets = this.hadRoutingWidgets;
      let hasRoutingWidgets = hadRoutingWidgets;
      let didRoutingRebuild = false;
      let identityDamageFromCommit: IdentityDiffDamageResult | null = null;
      let layoutShapeVerifiedBySignature = false;
      let constraintGraph: ConstraintGraph | null = this._constraintGraph;

      if (doCommit) {
        let commitReadViewport = false;
        const colorTokens = getColorTokens(theme);
        const viewToken = PERF_DETAIL_ENABLED ? perfMarkStart("view") : 0;
        const vnode = viewFn(snapshot);
        if (PERF_DETAIL_ENABLED) perfMarkEnd("view", viewToken);

        if (!isVNodeLike(vnode)) {
          return {
            ok: false,
            code: "ZRUI_INVALID_PROPS",
            detail: `view function must return a VNode, got ${vnode === null ? "null" : vnode === undefined ? "undefined" : typeof vnode}`,
          };
        }

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

        const prevConstraintGraph = this._constraintGraph;
        if (
          prevConstraintGraph !== null &&
          !this.shouldRebuildConstraintGraph(
            this.committedRoot,
            prevConstraintGraph,
            commitRes.unmountedInstanceIds,
          )
        ) {
          constraintGraph = prevConstraintGraph;
          if (this._constraintExprIndexByInstanceId === null) {
            this.rebuildConstraintExprIndex(prevConstraintGraph);
          }
        } else {
          const graphRes = buildConstraintGraph(this.committedRoot);
          if (!graphRes.ok) {
            return {
              ok: false,
              code: graphRes.fatal.code,
              detail: this.describeConstraintGraphFatal(graphRes.fatal),
            };
          }
          constraintGraph = graphRes.value;
          this._constraintGraph = graphRes.value;
          this.rebuildConstraintExprIndex(graphRes.value);
          this._constraintResolutionCache.clear();
          this.invalidateConstraintInputSignature();
        }
        if (constraintGraph.nodes.length === 0) {
          this._constraintInputKey = null;
          this._constraintValuesByInstanceId = null;
          this._constraintResolutionCache.clear();
          this.invalidateConstraintInputSignature();
          this._constraintExprIndexByInstanceId = null;
          this._constraintLastResolution = CONSTRAINT_RESOLUTION_NONE;
          this._constraintLastCacheKey = null;
        } else if (!doLayout && constraintGraph.requiresCommitRelayout) {
          // Some constraint graphs depend on baseline layout/intrinsic data that
          // can change on commit without touching explicit layout-key props.
          // Only those graphs force relayout here.
          doLayout = true;
        }

        const damageToken = PERF_DETAIL_ENABLED ? perfMarkStart("damage_identity_diff") : 0;
        identityDamageFromCommit = this.computeIdentityDiffDamage(
          prevCommittedRoot,
          this.committedRoot,
        );
        if (PERF_DETAIL_ENABLED) perfMarkEnd("damage_identity_diff", damageToken);

        if (!doLayout && plan.checkLayoutStability) {
          // Detect layout-relevant commit changes (including child order changes)
          // using per-instance stability signatures.
          const layoutSigToken = PERF_ENABLED ? perfNow() : 0;
          const layoutSigChanged = updateLayoutStabilitySignatures(
            this.committedRoot,
            this._pooledLayoutSigByInstanceId,
            this._pooledNextLayoutSigByInstanceId,
            this._pooledRuntimeStack,
            this._pooledRuntimeParentKindStack,
            commitRes.unmountedInstanceIds,
            true,
          );
          if (PERF_ENABLED) perfCount("layout_sig_update_time_ms", perfNow() - layoutSigToken);
          if (layoutSigChanged) {
            doLayout = true;
          } else {
            layoutShapeVerifiedBySignature = true;
            if (PERF_ENABLED) perfCount("layout_shape_guard_skipped_from_signature");
          }
        }
        if (!doLayout && this.layoutTree !== null && !layoutShapeVerifiedBySignature) {
          // Defensive guard: never render a newly committed runtime tree against
          // a stale layout tree with different shape/kinds.
          const shapeGuardToken = PERF_ENABLED ? perfNow() : 0;
          if (PERF_ENABLED) perfCount("layout_shape_guard_checked");
          if (hasRuntimeLayoutShapeMismatch(this.committedRoot, this.layoutTree)) {
            if (PERF_ENABLED) perfCount("layout_shape_guard_mismatch");
            doLayout = true;
          }
          if (PERF_ENABLED) perfCount("layout_shape_guard_time_ms", perfNow() - shapeGuardToken);
        }
        let deferredExitCleanupIds: Set<InstanceId> | null = null;
        if (commitRes.pendingExitAnimations.length > 0) {
          deferredExitCleanupIds = new Set<InstanceId>();
          for (const pending of commitRes.pendingExitAnimations) {
            for (const id of pending.subtreeInstanceIds) {
              deferredExitCleanupIds.add(id);
            }
          }
        }

        this.cleanupUnmountedInstanceIds(
          commitRes.unmountedInstanceIds,
          deferredExitCleanupIds ? { skipIds: deferredExitCleanupIds } : undefined,
        );
        this.scheduleExitAnimations(
          commitRes.pendingExitAnimations,
          frameNowMs,
          prevLayoutSubtreeByInstanceId,
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

      if (constraintGraph === null && this.committedRoot !== null) {
        const graphRes = buildConstraintGraph(this.committedRoot);
        if (!graphRes.ok) {
          return {
            ok: false,
            code: graphRes.fatal.code,
            detail: this.describeConstraintGraphFatal(graphRes.fatal),
          };
        }
        constraintGraph = graphRes.value;
        this._constraintGraph = graphRes.value;
        this.rebuildConstraintExprIndex(graphRes.value);
        this._constraintResolutionCache.clear();
        this.invalidateConstraintInputSignature();
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
      if (PERF_ENABLED) {
        if (doLayout) perfCount("layout_requested_frames");
        else perfCount("layout_skipped_frames");
        if (forceFullRelayout) perfCount("layout_force_full_relayout_frames");
      }

      if (doLayout) {
        const rootPad = this.rootPadding;
        const rootW = Math.max(0, viewport.cols - rootPad * 2);
        const rootH = Math.max(0, viewport.rows - rootPad * 2);
        const layoutToken = perfMarkStart("layout");
        // Cold-pass only when frame context changes fundamentally (first frame,
        // viewport size change, or theme ref swap). Keep warm cache otherwise and
        // rely on guarded fallback below if a shape mismatch is detected.
        if (forceFullRelayout) {
          this._layoutTreeCache = new WeakMap<VNode, unknown>();
        }
        let constrainedLayoutRootVNode = this.committedRoot.vnode;
        let resolvedValuesForLayout: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null =
          null;
        if (constraintGraph !== null && constraintGraph.nodes.length > 0) {
          this.buildConstraintResolutionInputs(this.committedRoot, constraintGraph, rootW, rootH);
          const constraintInputChanged = this.hasConstraintInputSignatureChange(
            constraintGraph,
            viewport,
            rootW,
            rootH,
          );
          let resolvedValues = this._constraintValuesByInstanceId;
          if (constraintInputChanged || resolvedValues === null) {
            const constraintInputKey = this.computeConstraintInputKey(
              constraintGraph,
              viewport,
              rootW,
              rootH,
            );
            const resolved = resolveConstraints(constraintGraph, {
              viewport: { w: viewport.cols, h: viewport.rows },
              parent: { w: rootW, h: rootH },
              baseValues: this._pooledConstraintBaseValues,
              parentValues: this._pooledConstraintParentValues,
              intrinsicValues: this._pooledConstraintIntrinsicValues,
              cache: this._constraintResolutionCache,
              cacheKey: constraintInputKey,
            });
            resolvedValues = resolved.values;
            this._constraintValuesByInstanceId = resolved.values;
            this._constraintInputKey = constraintInputKey;
            this._constraintLastCacheKey = constraintInputKey;
            this._constraintLastResolution = resolved.cacheHit
              ? CONSTRAINT_RESOLUTION_CACHE_HIT
              : CONSTRAINT_RESOLUTION_COMPUTED;
          } else {
            this._constraintLastCacheKey = this._constraintInputKey;
            this._constraintLastResolution = CONSTRAINT_RESOLUTION_REUSED;
          }
          resolvedValuesForLayout = resolvedValues;
        } else {
          this._constraintInputKey = null;
          this._constraintValuesByInstanceId = null;
          this._constraintResolutionCache.clear();
          this.invalidateConstraintInputSignature();
          this._constraintHasStaticHiddenDisplay = false;
          this._constraintExprIndexByInstanceId = null;
          this._constraintLastResolution = CONSTRAINT_RESOLUTION_NONE;
          this._constraintLastCacheKey = null;
          this._pooledConstraintAffectedPathInstanceIds.clear();
          this._pooledConstraintNodesWithAffectedDescendants.clear();
          this._constraintAffectedPathInstanceIds = this._pooledConstraintAffectedPathInstanceIds;
          this._constraintNodesWithAffectedDescendants =
            this._pooledConstraintNodesWithAffectedDescendants;
        }
        const hasDisplayConstraint = constraintGraph?.hasDisplayConstraints ?? false;
        if (hasDisplayConstraint || this._constraintHasStaticHiddenDisplay) {
          this.rebuildConstraintHiddenState(this.committedRoot, resolvedValuesForLayout);
        } else {
          this._pooledHiddenConstraintInstanceIds.clear();
          this._pooledHiddenConstraintWidgetIds.clear();
          this._hiddenConstraintInstanceIds = this._pooledHiddenConstraintInstanceIds;
          this._hiddenConstraintWidgetIds = this._pooledHiddenConstraintWidgetIds;
        }
        if (
          constraintGraph !== null &&
          ((resolvedValuesForLayout !== null && resolvedValuesForLayout.size > 0) ||
            this._hiddenConstraintInstanceIds.size > 0)
        ) {
          this.rebuildConstraintAffectedPathSet(constraintGraph, this._hiddenConstraintInstanceIds);
          constrainedLayoutRootVNode = this.applyConstraintOverridesToVNode(
            this.committedRoot,
            resolvedValuesForLayout,
            this._hiddenConstraintInstanceIds,
            this._constraintAffectedPathInstanceIds,
          );
        }
        const layoutRootVNode =
          this.scrollOverrides.size > 0
            ? this.applyScrollOverridesToVNode(constrainedLayoutRootVNode)
            : constrainedLayoutRootVNode;
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
          null,
        );
        perfMarkEnd("layout", layoutToken);
        if (!layoutRes.ok) {
          return { ok: false, code: layoutRes.fatal.code, detail: layoutRes.fatal.detail };
        }
        let nextLayoutTree = layoutRes.value;
        let shapeMismatch: RuntimeLayoutShapeMismatch | null = null;
        if (doCommit) {
          const postLayoutShapeToken = PERF_ENABLED ? perfNow() : 0;
          if (hasRuntimeLayoutShapeMismatch(this.committedRoot, nextLayoutTree)) {
            shapeMismatch = findRuntimeLayoutShapeMismatch(this.committedRoot, nextLayoutTree);
          }
          if (PERF_ENABLED)
            perfCount("layout_shape_post_layout_time_ms", perfNow() - postLayoutShapeToken);
        }
        if (doCommit && shapeMismatch !== null) {
          if (FRAME_AUDIT_ENABLED) {
            emitFrameAudit("widgetRenderer", "layout.shape_mismatch", {
              reason: "post-layout-cache-hit",
              path: shapeMismatch.path,
              depth: shapeMismatch.depth,
              mismatchKind: shapeMismatch.reason,
              runtimeKind: shapeMismatch.runtimeKind,
              layoutKind: shapeMismatch.layoutKind,
              runtimeChildCount: shapeMismatch.runtimeChildCount,
              layoutChildCount: shapeMismatch.layoutChildCount,
              runtimeTrail: shapeMismatch.runtimeTrail,
              layoutTrail: shapeMismatch.layoutTrail,
            });
          }
          // Cache can become stale under structural changes; force a cold relayout.
          this._layoutTreeCache = new WeakMap<VNode, unknown>();
          const fallbackLayoutRes = layout(
            layoutRootVNode,
            rootPad,
            rootPad,
            rootW,
            rootH,
            "column",
            this._layoutMeasureCache,
            this._layoutTreeCache,
            null,
          );
          if (!fallbackLayoutRes.ok) {
            return {
              ok: false,
              code: fallbackLayoutRes.fatal.code,
              detail: fallbackLayoutRes.fatal.detail,
            };
          }
          nextLayoutTree = fallbackLayoutRes.value;
          shapeMismatch = findRuntimeLayoutShapeMismatch(this.committedRoot, nextLayoutTree);
          if (shapeMismatch !== null && layoutRootVNode !== constrainedLayoutRootVNode) {
            const directLayoutRes = layout(
              constrainedLayoutRootVNode,
              rootPad,
              rootPad,
              rootW,
              rootH,
              "column",
              this._layoutMeasureCache,
              this._layoutTreeCache,
              null,
            );
            if (!directLayoutRes.ok) {
              return {
                ok: false,
                code: directLayoutRes.fatal.code,
                detail: directLayoutRes.fatal.detail,
              };
            }
            nextLayoutTree = directLayoutRes.value;
            shapeMismatch = findRuntimeLayoutShapeMismatch(this.committedRoot, nextLayoutTree);
          }
          if (shapeMismatch !== null && FRAME_AUDIT_ENABLED) {
            emitFrameAudit("widgetRenderer", "layout.shape_mismatch.persisted", {
              path: shapeMismatch.path,
              depth: shapeMismatch.depth,
              mismatchKind: shapeMismatch.reason,
              runtimeKind: shapeMismatch.runtimeKind,
              layoutKind: shapeMismatch.layoutKind,
              runtimeChildCount: shapeMismatch.runtimeChildCount,
              layoutChildCount: shapeMismatch.layoutChildCount,
              runtimeTrail: shapeMismatch.runtimeTrail,
              layoutTrail: shapeMismatch.layoutTrail,
            });
          }
        }
        this.layoutTree = nextLayoutTree;

        if (doCommit) {
          // Seed/refresh per-instance layout stability signatures after a real
          // layout pass so subsequent commits can take the signature fast path.
          const sigSeedToken = PERF_ENABLED ? perfNow() : 0;
          updateLayoutStabilitySignatures(
            this.committedRoot,
            this._pooledLayoutSigByInstanceId,
            this._pooledNextLayoutSigByInstanceId,
            this._pooledRuntimeStack,
            this._pooledRuntimeParentKindStack,
            commitRes?.unmountedInstanceIds ?? [],
            false,
          );
          if (PERF_ENABLED) perfCount("layout_sig_seed_time_ms", perfNow() - sigSeedToken);
        }
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
      } else {
        this.rebuildConstraintHiddenState(
          this.committedRoot,
          constraintGraph !== null && constraintGraph.nodes.length > 0
            ? this._constraintValuesByInstanceId
            : null,
        );
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

          let focusableIds = widgetMeta.focusableIds;
          let enabledById = widgetMeta.enabledById;
          let focusInfoById = widgetMeta.focusInfoById;
          let pressableIds = widgetMeta.pressableIds;
          let inputById = widgetMeta.inputById;
          let zones = widgetMeta.zones;
          let traps = widgetMeta.traps;
          const hiddenWidgetIds = this._hiddenConstraintWidgetIds;
          if (hiddenWidgetIds.size > 0) {
            const filteredFocusable = focusableIds.filter((id) => !hiddenWidgetIds.has(id));
            focusableIds = Object.freeze(filteredFocusable);

            const filteredEnabled = new Map<string, boolean>();
            for (const [id, enabled] of enabledById) {
              if (!hiddenWidgetIds.has(id)) filteredEnabled.set(id, enabled);
            }
            enabledById = filteredEnabled;

            const filteredFocusInfo = new Map<string, FocusInfo>();
            for (const [id, info] of focusInfoById) {
              if (!hiddenWidgetIds.has(id)) filteredFocusInfo.set(id, info);
            }
            focusInfoById = filteredFocusInfo;

            const filteredPressable = new Set<string>();
            for (const id of pressableIds) {
              if (!hiddenWidgetIds.has(id)) filteredPressable.add(id);
            }
            pressableIds = filteredPressable;

            const filteredInputById = new Map<string, InputMeta>();
            for (const [id, info] of inputById) {
              if (!hiddenWidgetIds.has(id)) filteredInputById.set(id, info);
            }
            inputById = filteredInputById;

            const filteredZones = new Map<string, CollectedZone>();
            for (const [id, zone] of zones) {
              const zoneFocusable = zone.focusableIds.filter(
                (focusId) => !hiddenWidgetIds.has(focusId),
              );
              filteredZones.set(
                id,
                Object.freeze({
                  ...zone,
                  focusableIds: Object.freeze(zoneFocusable),
                }),
              );
            }
            zones = filteredZones;

            const filteredTraps = new Map<string, CollectedTrap>();
            for (const [id, trap] of traps) {
              const trapFocusable = trap.focusableIds.filter(
                (focusId) => !hiddenWidgetIds.has(focusId),
              );
              filteredTraps.set(
                id,
                Object.freeze({
                  ...trap,
                  focusableIds: Object.freeze(trapFocusable),
                }),
              );
            }
            traps = filteredTraps;
          }

          const nextZoneMetaById = new Map(zones);

          prevFocusedIdBeforeFinalize = this.focusState.focusedId;
          this.focusState = finalizeFocusWithPreCollectedMetadata(
            this.focusState,
            focusableIds,
            zones,
            traps,
          );
          this.baseFocusList = focusableIds;
          this.baseEnabledById = enabledById;
          this.focusList = focusableIds;
          this.focusInfoById = focusInfoById;
          this.enabledById = enabledById;
          this.pressableIds = pressableIds;
          this.inputById = inputById;
          this.traps = traps;
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
          if (this._hiddenConstraintInstanceIds.has(cur.instanceId)) continue;

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
          if (this._hiddenConstraintInstanceIds.has(cur.instanceId)) continue;

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

      let submittedBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      let inFlight: Promise<void> | null = null;
      const buildToken = perfMarkStart("drawlist_build");
      const beginFrame = (
        this.backend as RuntimeBackend &
          Partial<Record<typeof BACKEND_BEGIN_FRAME_MARKER, BackendBeginFrame>>
      )[BACKEND_BEGIN_FRAME_MARKER];
      if (typeof beginFrame === "function") {
        const frameWriter = beginFrame();
        if (frameWriter) {
          const builtInto = this.builder.buildInto(frameWriter.buf);
          if (!builtInto.ok) {
            frameWriter.abort();
            perfMarkEnd("drawlist_build", buildToken);
            return {
              ok: false,
              code: "ZRUI_DRAWLIST_BUILD_ERROR",
              detail: `${builtInto.error.code}: ${builtInto.error.detail}`,
            };
          }
          submittedBytes = builtInto.bytes;
          inFlight = frameWriter.commit(submittedBytes.byteLength);
        }
      }
      if (!inFlight) {
        const built = this.builder.build();
        if (!built.ok) {
          perfMarkEnd("drawlist_build", buildToken);
          return {
            ok: false,
            code: "ZRUI_DRAWLIST_BUILD_ERROR",
            detail: `${built.error.code}: ${built.error.detail}`,
          };
        }
        submittedBytes = built.bytes;
      }
      perfMarkEnd("drawlist_build", buildToken);
      this.clearRuntimeDirtyNodes(this.committedRoot);
      if (captureRuntimeBreadcrumbs) {
        this._constraintBreadcrumbs = this.computeConstraintBreadcrumbs();
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
          const fingerprint = FRAME_AUDIT_ENABLED ? drawlistFingerprint(submittedBytes) : null;
          if (fingerprint !== null) {
            emitFrameAudit("widgetRenderer", "drawlist.built", {
              tick,
              commit: doCommit,
              layout: doLayout,
              incremental: usedIncrementalRender,
              damageMode: runtimeDamageMode,
              damageRectCount: runtimeDamageRectCount,
              damageArea: runtimeDamageArea,
              ...fingerprint,
            });
            if (FRAME_AUDIT_TREE_ENABLED) {
              emitFrameAudit(
                "widgetRenderer",
                "runtime.tree.summary",
                Object.freeze({
                  tick,
                  ...summarizeRuntimeTreeForAudit(this.committedRoot, this.layoutTree),
                }),
              );
            }
          }
          if (!inFlight) {
            inFlight = this.backend.requestFrame(submittedBytes);
          }
          const inflightPromise = inFlight;
          if (fingerprint !== null) {
            emitFrameAudit("widgetRenderer", "backend.request", {
              tick,
              hash32: fingerprint.hash32,
              prefixHash32: fingerprint.prefixHash32,
              byteLen: fingerprint.byteLen,
            });
            const acceptedAck = (
              inflightPromise as Promise<void> &
                Partial<Record<typeof FRAME_ACCEPTED_ACK_MARKER, Promise<void>>>
            )[FRAME_ACCEPTED_ACK_MARKER];
            if (acceptedAck !== undefined) {
              void acceptedAck.then(
                () =>
                  emitFrameAudit("widgetRenderer", "backend.accepted", {
                    tick,
                    hash32: fingerprint.hash32,
                  }),
                (err: unknown) =>
                  emitFrameAudit("widgetRenderer", "backend.accepted_error", {
                    tick,
                    hash32: fingerprint.hash32,
                    detail: describeThrown(err),
                  }),
              );
            }
            void inflightPromise.then(
              () =>
                emitFrameAudit("widgetRenderer", "backend.completed", {
                  tick,
                  hash32: fingerprint.hash32,
                }),
              (err: unknown) =>
                emitFrameAudit("widgetRenderer", "backend.completed_error", {
                  tick,
                  hash32: fingerprint.hash32,
                  detail: describeThrown(err),
                }),
            );
          }
          return { ok: true, inFlight: inflightPromise };
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
