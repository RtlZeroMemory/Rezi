/**
 * packages/core/src/repro/replay.ts - Deterministic headless repro replay.
 *
 * Why: Replays captured event batches without a real terminal/PTY, using the
 * existing widget routing pipeline to capture routed actions deterministically.
 */

import { ZREV_MAGIC, ZR_EVENT_BATCH_VERSION_V1 } from "../abi.js";
import { createApp } from "../app/createApp.js";
import {
  type Viewport,
  type WidgetRenderPlan,
  WidgetRenderer,
  type WidgetRendererHooks,
} from "../app/widgetRenderer.js";
import {
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  type BackendEventBatch,
  type RuntimeBackend,
} from "../backend.js";
import type { ZrevEvent } from "../events.js";
import type { EventTimeUnwrapState } from "../protocol/types.js";
import { parseEventBatchV1 } from "../protocol/zrev_v1.js";
import type { RoutedAction } from "../runtime/router.js";
import { DEFAULT_TERMINAL_CAPS } from "../terminalCaps.js";
import { defaultTheme } from "../theme/defaultTheme.js";
import type { Theme } from "../theme/theme.js";
import type { VNode } from "../widgets/types.js";
import type { ReproBundle, ReproRecordedEventBatch } from "./types.js";

/** Expected/normalized routed action shape used by replay assertions. */
export type ReproReplayExpectedAction =
  | Readonly<{ id: string; action: "press" }>
  | Readonly<{ id: string; action: "input"; value: string; cursor: number }>;

/** Routed action observed while replaying, annotated with replay location. */
export type ReproReplayObservedAction = Readonly<
  {
    step: number;
    eventIndex: number;
  } & ReproReplayExpectedAction
>;

/** Overrun marker observed while replaying one captured batch. */
export type ReproReplayOverrun = Readonly<{
  step: number;
  engineTruncated: boolean;
  droppedBatches: number;
}>;

/** Fatal replay failure (protocol parse or headless render fatal). */
export type ReproReplayFatal = Readonly<{
  step: number;
  code: string;
  detail: string;
}>;

/** Viewport shape accepted by the headless replay APIs. */
export type ReproReplayViewport = Readonly<{
  cols: number;
  rows: number;
}>;

/** Full replay execution summary (no assertions applied). */
export type ReproReplayRunResult = Readonly<{
  totalSteps: number;
  stepsProcessed: number;
  recordedElapsedMs: number;
  actions: readonly ReproReplayObservedAction[];
  overruns: readonly ReproReplayOverrun[];
  fatal: ReproReplayFatal | null;
}>;

/** Current deterministic state snapshot from the step-based replay driver. */
export type ReproReplayDriverState = Readonly<{
  totalSteps: number;
  nextStep: number;
  done: boolean;
  recordedElapsedMs: number;
  actions: readonly ReproReplayObservedAction[];
  overruns: readonly ReproReplayOverrun[];
  fatal: ReproReplayFatal | null;
}>;

/** Result of executing one deterministic replay step (one captured batch). */
export type ReproReplayDriverStepResult =
  | Readonly<{
      kind: "batch";
      step: number;
      deltaMs: number;
      recordedElapsedMs: number;
      actions: readonly ReproReplayObservedAction[];
      overrun: ReproReplayOverrun | null;
      fatal: ReproReplayFatal | null;
      done: boolean;
    }>
  | Readonly<{
      kind: "done";
      recordedElapsedMs: number;
      done: true;
    }>;

/** Deterministic step driver for headless repro replay. */
export type ReproReplayDriver = Readonly<{
  getState: () => ReproReplayDriverState;
  step: () => ReproReplayDriverStepResult;
  runToEnd: () => ReproReplayRunResult;
}>;

/** Options for creating a deterministic headless replay driver. */
export type ReproReplayDriverOptions = Readonly<{
  bundle: ReproBundle;
  view: () => VNode;
  theme?: Theme;
  initialViewport?: ReproReplayViewport;
}>;

/** Optional replay invariants checked by the assertion harness. */
export type ReproReplayInvariantExpectations = Readonly<{
  noFatal?: boolean;
  noOverrun?: boolean;
}>;

/** Harness options: replay + expected actions + optional invariants. */
export type ReproReplayHarnessOptions = Readonly<
  ReproReplayDriverOptions & {
    expectedActions: readonly ReproReplayExpectedAction[];
    invariants?: ReproReplayInvariantExpectations;
  }
>;

/** Stable mismatch codes emitted by replay assertions. */
export type ReproReplayMismatchCode =
  | "ZR_REPLAY_ACTION_COUNT_MISMATCH"
  | "ZR_REPLAY_ACTION_MISMATCH"
  | "ZR_REPLAY_INVARIANT_FATAL"
  | "ZR_REPLAY_INVARIANT_OVERRUN";

/** Structured mismatch detail with JSON path + expected/actual payloads. */
export type ReproReplayMismatch = Readonly<{
  code: ReproReplayMismatchCode;
  path: string;
  detail: string;
  expected?: unknown;
  actual?: unknown;
}>;

/** PASS/FAIL result for replay harness assertions. */
export type ReproReplayHarnessResult = Readonly<{
  status: "PASS" | "FAIL";
  pass: boolean;
  replay: ReproReplayRunResult;
  mismatches: readonly ReproReplayMismatch[];
}>;

const NO_RENDER_HOOKS: WidgetRendererHooks = Object.freeze({
  enterRender: () => {},
  exitRender: () => {},
});

const RESIZE_ONLY_PLAN: WidgetRenderPlan = Object.freeze({
  commit: false,
  layout: true,
  checkLayoutStability: false,
});

const DEFAULT_VIEWPORT: ReproReplayViewport = Object.freeze({
  cols: 80,
  rows: 24,
});

function createHeadlessBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // Replay driver never calls backend.pollEvents().
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function isRoutableEvent(event: ZrevEvent): boolean {
  return (
    event.kind === "key" ||
    event.kind === "text" ||
    event.kind === "paste" ||
    event.kind === "mouse"
  );
}

function parseHexDigit(ch: number): number {
  if (ch >= 48 && ch <= 57) return ch - 48; // 0-9
  if (ch >= 97 && ch <= 102) return ch - 87; // a-f
  if (ch >= 65 && ch <= 70) return ch - 55; // A-F
  return -1;
}

function bytesFromHex(hex: string): Uint8Array {
  const byteLen = Math.floor(hex.length / 2);
  const out = new Uint8Array(byteLen);
  for (let i = 0; i < byteLen; i++) {
    const lo = parseHexDigit(hex.charCodeAt(i * 2 + 1));
    const hi = parseHexDigit(hex.charCodeAt(i * 2));
    out[i] = (hi << 4) | lo;
  }
  return out;
}

function formatExpectedAction(action: ReproReplayExpectedAction | null): string {
  if (action === null) return "<none>";
  if (action.action === "input") {
    return `${action.id}:input(value=${JSON.stringify(action.value)},cursor=${String(action.cursor)})`;
  }
  return `${action.id}:press`;
}

function toExpectedAction(action: ReproReplayObservedAction): ReproReplayExpectedAction {
  if (action.action === "input") {
    return Object.freeze({
      id: action.id,
      action: "input" as const,
      value: action.value,
      cursor: action.cursor,
    });
  }
  return Object.freeze({ id: action.id, action: "press" as const });
}

function actionEquals(
  expected: ReproReplayExpectedAction | null,
  actual: ReproReplayExpectedAction | null,
): boolean {
  if (expected === null || actual === null) return expected === actual;
  if (expected.id !== actual.id || expected.action !== actual.action) return false;
  if (expected.action === "input" && actual.action === "input") {
    return expected.value === actual.value && expected.cursor === actual.cursor;
  }
  return true;
}

function pickInitialViewportFromBundle(bundle: ReproBundle): ReproReplayViewport | null {
  for (const batch of bundle.eventCapture.batches) {
    for (const resize of batch.resizeEvents) {
      return Object.freeze({
        cols: resize.cols,
        rows: resize.rows,
      });
    }
  }
  return null;
}

type ReplayBatchEnvelope = Readonly<{
  step: number;
  deltaMs: number;
  eventCount: number;
  batch: BackendEventBatch;
}>;

type ReplayBackendRuntimeState = Readonly<{
  currentStep: { value: number };
  currentEventIndex: { value: number };
  releasedRealBatches: { value: number };
  processedElapsedMs: { value: number };
}>;

function flushMicrotasks(count: number): Promise<void> {
  let p = Promise.resolve();
  for (let i = 0; i < count; i++) {
    p = p.then(() => new Promise<void>((resolve) => queueMicrotask(resolve)));
  }
  return p;
}

function bytesToHexLower(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function encodeResizeBatch(cols: number, rows: number): Uint8Array {
  const out = new Uint8Array(56);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, 56, true);
  dv.setUint32(12, 1, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  dv.setUint32(24, 5, true);
  dv.setUint32(28, 32, true);
  dv.setUint32(32, 0, true);
  dv.setUint32(36, 0, true);
  dv.setUint32(40, cols >>> 0, true);
  dv.setUint32(44, rows >>> 0, true);
  dv.setUint32(48, 0, true);
  dv.setUint32(52, 0, true);
  return out;
}

function createReplayEnvelope(
  step: number,
  deltaMs: number,
  bytes: Uint8Array,
  droppedBatches: number,
  eventCount: number,
  state: ReplayBackendRuntimeState,
): ReplayBatchEnvelope {
  let released = false;
  return {
    step,
    deltaMs,
    eventCount,
    batch: {
      bytes,
      droppedBatches,
      release: () => {
        if (released) return;
        released = true;
        if (step >= 0) {
          state.releasedRealBatches.value += 1;
        }
      },
    },
  };
}

function createReplayStubBackend(bundle: ReproBundle): Readonly<{
  backend: RuntimeBackend;
  totalRealBatches: number;
  state: ReplayBackendRuntimeState;
}> {
  const runtimeState: ReplayBackendRuntimeState = {
    currentStep: { value: -1 },
    currentEventIndex: { value: -1 },
    releasedRealBatches: { value: 0 },
    processedElapsedMs: { value: 0 },
  };

  const queue: ReplayBatchEnvelope[] = bundle.eventCapture.batches.map((batch) =>
    createReplayEnvelope(
      batch.step,
      batch.deltaMs,
      bytesFromHex(batch.bytesHex),
      batch.droppedBatches,
      batch.eventCount,
      runtimeState,
    ),
  );

  if (!bundle.eventCapture.batches.some((batch) => batch.resizeEvents.length > 0)) {
    const bootstrapViewport = pickInitialViewportFromBundle(bundle) ?? DEFAULT_VIEWPORT;
    queue.unshift(
      createReplayEnvelope(
        -1,
        0,
        encodeResizeBatch(bootstrapViewport.cols, bootstrapViewport.rows),
        0,
        1,
        runtimeState,
      ),
    );
  }

  const waiters: Array<{
    resolve: (batch: BackendEventBatch) => void;
    reject: (err: Error) => void;
  }> = [];
  let stopped = false;

  const backend: RuntimeBackend = {
    start: async () => {},
    stop: async () => {
      stopped = true;
      const err = new Error("replay backend stopped");
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.reject(err);
      }
    },
    dispose: () => {
      stopped = true;
      const err = new Error("replay backend disposed");
      while (waiters.length > 0) {
        const waiter = waiters.shift();
        waiter?.reject(err);
      }
    },
    requestFrame: async () => {},
    pollEvents: async () => {
      if (stopped) throw new Error("replay backend stopped");
      const next = queue.shift();
      if (next) {
        runtimeState.currentStep.value = next.step;
        runtimeState.currentEventIndex.value = -1;
        if (next.step >= 0) {
          runtimeState.processedElapsedMs.value += next.deltaMs;
        }
        return next.batch;
      }
      return new Promise<BackendEventBatch>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    postUserEvent: () => {},
    getCaps: async () => bundle.capsSnapshot.terminalCaps ?? DEFAULT_TERMINAL_CAPS,
  };

  Object.defineProperties(backend as unknown as Record<string, unknown>, {
    [BACKEND_MAX_EVENT_BYTES_MARKER]: {
      value: bundle.captureConfig.maxEventBytes,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_FPS_CAP_MARKER]: {
      value: bundle.captureConfig.fpsCap,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  return Object.freeze({
    backend,
    totalRealBatches: bundle.eventCapture.batches.length,
    state: runtimeState,
  });
}

class HeadlessReproReplayDriver implements ReproReplayDriver {
  private readonly bundle: ReproBundle;
  private readonly viewFn: () => VNode;
  private readonly theme: Theme;
  private readonly renderer: WidgetRenderer<void>;
  private readonly timeUnwrap: EventTimeUnwrapState = { epochMs: 0, lastRawMs: null };

  private nextStep = 0;
  private recordedElapsedMs = 0;
  private hasCommittedFrame = false;
  private fatal: ReproReplayFatal | null = null;
  private viewport: Viewport | null = null;

  private readonly actions: ReproReplayObservedAction[] = [];
  private readonly overruns: ReproReplayOverrun[] = [];

  constructor(opts: ReproReplayDriverOptions) {
    this.bundle = opts.bundle;
    this.viewFn = opts.view;
    this.theme = opts.theme ?? defaultTheme;
    this.renderer = new WidgetRenderer<void>({
      backend: createHeadlessBackend(),
      requestRender: () => {},
      requestView: () => {},
    });

    const bootstrapViewport =
      opts.initialViewport ?? pickInitialViewportFromBundle(opts.bundle) ?? DEFAULT_VIEWPORT;
    this.viewport = { cols: bootstrapViewport.cols, rows: bootstrapViewport.rows };
    const bootstrapFatal = this.submitFrameForViewport(this.viewport, -1);
    if (bootstrapFatal) {
      this.fatal = bootstrapFatal;
    } else {
      this.hasCommittedFrame = true;
    }
  }

  getState(): ReproReplayDriverState {
    return Object.freeze({
      totalSteps: this.bundle.eventCapture.batches.length,
      nextStep: this.nextStep,
      done: this.isDone(),
      recordedElapsedMs: this.recordedElapsedMs,
      actions: Object.freeze(this.actions.slice()),
      overruns: Object.freeze(this.overruns.slice()),
      fatal: this.fatal,
    });
  }

  step(): ReproReplayDriverStepResult {
    if (this.isDone()) {
      return Object.freeze({
        kind: "done",
        recordedElapsedMs: this.recordedElapsedMs,
        done: true,
      });
    }

    const batch = this.bundle.eventCapture.batches[this.nextStep];
    if (!batch) {
      return Object.freeze({
        kind: "done",
        recordedElapsedMs: this.recordedElapsedMs,
        done: true,
      });
    }

    const step = this.nextStep;
    this.nextStep++;
    this.recordedElapsedMs += batch.deltaMs;

    if (batch.step !== step) {
      this.fatal = Object.freeze({
        step,
        code: "ZR_REPLAY_STEP_ORDER",
        detail: `batch.step=${String(batch.step)} does not match replay cursor=${String(step)}`,
      });
      return Object.freeze({
        kind: "batch",
        step,
        deltaMs: batch.deltaMs,
        recordedElapsedMs: this.recordedElapsedMs,
        actions: Object.freeze([]),
        overrun: null,
        fatal: this.fatal,
        done: true,
      });
    }

    const processed = this.processBatch(step, batch);
    const done = this.isDone();
    return Object.freeze({
      kind: "batch",
      step,
      deltaMs: batch.deltaMs,
      recordedElapsedMs: this.recordedElapsedMs,
      actions: processed.actions,
      overrun: processed.overrun,
      fatal: processed.fatal,
      done,
    });
  }

  runToEnd(): ReproReplayRunResult {
    while (!this.isDone()) {
      this.step();
    }
    return Object.freeze({
      totalSteps: this.bundle.eventCapture.batches.length,
      stepsProcessed: this.nextStep,
      recordedElapsedMs: this.recordedElapsedMs,
      actions: Object.freeze(this.actions.slice()),
      overruns: Object.freeze(this.overruns.slice()),
      fatal: this.fatal,
    });
  }

  private isDone(): boolean {
    return this.fatal !== null || this.nextStep >= this.bundle.eventCapture.batches.length;
  }

  private processBatch(
    step: number,
    batch: ReproRecordedEventBatch,
  ): Readonly<{
    actions: readonly ReproReplayObservedAction[];
    overrun: ReproReplayOverrun | null;
    fatal: ReproReplayFatal | null;
  }> {
    const bytes = bytesFromHex(batch.bytesHex);
    const parsed = parseEventBatchV1(bytes, {
      maxTotalSize: this.bundle.captureConfig.maxEventBytes,
      timeUnwrap: this.timeUnwrap,
    });

    if (!parsed.ok) {
      this.fatal = Object.freeze({
        step,
        code: "ZRUI_PROTOCOL_ERROR",
        detail: `${parsed.error.code}: ${parsed.error.detail}`,
      });
      return Object.freeze({
        actions: Object.freeze([]),
        overrun: null,
        fatal: this.fatal,
      });
    }

    const engineTruncated = (parsed.value.flags & 1) !== 0;
    const overrun =
      engineTruncated || batch.droppedBatches > 0
        ? Object.freeze({
            step,
            engineTruncated,
            droppedBatches: batch.droppedBatches,
          })
        : null;
    if (overrun) this.overruns.push(overrun);

    const batchActions: ReproReplayObservedAction[] = [];
    let nextViewport: Viewport | null = this.viewport;

    for (let eventIndex = 0; eventIndex < parsed.value.events.length; eventIndex++) {
      const event = parsed.value.events[eventIndex];
      if (!event) continue;

      if (event.kind === "resize") {
        nextViewport = { cols: event.cols, rows: event.rows };
        continue;
      }

      if (!this.hasCommittedFrame || !isRoutableEvent(event)) continue;

      let routed: Readonly<{ action?: RoutedAction; needsRender: boolean }>;
      try {
        routed = this.renderer.routeEngineEvent(event);
      } catch (error: unknown) {
        const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        this.fatal = Object.freeze({
          step,
          code: "ZRUI_USER_CODE_THROW",
          detail: `widget routing threw: ${detail}`,
        });
        return Object.freeze({
          actions: Object.freeze(batchActions.slice()),
          overrun,
          fatal: this.fatal,
        });
      }

      if (!routed.action) continue;
      const observed = this.toObservedAction(step, eventIndex, routed.action);
      this.actions.push(observed);
      batchActions.push(observed);
    }

    if (nextViewport !== null && this.viewportChanged(nextViewport)) {
      this.viewport = nextViewport;
      const viewportFatal = this.submitFrameForViewport(nextViewport, step);
      if (viewportFatal) {
        this.fatal = viewportFatal;
        return Object.freeze({
          actions: Object.freeze(batchActions.slice()),
          overrun,
          fatal: viewportFatal,
        });
      }
      this.hasCommittedFrame = true;
    }

    return Object.freeze({
      actions: Object.freeze(batchActions.slice()),
      overrun,
      fatal: this.fatal,
    });
  }

  private viewportChanged(nextViewport: Viewport): boolean {
    if (!this.viewport) return true;
    return this.viewport.cols !== nextViewport.cols || this.viewport.rows !== nextViewport.rows;
  }

  private submitFrameForViewport(viewport: Viewport, step: number): ReproReplayFatal | null {
    const res = this.hasCommittedFrame
      ? this.renderer.submitFrame(
          () => this.viewFn(),
          undefined,
          viewport,
          this.theme,
          NO_RENDER_HOOKS,
          RESIZE_ONLY_PLAN,
        )
      : this.renderer.submitFrame(
          () => this.viewFn(),
          undefined,
          viewport,
          this.theme,
          NO_RENDER_HOOKS,
        );

    if (res.ok) return null;
    return Object.freeze({
      step,
      code: res.code,
      detail: res.detail,
    });
  }

  private toObservedAction(
    step: number,
    eventIndex: number,
    action: RoutedAction,
  ): ReproReplayObservedAction {
    if (action.action === "input") {
      return Object.freeze({
        step,
        eventIndex,
        id: action.id,
        action: "input" as const,
        value: action.value,
        cursor: action.cursor,
      });
    }
    return Object.freeze({
      step,
      eventIndex,
      id: action.id,
      action: "press" as const,
    });
  }
}

/**
 * Create a deterministic, headless replay driver over captured batch steps.
 */
export function createReproReplayDriver(opts: ReproReplayDriverOptions): ReproReplayDriver {
  return new HeadlessReproReplayDriver(opts);
}

/**
 * Replay a bundle headlessly and assert action sequence + optional invariants.
 *
 * Returns PASS/FAIL with stable mismatch diagnostics and JSON-path anchors.
 */
export async function runReproReplayHarness(
  opts: ReproReplayHarnessOptions,
): Promise<ReproReplayHarnessResult> {
  const replayBackend = createReplayStubBackend(opts.bundle);
  const actions: ReproReplayObservedAction[] = [];
  const overruns: ReproReplayOverrun[] = [];
  let fatal: ReproReplayFatal | null = null;

  const app = createApp({
    backend: replayBackend.backend,
    initialState: Object.freeze({}) as Readonly<Record<string, never>>,
    config: {
      fpsCap: opts.bundle.captureConfig.fpsCap,
      maxEventBytes: opts.bundle.captureConfig.maxEventBytes,
      ...(opts.bundle.captureConfig.maxDrawlistBytes > 0
        ? { maxDrawlistBytes: opts.bundle.captureConfig.maxDrawlistBytes }
        : {}),
    },
    ...(opts.theme !== undefined ? { theme: opts.theme } : {}),
  });
  app.view(() => opts.view());

  app.onEvent((ev) => {
    if (ev.kind === "engine") {
      replayBackend.state.currentEventIndex.value += 1;
      return;
    }

    if (ev.kind === "action") {
      if (ev.action === "input") {
        actions.push(
          Object.freeze({
            step: replayBackend.state.currentStep.value,
            eventIndex: Math.max(0, replayBackend.state.currentEventIndex.value),
            id: ev.id,
            action: "input" as const,
            value: ev.value,
            cursor: ev.cursor,
          }),
        );
        return;
      }
      actions.push(
        Object.freeze({
          step: replayBackend.state.currentStep.value,
          eventIndex: Math.max(0, replayBackend.state.currentEventIndex.value),
          id: ev.id,
          action: "press" as const,
        }),
      );
      return;
    }

    if (ev.kind === "overrun") {
      overruns.push(
        Object.freeze({
          step: replayBackend.state.currentStep.value,
          engineTruncated: ev.engineTruncated,
          droppedBatches: ev.droppedBatches,
        }),
      );
      return;
    }

    fatal = Object.freeze({
      step: replayBackend.state.currentStep.value,
      code: ev.code,
      detail: ev.detail,
    });
  });

  try {
    await app.start();

    let spins = 0;
    while (
      replayBackend.state.releasedRealBatches.value < replayBackend.totalRealBatches &&
      fatal === null &&
      spins < 4000
    ) {
      spins += 1;
      await flushMicrotasks(2);
    }

    if (
      replayBackend.state.releasedRealBatches.value < replayBackend.totalRealBatches &&
      fatal === null
    ) {
      fatal = Object.freeze({
        step: replayBackend.state.currentStep.value,
        code: "ZR_REPLAY_TIMEOUT",
        detail: "replay did not drain all recorded batches",
      });
    }
  } finally {
    try {
      await app.stop();
    } catch {
      // stop can reject when app faulted; disposal still proceeds.
    }
    app.dispose();
  }

  const replay: ReproReplayRunResult = Object.freeze({
    totalSteps: replayBackend.totalRealBatches,
    stepsProcessed: replayBackend.state.releasedRealBatches.value,
    recordedElapsedMs: replayBackend.state.processedElapsedMs.value,
    actions: Object.freeze(actions.slice()),
    overruns: Object.freeze(overruns.slice()),
    fatal,
  });

  const mismatches: ReproReplayMismatch[] = [];
  const expectedActions = opts.expectedActions;
  const actualActions = replay.actions.map(toExpectedAction);

  if (expectedActions.length !== actualActions.length) {
    mismatches.push(
      Object.freeze({
        code: "ZR_REPLAY_ACTION_COUNT_MISMATCH" as const,
        path: "$.actions.length",
        detail: `expected ${String(expectedActions.length)} action(s), got ${String(actualActions.length)}`,
        expected: expectedActions.length,
        actual: actualActions.length,
      }),
    );
  }

  const compareLen = Math.max(expectedActions.length, actualActions.length);
  for (let i = 0; i < compareLen; i++) {
    const expected = expectedActions[i] ?? null;
    const actual = actualActions[i] ?? null;
    if (actionEquals(expected, actual)) continue;
    mismatches.push(
      Object.freeze({
        code: "ZR_REPLAY_ACTION_MISMATCH" as const,
        path: `$.actions[${String(i)}]`,
        detail: `expected ${formatExpectedAction(expected)}; got ${formatExpectedAction(actual)}`,
        expected,
        actual,
      }),
    );
  }

  const invariants = opts.invariants ?? {};
  if (invariants.noFatal === true && replay.fatal !== null) {
    mismatches.push(
      Object.freeze({
        code: "ZR_REPLAY_INVARIANT_FATAL" as const,
        path: "$.invariants.noFatal",
        detail: `replay ended with fatal ${replay.fatal.code}: ${replay.fatal.detail}`,
        expected: true,
        actual: false,
      }),
    );
  }
  if (invariants.noOverrun === true && replay.overruns.length > 0) {
    mismatches.push(
      Object.freeze({
        code: "ZR_REPLAY_INVARIANT_OVERRUN" as const,
        path: "$.invariants.noOverrun",
        detail: `replay observed ${String(replay.overruns.length)} overrun batch(es)`,
        expected: true,
        actual: false,
      }),
    );
  }

  const pass = mismatches.length === 0;
  return Object.freeze({
    status: pass ? ("PASS" as const) : ("FAIL" as const),
    pass,
    replay,
    mismatches: Object.freeze(mismatches),
  });
}
