import { FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, FRAME_TRANSPORT_SAB_V1 } from "../protocol.js";
import { computeTickTiming } from "../tickTiming.js";
import type { EngineWorkerTickState, WorkerFrameTransport } from "./shared.js";

export function stopTickLoop(state: EngineWorkerTickState): void {
  if (state.tickTimer !== null) {
    clearTimeout(state.tickTimer);
    state.tickTimer = null;
  }
  if (state.tickImmediate !== null) {
    clearImmediate(state.tickImmediate);
    state.tickImmediate = null;
  }
  state.sabWakeEpoch++;
  state.sabWakeArmed = false;
}

export function scheduleTickNow(
  state: EngineWorkerTickState,
  running: boolean,
  tick: () => void,
): void {
  if (!running) return;
  if (state.tickImmediate !== null) return;
  if (state.tickTimer !== null) {
    clearTimeout(state.tickTimer);
    state.tickTimer = null;
  }
  state.tickImmediate = setImmediate(() => {
    state.tickImmediate = null;
    tick();
  });
}

export function scheduleTick(
  state: EngineWorkerTickState,
  running: boolean,
  tick: () => void,
  delayMs: number,
): void {
  if (!running) return;
  const d = Math.max(0, delayMs);
  if (d <= 0) {
    scheduleTickNow(state, running, tick);
    return;
  }
  if (state.tickImmediate !== null || state.tickTimer !== null) return;

  state.tickTimer = setTimeout(() => {
    state.tickTimer = null;
    tick();
  }, d);
}

export function armSabFrameWake(
  args: Readonly<{
    state: EngineWorkerTickState;
    running: boolean;
    frameTransport: WorkerFrameTransport;
    lastConsumedSabPublishedSeq: number;
    syncPendingSabFrameFromMailbox: () => void;
    scheduleTickNow: () => void;
  }>,
): void {
  if (!args.running) return;
  if (args.frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) return;
  if (args.state.sabWakeArmed) return;

  const h = args.frameTransport.controlHeader;
  const seq = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD);
  if (seq > args.lastConsumedSabPublishedSeq) {
    args.syncPendingSabFrameFromMailbox();
    args.scheduleTickNow();
    return;
  }

  const epoch = args.state.sabWakeEpoch;
  const timeoutMs = Math.max(1, args.state.tickIntervalMs);
  const waitAsync = (
    Atomics as unknown as {
      waitAsync?: (
        typedArray: Int32Array,
        index: number,
        value: number,
        timeout?: number,
      ) => { async: boolean; value: Promise<unknown> | unknown };
    }
  ).waitAsync;
  if (typeof waitAsync !== "function") return;
  const waiter = waitAsync(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, seq, timeoutMs);
  if (typeof waiter !== "object" || waiter === null) return;

  if (waiter.async !== true) {
    if (!args.running) return;
    if (epoch !== args.state.sabWakeEpoch) return;
    args.syncPendingSabFrameFromMailbox();
    args.scheduleTickNow();
    return;
  }

  args.state.sabWakeArmed = true;
  const waiterPromise = waiter.value as Promise<unknown>;
  void waiterPromise.then(
    () => {
      if (epoch !== args.state.sabWakeEpoch) return;
      args.state.sabWakeArmed = false;
      if (!args.running) return;
      args.syncPendingSabFrameFromMailbox();
      args.scheduleTickNow();
    },
    () => {
      if (epoch !== args.state.sabWakeEpoch) return;
      args.state.sabWakeArmed = false;
    },
  );
}

export function startTickLoop(
  state: EngineWorkerTickState,
  fpsCap: number,
  scheduleTickNowFn: () => void,
  armSabFrameWakeFn: () => void,
): void {
  stopTickLoop(state);
  const timing = computeTickTiming(fpsCap);
  state.tickIntervalMs = timing.tickIntervalMs;
  state.maxIdleDelayMs = timing.maxIdleDelayMs;
  state.idleDelayMs = state.tickIntervalMs;
  scheduleTickNowFn();
  armSabFrameWakeFn();
}
