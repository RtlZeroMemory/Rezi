/**
 * packages/core/src/app/createApp.ts — Application factory and runtime orchestration.
 *
 * Why: Creates and manages the Rezi application instance, orchestrating
 * the event loop, state management, and rendering pipeline. This is the main
 * entry point for creating terminal UI applications.
 *
 * Responsibilities:
 *   - Lifecycle management (start/stop/dispose)
 *   - Mode selection (raw draw vs widget view)
 *   - Event polling and parsing
 *   - State update batching and commit
 *   - Render scheduling with frame coalescing
 *   - Fatal error handling with graceful teardown
 *
 * Invariants:
 *   - Re-entrant API calls throw ZRUI_REENTRANT_CALL
 *   - update() during render throws ZRUI_UPDATE_DURING_RENDER
 *   - Mode cannot be changed after first start()
 *   - Fatal errors transition to Faulted and dispose backend
 *
 * @see docs/guide/lifecycle-and-updates.md
 */

import { ZrUiError, type ZrUiErrorCode } from "../abi.js";
import {
  BACKEND_DRAWLIST_V2_MARKER,
  BACKEND_DRAWLIST_VERSION_MARKER,
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  type BackendEventBatch,
  FRAME_ACCEPTED_ACK_MARKER,
  type RuntimeBackend,
} from "../backend.js";
import type { UiEvent, ZrevEvent } from "../events.js";
import type {
  App,
  AppConfig,
  AppLayoutSnapshot,
  AppRenderMetrics,
  DrawFn,
  EventHandler,
  FocusChangeHandler,
  ViewFn,
} from "../index.js";
import type {
  BindingMap,
  KeyContext,
  KeybindingManagerState,
  ModeBindingMap,
} from "../keybindings/index.js";
import {
  createManagerState,
  getBindings,
  getMode,
  getPendingChord,
  registerBindings,
  registerModes,
  resetChordState,
  routeKeyEvent,
  setMode,
} from "../keybindings/index.js";
import { ZR_MOD_ALT, ZR_MOD_CTRL, ZR_MOD_META } from "../keybindings/keyCodes.js";
import {
  type ResponsiveBreakpointThresholds,
  normalizeBreakpointThresholds,
} from "../layout/responsive.js";
import type { Rect } from "../layout/types.js";
import { PERF_ENABLED, perfMarkEnd, perfMarkStart, perfNow, perfRecord } from "../perf/perf.js";
import type { EventTimeUnwrapState } from "../protocol/types.js";
import { parseEventBatchV1 } from "../protocol/zrev_v1.js";
import { type RouterIntegration, createRouterIntegration } from "../router/integration.js";
import type { RouteDefinition } from "../router/types.js";
import {
  DEFAULT_TERMINAL_PROFILE,
  type TerminalProfile,
  terminalProfileFromCaps,
} from "../terminalProfile.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import { coerceToLegacyTheme } from "../theme/interop.js";
import type { Theme } from "../theme/theme.js";
import type { ThemeDefinition } from "../theme/tokens.js";
import type { VNode } from "../widgets/types.js";
import { ui } from "../widgets/ui.js";
import { RawRenderer } from "./rawRenderer.js";
import {
  type RuntimeBreadcrumbAction,
  type RuntimeBreadcrumbConsumptionPath,
  type RuntimeBreadcrumbEventKind,
  type RuntimeBreadcrumbSnapshot,
  isRuntimeBreadcrumbEventKind,
  mergeRuntimeBreadcrumbSnapshot,
  toRuntimeBreadcrumbAction,
} from "./runtimeBreadcrumbs.js";
import { AppStateMachine } from "./stateMachine.js";
import { TurnScheduler } from "./turnScheduler.js";
import { type StateUpdater, UpdateQueue } from "./updateQueue.js";
import {
  type WidgetRenderPlan,
  WidgetRenderer,
  type WidgetRoutingOutcome,
} from "./widgetRenderer.js";

/** Resolved configuration with defaults applied. */
type ResolvedAppConfig = Readonly<{
  fpsCap: number;
  maxEventBytes: number;
  maxDrawlistBytes: number;
  rootPadding: number;
  breakpointThresholds: ResponsiveBreakpointThresholds;
  useV2Cursor: boolean;
  drawlistValidateParams: boolean;
  drawlistReuseOutputBuffer: boolean;
  drawlistEncodedStringCacheCap: number;
  maxFramesInFlight: number;
  internal_onRender?: ((metrics: AppRenderMetrics) => void) | undefined;
  internal_onLayout?: ((snapshot: AppLayoutSnapshot) => void) | undefined;
}>;

type InternalRenderMetricsWithBreadcrumbs = AppRenderMetrics &
  Readonly<{ runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot }>;
type InternalLayoutSnapshotWithBreadcrumbs = AppLayoutSnapshot &
  Readonly<{ runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot }>;

/** Default configuration values. */
const DEFAULT_CONFIG: ResolvedAppConfig = Object.freeze({
  fpsCap: 60,
  maxEventBytes: 1 << 20 /* 1 MiB */,
  maxDrawlistBytes: 2 << 20 /* 2 MiB */,
  rootPadding: 0,
  breakpointThresholds: normalizeBreakpointThresholds(undefined),
  useV2Cursor: false,
  drawlistValidateParams: true,
  drawlistReuseOutputBuffer: true,
  drawlistEncodedStringCacheCap: 131072,
  maxFramesInFlight: 1,
  internal_onRender: undefined,
  internal_onLayout: undefined,
});

const MAX_SAFE_FPS_CAP = 1000;
const MAX_SAFE_EVENT_BYTES = 4 << 20 /* 4 MiB */;
const SYNC_FRAME_ACK_MARKER = "__reziSyncFrameAck";
export const APP_INTERNAL_REQUEST_VIEW_LAYOUT_MARKER = "__reziRequestViewLayout";
export const APP_INTERNAL_SET_RUNTIME_BREADCRUMB_HOOKS_MARKER = "__reziSetRuntimeBreadcrumbHooks";

type InternalRuntimeBreadcrumbHooks = Readonly<{
  onRender?: ((metrics: AppRenderMetrics) => void) | undefined;
  onLayout?: ((snapshot: AppLayoutSnapshot) => void) | undefined;
}>;

function invalidProps(detail: string): never {
  throw new ZrUiError("ZRUI_INVALID_PROPS", detail);
}

function requirePositiveInt(name: string, v: number): number {
  if (!Number.isInteger(v) || v <= 0) invalidProps(`${name} must be a positive integer`);
  return v;
}

function requirePositiveIntAtMost(name: string, v: number, max: number): number {
  const parsed = requirePositiveInt(name, v);
  if (parsed > max) invalidProps(`${name} must be <= ${String(max)}`);
  return parsed;
}

function requireNonNegativeInt(name: string, v: number): number {
  if (!Number.isInteger(v) || v < 0) invalidProps(`${name} must be a non-negative integer`);
  return v;
}

function isSyncFrameAck(
  p: Promise<void>,
): p is Promise<void> & Readonly<Record<typeof SYNC_FRAME_ACK_MARKER, true>> {
  return (
    typeof p === "object" &&
    p !== null &&
    (p as Promise<void> & Partial<Record<typeof SYNC_FRAME_ACK_MARKER, true>>)[
      SYNC_FRAME_ACK_MARKER
    ] === true
  );
}

function getAcceptedFrameAck(p: Promise<void>): Promise<void> | null {
  if (typeof p !== "object" || p === null) return null;
  const marker = (p as Promise<void> & Partial<Record<typeof FRAME_ACCEPTED_ACK_MARKER, unknown>>)[
    FRAME_ACCEPTED_ACK_MARKER
  ];
  if (typeof marker !== "object" || marker === null) return null;
  if (typeof (marker as { then?: unknown }).then !== "function") return null;
  return marker as Promise<void>;
}

function readBackendBooleanMarker(
  backend: RuntimeBackend,
  marker: typeof BACKEND_DRAWLIST_V2_MARKER,
): boolean | null {
  const value = (backend as RuntimeBackend & Readonly<Record<string, unknown>>)[marker];
  if (value === undefined) return null;
  if (typeof value !== "boolean") {
    invalidProps(`backend marker ${marker} must be a boolean when present`);
  }
  return value;
}

function readBackendPositiveIntMarker(
  backend: RuntimeBackend,
  marker: typeof BACKEND_MAX_EVENT_BYTES_MARKER | typeof BACKEND_FPS_CAP_MARKER,
): number | null {
  const value = (backend as RuntimeBackend & Readonly<Record<string, unknown>>)[marker];
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    invalidProps(`backend marker ${marker} must be a positive integer when present`);
  }
  return value;
}

function readBackendDrawlistVersionMarker(backend: RuntimeBackend): 1 | 2 | 3 | 4 | 5 | null {
  const value = (backend as RuntimeBackend & Readonly<Record<string, unknown>>)[
    BACKEND_DRAWLIST_VERSION_MARKER
  ];
  if (value === undefined) return null;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    (value !== 1 && value !== 2 && value !== 3 && value !== 4 && value !== 5)
  ) {
    invalidProps(`backend marker ${BACKEND_DRAWLIST_VERSION_MARKER} must be an integer in [1..5]`);
  }
  return value as 1 | 2 | 3 | 4 | 5;
}

function monotonicNowMs(): number {
  const perf = (globalThis as { performance?: { now?: () => number } }).performance;
  const perfNow = perf?.now;
  if (typeof perfNow === "function") return perfNow.call(perf);
  return Date.now();
}

async function loadTerminalProfile(backend: RuntimeBackend): Promise<TerminalProfile> {
  try {
    if (typeof backend.getTerminalProfile === "function") {
      return await backend.getTerminalProfile();
    }
  } catch {
    // fall through to caps-derived profile
  }

  try {
    const caps = await backend.getCaps();
    return terminalProfileFromCaps(caps);
  } catch {
    return DEFAULT_TERMINAL_PROFILE;
  }
}

function buildLayoutDebugOverlay(rectById: ReadonlyMap<string, Rect>): VNode | null {
  if (rectById.size === 0) return null;
  const rows = [...rectById.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(0, 18)
    .map(([id, rect]) =>
      ui.text(`${id}  ${String(rect.x)},${String(rect.y)}  ${String(rect.w)}x${String(rect.h)}`),
    );
  const panel = ui.box({ border: "single", title: `Layout (${String(rectById.size)})`, p: 1 }, [
    ui.column({ gap: 0 }, rows),
  ]);
  return ui.layer({
    id: "rezi.layout.debug.overlay",
    zIndex: 2_000_000_000,
    modal: false,
    backdrop: "none",
    closeOnEscape: false,
    content: ui.column({ width: "100%", height: "100%", justify: "end", p: 1 }, [
      ui.row({ width: "100%", justify: "start" }, [panel]),
    ]),
  });
}

/** Apply defaults to user-provided config, validating all values. */
export function resolveAppConfig(config: AppConfig | undefined): ResolvedAppConfig {
  if (!config) return DEFAULT_CONFIG;
  const fpsCap =
    config.fpsCap === undefined
      ? DEFAULT_CONFIG.fpsCap
      : requirePositiveIntAtMost("fpsCap", config.fpsCap, MAX_SAFE_FPS_CAP);
  const maxEventBytes =
    config.maxEventBytes === undefined
      ? DEFAULT_CONFIG.maxEventBytes
      : requirePositiveIntAtMost("maxEventBytes", config.maxEventBytes, MAX_SAFE_EVENT_BYTES);
  const maxDrawlistBytes =
    config.maxDrawlistBytes === undefined
      ? DEFAULT_CONFIG.maxDrawlistBytes
      : requirePositiveInt("maxDrawlistBytes", config.maxDrawlistBytes);
  const rootPadding =
    config.rootPadding === undefined
      ? DEFAULT_CONFIG.rootPadding
      : requireNonNegativeInt("rootPadding", config.rootPadding);
  const breakpointThresholds = normalizeBreakpointThresholds(config.breakpoints);
  const useV2Cursor = config.useV2Cursor === true;
  const drawlistValidateParams =
    config.drawlistValidateParams === undefined
      ? DEFAULT_CONFIG.drawlistValidateParams
      : config.drawlistValidateParams !== false;
  const drawlistReuseOutputBuffer =
    config.drawlistReuseOutputBuffer === undefined
      ? DEFAULT_CONFIG.drawlistReuseOutputBuffer
      : config.drawlistReuseOutputBuffer === true;
  const drawlistEncodedStringCacheCap =
    config.drawlistEncodedStringCacheCap === undefined
      ? DEFAULT_CONFIG.drawlistEncodedStringCacheCap
      : requireNonNegativeInt(
          "drawlistEncodedStringCacheCap",
          config.drawlistEncodedStringCacheCap,
        );
  const maxFramesInFlight =
    config.maxFramesInFlight === undefined
      ? DEFAULT_CONFIG.maxFramesInFlight
      : Math.min(4, Math.max(1, requirePositiveInt("maxFramesInFlight", config.maxFramesInFlight)));
  const internal_onRender =
    typeof config.internal_onRender === "function" ? config.internal_onRender : undefined;
  const internal_onLayout =
    typeof config.internal_onLayout === "function" ? config.internal_onLayout : undefined;

  return Object.freeze({
    fpsCap,
    maxEventBytes,
    maxDrawlistBytes,
    rootPadding,
    breakpointThresholds,
    useV2Cursor,
    drawlistValidateParams,
    drawlistReuseOutputBuffer,
    drawlistEncodedStringCacheCap,
    maxFramesInFlight,
    internal_onRender,
    internal_onLayout,
  });
}

/** Render mode: raw (draw API) or widget (view function). */
type Mode = "raw" | "widget";

/**
 * Internal work items processed by the turn scheduler.
 *   - eventBatch: Parsed event batch from backend polling
 *   - userCommit: Scheduled state commit from update()
 *   - kick: Initial render trigger after start()
 *   - frameDone: Frame acknowledged by backend
 *   - frameError: Frame submission failed
 *   - fatal: Unrecoverable error requiring shutdown
 */
type WorkItem =
  | Readonly<{ kind: "eventBatch"; batch: BackendEventBatch }>
  | Readonly<{ kind: "userCommit" }>
  | Readonly<{ kind: "kick" }>
  | Readonly<{ kind: "renderRequest" }>
  | Readonly<{ kind: "frameDone" }>
  | Readonly<{ kind: "frameError"; error: unknown }>
  | Readonly<{ kind: "fatal"; code: ZrUiErrorCode; detail: string }>;

/** Event handler registration with deactivation flag. */
type HandlerSlot = Readonly<{ fn: EventHandler; active: { value: boolean } }>;
type FocusHandlerSlot = Readonly<{ fn: FocusChangeHandler; active: { value: boolean } }>;

function describeThrown(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  return String(v);
}

type TopLevelViewError = Readonly<{
  code: "ZRUI_USER_CODE_THROW";
  detail: string;
  message: string;
  stack?: string;
}>;

const KEY_Q = 81;
const KEY_R = 82;

function captureTopLevelViewError(value: unknown): TopLevelViewError {
  if (value instanceof Error) {
    return Object.freeze({
      code: "ZRUI_USER_CODE_THROW",
      detail: `${value.name}: ${value.message}`,
      message: value.message,
      ...(typeof value.stack === "string" && value.stack.length > 0 ? { stack: value.stack } : {}),
    });
  }
  const detail = String(value);
  return Object.freeze({
    code: "ZRUI_USER_CODE_THROW",
    detail,
    message: detail,
  });
}

function buildTopLevelViewErrorScreen(error: TopLevelViewError): VNode {
  const lines = [`Code: ${error.code}`, `Message: ${error.message}`];
  if (error.stack === undefined || error.stack.length === 0) {
    lines.push(`Detail: ${error.detail}`);
  }
  return ui.column({ width: "100%", height: "100%", justify: "center", align: "center", p: 1 }, [
    ui.box(
      {
        width: "100%",
        height: "100%",
        border: "single",
        title: "Runtime Error",
        p: 1,
      },
      [
        ui.errorDisplay(lines.join("\n"), {
          title: "Top-level view() threw",
          ...(error.stack === undefined || error.stack.length === 0
            ? {}
            : { stack: error.stack, showStack: true }),
        }),
        ui.callout("Press R to retry, Q to quit", { variant: "warning" }),
      ],
    ),
  ]);
}

function isUnmodifiedLetterKey(mods: number): boolean {
  return (mods & (ZR_MOD_CTRL | ZR_MOD_ALT | ZR_MOD_META)) === 0;
}

function isTopLevelRetryEvent(ev: ZrevEvent): boolean {
  if (ev.kind === "key") {
    return ev.action === "down" && isUnmodifiedLetterKey(ev.mods) && ev.key === KEY_R;
  }
  if (ev.kind === "text") {
    return ev.codepoint === KEY_R || ev.codepoint === 114;
  }
  return false;
}

function isTopLevelQuitEvent(ev: ZrevEvent): boolean {
  if (ev.kind === "key") {
    return ev.action === "down" && isUnmodifiedLetterKey(ev.mods) && ev.key === KEY_Q;
  }
  if (ev.kind === "text") {
    return ev.codepoint === KEY_Q || ev.codepoint === 113;
  }
  return false;
}

type ProcessLike = Readonly<{
  on?: ((event: string, handler: (...args: unknown[]) => void) => unknown) | undefined;
  off?: ((event: string, handler: (...args: unknown[]) => void) => unknown) | undefined;
  removeListener?: ((event: string, handler: (...args: unknown[]) => void) => unknown) | undefined;
  exit?: ((code?: number) => void) | undefined;
}>;

function readProcessLike(): ProcessLike | null {
  const processRef = (
    globalThis as {
      process?: {
        on?: (event: string, handler: (...args: unknown[]) => void) => unknown;
        off?: (event: string, handler: (...args: unknown[]) => void) => unknown;
        removeListener?: (event: string, handler: (...args: unknown[]) => void) => unknown;
        exit?: (code?: number) => void;
      };
    }
  ).process;
  if (!processRef || typeof processRef !== "object") return null;
  return processRef;
}

function removeSignalHandler(
  proc: ProcessLike,
  signal: string,
  handler: (...args: unknown[]) => void,
): void {
  if (typeof proc.off === "function") {
    proc.off(signal, handler);
    return;
  }
  if (typeof proc.removeListener === "function") {
    proc.removeListener(signal, handler);
  }
}

/**
 * Convert a text codepoint to a key code for keybinding matching.
 * Letters are normalized to uppercase (A-Z = 65-90).
 * Returns null if codepoint is not matchable.
 */
function codepointToKeyCode(codepoint: number): number | null {
  // Lowercase letters -> uppercase
  if (codepoint >= 97 && codepoint <= 122) {
    return codepoint - 32; // 'a' (97) -> 'A' (65)
  }
  // Uppercase letters
  if (codepoint >= 65 && codepoint <= 90) {
    return codepoint;
  }
  // Digits and printable ASCII
  if (codepoint >= 32 && codepoint <= 126) {
    return codepoint;
  }
  return null;
}

type CreateAppBaseOptions = Readonly<{
  backend: RuntimeBackend;
  config?: AppConfig;
  theme?: Theme | ThemeDefinition;
}>;

type CreateAppStateOptions<S> = CreateAppBaseOptions &
  Readonly<{
    initialState: S;
    routes?: readonly RouteDefinition<S>[];
    initialRoute?: string;
    routeHistoryMaxDepth?: number;
  }>;

type CreateAppRoutesOnlyOptions = CreateAppBaseOptions &
  Readonly<{
    routes: readonly RouteDefinition<Record<string, never>>[];
    initialRoute: string;
    initialState?: Record<string, never>;
    routeHistoryMaxDepth?: number;
  }>;

/**
 * Create a Rezi application instance.
 *
 * @typeParam S - Application state type
 * @param opts.backend - Runtime backend (e.g., createNodeBackend())
 * @param opts.initialState - Initial application state
 * @param opts.config - Optional configuration overrides
 * @returns App instance with view/draw, update, start/stop/dispose methods
 *
 * @example
 * ```ts
 * const app = createApp({
 *   backend: createNodeBackend(),
 *   initialState: { count: 0 },
 * });
 *
 * app.view((state) => ui.text(`Count: ${state.count}`));
 * await app.start();
 * ```
 */
export function createApp(opts: CreateAppRoutesOnlyOptions): App<Record<string, never>>;
export function createApp<S>(opts: CreateAppStateOptions<S>): App<S>;
export function createApp<S>(opts: CreateAppStateOptions<S> | CreateAppRoutesOnlyOptions): App<S> {
  const backend = opts.backend;
  const config = resolveAppConfig(opts.config);

  const backendUseDrawlistV2 = readBackendBooleanMarker(backend, BACKEND_DRAWLIST_V2_MARKER);
  if (config.useV2Cursor && backendUseDrawlistV2 === false) {
    invalidProps(
      "config.useV2Cursor=true but backend.useDrawlistV2=false. " +
        "Fix: set createNodeBackend({ useDrawlistV2: true }) or configure a backend drawlist version >= 2.",
    );
  }

  const backendDrawlistVersion = readBackendDrawlistVersionMarker(backend);
  if (config.useV2Cursor && backendDrawlistVersion !== null && backendDrawlistVersion < 2) {
    invalidProps(
      `config.useV2Cursor=true but backend drawlistVersion=${String(
        backendDrawlistVersion,
      )}. Fix: set backend drawlist version >= 2.`,
    );
  }
  const drawlistVersion: 1 | 2 | 3 | 4 | 5 = backendDrawlistVersion ?? (config.useV2Cursor ? 2 : 1);

  const backendMaxEventBytes = readBackendPositiveIntMarker(
    backend,
    BACKEND_MAX_EVENT_BYTES_MARKER,
  );
  if (backendMaxEventBytes !== null && backendMaxEventBytes !== config.maxEventBytes) {
    invalidProps(
      `config.maxEventBytes=${String(config.maxEventBytes)} must match backend maxEventBytes=${String(
        backendMaxEventBytes,
      )}. Fix: set the same maxEventBytes in createApp({ config }) and createNodeBackend({ maxEventBytes }), or use createNodeApp({ config: { maxEventBytes: ... } }).`,
    );
  }

  const backendFpsCap = readBackendPositiveIntMarker(backend, BACKEND_FPS_CAP_MARKER);
  if (backendFpsCap !== null && backendFpsCap !== config.fpsCap) {
    invalidProps(
      `config.fpsCap=${String(config.fpsCap)} must match backend fpsCap=${String(
        backendFpsCap,
      )}. Fix: set the same fpsCap in createApp({ config }) and createNodeBackend({ fpsCap }), or use createNodeApp({ config: { fpsCap: ... } }).`,
    );
  }

  let theme = coerceToLegacyTheme(opts.theme ?? defaultTheme);
  let terminalProfile: TerminalProfile = DEFAULT_TERMINAL_PROFILE;

  const sm = new AppStateMachine();

  const routes = opts.routes as readonly RouteDefinition<S>[] | undefined;
  if (routes !== undefined && routes.length === 0) {
    invalidProps("routes must contain at least one route");
  }
  if (routes === undefined && opts.initialRoute !== undefined) {
    invalidProps("initialRoute requires routes");
  }
  if (routes !== undefined && opts.initialRoute === undefined) {
    invalidProps("initialRoute is required when routes are provided");
  }
  if (opts.routeHistoryMaxDepth !== undefined) {
    requirePositiveInt("routeHistoryMaxDepth", opts.routeHistoryMaxDepth);
  }

  let mode: Mode | null = null;
  let drawFn: DrawFn | null = null;
  let viewFn: ViewFn<S> | null = null;
  let topLevelViewError: TopLevelViewError | null = null;
  let debugLayoutEnabled = false;

  const hasInitialState = "initialState" in opts;
  let committedState: S = hasInitialState ? (opts.initialState as S) : (Object.freeze({}) as S);
  const updates = new UpdateQueue<S>();

  const handlers: HandlerSlot[] = [];
  const focusHandlers: FocusHandlerSlot[] = [];
  let lastEmittedFocusId: string | null = null;

  const DIRTY_RENDER = 1 << 0;
  const DIRTY_LAYOUT = 1 << 1;
  const DIRTY_VIEW = 1 << 2;
  const spinnerTickMinIntervalMs = Math.max(1, Math.floor(1000 / Math.min(config.fpsCap, 8)));

  let dirtyFlags = 0;
  let dirtyRenderVersion = 0;
  let dirtyLayoutVersion = 0;
  let dirtyViewVersion = 0;
  let framesInFlight = 0;
  let interactiveBudget = 0;
  let lastSpinnerRenderTickMs = Number.NEGATIVE_INFINITY;
  let lastObservedSpinnerTickEventMs = Number.NEGATIVE_INFINITY;
  let lastSpinnerRenderPerfMs = Number.NEGATIVE_INFINITY;
  let viewport: Readonly<{ cols: number; rows: number }> | null = null;
  const timeUnwrap: EventTimeUnwrapState = { epochMs: 0, lastRawMs: null };

  let inRender = false;
  let inCommit = false;
  let inEventHandlerDepth = 0;

  let lifecycleBusy: "start" | "stop" | null = null;
  let pollToken = 0;
  let settleActiveRun: (() => void) | null = null;

  let userCommitScheduled = false;

  // Perf tracking: submit time for backend_ack calculation
  let submitFrameStartMs: number | null = null;

  // Perf tracking: schedule_wait measures time from render request to render start
  let scheduleWaitStartMs: number | null = null;

  const scheduler = new TurnScheduler<WorkItem>((items) => processTurn(items));

  type DirtyVersionSnapshot = Readonly<{ render: number; layout: number; view: number }>;

  function snapshotDirtyVersions(): DirtyVersionSnapshot {
    return {
      render: dirtyRenderVersion,
      layout: dirtyLayoutVersion,
      view: dirtyViewVersion,
    };
  }

  function clearConsumedDirtyFlags(consumedFlags: number, snapshot: DirtyVersionSnapshot): void {
    let clearMask = 0;
    if ((consumedFlags & DIRTY_RENDER) !== 0 && dirtyRenderVersion === snapshot.render) {
      clearMask |= DIRTY_RENDER;
    }
    if ((consumedFlags & DIRTY_LAYOUT) !== 0 && dirtyLayoutVersion === snapshot.layout) {
      clearMask |= DIRTY_LAYOUT;
    }
    if ((consumedFlags & DIRTY_VIEW) !== 0 && dirtyViewVersion === snapshot.view) {
      clearMask |= DIRTY_VIEW;
    }
    dirtyFlags &= ~clearMask;
  }

  function markDirty(flags: number, schedule = true): void {
    // Track when dirty flags are first set for schedule_wait measurement.
    // This captures time from "render needed" to "render started".
    const wasDirty = dirtyFlags !== 0;
    dirtyFlags |= flags;
    if ((flags & DIRTY_RENDER) !== 0) dirtyRenderVersion++;
    if ((flags & DIRTY_LAYOUT) !== 0) dirtyLayoutVersion++;
    if ((flags & DIRTY_VIEW) !== 0) dirtyViewVersion++;
    if (PERF_ENABLED && !wasDirty && dirtyFlags !== 0 && scheduleWaitStartMs === null) {
      scheduleWaitStartMs = perfMarkStart("schedule_wait");
    }
    if (!schedule) return;
    if (sm.state !== "Running") return;
    if (scheduler.isScheduled || scheduler.isExecuting) return;
    scheduler.enqueue({ kind: "renderRequest" });
  }

  function requestRenderFromRenderer(): void {
    markDirty(DIRTY_RENDER);
  }

  function requestViewFromRenderer(): void {
    markDirty(DIRTY_VIEW);
  }

  const baseInternalOnRender = config.internal_onRender;
  const baseInternalOnLayout = config.internal_onLayout;
  let inspectorInternalOnRender: ((metrics: AppRenderMetrics) => void) | undefined;
  let inspectorInternalOnLayout: ((snapshot: AppLayoutSnapshot) => void) | undefined;

  let runtimeBreadcrumbsEnabled =
    baseInternalOnRender !== undefined || baseInternalOnLayout !== undefined;

  const rawRenderer = new RawRenderer({
    backend,
    drawlistVersion,
    maxDrawlistBytes: config.maxDrawlistBytes,
    ...(opts.config?.drawlistValidateParams === undefined
      ? {}
      : { drawlistValidateParams: opts.config.drawlistValidateParams }),
    drawlistReuseOutputBuffer: config.drawlistReuseOutputBuffer,
    drawlistEncodedStringCacheCap: config.drawlistEncodedStringCacheCap,
  });
  const widgetRenderer = new WidgetRenderer<S>({
    backend,
    drawlistVersion,
    maxDrawlistBytes: config.maxDrawlistBytes,
    rootPadding: config.rootPadding,
    breakpointThresholds: config.breakpointThresholds,
    terminalProfile,
    useV2Cursor: config.useV2Cursor,
    ...(opts.config?.drawlistValidateParams === undefined
      ? {}
      : { drawlistValidateParams: opts.config.drawlistValidateParams }),
    drawlistReuseOutputBuffer: config.drawlistReuseOutputBuffer,
    drawlistEncodedStringCacheCap: config.drawlistEncodedStringCacheCap,
    requestRender: requestRenderFromRenderer,
    requestView: requestViewFromRenderer,
    collectRuntimeBreadcrumbs: runtimeBreadcrumbsEnabled,
  });
  lastEmittedFocusId = widgetRenderer.getFocusedId();

  let routeStateUpdater: ((updater: StateUpdater<S>) => void) | null = null;
  let routerIntegration: RouterIntegration<S> | null = null;

  if (routes !== undefined) {
    mode = "widget";
    viewFn = (state) => {
      if (!routerIntegration || !routeStateUpdater) {
        throw new ZrUiError("ZRUI_INVALID_STATE", "router integration is not initialized");
      }
      return routerIntegration.renderCurrentScreen(state, routeStateUpdater);
    };
  }

  /* --- Keybinding State --- */
  let keybindingState: KeybindingManagerState<KeyContext<S>> = createManagerState();
  let keybindingsEnabled = false;

  let breadcrumbLastEventKind: RuntimeBreadcrumbEventKind | null = null;
  let breadcrumbLastConsumptionPath: RuntimeBreadcrumbConsumptionPath | null = null;
  let breadcrumbLastAction: RuntimeBreadcrumbAction | null = null;
  let breadcrumbEventTracked = false;

  function recomputeRuntimeBreadcrumbCollection(): void {
    const next =
      baseInternalOnRender !== undefined ||
      baseInternalOnLayout !== undefined ||
      inspectorInternalOnRender !== undefined ||
      inspectorInternalOnLayout !== undefined;
    if (next === runtimeBreadcrumbsEnabled) return;
    runtimeBreadcrumbsEnabled = next;
    widgetRenderer.setRuntimeBreadcrumbCaptureEnabled(next);
    if (!next) {
      breadcrumbLastEventKind = null;
      breadcrumbLastConsumptionPath = null;
      breadcrumbLastAction = null;
      breadcrumbEventTracked = false;
    }
  }

  function computeKeybindingsEnabled(state: KeybindingManagerState<KeyContext<S>>): boolean {
    for (const m of state.modes.values()) {
      if (m.bindings.length > 0) return true;
    }
    return false;
  }

  function applyRoutedKeybindingState(
    routeInputState: KeybindingManagerState<KeyContext<S>>,
    routeNextState: KeybindingManagerState<KeyContext<S>>,
  ): void {
    const previousChordState = keybindingState.chordState;

    // If handlers did not mutate keybinding state, take the routed state directly.
    if (keybindingState === routeInputState) {
      keybindingState = routeNextState;
      if (keybindingState.chordState !== previousChordState) {
        markDirty(DIRTY_VIEW);
      }
      return;
    }

    // Preserve handler-triggered mode changes (for example app.setMode() in a binding).
    if (keybindingState.currentMode !== routeInputState.currentMode) {
      return;
    }

    // For non-mode mutations (e.g. app.keys/app.modes in a handler), keep those
    // edits but still advance chord state from the routed event.
    keybindingState = Object.freeze({
      ...keybindingState,
      chordState: routeNextState.chordState,
    });

    if (keybindingState.chordState !== previousChordState) {
      markDirty(DIRTY_VIEW);
    }
  }

  function noteBreadcrumbEvent(kind: string): void {
    breadcrumbEventTracked = false;
    if (!runtimeBreadcrumbsEnabled) return;
    if (!isRuntimeBreadcrumbEventKind(kind)) return;
    breadcrumbLastEventKind = kind;
    breadcrumbLastConsumptionPath = null;
    breadcrumbEventTracked = true;
  }

  function noteBreadcrumbConsumptionPath(path: RuntimeBreadcrumbConsumptionPath): void {
    if (!runtimeBreadcrumbsEnabled) return;
    if (!breadcrumbEventTracked) return;
    breadcrumbLastConsumptionPath = path;
  }

  function noteBreadcrumbAction(action: NonNullable<WidgetRoutingOutcome["action"]>): void {
    if (!runtimeBreadcrumbsEnabled) return;
    if (!breadcrumbEventTracked) return;
    breadcrumbLastAction = toRuntimeBreadcrumbAction(action);
  }

  function retryTopLevelViewError(): void {
    topLevelViewError = null;
    markDirty(DIRTY_VIEW | DIRTY_LAYOUT);
  }

  function quitFromTopLevelViewError(): void {
    let stopPromise: Promise<void>;
    try {
      stopPromise = app.stop();
    } catch {
      try {
        app.dispose();
      } catch {
        // ignore
      }
      return;
    }
    void stopPromise.finally(() => {
      try {
        app.dispose();
      } catch {
        // ignore
      }
    });
  }

  function buildRuntimeBreadcrumbSnapshot(renderTimeMs: number): RuntimeBreadcrumbSnapshot | null {
    if (!runtimeBreadcrumbsEnabled) return null;
    const widgetSnapshot = widgetRenderer.getRuntimeBreadcrumbSnapshot();
    if (!widgetSnapshot) return null;
    return mergeRuntimeBreadcrumbSnapshot(
      widgetSnapshot,
      breadcrumbLastEventKind,
      breadcrumbLastConsumptionPath,
      breadcrumbLastAction,
      renderTimeMs,
    );
  }

  function throwCode(code: ZrUiErrorCode, detail: string): never {
    throw new ZrUiError(code, detail);
  }

  function assertOperational(method: string): void {
    const st = sm.state;
    if (st === "Disposed" || st === "Faulted") {
      throwCode("ZRUI_INVALID_STATE", `${method}: app is ${st}`);
    }
  }

  function assertNotReentrant(method: string): void {
    if (inCommit || inRender || inEventHandlerDepth > 0) {
      throwCode("ZRUI_REENTRANT_CALL", `${method}: re-entrant call`);
    }
  }

  function enqueueFatal(code: ZrUiErrorCode, detail: string): void {
    scheduler.enqueue({ kind: "fatal", code, detail });
  }

  function fatalNowOrEnqueue(code: ZrUiErrorCode, detail: string): void {
    if (scheduler.isExecuting) {
      doFatal(code, detail);
      return;
    }
    enqueueFatal(code, detail);
  }

  function assertRouterMutationAllowed(method: string): void {
    assertOperational(method);
    if (inCommit) throwCode("ZRUI_REENTRANT_CALL", `${method}: called during commit`);
    if (inRender) throwCode("ZRUI_UPDATE_DURING_RENDER", `${method}: called during render`);
  }

  if (routes !== undefined) {
    routerIntegration = createRouterIntegration<S>({
      routes,
      initialRoute: opts.initialRoute as string,
      ...(opts.routeHistoryMaxDepth === undefined
        ? {}
        : { maxHistoryDepth: opts.routeHistoryMaxDepth }),
      getState: () => committedState,
      // Route transitions can swap the entire screen tree; force both commit
      // and layout so id->rect indexes and focus metadata stay in sync.
      requestRouteRender: () => markDirty(DIRTY_VIEW | DIRTY_LAYOUT),
      captureFocusSnapshot: () => widgetRenderer.captureFocusSnapshot(),
      restoreFocusSnapshot: (snapshot) => widgetRenderer.restoreFocusSnapshot(snapshot),
      assertCanMutate: assertRouterMutationAllowed,
    });
  }

  function emit(ev: UiEvent): void {
    const snapshot: EventHandler[] = [];
    for (const slot of handlers) {
      if (slot.active.value) snapshot.push(slot.fn);
    }

    inEventHandlerDepth++;
    try {
      for (const fn of snapshot) {
        try {
          fn(ev);
        } catch (e: unknown) {
          // Treat handler exceptions as fatal, but defer out of the handler stack.
          enqueueFatal("ZRUI_USER_CODE_THROW", `onEvent handler threw: ${describeThrown(e)}`);
          return;
        }
      }
    } finally {
      inEventHandlerDepth--;
    }
  }

  function emitFocusChangeIfNeeded(): boolean {
    const focusedId = widgetRenderer.getFocusedId();
    if (focusedId === lastEmittedFocusId) return true;
    lastEmittedFocusId = focusedId;

    const info = widgetRenderer.getCurrentFocusInfo();
    const snapshot: FocusChangeHandler[] = [];
    for (const slot of focusHandlers) {
      if (slot.active.value) snapshot.push(slot.fn);
    }

    for (const fn of snapshot) {
      try {
        fn(info);
      } catch (e: unknown) {
        enqueueFatal("ZRUI_USER_CODE_THROW", `onFocusChange handler threw: ${describeThrown(e)}`);
        return false;
      }
    }
    return true;
  }

  function doFatal(code: ZrUiErrorCode, detail: string): void {
    if (sm.state !== "Running") return;

    // 1) emit fatal to handlers (registration order, best-effort)
    const fatalEv: UiEvent = { kind: "fatal", code, detail };
    const snapshot: EventHandler[] = [];
    for (const slot of handlers) {
      if (slot.active.value) snapshot.push(slot.fn);
    }
    for (const fn of snapshot) {
      try {
        fn(fatalEv);
      } catch {
        // ignore
      }
    }

    // 2) transition to Faulted
    try {
      sm.toFaulted();
    } catch {
      // ignore
    }

    // Stop polling immediately.
    pollToken++;

    // 3) backend stop/dispose best-effort (stop then dispose)
    try {
      void backend
        .stop()
        .catch(() => undefined)
        .finally(() => {
          try {
            backend.dispose();
          } catch {
            // ignore
          }
          settleActiveRun?.();
        });
    } catch {
      try {
        backend.dispose();
      } catch {
        // ignore
      }
      settleActiveRun?.();
    }
  }

  function releaseOnce(batch: BackendEventBatch): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      try {
        batch.release();
      } catch {
        // ignore
      }
    };
  }

  function processEventBatch(batch: BackendEventBatch): void {
    const release = releaseOnce(batch);

    const parseToken = perfMarkStart("event_parse");
    const parsed = parseEventBatchV1(batch.bytes, {
      maxTotalSize: config.maxEventBytes,
      timeUnwrap,
    });
    perfMarkEnd("event_parse", parseToken);
    if (!parsed.ok) {
      release();
      fatalNowOrEnqueue("ZRUI_PROTOCOL_ERROR", `${parsed.error.code}: ${parsed.error.detail}`);
      return;
    }

    const engineTruncated = (parsed.value.flags & 1) !== 0;
    const droppedBatches = batch.droppedBatches;

    try {
      if (engineTruncated || droppedBatches > 0) {
        emit({ kind: "overrun", engineTruncated, droppedBatches });
        if (sm.state !== "Running") return;
      }

      for (const ev of parsed.value.events) {
        // Input-priority / preemption: when an interactive input event arrives,
        // allow a short urgent burst even if a previous frame is still
        // in-flight. This keeps interactive latency resilient to transport/ack
        // jitter while older frames are still coalesced downstream (latest-wins)
        // in the backend/worker.
        if (ev.kind === "key" || ev.kind === "text" || ev.kind === "paste" || ev.kind === "mouse") {
          interactiveBudget = 2;
        }
        noteBreadcrumbEvent(ev.kind);
        emit({ kind: "engine", event: ev });
        if (sm.state !== "Running") return;
        if (ev.kind === "resize") {
          const prev = viewport;
          if (prev === null || prev.cols !== ev.cols || prev.rows !== ev.rows) {
            viewport = Object.freeze({ cols: ev.cols, rows: ev.rows });
            if (widgetRenderer.hasViewportAwareComposites()) {
              widgetRenderer.invalidateCompositeWidgets();
              markDirty(DIRTY_LAYOUT | DIRTY_VIEW);
            } else {
              markDirty(DIRTY_LAYOUT);
            }
          }
        }
        if (ev.kind === "tick" && mode === "widget") {
          // Tick events drive render-only animation frames for animated widgets
          // (currently spinner). Throttle to avoid repaint storms/flicker.
          //
          // Prefer backend tick timestamps when they advance, but fall back to
          // local monotonic time for runtimes/terminals where tick time is
          // constant or non-monotonic.
          if (widgetRenderer.hasAnimatedWidgets()) {
            const tickMs = ev.timeMs;
            const perfMs = perfNow();
            const eventClockAdvances = tickMs > lastObservedSpinnerTickEventMs;
            if (eventClockAdvances) lastObservedSpinnerTickEventMs = tickMs;
            const elapsedMs = eventClockAdvances
              ? tickMs - lastSpinnerRenderTickMs
              : perfMs - lastSpinnerRenderPerfMs;
            if (elapsedMs >= spinnerTickMinIntervalMs) {
              lastSpinnerRenderTickMs = tickMs;
              lastSpinnerRenderPerfMs = perfMs;
              markDirty(DIRTY_RENDER);
            }
          }
        }

        if (mode === "widget" && topLevelViewError !== null) {
          if (isTopLevelRetryEvent(ev)) {
            noteBreadcrumbConsumptionPath("widgetRouting");
            retryTopLevelViewError();
            continue;
          }
          if (isTopLevelQuitEvent(ev)) {
            noteBreadcrumbConsumptionPath("widgetRouting");
            quitFromTopLevelViewError();
            continue;
          }
          if (
            ev.kind === "key" ||
            ev.kind === "text" ||
            ev.kind === "paste" ||
            ev.kind === "mouse"
          ) {
            noteBreadcrumbConsumptionPath("widgetRouting");
            continue;
          }
        }

        const isWidgetRoutableEvent =
          ev.kind === "key" || ev.kind === "text" || ev.kind === "paste" || ev.kind === "mouse";
        if (mode === "widget" && isWidgetRoutableEvent) {
          if (keybindingsEnabled) {
            if (
              ev.kind === "mouse" &&
              ev.mouseKind === 3 &&
              keybindingState.chordState.pendingKeys.length > 0
            ) {
              keybindingState = Object.freeze({
                ...keybindingState,
                chordState: resetChordState(),
              });
            }

            // Route key events through keybinding system first
            if (ev.kind === "key") {
              const bypass = widgetRenderer.shouldBypassKeybindings(ev);
              if (!bypass) {
                const keyCtx: KeyContext<S> = Object.freeze({
                  state: committedState,
                  update: app.update,
                  focusedId: widgetRenderer.getFocusedId(),
                });
                const routeInputState = keybindingState;
                const keyResult = routeKeyEvent(routeInputState, ev, keyCtx);
                applyRoutedKeybindingState(routeInputState, keyResult.nextState);
                if (keyResult.handlerError !== undefined) {
                  enqueueFatal(
                    "ZRUI_USER_CODE_THROW",
                    `keybinding handler threw: ${describeThrown(keyResult.handlerError)}`,
                  );
                  return;
                }
                if (keyResult.consumed) {
                  noteBreadcrumbConsumptionPath("keybindings");
                  continue; // Skip default widget routing
                }
              }
            }

            // Also route text events through keybinding system for single-character bindings
            if (ev.kind === "text") {
              const keyCode = codepointToKeyCode(ev.codepoint);
              if (keyCode !== null) {
                // Create a synthetic key event for keybinding matching
                const syntheticKeyEvent = {
                  kind: "key" as const,
                  action: "down" as const,
                  key: keyCode,
                  mods: 0, // Text events have no modifiers
                  timeMs: ev.timeMs,
                };
                const keyCtx: KeyContext<S> = Object.freeze({
                  state: committedState,
                  update: app.update,
                  focusedId: widgetRenderer.getFocusedId(),
                });
                const routeInputState = keybindingState;
                const keyResult = routeKeyEvent(routeInputState, syntheticKeyEvent, keyCtx);
                applyRoutedKeybindingState(routeInputState, keyResult.nextState);
                if (keyResult.handlerError !== undefined) {
                  enqueueFatal(
                    "ZRUI_USER_CODE_THROW",
                    `keybinding handler threw: ${describeThrown(keyResult.handlerError)}`,
                  );
                  return;
                }
                if (keyResult.consumed) {
                  noteBreadcrumbConsumptionPath("keybindings");
                  continue; // Skip default widget routing
                }
              }
            }
          }

          let routed: WidgetRoutingOutcome;
          try {
            noteBreadcrumbConsumptionPath("widgetRouting");
            routed = widgetRenderer.routeEngineEvent(ev);
          } catch (e: unknown) {
            enqueueFatal("ZRUI_USER_CODE_THROW", `widget routing threw: ${describeThrown(e)}`);
            return;
          }
          if (!emitFocusChangeIfNeeded()) return;
          if (routed.needsRender) markDirty(DIRTY_RENDER);
          if (routed.action) {
            noteBreadcrumbAction(routed.action);
            emit({ kind: "action", ...routed.action });
            if (sm.state !== "Running") return;
          }
        }
      }
    } finally {
      release();
    }
  }

  function commitUpdates(): void {
    const drained = updates.drain();
    if (drained.length === 0) return;

    const commitToken = perfMarkStart("commit");
    inCommit = true;
    try {
      let next = committedState;
      for (const u of drained) {
        if (typeof u === "function") {
          next = (u as (prev: Readonly<S>) => S)(next);
        } else {
          next = u;
        }
      }
      if (next !== committedState) {
        committedState = next;
        markDirty(DIRTY_VIEW, false);
      }
    } catch (e: unknown) {
      fatalNowOrEnqueue("ZRUI_USER_CODE_THROW", `state updater threw: ${describeThrown(e)}`);
    } finally {
      inCommit = false;
      perfMarkEnd("commit", commitToken);
    }
  }

  function scheduleFrameSettlement(
    p: Promise<void>,
    submitStart: number | null,
    submitEnd: number | null,
  ): void {
    if (isSyncFrameAck(p)) {
      if (PERF_ENABLED && submitStart !== null) {
        const ackNow = perfNow();
        perfRecord("backend_ack", ackNow - submitStart);
        if (submitEnd !== null) {
          perfRecord("frame_build", submitEnd - submitStart);
          perfRecord("worker_roundtrip", ackNow - submitEnd);
        }
      }
      framesInFlight = Math.max(0, framesInFlight - 1);
      return;
    }

    const acceptedAck = getAcceptedFrameAck(p);
    const ackPromise = acceptedAck ?? p;

    void ackPromise.then(
      () => {
        if (PERF_ENABLED && submitStart !== null) {
          const ackNow = perfNow();
          // backend_ack: total time from frame build start to backend ack.
          // Equals frame_build + worker_roundtrip (kept for backward compat).
          perfRecord("backend_ack", ackNow - submitStart);
          if (submitEnd !== null) {
            // frame_build: synchronous TS pipeline (view/commit/layout/render/build).
            perfRecord("frame_build", submitEnd - submitStart);
            // worker_roundtrip: async transport from requestFrame to backend ack.
            perfRecord("worker_roundtrip", ackNow - submitEnd);
          }
        }
        scheduler.enqueue({ kind: "frameDone" });
      },
      (err: unknown) => scheduler.enqueue({ kind: "frameError", error: err }),
    );

    if (acceptedAck !== null) {
      void p.then(
        () => {},
        (err: unknown) =>
          scheduler.enqueue({
            kind: "fatal",
            code: "ZRUI_BACKEND_ERROR",
            detail: `requestFrame completion rejected after accepted ack: ${describeThrown(err)}`,
          }),
      );
    }
  }

  function emitInternalRenderMetrics(
    renderTime: number,
    runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot | null = null,
  ): boolean {
    if (baseInternalOnRender === undefined && inspectorInternalOnRender === undefined) return true;
    try {
      const clampedRenderTime = Math.max(0, renderTime);
      if (runtimeBreadcrumbs) {
        const payload: InternalRenderMetricsWithBreadcrumbs = {
          renderTime: clampedRenderTime,
          runtimeBreadcrumbs,
        };
        baseInternalOnRender?.(payload);
        inspectorInternalOnRender?.(payload);
      } else {
        const payload: AppRenderMetrics = { renderTime: clampedRenderTime };
        baseInternalOnRender?.(payload);
        inspectorInternalOnRender?.(payload);
      }
      return true;
    } catch (e: unknown) {
      fatalNowOrEnqueue("ZRUI_USER_CODE_THROW", `onRender callback threw: ${describeThrown(e)}`);
      return false;
    }
  }

  function emitInternalLayoutSnapshot(
    runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot | null = null,
  ): boolean {
    if (baseInternalOnLayout === undefined && inspectorInternalOnLayout === undefined) return true;
    try {
      const idRects = widgetRenderer.getRectByIdIndex();
      if (runtimeBreadcrumbs) {
        const payload: InternalLayoutSnapshotWithBreadcrumbs = {
          idRects,
          runtimeBreadcrumbs,
        };
        baseInternalOnLayout?.(payload);
        inspectorInternalOnLayout?.(payload);
      } else {
        const payload: AppLayoutSnapshot = { idRects };
        baseInternalOnLayout?.(payload);
        inspectorInternalOnLayout?.(payload);
      }
      return true;
    } catch (e: unknown) {
      fatalNowOrEnqueue("ZRUI_USER_CODE_THROW", `onLayout callback threw: ${describeThrown(e)}`);
      return false;
    }
  }

  function tryRenderOnce(): void {
    if (sm.state !== "Running") return;
    // During stop(), we may still receive a few late event batches, but we must not
    // submit new frames (backend may be tearing down).
    if (lifecycleBusy === "stop") return;
    if (dirtyFlags === 0) return;
    const maxInFlight = config.maxFramesInFlight + (interactiveBudget > 0 ? 1 : 0);
    if (framesInFlight >= maxInFlight) return;
    if (mode === null) return;

    // Record schedule_wait: time from render request to render start
    if (PERF_ENABLED && scheduleWaitStartMs !== null) {
      perfMarkEnd("schedule_wait", scheduleWaitStartMs);
      scheduleWaitStartMs = null;
    }

    const dirtyVersionStart = snapshotDirtyVersions();

    const snapshot = committedState as Readonly<S>;
    const hooks = {
      enterRender: () => {
        inRender = true;
      },
      exitRender: () => {
        inRender = false;
      },
    };

    if (mode === "raw") {
      const df = drawFn;
      if (!df) return;

      const renderStart = perfNow();
      const submitToken = perfMarkStart("submit_frame");
      const res = rawRenderer.submitFrame(df, hooks);
      perfMarkEnd("submit_frame", submitToken);
      if (!res.ok) {
        fatalNowOrEnqueue(res.code, res.detail);
        return;
      }
      if (!emitInternalRenderMetrics(perfNow() - renderStart)) return;

      submitFrameStartMs = PERF_ENABLED ? submitToken : null;
      const buildEndMs = PERF_ENABLED ? perfNow() : null;
      framesInFlight++;
      if (interactiveBudget > 0) interactiveBudget--;
      scheduleFrameSettlement(res.inFlight, submitFrameStartMs, buildEndMs);
      clearConsumedDirtyFlags(DIRTY_RENDER | DIRTY_LAYOUT | DIRTY_VIEW, dirtyVersionStart);
      return;
    }

    const vf = viewFn;
    if (!vf) return;

    if (!viewport) return;

    if ((dirtyFlags & (DIRTY_VIEW | DIRTY_LAYOUT | DIRTY_RENDER)) === 0) return;

    // Compute render plan from dirty flags. Render-only turns (e.g., focus change)
    // skip view/commit/layout. Layout-only turns (e.g., resize without state change)
    // skip view/commit. Commit turns now rely on WidgetRenderer layout signatures
    // to decide whether relayout is required, instead of forcing layout by default.
    // First-frame/bootstrap safety is handled inside submitFrame(): it falls back
    // to full pipeline when committedRoot or layoutTree is null.
    const pendingDirtyFlags = dirtyFlags;
    const frameNowMs = monotonicNowMs();
    const plan: WidgetRenderPlan = {
      commit: (pendingDirtyFlags & DIRTY_VIEW) !== 0,
      layout: (pendingDirtyFlags & DIRTY_LAYOUT) !== 0,
      // Commit turns must always run layout-stability checks when layout is not
      // already explicitly dirty; otherwise interactive state updates can render a
      // newly-committed tree against stale layout nodes until the next resize.
      checkLayoutStability:
        (pendingDirtyFlags & DIRTY_LAYOUT) === 0 && (pendingDirtyFlags & DIRTY_VIEW) !== 0,
      nowMs: frameNowMs,
    };

    const resilientView: ViewFn<S> = (state) => {
      if (topLevelViewError !== null) {
        return buildTopLevelViewErrorScreen(topLevelViewError);
      }
      try {
        return vf(state);
      } catch (e: unknown) {
        topLevelViewError = captureTopLevelViewError(e);
        return buildTopLevelViewErrorScreen(topLevelViewError);
      }
    };

    const renderStart = perfNow();
    const submitToken = perfMarkStart("submit_frame");
    const frameView: ViewFn<S> = debugLayoutEnabled
      ? (state) => {
          const root = resilientView(state);
          const overlay = buildLayoutDebugOverlay(widgetRenderer.getRectByIdIndex());
          if (!overlay) return root;
          return ui.layers([root, overlay]);
        }
      : resilientView;
    const res = widgetRenderer.submitFrame(frameView, snapshot, viewport, theme, hooks, plan);
    perfMarkEnd("submit_frame", submitToken);
    if (!res.ok) {
      fatalNowOrEnqueue(res.code, res.detail);
      return;
    }
    if (!emitFocusChangeIfNeeded()) return;
    const renderTime = perfNow() - renderStart;
    const runtimeBreadcrumbs = buildRuntimeBreadcrumbSnapshot(Math.max(0, renderTime));
    if (!emitInternalRenderMetrics(renderTime, runtimeBreadcrumbs)) return;
    if (!emitInternalLayoutSnapshot(runtimeBreadcrumbs)) return;

    submitFrameStartMs = PERF_ENABLED ? submitToken : null;
    const buildEndMs = PERF_ENABLED ? perfNow() : null;
    framesInFlight++;
    if (interactiveBudget > 0) interactiveBudget--;
    scheduleFrameSettlement(res.inFlight, submitFrameStartMs, buildEndMs);
    let consumedDirtyFlags = DIRTY_RENDER;
    if (plan.layout) consumedDirtyFlags |= DIRTY_LAYOUT;
    if (plan.commit) consumedDirtyFlags |= DIRTY_VIEW;
    clearConsumedDirtyFlags(consumedDirtyFlags, dirtyVersionStart);
  }

  function drainIgnored(items: readonly WorkItem[]): void {
    for (const it of items) {
      if (it.kind === "eventBatch") {
        try {
          it.batch.release();
        } catch {
          // ignore
        }
      }
    }
  }

  function processTurn(items: readonly WorkItem[]): void {
    const st = sm.state;
    if (st === "Disposed" || st === "Faulted") {
      drainIgnored(items);
      return;
    }

    let sawKick = false;
    for (const item of items) {
      if (sm.state === "Faulted" || sm.state === "Disposed") {
        drainIgnored(items);
        return;
      }

      switch (item.kind) {
        case "fatal": {
          doFatal(item.code, item.detail);
          drainIgnored(items);
          return;
        }
        case "eventBatch": {
          if (sm.state !== "Running") {
            try {
              item.batch.release();
            } catch {
              // ignore
            }
            break;
          }
          processEventBatch(item.batch);
          if (sm.state !== "Running") {
            drainIgnored(items);
            return;
          }
          commitUpdates();
          break;
        }
        case "userCommit": {
          userCommitScheduled = false;
          if (sm.state === "Running") commitUpdates();
          break;
        }
        case "kick": {
          sawKick = true;
          break;
        }
        case "renderRequest": {
          break;
        }
        case "frameDone": {
          framesInFlight = Math.max(0, framesInFlight - 1);
          break;
        }
        case "frameError": {
          framesInFlight = Math.max(0, framesInFlight - 1);
          // If we are intentionally stopping, treat requestFrame rejections as
          // part of shutdown (not a fatal backend error).
          if (lifecycleBusy === "stop") break;
          doFatal("ZRUI_BACKEND_ERROR", `requestFrame rejected: ${describeThrown(item.error)}`);
          break;
        }
      }
    }

    if (sm.state !== "Running") return;
    if (sawKick) commitUpdates();
    tryRenderOnce();
  }

  async function pollLoop(token: number): Promise<void> {
    while (sm.state === "Running" && token === pollToken) {
      let batch: BackendEventBatch;
      try {
        batch = await backend.pollEvents();
      } catch (e: unknown) {
        if (sm.state === "Running" && token === pollToken) {
          enqueueFatal("ZRUI_BACKEND_ERROR", `pollEvents rejected: ${describeThrown(e)}`);
        }
        return;
      }

      if (token !== pollToken || sm.state !== "Running") {
        try {
          batch.release();
        } catch {
          // ignore
        }
        return;
      }

      scheduler.enqueue({ kind: "eventBatch", batch });
    }
  }

  const app: App<S> = {
    view(fn: ViewFn<S>): void {
      assertOperational("view");
      sm.assertOneOf(["Created", "Stopped"], "view: must be Created or Stopped");
      assertNotReentrant("view");
      if (routes !== undefined) {
        throwCode(
          "ZRUI_MODE_CONFLICT",
          "view: routes are configured in createApp(); screen rendering is managed by router",
        );
      }
      if (mode === "raw") throwCode("ZRUI_MODE_CONFLICT", "view: draw mode already selected");
      mode = "widget";
      viewFn = fn;
    },

    replaceView(fn: ViewFn<S>): void {
      assertOperational("replaceView");
      assertNotReentrant("replaceView");
      if (routes !== undefined) {
        throwCode(
          "ZRUI_MODE_CONFLICT",
          "replaceView: routes are configured in createApp(); screen rendering is managed by router",
        );
      }
      if (mode === "raw") {
        throwCode("ZRUI_MODE_CONFLICT", "replaceView: draw mode already selected");
      }
      if (mode === null) mode = "widget";
      viewFn = fn;
      topLevelViewError = null;
      if (sm.state === "Running") {
        markDirty(DIRTY_VIEW);
      }
    },

    replaceRoutes(nextRoutes: readonly RouteDefinition<S>[]): void {
      assertOperational("replaceRoutes");
      assertNotReentrant("replaceRoutes");
      if (!routerIntegration || routes === undefined) {
        throwCode(
          "ZRUI_MODE_CONFLICT",
          "replaceRoutes: app was created without routes; use replaceView for view-mode apps",
        );
      }
      if (mode === "raw") {
        throwCode("ZRUI_MODE_CONFLICT", "replaceRoutes: draw mode already selected");
      }
      const nextRouteKeybindings = routerIntegration.replaceRoutes(nextRoutes);
      app.keys(nextRouteKeybindings);
      topLevelViewError = null;
      if (sm.state === "Running") {
        markDirty(DIRTY_VIEW);
      }
    },

    draw(fn: DrawFn): void {
      assertOperational("draw");
      sm.assertOneOf(["Created", "Stopped"], "draw: must be Created or Stopped");
      assertNotReentrant("draw");
      if (mode === "widget") throwCode("ZRUI_MODE_CONFLICT", "draw: view mode already selected");
      mode = "raw";
      drawFn = fn;
    },

    onEvent(handler: EventHandler): () => void {
      assertOperational("onEvent");
      if (inCommit || inRender) throwCode("ZRUI_REENTRANT_CALL", "onEvent: re-entrant call");

      const active = { value: true };
      handlers.push({ fn: handler, active });
      return () => {
        active.value = false;
      };
    },

    onFocusChange(handler: FocusChangeHandler): () => void {
      assertOperational("onFocusChange");
      if (inCommit || inRender) {
        throwCode("ZRUI_REENTRANT_CALL", "onFocusChange: re-entrant call");
      }

      const active = { value: true };
      focusHandlers.push({ fn: handler, active });
      return () => {
        active.value = false;
      };
    },

    update(updater: StateUpdater<S>): void {
      assertOperational("update");
      if (inCommit) throwCode("ZRUI_REENTRANT_CALL", "update: called during commit");
      if (inRender) throwCode("ZRUI_UPDATE_DURING_RENDER", "update: called during render");

      updates.enqueue(updater);
      if (sm.state === "Running" && inEventHandlerDepth === 0 && !userCommitScheduled) {
        userCommitScheduled = true;
        scheduler.enqueue({ kind: "userCommit" });
      }
    },

    setTheme(next: Theme | ThemeDefinition): void {
      assertOperational("setTheme");
      if (inCommit) throwCode("ZRUI_REENTRANT_CALL", "setTheme: called during commit");
      if (inRender) throwCode("ZRUI_UPDATE_DURING_RENDER", "setTheme: called during render");
      const nextTheme = coerceToLegacyTheme(next);
      if (nextTheme === theme) return;
      theme = nextTheme;
      requestRenderFromRenderer();
    },

    debugLayout(enabled?: boolean): boolean {
      assertOperational("debugLayout");
      if (mode === "raw") {
        throwCode("ZRUI_MODE_CONFLICT", "debugLayout: not available in draw mode");
      }
      const next = enabled === undefined ? !debugLayoutEnabled : enabled === true;
      if (next === debugLayoutEnabled) return debugLayoutEnabled;
      debugLayoutEnabled = next;
      requestViewFromRenderer();
      return debugLayoutEnabled;
    },

    start(): Promise<void> {
      assertOperational("start");
      assertNotReentrant("start");
      if (lifecycleBusy)
        throwCode("ZRUI_INVALID_STATE", "start: lifecycle operation already in flight");
      sm.assertOneOf(["Created", "Stopped"], "start: must be Created or Stopped");
      if (mode === null) throwCode("ZRUI_NO_RENDER_MODE", "start: no render mode selected");

      lifecycleBusy = "start";
      let p: Promise<void>;
      try {
        p = backend.start();
      } catch (e: unknown) {
        lifecycleBusy = null;
        throwCode("ZRUI_BACKEND_ERROR", `backend.start threw: ${describeThrown(e)}`);
      }

      return p.then(
        async () => {
          lifecycleBusy = null;
          topLevelViewError = null;
          terminalProfile = await loadTerminalProfile(backend);
          widgetRenderer.setTerminalProfile(terminalProfile);
          sm.toRunning();
          markDirty(DIRTY_VIEW, false);
          pollToken++;
          void pollLoop(pollToken);
          scheduler.enqueue({ kind: "kick" });
        },
        (e: unknown) => {
          lifecycleBusy = null;
          throw new ZrUiError("ZRUI_BACKEND_ERROR", `backend.start rejected: ${describeThrown(e)}`);
        },
      );
    },

    run(): Promise<void> {
      assertOperational("run");
      assertNotReentrant("run");
      if (lifecycleBusy)
        throwCode("ZRUI_INVALID_STATE", "run: lifecycle operation already in flight");
      sm.assertOneOf(["Created", "Stopped"], "run: must be Created or Stopped");
      if (mode === null) throwCode("ZRUI_NO_RENDER_MODE", "run: no render mode selected");

      const proc = readProcessLike();
      const addSignalHandler =
        proc !== null && typeof proc.on === "function" ? proc.on.bind(proc) : null;
      const canRegisterSignals = addSignalHandler !== null;
      const signals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
      const handlers: Array<Readonly<{ signal: string; handler: (...args: unknown[]) => void }>> =
        [];

      let runSettled = false;
      let resolveRun!: () => void;
      const runPromise = new Promise<void>((resolve) => {
        resolveRun = resolve;
      });

      const cleanupSignalHandlers = (): void => {
        if (!proc) return;
        for (const entry of handlers) {
          removeSignalHandler(proc, entry.signal, entry.handler);
        }
        handlers.length = 0;
      };

      const settleRun = (): void => {
        if (runSettled) return;
        runSettled = true;
        cleanupSignalHandlers();
        if (settleActiveRun === settleRun) settleActiveRun = null;
        resolveRun();
      };

      const onSignal = (): void => {
        if (runSettled) return;
        runSettled = true;
        cleanupSignalHandlers();
        if (settleActiveRun === settleRun) settleActiveRun = null;
        void (async () => {
          try {
            if (sm.state === "Running") await app.stop();
          } catch {
            // ignore
          }
          try {
            app.dispose();
          } catch {
            // ignore
          }
          try {
            proc?.exit?.(0);
          } catch {
            // ignore
          }
          resolveRun();
        })();
      };

      if (canRegisterSignals) {
        for (const signal of signals) {
          const handler = () => onSignal();
          handlers.push(Object.freeze({ signal, handler }));
          addSignalHandler(signal, handler);
        }
      }
      settleActiveRun = settleRun;

      return app.start().then(
        () => {
          if (!canRegisterSignals) {
            settleRun();
          }
          return runPromise;
        },
        (e: unknown) => {
          cleanupSignalHandlers();
          if (settleActiveRun === settleRun) settleActiveRun = null;
          throw e;
        },
      );
    },

    stop(): Promise<void> {
      assertOperational("stop");
      assertNotReentrant("stop");
      if (lifecycleBusy)
        throwCode("ZRUI_INVALID_STATE", "stop: lifecycle operation already in flight");
      sm.assertOneOf(["Running"], "stop: must be Running");

      lifecycleBusy = "stop";
      // Stop polling immediately so in-flight pollEvents rejections from backend.stop()
      // are treated as part of shutdown (not a fatal backend error).
      pollToken++;
      // Clear any in-flight frames so a shutdown doesn't strand the app in a state
      // where a future start() cannot submit frames.
      framesInFlight = 0;
      let p: Promise<void>;
      try {
        p = backend.stop();
      } catch (e: unknown) {
        lifecycleBusy = null;
        throwCode("ZRUI_BACKEND_ERROR", `backend.stop threw: ${describeThrown(e)}`);
      }

      return p.then(
        () => {
          lifecycleBusy = null;
          sm.toStopped();
          settleActiveRun?.();
        },
        (e: unknown) => {
          lifecycleBusy = null;
          throw new ZrUiError("ZRUI_BACKEND_ERROR", `backend.stop rejected: ${describeThrown(e)}`);
        },
      );
    },

    dispose(): void {
      if (inCommit || inRender || inEventHandlerDepth > 0) {
        throwCode("ZRUI_REENTRANT_CALL", "dispose: re-entrant call");
      }
      const st0 = sm.state;
      if (st0 === "Disposed") return;

      pollToken++;
      try {
        sm.dispose();
      } catch {
        // ignore
      }

      if (st0 === "Running") {
        try {
          void backend.stop().catch(() => undefined);
        } catch {
          // ignore
        }
      }
      try {
        backend.dispose();
      } catch {
        // ignore
      }
      settleActiveRun?.();
    },

    /* --- Keybinding API --- */

    keys(bindings: BindingMap<KeyContext<S>>): void {
      assertOperational("keys");
      keybindingState = registerBindings(keybindingState, bindings).state;
      keybindingsEnabled = computeKeybindingsEnabled(keybindingState);
    },

    modes(modes: ModeBindingMap<KeyContext<S>>): void {
      assertOperational("modes");
      keybindingState = registerModes(keybindingState, modes).state;
      keybindingsEnabled = computeKeybindingsEnabled(keybindingState);
    },

    setMode(modeName: string): void {
      assertOperational("setMode");
      keybindingState = setMode(keybindingState, modeName);
    },

    getMode(): string {
      return getMode(keybindingState);
    },

    getBindings(mode?: string) {
      return getBindings(keybindingState, mode);
    },

    get pendingChord(): string | null {
      return getPendingChord(keybindingState);
    },

    getTerminalProfile(): TerminalProfile {
      return terminalProfile;
    },

    ...(routerIntegration ? { router: routerIntegration.router } : {}),
  };

  routeStateUpdater = app.update;
  if (routerIntegration) {
    const routeKeybindings = routerIntegration.routeKeybindings;
    if (Object.keys(routeKeybindings).length > 0) {
      app.keys(routeKeybindings);
    }
  }

  Object.defineProperty(app, APP_INTERNAL_REQUEST_VIEW_LAYOUT_MARKER, {
    value: () => {
      if (sm.state !== "Running") return;
      markDirty(DIRTY_VIEW | DIRTY_LAYOUT);
    },
    enumerable: false,
    configurable: false,
    writable: false,
  });

  Object.defineProperty(app, APP_INTERNAL_SET_RUNTIME_BREADCRUMB_HOOKS_MARKER, {
    value: (hooks: InternalRuntimeBreadcrumbHooks | null | undefined) => {
      inspectorInternalOnRender =
        typeof hooks?.onRender === "function" ? hooks.onRender : undefined;
      inspectorInternalOnLayout =
        typeof hooks?.onLayout === "function" ? hooks.onLayout : undefined;
      recomputeRuntimeBreadcrumbCollection();
    },
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return app;
}
