import { assert, describe, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import type { BackendEventBatch, RuntimeBackend } from "../../backend.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { ui } from "../../widgets/ui.js";
import { createApp } from "../createApp.js";

async function flushMicrotasks(count = 8): Promise<void> {
  for (let i = 0; i < count; i++) {
    await Promise.resolve();
  }
}

function createBackend(overrides: Partial<RuntimeBackend> = {}): RuntimeBackend {
  const pendingPoll = new Promise<BackendEventBatch>(() => undefined);
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () => pendingPoll,
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
    ...overrides,
  };
}

function deferred(): Readonly<{
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
}> {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return Object.freeze({ promise, resolve, reject });
}

describe("app.ready()", () => {
  test("stays pending until start completes, then update() is accepted", async () => {
    const gate = deferred();
    const app = createApp<{ n: number }>({
      backend: createBackend({ start: () => gate.promise }),
      initialState: { n: 0 },
    });
    app.view((s) => ui.text(String(s.n)));

    let readyResolved = false;
    const ready = app.ready().then(() => {
      readyResolved = true;
    });

    const started = app.start();
    await flushMicrotasks();
    assert.equal(readyResolved, false, "ready must not resolve while start is in flight");
    assert.throws(
      () => app.update({ n: 1 }),
      (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_INVALID_STATE",
      "update before ready must throw the lifecycle guard error",
    );

    gate.resolve();
    await started;
    await ready;
    assert.equal(readyResolved, true);
    app.update({ n: 2 });
    app.dispose();
  });

  test("resolves immediately when the app is already running", async () => {
    const app = createApp<{ n: number }>({ backend: createBackend(), initialState: { n: 0 } });
    app.view((s) => ui.text(String(s.n)));
    await app.start();
    await app.ready();
    app.update({ n: 1 });
    app.dispose();
  });

  test("rejects when backend start fails", async () => {
    const app = createApp<{ n: number }>({
      backend: createBackend({ start: async () => Promise.reject(new Error("boom")) }),
      initialState: { n: 0 },
    });
    app.view((s) => ui.text(String(s.n)));

    const ready = app.ready();
    await assert.rejects(app.start(), (error: unknown) => {
      return error instanceof ZrUiError && error.code === "ZRUI_BACKEND_ERROR";
    });
    await assert.rejects(ready, (error: unknown) => {
      return error instanceof ZrUiError && error.code === "ZRUI_BACKEND_ERROR";
    });
    app.dispose();
  });

  test("rejects pending waiters when the app is disposed before starting", async () => {
    const app = createApp<{ n: number }>({ backend: createBackend(), initialState: { n: 0 } });
    app.view((s) => ui.text(String(s.n)));
    const ready = app.ready();
    app.dispose();
    await assert.rejects(ready, (error: unknown) => {
      return error instanceof ZrUiError && error.code === "ZRUI_INVALID_STATE";
    });
    await assert.rejects(app.ready(), (error: unknown) => {
      return error instanceof ZrUiError && error.code === "ZRUI_INVALID_STATE";
    });
  });

  test("works with run(): waiters resolve while run is still blocking", async () => {
    const app = createApp<{ n: number }>({ backend: createBackend(), initialState: { n: 0 } });
    app.view((s) => ui.text(String(s.n)));
    const running = app.run();
    await app.ready();
    app.update({ n: 41 });
    app.update((s) => ({ n: s.n + 1 }));
    await app.stop();
    await running;
    app.dispose();
  });
});
