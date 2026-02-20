import { assert, test } from "@rezi-ui/testkit";
import type { BackendEventBatch, RuntimeBackend } from "../../backend.js";
import { DEFAULT_TERMINAL_CAPS, type TerminalCaps } from "../../terminalCaps.js";
import {
  DEFAULT_TERMINAL_PROFILE,
  type TerminalProfile,
  terminalProfileFromCaps,
} from "../../terminalProfile.js";
import { createApp } from "../createApp.js";

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
