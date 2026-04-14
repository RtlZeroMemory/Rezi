import type { BackendEventBatch, RuntimeBackend } from "../../backend.js";
import { DEFAULT_TERMINAL_CAPS, type TerminalCaps } from "../../terminalCaps.js";

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export class StubBackend implements RuntimeBackend {
  startCalls = 0;
  stopCalls = 0;
  disposeCalls = 0;

  readonly requestedFrames: Uint8Array[] = [];
  readonly callLog: string[] = [];

  private readonly pollWaiters: Array<Deferred<BackendEventBatch>> = [];
  private readonly pollBuffered: BackendEventBatch[] = [];
  private readonly pollFailures: unknown[] = [];

  private readonly frameDeferreds: Array<Deferred<void>> = [];
  private readonly startFailures: unknown[] = [];
  private readonly stopFailures: unknown[] = [];
  private readonly getCapsFailures: unknown[] = [];

  start(): Promise<void> {
    this.startCalls++;
    this.callLog.push("start");
    const failure = this.startFailures.shift();
    if (failure !== undefined) return Promise.reject(failure);
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.stopCalls++;
    this.callLog.push("stop");
    const failure = this.stopFailures.shift();
    if (failure !== undefined) return Promise.reject(failure);
    return Promise.resolve();
  }

  dispose(): void {
    this.disposeCalls++;
    this.callLog.push("dispose");
  }

  requestFrame(drawlist: Uint8Array): Promise<void> {
    this.requestedFrames.push(drawlist);
    this.callLog.push("requestFrame");
    const d = deferred<void>();
    this.frameDeferreds.push(d);
    return d.promise;
  }

  resolveNextFrame(): void {
    const d = this.frameDeferreds.shift();
    if (!d) throw new Error("StubBackend: no in-flight frame to resolve");
    d.resolve(undefined);
  }

  rejectNextFrame(err: unknown): void {
    const d = this.frameDeferreds.shift();
    if (!d) throw new Error("StubBackend: no in-flight frame to reject");
    d.reject(err);
  }

  pollEvents(): Promise<BackendEventBatch> {
    const failure = this.pollFailures.shift();
    if (failure !== undefined) return Promise.reject(failure);
    const b = this.pollBuffered.shift();
    if (b) return Promise.resolve(b);
    const d = deferred<BackendEventBatch>();
    this.pollWaiters.push(d);
    return d.promise;
  }

  pushBatch(batch: BackendEventBatch): void {
    const w = this.pollWaiters.shift();
    if (w) {
      w.resolve(batch);
      return;
    }
    this.pollBuffered.push(batch);
  }

  queueStartFailure(err: unknown): void {
    this.startFailures.push(err);
  }

  queueStopFailure(err: unknown): void {
    const waiter = this.pollWaiters.shift();
    this.stopFailures.push(err);
    if (waiter) this.pollWaiters.unshift(waiter);
  }

  queuePollFailure(err: unknown): void {
    const waiter = this.pollWaiters.shift();
    if (waiter) {
      waiter.reject(err);
      return;
    }
    this.pollFailures.push(err);
  }

  queueGetCapsFailure(err: unknown): void {
    this.getCapsFailures.push(err);
  }

  postUserEvent(_tag: number, _payload: Uint8Array): void {
    // Not needed by these app runtime unit tests.
  }

  getCaps(): Promise<TerminalCaps> {
    const failure = this.getCapsFailures.shift();
    if (failure !== undefined) return Promise.reject(failure);
    return Promise.resolve(DEFAULT_TERMINAL_CAPS);
  }
}
