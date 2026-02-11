/**
 * Benchmark backends.
 *
 * - BenchBackend: RuntimeBackend stub for Rezi/ink-compat benchmarks (no terminal I/O).
 * - MeasuringStream: Writable that captures write timing for Ink benchmarks.
 */

import { Writable } from "node:stream";
import {
  type BackendEventBatch,
  DEFAULT_TERMINAL_CAPS,
  type RuntimeBackend,
  ZREV_MAGIC,
  ZR_EVENT_BATCH_VERSION_V1,
} from "@rezi-ui/core";

// ── ZREV batch helpers ──────────────────────────────────────────────

function makeBatch(bytes: Uint8Array): BackendEventBatch {
  return { bytes, droppedBatches: 0, release() {} };
}

function emptyZrevBatch(): BackendEventBatch {
  const bytes = new Uint8Array(24);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, 24, true);
  dv.setUint32(12, 0, true); // zero events
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  return makeBatch(bytes);
}

/**
 * Build a ZREV v1 batch containing a single resize event.
 * The app needs at least one resize event to initialize its viewport;
 * without it, tryRenderOnce() bails out and no frames are produced.
 */
function resizeZrevBatch(cols: number, rows: number): BackendEventBatch {
  // header (24) + 1 resize event (32) = 56 bytes
  const bytes = new Uint8Array(56);
  const dv = new DataView(bytes.buffer);
  // Header
  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, 56, true); // total size
  dv.setUint32(12, 1, true); // 1 event
  dv.setUint32(16, 0, true); // flags
  dv.setUint32(20, 0, true); // reserved
  // Resize event: type=5, size=32
  dv.setUint32(24, 5, true); // event type: resize
  dv.setUint32(28, 32, true); // event size
  dv.setUint32(32, 0, true); // timeMs
  dv.setUint32(36, 0, true); // timeMs high / padding
  dv.setUint32(40, cols, true); // cols
  dv.setUint32(44, rows, true); // rows
  dv.setUint32(48, 0, true); // reserved
  dv.setUint32(52, 0, true); // reserved
  return makeBatch(bytes);
}

// ── BenchBackend ────────────────────────────────────────────────────

/**
 * In-memory RuntimeBackend for benchmarking Rezi and ink-compat.
 *
 * - Captures submitted drawlists (frame count + byte count).
 * - pollEvents yields empty batches on a short timer so the frame loop
 *   progresses without spinning at 100% CPU.
 * - waitForFrame() resolves the next time requestFrame is called.
 */
export class BenchBackend implements RuntimeBackend {
  frameCount = 0;
  totalFrameBytes = 0;
  readonly frameTimes: number[] = [];

  private frameResolvers: Array<() => void> = [];
  private stopped = false;
  private needsResize = true;

  /** Configurable viewport dimensions. */
  readonly cols: number;
  readonly rows: number;

  constructor(cols = 120, rows = 40) {
    this.cols = cols;
    this.rows = rows;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.needsResize = true;
  }

  async stop(): Promise<void> {
    this.stopped = true;
    // Drain any pending frame waiters
    for (const r of this.frameResolvers) r();
    this.frameResolvers.length = 0;
  }

  dispose(): void {
    this.stopped = true;
  }

  postUserEvent(_tag: number, _payload: Uint8Array): void {}

  async getCaps() {
    return {
      ...DEFAULT_TERMINAL_CAPS,
      cols: this.cols,
      rows: this.rows,
    };
  }

  async requestFrame(drawlist: Uint8Array): Promise<void> {
    this.frameCount++;
    this.totalFrameBytes += drawlist.byteLength;
    this.frameTimes.push(performance.now());
    const resolver = this.frameResolvers.shift();
    if (resolver) resolver();
  }

  /**
   * Returns a promise that resolves on the next requestFrame call.
   * Call this BEFORE triggering the state change that produces the frame.
   */
  waitForFrame(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.frameResolvers.push(resolve);
    });
  }

  pollEvents(): Promise<BackendEventBatch> {
    if (this.stopped) {
      // Block forever after stop — prevents frame loop from spinning
      return new Promise<BackendEventBatch>(() => {});
    }
    // First poll must deliver a resize event to initialize the app's viewport.
    // Without it, tryRenderOnce() bails out because viewport is null.
    if (this.needsResize) {
      this.needsResize = false;
      return new Promise<BackendEventBatch>((resolve) => {
        setTimeout(() => resolve(resizeZrevBatch(this.cols, this.rows)), 0);
      });
    }
    // Subsequent polls yield empty batches after a short delay so the frame
    // loop can render when state is dirty, without busy-spinning.
    return new Promise<BackendEventBatch>((resolve) => {
      setTimeout(() => resolve(emptyZrevBatch()), 0);
    });
  }

  reset(): void {
    this.frameCount = 0;
    this.totalFrameBytes = 0;
    this.frameTimes.length = 0;
    this.frameResolvers.length = 0;
    this.needsResize = true;
  }
}

// ── MeasuringStream ─────────────────────────────────────────────────

/**
 * Writable stream for capturing Ink's stdout output.
 *
 * Tracks write count, total bytes, and per-write timestamps.
 * Has `columns`/`rows` properties so Ink treats it as a real terminal.
 */
export class MeasuringStream extends Writable {
  writeCount = 0;
  totalBytes = 0;
  readonly writeTimes: number[] = [];

  /** Terminal dimensions reported to Ink / Yoga. */
  columns = 120;
  rows = 40;

  /** Ink checks isTTY for cursor manipulation and rendering. Must be true. */
  isTTY = true;

  private writeResolvers: Array<() => void> = [];

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.writeCount++;
    this.totalBytes +=
      typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : chunk.byteLength;
    this.writeTimes.push(performance.now());
    const resolver = this.writeResolvers.shift();
    if (resolver) resolver();
    callback();
  }

  /**
   * Returns a promise that resolves on the next _write call.
   * Call BEFORE triggering the re-render.
   */
  waitForWrite(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.writeResolvers.push(resolve);
    });
  }

  reset(): void {
    this.writeCount = 0;
    this.totalBytes = 0;
    this.writeTimes.length = 0;
    this.writeResolvers.length = 0;
  }
}

// ── NullReadable ────────────────────────────────────────────────────

import { Readable } from "node:stream";

/** Readable that never produces data. Used as stdin for Ink. */
export class NullReadable extends Readable {
  isTTY = false;
  override _read(): void {
    // intentionally never pushes data
  }
  // Ink calls setRawMode — make it a no-op
  setRawMode(): this {
    return this;
  }
}
