/**
 * Node runtime worker protocol (LOCKED).
 * @see docs/backend/worker-model.md
 */

export const EVENT_POOL_SIZE = 2 as const;
export const MAX_POLL_DRAIN_ITERS = 8 as const;
export const FRAME_TRANSPORT_VERSION = 3 as const;
export const FRAME_TRANSPORT_TRANSFER_V1 = "transfer-v1" as const;
export const FRAME_TRANSPORT_SAB_V1 = "sab-v1" as const;
export const FRAME_SAB_CONTROL_HEADER_WORDS = 8 as const;
export const FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD = 0 as const;
export const FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD = 1 as const;
export const FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD = 2 as const;
export const FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD = 3 as const;
export const FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD = 4 as const;
export const FRAME_SAB_CONTROL_WORDS_PER_SLOT = 2 as const;
export const FRAME_SAB_CONTROL_STATE_WORD = 0 as const;
export const FRAME_SAB_CONTROL_TOKEN_WORD = 1 as const;
export const FRAME_SAB_SLOT_STATE_FREE = 0 as const;
export const FRAME_SAB_SLOT_STATE_WRITING = 1 as const;
export const FRAME_SAB_SLOT_STATE_READY = 2 as const;
export const FRAME_SAB_SLOT_STATE_IN_USE = 3 as const;

export type FrameTransportTransferConfig = Readonly<{
  kind: typeof FRAME_TRANSPORT_TRANSFER_V1;
  version: typeof FRAME_TRANSPORT_VERSION;
}>;

export type FrameTransportSabConfig = Readonly<{
  kind: typeof FRAME_TRANSPORT_SAB_V1;
  version: typeof FRAME_TRANSPORT_VERSION;
  slotCount: number;
  slotBytes: number;
  control: SharedArrayBuffer;
  data: SharedArrayBuffer;
}>;

export type FrameTransportConfig = FrameTransportTransferConfig | FrameTransportSabConfig;

/**
 * Engine create config as sent over the main<->worker protocol.
 *
 * Notes:
 * - The worker strips Node-only keys (maxEventBytes, fpsCap) before passing the
 *   remaining object to the native addon.
 * - `maxEventBytes` is a Node runtime cap used for the worker-owned event pool.
 */
export type EngineCreateConfig = Readonly<{
  maxEventBytes: number;
  fpsCap?: number;
  frameTransport?: FrameTransportConfig;
  [k: string]: unknown;
}>;

export type EngineRuntimeConfig = Readonly<{
  [k: string]: unknown;
}>;

// =============================================================================
// Main -> Worker (LOCKED)
// =============================================================================

export type MainToWorkerInitMessage = Readonly<{
  type: "init";
  config: EngineCreateConfig;
}>;

export type MainToWorkerFrameMessage = Readonly<{
  type: "frame";
  frameSeq: number;
  byteLen: number;
  transport?: typeof FRAME_TRANSPORT_TRANSFER_V1 | typeof FRAME_TRANSPORT_SAB_V1;
  drawlist?: ArrayBuffer;
  slotIndex?: number;
  slotToken?: number;
}>;

export type MainToWorkerFrameKickMessage = Readonly<{
  type: "frameKick";
  frameSeq: number;
}>;

export type MainToWorkerSetConfigMessage = Readonly<{
  type: "setConfig";
  config: EngineRuntimeConfig;
}>;

export type MainToWorkerPostUserEventMessage = Readonly<{
  type: "postUserEvent";
  tag: number;
  payload: ArrayBuffer;
  byteLen: number;
}>;

export type MainToWorkerEventsAckMessage = Readonly<{
  type: "eventsAck";
  buffer: ArrayBuffer;
}>;

export type MainToWorkerShutdownMessage = Readonly<{
  type: "shutdown";
}>;

export type MainToWorkerGetCapsMessage = Readonly<{
  type: "getCaps";
}>;

export type MainToWorkerCommitScrollbackMessage = Readonly<{
  type: "commitScrollback";
  bytes: ArrayBuffer;
  byteLen: number;
  rows: number;
}>;

// =============================================================================
// Debug Protocol Messages (Main -> Worker)
// =============================================================================

export type DebugConfigWire = Readonly<{
  enabled?: boolean;
  ringCapacity?: number;
  minSeverity?: number;
  categoryMask?: number;
  captureRawEvents?: boolean;
  captureDrawlistBytes?: boolean;
}>;

export type DebugQueryWire = Readonly<{
  minRecordId?: string; // bigint as string
  maxRecordId?: string;
  minFrameId?: string;
  maxFrameId?: string;
  categoryMask?: number;
  minSeverity?: number;
  maxRecords?: number;
}>;

export type MainToWorkerDebugEnableMessage = Readonly<{
  type: "debug:enable";
  config: DebugConfigWire;
}>;

export type MainToWorkerDebugDisableMessage = Readonly<{
  type: "debug:disable";
}>;

export type MainToWorkerDebugQueryMessage = Readonly<{
  type: "debug:query";
  query: DebugQueryWire;
  headersCap: number;
}>;

export type MainToWorkerDebugGetPayloadMessage = Readonly<{
  type: "debug:getPayload";
  recordId: string; // bigint as string
  payloadCap: number;
}>;

export type MainToWorkerDebugGetStatsMessage = Readonly<{
  type: "debug:getStats";
}>;

export type MainToWorkerDebugExportMessage = Readonly<{
  type: "debug:export";
  bufferCap: number;
}>;

export type MainToWorkerDebugResetMessage = Readonly<{
  type: "debug:reset";
}>;

// =============================================================================
// Perf Protocol Messages (Main -> Worker)
// =============================================================================

export type MainToWorkerPerfSnapshotMessage = Readonly<{
  type: "perf:snapshot";
}>;

export type MainToWorkerMessage =
  | MainToWorkerInitMessage
  | MainToWorkerFrameMessage
  | MainToWorkerFrameKickMessage
  | MainToWorkerSetConfigMessage
  | MainToWorkerPostUserEventMessage
  | MainToWorkerEventsAckMessage
  | MainToWorkerShutdownMessage
  | MainToWorkerGetCapsMessage
  | MainToWorkerCommitScrollbackMessage
  | MainToWorkerDebugEnableMessage
  | MainToWorkerDebugDisableMessage
  | MainToWorkerDebugQueryMessage
  | MainToWorkerDebugGetPayloadMessage
  | MainToWorkerDebugGetStatsMessage
  | MainToWorkerDebugExportMessage
  | MainToWorkerDebugResetMessage
  | MainToWorkerPerfSnapshotMessage;

// =============================================================================
// Worker -> Main (LOCKED)
// =============================================================================

export type WorkerToMainReadyMessage = Readonly<{
  type: "ready";
  engineId: number;
}>;

export type WorkerToMainEventsMessage = Readonly<{
  type: "events";
  batch: ArrayBuffer;
  byteLen: number;
  droppedSinceLast: number;
}>;

export type WorkerToMainFrameStatusMessage = Readonly<{
  type: "frameStatus";
  acceptedSeq: number;
  completedSeq?: number;
  completedResult?: number;
  recycledDrawlists: readonly ArrayBuffer[];
}>;

export type WorkerToMainFatalMessage = Readonly<{
  type: "fatal";
  where: string;
  code: number;
  detail: string;
}>;

export type WorkerToMainShutdownCompleteMessage = Readonly<{
  type: "shutdownComplete";
}>;

export type WorkerToMainCommitResultMessage = Readonly<{
  type: "commitResult";
  rc: number;
}>;

export type WorkerToMainCapsMessage = Readonly<{
  type: "caps";
  colorMode: number;
  supportsMouse: boolean;
  supportsBracketedPaste: boolean;
  supportsFocusEvents: boolean;
  supportsOsc52: boolean;
  supportsSyncUpdate: boolean;
  supportsScrollRegion: boolean;
  supportsCursorShape: boolean;
  supportsOutputWaitWritable: boolean;
  supportsUnderlineStyles: boolean;
  supportsColoredUnderlines: boolean;
  supportsHyperlinks: boolean;
  sgrAttrsSupported: number;
}>;

// =============================================================================
// Debug Protocol Messages (Worker -> Main)
// =============================================================================

export type DebugStatsWire = Readonly<{
  totalRecords: string; // bigint as string
  totalDropped: string;
  errorCount: number;
  warnCount: number;
  currentRingUsage: number;
  ringCapacity: number;
}>;

export type DebugQueryResultWire = Readonly<{
  recordsReturned: number;
  recordsAvailable: number;
  oldestRecordId: string;
  newestRecordId: string;
  recordsDropped: number;
}>;

export type WorkerToMainDebugEnableResultMessage = Readonly<{
  type: "debug:enableResult";
  result: number;
}>;

export type WorkerToMainDebugDisableResultMessage = Readonly<{
  type: "debug:disableResult";
  result: number;
}>;

export type WorkerToMainDebugQueryResultMessage = Readonly<{
  type: "debug:queryResult";
  headers: ArrayBuffer;
  headersByteLen: number;
  result: DebugQueryResultWire;
}>;

export type WorkerToMainDebugGetPayloadResultMessage = Readonly<{
  type: "debug:getPayloadResult";
  payload: ArrayBuffer;
  payloadByteLen: number;
  result: number;
}>;

export type WorkerToMainDebugGetStatsResultMessage = Readonly<{
  type: "debug:getStatsResult";
  stats: DebugStatsWire;
}>;

export type WorkerToMainDebugExportResultMessage = Readonly<{
  type: "debug:exportResult";
  buffer: ArrayBuffer;
  bufferByteLen: number;
}>;

export type WorkerToMainDebugResetResultMessage = Readonly<{
  type: "debug:resetResult";
  result: number;
}>;

// =============================================================================
// Perf Protocol Messages (Worker -> Main)
// =============================================================================

export type PerfPhaseStatsWire = Readonly<{
  count: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  worst10: readonly number[];
}>;

export type PerfSnapshotWire = Readonly<{
  phases: Readonly<Record<string, PerfPhaseStatsWire>>;
}>;

export type WorkerToMainPerfSnapshotResultMessage = Readonly<{
  type: "perf:snapshotResult";
  snapshot: PerfSnapshotWire;
}>;

export type WorkerToMainMessage =
  | WorkerToMainReadyMessage
  | WorkerToMainEventsMessage
  | WorkerToMainFrameStatusMessage
  | WorkerToMainFatalMessage
  | WorkerToMainShutdownCompleteMessage
  | WorkerToMainCapsMessage
  | WorkerToMainCommitResultMessage
  | WorkerToMainDebugEnableResultMessage
  | WorkerToMainDebugDisableResultMessage
  | WorkerToMainDebugQueryResultMessage
  | WorkerToMainDebugGetPayloadResultMessage
  | WorkerToMainDebugGetStatsResultMessage
  | WorkerToMainDebugExportResultMessage
  | WorkerToMainDebugResetResultMessage
  | WorkerToMainPerfSnapshotResultMessage;
