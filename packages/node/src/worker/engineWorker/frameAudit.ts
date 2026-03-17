import type { FrameAuditLogger } from "../../frameAudit.js";
import {
  FRAME_AUDIT_NATIVE_ENABLED,
  FRAME_AUDIT_NATIVE_RING_BYTES,
  ZR_DEBUG_CAT_DRAWLIST,
  ZR_DEBUG_CAT_FRAME,
  ZR_DEBUG_CAT_PERF,
  ZR_DEBUG_CODE_DRAWLIST_CMD,
  ZR_DEBUG_CODE_DRAWLIST_EXECUTE,
  ZR_DEBUG_CODE_DRAWLIST_VALIDATE,
  ZR_DEBUG_CODE_FRAME_BEGIN,
  ZR_DEBUG_CODE_FRAME_PRESENT,
  ZR_DEBUG_CODE_FRAME_RESIZE,
  ZR_DEBUG_CODE_FRAME_SUBMIT,
  ZR_DEBUG_CODE_PERF_DIFF_PATH,
  ZR_DEBUG_CODE_PERF_TIMING,
  drawlistFingerprint,
} from "../../frameAudit.js";
import type {
  DebugQueryResultNative,
  EngineWorkerFrameAuditState,
  FrameAuditMeta,
  NativeApi,
} from "./shared.js";

export const DEBUG_HEADER_BYTES = 40;
export const DEBUG_QUERY_MIN_HEADERS_CAP = DEBUG_HEADER_BYTES;
export const DEBUG_QUERY_MAX_HEADERS_CAP = 1 << 20;
const DEBUG_DRAWLIST_RECORD_BYTES = 48;
const DEBUG_FRAME_RECORD_BYTES = 56;
const DEBUG_PERF_RECORD_BYTES = 24;
const DEBUG_DIFF_PATH_RECORD_BYTES = 64;
const NATIVE_FRAME_AUDIT_CATEGORY_MASK =
  (1 << ZR_DEBUG_CAT_DRAWLIST) | (1 << ZR_DEBUG_CAT_FRAME) | (1 << ZR_DEBUG_CAT_PERF);

function u64FromView(v: DataView, offset: number): bigint {
  const lo = BigInt(v.getUint32(offset, true));
  const hi = BigInt(v.getUint32(offset + 4, true));
  return (hi << 32n) | lo;
}

function nativeFrameCodeName(code: number): string {
  if (code === ZR_DEBUG_CODE_FRAME_BEGIN) return "frame.begin";
  if (code === ZR_DEBUG_CODE_FRAME_SUBMIT) return "frame.submit";
  if (code === ZR_DEBUG_CODE_FRAME_PRESENT) return "frame.present";
  if (code === ZR_DEBUG_CODE_FRAME_RESIZE) return "frame.resize";
  return "frame.unknown";
}

function nativePerfPhaseName(phase: number): string {
  if (phase === 0) return "poll";
  if (phase === 1) return "submit";
  if (phase === 2) return "present";
  return "unknown";
}

export function setFrameAuditMeta(
  frameAudit: FrameAuditLogger,
  state: EngineWorkerFrameAuditState,
  frameSeq: number,
  patch: Readonly<Partial<Omit<FrameAuditMeta, "frameSeq" | "enqueuedAtMs">>>,
): void {
  if (!frameAudit.enabled) return;
  const prev = state.frameAuditBySeq.get(frameSeq);
  const next: FrameAuditMeta = {
    frameSeq,
    enqueuedAtMs: prev?.enqueuedAtMs ?? Date.now(),
    transport: prev?.transport ?? "transfer-v1",
    byteLen: prev?.byteLen ?? 0,
    ...(prev ?? {}),
    ...patch,
  };
  state.frameAuditBySeq.set(frameSeq, next);
}

export function emitFrameAudit(
  frameAudit: FrameAuditLogger,
  state: EngineWorkerFrameAuditState,
  stage: string,
  frameSeq: number,
  fields: Readonly<Record<string, unknown>> = {},
): void {
  if (!frameAudit.enabled) return;
  const meta = state.frameAuditBySeq.get(frameSeq);
  frameAudit.emit(stage, {
    frameSeq,
    ageMs: meta ? Math.max(0, Date.now() - meta.enqueuedAtMs) : null,
    ...(meta ?? {}),
    ...fields,
  });
}

export function deleteFrameAudit(
  frameAudit: FrameAuditLogger,
  state: EngineWorkerFrameAuditState,
  frameSeq: number,
): void {
  if (!frameAudit.enabled) return;
  state.frameAuditBySeq.delete(frameSeq);
}

export function maybeEnableNativeFrameAudit(
  args: Readonly<{
    frameAudit: FrameAuditLogger;
    state: EngineWorkerFrameAuditState;
    native: NativeApi;
    engineId: number | null;
    safeDetail: (err: unknown) => string;
  }>,
): void {
  if (!args.frameAudit.enabled) return;
  if (!FRAME_AUDIT_NATIVE_ENABLED) return;
  if (args.engineId === null) return;

  let rc = -1;
  try {
    rc = args.native.engineDebugEnable(args.engineId, {
      enabled: true,
      ringCapacity: FRAME_AUDIT_NATIVE_RING_BYTES,
      minSeverity: 0,
      categoryMask: NATIVE_FRAME_AUDIT_CATEGORY_MASK,
      captureRawEvents: false,
      captureDrawlistBytes: true,
    });
  } catch (err) {
    args.frameAudit.emit("native.debug.enable_error", { detail: args.safeDetail(err) });
    args.state.nativeFrameAuditEnabled = false;
    return;
  }

  args.state.nativeFrameAuditEnabled = rc >= 0;
  args.state.nativeFrameAuditNextRecordId = 1n;
  args.frameAudit.emit("native.debug.enable", {
    rc,
    enabled: args.state.nativeFrameAuditEnabled,
    ringCapacity: FRAME_AUDIT_NATIVE_RING_BYTES,
  });
}

export function drainNativeFrameAudit(
  args: Readonly<{
    frameAudit: FrameAuditLogger;
    state: EngineWorkerFrameAuditState;
    native: NativeApi;
    engineId: number | null;
    reason: string;
    safeDetail: (err: unknown) => string;
  }>,
): void {
  if (!args.frameAudit.enabled || !args.state.nativeFrameAuditEnabled) return;
  if (args.engineId === null) return;

  const headersCap = DEBUG_HEADER_BYTES * 64;
  const headersBuf = new Uint8Array(headersCap);
  const tryReadDebugPayload = (
    recordId: bigint,
    code: number,
    expectedBytes: number,
    opts: Readonly<{ allowPartialOnShortRead?: boolean }> = {},
  ): Uint8Array | null => {
    if (args.engineId === null) return null;
    const payload = new Uint8Array(expectedBytes);
    let wrote = 0;
    try {
      wrote = args.native.engineDebugGetPayload(args.engineId, recordId, payload);
    } catch (err) {
      args.frameAudit.emit("native.debug.payload_error", {
        reason: args.reason,
        recordId: recordId.toString(),
        code,
        expectedBytes,
        detail: args.safeDetail(err),
      });
      return null;
    }
    if (wrote <= 0) {
      args.frameAudit.emit("native.debug.payload_error", {
        reason: args.reason,
        recordId: recordId.toString(),
        code,
        expectedBytes,
        wrote,
        detail: "payload read returned non-positive length",
      });
      return null;
    }
    if (wrote < expectedBytes) {
      args.frameAudit.emit("native.debug.payload_error", {
        reason: args.reason,
        recordId: recordId.toString(),
        code,
        expectedBytes,
        wrote,
        detail: "short payload read",
      });
      if (opts.allowPartialOnShortRead !== true) {
        return null;
      }
    }
    return payload.subarray(0, Math.min(wrote, payload.byteLength));
  };

  for (let iter = 0; iter < 8; iter++) {
    let result: DebugQueryResultNative;
    try {
      result = args.native.engineDebugQuery(
        args.engineId,
        {
          minRecordId: args.state.nativeFrameAuditNextRecordId,
          categoryMask: NATIVE_FRAME_AUDIT_CATEGORY_MASK,
          minSeverity: 0,
          maxRecords: Math.floor(headersCap / DEBUG_HEADER_BYTES),
        },
        headersBuf,
      );
    } catch (err) {
      args.frameAudit.emit("native.debug.query_error", {
        reason: args.reason,
        detail: args.safeDetail(err),
      });
      return;
    }

    const recordsReturned =
      Number.isInteger(result.recordsReturned) && result.recordsReturned > 0
        ? Math.min(result.recordsReturned, Math.floor(headersCap / DEBUG_HEADER_BYTES))
        : 0;
    if (recordsReturned <= 0) return;

    let advanced = false;
    for (let i = 0; i < recordsReturned; i++) {
      const off = i * DEBUG_HEADER_BYTES;
      const dv = new DataView(headersBuf.buffer, headersBuf.byteOffset + off, DEBUG_HEADER_BYTES);
      const recordId = u64FromView(dv, 0);
      const timestampUs = u64FromView(dv, 8);
      const frameId = u64FromView(dv, 16);
      const category = dv.getUint32(24, true);
      const severity = dv.getUint32(28, true);
      const code = dv.getUint32(32, true);
      const payloadSize = dv.getUint32(36, true);
      if (recordId < args.state.nativeFrameAuditNextRecordId) {
        continue;
      }
      if (recordId === 0n && frameId === 0n && category === 0 && code === 0 && payloadSize === 0) {
        continue;
      }
      advanced = true;
      args.state.nativeFrameAuditNextRecordId = recordId + 1n;

      args.frameAudit.emit("native.debug.header", {
        reason: args.reason,
        recordId: recordId.toString(),
        frameId: frameId.toString(),
        timestampUs: timestampUs.toString(),
        category,
        severity,
        code,
        payloadSize,
      });

      if (code === ZR_DEBUG_CODE_DRAWLIST_CMD && payloadSize > 0) {
        const cap = Math.min(Math.max(payloadSize, 1), 4096);
        const view = tryReadDebugPayload(recordId, code, cap, {
          allowPartialOnShortRead: true,
        });
        if (view === null) continue;
        const fp = drawlistFingerprint(view);
        args.frameAudit.emit("native.drawlist.payload", {
          reason: args.reason,
          recordId: recordId.toString(),
          frameId: frameId.toString(),
          payloadSize: view.byteLength,
          hash32: fp.hash32,
          prefixHash32: fp.prefixHash32,
          head16: fp.head16,
          tail16: fp.tail16,
        });
        continue;
      }

      if (
        (code === ZR_DEBUG_CODE_DRAWLIST_VALIDATE || code === ZR_DEBUG_CODE_DRAWLIST_EXECUTE) &&
        payloadSize >= DEBUG_DRAWLIST_RECORD_BYTES
      ) {
        const payload = tryReadDebugPayload(recordId, code, DEBUG_DRAWLIST_RECORD_BYTES);
        if (payload === null) continue;
        const dvPayload = new DataView(
          payload.buffer,
          payload.byteOffset,
          DEBUG_DRAWLIST_RECORD_BYTES,
        );
        args.frameAudit.emit("native.drawlist.summary", {
          reason: args.reason,
          recordId: recordId.toString(),
          frameId: u64FromView(dvPayload, 0).toString(),
          totalBytes: dvPayload.getUint32(8, true),
          cmdCount: dvPayload.getUint32(12, true),
          version: dvPayload.getUint32(16, true),
          validationResult: dvPayload.getInt32(20, true),
          executionResult: dvPayload.getInt32(24, true),
          clipStackMaxDepth: dvPayload.getUint32(28, true),
          textRuns: dvPayload.getUint32(32, true),
          fillRects: dvPayload.getUint32(36, true),
        });
        continue;
      }

      if (
        (code === ZR_DEBUG_CODE_FRAME_BEGIN ||
          code === ZR_DEBUG_CODE_FRAME_SUBMIT ||
          code === ZR_DEBUG_CODE_FRAME_PRESENT ||
          code === ZR_DEBUG_CODE_FRAME_RESIZE) &&
        payloadSize >= DEBUG_FRAME_RECORD_BYTES
      ) {
        const payload = tryReadDebugPayload(recordId, code, DEBUG_FRAME_RECORD_BYTES);
        if (payload === null) continue;
        const dvPayload = new DataView(
          payload.buffer,
          payload.byteOffset,
          DEBUG_FRAME_RECORD_BYTES,
        );
        args.frameAudit.emit("native.frame.summary", {
          reason: args.reason,
          recordId: recordId.toString(),
          frameId: u64FromView(dvPayload, 0).toString(),
          code,
          codeName: nativeFrameCodeName(code),
          cols: dvPayload.getUint32(8, true),
          rows: dvPayload.getUint32(12, true),
          drawlistBytes: dvPayload.getUint32(16, true),
          drawlistCmds: dvPayload.getUint32(20, true),
          diffBytesEmitted: dvPayload.getUint32(24, true),
          dirtyLines: dvPayload.getUint32(28, true),
          dirtyCells: dvPayload.getUint32(32, true),
          damageRects: dvPayload.getUint32(36, true),
          usDrawlist: dvPayload.getUint32(40, true),
          usDiff: dvPayload.getUint32(44, true),
          usWrite: dvPayload.getUint32(48, true),
        });
        continue;
      }

      if (code === ZR_DEBUG_CODE_PERF_TIMING && payloadSize >= DEBUG_PERF_RECORD_BYTES) {
        const payload = tryReadDebugPayload(recordId, code, DEBUG_PERF_RECORD_BYTES);
        if (payload === null) continue;
        const dvPayload = new DataView(payload.buffer, payload.byteOffset, DEBUG_PERF_RECORD_BYTES);
        const phase = dvPayload.getUint32(8, true);
        args.frameAudit.emit("native.perf.timing", {
          reason: args.reason,
          recordId: recordId.toString(),
          frameId: u64FromView(dvPayload, 0).toString(),
          phase,
          phaseName: nativePerfPhaseName(phase),
          usElapsed: dvPayload.getUint32(12, true),
          bytesProcessed: dvPayload.getUint32(16, true),
        });
        continue;
      }

      if (code === ZR_DEBUG_CODE_PERF_DIFF_PATH && payloadSize >= DEBUG_DIFF_PATH_RECORD_BYTES) {
        const payload = tryReadDebugPayload(recordId, code, DEBUG_DIFF_PATH_RECORD_BYTES);
        if (payload === null) continue;
        const dvPayload = new DataView(
          payload.buffer,
          payload.byteOffset,
          DEBUG_DIFF_PATH_RECORD_BYTES,
        );
        args.frameAudit.emit("native.perf.diffPath", {
          reason: args.reason,
          recordId: recordId.toString(),
          frameId: u64FromView(dvPayload, 0).toString(),
          sweepFramesTotal: u64FromView(dvPayload, 8).toString(),
          damageFramesTotal: u64FromView(dvPayload, 16).toString(),
          scrollAttemptsTotal: u64FromView(dvPayload, 24).toString(),
          scrollHitsTotal: u64FromView(dvPayload, 32).toString(),
          collisionGuardHitsTotal: u64FromView(dvPayload, 40).toString(),
          pathSweepUsed: dvPayload.getUint8(48),
          pathDamageUsed: dvPayload.getUint8(49),
          scrollOptAttempted: dvPayload.getUint8(50),
          scrollOptHit: dvPayload.getUint8(51),
          collisionGuardHitsLast: dvPayload.getUint32(52, true),
        });
      }
    }
    if (!advanced) return;
  }
}
