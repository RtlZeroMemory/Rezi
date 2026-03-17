import { FRAME_ACCEPTED_ACK_MARKER, ZrUiError } from "@rezi-ui/core";
import type { FrameAuditLogger } from "../../frameAudit.js";
import { drawlistFingerprint, maybeDumpDrawlistBytes } from "../../frameAudit.js";
import type { Deferred } from "./shared.js";
import { deferred } from "./shared.js";

export type FrameAuditEntry = {
  frameSeq: number;
  submitAtMs: number;
  submitPath: "requestFrame" | "beginFrame";
  transport: string;
  byteLen: number;
  hash32: string;
  prefixHash32: string;
  cmdCount: number | null;
  totalSize: number | null;
  head16: string;
  tail16: string;
  slotIndex?: number;
  slotToken?: number;
  acceptedLogged?: boolean;
};

export type NodeBackendFrameTrackingState = Readonly<{
  frameAcceptedWaiters: Map<number, Deferred<void>>;
  frameCompletionWaiters: Map<number, Deferred<void>>;
  frameAuditBySeq: Map<number, FrameAuditEntry>;
}>;

export function createNodeBackendFrameTrackingState(): NodeBackendFrameTrackingState {
  return {
    frameAcceptedWaiters: new Map<number, Deferred<void>>(),
    frameCompletionWaiters: new Map<number, Deferred<void>>(),
    frameAuditBySeq: new Map<number, FrameAuditEntry>(),
  };
}

export function rejectFrameWaiters(
  state: NodeBackendFrameTrackingState,
  frameAudit: FrameAuditLogger,
  err: Error,
): void {
  for (const waiter of state.frameAcceptedWaiters.values()) {
    waiter.reject(err);
  }
  state.frameAcceptedWaiters.clear();
  for (const waiter of state.frameCompletionWaiters.values()) {
    waiter.reject(err);
  }
  state.frameCompletionWaiters.clear();
  if (frameAudit.enabled) {
    for (const [seq, meta] of state.frameAuditBySeq.entries()) {
      frameAudit.emit("frame.aborted", {
        reason: err.message,
        ageMs: Math.max(0, Date.now() - meta.submitAtMs),
        ...meta,
      });
    }
    state.frameAuditBySeq.clear();
  }
}

export function registerFrameAudit(
  state: NodeBackendFrameTrackingState,
  frameAudit: FrameAuditLogger,
  frameSeq: number,
  submitPath: "requestFrame" | "beginFrame",
  transport: string,
  bytes: Uint8Array,
  slotIndex?: number,
  slotToken?: number,
): void {
  if (!frameAudit.enabled) return;
  const fp = drawlistFingerprint(bytes);
  const meta: FrameAuditEntry = {
    frameSeq,
    submitAtMs: Date.now(),
    submitPath,
    transport,
    byteLen: fp.byteLen,
    hash32: fp.hash32,
    prefixHash32: fp.prefixHash32,
    cmdCount: fp.cmdCount,
    totalSize: fp.totalSize,
    head16: fp.head16,
    tail16: fp.tail16,
    ...(slotIndex === undefined ? {} : { slotIndex }),
    ...(slotToken === undefined ? {} : { slotToken }),
  };
  state.frameAuditBySeq.set(frameSeq, meta);
  maybeDumpDrawlistBytes("backend", submitPath, frameSeq, bytes);
  frameAudit.emit("frame.submitted", meta);
}

export function resolveAcceptedFramesUpTo(
  state: NodeBackendFrameTrackingState,
  frameAudit: FrameAuditLogger,
  acceptedSeq: number,
): void {
  if (!Number.isInteger(acceptedSeq) || acceptedSeq <= 0) return;
  if (frameAudit.enabled) {
    for (const [seq, meta] of state.frameAuditBySeq.entries()) {
      if (seq > acceptedSeq) continue;
      if (meta.acceptedLogged === true) continue;
      frameAudit.emit("frame.accepted", {
        acceptedSeq,
        ageMs: Math.max(0, Date.now() - meta.submitAtMs),
        ...meta,
      });
      meta.acceptedLogged = true;
    }
  }
  for (const [seq, waiter] of state.frameAcceptedWaiters.entries()) {
    if (seq > acceptedSeq) continue;
    state.frameAcceptedWaiters.delete(seq);
    waiter.resolve(undefined);
  }
}

export function resolveCoalescedCompletionFramesUpTo(
  state: NodeBackendFrameTrackingState,
  frameAudit: FrameAuditLogger,
  acceptedSeq: number,
): void {
  if (!Number.isInteger(acceptedSeq) || acceptedSeq <= 0) return;
  if (frameAudit.enabled) {
    for (const [seq, meta] of state.frameAuditBySeq.entries()) {
      if (seq >= acceptedSeq) continue;
      frameAudit.emit("frame.coalesced", {
        acceptedSeq,
        ageMs: Math.max(0, Date.now() - meta.submitAtMs),
        ...meta,
      });
      state.frameAuditBySeq.delete(seq);
    }
  }
  for (const [seq, waiter] of state.frameCompletionWaiters.entries()) {
    if (seq >= acceptedSeq) continue;
    state.frameCompletionWaiters.delete(seq);
    waiter.resolve(undefined);
  }
}

export function settleCompletedFrame(
  state: NodeBackendFrameTrackingState,
  frameAudit: FrameAuditLogger,
  frameSeq: number,
  completedResult: number,
): void {
  if (frameAudit.enabled) {
    const meta = state.frameAuditBySeq.get(frameSeq);
    frameAudit.emit("frame.completed", {
      completedResult,
      ageMs: meta ? Math.max(0, Date.now() - meta.submitAtMs) : null,
      ...(meta ?? {}),
    });
    state.frameAuditBySeq.delete(frameSeq);
  }

  const waiter = state.frameCompletionWaiters.get(frameSeq);
  if (waiter === undefined) return;
  state.frameCompletionWaiters.delete(frameSeq);
  if (completedResult < 0) {
    waiter.reject(
      new ZrUiError(
        "ZRUI_BACKEND_ERROR",
        `engine frame completion failed: seq=${String(frameSeq)} code=${String(completedResult)}`,
      ),
    );
    return;
  }
  waiter.resolve(undefined);
}

export function reserveFramePromise(
  state: NodeBackendFrameTrackingState,
  frameSeq: number,
): Promise<void> & Partial<Record<typeof FRAME_ACCEPTED_ACK_MARKER, Promise<void>>> {
  const frameAcceptedDef = deferred<void>();
  state.frameAcceptedWaiters.set(frameSeq, frameAcceptedDef);
  const frameCompletionDef = deferred<void>();
  state.frameCompletionWaiters.set(frameSeq, frameCompletionDef);
  const framePromise = frameCompletionDef.promise as Promise<void> &
    Partial<Record<typeof FRAME_ACCEPTED_ACK_MARKER, Promise<void>>>;
  Object.defineProperty(framePromise, FRAME_ACCEPTED_ACK_MARKER, {
    value: frameAcceptedDef.promise,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return framePromise;
}

export function releaseFrameReservation(
  state: NodeBackendFrameTrackingState,
  frameAudit: FrameAuditLogger,
  frameSeq: number,
): void {
  state.frameAcceptedWaiters.delete(frameSeq);
  state.frameCompletionWaiters.delete(frameSeq);
  if (frameAudit.enabled) state.frameAuditBySeq.delete(frameSeq);
}
