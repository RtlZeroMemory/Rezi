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
import { buildTrie, resetChordState } from "../keybindings/index.js";
import type { ChordState } from "../keybindings/index.js";
import type { LayoutOverflowMetadata } from "../layout/constraints.js";
import { computeDropdownGeometry } from "../layout/dropdownGeometry.js";
import { type LayoutTree, layout, measure } from "../layout/layout.js";
import {
  type ResponsiveBreakpointThresholds,
  getResponsiveViewport,
  normalizeBreakpointThresholds,
  setResponsiveViewport,
} from "../layout/responsive.js";
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
  normalizeInputCursor,
  normalizeInputSelection,
} from "../runtime/inputEditor.js";
import { type InstanceId, createInstanceIdAllocator } from "../runtime/instance.js";
import {
  createCompositeInstanceRegistry,
  runPendingCleanups,
  runPendingEffects,
} from "../runtime/instances.js";
import { createLayerRegistry } from "../runtime/layers.js";
import {
  createTableStateStore,
  createTreeStateStore,
  createVirtualListStateStore,
} from "../runtime/localState.js";
import type { RoutedAction } from "../runtime/router.js";
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
import { parseToastActionFocusId } from "../widgets/toast.js";
import type { VNode } from "../widgets/types.js";
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
} from "../widgets/types.js";
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
import { kickoffCommandPaletteItemFetches } from "./widgetRenderer/commandPaletteRouting.js";
import {
  CONSTRAINT_NODE_PROPS,
  applyConstraintOverridesToVNode as applyConstraintOverridesToVNodeImpl,
  buildConstraintResolutionInputs as buildConstraintResolutionInputsImpl,
  computeConstraintBreadcrumbs as computeConstraintBreadcrumbsImpl,
  computeConstraintInputKey as computeConstraintInputKeyImpl,
  describeConstraintGraphFatal as describeConstraintGraphFatalImpl,
  hasConstraintInputSignatureChange as hasConstraintInputSignatureChangeImpl,
  rebuildConstraintAffectedPathSet as rebuildConstraintAffectedPathSetImpl,
  rebuildConstraintExprIndex as rebuildConstraintExprIndexImpl,
  rebuildConstraintHiddenState as rebuildConstraintHiddenStateImpl,
  shouldRebuildConstraintGraph as shouldRebuildConstraintGraphImpl,
} from "./widgetRenderer/constraintState.js";
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
  buildFallbackFocusInfo as buildFallbackFocusInfoImpl,
  captureFocusSnapshotState,
  findScrollableAncestors as findScrollableAncestorsImpl,
  invokeFocusZoneCallbacks as invokeFocusZoneCallbacksImpl,
  restoreFocusSnapshotState,
} from "./widgetRenderer/focusState.js";
import {
  applyInputSnapshot as applyInputSnapshotImpl,
  getInputUndoStack as getInputUndoStackImpl,
  readInputSnapshot as readInputSnapshotImpl,
} from "./widgetRenderer/inputEditing.js";
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
  cleanupRoutingStateAfterRebuild,
  finalizeLayoutOnlyOverlayState,
  finalizeRebuiltOverlayState,
  rebuildOverlayStateForLayout,
  rebuildRoutingWidgetMapsAndOverlayState,
} from "./widgetRenderer/overlayState.js";
import type {
  CodeEditorRenderCache,
  DiffRenderCache,
  LogsConsoleRenderCache,
  TableRenderCache,
} from "./widgetRenderer/renderCaches.js";
import {
  type RouteEngineEventState,
  routeEngineEventImpl,
} from "./widgetRenderer/routeEngineEvent.js";
import {
  buildLayoutRectIndexes,
  updateLayoutStabilitySignatures,
} from "./widgetRenderer/submitFramePipeline.js";

/** Callbacks for render lifecycle tracking (used by app to set inRender flag). */
export type WidgetRendererHooks = Readonly<{
  enterRender: () => void;
  exitRender: () => void;
}>;

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
  consumed?: boolean;
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

function isI32NonNegative(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 2147483647;
}

const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);
const EMPTY_INSTANCE_ID_ARRAY: readonly InstanceId[] = Object.freeze([]);
const CONSTRAINT_RESOLUTION_NONE = Object.freeze({ kind: "none" as const });
const CONSTRAINT_RESOLUTION_REUSED = Object.freeze({ kind: "reused" as const });
const CONSTRAINT_RESOLUTION_CACHE_HIT = Object.freeze({ kind: "cacheHit" as const });
const CONSTRAINT_RESOLUTION_COMPUTED = Object.freeze({ kind: "computed" as const });
const MAX_CONSTRAINT_SETTLE_PASSES = 128;
const EMPTY_CONSTRAINT_BREADCRUMBS: RuntimeBreadcrumbConstraintsSummary = Object.freeze({
  enabled: false,
  graphFingerprint: 0,
  nodeCount: 0,
  cacheKey: null,
  resolution: CONSTRAINT_RESOLUTION_NONE,
  hiddenInstanceCount: 0,
  focused: null,
});
const ZERO_RECT: Rect = Object.freeze({ x: 0, y: 0, w: 0, h: 0 });
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

function isVNodeLike(v: unknown): v is VNode {
  return typeof v === "object" && v !== null && "kind" in v;
}

function readLayoutShapeIdentity(vnode: VNode): string | null {
  const props = vnode.props as Readonly<{ id?: unknown; key?: unknown }> | undefined;
  const id = props?.id;
  if (typeof id === "string" && id.length > 0) return `id:${id}`;
  const key = props?.key;
  if (typeof key === "string" && key.length > 0) return `key:${key}`;
  return null;
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
  reason: "kind" | "children" | "identity";
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
    const runtimeIdentity = readLayoutShapeIdentity(runtimeNode.vnode);
    const layoutIdentity = readLayoutShapeIdentity(layoutNode.vnode);
    if (
      (runtimeIdentity !== null || layoutIdentity !== null) &&
      runtimeIdentity !== layoutIdentity
    ) {
      return Object.freeze({
        path,
        depth,
        reason: "identity",
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
    const runtimeIdentity = readLayoutShapeIdentity(runtimeNode.vnode);
    const layoutIdentity = readLayoutShapeIdentity(layoutNode.vnode);
    if (
      (runtimeIdentity !== null || layoutIdentity !== null) &&
      runtimeIdentity !== layoutIdentity
    ) {
      return true;
    }
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
  private readonly dropdownWindowStartById = new Map<string, number>();
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
  private readonly _pooledPrevTreeIds = new Set<string>();
  private _runtimeBreadcrumbs: WidgetRuntimeBreadcrumbSnapshot = EMPTY_WIDGET_RUNTIME_BREADCRUMBS;
  private forceFullRenderOnNextSubmit = false;
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

  forceFullRenderNextFrame(): void {
    this.forceFullRenderOnNextSubmit = true;
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
        this.dropdownWindowStartById,
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
    return buildFallbackFocusInfoImpl(
      { toastActionLabelByFocusId: this.toastActionLabelByFocusId },
      id,
    );
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
    return captureFocusSnapshotState(
      this.focusState,
      this.focusList,
      this.baseFocusList,
      this.enabledById,
      this.baseEnabledById,
      this.pressableIds,
      this.traps,
      this.zoneMetaById,
    );
  }

  /**
   * Restore a previously captured focus snapshot.
   */
  restoreFocusSnapshot(snapshot: WidgetFocusSnapshot): void {
    const restored = restoreFocusSnapshotState(snapshot);
    this.focusState = restored.focusState;
    this.focusList = restored.focusList;
    this.baseFocusList = restored.baseFocusList;
    this.enabledById = restored.enabledById;
    this.baseEnabledById = restored.baseEnabledById;
    this.pressableIds = restored.pressableIds;
    this.traps = restored.traps;
    this.zoneMetaById = restored.zoneMetaById;
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

  private reportFocusZoneCallbackError(phase: "onEnter" | "onExit", error: unknown): void {
    const detail = `focusZone ${phase} threw: ${describeThrown(error)}`;
    try {
      this.reportUserCodeError(detail);
    } catch (sinkError: unknown) {
      const c = (globalThis as { console?: { error?: (message: string) => void } }).console;
      c?.error?.(
        `[rezi][runtime] onUserCodeError sink threw while reporting focusZone ${phase}: ${describeThrown(
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
   * Why: Active overlays own keyboard interaction. Global keybindings should
   * not preempt dropdown navigation, modal dismissal, or overlay-local
   * shortcuts while an overlay is present.
   */
  shouldBypassKeybindings(event: ZrevEvent): boolean {
    if (event.kind !== "key" || event.action !== "down") return false;
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
    const state: RouteEngineEventState = {
      focusState: this.focusState,
      pressedId: this.pressedId,
      pressedDropdown: this.pressedDropdown,
      pressedVirtualList: this.pressedVirtualList,
      pressedTable: this.pressedTable,
      pressedTableHeader: this.pressedTableHeader,
      lastTableClick: this.lastTableClick,
      pressedFileTree: this.pressedFileTree,
      lastFileTreeClick: this.lastFileTreeClick,
      pressedFilePicker: this.pressedFilePicker,
      lastFilePickerClick: this.lastFilePickerClick,
      pressedTree: this.pressedTree,
      lastTreeClick: this.lastTreeClick,
      splitPaneDrag: this.splitPaneDrag,
      splitPaneLastDividerDown: this.splitPaneLastDividerDown,
    };

    const outcome = routeEngineEventImpl(
      event,
      {
        committedRoot: this.committedRoot,
        layoutTree: this.layoutTree,
        enabledById: this.enabledById,
        focusList: this.focusList,
        pressableIds: this.pressableIds,
        traps: this.traps,
        zoneMetaById: this.zoneMetaById,
        inputById: this.inputById,
        buttonById: this.buttonById,
        linkById: this.linkById,
        virtualListById: this.virtualListById,
        tableById: this.tableById,
        treeById: this.treeById,
        dropdownById: this.dropdownById,
        sliderById: this.sliderById,
        selectById: this.selectById,
        checkboxById: this.checkboxById,
        radioGroupById: this.radioGroupById,
        commandPaletteById: this.commandPaletteById,
        commandPaletteItemsById: this.commandPaletteItemsById,
        filePickerById: this.filePickerById,
        fileTreeExplorerById: this.fileTreeExplorerById,
        splitPaneById: this.splitPaneById,
        codeEditorById: this.codeEditorById,
        diffViewerById: this.diffViewerById,
        toolApprovalDialogById: this.toolApprovalDialogById,
        logsConsoleById: this.logsConsoleById,
        rectById: this.rectById,
        splitPaneChildRectsById: this.splitPaneChildRectsById,
        toastContainers: this.toastContainers,
        toastActionByFocusId: this.toastActionByFocusId,
        dropdownSelectedIndexById: this.dropdownSelectedIndexById,
        dropdownWindowStartById: this.dropdownWindowStartById,
        toolApprovalFocusedActionById: this.toolApprovalFocusedActionById,
        diffViewerFocusedHunkById: this.diffViewerFocusedHunkById,
        diffViewerExpandedHunksById: this.diffViewerExpandedHunksById,
        logsConsoleLastGTimeById: this.logsConsoleLastGTimeById,
        logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
        diffRenderCacheById: this.diffRenderCacheById,
        codeEditorRenderCacheById: this.codeEditorRenderCacheById,
        tableRenderCacheById: this.tableRenderCacheById,
        inputCursorByInstanceId: this.inputCursorByInstanceId,
        inputSelectionByInstanceId: this.inputSelectionByInstanceId,
        inputWorkingValueByInstanceId: this.inputWorkingValueByInstanceId,
        inputUndoByInstanceId: this.inputUndoByInstanceId,
        virtualListStore: this.virtualListStore,
        tableStore: this.tableStore,
        treeStore: this.treeStore,
        loadedTreeChildrenByTreeId: this.loadedTreeChildrenByTreeId,
        treeLoadTokenByTreeAndKey: this.treeLoadTokenByTreeAndKey,
        layerRegistry: this.layerRegistry,
        layerStack: this.layerStack,
        closeOnEscapeByLayerId: this.closeOnEscapeByLayerId,
        closeOnBackdropByLayerId: this.closeOnBackdropByLayerId,
        onCloseByLayerId: this.onCloseByLayerId,
        dropdownStack: this.dropdownStack,
        scrollOverrides: this.scrollOverrides,
        routeOverlayShortcut: (nextEvent) => this.routeOverlayShortcut(nextEvent),
        invokeFocusZoneCallbacks: (prevZoneId, nextZoneId, prevZones, nextZones) =>
          this.invokeFocusZoneCallbacks(prevZoneId, nextZoneId, prevZones, nextZones),
        invokeBlurCallbackSafely: (callback) => this.invokeBlurCallbackSafely(callback),
        computeDropdownRect: (props) => this.computeDropdownRect(props),
        findScrollableAncestors: (targetId) => this.findScrollableAncestors(targetId),
        writeSelectedTextToClipboard: (text) => this.writeSelectedTextToClipboard(text),
        reportInputCallbackError: (name, error) => this.reportInputCallbackError(name, error),
        requestRender: this.requestRender,
        allocNextTreeLoadToken: () => this.nextTreeLoadToken++,
      },
      state,
    );

    this.focusState = state.focusState;
    this.pressedId = state.pressedId;
    this.pressedDropdown = state.pressedDropdown;
    this.pressedVirtualList = state.pressedVirtualList;
    this.pressedTable = state.pressedTable;
    this.pressedTableHeader = state.pressedTableHeader;
    this.lastTableClick = state.lastTableClick;
    this.pressedFileTree = state.pressedFileTree;
    this.lastFileTreeClick = state.lastFileTreeClick;
    this.pressedFilePicker = state.pressedFilePicker;
    this.lastFilePickerClick = state.lastFilePickerClick;
    this.pressedTree = state.pressedTree;
    this.lastTreeClick = state.lastTreeClick;
    this.splitPaneDrag = state.splitPaneDrag;
    this.splitPaneLastDividerDown = state.splitPaneLastDividerDown;
    return outcome;
  }

  private invokeFocusZoneCallbacks(
    prevZoneId: string | null,
    nextZoneId: string | null,
    prevZones: ReadonlyMap<string, CollectedZone>,
    nextZones: ReadonlyMap<string, CollectedZone>,
  ): void {
    invokeFocusZoneCallbacksImpl({
      prevZoneId,
      nextZoneId,
      prevZones,
      nextZones,
      reportFocusZoneCallbackError: (phase, error) =>
        this.reportFocusZoneCallbackError(phase, error),
    });
  }

  private findScrollableAncestors(
    targetId: string | null,
  ): readonly Readonly<{ nodeId: string; meta: LayoutOverflowMetadata }>[] {
    return findScrollableAncestorsImpl(targetId, this.committedRoot, this.layoutTree);
  }

  private applyScrollOverridesToVNode(
    vnode: VNode,
    overrides: ReadonlyMap<string, Readonly<{ scrollX: number; scrollY: number }>> = this
      .scrollOverrides,
  ): VNode {
    type MutableLayoutProps = Record<string, unknown> & {
      scrollX?: number;
      scrollY?: number;
      content?: unknown;
      actions?: unknown;
    };

    const propsRecord = (vnode.props ?? {}) as Readonly<MutableLayoutProps>;
    const propsForRead = propsRecord as Readonly<{
      id?: unknown;
      scrollX?: unknown;
      scrollY?: unknown;
    }>;
    const idRaw = propsForRead.id;
    const nodeId = typeof idRaw === "string" && idRaw.length > 0 ? idRaw : null;
    const override = nodeId ? overrides.get(nodeId) : undefined;

    let nextPropsMutable: MutableLayoutProps | null = null;
    const ensureMutableProps = (): MutableLayoutProps => {
      if (nextPropsMutable === null) nextPropsMutable = { ...propsRecord };
      return nextPropsMutable;
    };
    if (override) {
      if (propsForRead.scrollX !== override.scrollX || propsForRead.scrollY !== override.scrollY) {
        const mutable = ensureMutableProps();
        mutable.scrollX = override.scrollX;
        mutable.scrollY = override.scrollY;
      }
    }

    const currentChildren = (vnode as Readonly<{ children?: readonly VNode[] }>).children;
    let childrenChanged = false;
    let nextChildren = currentChildren;
    if (Array.isArray(currentChildren) && currentChildren.length > 0) {
      const rebuiltChildren: VNode[] = new Array(currentChildren.length);
      for (let i = 0; i < currentChildren.length; i++) {
        const child = currentChildren[i];
        const nextChild = this.applyScrollOverridesToVNode(child, overrides);
        rebuiltChildren[i] = nextChild;
        if (nextChild !== child) childrenChanged = true;
      }
      if (childrenChanged) nextChildren = Object.freeze(rebuiltChildren);
    }

    if (vnode.kind === "layer") {
      const content = (propsRecord as Readonly<{ content?: unknown }>).content;
      if (isVNodeLike(content)) {
        const nextContent = this.applyScrollOverridesToVNode(content, overrides);
        if (nextContent !== content) {
          ensureMutableProps().content = nextContent;
        }
      }
    } else if (vnode.kind === "modal") {
      const modalProps = propsRecord as Readonly<{ content?: unknown; actions?: unknown }>;
      const content = modalProps.content;
      if (isVNodeLike(content)) {
        const nextContent = this.applyScrollOverridesToVNode(content, overrides);
        if (nextContent !== content) {
          ensureMutableProps().content = nextContent;
        }
      }
      const actionsRaw = modalProps.actions;
      if (Array.isArray(actionsRaw) && actionsRaw.length > 0) {
        let nextActions: unknown[] | null = null;
        for (let i = 0; i < actionsRaw.length; i++) {
          const action = actionsRaw[i];
          if (!isVNodeLike(action)) {
            if (nextActions !== null) nextActions[i] = action;
            continue;
          }
          const nextAction = this.applyScrollOverridesToVNode(action, overrides);
          if (nextAction !== action) {
            if (nextActions === null) nextActions = actionsRaw.slice();
            nextActions[i] = nextAction;
          } else if (nextActions !== null) {
            nextActions[i] = action;
          }
        }
        if (nextActions !== null) {
          ensureMutableProps().actions = Object.freeze(nextActions);
        }
      }
    }

    let nextProps = vnode.props;
    const propsChanged = nextPropsMutable !== null;
    if (nextPropsMutable !== null) {
      nextProps = Object.freeze(nextPropsMutable) as typeof vnode.props;
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
    return describeConstraintGraphFatalImpl(fatal);
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
    return shouldRebuildConstraintGraphImpl(
      root,
      prevGraph,
      removedInstanceIds,
      this._pooledConstraintRuntimeStack,
    );
  }

  private buildConstraintResolutionInputs(
    root: RuntimeInstance,
    graph: ConstraintGraph,
    rootW: number,
    rootH: number,
  ): void {
    const result = buildConstraintResolutionInputsImpl({
      root,
      graph,
      rootW,
      rootH,
      pooledConstraintBaseValues: this._pooledConstraintBaseValues,
      pooledConstraintParentValues: this._pooledConstraintParentValues,
      pooledConstraintIntrinsicValues: this._pooledConstraintIntrinsicValues,
      pooledConstraintParentByInstanceId: this._pooledConstraintParentByInstanceId,
      pooledRectByInstanceId: this._pooledRectByInstanceId,
      pooledConstraintRuntimeStack: this._pooledConstraintRuntimeStack,
      pooledConstraintParentStack: this._pooledConstraintParentStack,
      pooledConstraintAxisStack: this._pooledConstraintAxisStack,
    });
    this._constraintHasStaticHiddenDisplay = result.hasStaticHiddenDisplay;
  }

  private rebuildConstraintHiddenState(
    root: RuntimeInstance,
    valuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null,
  ): void {
    const result = rebuildConstraintHiddenStateImpl(
      root,
      valuesByInstanceId,
      this._pooledConstraintRuntimeStack,
      this._pooledConstraintVisibilityStack,
      this._pooledHiddenConstraintInstanceIds,
      this._pooledHiddenConstraintWidgetIds,
    );
    this._hiddenConstraintInstanceIds = result.hiddenConstraintInstanceIds;
    this._hiddenConstraintWidgetIds = result.hiddenConstraintWidgetIds;
  }

  private rebuildConstraintAffectedPathSet(
    graph: ConstraintGraph,
    hiddenInstanceIds: ReadonlySet<InstanceId>,
  ): void {
    const result = rebuildConstraintAffectedPathSetImpl(
      graph,
      hiddenInstanceIds,
      this._pooledConstraintAffectedPathInstanceIds,
      this._pooledConstraintNodesWithAffectedDescendants,
      this._pooledConstraintParentByInstanceId,
    );
    this._constraintAffectedPathInstanceIds = result.constraintAffectedPathInstanceIds;
    this._constraintNodesWithAffectedDescendants = result.constraintNodesWithAffectedDescendants;
  }

  private hasConstraintInputSignatureChange(
    graph: ConstraintGraph,
    viewport: Viewport,
    rootW: number,
    rootH: number,
  ): boolean {
    const result = hasConstraintInputSignatureChangeImpl({
      graph,
      viewport,
      rootW,
      rootH,
      pooledConstraintBaseValues: this._pooledConstraintBaseValues,
      pooledConstraintParentValues: this._pooledConstraintParentValues,
      pooledConstraintIntrinsicValues: this._pooledConstraintIntrinsicValues,
      signature: this._constraintInputSignature,
      valid: this._constraintInputSignatureValid,
    });
    this._constraintInputSignatureValid = result.valid;
    return result.changed;
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
    return computeConstraintInputKeyImpl(
      graph,
      viewport,
      rootW,
      rootH,
      this._pooledConstraintBaseValues,
      this._pooledConstraintParentValues,
      this._pooledConstraintIntrinsicValues,
    );
  }

  private rebuildConstraintExprIndex(graph: ConstraintGraph): void {
    this._constraintExprIndexByInstanceId = rebuildConstraintExprIndexImpl(graph);
  }

  private computeConstraintBreadcrumbs(): RuntimeBreadcrumbConstraintsSummary {
    return computeConstraintBreadcrumbsImpl({
      graph: this._constraintGraph,
      exprIndexByInstanceId: this._constraintExprIndexByInstanceId,
      rebuildConstraintExprIndex: (graph) => rebuildConstraintExprIndexImpl(graph),
      focusedId: this.focusState.focusedId,
      resolvedByInstanceId: this._constraintValuesByInstanceId,
      hiddenConstraintInstanceIds: this._hiddenConstraintInstanceIds,
      lastCacheKey: this._constraintLastCacheKey,
      lastResolution: this._constraintLastResolution,
      emptyConstraintBreadcrumbs: EMPTY_CONSTRAINT_BREADCRUMBS,
      emptyInstanceIds: EMPTY_INSTANCE_ID_ARRAY,
    });
  }

  private applyConstraintOverridesToVNode(
    runtimeNode: RuntimeInstance,
    valuesByInstanceId: ReadonlyMap<InstanceId, ResolvedConstraintValues> | null,
    hiddenInstanceIds: ReadonlySet<InstanceId>,
    affectedPathInstanceIds: ReadonlySet<InstanceId>,
  ): VNode {
    return applyConstraintOverridesToVNodeImpl({
      runtimeNode,
      valuesByInstanceId,
      hiddenInstanceIds,
      affectedPathInstanceIds,
      constraintNodesWithAffectedDescendants: this._constraintNodesWithAffectedDescendants,
    });
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
    if (this.forceFullRenderOnNextSubmit) return false;
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

  private layoutWithShapeFallback(
    layoutRootVNode: VNode,
    constrainedLayoutRootVNode: VNode,
    rootPad: number,
    rootW: number,
    rootH: number,
    checkShape: boolean,
  ): ReturnType<typeof layout> {
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
    if (!layoutRes.ok) {
      return layoutRes;
    }
    let nextLayoutTree = layoutRes.value;
    const runtimeRoot = this.committedRoot;
    if (!runtimeRoot) {
      return {
        ok: false,
        fatal: {
          code: "ZRUI_INVALID_PROPS",
          detail: "widgetRenderer: missing committed root",
        },
      };
    }
    let shapeMismatch: RuntimeLayoutShapeMismatch | null = null;
    if (checkShape) {
      const postLayoutShapeToken = PERF_ENABLED ? perfNow() : 0;
      if (hasRuntimeLayoutShapeMismatch(runtimeRoot, nextLayoutTree)) {
        shapeMismatch = findRuntimeLayoutShapeMismatch(runtimeRoot, nextLayoutTree);
      }
      if (PERF_ENABLED)
        perfCount("layout_shape_post_layout_time_ms", perfNow() - postLayoutShapeToken);
    }
    if (checkShape && shapeMismatch !== null) {
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
        return fallbackLayoutRes;
      }
      nextLayoutTree = fallbackLayoutRes.value;
      shapeMismatch = findRuntimeLayoutShapeMismatch(runtimeRoot, nextLayoutTree);
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
          return directLayoutRes;
        }
        nextLayoutTree = directLayoutRes.value;
        shapeMismatch = findRuntimeLayoutShapeMismatch(runtimeRoot, nextLayoutTree);
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
    return { ok: true, value: nextLayoutTree };
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
              this.forceFullRenderNextFrame();
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
        this.rebuildConstraintHiddenState(this.committedRoot, resolvedValuesForLayout);
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
        const pendingScrollOverrides =
          this.scrollOverrides.size > 0 ? new Map(this.scrollOverrides) : null;
        const layoutRootVNode =
          pendingScrollOverrides !== null
            ? this.applyScrollOverridesToVNode(constrainedLayoutRootVNode, pendingScrollOverrides)
            : constrainedLayoutRootVNode;
        this.scrollOverrides.clear();
        const initialLayoutRes = this.layoutWithShapeFallback(
          layoutRootVNode,
          constrainedLayoutRootVNode,
          rootPad,
          rootW,
          rootH,
          true,
        );
        if (!initialLayoutRes.ok) {
          perfMarkEnd("layout", layoutToken);
          return {
            ok: false,
            code: initialLayoutRes.fatal.code,
            detail: initialLayoutRes.fatal.detail,
          };
        }
        let nextLayoutTree = initialLayoutRes.value;

        // Constraint graphs that depend on parent/widget geometry may need
        // multiple in-frame settle passes because nested parent-dependent
        // constraints can converge one depth level at a time.
        if (constraintGraph !== null && constraintGraph.nodes.length > 0) {
          let settlePasses = 0;
          // Nested parent/intrinsic chains can converge one dependency level at a time.
          // Use the graph size instead of an arbitrary small cap so first-frame layout
          // can fully settle for deep but valid trees, but bound worst-case synchronous
          // frame time for pathological graphs and emit an audit signal if we hit the cap.
          const maxSettlePasses = Math.min(
            MAX_CONSTRAINT_SETTLE_PASSES,
            Math.max(3, constraintGraph.nodes.length + 1),
          );
          while (settlePasses < maxSettlePasses) {
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
            this.buildConstraintResolutionInputs(this.committedRoot, constraintGraph, rootW, rootH);
            const settleInputChanged = this.hasConstraintInputSignatureChange(
              constraintGraph,
              viewport,
              rootW,
              rootH,
            );
            if (!settleInputChanged) {
              break;
            }
            const constraintInputKey = this.computeConstraintInputKey(
              constraintGraph,
              viewport,
              rootW,
              rootH,
            );
            const settled = resolveConstraints(constraintGraph, {
              viewport: { w: viewport.cols, h: viewport.rows },
              parent: { w: rootW, h: rootH },
              baseValues: this._pooledConstraintBaseValues,
              parentValues: this._pooledConstraintParentValues,
              intrinsicValues: this._pooledConstraintIntrinsicValues,
              cache: this._constraintResolutionCache,
              cacheKey: constraintInputKey,
            });
            resolvedValuesForLayout = settled.values;
            this._constraintValuesByInstanceId = settled.values;
            this._constraintInputKey = constraintInputKey;
            this._constraintLastCacheKey = constraintInputKey;
            this._constraintLastResolution = settled.cacheHit
              ? CONSTRAINT_RESOLUTION_CACHE_HIT
              : CONSTRAINT_RESOLUTION_COMPUTED;

            this.rebuildConstraintHiddenState(this.committedRoot, resolvedValuesForLayout);

            let settledConstrainedRootVNode = this.committedRoot.vnode;
            if (
              (resolvedValuesForLayout !== null && resolvedValuesForLayout.size > 0) ||
              this._hiddenConstraintInstanceIds.size > 0
            ) {
              this.rebuildConstraintAffectedPathSet(
                constraintGraph,
                this._hiddenConstraintInstanceIds,
              );
              settledConstrainedRootVNode = this.applyConstraintOverridesToVNode(
                this.committedRoot,
                resolvedValuesForLayout,
                this._hiddenConstraintInstanceIds,
                this._constraintAffectedPathInstanceIds,
              );
            }
            const settledLayoutRootVNode =
              pendingScrollOverrides !== null
                ? this.applyScrollOverridesToVNode(
                    settledConstrainedRootVNode,
                    pendingScrollOverrides,
                  )
                : settledConstrainedRootVNode;

            const settledLayoutRes = this.layoutWithShapeFallback(
              settledLayoutRootVNode,
              settledConstrainedRootVNode,
              rootPad,
              rootW,
              rootH,
              true,
            );
            if (!settledLayoutRes.ok) {
              perfMarkEnd("layout", layoutToken);
              return {
                ok: false,
                code: settledLayoutRes.fatal.code,
                detail: settledLayoutRes.fatal.detail,
              };
            }
            nextLayoutTree = settledLayoutRes.value;
            settlePasses++;
          }
          if (settlePasses >= maxSettlePasses) {
            if (PERF_ENABLED) {
              perfCount("layout_constraint_settle_passes_cap_hit", 1);
            }
            if (FRAME_AUDIT_ENABLED) {
              emitFrameAudit("widgetRenderer", "layout.constraint_settle_cap_hit", {
                passes: settlePasses,
                maxPasses: maxSettlePasses,
                nodeCount: constraintGraph.nodes.length,
              });
            }
          }
          if (PERF_ENABLED && settlePasses > 0) {
            perfCount("layout_constraint_settle_passes", settlePasses);
          }
        }
        perfMarkEnd("layout", layoutToken);
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

      const canSkipFullRoutingRebuildOnCommit =
        doCommit &&
        hadRoutingWidgets &&
        hasRoutingWidgets &&
        identityDamageFromCommit !== null &&
        identityDamageFromCommit.routingRelevantChanged === false;

      if (
        doCommit &&
        (hasRoutingWidgets || hadRoutingWidgets) &&
        !canSkipFullRoutingRebuildOnCommit
      ) {
        didRoutingRebuild = true;
        this.hadRoutingWidgets = hasRoutingWidgets;
        const routingToken = PERF_DETAIL_ENABLED ? perfMarkStart("routing_rebuild") : 0;
        const getRectForInstance = (instanceId: InstanceId) =>
          this._pooledRectByInstanceId.get(instanceId) ?? ZERO_RECT;
        rebuildRoutingWidgetMapsAndOverlayState({
          committedRoot: this.committedRoot,
          hiddenConstraintInstanceIds: this._hiddenConstraintInstanceIds,
          pooledRuntimeStack: this._pooledRuntimeStack,
          pooledPrevTreeIds: this._pooledPrevTreeIds,
          getRectForInstance,
          computeDropdownRect: (props) => this.computeDropdownRect(props),
          layerRegistry: this.layerRegistry,
          pooledCloseOnEscape: this._pooledCloseOnEscape,
          pooledCloseOnBackdrop: this._pooledCloseOnBackdrop,
          pooledOnClose: this._pooledOnClose,
          pooledDropdownStack: this._pooledDropdownStack,
          pooledOverlayShortcutOwners: this._pooledOverlayShortcutOwners,
          pooledToastContainers: this._pooledToastContainers,
          virtualListById: this.virtualListById,
          buttonById: this.buttonById,
          linkById: this.linkById,
          tableById: this.tableById,
          treeById: this.treeById,
          dropdownById: this.dropdownById,
          sliderById: this.sliderById,
          selectById: this.selectById,
          checkboxById: this.checkboxById,
          radioGroupById: this.radioGroupById,
          commandPaletteById: this.commandPaletteById,
          filePickerById: this.filePickerById,
          fileTreeExplorerById: this.fileTreeExplorerById,
          splitPaneById: this.splitPaneById,
          codeEditorById: this.codeEditorById,
          diffViewerById: this.diffViewerById,
          toolApprovalDialogById: this.toolApprovalDialogById,
          logsConsoleById: this.logsConsoleById,
        });

        const preferredToastFocus =
          prevFocusedIdBeforeFinalize !== null &&
          parseToastActionFocusId(prevFocusedIdBeforeFinalize) !== null
            ? prevFocusedIdBeforeFinalize
            : null;
        const finalizedOverlayState = finalizeRebuiltOverlayState({
          layerRegistry: this.layerRegistry,
          pooledCloseOnEscape: this._pooledCloseOnEscape,
          pooledCloseOnBackdrop: this._pooledCloseOnBackdrop,
          pooledOnClose: this._pooledOnClose,
          pooledDropdownStack: this._pooledDropdownStack,
          pooledOverlayShortcutOwners: this._pooledOverlayShortcutOwners,
          pooledToastContainers: this._pooledToastContainers,
          pooledToastActionByFocusId: this._pooledToastActionByFocusId,
          pooledToastActionLabelByFocusId: this._pooledToastActionLabelByFocusId,
          pooledToastFocusableActionIds: this._pooledToastFocusableActionIds,
          baseFocusList: this.baseFocusList,
          baseEnabledById: this.baseEnabledById,
          focusState: this.focusState,
          preferredToastFocus,
        });
        this.layerStack = finalizedOverlayState.layerStack;
        this.closeOnEscapeByLayerId = finalizedOverlayState.closeOnEscapeByLayerId;
        this.closeOnBackdropByLayerId = finalizedOverlayState.closeOnBackdropByLayerId;
        this.onCloseByLayerId = finalizedOverlayState.onCloseByLayerId;
        this.dropdownStack = finalizedOverlayState.dropdownStack;
        this.overlayShortcutOwners = finalizedOverlayState.overlayShortcutOwners;
        this.toastContainers = finalizedOverlayState.toastContainers;
        this.rebuildOverlayShortcutBindings();
        this.toastActionByFocusId = finalizedOverlayState.toastActionByFocusId;
        this.toastActionLabelByFocusId = finalizedOverlayState.toastActionLabelByFocusId;
        this.toastFocusableActionIds = finalizedOverlayState.toastFocusableActionIds;
        this.focusList = finalizedOverlayState.focusList;
        this.enabledById = finalizedOverlayState.enabledById;
        this.focusState = finalizedOverlayState.focusState;
        if (PERF_DETAIL_ENABLED) perfMarkEnd("routing_rebuild", routingToken);
      } else if (doLayout && hadRoutingWidgets) {
        // Layout-only turns (e.g. resize) keep the committed widget maps intact.
        // Rebuild only rect-dependent overlay/ toast routing state.
        const routingToken = PERF_DETAIL_ENABLED ? perfMarkStart("routing_rebuild") : 0;
        const getRectForInstance = (instanceId: InstanceId) =>
          this._pooledRectByInstanceId.get(instanceId) ?? ZERO_RECT;
        rebuildOverlayStateForLayout({
          committedRoot: this.committedRoot,
          hiddenConstraintInstanceIds: this._hiddenConstraintInstanceIds,
          pooledRuntimeStack: this._pooledRuntimeStack,
          getRectForInstance,
          computeDropdownRect: (props) => this.computeDropdownRect(props),
          layerRegistry: this.layerRegistry,
          pooledCloseOnEscape: this._pooledCloseOnEscape,
          pooledCloseOnBackdrop: this._pooledCloseOnBackdrop,
          pooledOnClose: this._pooledOnClose,
          pooledDropdownStack: this._pooledDropdownStack,
          pooledOverlayShortcutOwners: this._pooledOverlayShortcutOwners,
          pooledToastContainers: this._pooledToastContainers,
        });

        const finalizedOverlayState = finalizeLayoutOnlyOverlayState({
          layerRegistry: this.layerRegistry,
          pooledCloseOnEscape: this._pooledCloseOnEscape,
          pooledCloseOnBackdrop: this._pooledCloseOnBackdrop,
          pooledOnClose: this._pooledOnClose,
          pooledDropdownStack: this._pooledDropdownStack,
          pooledToastContainers: this._pooledToastContainers,
          pooledToastActionByFocusId: this._pooledToastActionByFocusId,
          pooledToastActionLabelByFocusId: this._pooledToastActionLabelByFocusId,
          pooledToastFocusableActionIds: this._pooledToastFocusableActionIds,
          baseFocusList: this.baseFocusList,
          baseEnabledById: this.baseEnabledById,
          focusState: this.focusState,
        });
        this.layerStack = finalizedOverlayState.layerStack;
        this.closeOnEscapeByLayerId = finalizedOverlayState.closeOnEscapeByLayerId;
        this.closeOnBackdropByLayerId = finalizedOverlayState.closeOnBackdropByLayerId;
        this.onCloseByLayerId = finalizedOverlayState.onCloseByLayerId;
        this.dropdownStack = finalizedOverlayState.dropdownStack;
        this.toastContainers = finalizedOverlayState.toastContainers;
        this.rebuildOverlayShortcutBindings();
        this.toastActionByFocusId = finalizedOverlayState.toastActionByFocusId;
        this.toastActionLabelByFocusId = finalizedOverlayState.toastActionLabelByFocusId;
        this.toastFocusableActionIds = finalizedOverlayState.toastFocusableActionIds;
        this.focusList = finalizedOverlayState.focusList;
        this.enabledById = finalizedOverlayState.enabledById;
        this.focusState = finalizedOverlayState.focusState;

        if (PERF_DETAIL_ENABLED) perfMarkEnd("routing_rebuild", routingToken);
      }

      if (doCommit && !didRoutingRebuild) {
        this.hadRoutingWidgets = hasRoutingWidgets;
        if (canSkipFullRoutingRebuildOnCommit && !doLayout) {
          // Full routing rebuild usually refreshes shortcut bindings. When this
          // fast path skips that rebuild on commit-only turns, keep shortcut
          // bindings in sync with async command palette item updates.
          this.rebuildOverlayShortcutBindings();
        }
      }

      if (doCommit && didRoutingRebuild) {
        const cleanedRoutingState = cleanupRoutingStateAfterRebuild({
          pooledPrevTreeIds: this._pooledPrevTreeIds,
          treeStore: this.treeStore,
          virtualListStore: this.virtualListStore,
          tableStore: this.tableStore,
          loadedTreeChildrenByTreeId: this.loadedTreeChildrenByTreeId,
          treeLoadTokenByTreeAndKey: this.treeLoadTokenByTreeAndKey,
          dropdownSelectedIndexById: this.dropdownSelectedIndexById,
          dropdownWindowStartById: this.dropdownWindowStartById,
          pressedVirtualList: this.pressedVirtualList,
          pressedFileTree: this.pressedFileTree,
          lastFileTreeClick: this.lastFileTreeClick,
          pressedFilePicker: this.pressedFilePicker,
          lastFilePickerClick: this.lastFilePickerClick,
          pressedTree: this.pressedTree,
          lastTreeClick: this.lastTreeClick,
          commandPaletteItemsById: this.commandPaletteItemsById,
          commandPaletteLoadingById: this.commandPaletteLoadingById,
          commandPaletteFetchTokenById: this.commandPaletteFetchTokenById,
          commandPaletteLastQueryById: this.commandPaletteLastQueryById,
          commandPaletteLastSourcesRefById: this.commandPaletteLastSourcesRefById,
          toolApprovalFocusedActionById: this.toolApprovalFocusedActionById,
          diffViewerFocusedHunkById: this.diffViewerFocusedHunkById,
          diffViewerExpandedHunksById: this.diffViewerExpandedHunksById,
          logsConsoleLastGTimeById: this.logsConsoleLastGTimeById,
          tableRenderCacheById: this.tableRenderCacheById,
          logsConsoleRenderCacheById: this.logsConsoleRenderCacheById,
          diffRenderCacheById: this.diffRenderCacheById,
          codeEditorRenderCacheById: this.codeEditorRenderCacheById,
          emptyStringArray: EMPTY_STRING_ARRAY,
          virtualListById: this.virtualListById,
          buttonById: this.buttonById,
          linkById: this.linkById,
          tableById: this.tableById,
          treeById: this.treeById,
          dropdownById: this.dropdownById,
          sliderById: this.sliderById,
          selectById: this.selectById,
          checkboxById: this.checkboxById,
          radioGroupById: this.radioGroupById,
          commandPaletteById: this.commandPaletteById,
          filePickerById: this.filePickerById,
          fileTreeExplorerById: this.fileTreeExplorerById,
          splitPaneById: this.splitPaneById,
          codeEditorById: this.codeEditorById,
          diffViewerById: this.diffViewerById,
          toolApprovalDialogById: this.toolApprovalDialogById,
          logsConsoleById: this.logsConsoleById,
        });
        this.pressedVirtualList = cleanedRoutingState.pressedVirtualList;
        this.pressedFileTree = cleanedRoutingState.pressedFileTree;
        this.lastFileTreeClick = cleanedRoutingState.lastFileTreeClick;
        this.pressedFilePicker = cleanedRoutingState.pressedFilePicker;
        this.lastFilePickerClick = cleanedRoutingState.lastFilePickerClick;
        this.pressedTree = cleanedRoutingState.pressedTree;
        this.lastTreeClick = cleanedRoutingState.lastTreeClick;
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
      const forceFullRenderThisSubmit = this.forceFullRenderOnNextSubmit;
      this.forceFullRenderOnNextSubmit = false;
      if (
        !forceFullRenderThisSubmit &&
        this.shouldAttemptIncrementalRender(doLayout, viewport, theme)
      ) {
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
                this.dropdownWindowStartById,
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
          dropdownWindowStartById: this.dropdownWindowStartById,
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
