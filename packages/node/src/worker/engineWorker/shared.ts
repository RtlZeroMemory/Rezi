import type { WorkerToMainMessage } from "../protocol.js";
import type { FRAME_TRANSPORT_SAB_V1, FRAME_TRANSPORT_TRANSFER_V1 } from "../protocol.js";

export type PerfSample = { phase: string; durationMs: number };

export type TerminalCapsNative = Readonly<{
  colorMode: number;
  supportsMouse: boolean;
  supportsBracketedPaste: boolean;
  supportsFocusEvents: boolean;
  supportsOsc52: boolean;
  supportsSyncUpdate: boolean;
  supportsScrollRegion: boolean;
  supportsCursorShape: boolean;
  supportsOutputWaitWritable: boolean;
  supportsUnderlineStyles?: boolean;
  supportsColoredUnderlines?: boolean;
  supportsHyperlinks?: boolean;
  sgrAttrsSupported: number;
}>;

export type DebugStatsNative = Readonly<{
  totalRecords: bigint;
  totalDropped: bigint;
  errorCount: number;
  warnCount: number;
  currentRingUsage: number;
  ringCapacity: number;
}>;

export type DebugQueryResultNative = Readonly<{
  recordsReturned: number;
  recordsAvailable: number;
  oldestRecordId: bigint;
  newestRecordId: bigint;
  recordsDropped: number;
}>;

export type NativeApi = Readonly<{
  engineCreate: (config?: object | null) => number;
  engineDestroy: (engineId: number) => void;
  engineSubmitDrawlist: (engineId: number, drawlist: Uint8Array) => number;
  enginePresent: (engineId: number) => number;
  enginePollEvents: (engineId: number, timeoutMs: number, out: Uint8Array) => number;
  enginePostUserEvent: (engineId: number, tag: number, payload: Uint8Array) => number;
  engineSetConfig: (engineId: number, cfg?: object | null) => number;
  engineGetCaps: (engineId: number) => TerminalCapsNative;
  engineDebugEnable: (engineId: number, config?: object | null) => number;
  engineDebugDisable: (engineId: number) => number;
  engineDebugQuery: (
    engineId: number,
    query: object | null,
    outHeaders: Uint8Array,
  ) => DebugQueryResultNative;
  engineDebugGetPayload: (engineId: number, recordId: bigint, outPayload: Uint8Array) => number;
  engineDebugGetStats: (engineId: number) => DebugStatsNative;
  engineDebugExport: (engineId: number, outBuf: Uint8Array) => number;
  engineDebugReset: (engineId: number) => number;
}>;

export type PendingFrameTransfer = Readonly<{
  frameSeq: number;
  transport: typeof FRAME_TRANSPORT_TRANSFER_V1;
  buf: ArrayBuffer;
  byteLen: number;
}>;

export type PendingFrameSab = Readonly<{
  frameSeq: number;
  transport: typeof FRAME_TRANSPORT_SAB_V1;
  slotIndex: number;
  slotToken: number;
  byteLen: number;
}>;

export type PendingFrame = PendingFrameTransfer | PendingFrameSab;

export type WorkerFrameTransport =
  | Readonly<{ kind: typeof FRAME_TRANSPORT_TRANSFER_V1 }>
  | Readonly<{
      kind: typeof FRAME_TRANSPORT_SAB_V1;
      slotCount: number;
      slotBytes: number;
      controlHeader: Int32Array;
      states: Int32Array;
      tokens: Int32Array;
      data: Uint8Array;
    }>;

export type WorkerData = Readonly<{
  nativeShimModule?: string;
}>;

export type FrameAuditMeta = {
  frameSeq: number;
  enqueuedAtMs: number;
  transport: typeof FRAME_TRANSPORT_TRANSFER_V1 | typeof FRAME_TRANSPORT_SAB_V1;
  byteLen: number;
  slotIndex?: number;
  slotToken?: number;
  hash32?: string;
  prefixHash32?: string;
  cmdCount?: number | null;
  totalSize?: number | null;
};

export type EngineWorkerRuntimeState = {
  engineId: number | null;
  engineBootSucceeded: boolean;
  running: boolean;
  haveSubmittedDrawlist: boolean;
  pendingFrame: PendingFrame | null;
  lastConsumedSabPublishedSeq: number;
  frameTransport: WorkerFrameTransport;
};

export type EngineWorkerFrameAuditState = {
  frameAuditBySeq: Map<number, FrameAuditMeta>;
  nativeFrameAuditEnabled: boolean;
  nativeFrameAuditNextRecordId: bigint;
};

export type EngineWorkerEventState = {
  eventPool: ArrayBuffer[];
  discardBuffer: ArrayBuffer | null;
  droppedSinceLast: number;
};

export type EngineWorkerTickState = {
  tickTimer: NodeJS.Timeout | null;
  tickImmediate: NodeJS.Immediate | null;
  tickIntervalMs: number;
  idleDelayMs: number;
  maxIdleDelayMs: number;
  sabWakeArmed: boolean;
  sabWakeEpoch: number;
};

export type PostToMain = (msg: WorkerToMainMessage, transfer?: readonly ArrayBuffer[]) => void;

export type FatalHandler = (where: string, code: number, detail: string) => void;

export function safeDetail(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export function parsePositiveInt(n: unknown): number | null {
  if (typeof n !== "number") return null;
  if (!Number.isFinite(n)) return null;
  if (!Number.isInteger(n)) return null;
  if (n <= 0) return null;
  return n;
}
