import { assert, test } from "@rezi-ui/testkit";
import { createRunSignalController, readProcessLike } from "../createApp/runSignals.js";

test("run signal controller detaches listeners and resolves after signal handling", async () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const proc = {
    on: (signal: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(signal) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(signal, set);
    },
    off: (signal: string, handler: (...args: unknown[]) => void) => {
      listeners.get(signal)?.delete(handler);
    },
  };
  const events: string[] = [];

  const controller = createRunSignalController({
    onDetached: () => {
      events.push("detached");
    },
    onSignal: async () => {
      events.push("signal");
    },
    processLike: proc,
    signals: ["SIGINT", "SIGTERM"],
  });

  assert.equal(controller.canRegisterSignals, true);
  assert.equal(listeners.get("SIGINT")?.size ?? 0, 1);
  assert.equal(listeners.get("SIGTERM")?.size ?? 0, 1);

  for (const handler of listeners.get("SIGINT") ?? []) {
    handler("SIGINT");
  }
  await controller.promise;

  assert.deepEqual(events, ["detached", "signal"]);
  assert.equal(listeners.get("SIGINT")?.size ?? 0, 0);
  assert.equal(listeners.get("SIGTERM")?.size ?? 0, 0);
});

test("run signal controller settles cleanly without process hooks", async () => {
  let detached = 0;
  const controller = createRunSignalController({
    onDetached: () => {
      detached++;
    },
    onSignal: () => {
      throw new Error("signal handler should not run without listeners");
    },
    processLike: null,
  });

  assert.equal(controller.canRegisterSignals, false);
  controller.settle();
  await controller.promise;
  controller.detach();

  assert.equal(detached, 1);
});

test("run signal controller resolves when onSignal throws synchronously", async () => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const proc = {
    on: (signal: string, handler: (...args: unknown[]) => void) => {
      const set = listeners.get(signal) ?? new Set<(...args: unknown[]) => void>();
      set.add(handler);
      listeners.set(signal, set);
    },
    off: (signal: string, handler: (...args: unknown[]) => void) => {
      listeners.get(signal)?.delete(handler);
    },
  };
  const events: string[] = [];

  const controller = createRunSignalController({
    onDetached: () => {
      events.push("detached");
    },
    onSignal: () => {
      events.push("signal");
      throw new Error("boom");
    },
    processLike: proc,
    signals: ["SIGINT"],
  });

  for (const handler of listeners.get("SIGINT") ?? []) {
    handler("SIGINT");
  }
  await controller.promise;

  assert.deepEqual(events, ["detached", "signal"]);
  assert.equal(listeners.get("SIGINT")?.size ?? 0, 0);
});

test("readProcessLike ignores non-object process globals", () => {
  const g = globalThis as { process?: unknown };
  const prevProcess = g.process;
  try {
    g.process = 123;
    assert.equal(readProcessLike(), null);
  } finally {
    g.process = prevProcess;
  }
});
