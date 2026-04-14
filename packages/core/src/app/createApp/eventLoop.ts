import type { ZrUiErrorCode } from "../../abi.js";
import type { BackendEventBatch, RuntimeBackend } from "../../backend.js";
import { describeThrown } from "../../debug/describeThrown.js";
import type { UiEvent } from "../../events.js";
import type { KeyContext, KeybindingManagerState } from "../../keybindings/index.js";
import { resetChordState, routeKeyEvent } from "../../keybindings/index.js";
import { ZR_MOD_CTRL, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { perfMarkEnd, perfMarkStart, perfNow } from "../../perf/perf.js";
import type { EventTimeUnwrapState } from "../../protocol/types.js";
import { parseEventBatchV1 } from "../../protocol/zrev_v1.js";
import type { AppRuntimeState } from "../stateMachine.js";
import type { StateUpdater, UpdateQueue } from "../updateQueue.js";
import type { WidgetRenderer, WidgetRoutingOutcome } from "../widgetRenderer.js";
import type { ResolvedAppConfig } from "./config.js";
import { DIRTY_LAYOUT, DIRTY_RENDER, DIRTY_VIEW } from "./dirtyPlan.js";
import {
  type AppKeybindingHelpers,
  codepointToCtrlKeyCode,
  codepointToImplicitTextMods,
  codepointToKeyCode,
} from "./keybindings.js";
import {
  type TopLevelViewError,
  isTopLevelQuitEvent,
  isTopLevelRetryEvent,
  isUnhandledCtrlCKeyEvent,
  isUnmodifiedTextQuitEvent,
} from "./topLevelViewError.js";

export type WorkItem =
  | Readonly<{ kind: "eventBatch"; batch: BackendEventBatch }>
  | Readonly<{ kind: "userCommit" }>
  | Readonly<{ kind: "kick" }>
  | Readonly<{ kind: "renderRequest" }>
  | Readonly<{ kind: "frameDone" }>
  | Readonly<{ kind: "frameError"; error: unknown }>
  | Readonly<{ kind: "fatal"; code: ZrUiErrorCode; detail: string }>;

type CreateEventLoopOptions<S> = Readonly<{
  backend: RuntimeBackend;
  config: ResolvedAppConfig;
  doFatal: (code: ZrUiErrorCode, detail: string) => void;
  emit: (ev: UiEvent) => boolean;
  emitFocusChangeIfNeeded: () => boolean;
  enqueueWorkItem: (item: WorkItem) => void;
  fatalNowOrEnqueue: (code: ZrUiErrorCode, detail: string) => void;
  getAppUpdate: () => (updater: StateUpdater<S>) => void;
  getCommittedState: () => Readonly<S>;
  getFramesInFlight: () => number;
  getInteractiveBudget: () => number;
  getKeybindingState: () => KeybindingManagerState<KeyContext<S>>;
  getKeybindingsEnabled: () => boolean;
  getLastObservedSpinnerTickEventMs: () => number;
  getLastSpinnerRenderPerfMs: () => number;
  getLastSpinnerRenderTickMs: () => number;
  getLifecycleBusy: () => "start" | "stop" | null;
  getMode: () => "raw" | "widget" | null;
  getPollToken: () => number;
  getRenderRequestQueuedForCurrentTurn: () => boolean;
  getRuntimeState: () => AppRuntimeState;
  getTopLevelViewError: () => TopLevelViewError | null;
  getViewport: () => Readonly<{ cols: number; rows: number }> | null;
  keybindingHelpers: Pick<AppKeybindingHelpers<S>, "applyRoutedKeybindingState">;
  markDirty: (flags: number, schedule?: boolean) => void;
  noteBreadcrumbAction: (action: NonNullable<WidgetRoutingOutcome["action"]>) => void;
  noteBreadcrumbConsumptionPath: (path: "keybindings" | "widgetRouting") => void;
  noteBreadcrumbEvent: (kind: string) => void;
  quitFromTopLevelViewError: () => void;
  retryTopLevelViewError: () => void;
  setCommittedState: (nextState: S) => void;
  setFramesInFlight: (next: number) => void;
  setInCommit: (next: boolean) => void;
  setInteractiveBudget: (next: number) => void;
  setKeybindingState: (nextState: KeybindingManagerState<KeyContext<S>>) => void;
  setLastObservedSpinnerTickEventMs: (next: number) => void;
  setLastSpinnerRenderPerfMs: (next: number) => void;
  setLastSpinnerRenderTickMs: (next: number) => void;
  setRenderRequestQueuedForCurrentTurn: (next: boolean) => void;
  setUserCommitScheduled: (next: boolean) => void;
  setViewport: (next: Readonly<{ cols: number; rows: number }> | null) => void;
  spinnerTickMinIntervalMs: number;
  stopFromUnhandledQuitEvent: () => void;
  timeUnwrap: EventTimeUnwrapState;
  tryRenderOnce: () => void;
  updates: UpdateQueue<S>;
  widgetRenderer: WidgetRenderer<S>;
}>;

export type AppEventLoop = Readonly<{
  commitUpdates: () => void;
  drainIgnored: (items: readonly WorkItem[], releasedBatches: Set<BackendEventBatch>) => void;
  pollLoop: (token: number) => Promise<void>;
  processEventBatch: (batch: BackendEventBatch, releasedBatches: Set<BackendEventBatch>) => void;
  processTurn: (items: readonly WorkItem[]) => void;
}>;

type PendingShiftTextPair = Readonly<{
  codepoint: number;
  keybindingConsumed: boolean;
  timeMs: number;
}> | null;

export function createEventLoop<S>(options: CreateEventLoopOptions<S>): AppEventLoop {
  let pendingShiftTextPair: PendingShiftTextPair = null;
  function commitUpdates(): void {
    const drained = options.updates.drain();
    if (drained.length === 0) return;

    const commitToken = perfMarkStart("commit");
    options.setInCommit(true);
    try {
      let next = options.getCommittedState() as S;
      for (const update of drained) {
        if (typeof update === "function") {
          next = (update as (prev: Readonly<S>) => S)(next);
        } else {
          next = update;
        }
      }
      if (next !== options.getCommittedState()) {
        options.setCommittedState(next);
        options.markDirty(DIRTY_VIEW, false);
      }
    } catch (error: unknown) {
      options.fatalNowOrEnqueue(
        "ZRUI_USER_CODE_THROW",
        `state updater threw: ${describeThrown(error)}`,
      );
    } finally {
      options.setInCommit(false);
      perfMarkEnd("commit", commitToken);
    }
  }

  function releaseOnce(
    batch: BackendEventBatch,
    releasedBatches: Set<BackendEventBatch>,
  ): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      releasedBatches.add(batch);
      try {
        batch.release();
      } catch {
        // ignore
      }
    };
  }

  function processEventBatch(
    batch: BackendEventBatch,
    releasedBatches: Set<BackendEventBatch>,
  ): void {
    const release = releaseOnce(batch, releasedBatches);

    const parseToken = perfMarkStart("event_parse");
    const parsed = parseEventBatchV1(batch.bytes, {
      maxTotalSize: options.config.maxEventBytes,
      timeUnwrap: options.timeUnwrap,
    });
    perfMarkEnd("event_parse", parseToken);
    if (!parsed.ok) {
      release();
      options.fatalNowOrEnqueue(
        "ZRUI_PROTOCOL_ERROR",
        `${parsed.error.code}: ${parsed.error.detail}`,
      );
      return;
    }

    const engineTruncated = (parsed.value.flags & 1) !== 0;
    const droppedBatches = batch.droppedBatches;

    try {
      if (engineTruncated || droppedBatches > 0) {
        if (!options.emit({ kind: "overrun", engineTruncated, droppedBatches })) return;
        if (options.getRuntimeState() !== "Running") return;
      }

      for (const ev of parsed.value.events) {
        const pairedShiftText =
          pendingShiftTextPair !== null &&
          ev.kind === "text" &&
          ev.timeMs === pendingShiftTextPair.timeMs &&
          ev.codepoint === pendingShiftTextPair.codepoint
            ? pendingShiftTextPair
            : null;
        pendingShiftTextPair = null;

        if (ev.kind === "key" || ev.kind === "text" || ev.kind === "paste" || ev.kind === "mouse") {
          options.setInteractiveBudget(2);
        }
        options.noteBreadcrumbEvent(ev.kind);
        if (!options.emit({ kind: "engine", event: ev })) return;
        if (options.getRuntimeState() !== "Running") return;

        if (ev.kind === "resize") {
          const prev = options.getViewport();
          if (prev === null || prev.cols !== ev.cols || prev.rows !== ev.rows) {
            options.setViewport(Object.freeze({ cols: ev.cols, rows: ev.rows }));
            if (options.widgetRenderer.hasViewportAwareComposites()) {
              options.widgetRenderer.invalidateCompositeWidgets();
              options.markDirty(DIRTY_LAYOUT | DIRTY_VIEW);
            } else {
              options.markDirty(DIRTY_LAYOUT);
            }
          }
        }

        if (ev.kind === "tick" && options.getMode() === "widget") {
          if (options.widgetRenderer.hasAnimatedWidgets()) {
            const tickMs = ev.timeMs;
            const perfMs = perfNow();
            const eventClockAdvances = tickMs > options.getLastObservedSpinnerTickEventMs();
            if (eventClockAdvances) {
              options.setLastObservedSpinnerTickEventMs(tickMs);
            }
            const elapsedMs = eventClockAdvances
              ? tickMs - options.getLastSpinnerRenderTickMs()
              : perfMs - options.getLastSpinnerRenderPerfMs();
            if (elapsedMs >= options.spinnerTickMinIntervalMs) {
              options.setLastSpinnerRenderTickMs(tickMs);
              options.setLastSpinnerRenderPerfMs(perfMs);
              options.markDirty(DIRTY_RENDER);
            }
          }
        }

        if (options.getMode() === "widget" && options.getTopLevelViewError() !== null) {
          if (isTopLevelRetryEvent(ev)) {
            options.noteBreadcrumbConsumptionPath("widgetRouting");
            options.retryTopLevelViewError();
            continue;
          }
          if (isTopLevelQuitEvent(ev)) {
            options.noteBreadcrumbConsumptionPath("widgetRouting");
            options.quitFromTopLevelViewError();
            continue;
          }
          if (
            ev.kind === "key" ||
            ev.kind === "text" ||
            ev.kind === "paste" ||
            ev.kind === "mouse"
          ) {
            options.noteBreadcrumbConsumptionPath("widgetRouting");
            continue;
          }
        }

        const isWidgetRoutableEvent =
          ev.kind === "key" || ev.kind === "text" || ev.kind === "paste" || ev.kind === "mouse";
        if (options.getMode() === "widget" && isWidgetRoutableEvent) {
          if (options.getKeybindingsEnabled()) {
            if (
              ev.kind === "mouse" &&
              ev.mouseKind === 3 &&
              options.getKeybindingState().chordState.pendingKeys.length > 0
            ) {
              options.setKeybindingState(
                Object.freeze({
                  ...options.getKeybindingState(),
                  chordState: resetChordState(),
                }),
              );
            }

            if (ev.kind === "key") {
              const shouldPairShiftText =
                ev.action === "down" && ev.mods === ZR_MOD_SHIFT && ev.key >= 65 && ev.key <= 90;
              const bypass = options.widgetRenderer.shouldBypassKeybindings(ev);
              if (!bypass) {
                const keyCtx: KeyContext<S> = Object.freeze({
                  state: options.getCommittedState(),
                  update: options.getAppUpdate(),
                  focusedId: options.widgetRenderer.getFocusedId(),
                });
                const routeInputState = options.getKeybindingState();
                const keyResult = routeKeyEvent(routeInputState, ev, keyCtx);
                options.keybindingHelpers.applyRoutedKeybindingState(
                  routeInputState,
                  keyResult.nextState,
                );
                if (keyResult.handlerError !== undefined) {
                  options.fatalNowOrEnqueue(
                    "ZRUI_USER_CODE_THROW",
                    `keybinding handler threw: ${describeThrown(keyResult.handlerError)}`,
                  );
                  return;
                }
                if (keyResult.consumed) {
                  if (shouldPairShiftText) {
                    pendingShiftTextPair = Object.freeze({
                      codepoint: ev.key,
                      keybindingConsumed: true,
                      timeMs: ev.timeMs,
                    });
                  }
                  options.noteBreadcrumbConsumptionPath("keybindings");
                  continue;
                }
              }
              if (shouldPairShiftText) {
                pendingShiftTextPair = Object.freeze({
                  codepoint: ev.key,
                  keybindingConsumed: false,
                  timeMs: ev.timeMs,
                });
              }
            }

            if (ev.kind === "text") {
              const ctrlKeyCode = codepointToCtrlKeyCode(ev.codepoint);
              const shouldRouteCtrlText = ctrlKeyCode !== null;
              const shouldRoutePrintableText =
                !shouldRouteCtrlText && !options.widgetRenderer.hasActiveOverlay();
              if (pairedShiftText === null && (shouldRouteCtrlText || shouldRoutePrintableText)) {
                const keyCode = shouldRouteCtrlText
                  ? ctrlKeyCode
                  : codepointToKeyCode(ev.codepoint);
                const mods =
                  (shouldRouteCtrlText ? ZR_MOD_CTRL : 0) |
                  codepointToImplicitTextMods(ev.codepoint);
                if (keyCode !== null) {
                  const syntheticKeyEvent = {
                    kind: "key" as const,
                    action: "down" as const,
                    key: keyCode,
                    mods,
                    timeMs: ev.timeMs,
                  };
                  const keyCtx: KeyContext<S> = Object.freeze({
                    state: options.getCommittedState(),
                    update: options.getAppUpdate(),
                    focusedId: options.widgetRenderer.getFocusedId(),
                  });
                  const routeInputState = options.getKeybindingState();
                  const keyResult = routeKeyEvent(routeInputState, syntheticKeyEvent, keyCtx);
                  options.keybindingHelpers.applyRoutedKeybindingState(
                    routeInputState,
                    keyResult.nextState,
                  );
                  if (keyResult.handlerError !== undefined) {
                    options.fatalNowOrEnqueue(
                      "ZRUI_USER_CODE_THROW",
                      `keybinding handler threw: ${describeThrown(keyResult.handlerError)}`,
                    );
                    return;
                  }
                  if (keyResult.consumed) {
                    options.noteBreadcrumbConsumptionPath("keybindings");
                    continue;
                  }
                }
              }
              if (pairedShiftText?.keybindingConsumed === true) {
                options.noteBreadcrumbConsumptionPath("keybindings");
                continue;
              }
            }
          }

          let routed: WidgetRoutingOutcome;
          try {
            options.noteBreadcrumbConsumptionPath("widgetRouting");
            routed = options.widgetRenderer.routeEngineEvent(ev);
          } catch (error: unknown) {
            options.fatalNowOrEnqueue(
              "ZRUI_USER_CODE_THROW",
              `widget routing threw: ${describeThrown(error)}`,
            );
            return;
          }
          if (options.getRuntimeState() !== "Running") return;
          if (!options.emitFocusChangeIfNeeded()) return;
          if (routed.needsRender) options.markDirty(DIRTY_RENDER);
          if (routed.action) {
            options.noteBreadcrumbAction(routed.action);
            if (!options.emit({ kind: "action", ...routed.action })) return;
            if (options.getRuntimeState() !== "Running") return;
          }
          if (
            routed.action === undefined &&
            !routed.needsRender &&
            routed.consumed !== true &&
            (isUnmodifiedTextQuitEvent(ev) || isUnhandledCtrlCKeyEvent(ev))
          ) {
            options.noteBreadcrumbConsumptionPath("widgetRouting");
            options.stopFromUnhandledQuitEvent();
          }
        }
      }
    } finally {
      release();
    }
  }

  function drainIgnored(items: readonly WorkItem[], releasedBatches: Set<BackendEventBatch>): void {
    for (const item of items) {
      if (item.kind === "eventBatch" && !releasedBatches.has(item.batch)) {
        releasedBatches.add(item.batch);
        try {
          item.batch.release();
        } catch {
          // ignore
        }
      }
    }
  }

  function processTurn(items: readonly WorkItem[]): void {
    options.setRenderRequestQueuedForCurrentTurn(false);
    const releasedBatches = new Set<BackendEventBatch>();
    const runtimeState = options.getRuntimeState();
    if (runtimeState === "Disposed" || runtimeState === "Faulted") {
      drainIgnored(items, releasedBatches);
      return;
    }

    let sawKick = false;
    for (const item of items) {
      if (options.getRuntimeState() === "Faulted" || options.getRuntimeState() === "Disposed") {
        drainIgnored(items, releasedBatches);
        return;
      }

      switch (item.kind) {
        case "fatal": {
          options.doFatal(item.code, item.detail);
          drainIgnored(items, releasedBatches);
          return;
        }
        case "eventBatch": {
          if (options.getRuntimeState() !== "Running") {
            releasedBatches.add(item.batch);
            try {
              item.batch.release();
            } catch {
              // ignore
            }
            break;
          }
          processEventBatch(item.batch, releasedBatches);
          if (options.getRuntimeState() !== "Running") {
            drainIgnored(items, releasedBatches);
            return;
          }
          commitUpdates();
          break;
        }
        case "userCommit": {
          options.setUserCommitScheduled(false);
          if (options.getRuntimeState() === "Running") commitUpdates();
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
          options.setFramesInFlight(Math.max(0, options.getFramesInFlight() - 1));
          break;
        }
        case "frameError": {
          options.setFramesInFlight(Math.max(0, options.getFramesInFlight() - 1));
          if (options.getLifecycleBusy() === "stop") break;
          options.doFatal(
            "ZRUI_BACKEND_ERROR",
            `requestFrame rejected: ${describeThrown(item.error)}`,
          );
          break;
        }
      }
    }

    if (options.getRuntimeState() !== "Running") return;
    if (sawKick) commitUpdates();
    options.tryRenderOnce();
  }

  async function pollLoop(token: number): Promise<void> {
    while (options.getRuntimeState() === "Running" && token === options.getPollToken()) {
      let batch: BackendEventBatch;
      try {
        batch = await options.backend.pollEvents();
      } catch (error: unknown) {
        if (options.getRuntimeState() === "Running" && token === options.getPollToken()) {
          options.fatalNowOrEnqueue(
            "ZRUI_BACKEND_ERROR",
            `pollEvents rejected: ${describeThrown(error)}`,
          );
        }
        return;
      }

      if (token !== options.getPollToken() || options.getRuntimeState() !== "Running") {
        try {
          batch.release();
        } catch {
          // ignore
        }
        return;
      }

      options.enqueueWorkItem({ kind: "eventBatch", batch });
    }
  }

  return {
    commitUpdates,
    drainIgnored,
    pollLoop,
    processEventBatch,
    processTurn,
  };
}
