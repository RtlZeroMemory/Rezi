import { assert, describe, test } from "@rezi-ui/testkit";
import {
  DEBUG_BUNDLE_SCHEMA_V1,
  DEBUG_DRAWLIST_RECORD_SIZE,
  categoryToNum,
  severityToNum,
} from "../constants.js";
import { type DebugBackend, createDebugController } from "../debugController.js";
import type {
  DebugBundlePayloadSnapshot,
  DebugBundleTraceRecord,
  DebugCategory,
  DebugConfig,
  DebugQuery,
  DebugRecordHeader,
  DebugSeverity,
  DebugStats,
} from "../types.js";

type MockTraceRecord = Readonly<{
  header: DebugRecordHeader;
  payload: Uint8Array | null;
}>;

const HEADER_SIZE = 40;

function writeU64(view: DataView, offset: number, value: bigint): void {
  view.setUint32(offset, Number(value & 0xffff_ffffn), true);
  view.setUint32(offset + 4, Number((value >> 32n) & 0xffff_ffffn), true);
}

function encodeHeaders(headers: readonly DebugRecordHeader[]): Uint8Array {
  const bytes = new Uint8Array(headers.length * HEADER_SIZE);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (!header) continue;

    const off = i * HEADER_SIZE;
    const category = categoryToNum(header.category);
    const severity = severityToNum(header.severity);
    if (category === null || severity === null) {
      throw new Error("invalid category/severity in test header");
    }

    writeU64(view, off, header.recordId);
    writeU64(view, off + 8, header.timestampUs);
    writeU64(view, off + 16, header.frameId);
    view.setUint32(off + 24, category, true);
    view.setUint32(off + 28, severity, true);
    view.setUint32(off + 32, header.code, true);
    view.setUint32(off + 36, header.payloadSize, true);
  }

  return bytes;
}

function makeHeader(
  recordId: bigint,
  category: DebugCategory,
  severity: DebugSeverity,
  payloadSize: number,
  frameId = 0n,
): DebugRecordHeader {
  return {
    recordId,
    timestampUs: recordId * 10n,
    frameId,
    category,
    severity,
    code: 7,
    payloadSize,
  };
}

function makeFramePayload(frameId: bigint): Uint8Array {
  const bytes = new Uint8Array(56);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  writeU64(view, 0, frameId);
  view.setUint32(8, 120, true);
  view.setUint32(12, 40, true);
  view.setUint32(16, 2048, true);
  view.setUint32(20, 61, true);
  view.setUint32(24, 512, true);
  view.setUint32(28, 9, true);
  view.setUint32(32, 81, true);
  view.setUint32(36, 4, true);
  view.setUint32(40, 900, true);
  view.setUint32(44, 410, true);
  view.setUint32(48, 220, true);
  view.setUint32(52, 0, true);
  return bytes;
}

function createMockBackend(
  recordsInput: readonly MockTraceRecord[],
  statsOverrides: Partial<DebugStats> = {},
): DebugBackend {
  const records = [...recordsInput].sort((a, b) =>
    a.header.recordId < b.header.recordId ? -1 : a.header.recordId > b.header.recordId ? 1 : 0,
  );
  const payloadById = new Map(records.map((r) => [r.header.recordId, r.payload]));
  const stats: DebugStats = {
    totalRecords: BigInt(records.length),
    totalDropped: 0n,
    errorCount: records.filter((r) => r.header.category === "error").length,
    warnCount: records.filter((r) => r.header.severity === "warn").length,
    currentRingUsage: records.length,
    ringCapacity: 4096,
    ...statsOverrides,
  };

  return {
    debugEnable: async (_config: DebugConfig) => {},
    debugDisable: async () => {},
    debugQuery: async (query: DebugQuery) => {
      let selected = records;
      if (query.maxRecords !== undefined && query.maxRecords > 0) {
        selected = records.slice(0, query.maxRecords);
      }

      return {
        headers: encodeHeaders(selected.map((r) => r.header)),
        result: {
          recordsReturned: selected.length,
          recordsAvailable: records.length,
          oldestRecordId: records[0]?.header.recordId ?? 0n,
          newestRecordId: records[records.length - 1]?.header.recordId ?? 0n,
          recordsDropped: 0,
        },
      };
    },
    debugGetPayload: async (recordId: bigint) => {
      const payload = payloadById.get(recordId);
      return payload ? payload.slice() : null;
    },
    debugGetStats: async () => stats,
    debugExport: async () => new Uint8Array(0),
    debugReset: async () => {},
  };
}

function getRecord(
  trace: readonly DebugBundleTraceRecord[],
  recordId: string,
): DebugBundleTraceRecord {
  const record = trace.find((entry) => entry.header.recordId === recordId);
  if (!record) {
    throw new Error(`missing trace record id=${recordId}`);
  }
  return record;
}

function getPayload(record: DebugBundleTraceRecord): DebugBundlePayloadSnapshot {
  if (!record.payload) {
    throw new Error(`record ${record.header.recordId} has no payload`);
  }
  return record.payload;
}

describe("debug bundle export", () => {
  test("uses versioned schema and is deterministic for same run state", async () => {
    const framePayload = makeFramePayload(11n);
    const records: MockTraceRecord[] = [
      {
        header: makeHeader(1n, "frame", "info", framePayload.byteLength, 11n),
        payload: framePayload,
      },
      {
        header: makeHeader(2n, "perf", "info", 4, 11n),
        payload: new Uint8Array([1, 2, 3, 4]),
      },
    ];
    const backend = createMockBackend(records, { totalDropped: 1n });

    const debug = createDebugController({
      backend,
      terminalCapsProvider: async () => ({
        colorMode: 3,
        supportsMouse: true,
        supportsBracketedPaste: true,
        supportsFocusEvents: true,
        supportsOsc52: false,
        supportsSyncUpdate: true,
        supportsScrollRegion: true,
        supportsCursorShape: true,
        supportsOutputWaitWritable: false,
        sgrAttrsSupported: 0xff,
      }),
    });
    await debug.enable({
      captureRawEvents: true,
      captureDrawlistBytes: true,
    });

    const firstRecord = records[0];
    if (!firstRecord) {
      throw new Error("expected first record");
    }

    debug.processRecords(encodeHeaders([firstRecord.header]), new Map([[1n, framePayload]]));

    const first = await debug.exportBundle({
      maxRecords: 16,
      maxPayloadBytes: 16,
      maxTotalPayloadBytes: 64,
      maxRecentFrames: 4,
    });
    const second = await debug.exportBundle({
      maxRecords: 16,
      maxPayloadBytes: 16,
      maxTotalPayloadBytes: 64,
      maxRecentFrames: 4,
    });

    assert.equal(first.schema, DEBUG_BUNDLE_SCHEMA_V1);
    assert.deepEqual(first, second);
    assert.equal(first.trace.length, 2);
    assert.equal(first.terminalCaps?.supportsMouse, true);
    assert.equal(first.recentFrameSummaries?.length, 1);
    assert.equal(first.recentFrameSummaries?.[0]?.frameId, "11");

    const bytesA = await debug.exportBundleBytes({ maxRecords: 16 });
    const bytesB = await debug.exportBundleBytes({ maxRecords: 16 });
    assert.deepEqual(Array.from(bytesA), Array.from(bytesB));

    const parsed = JSON.parse(new TextDecoder().decode(bytesA)) as { schema?: string };
    assert.equal(parsed.schema, DEBUG_BUNDLE_SCHEMA_V1);
  });

  test("enforces per-record and total payload bounds", async () => {
    const records: MockTraceRecord[] = [
      { header: makeHeader(1n, "perf", "info", 10), payload: new Uint8Array(10).fill(1) },
      { header: makeHeader(2n, "perf", "info", 8), payload: new Uint8Array(8).fill(2) },
      { header: makeHeader(3n, "perf", "info", 4), payload: new Uint8Array(4).fill(3) },
    ];
    const debug = createDebugController({ backend: createMockBackend(records) });

    const bundle = await debug.exportBundle({
      maxRecords: 3,
      maxPayloadBytes: 6,
      maxTotalPayloadBytes: 9,
      includeRecentFrames: false,
    });

    assert.equal(bundle.trace.length, 3);

    const p1 = getPayload(getRecord(bundle.trace, "1"));
    const p2 = getPayload(getRecord(bundle.trace, "2"));
    const p3 = getPayload(getRecord(bundle.trace, "3"));

    if (!p1.included || !p2.included || !p3.included) {
      throw new Error("expected included payloads for perf records");
    }

    assert.equal(p1.bytesIncluded, 6);
    assert.equal(p1.truncated, true);
    assert.equal(p2.bytesIncluded, 3);
    assert.equal(p2.truncated, true);
    assert.equal(p3.bytesIncluded, 0);
    assert.equal(p3.truncated, true);

    assert.equal(p1.bytesIncluded + p2.bytesIncluded + p3.bytesIncluded, 9);
    assert.equal(bundle.bounds.maxPayloadBytes, 6);
    assert.equal(bundle.bounds.maxTotalPayloadBytes, 9);
  });

  test("includes or excludes sensitive payloads based on capture flags", async () => {
    const records: MockTraceRecord[] = [
      { header: makeHeader(1n, "event", "info", 6), payload: new Uint8Array([9, 8, 7, 6, 5, 4]) },
      { header: makeHeader(2n, "drawlist", "info", 64), payload: new Uint8Array(64).fill(0xab) },
      {
        header: makeHeader(3n, "drawlist", "info", DEBUG_DRAWLIST_RECORD_SIZE),
        payload: new Uint8Array(DEBUG_DRAWLIST_RECORD_SIZE).fill(0xcd),
      },
    ];
    const debug = createDebugController({ backend: createMockBackend(records) });

    await debug.enable({
      captureRawEvents: false,
      captureDrawlistBytes: false,
    });

    const disabled = await debug.exportBundle({ includeRecentFrames: false });

    const eventDisabled = getPayload(getRecord(disabled.trace, "1"));
    const rawDrawlistDisabled = getPayload(getRecord(disabled.trace, "2"));
    const structuredDrawlistDisabled = getPayload(getRecord(disabled.trace, "3"));

    assert.equal(eventDisabled.included, false);
    if (eventDisabled.included) throw new Error("event payload should be omitted");
    assert.equal(eventDisabled.reason, "capture-raw-events-disabled");

    assert.equal(rawDrawlistDisabled.included, false);
    if (rawDrawlistDisabled.included) throw new Error("raw drawlist payload should be omitted");
    assert.equal(rawDrawlistDisabled.reason, "capture-drawlist-bytes-disabled");

    assert.equal(structuredDrawlistDisabled.included, true);

    await debug.enable({
      captureRawEvents: true,
      captureDrawlistBytes: true,
    });

    const enabled = await debug.exportBundle({ includeRecentFrames: false });
    const eventEnabled = getPayload(getRecord(enabled.trace, "1"));
    const rawDrawlistEnabled = getPayload(getRecord(enabled.trace, "2"));

    assert.equal(eventEnabled.included, true);
    assert.equal(rawDrawlistEnabled.included, true);
  });
});
