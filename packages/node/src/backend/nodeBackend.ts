/**
 * Node RuntimeBackend implementation (LOCKED behavior).
 * @see docs/backend/worker-model.md
 * @see docs/guide/lifecycle-and-updates.md
 * @see docs/backend/node.md
 * @see docs/dev/style-guide.md
 * @see docs/backend/native.md
 */

import { Worker } from "node:worker_threads";
import type {
  BackendEventBatch,
  DebugBackend,
  DebugConfig,
  DebugQuery,
  DebugQueryResult,
  DebugStats,
  RuntimeBackend,
  TerminalCaps,
  TerminalProfile,
} from "@rezi-ui/core";
import { DEFAULT_TERMINAL_CAPS } from "@rezi-ui/core";
import {
  ZR_DRAWLIST_VERSION_V1,
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
  ZR_EVENT_BATCH_VERSION_V1,
  ZrUiError,
  setTextMeasureEmojiPolicy,
  severityToNum,
} from "@rezi-ui/core";
import type { BackendBeginFrame } from "@rezi-ui/core/backend";
import { createFrameAuditLogger } from "../frameAudit.js";
import {
  type EngineCreateConfig,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_TRANSFER_V1,
  FRAME_TRANSPORT_VERSION,
  type FrameTransportConfig,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from "../worker/protocol.js";
import {
  DEFAULT_FPS_CAP,
  DEFAULT_MAX_EVENT_BYTES,
  MAX_SAFE_EVENT_BYTES,
  MAX_SAFE_FPS_CAP,
  normalizeBackendNativeConfig,
  parseBoundedPositiveIntOrThrow,
  parsePositiveInt,
  parsePositiveIntOr,
  resolveTargetFps,
} from "./backendSharedConfig.js";
import { DEBUG_QUERY_DEFAULT_RECORDS, DEBUG_QUERY_MAX_RECORDS } from "./backendSharedDebug.js";
import { attachBackendMarkers } from "./backendSharedMarkers.js";
import { applyEmojiWidthPolicy, resolveBackendEmojiWidthPolicy } from "./emojiWidthPolicy.js";
import {
  assertWorkerEnvironmentSupported,
  hasInteractiveTty,
  resolveWorkerEntry,
  selectNodeBackendExecutionMode,
} from "./nodeBackend/executionMode.js";
import {
  createNodeBackendFrameTrackingState,
  registerFrameAudit,
  rejectFrameWaiters,
  releaseFrameReservation,
  reserveFramePromise,
  resolveAcceptedFramesUpTo,
  resolveCoalescedCompletionFramesUpTo,
  settleCompletedFrame,
} from "./nodeBackend/frameTracking.js";
import {
  FRAME_SAB_SLOT_BYTES_DEFAULT,
  FRAME_SAB_SLOT_COUNT_DEFAULT,
  acquireSabSlot,
  acquireSabSlotTracked,
  copyInto,
  createSabFrameTransport,
  frameSeqToSlotToken,
  publishSabFrame,
  resetSabFrameTransport,
} from "./nodeBackend/frameTransport.js";
export type {
  NodeBackend,
  NodeBackendConfig,
  NodeBackendExecutionModeSelection,
  NodeBackendExecutionModeSelectionInput,
  NodeBackendInternalOpts,
  NodeBackendPerf,
  NodeBackendPerfSnapshot,
} from "./nodeBackend/shared.js";
import {
  createNodeBackendDebugChannelState,
  enqueueDebug,
  rejectDebugWaiters,
} from "./nodeBackend/debugChannel.js";
import { deferred, safeErr } from "./nodeBackend/shared.js";
import type {
  Deferred,
  NodeBackend,
  NodeBackendInternalOpts,
  NodeBackendPerf,
} from "./nodeBackend/shared.js";
import { createNodeBackendInlineInternal } from "./nodeBackendInline.js";
import { terminalProfileFromNodeEnv } from "./terminalProfile.js";

type BeginFrameMetrics = {
  success: number;
  fallbackToRequestFrame: number;
  readyReclaims: number;
};

const WIDTH_POLICY_KEY = "widthPolicy" as const;
export { selectNodeBackendExecutionMode };

export function createNodeBackendInternal(opts: NodeBackendInternalOpts = {}): NodeBackend {
  const frameAudit = createFrameAuditLogger("backend");
  const cfg = opts.config ?? {};
  const fpsCap = parseBoundedPositiveIntOrThrow(
    "fpsCap",
    cfg.fpsCap,
    DEFAULT_FPS_CAP,
    MAX_SAFE_FPS_CAP,
  );
  const requestedExecutionMode = cfg.executionMode ?? "auto";
  const executionModeSelection = selectNodeBackendExecutionMode({
    requestedExecutionMode,
    fpsCap,
    hasAnyTty: hasInteractiveTty(),
    ...(opts.nativeShimModule === undefined ? {} : { nativeShimModule: opts.nativeShimModule }),
  });
  const executionMode = executionModeSelection.selectedExecutionMode;
  if (executionModeSelection.fallbackReason !== null && frameAudit.enabled) {
    frameAudit.emit("backend.executionModeFallback", {
      requestedExecutionMode,
      resolvedExecutionMode: executionModeSelection.resolvedExecutionMode,
      selectedExecutionMode: executionMode,
      reason: executionModeSelection.fallbackReason,
    });
  }
  if (executionMode === "inline") {
    return createNodeBackendInlineInternal(opts);
  }
  const requestedDrawlistVersion = ZR_DRAWLIST_VERSION_V1;
  const maxEventBytes = parseBoundedPositiveIntOrThrow(
    "maxEventBytes",
    cfg.maxEventBytes,
    DEFAULT_MAX_EVENT_BYTES,
    MAX_SAFE_EVENT_BYTES,
  );
  const frameTransportMode =
    cfg.frameTransport === "transfer" || cfg.frameTransport === "sab" ? cfg.frameTransport : "auto";
  const frameSabSlotCount = parsePositiveIntOr(cfg.frameSabSlotCount, FRAME_SAB_SLOT_COUNT_DEFAULT);
  const frameSabSlotBytes = parsePositiveIntOr(cfg.frameSabSlotBytes, FRAME_SAB_SLOT_BYTES_DEFAULT);
  const sabFrameTransport =
    frameTransportMode === "transfer"
      ? null
      : createSabFrameTransport(frameSabSlotCount, frameSabSlotBytes);
  const frameTransportWire: FrameTransportConfig =
    sabFrameTransport !== null
      ? {
          kind: FRAME_TRANSPORT_SAB_V1,
          version: FRAME_TRANSPORT_VERSION,
          slotCount: sabFrameTransport.slotCount,
          slotBytes: sabFrameTransport.slotBytes,
          control: sabFrameTransport.control,
          data: sabFrameTransport.data,
        }
      : {
          kind: FRAME_TRANSPORT_TRANSFER_V1,
          version: FRAME_TRANSPORT_VERSION,
        };
  const nativeConfig = normalizeBackendNativeConfig(cfg.nativeConfig);
  const nativeTargetFps = resolveTargetFps(fpsCap, nativeConfig);

  const initConfigBase: EngineCreateConfig = {
    ...nativeConfig,
    // fpsCap is the single frame-scheduling knob; native target fps must align.
    targetFps: nativeTargetFps,
    // Negotiation pins (docs/16 + docs/01)
    requestedEngineAbiMajor: ZR_ENGINE_ABI_MAJOR,
    requestedEngineAbiMinor: ZR_ENGINE_ABI_MINOR,
    requestedEngineAbiPatch: ZR_ENGINE_ABI_PATCH,
    requestedDrawlistVersion: requestedDrawlistVersion,
    requestedEventBatchVersion: ZR_EVENT_BATCH_VERSION_V1,

    // Node worker runtime caps
    fpsCap,
    maxEventBytes,
    frameTransport: frameTransportWire,
  };
  let initConfigResolved: EngineCreateConfig | null = null;

  let worker: Worker | null = null;
  let disposed = false;
  let started = false;
  let fatal: Error | null = null;

  let startDef: Deferred<void> | null = null;
  let startSettled = false;
  let stopDef: Deferred<void> | null = null;
  let stopSettled = false;
  let exitDef: Deferred<void> | null = null;

  let nextFrameSeq = 1;
  const frameTracking = createNodeBackendFrameTrackingState();

  const eventQueue: Array<
    Readonly<{ batch: ArrayBuffer; byteLen: number; droppedSinceLast: number }>
  > = [];
  const eventWaiters: Array<Deferred<BackendEventBatch>> = [];
  const capsWaiters: Array<Deferred<TerminalCaps>> = [];
  let cachedCaps: TerminalCaps | null = null;
  let stopRequested = false;

  // =============================================================================
  // Debug request serialization (no request IDs in protocol)
  // =============================================================================

  const debugChannel = createNodeBackendDebugChannelState();

  function failAll(err: Error): void {
    while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
    while (capsWaiters.length > 0) capsWaiters.shift()?.reject(err);
    eventQueue.length = 0;
    rejectFrameWaiters(frameTracking, frameAudit, err);
    rejectDebugWaiters(debugChannel, err);

    if (startDef !== null && !startSettled) {
      startSettled = true;
      startDef.reject(err);
    }
    if (stopDef !== null && !stopSettled) {
      stopSettled = true;
      stopDef.reject(err);
    }
  }

  function rejectPending(err: Error): void {
    while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
    while (capsWaiters.length > 0) capsWaiters.shift()?.reject(err);
    eventQueue.length = 0;
    rejectFrameWaiters(frameTracking, frameAudit, err);
    rejectDebugWaiters(debugChannel, err);

    if (startDef !== null && !startSettled) {
      startSettled = true;
      startDef.reject(err);
    }
  }

  function send(msg: MainToWorkerMessage, transfer?: readonly ArrayBuffer[]): void {
    if (worker === null) return;
    if (transfer !== undefined) {
      worker.postMessage(msg, transfer as unknown as Array<ArrayBuffer>);
      return;
    }
    worker.postMessage(msg);
  }

  function handleWorkerMessage(m: unknown): void {
    if (fatal !== null) return;
    if (typeof m !== "object" || m === null) return;
    const type = (m as { type?: unknown }).type;
    if (typeof type !== "string") return;

    const msg = m as WorkerToMainMessage;
    switch (msg.type) {
      case "ready": {
        started = true;
        stopRequested = false;
        if (startDef !== null && !startSettled) {
          startSettled = true;
          startDef.resolve();
        }
        return;
      }

      case "frameStatus": {
        if (frameAudit.enabled) {
          frameAudit.emit("worker.frameStatus", {
            acceptedSeq: msg.acceptedSeq,
            completedSeq: msg.completedSeq ?? null,
            completedResult: msg.completedResult ?? null,
          });
        }
        if (!Number.isInteger(msg.acceptedSeq) || msg.acceptedSeq <= 0) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `invalid frameStatus.acceptedSeq: ${String(msg.acceptedSeq)}`,
          );
          failAll(fatal);
          return;
        }
        resolveAcceptedFramesUpTo(frameTracking, frameAudit, msg.acceptedSeq);
        resolveCoalescedCompletionFramesUpTo(frameTracking, frameAudit, msg.acceptedSeq);

        if (msg.completedSeq !== undefined) {
          if (!Number.isInteger(msg.completedSeq) || msg.completedSeq <= 0) {
            fatal = new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `invalid frameStatus.completedSeq: ${String(msg.completedSeq)}`,
            );
            failAll(fatal);
            return;
          }
          const completedResult = msg.completedResult ?? 0;
          if (!Number.isInteger(completedResult)) {
            fatal = new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `invalid frameStatus.completedResult: ${String(msg.completedResult)}`,
            );
            failAll(fatal);
            return;
          }
          settleCompletedFrame(frameTracking, frameAudit, msg.completedSeq, completedResult);
          if (completedResult < 0) {
            fatal = new ZrUiError(
              "ZRUI_BACKEND_ERROR",
              `engine frame failed: seq=${String(msg.completedSeq)} code=${String(completedResult)}`,
            );
            failAll(fatal);
            return;
          }
          return;
        }
        return;
      }

      case "events": {
        if (!Number.isInteger(msg.byteLen) || msg.byteLen < 0) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: invalid byteLen=${String(msg.byteLen)}`,
          );
          failAll(fatal);
          return;
        }
        if (msg.byteLen > msg.batch.byteLength) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: byteLen=${String(msg.byteLen)} exceeds batch.byteLength=${String(msg.batch.byteLength)}`,
          );
          failAll(fatal);
          return;
        }
        if (msg.byteLen > maxEventBytes) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: byteLen=${String(msg.byteLen)} exceeds maxEventBytes=${String(maxEventBytes)}`,
          );
          failAll(fatal);
          return;
        }
        if (!Number.isInteger(msg.droppedSinceLast) || msg.droppedSinceLast < 0) {
          fatal = new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `events: invalid droppedSinceLast=${String(msg.droppedSinceLast)}`,
          );
          failAll(fatal);
          return;
        }
        const waiter = eventWaiters.shift();
        if (waiter !== undefined) {
          const buf = msg.batch;
          const bytes = new Uint8Array(buf, 0, msg.byteLen);
          let released = false;
          waiter.resolve({
            bytes,
            droppedBatches: msg.droppedSinceLast,
            release: () => {
              if (released) return;
              released = true;
              if (disposed) return;
              send({ type: "eventsAck", buffer: buf }, [buf]);
            },
          });
          return;
        }
        eventQueue.push({
          batch: msg.batch,
          byteLen: msg.byteLen,
          droppedSinceLast: msg.droppedSinceLast,
        });
        return;
      }

      case "fatal": {
        fatal = new ZrUiError(
          "ZRUI_BACKEND_ERROR",
          `worker fatal: ${msg.where} (${msg.code}): ${msg.detail}`,
        );
        failAll(fatal);
        return;
      }

      case "debug:enableResult": {
        debugChannel.debugEnableDef?.resolve(msg.result);
        debugChannel.debugEnableDef = null;
        return;
      }

      case "debug:disableResult": {
        debugChannel.debugDisableDef?.resolve(msg.result);
        debugChannel.debugDisableDef = null;
        return;
      }

      case "debug:queryResult": {
        try {
          if (!Number.isInteger(msg.headersByteLen) || msg.headersByteLen < 0) {
            throw new Error(
              `debug:queryResult: invalid headersByteLen=${String(msg.headersByteLen)}`,
            );
          }
          if (msg.headersByteLen > msg.headers.byteLength) {
            throw new Error(
              `debug:queryResult: headersByteLen=${String(msg.headersByteLen)} exceeds buffer=${String(msg.headers.byteLength)}`,
            );
          }

          const headers = new Uint8Array(msg.headers, 0, msg.headersByteLen);
          const result: DebugQueryResult = {
            recordsReturned: msg.result.recordsReturned,
            recordsAvailable: msg.result.recordsAvailable,
            oldestRecordId: BigInt(msg.result.oldestRecordId),
            newestRecordId: BigInt(msg.result.newestRecordId),
            recordsDropped: msg.result.recordsDropped,
          };
          debugChannel.debugQueryDef?.resolve({ headers, result });
          debugChannel.debugQueryDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:getPayloadResult": {
        if (msg.result <= 0 || msg.payloadByteLen <= 0) {
          debugChannel.debugGetPayloadDef?.resolve(null);
          debugChannel.debugGetPayloadDef = null;
          return;
        }
        try {
          if (!Number.isInteger(msg.payloadByteLen) || msg.payloadByteLen < 0) {
            throw new Error(
              `debug:getPayloadResult: invalid payloadByteLen=${String(msg.payloadByteLen)}`,
            );
          }
          if (msg.payloadByteLen > msg.payload.byteLength) {
            throw new Error(
              `debug:getPayloadResult: payloadByteLen=${String(msg.payloadByteLen)} exceeds buffer=${String(msg.payload.byteLength)}`,
            );
          }
          debugChannel.debugGetPayloadDef?.resolve(
            new Uint8Array(msg.payload, 0, msg.payloadByteLen),
          );
          debugChannel.debugGetPayloadDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:getStatsResult": {
        try {
          const stats: DebugStats = {
            totalRecords: BigInt(msg.stats.totalRecords),
            totalDropped: BigInt(msg.stats.totalDropped),
            errorCount: msg.stats.errorCount,
            warnCount: msg.stats.warnCount,
            currentRingUsage: msg.stats.currentRingUsage,
            ringCapacity: msg.stats.ringCapacity,
          };
          debugChannel.debugGetStatsDef?.resolve(stats);
          debugChannel.debugGetStatsDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:exportResult": {
        try {
          if (!Number.isInteger(msg.bufferByteLen) || msg.bufferByteLen < 0) {
            throw new Error(
              `debug:exportResult: invalid bufferByteLen=${String(msg.bufferByteLen)}`,
            );
          }
          if (msg.bufferByteLen > msg.buffer.byteLength) {
            throw new Error(
              `debug:exportResult: bufferByteLen=${String(msg.bufferByteLen)} exceeds buffer=${String(msg.buffer.byteLength)}`,
            );
          }
          debugChannel.debugExportDef?.resolve(new Uint8Array(msg.buffer, 0, msg.bufferByteLen));
          debugChannel.debugExportDef = null;
          return;
        } catch (err) {
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
          return;
        }
      }

      case "debug:resetResult": {
        debugChannel.debugResetDef?.resolve(msg.result);
        debugChannel.debugResetDef = null;
        return;
      }

      case "perf:snapshotResult": {
        debugChannel.perfSnapshotDef?.resolve(msg.snapshot);
        debugChannel.perfSnapshotDef = null;
        return;
      }

      case "shutdownComplete": {
        rejectPending(new Error("NodeBackend: stopped"));
        if (stopDef !== null && !stopSettled) {
          stopSettled = true;
          stopDef.resolve();
        }
        return;
      }

      case "caps": {
        const caps: TerminalCaps = {
          colorMode: msg.colorMode as 0 | 1 | 2 | 3,
          supportsMouse: msg.supportsMouse,
          supportsBracketedPaste: msg.supportsBracketedPaste,
          supportsFocusEvents: msg.supportsFocusEvents,
          supportsOsc52: msg.supportsOsc52,
          supportsSyncUpdate: msg.supportsSyncUpdate,
          supportsScrollRegion: msg.supportsScrollRegion,
          supportsCursorShape: msg.supportsCursorShape,
          supportsOutputWaitWritable: msg.supportsOutputWaitWritable,
          supportsUnderlineStyles: msg.supportsUnderlineStyles,
          supportsColoredUnderlines: msg.supportsColoredUnderlines,
          supportsHyperlinks: msg.supportsHyperlinks,
          sgrAttrsSupported: msg.sgrAttrsSupported,
        };
        cachedCaps = caps;
        const waiter = capsWaiters.shift();
        if (waiter !== undefined) {
          waiter.resolve(caps);
        }
        return;
      }
    }
  }

  function handleWorkerExit(code: number | null): void {
    if (disposed) return;
    if (stopRequested) {
      if (code !== 0 && fatal === null) {
        fatal = new ZrUiError(
          "ZRUI_BACKEND_ERROR",
          `worker exited unexpectedly: code=${String(code)}`,
        );
        failAll(fatal);
      } else {
        rejectPending(new Error("NodeBackend: stopped"));
      }
    } else if (fatal === null) {
      const message =
        code === 0 && !started && startDef !== null && !startSettled
          ? "worker exited before ready handshake"
          : `worker exited unexpectedly: code=${String(code)}`;
      fatal = new ZrUiError("ZRUI_BACKEND_ERROR", message);
      failAll(fatal);
    }

    if (stopDef !== null && !stopSettled) {
      stopSettled = true;
      stopDef.resolve();
    }

    if (exitDef !== null) exitDef.resolve();
    worker = null;
    started = false;
  }

  const backend: RuntimeBackend = {
    async start(): Promise<void> {
      if (disposed) throw new Error("NodeBackend: disposed");
      if (fatal !== null) throw fatal;
      if (started) return;
      assertWorkerEnvironmentSupported(opts.nativeShimModule);

      if (worker === null) {
        if (initConfigResolved === null) {
          const resolvedEmojiWidthPolicy = await resolveBackendEmojiWidthPolicy(
            cfg.emojiWidthPolicy,
            nativeConfig,
          );
          const nativeWidthPolicy = applyEmojiWidthPolicy(resolvedEmojiWidthPolicy);
          initConfigResolved = {
            ...initConfigBase,
            widthPolicy: nativeWidthPolicy,
          };
        } else {
          // Keep core measurement policy deterministic across stop/start cycles.
          const widthPolicy = initConfigResolved[WIDTH_POLICY_KEY];
          if (typeof widthPolicy === "number") {
            setTextMeasureEmojiPolicy(widthPolicy === 0 ? "narrow" : "wide");
          }
        }

        startDef = deferred<void>();
        startSettled = false;
        stopDef = null;
        stopSettled = false;
        stopRequested = false;
        if (sabFrameTransport !== null) resetSabFrameTransport(sabFrameTransport);

        const workerData =
          opts.nativeShimModule === undefined
            ? undefined
            : { nativeShimModule: opts.nativeShimModule };
        const workerEntry = resolveWorkerEntry(workerData);
        worker = new Worker(workerEntry.entry, workerEntry.options);
        if (frameAudit.enabled) {
          frameAudit.emit("worker.spawn", {
            frameTransport: frameTransportWire.kind,
            frameSabSlotCount: frameSabSlotCount,
            frameSabSlotBytes: frameSabSlotBytes,
            workerEntry: workerEntry.entry.href,
          });
        }
        exitDef = deferred<void>();
        worker.on("message", handleWorkerMessage);
        worker.on("error", (err) => {
          if (fatal !== null) return;
          fatal = new ZrUiError("ZRUI_BACKEND_ERROR", safeErr(err).message);
          failAll(fatal);
        });
        worker.on("exit", (code) => {
          handleWorkerExit(code);
        });

        send({ type: "init", config: initConfigResolved });
      }

      if (startDef === null) throw new Error("NodeBackend: invariant violated (startDef is null)");
      try {
        await startDef.promise;
      } catch (err) {
        // Startup fatals can race with worker teardown. Waiting for exit keeps
        // caller shutdown paths deterministic and avoids process-level teardown
        // races when user code exits immediately after a start() rejection.
        if (exitDef !== null) {
          try {
            await exitDef.promise;
          } catch {
            // ignore teardown wait failures
          }
        }
        throw err;
      }
    },

    async stop(): Promise<void> {
      if (disposed) return;
      if (fatal !== null) throw fatal;
      if (worker === null) return;

      if (stopDef !== null) {
        await stopDef.promise;
        return;
      }

      stopDef = deferred<void>();
      stopSettled = false;
      stopRequested = true;
      send({ type: "shutdown" });
      await stopDef.promise;
      if (exitDef !== null) await exitDef.promise;
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;

      if (worker !== null) {
        worker.terminate().catch(() => {});
        worker = null;
      }

      const err = new Error("NodeBackend: disposed");
      while (eventWaiters.length > 0) eventWaiters.shift()?.reject(err);
      while (capsWaiters.length > 0) capsWaiters.shift()?.reject(err);
      eventQueue.length = 0;
      rejectFrameWaiters(frameTracking, frameAudit, err);
      rejectDebugWaiters(debugChannel, err);

      if (startDef !== null && !startSettled) {
        startSettled = true;
        startDef.reject(err);
      }
      if (stopDef !== null && !stopSettled) {
        stopSettled = true;
        stopDef.reject(err);
      }
    },

    requestFrame(drawlist: Uint8Array): Promise<void> {
      if (disposed) return Promise.reject(new Error("NodeBackend: disposed"));
      if (fatal !== null) return Promise.reject(fatal);
      if (stopRequested) return Promise.reject(new Error("NodeBackend: stopped"));
      if (!started) {
        return backend.start().then(() => backend.requestFrame(drawlist));
      }
      if (worker === null) return Promise.reject(new Error("NodeBackend: worker not available"));

      const frameSeq = nextFrameSeq++;
      const framePromise = reserveFramePromise(frameTracking, frameSeq);

      if (sabFrameTransport !== null && drawlist.byteLength <= sabFrameTransport.slotBytes) {
        const slotIndex = acquireSabSlot(sabFrameTransport);
        if (slotIndex >= 0) {
          const slotToken = frameSeqToSlotToken(frameSeq);
          registerFrameAudit(
            frameTracking,
            frameAudit,
            frameSeq,
            "requestFrame",
            FRAME_TRANSPORT_SAB_V1,
            drawlist,
            slotIndex,
            slotToken,
          );
          const slotOffset = slotIndex * sabFrameTransport.slotBytes;
          sabFrameTransport.dataBytes.set(drawlist, slotOffset);
          Atomics.store(sabFrameTransport.tokens, slotIndex, slotToken);
          Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_READY);
          publishSabFrame(sabFrameTransport, frameSeq, slotIndex, slotToken, drawlist.byteLength);
          if (frameAudit.enabled) {
            frameAudit.emit("frame.sab.publish", {
              frameSeq,
              slotIndex,
              slotToken,
              byteLen: drawlist.byteLength,
            });
          }
          // SAB consumers wake on futex notify instead of per-frame
          // MessagePort frameKick round-trips.
          Atomics.notify(sabFrameTransport.controlHeader, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, 1);
          return framePromise;
        }
        if (frameAudit.enabled) {
          frameAudit.emit("frame.sab.fallback_transfer", {
            frameSeq,
            byteLen: drawlist.byteLength,
            reason: "no-slot-available",
          });
        }
      }

      // Transfer fallback participates in the same ACK model:
      // - accepted ACK (hidden marker) can unblock app scheduling early
      // - completion promise settles on worker completion/coalescing status
      const buf = new ArrayBuffer(drawlist.byteLength);
      copyInto(buf, drawlist);
      registerFrameAudit(
        frameTracking,
        frameAudit,
        frameSeq,
        "requestFrame",
        FRAME_TRANSPORT_TRANSFER_V1,
        drawlist,
      );
      try {
        send(
          {
            type: "frame",
            frameSeq,
            byteLen: drawlist.byteLength,
            transport: FRAME_TRANSPORT_TRANSFER_V1,
            drawlist: buf,
          },
          [buf],
        );
      } catch (err) {
        releaseFrameReservation(frameTracking, frameAudit, frameSeq);
        if (frameAudit.enabled) {
          frameAudit.emit("frame.transfer.publish_error", {
            frameSeq,
            detail: safeErr(err).message,
          });
        }
        return Promise.reject(safeErr(err));
      }
      if (frameAudit.enabled) {
        frameAudit.emit("frame.transfer.publish", {
          frameSeq,
          byteLen: drawlist.byteLength,
        });
      }
      return framePromise;
    },

    pollEvents(): Promise<BackendEventBatch> {
      if (disposed) return Promise.reject(new Error("NodeBackend: disposed"));
      if (fatal !== null) return Promise.reject(fatal);
      if (stopRequested) return Promise.reject(new Error("NodeBackend: stopped"));

      const queued = eventQueue.shift();
      if (queued !== undefined) {
        const buf = queued.batch;
        const bytes = new Uint8Array(buf, 0, queued.byteLen);
        let released = false;
        return Promise.resolve({
          bytes,
          droppedBatches: queued.droppedSinceLast,
          release: () => {
            if (released) return;
            released = true;
            if (disposed) return;
            send({ type: "eventsAck", buffer: buf }, [buf]);
          },
        });
      }

      const d = deferred<BackendEventBatch>();
      eventWaiters.push(d);
      return d.promise;
    },

    postUserEvent(tag: number, payload: Uint8Array): void {
      if (disposed) throw new Error("NodeBackend: disposed");
      if (fatal !== null) throw fatal;
      if (worker === null) throw new Error("NodeBackend: not started");
      if (stopRequested) throw new Error("NodeBackend: stopped");

      const buf = new ArrayBuffer(payload.byteLength);
      copyInto(buf, payload);
      send({ type: "postUserEvent", tag, payload: buf, byteLen: payload.byteLength }, [buf]);
    },

    async getCaps(): Promise<TerminalCaps> {
      if (disposed) throw new Error("NodeBackend: disposed");
      if (fatal !== null) throw fatal;

      // Return cached caps if available
      if (cachedCaps !== null) {
        return cachedCaps;
      }

      // If not started, return default caps
      if (!started || worker === null) {
        return DEFAULT_TERMINAL_CAPS;
      }

      // Request caps from worker
      const d = deferred<TerminalCaps>();
      capsWaiters.push(d);
      send({ type: "getCaps" });
      return d.promise;
    },

    async getTerminalProfile(): Promise<TerminalProfile> {
      const caps = await backend.getCaps();
      return terminalProfileFromNodeEnv(caps);
    },
  };

  const debug: DebugBackend = {
    debugEnable: (config: DebugConfig) =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugEnableDef !== null) {
          throw new Error("NodeBackend: debugEnable already in-flight");
        }
        debugChannel.debugEnableDef = deferred<number>();

        const minSeverity =
          config.minSeverity !== undefined ? severityToNum(config.minSeverity) : null;

        const configWire = {
          enabled: true,
          ...(config.ringCapacity !== undefined ? { ringCapacity: config.ringCapacity } : {}),
          ...(minSeverity !== null ? { minSeverity } : {}),
          ...(config.categoryMask !== undefined ? { categoryMask: config.categoryMask } : {}),
          ...(config.captureRawEvents !== undefined
            ? { captureRawEvents: config.captureRawEvents }
            : {}),
          ...(config.captureDrawlistBytes !== undefined
            ? { captureDrawlistBytes: config.captureDrawlistBytes }
            : {}),
        };

        send({ type: "debug:enable", config: configWire });

        const rc = await debugChannel.debugEnableDef.promise;
        debugChannel.debugEnableDef = null;
        if (rc < 0) {
          throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugEnable failed: code=${String(rc)}`);
        }
      }),

    debugDisable: () =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugDisableDef !== null)
          throw new Error("NodeBackend: debugDisable already in-flight");
        debugChannel.debugDisableDef = deferred<number>();
        send({ type: "debug:disable" });
        const rc = await debugChannel.debugDisableDef.promise;
        debugChannel.debugDisableDef = null;
        if (rc < 0) {
          throw new ZrUiError(
            "ZRUI_BACKEND_ERROR",
            `engineDebugDisable failed: code=${String(rc)}`,
          );
        }
      }),

    debugQuery: (query: DebugQuery) =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugQueryDef !== null) {
          throw new Error("NodeBackend: debugQuery already in-flight");
        }
        debugChannel.debugQueryDef = deferred<{ headers: Uint8Array; result: DebugQueryResult }>();

        const minSeverity =
          query.minSeverity !== undefined ? severityToNum(query.minSeverity) : null;
        const maxRecords = parsePositiveInt(query.maxRecords);
        const recordsCap =
          maxRecords !== null
            ? Math.min(maxRecords, DEBUG_QUERY_MAX_RECORDS)
            : DEBUG_QUERY_DEFAULT_RECORDS;
        const headersCap = Math.max(40, recordsCap * 40);

        const queryWire = {
          ...(query.minRecordId !== undefined ? { minRecordId: String(query.minRecordId) } : {}),
          ...(query.maxRecordId !== undefined ? { maxRecordId: String(query.maxRecordId) } : {}),
          ...(query.minFrameId !== undefined ? { minFrameId: String(query.minFrameId) } : {}),
          ...(query.maxFrameId !== undefined ? { maxFrameId: String(query.maxFrameId) } : {}),
          ...(query.categoryMask !== undefined ? { categoryMask: query.categoryMask } : {}),
          ...(minSeverity !== null ? { minSeverity } : {}),
          ...(maxRecords !== null ? { maxRecords: recordsCap } : {}),
        };

        send({ type: "debug:query", query: queryWire, headersCap });

        const out = await debugChannel.debugQueryDef.promise;
        debugChannel.debugQueryDef = null;
        return out;
      }),

    debugGetPayload: (recordId: bigint) =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugGetPayloadDef !== null) {
          throw new Error("NodeBackend: debugGetPayload already in-flight");
        }
        debugChannel.debugGetPayloadDef = deferred<Uint8Array | null>();

        // Payloads can include raw drawlist bytes. Default to 4 MiB.
        const payloadCap = 1 << 22;
        send({
          type: "debug:getPayload",
          recordId: String(recordId),
          payloadCap,
        });

        const bytes = await debugChannel.debugGetPayloadDef.promise;
        debugChannel.debugGetPayloadDef = null;
        return bytes;
      }),

    debugGetStats: () =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugGetStatsDef !== null)
          throw new Error("NodeBackend: debugGetStats already in-flight");
        debugChannel.debugGetStatsDef = deferred<DebugStats>();
        send({ type: "debug:getStats" });
        const stats = await debugChannel.debugGetStatsDef.promise;
        debugChannel.debugGetStatsDef = null;
        return stats;
      }),

    debugExport: () =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugExportDef !== null) {
          throw new Error("NodeBackend: debugExport already in-flight");
        }
        debugChannel.debugExportDef = deferred<Uint8Array>();
        send({ type: "debug:export", bufferCap: 1 << 23 }); // 8 MiB
        const bytes = await debugChannel.debugExportDef.promise;
        debugChannel.debugExportDef = null;
        return bytes;
      }),

    debugReset: () =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.debugResetDef !== null) {
          throw new Error("NodeBackend: debugReset already in-flight");
        }
        debugChannel.debugResetDef = deferred<number>();
        send({ type: "debug:reset" });
        const rc = await debugChannel.debugResetDef.promise;
        debugChannel.debugResetDef = null;
        if (rc < 0) {
          throw new ZrUiError("ZRUI_BACKEND_ERROR", `engineDebugReset failed: code=${String(rc)}`);
        }
      }),
  };

  const perf: NodeBackendPerf = {
    perfSnapshot: () =>
      enqueueDebug(debugChannel, async () => {
        if (disposed) throw new Error("NodeBackend: disposed");
        if (fatal !== null) throw fatal;
        await backend.start();
        if (worker === null) throw new Error("NodeBackend: worker not available");

        if (debugChannel.perfSnapshotDef !== null)
          throw new Error("NodeBackend: perfSnapshot already in-flight");
        debugChannel.perfSnapshotDef =
          deferred<Awaited<ReturnType<NodeBackendPerf["perfSnapshot"]>>>();
        send({ type: "perf:snapshot" });
        const snapshot = await debugChannel.perfSnapshotDef.promise;
        debugChannel.perfSnapshotDef = null;
        return snapshot;
      }),
  };

  const beginFrameMetrics: BeginFrameMetrics = {
    success: 0,
    fallbackToRequestFrame: 0,
    readyReclaims: 0,
  };

  const beginFrame: BackendBeginFrame | null =
    sabFrameTransport === null
      ? null
      : (minCapacity?: number) => {
          if (disposed) return null;
          if (fatal !== null) return null;
          if (stopRequested || !started || worker === null) return null;

          const required =
            typeof minCapacity === "number" && Number.isInteger(minCapacity) && minCapacity > 0
              ? minCapacity
              : 0;
          if (required > sabFrameTransport.slotBytes) return null;

          const result = acquireSabSlotTracked(sabFrameTransport);
          if (result.slotIndex < 0) {
            beginFrameMetrics.fallbackToRequestFrame++;
            if (frameAudit.enabled) {
              frameAudit.emit("frame.beginFrame.fallback", {
                reason: "no-slot-available",
                metrics: { ...beginFrameMetrics },
              });
            }
            return null;
          }
          if (result.reclaimedReady) {
            beginFrameMetrics.readyReclaims++;
          }
          beginFrameMetrics.success++;
          const slotIndex = result.slotIndex;
          const slotOffset = slotIndex * sabFrameTransport.slotBytes;
          const buf = sabFrameTransport.dataBytes.subarray(
            slotOffset,
            slotOffset + sabFrameTransport.slotBytes,
          );
          let finalized = false;

          return {
            buf,
            commit: (byteLen: number) => {
              if (finalized) {
                return Promise.reject(
                  new Error("NodeBackend: beginFrame writer already finalized"),
                );
              }
              finalized = true;
              if (disposed) {
                Atomics.store(sabFrameTransport.tokens, slotIndex, 0);
                Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_FREE);
                return Promise.reject(new Error("NodeBackend: disposed"));
              }
              if (fatal !== null) {
                Atomics.store(sabFrameTransport.tokens, slotIndex, 0);
                Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_FREE);
                return Promise.reject(fatal);
              }
              if (stopRequested || !started || worker === null) {
                Atomics.store(sabFrameTransport.tokens, slotIndex, 0);
                Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_FREE);
                return Promise.reject(new Error("NodeBackend: stopped"));
              }
              if (
                !Number.isInteger(byteLen) ||
                byteLen < 0 ||
                byteLen > sabFrameTransport.slotBytes
              ) {
                Atomics.store(sabFrameTransport.tokens, slotIndex, 0);
                Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_FREE);
                return Promise.reject(
                  new Error("NodeBackend: beginFrame commit byteLen out of range"),
                );
              }

              const frameSeq = nextFrameSeq++;
              const framePromise = reserveFramePromise(frameTracking, frameSeq);
              const slotToken = frameSeqToSlotToken(frameSeq);
              registerFrameAudit(
                frameTracking,
                frameAudit,
                frameSeq,
                "beginFrame",
                FRAME_TRANSPORT_SAB_V1,
                buf.subarray(0, byteLen),
                slotIndex,
                slotToken,
              );
              Atomics.store(sabFrameTransport.tokens, slotIndex, slotToken);
              Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_READY);
              publishSabFrame(sabFrameTransport, frameSeq, slotIndex, slotToken, byteLen);
              if (frameAudit.enabled) {
                frameAudit.emit("frame.beginFrame.publish", {
                  frameSeq,
                  slotIndex,
                  slotToken,
                  byteLen,
                  reclaimedReady: result.reclaimedReady,
                  metrics: { ...beginFrameMetrics },
                });
              }
              Atomics.notify(
                sabFrameTransport.controlHeader,
                FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
                1,
              );
              return framePromise;
            },
            abort: () => {
              if (finalized) return;
              finalized = true;
              if (frameAudit.enabled) {
                frameAudit.emit("frame.beginFrame.abort", {
                  slotIndex,
                });
              }
              Atomics.store(sabFrameTransport.tokens, slotIndex, 0);
              Atomics.store(sabFrameTransport.states, slotIndex, FRAME_SAB_SLOT_STATE_FREE);
            },
          };
        };

  return attachBackendMarkers(Object.assign(backend, { debug, perf }) as NodeBackend, {
    requestedDrawlistVersion,
    maxEventBytes,
    fpsCap,
    beginFrame,
  });
}
