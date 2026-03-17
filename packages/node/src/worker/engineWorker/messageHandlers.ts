import type { FrameAuditLogger } from "../../frameAudit.js";
import { drawlistFingerprint } from "../../frameAudit.js";
import {
  EVENT_POOL_SIZE,
  FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_TRANSFER_V1,
  type MainToWorkerDebugDisableMessage,
  type MainToWorkerDebugEnableMessage,
  type MainToWorkerDebugExportMessage,
  type MainToWorkerDebugGetPayloadMessage,
  type MainToWorkerDebugGetStatsMessage,
  type MainToWorkerDebugQueryMessage,
  type MainToWorkerDebugResetMessage,
  type MainToWorkerEventsAckMessage,
  type MainToWorkerFrameKickMessage,
  type MainToWorkerFrameMessage,
  type MainToWorkerGetCapsMessage,
  type MainToWorkerInitMessage,
  type MainToWorkerPerfSnapshotMessage,
  type MainToWorkerPostUserEventMessage,
  type MainToWorkerSetConfigMessage,
  type MainToWorkerShutdownMessage,
} from "../protocol.js";
import {
  DEBUG_HEADER_BYTES,
  DEBUG_QUERY_MAX_HEADERS_CAP,
  DEBUG_QUERY_MIN_HEADERS_CAP,
  maybeEnableNativeFrameAudit,
} from "./frameAudit.js";
import { parseFrameTransportConfig } from "./frameMailbox.js";
import type { PerfSnapshot } from "./perf.js";
import type {
  EngineWorkerEventState,
  EngineWorkerFrameAuditState,
  EngineWorkerRuntimeState,
  EngineWorkerTickState,
  FatalHandler,
  FrameAuditMeta,
  NativeApi,
  PendingFrame,
  PostToMain,
  WorkerData,
} from "./shared.js";
import { parsePositiveInt } from "./shared.js";

const ZREV_MAGIC = 0x5645525a;
const ZR_EVENT_BATCH_VERSION_V1 = 1;
const ZREV_RECORD_RESIZE = 5;

type SetFrameAuditMeta = (
  frameSeq: number,
  patch: Readonly<Partial<Omit<FrameAuditMeta, "frameSeq" | "enqueuedAtMs">>>,
) => void;
type EmitFrameAudit = (
  stage: string,
  frameSeq: number,
  fields?: Readonly<Record<string, unknown>>,
) => void;
type DeleteFrameAudit = (frameSeq: number) => void;

export type EngineWorkerMessageContext = Readonly<{
  workerData: unknown;
  native: NativeApi;
  runtimeState: EngineWorkerRuntimeState;
  frameAuditState: EngineWorkerFrameAuditState;
  eventState: EngineWorkerEventState;
  tickState: EngineWorkerTickState;
  frameAudit: FrameAuditLogger;
  postToMain: PostToMain;
  fatal: FatalHandler;
  shutdownNow: () => void;
  startTickLoop: (fpsCap: number) => void;
  scheduleTickNow: () => void;
  perfSnapshot: () => PerfSnapshot;
  safeDetail: (err: unknown) => string;
  setFrameAuditMeta: SetFrameAuditMeta;
  emitFrameAudit: EmitFrameAudit;
  deleteFrameAudit: DeleteFrameAudit;
  releasePendingFrame: (frame: PendingFrame, expectedSabState: number) => void;
  syncPendingSabFrameFromMailbox: () => void;
}>;

function writeResizeBatchV1(buf: ArrayBuffer, cols: number, rows: number): number {
  const totalSize = 56;
  if (buf.byteLength < totalSize) return 0;

  const dv = new DataView(buf);
  const timeMs = (Date.now() >>> 0) & 0xffff_ffff;

  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, 1, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);

  dv.setUint32(24, ZREV_RECORD_RESIZE, true);
  dv.setUint32(28, 32, true);
  dv.setUint32(32, timeMs, true);
  dv.setUint32(36, 0, true);

  dv.setUint32(40, cols >>> 0, true);
  dv.setUint32(44, rows >>> 0, true);
  dv.setUint32(48, 0, true);
  dv.setUint32(52, 0, true);

  return totalSize;
}

function maybeInjectInitialResize(
  eventState: EngineWorkerEventState,
  postToMain: PostToMain,
  maxEventBytes: number,
): void {
  const cols =
    typeof process.stdout.columns === "number" &&
    Number.isInteger(process.stdout.columns) &&
    process.stdout.columns > 0
      ? process.stdout.columns
      : 80;
  const rows =
    typeof process.stdout.rows === "number" &&
    Number.isInteger(process.stdout.rows) &&
    process.stdout.rows > 0
      ? process.stdout.rows
      : 24;

  const buf = eventState.eventPool.pop() ?? new ArrayBuffer(maxEventBytes);
  const byteLen = writeResizeBatchV1(buf, cols, rows);
  if (byteLen <= 0) {
    eventState.eventPool.push(buf);
    return;
  }
  postToMain({ type: "events", batch: buf, byteLen, droppedSinceLast: 0 }, [buf]);
}

export function handleInitMessage(
  msg: MainToWorkerInitMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId !== null) return;
  ctx.runtimeState.engineBootSucceeded = false;
  const maxEventBytes = parsePositiveInt(msg.config.maxEventBytes);
  if (maxEventBytes === null) {
    ctx.fatal("init", -1, "config.maxEventBytes must be a positive integer");
    ctx.shutdownNow();
    return;
  }

  ctx.runtimeState.frameTransport = parseFrameTransportConfig(msg.config.frameTransport);

  let id = 0;
  try {
    const {
      maxEventBytes: _maxEventBytes,
      fpsCap: _fpsCap,
      frameTransport: _frameTransport,
      ...nativeCfg
    } = msg.config;
    id = ctx.native.engineCreate(nativeCfg);
  } catch (err) {
    ctx.fatal("engineCreate", -1, `engine_create threw: ${ctx.safeDetail(err)}`);
    ctx.shutdownNow();
    return;
  }
  if (!Number.isInteger(id) || id <= 0) {
    ctx.fatal("engineCreate", id, "engine_create failed");
    ctx.shutdownNow();
    return;
  }

  ctx.runtimeState.engineId = id;
  ctx.runtimeState.engineBootSucceeded = true;
  ctx.runtimeState.haveSubmittedDrawlist = false;
  ctx.runtimeState.running = true;
  ctx.runtimeState.pendingFrame = null;
  ctx.runtimeState.lastConsumedSabPublishedSeq = 0;
  ctx.frameAuditState.frameAuditBySeq.clear();
  ctx.frameAuditState.nativeFrameAuditEnabled = false;
  ctx.frameAuditState.nativeFrameAuditNextRecordId = 1n;
  if (ctx.runtimeState.frameTransport.kind === FRAME_TRANSPORT_SAB_V1) {
    Atomics.store(
      ctx.runtimeState.frameTransport.controlHeader,
      FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
      0,
    );
    Atomics.store(
      ctx.runtimeState.frameTransport.controlHeader,
      FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
      0,
    );
    Atomics.store(
      ctx.runtimeState.frameTransport.controlHeader,
      FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
      0,
    );
    Atomics.store(
      ctx.runtimeState.frameTransport.controlHeader,
      FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
      0,
    );
    Atomics.store(
      ctx.runtimeState.frameTransport.controlHeader,
      FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD,
      0,
    );
    for (let i = 0; i < ctx.runtimeState.frameTransport.slotCount; i++) {
      Atomics.store(ctx.runtimeState.frameTransport.states, i, FRAME_SAB_SLOT_STATE_FREE);
      Atomics.store(ctx.runtimeState.frameTransport.tokens, i, 0);
    }
  }

  ctx.eventState.eventPool = [];
  for (let i = 0; i < EVENT_POOL_SIZE; i++) {
    ctx.eventState.eventPool.push(new ArrayBuffer(maxEventBytes));
  }
  ctx.eventState.discardBuffer = new ArrayBuffer(maxEventBytes);
  ctx.eventState.droppedSinceLast = 0;

  const wd: WorkerData =
    ctx.workerData && typeof ctx.workerData === "object"
      ? (ctx.workerData as WorkerData)
      : Object.freeze({});
  const shim = typeof wd.nativeShimModule === "string" ? wd.nativeShimModule : null;
  if (shim === null || shim.length === 0) {
    maybeInjectInitialResize(ctx.eventState, ctx.postToMain, maxEventBytes);
  }

  if (ctx.frameAudit.enabled) {
    ctx.frameAudit.emit("engine.ready", {
      engineId: id,
      frameTransport: ctx.runtimeState.frameTransport.kind,
      maxEventBytes,
      fpsCap: parsePositiveInt(msg.config.fpsCap) ?? 60,
    });
  }
  maybeEnableNativeFrameAudit({
    frameAudit: ctx.frameAudit,
    state: ctx.frameAuditState,
    native: ctx.native,
    engineId: ctx.runtimeState.engineId,
    safeDetail: ctx.safeDetail,
  });

  ctx.postToMain({ type: "ready", engineId: id });
  ctx.startTickLoop(parsePositiveInt(msg.config.fpsCap) ?? 60);
}

export function handleFrameMessage(
  msg: MainToWorkerFrameMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;

  if (ctx.runtimeState.pendingFrame !== null) {
    ctx.emitFrameAudit("frame.overwritten", ctx.runtimeState.pendingFrame.frameSeq, {
      reason: "message-latest-wins",
    });
    ctx.deleteFrameAudit(ctx.runtimeState.pendingFrame.frameSeq);
    ctx.releasePendingFrame(ctx.runtimeState.pendingFrame, FRAME_SAB_SLOT_STATE_READY);
  }

  const frameTransportTag = msg.transport ?? FRAME_TRANSPORT_TRANSFER_V1;
  if (frameTransportTag === FRAME_TRANSPORT_SAB_V1) {
    if (ctx.runtimeState.frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) {
      ctx.fatal("frame", -1, "received SAB frame while SAB transport is disabled");
      ctx.runtimeState.running = false;
      return;
    }
    if (
      !Number.isInteger(msg.slotIndex) ||
      (msg.slotIndex as number) < 0 ||
      (msg.slotIndex as number) >= ctx.runtimeState.frameTransport.slotCount
    ) {
      ctx.fatal("frame", -1, `invalid SAB frame slot: ${String(msg.slotIndex)}`);
      ctx.runtimeState.running = false;
      return;
    }
    if (
      !Number.isInteger(msg.byteLen) ||
      msg.byteLen < 0 ||
      msg.byteLen > ctx.runtimeState.frameTransport.slotBytes
    ) {
      ctx.fatal("frame", -1, `invalid SAB frame byteLen: ${String(msg.byteLen)}`);
      ctx.runtimeState.running = false;
      return;
    }
    if (!Number.isInteger(msg.slotToken) || (msg.slotToken as number) <= 0) {
      ctx.fatal("frame", -1, `invalid SAB frame slotToken: ${String(msg.slotToken)}`);
      ctx.runtimeState.running = false;
      return;
    }
    ctx.runtimeState.pendingFrame = {
      frameSeq: msg.frameSeq,
      transport: FRAME_TRANSPORT_SAB_V1,
      slotIndex: msg.slotIndex as number,
      slotToken: msg.slotToken as number,
      byteLen: msg.byteLen,
    };
    ctx.setFrameAuditMeta(msg.frameSeq, {
      transport: FRAME_TRANSPORT_SAB_V1,
      byteLen: msg.byteLen,
      slotIndex: msg.slotIndex as number,
      slotToken: msg.slotToken as number,
    });
    ctx.emitFrameAudit("frame.received", msg.frameSeq, {
      transport: FRAME_TRANSPORT_SAB_V1,
      byteLen: msg.byteLen,
      slotIndex: msg.slotIndex as number,
      slotToken: msg.slotToken as number,
    });
  } else {
    if (!(msg.drawlist instanceof ArrayBuffer)) {
      ctx.fatal("frame", -1, "invalid transfer frame payload: missing drawlist");
      ctx.runtimeState.running = false;
      return;
    }
    if (
      !Number.isInteger(msg.byteLen) ||
      msg.byteLen < 0 ||
      msg.byteLen > msg.drawlist.byteLength
    ) {
      ctx.fatal("frame", -1, `invalid transfer frame byteLen: ${String(msg.byteLen)}`);
      ctx.runtimeState.running = false;
      return;
    }
    ctx.runtimeState.pendingFrame = {
      frameSeq: msg.frameSeq,
      transport: FRAME_TRANSPORT_TRANSFER_V1,
      buf: msg.drawlist,
      byteLen: msg.byteLen,
    };
    if (ctx.frameAudit.enabled) {
      const fp = drawlistFingerprint(new Uint8Array(msg.drawlist, 0, msg.byteLen));
      ctx.setFrameAuditMeta(msg.frameSeq, {
        transport: FRAME_TRANSPORT_TRANSFER_V1,
        byteLen: msg.byteLen,
        hash32: fp.hash32,
        prefixHash32: fp.prefixHash32,
        cmdCount: fp.cmdCount,
        totalSize: fp.totalSize,
      });
      ctx.emitFrameAudit("frame.received", msg.frameSeq, {
        transport: FRAME_TRANSPORT_TRANSFER_V1,
        ...fp,
      });
    }
  }

  ctx.tickState.idleDelayMs = ctx.tickState.tickIntervalMs;
  ctx.scheduleTickNow();
}

export function handleFrameKickMessage(
  _msg: MainToWorkerFrameKickMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  if (ctx.runtimeState.frameTransport.kind === FRAME_TRANSPORT_SAB_V1) {
    ctx.syncPendingSabFrameFromMailbox();
  }
  ctx.tickState.idleDelayMs = ctx.tickState.tickIntervalMs;
  ctx.scheduleTickNow();
}

export function handleSetConfigMessage(
  msg: MainToWorkerSetConfigMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  let rc = -1;
  try {
    rc = ctx.native.engineSetConfig(ctx.runtimeState.engineId, msg.config);
  } catch (err) {
    ctx.fatal("engineSetConfig", -1, `engine_set_config threw: ${ctx.safeDetail(err)}`);
    ctx.runtimeState.running = false;
    return;
  }
  if (rc < 0) {
    ctx.fatal("engineSetConfig", rc, "engine_set_config failed");
    ctx.runtimeState.running = false;
  }
}

export function handlePostUserEventMessage(
  msg: MainToWorkerPostUserEventMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  let rc = -1;
  try {
    rc = ctx.native.enginePostUserEvent(
      ctx.runtimeState.engineId,
      msg.tag,
      new Uint8Array(msg.payload, 0, msg.byteLen),
    );
  } catch (err) {
    ctx.fatal("enginePostUserEvent", -1, `engine_post_user_event threw: ${ctx.safeDetail(err)}`);
    ctx.runtimeState.running = false;
    return;
  }
  if (rc < 0) {
    ctx.fatal("enginePostUserEvent", rc, "engine_post_user_event failed");
    ctx.runtimeState.running = false;
  }
}

export function handleEventsAckMessage(
  msg: MainToWorkerEventsAckMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.eventState.discardBuffer === null) return;
  ctx.eventState.eventPool.push(msg.buffer);
}

export function handleGetCapsMessage(
  _msg: MainToWorkerGetCapsMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  try {
    const caps = ctx.native.engineGetCaps(ctx.runtimeState.engineId);
    ctx.postToMain({
      type: "caps",
      colorMode: caps.colorMode,
      supportsMouse: caps.supportsMouse,
      supportsBracketedPaste: caps.supportsBracketedPaste,
      supportsFocusEvents: caps.supportsFocusEvents,
      supportsOsc52: caps.supportsOsc52,
      supportsSyncUpdate: caps.supportsSyncUpdate,
      supportsScrollRegion: caps.supportsScrollRegion,
      supportsCursorShape: caps.supportsCursorShape,
      supportsOutputWaitWritable: caps.supportsOutputWaitWritable,
      supportsUnderlineStyles: caps.supportsUnderlineStyles ?? false,
      supportsColoredUnderlines: caps.supportsColoredUnderlines ?? false,
      supportsHyperlinks: caps.supportsHyperlinks ?? false,
      sgrAttrsSupported: caps.sgrAttrsSupported,
    });
  } catch (err) {
    ctx.fatal("engineGetCaps", -1, `engine_get_caps threw: ${ctx.safeDetail(err)}`);
  }
}

export function handleShutdownMessage(
  _msg: MainToWorkerShutdownMessage,
  ctx: EngineWorkerMessageContext,
): void {
  ctx.shutdownNow();
}

export function handleDebugEnableMessage(
  msg: MainToWorkerDebugEnableMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  let rc = -1;
  try {
    const nativeConfig = {
      enabled: msg.config.enabled ?? true,
      ringCapacity: msg.config.ringCapacity ?? 0,
      minSeverity: msg.config.minSeverity ?? 0,
      categoryMask: msg.config.categoryMask ?? 0xffffffff,
      captureRawEvents: msg.config.captureRawEvents ?? false,
      captureDrawlistBytes: msg.config.captureDrawlistBytes ?? false,
    };
    rc = ctx.native.engineDebugEnable(ctx.runtimeState.engineId, nativeConfig);
  } catch (err) {
    ctx.fatal("engineDebugEnable", -1, `engine_debug_enable threw: ${ctx.safeDetail(err)}`);
    return;
  }
  if (ctx.frameAudit.enabled) {
    ctx.frameAudit.emit("native.debug.enable.user", {
      rc,
      captureDrawlistBytes: msg.config.captureDrawlistBytes ?? false,
    });
  }
  ctx.frameAuditState.nativeFrameAuditEnabled = rc >= 0 && ctx.frameAudit.enabled;
  if (ctx.frameAuditState.nativeFrameAuditEnabled) {
    ctx.frameAuditState.nativeFrameAuditNextRecordId = 1n;
  }
  ctx.postToMain({ type: "debug:enableResult", result: rc });
}

export function handleDebugDisableMessage(
  _msg: MainToWorkerDebugDisableMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  let rc = -1;
  try {
    rc = ctx.native.engineDebugDisable(ctx.runtimeState.engineId);
  } catch (err) {
    ctx.fatal("engineDebugDisable", -1, `engine_debug_disable threw: ${ctx.safeDetail(err)}`);
    return;
  }
  ctx.frameAuditState.nativeFrameAuditEnabled = false;
  if (ctx.frameAudit.enabled) {
    ctx.frameAudit.emit("native.debug.disable.user", { rc });
  }
  ctx.postToMain({ type: "debug:disableResult", result: rc });
}

export function handleDebugQueryMessage(
  msg: MainToWorkerDebugQueryMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  try {
    const nativeQuery = {
      minRecordId: msg.query.minRecordId ? BigInt(msg.query.minRecordId) : undefined,
      maxRecordId: msg.query.maxRecordId ? BigInt(msg.query.maxRecordId) : undefined,
      minFrameId: msg.query.minFrameId ? BigInt(msg.query.minFrameId) : undefined,
      maxFrameId: msg.query.maxFrameId ? BigInt(msg.query.maxFrameId) : undefined,
      categoryMask: msg.query.categoryMask,
      minSeverity: msg.query.minSeverity,
      maxRecords: msg.query.maxRecords,
    };
    const requestedHeadersCap = parsePositiveInt(msg.headersCap) ?? 0;
    const headersCap = Math.min(
      DEBUG_QUERY_MAX_HEADERS_CAP,
      Math.max(DEBUG_QUERY_MIN_HEADERS_CAP, requestedHeadersCap),
    );
    const headersBuf = new ArrayBuffer(headersCap);
    const headersArr = new Uint8Array(headersBuf);
    const result = ctx.native.engineDebugQuery(ctx.runtimeState.engineId, nativeQuery, headersArr);

    const maxHeaders = Math.floor(headersCap / DEBUG_HEADER_BYTES);
    const returnedHeaders =
      Number.isInteger(result.recordsReturned) && result.recordsReturned > 0
        ? Math.min(result.recordsReturned, maxHeaders)
        : 0;
    const headersByteLen = returnedHeaders * DEBUG_HEADER_BYTES;

    ctx.postToMain(
      {
        type: "debug:queryResult",
        headers: headersBuf,
        headersByteLen,
        result: {
          recordsReturned: returnedHeaders,
          recordsAvailable: result.recordsAvailable,
          oldestRecordId: String(result.oldestRecordId),
          newestRecordId: String(result.newestRecordId),
          recordsDropped: result.recordsDropped,
        },
      },
      [headersBuf],
    );
  } catch (err) {
    ctx.fatal("engineDebugQuery", -1, `engine_debug_query threw: ${ctx.safeDetail(err)}`);
  }
}

export function handleDebugGetPayloadMessage(
  msg: MainToWorkerDebugGetPayloadMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  try {
    const payloadBuf = new ArrayBuffer(msg.payloadCap);
    const payloadArr = new Uint8Array(payloadBuf);
    const recordId = BigInt(msg.recordId);
    const bytesWritten = ctx.native.engineDebugGetPayload(
      ctx.runtimeState.engineId,
      recordId,
      payloadArr,
    );
    const payloadByteLen = bytesWritten > 0 ? Math.min(bytesWritten, msg.payloadCap) : 0;
    ctx.postToMain(
      {
        type: "debug:getPayloadResult",
        payload: payloadBuf,
        payloadByteLen,
        result: bytesWritten,
      },
      [payloadBuf],
    );
  } catch (err) {
    ctx.fatal(
      "engineDebugGetPayload",
      -1,
      `engine_debug_get_payload threw: ${ctx.safeDetail(err)}`,
    );
  }
}

export function handleDebugGetStatsMessage(
  _msg: MainToWorkerDebugGetStatsMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  try {
    const stats = ctx.native.engineDebugGetStats(ctx.runtimeState.engineId);
    ctx.postToMain({
      type: "debug:getStatsResult",
      stats: {
        totalRecords: String(stats.totalRecords),
        totalDropped: String(stats.totalDropped),
        errorCount: stats.errorCount,
        warnCount: stats.warnCount,
        currentRingUsage: stats.currentRingUsage,
        ringCapacity: stats.ringCapacity,
      },
    });
  } catch (err) {
    ctx.fatal("engineDebugGetStats", -1, `engine_debug_get_stats threw: ${ctx.safeDetail(err)}`);
  }
}

export function handleDebugExportMessage(
  msg: MainToWorkerDebugExportMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  try {
    const exportBuf = new ArrayBuffer(msg.bufferCap);
    const exportArr = new Uint8Array(exportBuf);
    const bytesWritten = ctx.native.engineDebugExport(ctx.runtimeState.engineId, exportArr);
    const bufferByteLen = bytesWritten > 0 ? Math.min(bytesWritten, msg.bufferCap) : 0;
    ctx.postToMain(
      {
        type: "debug:exportResult",
        buffer: exportBuf,
        bufferByteLen,
      },
      [exportBuf],
    );
  } catch (err) {
    ctx.fatal("engineDebugExport", -1, `engine_debug_export threw: ${ctx.safeDetail(err)}`);
  }
}

export function handleDebugResetMessage(
  _msg: MainToWorkerDebugResetMessage,
  ctx: EngineWorkerMessageContext,
): void {
  if (ctx.runtimeState.engineId === null) return;
  let rc = -1;
  try {
    rc = ctx.native.engineDebugReset(ctx.runtimeState.engineId);
  } catch (err) {
    ctx.fatal("engineDebugReset", -1, `engine_debug_reset threw: ${ctx.safeDetail(err)}`);
    return;
  }
  if (ctx.frameAudit.enabled && rc >= 0) {
    ctx.frameAuditState.nativeFrameAuditNextRecordId = 1n;
    ctx.frameAudit.emit("native.debug.reset", { rc });
  }
  ctx.postToMain({ type: "debug:resetResult", result: rc });
}

export function handlePerfSnapshotMessage(
  _msg: MainToWorkerPerfSnapshotMessage,
  ctx: EngineWorkerMessageContext,
): void {
  ctx.postToMain({ type: "perf:snapshotResult", snapshot: ctx.perfSnapshot() });
}
