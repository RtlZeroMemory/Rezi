/**
 * Node worker-thread entrypoint owning the native engine (LOCKED).
 * @see docs/backend/worker-model.md
 * @see docs/backend/node.md
 * @see docs/dev/style-guide.md
 * @see docs/backend/native.md
 */

import { performance } from "node:perf_hooks";
import { parentPort, workerData } from "node:worker_threads";
import { createFrameAuditLogger, drawlistFingerprint } from "../frameAudit.js";
import {
  deleteFrameAudit,
  drainNativeFrameAudit,
  emitFrameAudit,
  maybeEnableNativeFrameAudit,
  setFrameAuditMeta,
} from "./engineWorker/frameAudit.js";
import {
  postFrameAccepted,
  postFrameStatus,
  releasePendingFrame,
  syncPendingSabFrameFromMailbox,
} from "./engineWorker/frameMailbox.js";
import {
  type EngineWorkerMessageContext,
  handleDebugDisableMessage,
  handleDebugEnableMessage,
  handleDebugExportMessage,
  handleDebugGetPayloadMessage,
  handleDebugGetStatsMessage,
  handleDebugQueryMessage,
  handleDebugResetMessage,
  handleEventsAckMessage,
  handleFrameKickMessage,
  handleFrameMessage,
  handleGetCapsMessage,
  handleInitMessage,
  handlePerfSnapshotMessage,
  handlePostUserEventMessage,
  handleSetConfigMessage,
  handleShutdownMessage,
} from "./engineWorker/messageHandlers.js";
import { perfRecord, perfSnapshot } from "./engineWorker/perf.js";
import type {
  EngineWorkerEventState,
  EngineWorkerFrameAuditState,
  EngineWorkerRuntimeState,
  EngineWorkerTickState,
  NativeApi,
  PendingFrame,
  PerfSample,
  WorkerData,
} from "./engineWorker/shared.js";
import { safeDetail } from "./engineWorker/shared.js";
import {
  armSabFrameWake,
  scheduleTick,
  scheduleTickNow,
  startTickLoop,
  stopTickLoop,
} from "./engineWorker/tickLoop.js";
import {
  FRAME_SAB_SLOT_STATE_IN_USE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_TRANSFER_V1,
  MAX_POLL_DRAIN_ITERS,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from "./protocol.js";
import { computeNextIdleDelay } from "./tickTiming.js";

const PERF_ENABLED = (process.env as Readonly<{ REZI_PERF?: string }>).REZI_PERF === "1";
const ZR_ERR_LIMIT = -3;
const IS_BUN_RUNTIME = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
const FORCE_WORKER_EXIT_ON_SHUTDOWN =
  IS_BUN_RUNTIME ||
  (process.env as Readonly<{ REZI_WORKER_FORCE_EXIT?: string }>).REZI_WORKER_FORCE_EXIT === "1";

const perfSamples: PerfSample[] = [];

function postToMain(msg: WorkerToMainMessage, transfer?: readonly ArrayBuffer[]): void {
  if (parentPort === null) return;
  if (transfer !== undefined) {
    parentPort.postMessage(msg, transfer as unknown as Array<ArrayBuffer>);
    return;
  }
  parentPort.postMessage(msg);
}

async function loadNative(): Promise<NativeApi> {
  const wd: WorkerData =
    workerData && typeof workerData === "object" ? (workerData as WorkerData) : Object.freeze({});
  const shim = typeof wd.nativeShimModule === "string" ? wd.nativeShimModule : null;

  const unwrap = (m: unknown): NativeApi => {
    if (typeof m === "object" && m !== null) {
      const rec = m as { native?: unknown; default?: unknown };
      const candidate = (rec.native ?? rec.default ?? rec) as unknown;
      return candidate as NativeApi;
    }
    return m as NativeApi;
  };

  if (shim !== null && shim.length > 0) {
    return unwrap((await import(shim)) as unknown);
  }

  try {
    return unwrap((await import("@rezi-ui/native")) as unknown);
  } catch (err) {
    const detail = safeDetail(err);
    throw new Error(
      `Failed to load @rezi-ui/native.\n\nThis usually means the native addon was not built or not installed for this platform.\n\n${detail}`,
    );
  }
}

const native = await loadNative();

const runtimeState: EngineWorkerRuntimeState = {
  engineId: null,
  engineBootSucceeded: false,
  running: false,
  haveSubmittedDrawlist: false,
  pendingFrame: null,
  lastConsumedSabPublishedSeq: 0,
  frameTransport: Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 }),
};

const frameAudit = createFrameAuditLogger("worker");
const frameAuditState: EngineWorkerFrameAuditState = {
  frameAuditBySeq: new Map(),
  nativeFrameAuditEnabled: false,
  nativeFrameAuditNextRecordId: 1n,
};

const eventState: EngineWorkerEventState = {
  eventPool: [],
  discardBuffer: null,
  droppedSinceLast: 0,
};

const tickState: EngineWorkerTickState = {
  tickTimer: null,
  tickImmediate: null,
  tickIntervalMs: 0,
  idleDelayMs: 0,
  maxIdleDelayMs: 0,
  sabWakeArmed: false,
  sabWakeEpoch: 0,
};

function setFrameAuditMetaNow(frameSeq: number, patch: Readonly<Record<string, unknown>>): void {
  setFrameAuditMeta(
    frameAudit,
    frameAuditState,
    frameSeq,
    patch as Parameters<typeof setFrameAuditMeta>[3],
  );
}

function emitFrameAuditNow(
  stage: string,
  frameSeq: number,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  emitFrameAudit(frameAudit, frameAuditState, stage, frameSeq, fields);
}

function deleteFrameAuditNow(frameSeq: number): void {
  deleteFrameAudit(frameAudit, frameAuditState, frameSeq);
}

function maybeEnableNativeFrameAuditNow(): void {
  maybeEnableNativeFrameAudit({
    frameAudit,
    state: frameAuditState,
    native,
    engineId: runtimeState.engineId,
    safeDetail,
  });
}

function drainNativeFrameAuditNow(reason: string): void {
  drainNativeFrameAudit({
    frameAudit,
    state: frameAuditState,
    native,
    engineId: runtimeState.engineId,
    reason,
    safeDetail,
  });
}

function fatal(where: string, code: number, detail: string): void {
  if (frameAudit.enabled) {
    frameAudit.emit("fatal", { where, code, detail });
  }
  postToMain({ type: "fatal", where, code, detail });
}

function shutdownComplete(): void {
  postToMain({ type: "shutdownComplete" });
}

function releasePendingFrameNow(frame: PendingFrame, expectedSabState: number): void {
  releasePendingFrame(runtimeState.frameTransport, frame, expectedSabState);
}

function postFrameStatusNow(frameSeq: number, completedResult: number): void {
  postFrameStatus(postToMain, emitFrameAuditNow, deleteFrameAuditNow, frameSeq, completedResult);
}

function postFrameAcceptedNow(frameSeq: number): void {
  postFrameAccepted(postToMain, emitFrameAuditNow, frameSeq);
}

function syncPendingSabFrameFromMailboxNow(): void {
  syncPendingSabFrameFromMailbox({
    runtimeState,
    setFrameAuditMeta: setFrameAuditMetaNow,
    emitFrameAudit: emitFrameAuditNow,
    deleteFrameAudit: deleteFrameAuditNow,
    fatal,
  });
}

function scheduleTickNowLocal(): void {
  scheduleTickNow(tickState, runtimeState.running, tick);
}

function scheduleTickLocal(delayMs: number): void {
  scheduleTick(tickState, runtimeState.running, tick, delayMs);
}

function armSabFrameWakeLocal(): void {
  armSabFrameWake({
    state: tickState,
    running: runtimeState.running,
    frameTransport: runtimeState.frameTransport,
    lastConsumedSabPublishedSeq: runtimeState.lastConsumedSabPublishedSeq,
    syncPendingSabFrameFromMailbox: syncPendingSabFrameFromMailboxNow,
    scheduleTickNow: scheduleTickNowLocal,
  });
}

function startTickLoopLocal(fpsCap: number): void {
  startTickLoop(tickState, fpsCap, scheduleTickNowLocal, armSabFrameWakeLocal);
}

function destroyEngineBestEffort(): void {
  const id = runtimeState.engineId;
  runtimeState.engineId = null;
  if (id === null) return;
  try {
    native.engineDestroy(id);
  } catch (err) {
    fatal("engineDestroy", -1, `engine_destroy threw: ${safeDetail(err)}`);
  }
}

function shutdownNow(): void {
  runtimeState.running = false;
  stopTickLoop(tickState);
  if (runtimeState.pendingFrame !== null) {
    emitFrameAuditNow("frame.dropped", runtimeState.pendingFrame.frameSeq, { reason: "shutdown" });
    deleteFrameAuditNow(runtimeState.pendingFrame.frameSeq);
    releasePendingFrameNow(runtimeState.pendingFrame, FRAME_SAB_SLOT_STATE_READY);
    runtimeState.pendingFrame = null;
  }
  if (frameAudit.enabled) {
    for (const [seq] of frameAuditState.frameAuditBySeq.entries()) {
      emitFrameAuditNow("frame.dropped", seq, { reason: "shutdown_pending" });
    }
    frameAuditState.frameAuditBySeq.clear();
  }
  destroyEngineBestEffort();
  shutdownComplete();

  if (parentPort !== null) parentPort.close();
  if (FORCE_WORKER_EXIT_ON_SHUTDOWN && runtimeState.engineBootSucceeded) {
    setImmediate(() => {
      process.exit(0);
    });
  }
}

function tick(): void {
  if (!runtimeState.running) return;
  if (runtimeState.engineId === null) return;

  let didSubmitDrawlistThisTick = false;
  let didFrameWork = false;
  let didEventWork = false;
  let submittedFrameSeq: number | null = null;

  if (runtimeState.pendingFrame !== null) {
    const frame = runtimeState.pendingFrame;
    runtimeState.pendingFrame = null;
    emitFrameAuditNow("frame.submit.begin", frame.frameSeq, {
      transport: frame.transport,
      byteLen: frame.byteLen,
      ...(frame.transport === FRAME_TRANSPORT_SAB_V1
        ? { slotIndex: frame.slotIndex, slotToken: frame.slotToken }
        : {}),
    });
    let res = -1;
    let sabInUse = false;
    let staleSabFrame = false;
    try {
      if (frame.transport === FRAME_TRANSPORT_TRANSFER_V1) {
        const view = new Uint8Array(frame.buf, 0, frame.byteLen);
        if (frameAudit.enabled) {
          const fp = drawlistFingerprint(view);
          setFrameAuditMetaNow(frame.frameSeq, {
            transport: frame.transport,
            byteLen: frame.byteLen,
            hash32: fp.hash32,
            prefixHash32: fp.prefixHash32,
            cmdCount: fp.cmdCount,
            totalSize: fp.totalSize,
          });
          emitFrameAuditNow("frame.submit.payload", frame.frameSeq, fp);
        }
        res = native.engineSubmitDrawlist(runtimeState.engineId, view);
      } else {
        if (runtimeState.frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) {
          throw new Error("SAB frame transport unavailable");
        }
        if (frame.slotIndex < 0 || frame.slotIndex >= runtimeState.frameTransport.slotCount) {
          throw new Error(`invalid SAB frame slot index: ${String(frame.slotIndex)}`);
        }
        const token = Atomics.load(runtimeState.frameTransport.tokens, frame.slotIndex);
        if (token !== frame.slotToken) {
          staleSabFrame = true;
        } else {
          const prev = Atomics.compareExchange(
            runtimeState.frameTransport.states,
            frame.slotIndex,
            FRAME_SAB_SLOT_STATE_READY,
            FRAME_SAB_SLOT_STATE_IN_USE,
          );
          if (prev !== FRAME_SAB_SLOT_STATE_READY) {
            const tokenAfter = Atomics.load(runtimeState.frameTransport.tokens, frame.slotIndex);
            if (tokenAfter !== frame.slotToken) {
              staleSabFrame = true;
            } else {
              throw new Error(
                `SAB frame slot ${String(frame.slotIndex)} not ready (state=${String(prev)})`,
              );
            }
          } else {
            sabInUse = true;
            const offset = frame.slotIndex * runtimeState.frameTransport.slotBytes;
            const view = runtimeState.frameTransport.data.subarray(offset, offset + frame.byteLen);
            if (frameAudit.enabled) {
              const fp = drawlistFingerprint(view);
              setFrameAuditMetaNow(frame.frameSeq, {
                transport: frame.transport,
                byteLen: frame.byteLen,
                slotIndex: frame.slotIndex,
                slotToken: frame.slotToken,
                hash32: fp.hash32,
                prefixHash32: fp.prefixHash32,
                cmdCount: fp.cmdCount,
                totalSize: fp.totalSize,
              });
              emitFrameAuditNow("frame.submit.payload", frame.frameSeq, fp);
            }
            res = native.engineSubmitDrawlist(runtimeState.engineId, view);
          }
        }
      }
    } catch (err) {
      releasePendingFrameNow(
        frame,
        sabInUse ? FRAME_SAB_SLOT_STATE_IN_USE : FRAME_SAB_SLOT_STATE_READY,
      );
      emitFrameAuditNow("frame.submit.throw", frame.frameSeq, { detail: safeDetail(err) });
      postFrameStatusNow(frame.frameSeq, -1);
      drainNativeFrameAuditNow("submit-throw");
      fatal("engineSubmitDrawlist", -1, `engine_submit_drawlist threw: ${safeDetail(err)}`);
      runtimeState.running = false;
      return;
    }
    if (staleSabFrame) {
      didFrameWork = true;
      emitFrameAuditNow("frame.submit.stale", frame.frameSeq, {
        reason: "slot-token-mismatch",
      });
      deleteFrameAuditNow(frame.frameSeq);
      syncPendingSabFrameFromMailboxNow();
    } else {
      didSubmitDrawlistThisTick = res === 0;
      runtimeState.haveSubmittedDrawlist =
        runtimeState.haveSubmittedDrawlist || didSubmitDrawlistThisTick;
      didFrameWork = true;
      releasePendingFrameNow(frame, FRAME_SAB_SLOT_STATE_IN_USE);
      emitFrameAuditNow("frame.submit.result", frame.frameSeq, { submitResult: res });
      drainNativeFrameAuditNow("post-submit");
      if (res < 0) {
        postFrameStatusNow(frame.frameSeq, res);
        fatal("engineSubmitDrawlist", res, "engine_submit_drawlist failed");
        runtimeState.running = false;
        return;
      }
      postFrameAcceptedNow(frame.frameSeq);
      submittedFrameSeq = frame.frameSeq;
    }
  }

  if (runtimeState.haveSubmittedDrawlist && didSubmitDrawlistThisTick) {
    let pres = -1;
    try {
      pres = native.enginePresent(runtimeState.engineId);
    } catch (err) {
      if (submittedFrameSeq !== null) {
        emitFrameAuditNow("frame.present.throw", submittedFrameSeq, { detail: safeDetail(err) });
      }
      if (submittedFrameSeq !== null) postFrameStatusNow(submittedFrameSeq, -1);
      drainNativeFrameAuditNow("present-throw");
      fatal("enginePresent", -1, `engine_present threw: ${safeDetail(err)}`);
      runtimeState.running = false;
      return;
    }
    if (pres < 0) {
      if (submittedFrameSeq !== null) {
        emitFrameAuditNow("frame.present.result", submittedFrameSeq, { presentResult: pres });
      }
      if (submittedFrameSeq !== null) postFrameStatusNow(submittedFrameSeq, pres);
      drainNativeFrameAuditNow("present-failed");
      fatal("enginePresent", pres, "engine_present failed");
      runtimeState.running = false;
      return;
    }
    if (submittedFrameSeq !== null) {
      emitFrameAuditNow("frame.present.result", submittedFrameSeq, { presentResult: pres });
    }
  }

  if (submittedFrameSeq !== null) {
    postFrameStatusNow(submittedFrameSeq, 0);
    drainNativeFrameAuditNow("frame-complete");
  }

  const discard = eventState.discardBuffer;
  if (discard === null) {
    if (runtimeState.frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWakeLocal();
    return;
  }
  for (let i = 0; i < MAX_POLL_DRAIN_ITERS; i++) {
    const outBuf: ArrayBuffer =
      eventState.eventPool.length > 0 ? (eventState.eventPool.pop() ?? discard) : discard;
    let written = -1;
    const pollStart = PERF_ENABLED ? performance.now() : 0;
    try {
      written = native.enginePollEvents(runtimeState.engineId, 0, new Uint8Array(outBuf));
    } catch (err) {
      fatal("enginePollEvents", -1, `engine_poll_events threw: ${safeDetail(err)}`);
      runtimeState.running = false;
      return;
    }
    if (PERF_ENABLED) {
      perfRecord(PERF_ENABLED, perfSamples, "event_poll", performance.now() - pollStart);
    }

    if (written === ZR_ERR_LIMIT) {
      if (outBuf !== discard) eventState.eventPool.push(outBuf);
      eventState.droppedSinceLast++;
      didEventWork = true;
      break;
    }

    if (!Number.isInteger(written) || written > outBuf.byteLength) {
      if (outBuf !== discard) eventState.eventPool.push(outBuf);
      fatal(
        "enginePollEvents",
        -1,
        `engine_poll_events returned invalid byte count: written=${String(written)} capacity=${String(outBuf.byteLength)}`,
      );
      runtimeState.running = false;
      return;
    }

    if (written < 0) {
      if (outBuf !== discard) eventState.eventPool.push(outBuf);
      fatal("enginePollEvents", written, "engine_poll_events failed");
      runtimeState.running = false;
      return;
    }

    if (written === 0) {
      if (outBuf !== discard) eventState.eventPool.push(outBuf);
      break;
    }

    if (outBuf === discard) {
      eventState.droppedSinceLast++;
      didEventWork = true;
      continue;
    }

    postToMain(
      {
        type: "events",
        batch: outBuf,
        byteLen: written,
        droppedSinceLast: eventState.droppedSinceLast,
      },
      [outBuf],
    );
    eventState.droppedSinceLast = 0;
    didEventWork = true;
  }

  if (!runtimeState.running) return;
  if (didFrameWork) {
    tickState.idleDelayMs = tickState.tickIntervalMs;
    scheduleTickNowLocal();
    if (runtimeState.frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWakeLocal();
    return;
  }
  if (didEventWork) {
    tickState.idleDelayMs = tickState.tickIntervalMs;
    scheduleTickLocal(tickState.tickIntervalMs);
    if (runtimeState.frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWakeLocal();
    return;
  }
  tickState.idleDelayMs = computeNextIdleDelay(
    tickState.idleDelayMs,
    tickState.tickIntervalMs,
    tickState.maxIdleDelayMs,
  );
  scheduleTickLocal(tickState.idleDelayMs);
  if (runtimeState.frameTransport.kind === FRAME_TRANSPORT_SAB_V1) armSabFrameWakeLocal();
}

const messageContext: EngineWorkerMessageContext = {
  workerData,
  native,
  runtimeState,
  frameAuditState,
  eventState,
  tickState,
  frameAudit,
  postToMain,
  fatal,
  shutdownNow,
  startTickLoop: startTickLoopLocal,
  scheduleTickNow: scheduleTickNowLocal,
  perfSnapshot: () => perfSnapshot(perfSamples),
  safeDetail,
  setFrameAuditMeta: setFrameAuditMetaNow,
  emitFrameAudit: emitFrameAuditNow,
  deleteFrameAudit: deleteFrameAuditNow,
  releasePendingFrame: releasePendingFrameNow,
  syncPendingSabFrameFromMailbox: syncPendingSabFrameFromMailboxNow,
};

function onMessage(msg: MainToWorkerMessage): void {
  switch (msg.type) {
    case "init":
      handleInitMessage(msg, messageContext);
      return;
    case "frame":
      handleFrameMessage(msg, messageContext);
      return;
    case "frameKick":
      handleFrameKickMessage(msg, messageContext);
      return;
    case "setConfig":
      handleSetConfigMessage(msg, messageContext);
      return;
    case "postUserEvent":
      handlePostUserEventMessage(msg, messageContext);
      return;
    case "eventsAck":
      handleEventsAckMessage(msg, messageContext);
      return;
    case "getCaps":
      handleGetCapsMessage(msg, messageContext);
      return;
    case "shutdown":
      handleShutdownMessage(msg, messageContext);
      return;
    case "debug:enable":
      handleDebugEnableMessage(msg, messageContext);
      return;
    case "debug:disable":
      handleDebugDisableMessage(msg, messageContext);
      return;
    case "debug:query":
      handleDebugQueryMessage(msg, messageContext);
      return;
    case "debug:getPayload":
      handleDebugGetPayloadMessage(msg, messageContext);
      return;
    case "debug:getStats":
      handleDebugGetStatsMessage(msg, messageContext);
      return;
    case "debug:export":
      handleDebugExportMessage(msg, messageContext);
      return;
    case "debug:reset":
      handleDebugResetMessage(msg, messageContext);
      return;
    case "perf:snapshot":
      handlePerfSnapshotMessage(msg, messageContext);
      return;
  }
}

if (parentPort === null) {
  throw new Error("engineWorker: parentPort is null (not running in worker_threads)");
}

parentPort.on("message", (m: unknown) => {
  if (typeof m !== "object" || m === null) return;
  const type = (m as { type?: unknown }).type;
  if (typeof type !== "string") return;
  onMessage(m as MainToWorkerMessage);
});
