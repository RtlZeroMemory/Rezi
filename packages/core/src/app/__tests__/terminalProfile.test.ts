import { assert, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import type { BackendEventBatch, RuntimeBackend } from "../../backend.js";
import { DEFAULT_TERMINAL_CAPS, type TerminalCaps } from "../../terminalCaps.js";
import {
  DEFAULT_TERMINAL_PROFILE,
  type TerminalProfile,
  terminalProfileFromCaps,
} from "../../terminalProfile.js";
import { createApp } from "../createApp.js";

async function flushMicrotasks(count = 5): Promise<void> {
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

function deferred<T>(): Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
}> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return Object.freeze({ promise, resolve });
}

test("createApp exposes backend terminal profile after start", async () => {
  let getCapsCalls = 0;
  const expected: TerminalProfile = Object.freeze({
    ...DEFAULT_TERMINAL_PROFILE,
    id: "mock-term",
    versionString: "1.2.3",
    supportsKittyGraphics: true,
    supportsSixel: true,
    supportsIterm2Images: true,
    supportsUnderlineStyles: true,
    supportsColoredUnderlines: true,
    supportsHyperlinks: true,
    cellWidthPx: 9,
    cellHeightPx: 18,
  });
  const backend = createBackend({
    getCaps: async () => {
      getCapsCalls++;
      return DEFAULT_TERMINAL_CAPS;
    },
    getTerminalProfile: async () => expected,
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  assert.deepEqual(app.getTerminalProfile(), DEFAULT_TERMINAL_PROFILE);
  await app.start();
  assert.equal(getCapsCalls, 0);
  assert.deepEqual(app.getTerminalProfile(), expected);
  await app.stop();
  app.dispose();
});

test("createApp falls back to caps-derived profile when backend profile fails", async () => {
  const caps: TerminalCaps = Object.freeze({
    ...DEFAULT_TERMINAL_CAPS,
    supportsOsc52: true,
    sgrAttrsSupported: 1 << 2,
  });
  const backend = createBackend({
    getCaps: async () => caps,
    getTerminalProfile: async () => {
      throw new Error("profile unavailable");
    },
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  await app.start();
  assert.deepEqual(app.getTerminalProfile(), terminalProfileFromCaps(caps));
  await app.stop();
  app.dispose();
});

test("createApp falls back to default profile when caps/profile both fail", async () => {
  const backend = createBackend({
    getCaps: async () => {
      throw new Error("caps unavailable");
    },
    getTerminalProfile: async () => {
      throw new Error("profile unavailable");
    },
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  await app.start();
  assert.deepEqual(app.getTerminalProfile(), DEFAULT_TERMINAL_PROFILE);
  await app.stop();
  app.dispose();
});

test("createApp keeps lifecycle locked while terminal profile load is pending", async () => {
  const profileDeferred = deferred<TerminalProfile>();
  let startCalls = 0;
  const backend = createBackend({
    start: async () => {
      startCalls++;
    },
    getTerminalProfile: async () => profileDeferred.promise,
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  const startPromise = app.start();
  await flushMicrotasks();

  assert.throws(
    () => app.start(),
    (error: unknown) =>
      error instanceof Error && error.message === "start: lifecycle operation already in flight",
  );

  profileDeferred.resolve(DEFAULT_TERMINAL_PROFILE);
  await startPromise;

  assert.equal(startCalls, 1);
  await app.stop();
  app.dispose();
});

test("dispose during pending terminal profile load aborts startup and stops backend", async () => {
  const profileDeferred = deferred<TerminalProfile>();
  let stopCalls = 0;
  let disposeCalls = 0;
  const backend = createBackend({
    stop: async () => {
      stopCalls++;
    },
    dispose: () => {
      disposeCalls++;
    },
    getTerminalProfile: async () => profileDeferred.promise,
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  const startPromise = app.start();
  await flushMicrotasks();

  app.dispose();
  profileDeferred.resolve(DEFAULT_TERMINAL_PROFILE);
  await startPromise;
  await flushMicrotasks();

  assert.equal(stopCalls, 1);
  assert.equal(disposeCalls, 1);
});

test("createApp rejects a second start while terminal profile loading is still pending", async () => {
  const profile = deferred<TerminalProfile>();
  let startCalls = 0;
  const backend = createBackend({
    start: async () => {
      startCalls++;
    },
    getTerminalProfile: async () => profile.promise,
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  const startPromise = app.start();
  await Promise.resolve();

  assert.throws(
    () => app.start(),
    (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_INVALID_STATE",
  );
  assert.equal(startCalls, 1);

  profile.resolve(DEFAULT_TERMINAL_PROFILE);
  await startPromise;
  await app.stop();
  app.dispose();
});

test("dispose during pending startup prevents late completion from reviving the app", async () => {
  const profile = deferred<TerminalProfile>();
  let disposeCalls = 0;
  let stopCalls = 0;
  const backend = createBackend({
    stop: async () => {
      stopCalls++;
    },
    getTerminalProfile: async () => profile.promise,
    dispose: () => {
      disposeCalls++;
    },
  });
  const app = createApp({ backend, initialState: {} });
  app.draw(() => {});

  const startPromise = app.start();
  await Promise.resolve();
  app.dispose();
  profile.resolve(DEFAULT_TERMINAL_PROFILE);
  await startPromise;

  assert.equal(stopCalls, 1);
  assert.equal(disposeCalls, 1);
  assert.deepEqual(app.getTerminalProfile(), DEFAULT_TERMINAL_PROFILE);
  assert.throws(
    () => app.update((state) => state),
    (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_INVALID_STATE",
  );
});
