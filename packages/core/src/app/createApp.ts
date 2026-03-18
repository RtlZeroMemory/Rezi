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
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  type RuntimeBackend,
} from "../backend.js";
import { describeThrown } from "../debug/describeThrown.js";
import type { UiEvent } from "../events.js";
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
  setMode,
} from "../keybindings/index.js";
import type { Rect } from "../layout/types.js";
import { PERF_ENABLED, perfMarkStart } from "../perf/perf.js";
import type { EventTimeUnwrapState } from "../protocol/types.js";
import { type RouterIntegration, createRouterIntegration } from "../router/integration.js";
import type { RouteDefinition } from "../router/types.js";
import { DEFAULT_TERMINAL_PROFILE, type TerminalProfile } from "../terminalProfile.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import { compileTheme } from "../theme/theme.js";
import type { ThemeDefinition } from "../theme/tokens.js";
import {
  type InternalRuntimeBreadcrumbHooks,
  createRuntimeBreadcrumbHelpers,
} from "./createApp/breadcrumbs.js";
import {
  type ResolvedAppConfig,
  loadTerminalProfile,
  readBackendDrawlistVersionMarker,
  readBackendPositiveIntMarker,
  requirePositiveInt,
  resolveAppConfig as resolveAppConfigImpl,
} from "./createApp/config.js";
import {
  DIRTY_LAYOUT,
  DIRTY_RENDER,
  DIRTY_VIEW,
  createDirtyTracker,
} from "./createApp/dirtyPlan.js";
import { type WorkItem, createEventLoop } from "./createApp/eventLoop.js";
import { createFocusDispatcher } from "./createApp/focusDispatcher.js";
import { createAppGuards } from "./createApp/guards.js";
import { computeKeybindingsEnabled, createAppKeybindingHelpers } from "./createApp/keybindings.js";
import { type ThemeTransitionState, createRenderLoop } from "./createApp/renderLoop.js";
import { createRunSignalController, readProcessLike } from "./createApp/runSignals.js";
import type { TopLevelViewError } from "./createApp/topLevelViewError.js";
import { RawRenderer } from "./rawRenderer.js";
import type {
  RuntimeBreadcrumbAction,
  RuntimeBreadcrumbConsumptionPath,
  RuntimeBreadcrumbEventKind,
} from "./runtimeBreadcrumbs.js";
import { AppStateMachine } from "./stateMachine.js";
import { TurnScheduler } from "./turnScheduler.js";
import type { App, AppConfig, DrawFn, EventHandler, FocusChangeHandler, ViewFn } from "./types.js";
import { type StateUpdater, UpdateQueue } from "./updateQueue.js";
import { WidgetRenderer } from "./widgetRenderer.js";

export const APP_INTERNAL_REQUEST_VIEW_LAYOUT_MARKER = "__reziRequestViewLayout";
export const APP_INTERNAL_SET_RUNTIME_BREADCRUMB_HOOKS_MARKER = "__reziSetRuntimeBreadcrumbHooks";

type Mode = "raw" | "widget";
type HandlerSlot = Readonly<{ fn: EventHandler; active: { value: boolean } }>;

type CreateAppBaseOptions = Readonly<{
  backend: RuntimeBackend;
  config?: AppConfig;
  theme?: ThemeDefinition;
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

function invalidProps(detail: string): never {
  throw new ZrUiError("ZRUI_INVALID_PROPS", detail);
}

export function resolveAppConfig(config: AppConfig | undefined): ResolvedAppConfig {
  return resolveAppConfigImpl(config);
}

export function createApp(opts: CreateAppRoutesOnlyOptions): App<Record<string, never>>;
export function createApp<S>(opts: CreateAppStateOptions<S>): App<S>;
export function createApp<S>(opts: CreateAppStateOptions<S> | CreateAppRoutesOnlyOptions): App<S> {
  const backend = opts.backend;
  const config = resolveAppConfig(opts.config);

  const backendDrawlistVersion = readBackendDrawlistVersionMarker(backend);
  if (backendDrawlistVersion !== null && backendDrawlistVersion !== 1) {
    invalidProps(
      `backend drawlistVersion=${String(
        backendDrawlistVersion,
      )} is invalid. Fix: set backend drawlist version marker to 1.`,
    );
  }

  const backendMaxEventBytes = readBackendPositiveIntMarker(
    backend,
    BACKEND_MAX_EVENT_BYTES_MARKER,
  );
  if (backendMaxEventBytes !== null && backendMaxEventBytes !== config.maxEventBytes) {
    invalidProps(
      `config.maxEventBytes=${String(config.maxEventBytes)} must match backend maxEventBytes=${String(
        backendMaxEventBytes,
      )}. Fix: align maxEventBytes between app config and backend, or prefer createNodeApp({ config }) for Node/Bun apps to keep them aligned automatically.`,
    );
  }

  const backendFpsCap = readBackendPositiveIntMarker(backend, BACKEND_FPS_CAP_MARKER);
  if (backendFpsCap !== null && backendFpsCap !== config.fpsCap) {
    invalidProps(
      `config.fpsCap=${String(config.fpsCap)} must match backend fpsCap=${String(
        backendFpsCap,
      )}. Fix: align fpsCap between app config and backend, or prefer createNodeApp({ config }) for Node/Bun apps to keep them aligned automatically.`,
    );
  }

  let theme = compileTheme(opts.theme ?? defaultTheme.definition);
  let themeTransition: ThemeTransitionState | null = null;
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
  const dirtyTracker = createDirtyTracker();
  const spinnerTickMinIntervalMs = Math.max(1, Math.floor(1000 / Math.min(config.fpsCap, 8)));

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
  let backendStarted = false;
  let lifecycleGeneration = 0;
  let pollToken = 0;
  let settleActiveRun: (() => void) | null = null;
  let renderRequestQueuedForCurrentTurn = false;

  let userCommitScheduled = false;
  let scheduleWaitStartMs: number | null = null;

  const baseInternalOnRender = config.internal_onRender;
  const baseInternalOnLayout = config.internal_onLayout;
  let inspectorInternalOnRender: InternalRuntimeBreadcrumbHooks["onRender"];
  let inspectorInternalOnLayout: InternalRuntimeBreadcrumbHooks["onLayout"];
  let runtimeBreadcrumbsEnabled =
    baseInternalOnRender !== undefined || baseInternalOnLayout !== undefined;

  let keybindingState: KeybindingManagerState<KeyContext<S>> = createManagerState();
  let keybindingsEnabled = false;

  let breadcrumbLastEventKind: RuntimeBreadcrumbEventKind | null = null;
  let breadcrumbLastConsumptionPath: RuntimeBreadcrumbConsumptionPath | null = null;
  let breadcrumbLastAction: RuntimeBreadcrumbAction | null = null;
  let breadcrumbEventTracked = false;
  let deferredInlineFatal: Readonly<{ code: ZrUiErrorCode; detail: string }> | null = null;

  let processTurnImpl: (items: readonly WorkItem[]) => void = () => undefined;
  let tryRenderOnceImpl: () => void = () => undefined;
  const scheduler = new TurnScheduler<WorkItem>((items) => processTurnImpl(items));
  const enqueueWorkItem = (item: WorkItem): void => {
    scheduler.enqueue(item);
  };

  function markDirty(flags: number, schedule = true): void {
    const { wasDirty, flags: nextFlags } = dirtyTracker.markDirty(flags);
    if (PERF_ENABLED && !wasDirty && nextFlags !== 0 && scheduleWaitStartMs === null) {
      scheduleWaitStartMs = perfMarkStart("schedule_wait");
    }
    if (!schedule) return;
    if (sm.state !== "Running") return;
    if (scheduler.isExecuting) {
      if (!renderRequestQueuedForCurrentTurn) {
        renderRequestQueuedForCurrentTurn = true;
        enqueueWorkItem({ kind: "renderRequest" });
      }
      return;
    }
    if (scheduler.isScheduled) return;
    enqueueWorkItem({ kind: "renderRequest" });
  }

  function requestRenderFromRenderer(): void {
    markDirty(DIRTY_RENDER);
  }

  function requestViewFromRenderer(): void {
    markDirty(DIRTY_VIEW);
  }

  const guards = createAppGuards({
    getEventHandlerDepth: () => inEventHandlerDepth,
    getLifecycleBusy: () => lifecycleBusy,
    getRuntimeState: () => sm.state,
    isInCommit: () => inCommit,
    isInRender: () => inRender,
  });

  function enqueueFatal(code: ZrUiErrorCode, detail: string): void {
    enqueueWorkItem({ kind: "fatal", code, detail });
  }

  function doFatal(code: ZrUiErrorCode, detail: string): void {
    if (sm.state !== "Running") return;
    lifecycleBusy = null;
    lifecycleGeneration++;
    backendStarted = false;

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

    try {
      sm.toFaulted();
    } catch {
      // ignore
    }

    pollToken++;

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

  function flushDeferredInlineFatal(): void {
    if (deferredInlineFatal === null || inEventHandlerDepth !== 0) return;
    const fatal = deferredInlineFatal;
    deferredInlineFatal = null;
    doFatal(fatal.code, fatal.detail);
  }

  function fatalNowOrEnqueue(code: ZrUiErrorCode, detail: string): void {
    const canFailFastInline = scheduler.isExecuting && !inRender && !inCommit;
    if (canFailFastInline && inEventHandlerDepth > 0) {
      if (deferredInlineFatal === null) {
        deferredInlineFatal = Object.freeze({ code, detail });
      }
      return;
    }
    if (canFailFastInline) {
      doFatal(code, detail);
      return;
    }
    enqueueFatal(code, detail);
  }

  function cleanupStartedBackendAfterAbort(): void {
    if (!backendStarted) return;
    backendStarted = false;
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
        });
    } catch {
      try {
        backend.dispose();
      } catch {
        // ignore
      }
    }
  }

  const rawRenderer = new RawRenderer({
    backend,
    maxDrawlistBytes: config.maxDrawlistBytes,
    ...(opts.config?.drawlistValidateParams === undefined
      ? {}
      : { drawlistValidateParams: opts.config.drawlistValidateParams }),
    drawlistReuseOutputBuffer: config.drawlistReuseOutputBuffer,
    drawlistEncodedStringCacheCap: config.drawlistEncodedStringCacheCap,
  });
  const widgetRenderer = new WidgetRenderer<S>({
    backend,
    maxDrawlistBytes: config.maxDrawlistBytes,
    rootPadding: config.rootPadding,
    breakpointThresholds: config.breakpointThresholds,
    terminalProfile,
    ...(opts.config?.drawlistValidateParams === undefined
      ? {}
      : { drawlistValidateParams: opts.config.drawlistValidateParams }),
    drawlistReuseOutputBuffer: config.drawlistReuseOutputBuffer,
    drawlistEncodedStringCacheCap: config.drawlistEncodedStringCacheCap,
    requestRender: requestRenderFromRenderer,
    requestView: requestViewFromRenderer,
    onUserCodeError: (detail) => fatalNowOrEnqueue("ZRUI_USER_CODE_THROW", detail),
    collectRuntimeBreadcrumbs: runtimeBreadcrumbsEnabled,
  });
  const focusDispatcher = createFocusDispatcher({
    getFocusedId: () => widgetRenderer.getFocusedId(),
    getFocusInfo: () => widgetRenderer.getCurrentFocusInfo(),
    initialFocusedId: widgetRenderer.getFocusedId(),
    onHandlerError: (error: unknown) => {
      fatalNowOrEnqueue(
        "ZRUI_USER_CODE_THROW",
        `onFocusChange handler threw: ${describeThrown(error)}`,
      );
    },
  });

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

  const applyKeybindingState = (nextState: KeybindingManagerState<KeyContext<S>>): void => {
    keybindingState = nextState;
    keybindingsEnabled = computeKeybindingsEnabled(keybindingState);
  };
  const keybindingHelpers = createAppKeybindingHelpers<S>({
    getState: () => keybindingState,
    markDirty: (flags) => markDirty(flags),
    setState: applyKeybindingState,
    throwCode: guards.throwCode,
  });

  const runtimeBreadcrumbHelpers = createRuntimeBreadcrumbHelpers({
    getBaseInternalOnLayout: () => baseInternalOnLayout,
    getBaseInternalOnRender: () => baseInternalOnRender,
    getInspectorInternalOnLayout: () => inspectorInternalOnLayout,
    getInspectorInternalOnRender: () => inspectorInternalOnRender,
    getLastAction: () => breadcrumbLastAction,
    getLastConsumptionPath: () => breadcrumbLastConsumptionPath,
    getLastEventKind: () => breadcrumbLastEventKind,
    getWidgetRuntimeBreadcrumbSnapshot: () => widgetRenderer.getRuntimeBreadcrumbSnapshot(),
    isEnabled: () => runtimeBreadcrumbsEnabled,
    isEventTracked: () => breadcrumbEventTracked,
    setEnabled: (enabled) => {
      runtimeBreadcrumbsEnabled = enabled;
    },
    setEventTracked: (tracked) => {
      breadcrumbEventTracked = tracked;
    },
    setInspectorInternalOnLayout: (callback) => {
      inspectorInternalOnLayout = callback;
    },
    setInspectorInternalOnRender: (callback) => {
      inspectorInternalOnRender = callback;
    },
    setLastAction: (action) => {
      breadcrumbLastAction = action;
    },
    setLastConsumptionPath: (path) => {
      breadcrumbLastConsumptionPath = path;
    },
    setLastEventKind: (kind) => {
      breadcrumbLastEventKind = kind;
    },
    setWidgetRuntimeBreadcrumbCaptureEnabled: (enabled) => {
      widgetRenderer.setRuntimeBreadcrumbCaptureEnabled(enabled);
    },
  });

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

  function stopFromUnhandledQuitEvent(): void {
    let stopPromise: Promise<void>;
    try {
      stopPromise = app.stop();
    } catch (error: unknown) {
      if (lifecycleBusy === "stop") return;
      fatalNowOrEnqueue(
        "ZRUI_BACKEND_ERROR",
        `stop threw after unhandled quit input: ${describeThrown(error)}`,
      );
      return;
    }
    void stopPromise.catch((error: unknown) => {
      fatalNowOrEnqueue(
        "ZRUI_BACKEND_ERROR",
        `stop rejected after unhandled quit input: ${describeThrown(error)}`,
      );
    });
  }

  if (routes !== undefined) {
    routerIntegration = createRouterIntegration<S>({
      routes,
      initialRoute: opts.initialRoute as string,
      ...(opts.routeHistoryMaxDepth === undefined
        ? {}
        : { maxHistoryDepth: opts.routeHistoryMaxDepth }),
      getState: () => committedState,
      requestRouteRender: () => markDirty(DIRTY_VIEW | DIRTY_LAYOUT),
      captureFocusSnapshot: () => widgetRenderer.captureFocusSnapshot(),
      restoreFocusSnapshot: (snapshot) => widgetRenderer.restoreFocusSnapshot(snapshot),
      assertCanMutate: guards.assertRouterMutationAllowed,
    });
  }

  function emit(ev: UiEvent): boolean {
    const snapshot: EventHandler[] = [];
    for (const slot of handlers) {
      if (slot.active.value) snapshot.push(slot.fn);
    }

    inEventHandlerDepth++;
    try {
      for (const fn of snapshot) {
        try {
          fn(ev);
        } catch (error: unknown) {
          fatalNowOrEnqueue(
            "ZRUI_USER_CODE_THROW",
            `onEvent handler threw: ${describeThrown(error)}`,
          );
          return false;
        }
      }
    } finally {
      inEventHandlerDepth--;
      flushDeferredInlineFatal();
    }
    return true;
  }

  function emitFocusChangeIfNeeded(): boolean {
    return focusDispatcher.emitIfChanged();
  }

  const renderLoop = createRenderLoop<S>({
    buildRuntimeBreadcrumbSnapshot: runtimeBreadcrumbHelpers.buildRuntimeBreadcrumbSnapshot,
    config,
    dirtyTracker,
    emitFocusChangeIfNeeded,
    enqueueWorkItem,
    fatalNowOrEnqueue,
    getBaseInternalOnLayout: () => baseInternalOnLayout,
    getBaseInternalOnRender: () => baseInternalOnRender,
    getCommittedState: () => committedState,
    getDebugLayoutEnabled: () => debugLayoutEnabled,
    getDrawFn: () => drawFn,
    getFramesInFlight: () => framesInFlight,
    getInspectorInternalOnLayout: () => inspectorInternalOnLayout,
    getInspectorInternalOnRender: () => inspectorInternalOnRender,
    getInteractiveBudget: () => interactiveBudget,
    getLifecycleBusy: () => lifecycleBusy,
    getMode: () => mode,
    getRenderRequestQueuedForCurrentTurn: () => renderRequestQueuedForCurrentTurn,
    getScheduleWaitStartMs: () => scheduleWaitStartMs,
    getTheme: () => theme,
    getThemeTransition: () => themeTransition,
    getTopLevelViewError: () => topLevelViewError,
    getViewFn: () => viewFn,
    getViewport: () => viewport,
    isRunning: () => sm.state === "Running",
    markDirty,
    rawRenderer,
    setFramesInFlight: (next) => {
      framesInFlight = next;
    },
    setInRender: (next) => {
      inRender = next;
    },
    setInteractiveBudget: (next) => {
      interactiveBudget = next;
    },
    setRenderRequestQueuedForCurrentTurn: (next) => {
      renderRequestQueuedForCurrentTurn = next;
    },
    setScheduleWaitStartMs: (next) => {
      scheduleWaitStartMs = next;
    },
    setTheme: (next) => {
      theme = next;
    },
    setThemeTransition: (next) => {
      themeTransition = next;
    },
    setTopLevelViewError: (next) => {
      topLevelViewError = next;
    },
    widgetRenderer,
  });
  tryRenderOnceImpl = renderLoop.tryRenderOnce;

  const eventLoop = createEventLoop<S>({
    backend,
    config,
    doFatal,
    emit,
    emitFocusChangeIfNeeded,
    enqueueWorkItem,
    fatalNowOrEnqueue,
    getAppUpdate: () => app.update,
    getCommittedState: () => committedState,
    getFramesInFlight: () => framesInFlight,
    getInteractiveBudget: () => interactiveBudget,
    getKeybindingState: () => keybindingState,
    getKeybindingsEnabled: () => keybindingsEnabled,
    getLastObservedSpinnerTickEventMs: () => lastObservedSpinnerTickEventMs,
    getLastSpinnerRenderPerfMs: () => lastSpinnerRenderPerfMs,
    getLastSpinnerRenderTickMs: () => lastSpinnerRenderTickMs,
    getLifecycleBusy: () => lifecycleBusy,
    getMode: () => mode,
    getPollToken: () => pollToken,
    getRenderRequestQueuedForCurrentTurn: () => renderRequestQueuedForCurrentTurn,
    getRuntimeState: () => sm.state,
    getTopLevelViewError: () => topLevelViewError,
    getViewport: () => viewport,
    keybindingHelpers,
    markDirty,
    noteBreadcrumbAction: runtimeBreadcrumbHelpers.noteBreadcrumbAction,
    noteBreadcrumbConsumptionPath: runtimeBreadcrumbHelpers.noteBreadcrumbConsumptionPath,
    noteBreadcrumbEvent: runtimeBreadcrumbHelpers.noteBreadcrumbEvent,
    quitFromTopLevelViewError,
    retryTopLevelViewError,
    setCommittedState: (next) => {
      committedState = next;
    },
    setFramesInFlight: (next) => {
      framesInFlight = next;
    },
    setInCommit: (next) => {
      inCommit = next;
    },
    setInteractiveBudget: (next) => {
      interactiveBudget = next;
    },
    setKeybindingState: applyKeybindingState,
    setLastObservedSpinnerTickEventMs: (next) => {
      lastObservedSpinnerTickEventMs = next;
    },
    setLastSpinnerRenderPerfMs: (next) => {
      lastSpinnerRenderPerfMs = next;
    },
    setLastSpinnerRenderTickMs: (next) => {
      lastSpinnerRenderTickMs = next;
    },
    setRenderRequestQueuedForCurrentTurn: (next) => {
      renderRequestQueuedForCurrentTurn = next;
    },
    setUserCommitScheduled: (next) => {
      userCommitScheduled = next;
    },
    setViewport: (next) => {
      viewport = next;
    },
    spinnerTickMinIntervalMs,
    stopFromUnhandledQuitEvent,
    timeUnwrap,
    tryRenderOnce: () => tryRenderOnceImpl(),
    updates,
    widgetRenderer,
  });
  processTurnImpl = eventLoop.processTurn;

  const app: App<S> = {
    view(fn: ViewFn<S>): void {
      guards.assertOperational("view");
      guards.assertLifecycleIdle("view");
      sm.assertOneOf(["Created", "Stopped"], "view: must be Created or Stopped");
      guards.assertNotReentrant("view");
      if (routes !== undefined) {
        guards.throwCode(
          "ZRUI_MODE_CONFLICT",
          "view: routes are configured in createApp(); screen rendering is managed by router",
        );
      }
      if (mode === "raw")
        guards.throwCode("ZRUI_MODE_CONFLICT", "view: draw mode already selected");
      mode = "widget";
      viewFn = fn;
    },

    replaceView(fn: ViewFn<S>): void {
      guards.assertOperational("replaceView");
      guards.assertLifecycleIdle("replaceView");
      guards.assertNotReentrant("replaceView");
      if (routes !== undefined) {
        guards.throwCode(
          "ZRUI_MODE_CONFLICT",
          "replaceView: routes are configured in createApp(); screen rendering is managed by router",
        );
      }
      if (mode === "raw") {
        guards.throwCode("ZRUI_MODE_CONFLICT", "replaceView: draw mode already selected");
      }
      if (mode === null) mode = "widget";
      viewFn = fn;
      topLevelViewError = null;
      if (sm.state === "Running") {
        widgetRenderer.forceFullRenderNextFrame();
        markDirty(DIRTY_VIEW);
      }
    },

    replaceRoutes(nextRoutes: readonly RouteDefinition<S>[]): void {
      guards.assertOperational("replaceRoutes");
      guards.assertLifecycleIdle("replaceRoutes");
      guards.assertNotReentrant("replaceRoutes");
      const activeRouterIntegration = routerIntegration;
      if (activeRouterIntegration === null || routes === undefined) {
        throw new ZrUiError(
          "ZRUI_MODE_CONFLICT",
          "replaceRoutes: app was created without routes; use replaceView for view-mode apps",
        );
      }
      if (mode === "raw") {
        guards.throwCode("ZRUI_MODE_CONFLICT", "replaceRoutes: draw mode already selected");
      }
      const nextRouteKeybindings = activeRouterIntegration.replaceRoutes(nextRoutes);
      keybindingHelpers.replaceRouteBindings(nextRouteKeybindings);
      topLevelViewError = null;
      if (sm.state === "Running") {
        widgetRenderer.forceFullRenderNextFrame();
        markDirty(DIRTY_VIEW);
      }
    },

    draw(fn: DrawFn): void {
      guards.assertOperational("draw");
      guards.assertLifecycleIdle("draw");
      sm.assertOneOf(["Created", "Stopped"], "draw: must be Created or Stopped");
      guards.assertNotReentrant("draw");
      if (mode === "widget")
        guards.throwCode("ZRUI_MODE_CONFLICT", "draw: view mode already selected");
      mode = "raw";
      drawFn = fn;
    },

    onEvent(handler: EventHandler): () => void {
      guards.assertOperational("onEvent");
      if (inCommit || inRender) guards.throwCode("ZRUI_REENTRANT_CALL", "onEvent: re-entrant call");

      const active = { value: true };
      handlers.push({ fn: handler, active });
      return () => {
        active.value = false;
      };
    },

    onFocusChange(handler: FocusChangeHandler): () => void {
      guards.assertOperational("onFocusChange");
      if (inCommit || inRender) {
        guards.throwCode("ZRUI_REENTRANT_CALL", "onFocusChange: re-entrant call");
      }
      return focusDispatcher.register(handler);
    },

    update(updater: StateUpdater<S>): void {
      guards.assertOperational("update");
      guards.assertLifecycleIdle("update");
      if (inCommit) guards.throwCode("ZRUI_REENTRANT_CALL", "update: called during commit");
      if (inRender) {
        guards.throwCode("ZRUI_UPDATE_DURING_RENDER", guards.updateDuringRenderDetail("update"));
      }

      updates.enqueue(updater);
      if (sm.state === "Running" && inEventHandlerDepth === 0 && !userCommitScheduled) {
        userCommitScheduled = true;
        enqueueWorkItem({ kind: "userCommit" });
      }
    },

    setTheme(next: ThemeDefinition): void {
      guards.assertOperational("setTheme");
      guards.assertLifecycleIdle("setTheme");
      if (inCommit) guards.throwCode("ZRUI_REENTRANT_CALL", "setTheme: called during commit");
      if (inRender) {
        guards.throwCode("ZRUI_UPDATE_DURING_RENDER", guards.updateDuringRenderDetail("setTheme"));
      }
      const nextTheme = compileTheme(next);
      if (nextTheme === themeTransition?.to) return;
      if (nextTheme === theme) {
        themeTransition = null;
        return;
      }
      renderLoop.beginThemeTransition(nextTheme);
      requestViewFromRenderer();
    },

    debugLayout(enabled?: boolean): boolean {
      guards.assertOperational("debugLayout");
      guards.assertLifecycleIdle("debugLayout");
      if (mode === "raw") {
        guards.throwCode("ZRUI_MODE_CONFLICT", "debugLayout: not available in draw mode");
      }
      const next = enabled === undefined ? !debugLayoutEnabled : enabled === true;
      if (next === debugLayoutEnabled) return debugLayoutEnabled;
      debugLayoutEnabled = next;
      requestViewFromRenderer();
      return debugLayoutEnabled;
    },

    start(): Promise<void> {
      guards.assertOperational("start");
      guards.assertNotReentrant("start");
      sm.assertOneOf(["Created", "Stopped"], "start: must be Created or Stopped");
      if (mode === null) guards.throwCode("ZRUI_NO_RENDER_MODE", "start: no render mode selected");

      lifecycleBusy = "start";
      const startGeneration = ++lifecycleGeneration;
      let promise: Promise<void> | null = null;
      try {
        promise = backend.start();
      } catch (error: unknown) {
        if (lifecycleGeneration === startGeneration) lifecycleBusy = null;
        guards.throwCode("ZRUI_BACKEND_ERROR", `backend.start threw: ${describeThrown(error)}`);
      }
      if (promise === null) throw new Error("start: backend.start did not return a promise");

      return promise.then(
        async () => {
          try {
            backendStarted = true;
            if (lifecycleGeneration !== startGeneration) {
              cleanupStartedBackendAfterAbort();
              return;
            }
            topLevelViewError = null;
            const loadedTerminalProfile = await loadTerminalProfile(backend);
            if (lifecycleGeneration !== startGeneration) {
              cleanupStartedBackendAfterAbort();
              return;
            }
            terminalProfile = loadedTerminalProfile;
            widgetRenderer.setTerminalProfile(terminalProfile);
            sm.toRunning();
            markDirty(DIRTY_VIEW, false);
            pollToken++;
            void eventLoop.pollLoop(pollToken);
            enqueueWorkItem({ kind: "kick" });
          } finally {
            if (lifecycleGeneration === startGeneration && lifecycleBusy === "start") {
              lifecycleBusy = null;
            }
          }
        },
        (error: unknown) => {
          if (lifecycleGeneration !== startGeneration) return;
          lifecycleBusy = null;
          throw new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `backend.start rejected: ${describeThrown(error)}`,
          );
        },
      );
    },

    run(): Promise<void> {
      guards.assertOperational("run");
      guards.assertNotReentrant("run");
      sm.assertOneOf(["Created", "Stopped"], "run: must be Created or Stopped");
      if (mode === null) guards.throwCode("ZRUI_NO_RENDER_MODE", "run: no render mode selected");

      const proc = readProcessLike();
      let runSettle: (() => void) | null = null;
      const runController = createRunSignalController({
        onDetached: () => {
          if (runSettle !== null && settleActiveRun === runSettle) {
            settleActiveRun = null;
          }
        },
        onSignal: async () => {
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
        },
        processLike: proc,
      });
      runSettle = runController.settle;
      settleActiveRun = runController.settle;

      let startPromise: Promise<void>;
      try {
        startPromise = app.start();
      } catch (error: unknown) {
        runController.detach();
        throw error;
      }

      return startPromise.then(
        () => {
          if (!runController.canRegisterSignals) {
            runController.settle();
          }
          return runController.promise;
        },
        (error: unknown) => {
          runController.detach();
          throw error;
        },
      );
    },

    stop(): Promise<void> {
      guards.assertOperational("stop");
      guards.assertNotReentrant("stop");
      sm.assertOneOf(["Running"], "stop: must be Running");

      lifecycleBusy = "stop";
      const stopGeneration = ++lifecycleGeneration;
      pollToken++;
      framesInFlight = 0;
      let promise: Promise<void> | null = null;
      try {
        promise = backend.stop();
      } catch (error: unknown) {
        if (lifecycleGeneration === stopGeneration) lifecycleBusy = null;
        guards.throwCode("ZRUI_BACKEND_ERROR", `backend.stop threw: ${describeThrown(error)}`);
      }
      if (promise === null) throw new Error("stop: backend.stop did not return a promise");

      return promise.then(
        () => {
          try {
            if (lifecycleGeneration !== stopGeneration) return;
            backendStarted = false;
            themeTransition = null;
            sm.toStopped();
            settleActiveRun?.();
          } finally {
            if (lifecycleGeneration === stopGeneration && lifecycleBusy === "stop") {
              lifecycleBusy = null;
            }
          }
        },
        (error: unknown) => {
          if (lifecycleGeneration !== stopGeneration) return;
          lifecycleBusy = null;
          throw new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `backend.stop rejected: ${describeThrown(error)}`,
          );
        },
      );
    },

    dispose(): void {
      if (inCommit || inRender || inEventHandlerDepth > 0) {
        guards.throwCode("ZRUI_REENTRANT_CALL", "dispose: re-entrant call");
      }
      const st0 = sm.state;
      if (st0 === "Disposed") return;

      lifecycleGeneration++;
      lifecycleBusy = null;
      pollToken++;
      themeTransition = null;
      try {
        sm.dispose();
      } catch {
        // ignore
      }

      if (st0 === "Running" || backendStarted) {
        try {
          void backend.stop().catch(() => undefined);
        } catch {
          // ignore
        }
      }
      backendStarted = false;
      try {
        backend.dispose();
      } catch {
        // ignore
      }
      settleActiveRun?.();
    },

    keys(bindings: BindingMap<KeyContext<S>>): void {
      guards.assertKeybindingMutationAllowed("keys");
      guards.assertLifecycleIdle("keys");
      keybindingHelpers.registerAppBindings(bindings);
    },

    modes(modes: ModeBindingMap<KeyContext<S>>): void {
      guards.assertKeybindingMutationAllowed("modes");
      guards.assertLifecycleIdle("modes");
      keybindingHelpers.registerAppModes(modes);
    },

    setMode(modeName: string): void {
      guards.assertKeybindingMutationAllowed("setMode");
      guards.assertLifecycleIdle("setMode");
      applyKeybindingState(setMode(keybindingState, modeName));
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

    measureElement(id: string): Rect | null {
      if (mode !== "widget") return null;
      return widgetRenderer.getRectByIdIndex().get(id) ?? null;
    },

    ...(routerIntegration ? { router: routerIntegration.router } : {}),
  };

  routeStateUpdater = app.update;
  if (routerIntegration) {
    keybindingHelpers.replaceRouteBindings(routerIntegration.routeKeybindings);
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
      runtimeBreadcrumbHelpers.setInspectorHooks(hooks);
    },
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return app;
}
