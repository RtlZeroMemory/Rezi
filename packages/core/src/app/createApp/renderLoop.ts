import type { ZrUiErrorCode } from "../../abi.js";
import { FRAME_ACCEPTED_ACK_MARKER } from "../../backend.js";
import { describeThrown } from "../../debug/describeThrown.js";
import type { Rect } from "../../layout/types.js";
import { PERF_ENABLED, perfMarkEnd, perfMarkStart, perfNow, perfRecord } from "../../perf/perf.js";
import { type Theme, blendTheme } from "../../theme/theme.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";
import type { RawRenderer } from "../rawRenderer.js";
import type { RuntimeBreadcrumbSnapshot } from "../runtimeBreadcrumbs.js";
import type { AppLayoutSnapshot, AppRenderMetrics, DrawFn, ViewFn } from "../types.js";
import type { WidgetRenderPlan, WidgetRenderer } from "../widgetRenderer.js";
import { type ResolvedAppConfig, monotonicNowMs } from "./config.js";
import {
  DIRTY_LAYOUT,
  DIRTY_RENDER,
  DIRTY_VIEW,
  type DirtyTracker,
  buildWidgetRenderPlan,
} from "./dirtyPlan.js";
import type { WorkItem } from "./eventLoop.js";
import {
  type TopLevelViewError,
  buildTopLevelViewErrorScreen,
  captureTopLevelViewError,
} from "./topLevelViewError.js";

const SYNC_FRAME_ACK_MARKER = "__reziSyncFrameAck";

type InternalRenderMetricsWithBreadcrumbs = AppRenderMetrics &
  Readonly<{ runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot }>;
type InternalLayoutSnapshotWithBreadcrumbs = AppLayoutSnapshot &
  Readonly<{ runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot }>;

export type ThemeTransitionState = Readonly<{
  from: Theme;
  to: Theme;
  frame: number;
  totalFrames: number;
}>;

type CreateRenderLoopOptions<S> = Readonly<{
  buildRuntimeBreadcrumbSnapshot: (renderTimeMs: number) => RuntimeBreadcrumbSnapshot | null;
  config: ResolvedAppConfig;
  dirtyTracker: DirtyTracker;
  emitFocusChangeIfNeeded: () => boolean;
  enqueueWorkItem: (item: WorkItem) => void;
  fatalNowOrEnqueue: (code: ZrUiErrorCode, detail: string) => void;
  getBaseInternalOnLayout: () => ((snapshot: AppLayoutSnapshot) => void) | undefined;
  getBaseInternalOnRender: () => ((metrics: AppRenderMetrics) => void) | undefined;
  getCommittedState: () => Readonly<S>;
  getDebugLayoutEnabled: () => boolean;
  getDrawFn: () => DrawFn | null;
  getFramesInFlight: () => number;
  getInspectorInternalOnLayout: () => ((snapshot: AppLayoutSnapshot) => void) | undefined;
  getInspectorInternalOnRender: () => ((metrics: AppRenderMetrics) => void) | undefined;
  getInteractiveBudget: () => number;
  getLifecycleBusy: () => "start" | "stop" | null;
  getMode: () => "raw" | "widget" | null;
  getRenderRequestQueuedForCurrentTurn: () => boolean;
  getScheduleWaitStartMs: () => number | null;
  getTheme: () => Theme;
  getThemeTransition: () => ThemeTransitionState | null;
  getTopLevelViewError: () => TopLevelViewError | null;
  getViewFn: () => ViewFn<S> | null;
  getViewport: () => Readonly<{ cols: number; rows: number }> | null;
  isRunning: () => boolean;
  markDirty: (flags: number, schedule?: boolean) => void;
  rawRenderer: RawRenderer;
  setFramesInFlight: (next: number) => void;
  setInRender: (next: boolean) => void;
  setInteractiveBudget: (next: number) => void;
  setRenderRequestQueuedForCurrentTurn: (next: boolean) => void;
  setScheduleWaitStartMs: (next: number | null) => void;
  setTheme: (next: Theme) => void;
  setThemeTransition: (next: ThemeTransitionState | null) => void;
  setTopLevelViewError: (next: TopLevelViewError | null) => void;
  widgetRenderer: WidgetRenderer<S>;
}>;

export type AppRenderLoop = Readonly<{
  beginThemeTransition: (nextTheme: Theme) => void;
  tryRenderOnce: () => void;
}>;

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
    content: ui.column({ width: "full", height: "full", justify: "end", p: 1 }, [
      ui.row({ width: "full", justify: "start" }, [panel]),
    ]),
  });
}

function blendThemeColors(from: Theme, to: Theme, t: number): Theme {
  return blendTheme(from, to, t);
}

export function createRenderLoop<S>(options: CreateRenderLoopOptions<S>): AppRenderLoop {
  function advanceThemeTransitionFrame(): void {
    const active = options.getThemeTransition();
    if (!active) return;
    const nextFrame = active.frame + 1;
    if (nextFrame >= active.totalFrames) {
      options.setTheme(active.to);
      options.setThemeTransition(null);
      return;
    }
    options.setTheme(blendThemeColors(active.from, active.to, nextFrame / active.totalFrames));
    options.setThemeTransition(
      Object.freeze({
        ...active,
        frame: nextFrame,
      }),
    );
  }

  function scheduleThemeTransitionContinuation(): void {
    if (!options.getThemeTransition() || !options.isRunning()) return;
    options.markDirty(DIRTY_VIEW, false);
    options.setRenderRequestQueuedForCurrentTurn(true);
    options.enqueueWorkItem({ kind: "renderRequest" });
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
      options.setFramesInFlight(Math.max(0, options.getFramesInFlight() - 1));
      return;
    }

    const acceptedAck = getAcceptedFrameAck(p);
    const ackPromise = acceptedAck ?? p;

    void ackPromise.then(
      () => {
        if (PERF_ENABLED && submitStart !== null) {
          const ackNow = perfNow();
          perfRecord("backend_ack", ackNow - submitStart);
          if (submitEnd !== null) {
            perfRecord("frame_build", submitEnd - submitStart);
            perfRecord("worker_roundtrip", ackNow - submitEnd);
          }
        }
        options.enqueueWorkItem({ kind: "frameDone" });
      },
      (err: unknown) => options.enqueueWorkItem({ kind: "frameError", error: err }),
    );

    if (acceptedAck !== null) {
      void p.then(
        () => {},
        (err: unknown) =>
          options.enqueueWorkItem({
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
    const baseInternalOnRender = options.getBaseInternalOnRender();
    const inspectorInternalOnRender = options.getInspectorInternalOnRender();
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
    } catch (error: unknown) {
      options.fatalNowOrEnqueue(
        "ZRUI_USER_CODE_THROW",
        `onRender callback threw: ${describeThrown(error)}`,
      );
      return false;
    }
  }

  function emitInternalLayoutSnapshot(
    runtimeBreadcrumbs: RuntimeBreadcrumbSnapshot | null = null,
  ): boolean {
    const baseInternalOnLayout = options.getBaseInternalOnLayout();
    const inspectorInternalOnLayout = options.getInspectorInternalOnLayout();
    if (baseInternalOnLayout === undefined && inspectorInternalOnLayout === undefined) return true;
    try {
      const idRects = options.widgetRenderer.getRectByIdIndex();
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
    } catch (error: unknown) {
      options.fatalNowOrEnqueue(
        "ZRUI_USER_CODE_THROW",
        `onLayout callback threw: ${describeThrown(error)}`,
      );
      return false;
    }
  }

  function beginThemeTransition(nextTheme: Theme): void {
    if (
      options.config.themeTransitionFrames <= 0 ||
      !options.isRunning() ||
      options.getMode() !== "widget"
    ) {
      options.setTheme(nextTheme);
      options.setThemeTransition(null);
      return;
    }

    options.setThemeTransition(
      Object.freeze({
        from: options.getTheme(),
        to: nextTheme,
        frame: 0,
        totalFrames: options.config.themeTransitionFrames,
      }),
    );
  }

  function tryRenderOnce(): void {
    if (!options.isRunning()) return;
    if (options.getLifecycleBusy() === "stop") return;
    if (options.dirtyTracker.getFlags() === 0) return;
    const maxInFlight =
      options.config.maxFramesInFlight + (options.getInteractiveBudget() > 0 ? 1 : 0);
    if (options.getFramesInFlight() >= maxInFlight) return;
    const mode = options.getMode();
    if (mode === null) return;

    if (PERF_ENABLED) {
      const scheduleWaitStartMs = options.getScheduleWaitStartMs();
      if (scheduleWaitStartMs !== null) {
        perfMarkEnd("schedule_wait", scheduleWaitStartMs);
        options.setScheduleWaitStartMs(null);
      }
    }

    const dirtyVersionStart = options.dirtyTracker.snapshotVersions();
    const snapshot = options.getCommittedState();
    const hooks = {
      enterRender: () => {
        options.setInRender(true);
      },
      exitRender: () => {
        options.setInRender(false);
      },
    };

    if (mode === "raw") {
      const drawFn = options.getDrawFn();
      if (!drawFn) return;

      const renderStart = perfNow();
      const submitToken = perfMarkStart("submit_frame");
      const res = options.rawRenderer.submitFrame(drawFn, hooks);
      perfMarkEnd("submit_frame", submitToken);
      if (!res.ok) {
        options.fatalNowOrEnqueue(res.code, res.detail);
        return;
      }
      if (!emitInternalRenderMetrics(perfNow() - renderStart)) return;

      const submitStartMs = PERF_ENABLED ? submitToken : null;
      const buildEndMs = PERF_ENABLED ? perfNow() : null;
      options.setFramesInFlight(options.getFramesInFlight() + 1);
      if (options.getInteractiveBudget() > 0) {
        options.setInteractiveBudget(options.getInteractiveBudget() - 1);
      }
      scheduleFrameSettlement(res.inFlight, submitStartMs, buildEndMs);
      options.dirtyTracker.clearConsumedFlags(
        DIRTY_RENDER | DIRTY_LAYOUT | DIRTY_VIEW,
        dirtyVersionStart,
      );
      return;
    }

    const viewFn = options.getViewFn();
    if (!viewFn) return;

    const viewport = options.getViewport();
    if (!viewport) return;

    const pendingDirtyFlags = options.dirtyTracker.getFlags();
    if ((pendingDirtyFlags & (DIRTY_VIEW | DIRTY_LAYOUT | DIRTY_RENDER)) === 0) return;

    const frameNowMs = monotonicNowMs();
    const plan: WidgetRenderPlan = buildWidgetRenderPlan(pendingDirtyFlags, frameNowMs);
    advanceThemeTransitionFrame();

    const resilientView: ViewFn<S> = (state) => {
      const topLevelViewError = options.getTopLevelViewError();
      if (topLevelViewError !== null) {
        return buildTopLevelViewErrorScreen(topLevelViewError);
      }
      try {
        return viewFn(state);
      } catch (error: unknown) {
        const captured = captureTopLevelViewError(error);
        options.setTopLevelViewError(captured);
        return buildTopLevelViewErrorScreen(captured);
      }
    };

    const renderStart = perfNow();
    const submitToken = perfMarkStart("submit_frame");
    const frameView: ViewFn<S> = options.getDebugLayoutEnabled()
      ? (state) => {
          const root = resilientView(state);
          const overlay = buildLayoutDebugOverlay(options.widgetRenderer.getRectByIdIndex());
          if (!overlay) return root;
          return ui.layers([root, overlay]);
        }
      : resilientView;
    const res = options.widgetRenderer.submitFrame(
      frameView,
      snapshot,
      viewport,
      options.getTheme(),
      hooks,
      plan,
    );
    perfMarkEnd("submit_frame", submitToken);
    if (!res.ok) {
      options.fatalNowOrEnqueue(res.code, res.detail);
      return;
    }
    if (!options.emitFocusChangeIfNeeded()) return;
    const renderTime = perfNow() - renderStart;
    const runtimeBreadcrumbs = options.buildRuntimeBreadcrumbSnapshot(Math.max(0, renderTime));
    if (!emitInternalRenderMetrics(renderTime, runtimeBreadcrumbs)) return;
    if (!emitInternalLayoutSnapshot(runtimeBreadcrumbs)) return;

    const submitStartMs = PERF_ENABLED ? submitToken : null;
    const buildEndMs = PERF_ENABLED ? perfNow() : null;
    options.setFramesInFlight(options.getFramesInFlight() + 1);
    if (options.getInteractiveBudget() > 0) {
      options.setInteractiveBudget(options.getInteractiveBudget() - 1);
    }
    scheduleFrameSettlement(res.inFlight, submitStartMs, buildEndMs);
    let consumedDirtyFlags = DIRTY_RENDER;
    if (plan.layout) consumedDirtyFlags |= DIRTY_LAYOUT;
    if (plan.commit) consumedDirtyFlags |= DIRTY_VIEW;
    options.dirtyTracker.clearConsumedFlags(consumedDirtyFlags, dirtyVersionStart);
    scheduleThemeTransitionContinuation();
    if (options.dirtyTracker.getFlags() !== 0 && !options.getRenderRequestQueuedForCurrentTurn()) {
      options.setRenderRequestQueuedForCurrentTurn(true);
      options.enqueueWorkItem({ kind: "renderRequest" });
    }
  }

  return {
    beginThemeTransition,
    tryRenderOnce,
  };
}
