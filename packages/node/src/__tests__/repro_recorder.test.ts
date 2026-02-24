import assert from "node:assert/strict";
import test from "node:test";
import {
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  type BackendEventBatch,
  DEFAULT_TERMINAL_CAPS,
  type RuntimeBackend,
  type TerminalCaps,
  ZREV_MAGIC,
  ZR_EVENT_BATCH_VERSION_V1,
  parseReproBundleBytes,
} from "@rezi-ui/core";
import { createReproRecorder } from "../repro/index.js";

type ResizeRecord = Readonly<{
  timeMs: number;
  cols: number;
  rows: number;
}>;

type FakeBatchSpec = Readonly<{
  bytes: Uint8Array;
  droppedBatches: number;
}>;

function makeResizeBatch(records: readonly ResizeRecord[]): Uint8Array {
  const totalSize = 24 + records.length * 32;
  const out = new Uint8Array(totalSize);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);

  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, totalSize, true);
  dv.setUint32(12, records.length, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);

  let off = 24;
  for (const record of records) {
    dv.setUint32(off + 0, 5, true);
    dv.setUint32(off + 4, 32, true);
    dv.setUint32(off + 8, record.timeMs >>> 0, true);
    dv.setUint32(off + 12, 0, true);
    dv.setUint32(off + 16, record.cols >>> 0, true);
    dv.setUint32(off + 20, record.rows >>> 0, true);
    dv.setUint32(off + 24, 0, true);
    dv.setUint32(off + 28, 0, true);
    off += 32;
  }

  return out;
}

function createFakeBackend(
  queueSpecs: readonly FakeBatchSpec[],
  terminalCaps: TerminalCaps = DEFAULT_TERMINAL_CAPS,
): RuntimeBackend {
  let disposed = false;
  const queue = queueSpecs.map((spec) => ({
    bytes: spec.bytes,
    droppedBatches: spec.droppedBatches,
  }));

  const backend: RuntimeBackend = {
    async start(): Promise<void> {},
    async stop(): Promise<void> {},
    dispose(): void {
      disposed = true;
    },
    async requestFrame(_drawlist: Uint8Array): Promise<void> {},
    async pollEvents(): Promise<BackendEventBatch> {
      if (disposed) throw new Error("disposed");
      const next = queue.shift();
      if (next === undefined) throw new Error("no more events");
      let released = false;
      return {
        bytes: next.bytes,
        droppedBatches: next.droppedBatches,
        release: () => {
          if (released) return;
          released = true;
        },
      };
    },
    postUserEvent(_tag: number, _payload: Uint8Array): void {},
    async getCaps(): Promise<TerminalCaps> {
      return terminalCaps;
    },
  };

  Object.defineProperties(backend as unknown as Record<string, unknown>, {
    [BACKEND_MAX_EVENT_BYTES_MARKER]: {
      value: 4096,
      writable: false,
      enumerable: false,
      configurable: false,
    },
    [BACKEND_FPS_CAP_MARKER]: {
      value: 75,
      writable: false,
      enumerable: false,
      configurable: false,
    },
  });

  return backend;
}

test("repro recorder captures bounded batches/events/bytes with deterministic truncation", async () => {
  const b1 = makeResizeBatch([{ timeMs: 10, cols: 100, rows: 30 }]);
  const b2 = makeResizeBatch([
    { timeMs: 11, cols: 101, rows: 31 },
    { timeMs: 12, cols: 102, rows: 32 },
  ]);
  const b3 = makeResizeBatch([{ timeMs: 13, cols: 103, rows: 33 }]);

  const backend = createFakeBackend(
    [
      { bytes: b1, droppedBatches: 0 },
      { bytes: b2, droppedBatches: 1 },
      { bytes: b3, droppedBatches: 0 },
    ],
    {
      ...DEFAULT_TERMINAL_CAPS,
      supportsMouse: true,
      supportsCursorShape: true,
    },
  );

  const clockSamples = [100, 104, 111, 130];
  let clockIndex = 0;
  const recorder = createReproRecorder(backend, {
    bounds: {
      maxBatches: 10,
      maxEvents: 3,
      maxBytes: 1000,
    },
    clock: () => {
      const idx = clockIndex;
      clockIndex += 1;
      return clockSamples[idx] ?? clockSamples[clockSamples.length - 1] ?? 0;
    },
  });

  const wrapped = recorder.backend;
  for (let i = 0; i < 3; i++) {
    const polled = await wrapped.pollEvents();
    polled.release();
  }

  const built = await recorder.build();
  assert.equal(built.bundle.schema, "rezi-repro-v1");
  assert.equal(built.bundle.capsSnapshot.backendCaps.maxEventBytes, 4096);
  assert.equal(built.bundle.capsSnapshot.backendCaps.fpsCap, 75);
  assert.equal(built.bundle.capsSnapshot.backendCaps.cursorProtocolVersion, 2);
  assert.equal(built.bundle.capsSnapshot.terminalCaps?.supportsMouse, true);

  const capture = built.bundle.eventCapture;
  assert.equal(capture.bounds.maxBatches, 10);
  assert.equal(capture.bounds.maxEvents, 3);
  assert.equal(capture.bounds.maxBytes, 1000);

  assert.equal(capture.totals.capturedBatches, 2);
  assert.equal(capture.totals.capturedEvents, 3);
  assert.equal(capture.totals.capturedBytes, 56 + 88);
  assert.equal(capture.totals.runtimeDroppedBatches, 1);
  assert.equal(capture.totals.omittedBatches, 1);
  assert.equal(capture.totals.omittedEvents, 1);
  assert.equal(capture.totals.omittedBytes, 56);

  assert.equal(capture.truncation.truncated, true);
  assert.equal(capture.truncation.reason, "max-events");
  assert.equal(capture.truncation.firstOmittedStep, 2);
  assert.equal(capture.truncation.mode, "drop-tail-batch");

  assert.equal(capture.batches.length, 2);
  assert.equal(capture.batches[0]?.step, 0);
  assert.equal(capture.batches[0]?.deltaMs, 0);
  assert.equal(capture.batches[1]?.step, 1);
  assert.equal(capture.batches[1]?.deltaMs, 4);
  assert.equal(capture.batches[0]?.eventCount, 1);
  assert.equal(capture.batches[1]?.eventCount, 2);
  assert.equal(capture.batches[0]?.resizeEvents.length, 1);
  assert.equal(capture.batches[1]?.resizeEvents.length, 2);

  const parsed = parseReproBundleBytes(built.bytes);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.schema, "rezi-repro-v1");

  const bytesAgain = await recorder.buildBytes();
  assert.deepEqual(Array.from(built.bytes), Array.from(bytesAgain));
});

test("repro recorder truncation precedence is deterministic (batches -> events -> bytes)", async () => {
  const b1 = makeResizeBatch([{ timeMs: 1, cols: 80, rows: 20 }]);
  const b2 = makeResizeBatch([{ timeMs: 2, cols: 81, rows: 21 }]);
  const backend = createFakeBackend([
    { bytes: b1, droppedBatches: 0 },
    { bytes: b2, droppedBatches: 0 },
  ]);

  const recorder = createReproRecorder(backend, {
    bounds: {
      maxBatches: 1,
      maxEvents: 1,
      maxBytes: 56,
    },
    clock: () => 0,
  });

  const p1 = await recorder.backend.pollEvents();
  p1.release();
  const p2 = await recorder.backend.pollEvents();
  p2.release();

  const snapshot = recorder.snapshot();
  assert.equal(snapshot.totals.capturedBatches, 1);
  assert.equal(snapshot.totals.omittedBatches, 1);
  assert.equal(snapshot.truncation.truncated, true);
  assert.equal(snapshot.truncation.reason, "max-batches");
  assert.equal(snapshot.truncation.firstOmittedStep, 1);
});
