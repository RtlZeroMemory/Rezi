import { Writable } from "node:stream";
import type { RuntimeBackend } from "@rezi-ui/core";
import { BenchBackend, MeasuringStream } from "./backends.js";

export type BenchIoMode = "stub" | "terminal";

export function getBenchIoMode(): BenchIoMode {
  const env = process.env as Readonly<{ REZI_BENCH_IO?: string }>;
  return env.REZI_BENCH_IO === "terminal" ? "terminal" : "stub";
}

type FrameWaiter = Readonly<{
  resolve: () => void;
  reject: (err: Error) => void;
}>;

export type BenchFrameBackend = RuntimeBackend &
  Readonly<{
    frameCount: number;
    totalFrameBytes: number;
    waitForFrame: () => Promise<void>;
    reset: () => void;
  }>;

const BACKEND_MARKER_PREFIX = "__reziBackend";

function copyBackendMarkers(target: object, source: object): void {
  // Preserve backend capability markers used by createApp() for drawlist/event negotiation.
  for (const key of Object.getOwnPropertyNames(source)) {
    if (!key.startsWith(BACKEND_MARKER_PREFIX)) continue;
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc) continue;
    Object.defineProperty(target, key, desc);
  }
}

export class LatchingBackend implements BenchFrameBackend {
  frameCount = 0;
  totalFrameBytes = 0;

  private readonly inner: RuntimeBackend;
  private stopped = false;
  private readonly waiters: FrameWaiter[] = [];

  constructor(inner: RuntimeBackend) {
    this.inner = inner;
    copyBackendMarkers(this, inner as object);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.inner.start();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    const err = new Error("LatchingBackend: stopped");
    while (this.waiters.length > 0) this.waiters.shift()?.reject(err);
    await this.inner.stop();
  }

  dispose(): void {
    this.stopped = true;
    const err = new Error("LatchingBackend: disposed");
    while (this.waiters.length > 0) this.waiters.shift()?.reject(err);
    this.inner.dispose();
  }

  postUserEvent(tag: number, payload: Uint8Array): void {
    this.inner.postUserEvent(tag, payload);
  }

  getCaps(): Promise<import("@rezi-ui/core").TerminalCaps> {
    return this.inner.getCaps();
  }

  async requestFrame(drawlist: Uint8Array): Promise<void> {
    if (this.stopped) throw new Error("LatchingBackend: stopped");
    this.frameCount++;
    this.totalFrameBytes += drawlist.byteLength;

    try {
      await this.inner.requestFrame(drawlist);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      while (this.waiters.length > 0) this.waiters.shift()?.reject(e);
      throw e;
    }

    const w = this.waiters.shift();
    if (w) w.resolve();
  }

  pollEvents(): Promise<import("@rezi-ui/core").BackendEventBatch> {
    return this.inner.pollEvents();
  }

  waitForFrame(): Promise<void> {
    if (this.stopped) return Promise.reject(new Error("LatchingBackend: stopped"));
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  reset(): void {
    this.frameCount = 0;
    this.totalFrameBytes = 0;
    const err = new Error("LatchingBackend: reset");
    while (this.waiters.length > 0) this.waiters.shift()?.reject(err);
  }
}

export async function createBenchBackend(): Promise<BenchFrameBackend> {
  const mode = getBenchIoMode();
  if (mode === "stub") return new BenchBackend();

  if (process.stdout.isTTY !== true) {
    throw new Error("terminal bench mode requires a TTY stdout (run with --io pty)");
  }

  const NodeBackend = await import("@rezi-ui/node");
  const inner = NodeBackend.createNodeBackend({
    // PTY mode already runs in a dedicated process, so prefer inline execution
    // here for stability (avoids nested worker-thread ownership + transport).
    executionMode: "inline",
    fpsCap: 60,
    nativeConfig: {
      // Include output backpressure (when supported) for a closer-to-real measurement.
      waitForOutputDrain: 1,
    },
  });
  return new LatchingBackend(inner);
}

type InkMeasuringStdout = Writable &
  Readonly<{
    isTTY: boolean;
    columns: number;
    rows: number;
    writeCount: number;
    totalBytes: number;
    waitForWrite: () => Promise<void>;
    reset: () => void;
  }>;

export class TtyMeasuringStream extends Writable implements InkMeasuringStdout {
  writeCount = 0;
  totalBytes = 0;
  readonly writeTimes: number[] = [];

  columns = process.stdout.columns ?? 120;
  rows = process.stdout.rows ?? 40;
  isTTY = true;

  private readonly writeResolvers: Array<() => void> = [];

  override _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.writeCount++;
    this.totalBytes +=
      typeof chunk === "string" ? Buffer.byteLength(chunk, encoding) : chunk.byteLength;

    const done = (err?: Error | null) => {
      const r = this.writeResolvers.shift();
      if (r) r();
      callback(err ?? null);
    };

    try {
      // Forward to the real TTY.
      const out = process.stdout as unknown as NodeJS.WriteStream;
      if (typeof chunk === "string") {
        out.write(chunk, encoding, done);
      } else {
        out.write(chunk, done);
      }
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
    }
  }

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

export function createInkStdout(): InkMeasuringStdout {
  return getBenchIoMode() === "terminal" ? new TtyMeasuringStream() : new MeasuringStream();
}
