import {
  FRAME_SAB_CONTROL_HEADER_WORDS,
  FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
  FRAME_SAB_CONTROL_WORDS_PER_SLOT,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_TRANSFER_V1,
  FRAME_TRANSPORT_VERSION,
  type FrameTransportConfig,
} from "../protocol.js";
import type {
  EngineWorkerRuntimeState,
  FatalHandler,
  PendingFrame,
  PendingFrameSab,
  PostToMain,
  WorkerFrameTransport,
} from "./shared.js";
import { parsePositiveInt } from "./shared.js";

const NO_RECYCLED_DRAWLISTS: readonly ArrayBuffer[] = Object.freeze([]);

type EmitFrameAudit = (
  stage: string,
  frameSeq: number,
  fields?: Readonly<Record<string, unknown>>,
) => void;
type DeleteFrameAudit = (frameSeq: number) => void;
type SetFrameAuditMeta = (frameSeq: number, patch: Readonly<Record<string, unknown>>) => void;

export function parseFrameTransportConfig(cfg: unknown): WorkerFrameTransport {
  if (typeof cfg !== "object" || cfg === null) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const wire = cfg as Partial<FrameTransportConfig>;
  if (wire.kind !== FRAME_TRANSPORT_SAB_V1) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  if (wire.version !== FRAME_TRANSPORT_VERSION) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const slotCount = parsePositiveInt(wire.slotCount);
  const slotBytes = parsePositiveInt(wire.slotBytes);
  if (slotCount === null || slotBytes === null) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  if (!(wire.control instanceof SharedArrayBuffer) || !(wire.data instanceof SharedArrayBuffer)) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const control = new Int32Array(wire.control);
  if (
    control.length <
    FRAME_SAB_CONTROL_HEADER_WORDS + slotCount * FRAME_SAB_CONTROL_WORDS_PER_SLOT
  ) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  const controlHeader = new Int32Array(wire.control, 0, FRAME_SAB_CONTROL_HEADER_WORDS);
  const states = new Int32Array(
    wire.control,
    FRAME_SAB_CONTROL_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const tokens = new Int32Array(
    wire.control,
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount) * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const data = new Uint8Array(wire.data);
  if (data.byteLength < slotCount * slotBytes) {
    return Object.freeze({ kind: FRAME_TRANSPORT_TRANSFER_V1 });
  }
  return Object.freeze({
    kind: FRAME_TRANSPORT_SAB_V1,
    slotCount,
    slotBytes,
    controlHeader,
    states,
    tokens,
    data,
  });
}

export function releaseSabSlot(
  frameTransport: WorkerFrameTransport,
  slotIndex: number,
  slotToken: number,
  expectedState: number,
): void {
  if (frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) return;
  if (slotIndex < 0 || slotIndex >= frameTransport.slotCount) return;
  if (Atomics.load(frameTransport.tokens, slotIndex) !== slotToken) return;
  Atomics.compareExchange(
    frameTransport.states,
    slotIndex,
    expectedState,
    FRAME_SAB_SLOT_STATE_FREE,
  );
}

export function releasePendingFrame(
  frameTransport: WorkerFrameTransport,
  frame: PendingFrame,
  expectedSabState: number,
): void {
  if (frame.transport === FRAME_TRANSPORT_TRANSFER_V1) return;
  releaseSabSlot(frameTransport, frame.slotIndex, frame.slotToken, expectedSabState);
}

export function postFrameStatus(
  postToMain: PostToMain,
  emitFrameAudit: EmitFrameAudit,
  deleteFrameAudit: DeleteFrameAudit,
  frameSeq: number,
  completedResult: number,
): void {
  if (!Number.isInteger(frameSeq) || frameSeq <= 0) return;
  emitFrameAudit("frame.completed", frameSeq, { completedResult });
  deleteFrameAudit(frameSeq);
  postToMain({
    type: "frameStatus",
    acceptedSeq: frameSeq,
    completedSeq: frameSeq,
    completedResult,
    recycledDrawlists: NO_RECYCLED_DRAWLISTS,
  });
}

export function postFrameAccepted(
  postToMain: PostToMain,
  emitFrameAudit: EmitFrameAudit,
  frameSeq: number,
): void {
  if (!Number.isInteger(frameSeq) || frameSeq <= 0) return;
  emitFrameAudit("frame.accepted", frameSeq);
  postToMain({
    type: "frameStatus",
    acceptedSeq: frameSeq,
    recycledDrawlists: NO_RECYCLED_DRAWLISTS,
  });
}

export function readLatestSabFrame(
  runtimeState: EngineWorkerRuntimeState,
  onInvalid: (detail: string) => void,
): PendingFrameSab | null {
  if (runtimeState.frameTransport.kind !== FRAME_TRANSPORT_SAB_V1) return null;
  const h = runtimeState.frameTransport.controlHeader;

  let stableSeq = 0;
  let slotIndex = -1;
  let byteLen = -1;
  let slotToken = 0;

  for (let attempt = 0; attempt < 4; attempt++) {
    const seqBefore = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD);
    if (seqBefore <= runtimeState.lastConsumedSabPublishedSeq) return null;
    slotIndex = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD);
    byteLen = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD);
    slotToken = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD);
    const seqAfter = Atomics.load(h, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD);
    if (seqBefore === seqAfter) {
      stableSeq = seqAfter;
      break;
    }
  }

  if (stableSeq <= runtimeState.lastConsumedSabPublishedSeq) return null;
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= runtimeState.frameTransport.slotCount
  ) {
    onInvalid(`invalid SAB publish slot index: ${String(slotIndex)}`);
    return null;
  }
  if (
    !Number.isInteger(byteLen) ||
    byteLen < 0 ||
    byteLen > runtimeState.frameTransport.slotBytes
  ) {
    onInvalid(`invalid SAB publish byteLen: ${String(byteLen)}`);
    return null;
  }
  if (!Number.isInteger(slotToken) || slotToken <= 0) {
    onInvalid(`invalid SAB publish slotToken: ${String(slotToken)}`);
    return null;
  }

  runtimeState.lastConsumedSabPublishedSeq = stableSeq;
  return {
    frameSeq: stableSeq,
    transport: FRAME_TRANSPORT_SAB_V1,
    slotIndex,
    slotToken,
    byteLen,
  };
}

export function syncPendingSabFrameFromMailbox(
  args: Readonly<{
    runtimeState: EngineWorkerRuntimeState;
    setFrameAuditMeta: SetFrameAuditMeta;
    emitFrameAudit: EmitFrameAudit;
    deleteFrameAudit: DeleteFrameAudit;
    fatal: FatalHandler;
  }>,
): void {
  const latest = readLatestSabFrame(args.runtimeState, (detail) => {
    args.fatal("frame", -1, detail);
    args.runtimeState.running = false;
  });
  if (latest === null) return;
  if (args.runtimeState.pendingFrame !== null) {
    args.emitFrameAudit("frame.overwritten", args.runtimeState.pendingFrame.frameSeq, {
      reason: "mailbox-latest-wins",
    });
    args.deleteFrameAudit(args.runtimeState.pendingFrame.frameSeq);
    releasePendingFrame(
      args.runtimeState.frameTransport,
      args.runtimeState.pendingFrame,
      FRAME_SAB_SLOT_STATE_READY,
    );
  }
  args.runtimeState.pendingFrame = latest;
  args.setFrameAuditMeta(latest.frameSeq, {
    transport: latest.transport,
    byteLen: latest.byteLen,
    slotIndex: latest.slotIndex,
    slotToken: latest.slotToken,
  });
  args.emitFrameAudit("frame.mailbox.latest", latest.frameSeq, {
    slotIndex: latest.slotIndex,
    slotToken: latest.slotToken,
    byteLen: latest.byteLen,
  });
}
