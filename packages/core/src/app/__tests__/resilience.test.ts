import { assert, test } from "@rezi-ui/testkit";
import { defineWidget, ui } from "../../index.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

function u32(bytes: Uint8Array, off: number): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(off, true);
}

function parseInternedStrings(bytes: Uint8Array): readonly string[] {
  const spanOffset = u32(bytes, 28);
  const count = u32(bytes, 32);
  const bytesOffset = u32(bytes, 36);
  const bytesLen = u32(bytes, 40);
  if (count === 0) return Object.freeze([]);

  const tableEnd = bytesOffset + bytesLen;
  assert.ok(tableEnd <= bytes.byteLength, "string table must be in bounds");
  const out: string[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    const span = spanOffset + i * 8;
    const start = bytesOffset + u32(bytes, span);
    const end = start + u32(bytes, span + 4);
    assert.ok(end <= tableEnd, "string span must be in bounds");
    out.push(decoder.decode(bytes.subarray(start, end)));
  }
  return Object.freeze(out);
}

async function pushEvents(
  backend: StubBackend,
  events: NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(30);
}

async function emitResize(backend: StubBackend, timeMs = 1): Promise<void> {
  await pushEvents(backend, [{ kind: "resize", timeMs, cols: 70, rows: 18 }]);
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(30);
}

function latestFrameStrings(backend: StubBackend): readonly string[] {
  const frame = backend.requestedFrames[backend.requestedFrames.length - 1];
  return parseInternedStrings(frame ?? new Uint8Array());
}

test("errorBoundary isolates subtree throws and recovers via retry()", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: { crash: true } });
  let viewCalls = 0;
  let riskyRenders = 0;

  const Risky = defineWidget<{ crash: boolean; key?: string }>((props) => {
    riskyRenders++;
    if (props.crash) throw new Error("boundary boom");
    return ui.text("recovered-subtree");
  });

  app.view((state) => {
    viewCalls++;
    return ui.column({}, [
      ui.text("safe-root"),
      ui.errorBoundary({
        children: Risky({ crash: state.crash, key: "risky" }),
        fallback: (error) =>
          ui.column({}, [
            ui.text(`fallback:${error.message}`),
            ui.button({ id: "retry-boundary", label: "Retry", onPress: error.retry }),
          ]),
      }),
    ]);
  });

  await app.start();
  await emitResize(backend, 1);

  const framesAfterInitialRender = backend.requestedFrames.length;
  assert.equal(framesAfterInitialRender >= 1, true);
  let strings = latestFrameStrings(backend);
  assert.equal(strings.includes("safe-root"), true);
  assert.equal(strings.some((s) => s.includes("fallback:Error: boundary boom")), true);
  assert.equal(backend.stopCalls, 0);
  assert.equal(backend.disposeCalls, 0);
  assert.equal(viewCalls, 1);
  assert.equal(riskyRenders, 1);

  await settleNextFrame(backend);

  app.update((state) => ({ ...state, crash: false }));
  await flushMicrotasks(30);
  const framesAfterStateUpdate = backend.requestedFrames.length;
  assert.equal(framesAfterStateUpdate > framesAfterInitialRender, true);
  strings = latestFrameStrings(backend);
  assert.equal(viewCalls, 2);
  assert.equal(riskyRenders, 1);

  await settleNextFrame(backend);

  await pushEvents(backend, [
    { kind: "key", timeMs: 10, key: 3, mods: 0, action: "down" },
    { kind: "key", timeMs: 11, key: 2, mods: 0, action: "down" },
  ]);
  assert.equal(backend.requestedFrames.length > framesAfterStateUpdate, true);
  strings = latestFrameStrings(backend);
  assert.equal(strings.includes("recovered-subtree"), true);
  assert.equal(riskyRenders, 2);
});

test("top-level view throw renders built-in error screen and retries on R", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: { crash: true } });
  let viewCalls = 0;

  app.view((state) => {
    viewCalls++;
    if (state.crash) throw new Error("top-level boom");
    return ui.text("top-level-recovered");
  });

  await app.start();
  await emitResize(backend, 1);

  assert.equal(backend.requestedFrames.length, 1);
  let strings = latestFrameStrings(backend);
  assert.equal(strings.some((s) => s.includes("Press R to retry")), true);
  assert.equal(strings.includes("Message: top-level boom"), true);
  assert.equal(backend.stopCalls, 0);
  assert.equal(backend.disposeCalls, 0);
  assert.equal(viewCalls, 1);

  await settleNextFrame(backend);

  app.update((state) => ({ ...state, crash: false }));
  await flushMicrotasks(30);
  assert.equal(backend.requestedFrames.length, 2);
  strings = latestFrameStrings(backend);
  assert.equal(strings.some((s) => s.includes("Press R to retry")), true);
  assert.equal(viewCalls, 1);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 5, key: 82, mods: 0, action: "down" }]);
  assert.equal(backend.requestedFrames.length, 3);
  strings = latestFrameStrings(backend);
  assert.equal(strings.includes("top-level-recovered"), true);
  assert.equal(viewCalls, 2);
});

test("top-level view error screen handles Q by stopping and disposing the app", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: { crash: true } });

  app.view((state) => {
    if (state.crash) throw new Error("quit-me");
    return ui.text("ok");
  });

  await app.start();
  await emitResize(backend, 1);
  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 3, key: 81, mods: 0, action: "down" }]);

  assert.equal(backend.stopCalls >= 1, true);
  assert.equal(backend.disposeCalls >= 1, true);
});

test("app.run() wires SIGINT/SIGTERM/SIGHUP and performs graceful shutdown", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const exitCodes: number[] = [];
  const fakeProcess = {
    on: (signal: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(signal) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(signal, set);
    },
    off: (signal: string, handler: (...args: unknown[]) => void) => {
      listeners.get(signal)?.delete(handler);
    },
    exit: (code = 0) => {
      exitCodes.push(code);
    },
  };
  const g = globalThis as { process?: unknown };
  const prevProcess = g.process;
  g.process = fakeProcess;
  try {
    const runPromise = app.run();
    await flushMicrotasks(30);
    assert.equal(backend.startCalls, 1);
    assert.equal(listeners.get("SIGINT")?.size ?? 0, 1);
    assert.equal(listeners.get("SIGTERM")?.size ?? 0, 1);
    assert.equal(listeners.get("SIGHUP")?.size ?? 0, 1);

    for (const handler of listeners.get("SIGINT") ?? []) {
      handler("SIGINT");
    }

    await runPromise;
    await flushMicrotasks(30);

    assert.equal(backend.stopCalls, 1);
    assert.equal(backend.disposeCalls, 1);
    assert.deepEqual(exitCodes, [0]);
    assert.equal(listeners.get("SIGINT")?.size ?? 0, 0);
    assert.equal(listeners.get("SIGTERM")?.size ?? 0, 0);
    assert.equal(listeners.get("SIGHUP")?.size ?? 0, 0);
  } finally {
    g.process = prevProcess;
  }
});

test("app.run() resolves when app is stopped manually", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const exitCodes: number[] = [];
  const fakeProcess = {
    on: (signal: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(signal) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(signal, set);
    },
    off: (signal: string, handler: (...args: unknown[]) => void) => {
      listeners.get(signal)?.delete(handler);
    },
    exit: (code = 0) => {
      exitCodes.push(code);
    },
  };
  const g = globalThis as { process?: unknown };
  const prevProcess = g.process;
  g.process = fakeProcess;
  try {
    const runPromise = app.run();
    await flushMicrotasks(30);
    assert.equal(backend.startCalls, 1);
    assert.equal(listeners.get("SIGINT")?.size ?? 0, 1);
    assert.equal(listeners.get("SIGTERM")?.size ?? 0, 1);
    assert.equal(listeners.get("SIGHUP")?.size ?? 0, 1);

    await app.stop();
    await runPromise;
    await flushMicrotasks(30);

    assert.equal(backend.stopCalls, 1);
    assert.deepEqual(exitCodes, []);
    assert.equal(listeners.get("SIGINT")?.size ?? 0, 0);
    assert.equal(listeners.get("SIGTERM")?.size ?? 0, 0);
    assert.equal(listeners.get("SIGHUP")?.size ?? 0, 0);
  } finally {
    g.process = prevProcess;
  }
});
