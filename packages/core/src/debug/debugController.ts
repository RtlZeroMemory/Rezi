/**
 * packages/core/src/debug/debugController.ts — Main debug trace controller.
 *
 * Why: Provides a unified interface for all debug tracing capabilities. Wraps
 * the low-level engine debug API and coordinates the high-level analysis tools
 * (FrameInspector, EventTrace, ErrorAggregator, StateTimeline).
 *
 * Architecture:
 *   - Low-level: Proxies to the engine debug API via RuntimeBackend
 *   - High-level: Manages analysis components that process debug records
 *   - Subscriptions: Enables reactive updates when new records arrive
 *
 * Usage:
 *   const debug = app.debug;
 *   debug.enable({ minSeverity: 'info' });
 *   const errors = debug.errors.all();
 *   const frames = debug.frameInspector.getSnapshots(10);
 */

import type { TerminalCaps } from "../terminalCaps.js";
import {
  DEBUG_BUNDLE_DEFAULT_MAX_PAYLOAD_BYTES,
  DEBUG_BUNDLE_DEFAULT_MAX_RECENT_FRAMES,
  DEBUG_BUNDLE_DEFAULT_MAX_RECORDS,
  DEBUG_BUNDLE_DEFAULT_MAX_TOTAL_PAYLOAD_BYTES,
  DEBUG_BUNDLE_SCHEMA_V1,
  DEBUG_DRAWLIST_RECORD_SIZE,
  DEBUG_RECORD_HEADER_SIZE,
} from "./constants.js";
import {
  type AggregatedError,
  type ErrorAggregator,
  createErrorAggregator,
} from "./errorAggregator.js";
import { type EventTrace, createEventTrace } from "./eventTrace.js";
import { type FrameInspector, type FrameSnapshot, createFrameInspector } from "./frameInspector.js";
import {
  parseErrorRecord,
  parseEventRecord,
  parseFrameRecord,
  parsePayload,
  parseRecordHeader,
} from "./parsers.js";
import { type StateTimeline, createStateTimeline } from "./stateTimeline.js";
import type {
  DebugBundle,
  DebugBundleExportOptions,
  DebugBundleFrameSummary,
  DebugBundleHeader,
  DebugBundlePayloadSnapshot,
  DebugBundleQueryWindow,
  DebugBundleStatsSnapshot,
  DebugConfig,
  DebugPayload,
  DebugQuery,
  DebugQueryResult,
  DebugRecord,
  DebugRecordHeader,
  DebugStats,
} from "./types.js";

/**
 * Debug record handler callback type.
 */
export type DebugRecordHandler = (record: DebugRecord) => void;

/**
 * Debug error handler callback type.
 */
export type DebugErrorHandler = (error: AggregatedError) => void;

/**
 * Debug event types for subscriptions.
 */
export type DebugEventType = "record" | "error";

type TerminalCapsProvider = () => TerminalCaps | null | Promise<TerminalCaps | null>;

function normalizeBound(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return fallback;
  if (!Number.isInteger(value)) return fallback;
  if (value < 0) return fallback;
  return value;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function compareBigInt(a: bigint, b: bigint): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function toBundleHeader(header: DebugRecordHeader): DebugBundleHeader {
  return {
    recordId: header.recordId.toString(),
    timestampUs: header.timestampUs.toString(),
    frameId: header.frameId.toString(),
    category: header.category,
    severity: header.severity,
    code: header.code,
    payloadSize: header.payloadSize,
  };
}

function toBundleStats(stats: DebugStats): DebugBundleStatsSnapshot {
  return {
    totalRecords: stats.totalRecords.toString(),
    totalDropped: stats.totalDropped.toString(),
    errorCount: stats.errorCount,
    warnCount: stats.warnCount,
    currentRingUsage: stats.currentRingUsage,
    ringCapacity: stats.ringCapacity,
  };
}

function toBundleQueryWindow(query: DebugQueryResult): DebugBundleQueryWindow {
  return {
    recordsReturned: query.recordsReturned,
    recordsAvailable: query.recordsAvailable,
    recordsDropped: query.recordsDropped,
    oldestRecordId: query.oldestRecordId.toString(),
    newestRecordId: query.newestRecordId.toString(),
  };
}

function toBundleFrameSummary(frame: FrameSnapshot): DebugBundleFrameSummary {
  return {
    frameId: frame.frameId.toString(),
    timestamp: frame.timestamp,
    cols: frame.cols,
    rows: frame.rows,
    drawlistBytes: frame.drawlistBytes,
    drawlistCmds: frame.drawlistCmds,
    diffBytesEmitted: frame.diffBytesEmitted,
    dirtyLines: frame.dirtyLines,
    dirtyCells: frame.dirtyCells,
    damageRects: frame.damageRects,
    usDrawlist: frame.usDrawlist,
    usDiff: frame.usDiff,
    usWrite: frame.usWrite,
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (i > 0) out += ",";
      const item = value[i];
      out += stableJson(item === undefined ? null : item);
    }
    out += "]";
    return out;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  let out = "{";
  let first = true;
  for (const key of keys) {
    const v = obj[key];
    if (v === undefined) continue;
    if (!first) out += ",";
    first = false;
    out += `${JSON.stringify(key)}:${stableJson(v)}`;
  }
  out += "}";
  return out;
}

/**
 * Debug backend interface for engine communication.
 * This is a subset of RuntimeBackend focused on debug operations.
 */
export interface DebugBackend {
  /** Enable debug tracing with the given configuration. */
  debugEnable(config: DebugConfig): Promise<void>;
  /** Disable debug tracing. */
  debugDisable(): Promise<void>;
  /** Query debug records. Returns headers and query result. */
  debugQuery(query: DebugQuery): Promise<{ headers: Uint8Array; result: DebugQueryResult }>;
  /** Get payload for a specific record. */
  debugGetPayload(recordId: bigint): Promise<Uint8Array | null>;
  /** Get debug statistics. */
  debugGetStats(): Promise<DebugStats>;
  /** Export all debug records to a buffer. */
  debugExport(): Promise<Uint8Array>;
  /** Reset (clear) debug records. */
  debugReset(): Promise<void>;
}

/**
 * Null debug backend for when no backend is available.
 */
const NULL_BACKEND: DebugBackend = {
  debugEnable: async () => {},
  debugDisable: async () => {},
  debugQuery: async () => ({
    headers: new Uint8Array(0),
    result: {
      recordsReturned: 0,
      recordsAvailable: 0,
      oldestRecordId: 0n,
      newestRecordId: 0n,
      recordsDropped: 0,
    },
  }),
  debugGetPayload: async () => null,
  debugGetStats: async () => ({
    totalRecords: 0n,
    totalDropped: 0n,
    errorCount: 0,
    warnCount: 0,
    currentRingUsage: 0,
    ringCapacity: 0,
  }),
  debugExport: async () => new Uint8Array(0),
  debugReset: async () => {},
};

/**
 * Debug controller interface.
 */
export interface DebugController {
  /* --- Low-level Engine Access --- */

  /**
   * Enable debug tracing.
   * @param config - Optional configuration overrides
   */
  enable(config?: Partial<DebugConfig>): Promise<void>;

  /**
   * Disable debug tracing.
   */
  disable(): Promise<void>;

  /**
   * Reset (clear) all debug records while keeping tracing enabled.
   */
  reset(): Promise<void>;

  /* --- Query Interface --- */

  /**
   * Query debug records from the engine.
   * @param filter - Optional query filter
   */
  query(filter?: DebugQuery): Promise<readonly DebugRecord[]>;

  /**
   * Get the payload for a specific record.
   * @param recordId - The record ID
   */
  getPayload<T extends DebugPayload>(recordId: bigint): Promise<T | null>;

  /**
   * Get debug statistics.
   */
  getStats(): Promise<DebugStats>;

  /**
   * Export all debug records to a buffer for offline analysis.
   */
  export(): Promise<Uint8Array>;

  /**
   * Export a deterministic, versioned JSON debug bundle.
   */
  exportBundle(options?: DebugBundleExportOptions): Promise<DebugBundle>;

  /**
   * Export the debug bundle as UTF-8 JSON bytes.
   */
  exportBundleBytes(options?: DebugBundleExportOptions): Promise<Uint8Array>;

  /* --- High-level Features --- */

  /**
   * Frame inspector for analyzing frame history.
   */
  readonly frameInspector: FrameInspector;

  /**
   * Event trace for tracking event flow.
   */
  readonly eventTrace: EventTrace;

  /**
   * Error aggregator for collecting errors.
   */
  readonly errors: ErrorAggregator;

  /**
   * State timeline for tracking state changes.
   */
  readonly stateTimeline: StateTimeline;

  /* --- Subscriptions --- */

  /**
   * Subscribe to debug events.
   * @param event - Event type: 'record' or 'error'
   * @param handler - Event handler
   * @returns Unsubscribe function
   */
  on(event: "record", handler: DebugRecordHandler): () => void;
  on(event: "error", handler: DebugErrorHandler): () => void;

  /* --- State --- */

  /**
   * Whether debug tracing is currently enabled.
   */
  readonly enabled: boolean;

  /**
   * Current configuration (null if not enabled).
   */
  readonly config: DebugConfig | null;

  /**
   * Process a batch of debug record headers and payloads.
   * Called internally by the app runtime.
   */
  processRecords(headers: Uint8Array, payloads: Map<bigint, Uint8Array>): void;
}

/**
 * Options for creating a debug controller.
 */
export type CreateDebugControllerOptions = Readonly<{
  /** Backend for engine communication (optional, enables backend features if provided) */
  backend?: DebugBackend;
  /** Initial configuration to apply on creation */
  initialConfig?: DebugConfig;
  /** Maximum frames to retain in frame inspector */
  maxFrames?: number;
  /** Maximum events to retain in event trace */
  maxEvents?: number;
  /** Maximum state changes to retain */
  maxStateChanges?: number;
  /** Optional provider used to snapshot terminal capabilities during bundle export. */
  terminalCapsProvider?: TerminalCapsProvider;
}>;

/**
 * Create a debug controller instance.
 */
export function createDebugController(options: CreateDebugControllerOptions = {}): DebugController {
  const backend = options.backend ?? NULL_BACKEND;
  const terminalCapsProvider = options.terminalCapsProvider;
  const frameInspector = createFrameInspector(options.maxFrames);
  const eventTrace = createEventTrace(options.maxEvents);
  const errorAggregator = createErrorAggregator();
  const stateTimeline = createStateTimeline(options.maxStateChanges);

  let isEnabled = false;
  let currentConfig: DebugConfig | null = null;
  const recordHandlers: Set<DebugRecordHandler> = new Set();

  function notifyRecordHandlers(record: DebugRecord): void {
    for (const handler of recordHandlers) {
      try {
        handler(record);
      } catch {
        // Ignore handler errors
      }
    }
  }

  async function resolveTerminalCaps(
    override: TerminalCaps | null | undefined,
  ): Promise<TerminalCaps | null> {
    if (override !== undefined) return override;
    if (!terminalCapsProvider) return null;
    try {
      return (await terminalCapsProvider()) ?? null;
    } catch {
      return null;
    }
  }

  async function enable(config?: Partial<DebugConfig>): Promise<void> {
    const fullConfig: DebugConfig = {
      enabled: true,
      ...(config?.ringCapacity !== undefined && { ringCapacity: config.ringCapacity }),
      ...(config?.minSeverity !== undefined && { minSeverity: config.minSeverity }),
      ...(config?.categoryMask !== undefined && { categoryMask: config.categoryMask }),
      ...(config?.captureRawEvents !== undefined && { captureRawEvents: config.captureRawEvents }),
      ...(config?.captureDrawlistBytes !== undefined && {
        captureDrawlistBytes: config.captureDrawlistBytes,
      }),
    };

    await backend.debugEnable(fullConfig);
    isEnabled = true;
    currentConfig = fullConfig;
  }

  async function disable(): Promise<void> {
    await backend.debugDisable();
    isEnabled = false;
    currentConfig = null;
  }

  async function reset(): Promise<void> {
    await backend.debugReset();
    frameInspector.clear();
    eventTrace.clear();
    errorAggregator.clear();
    stateTimeline.clear();
  }

  async function query(filter?: DebugQuery): Promise<readonly DebugRecord[]> {
    const { headers, result } = await backend.debugQuery(filter ?? {});

    if (result.recordsReturned === 0) {
      return [];
    }

    const records: DebugRecord[] = [];

    for (let i = 0; i < result.recordsReturned; i++) {
      const offset = i * DEBUG_RECORD_HEADER_SIZE;
      const headerResult = parseRecordHeader(headers, offset);

      if (!headerResult.ok) {
        continue;
      }

      const header = headerResult.value;
      let payload: DebugPayload | null = null;

      if (header.payloadSize > 0) {
        const payloadBytes = await backend.debugGetPayload(header.recordId);
        if (payloadBytes) {
          const payloadResult = parsePayload(header.category, payloadBytes);
          if (payloadResult.ok) {
            payload = payloadResult.value;
          }
        }
      }

      records.push({ header, payload });
    }

    return records;
  }

  async function getPayload<T extends DebugPayload>(recordId: bigint): Promise<T | null> {
    const bytes = await backend.debugGetPayload(recordId);
    if (!bytes) {
      return null;
    }

    // We don't know the category here, so try to parse based on size
    // This is a best-effort attempt
    const result = parseFrameRecord(bytes);
    if (result.ok) {
      return result.value as T;
    }

    return null;
  }

  async function getStats(): Promise<DebugStats> {
    return backend.debugGetStats();
  }

  async function exportRecords(): Promise<Uint8Array> {
    return backend.debugExport();
  }

  async function exportBundle(options?: DebugBundleExportOptions): Promise<DebugBundle> {
    const maxRecords = normalizeBound(options?.maxRecords, DEBUG_BUNDLE_DEFAULT_MAX_RECORDS);
    const maxPayloadBytes = normalizeBound(
      options?.maxPayloadBytes,
      DEBUG_BUNDLE_DEFAULT_MAX_PAYLOAD_BYTES,
    );
    const maxTotalPayloadBytes = normalizeBound(
      options?.maxTotalPayloadBytes,
      DEBUG_BUNDLE_DEFAULT_MAX_TOTAL_PAYLOAD_BYTES,
    );
    const maxRecentFrames = normalizeBound(
      options?.maxRecentFrames,
      DEBUG_BUNDLE_DEFAULT_MAX_RECENT_FRAMES,
    );
    const includeRecentFrames = options?.includeRecentFrames !== false;

    const captureRawEvents = options?.includeRawEvents ?? currentConfig?.captureRawEvents ?? false;
    const captureDrawlistBytes =
      options?.includeDrawlistBytes ?? currentConfig?.captureDrawlistBytes ?? false;

    const stats = await backend.debugGetStats();
    const statsSnapshot = toBundleStats(stats);
    const terminalCaps = await resolveTerminalCaps(options?.terminalCaps);

    let queryResult: DebugQueryResult = {
      recordsReturned: 0,
      recordsAvailable: 0,
      oldestRecordId: 0n,
      newestRecordId: 0n,
      recordsDropped: 0,
    };
    let headersBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

    if (maxRecords > 0) {
      const queried = await backend.debugQuery({ maxRecords });
      headersBytes = queried.headers;
      queryResult = queried.result;
    }

    const parsedHeaders: DebugRecordHeader[] = [];
    const count = Math.min(
      queryResult.recordsReturned,
      Math.floor(headersBytes.byteLength / DEBUG_RECORD_HEADER_SIZE),
    );

    for (let i = 0; i < count; i++) {
      const offset = i * DEBUG_RECORD_HEADER_SIZE;
      const parsed = parseRecordHeader(headersBytes, offset);
      if (parsed.ok) {
        parsedHeaders.push(parsed.value);
      }
    }

    parsedHeaders.sort((a, b) => compareBigInt(a.recordId, b.recordId));

    let payloadBudgetRemaining = maxTotalPayloadBytes;
    const trace: Array<{
      header: DebugBundleHeader;
      payload: DebugBundlePayloadSnapshot | null;
    }> = [];

    for (const header of parsedHeaders) {
      const headerSnapshot = toBundleHeader(header);
      let payloadSnapshot: DebugBundlePayloadSnapshot | null = null;

      if (header.payloadSize > 0) {
        if (header.category === "event" && !captureRawEvents) {
          payloadSnapshot = {
            included: false,
            reason: "capture-raw-events-disabled",
            bytesTotal: header.payloadSize,
          };
        } else if (
          header.category === "drawlist" &&
          header.payloadSize !== DEBUG_DRAWLIST_RECORD_SIZE &&
          !captureDrawlistBytes
        ) {
          payloadSnapshot = {
            included: false,
            reason: "capture-drawlist-bytes-disabled",
            bytesTotal: header.payloadSize,
          };
        } else {
          const payloadBytes = await backend.debugGetPayload(header.recordId);
          if (!payloadBytes) {
            payloadSnapshot = {
              included: false,
              reason: "payload-unavailable",
              bytesTotal: header.payloadSize,
            };
          } else {
            const bytesIncluded = Math.min(
              maxPayloadBytes,
              payloadBudgetRemaining,
              payloadBytes.byteLength,
            );
            const truncated = bytesIncluded < payloadBytes.byteLength;
            const bounded = payloadBytes.subarray(0, bytesIncluded);
            payloadSnapshot = {
              included: true,
              encoding: "hex",
              data: toHex(bounded),
              bytesIncluded,
              bytesTotal: payloadBytes.byteLength,
              truncated,
            };
            payloadBudgetRemaining -= bytesIncluded;
          }
        }
      }

      trace.push({
        header: headerSnapshot,
        payload: payloadSnapshot,
      });
    }

    const recentFrameSummaries = includeRecentFrames
      ? frameInspector.getSnapshots(maxRecentFrames).map(toBundleFrameSummary)
      : [];

    const base: Omit<DebugBundle, "recentFrameSummaries"> = {
      schema: DEBUG_BUNDLE_SCHEMA_V1,
      captureFlags: {
        captureRawEvents,
        captureDrawlistBytes,
      },
      bounds: {
        maxRecords,
        maxPayloadBytes,
        maxTotalPayloadBytes,
        maxRecentFrames,
      },
      terminalCaps,
      stats: statsSnapshot,
      queryWindow: toBundleQueryWindow(queryResult),
      trace,
    };

    if (recentFrameSummaries.length > 0) {
      return {
        ...base,
        recentFrameSummaries,
      };
    }

    return base;
  }

  async function exportBundleBytes(options?: DebugBundleExportOptions): Promise<Uint8Array> {
    const bundle = await exportBundle(options);
    return new TextEncoder().encode(stableJson(bundle));
  }

  function processRecords(headers: Uint8Array, payloads: Map<bigint, Uint8Array>): void {
    const count = Math.floor(headers.byteLength / DEBUG_RECORD_HEADER_SIZE);

    for (let i = 0; i < count; i++) {
      const offset = i * DEBUG_RECORD_HEADER_SIZE;
      const headerResult = parseRecordHeader(headers, offset);

      if (!headerResult.ok) {
        continue;
      }

      const header = headerResult.value;
      let payload: DebugPayload | null = null;

      const payloadBytes = payloads.get(header.recordId);
      if (payloadBytes) {
        const payloadResult = parsePayload(header.category, payloadBytes);
        if (payloadResult.ok) {
          payload = payloadResult.value;
        }
      }

      const record: DebugRecord = { header, payload };

      // Route to appropriate component based on category
      switch (header.category) {
        case "frame":
          if (payload && payloadBytes) {
            const frameResult = parseFrameRecord(payloadBytes);
            if (frameResult.ok) {
              frameInspector.addFrame(frameResult.value, header.timestampUs);
            }
          }
          break;

        case "event":
          if (payload && payloadBytes) {
            const eventResult = parseEventRecord(payloadBytes);
            if (eventResult.ok) {
              eventTrace.addEvent(eventResult.value, header.recordId, header.timestampUs);
            }
          }
          break;

        case "error":
          if (payload && payloadBytes) {
            const errorResult = parseErrorRecord(payloadBytes);
            if (errorResult.ok) {
              errorAggregator.addError(
                errorResult.value,
                header.category,
                header.severity,
                header.timestampUs,
              );
            }
          }
          break;
      }

      notifyRecordHandlers(record);
    }
  }

  function on(event: DebugEventType, handler: DebugRecordHandler | DebugErrorHandler): () => void {
    if (event === "record") {
      const h = handler as DebugRecordHandler;
      recordHandlers.add(h);
      return () => {
        recordHandlers.delete(h);
      };
    }

    if (event === "error") {
      return errorAggregator.on("error", handler as DebugErrorHandler);
    }

    return () => {};
  }

  return {
    enable,
    disable,
    reset,
    query,
    getPayload,
    getStats,
    export: exportRecords,
    exportBundle,
    exportBundleBytes,
    frameInspector,
    eventTrace,
    errors: errorAggregator,
    stateTimeline,
    on: on as DebugController["on"],
    processRecords,
    get enabled() {
      return isEnabled;
    },
    get config() {
      return currentConfig;
    },
  };
}
