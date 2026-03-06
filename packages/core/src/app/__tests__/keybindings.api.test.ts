import { assert, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

async function pushEvents(
  backend: StubBackend,
  events: NonNullable<Parameters<typeof encodeZrevBatchV1>[0]["events"]>,
): Promise<void> {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({ events }),
    }),
  );
  await flushMicrotasks(20);
}

async function settleNextFrame(backend: StubBackend): Promise<void> {
  backend.resolveNextFrame();
  await flushMicrotasks(20);
}

test("app.getBindings exposes sequence, description, and mode metadata", () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  app.keys({
    a: () => {},
    "ctrl+s": {
      handler: () => {},
      description: "Save document",
    },
  });
  app.modes({
    normal: {
      q: {
        handler: () => {},
        description: "Quit",
      },
    },
  });

  assert.deepEqual(app.getBindings(), [
    { sequence: "a", mode: "default" },
    { sequence: "ctrl+s", description: "Save document", mode: "default" },
    { sequence: "q", description: "Quit", mode: "normal" },
  ]);
  assert.deepEqual(app.getBindings("normal"), [
    { sequence: "q", description: "Quit", mode: "normal" },
  ]);
  assert.deepEqual(app.getBindings("missing"), []);
});

test("app.pendingChord reflects in-progress chord state", async () => {
  const backend = new StubBackend();
  let hits = 0;
  const app = createApp({ backend, initialState: 0 });
  app.view(() => ui.text("keybinding api"));
  app.keys({
    "g g": {
      handler: () => {
        hits++;
      },
      description: "Go to top",
    },
  });

  await app.start();
  try {
    assert.equal(app.pendingChord, null);

    await pushEvents(backend, [{ kind: "key", timeMs: 1, key: 71, mods: 0, action: "down" }]);
    assert.equal(app.pendingChord, "g");

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: 71, mods: 0, action: "down" }]);
    assert.equal(app.pendingChord, null);
    assert.equal(hits, 1);
  } finally {
    await app.stop();
  }
});

test("app.keys rejects invalid keybinding strings", () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  assert.throws(
    () =>
      app.keys({
        "invalid+++key": () => {},
      }),
    /invalid keybinding sequence/,
  );
});

test("app.modes rejects invalid bindings and unknown parent graphs", () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  assert.throws(
    () =>
      app.modes({
        normal: {
          "invalid+++key": () => {},
        },
      }),
    /invalid keybinding sequence/,
  );

  assert.throws(
    () =>
      app.modes({
        child: {
          parent: "missing",
          bindings: { q: () => {} },
        },
      }),
    /unknown parent mode/,
  );
});

test("app.modes allows cyclic parent graphs and leaves cycle handling to routing", () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  assert.doesNotThrow(() =>
    app.modes({
      a: {
        parent: "b",
        bindings: { x: () => {} },
      },
      b: {
        parent: "a",
        bindings: { y: () => {} },
      },
    }),
  );
});

test("keybinding mutation APIs reject updater-time re-entrancy", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());
  await app.start();

  const codes: string[] = [];

  app.update((prev) => {
    try {
      app.keys({ q: () => {} });
    } catch (e: unknown) {
      const code = (e as { code?: unknown }).code;
      if (typeof code === "string") codes.push(code);
    }
    return prev;
  });

  app.update((prev) => {
    try {
      app.modes({
        normal: { q: () => {} },
      });
    } catch (e: unknown) {
      const code = (e as { code?: unknown }).code;
      if (typeof code === "string") codes.push(code);
    }
    return prev;
  });

  app.modes({
    normal: { q: () => {} },
  });

  app.update((prev) => {
    try {
      app.setMode("normal");
    } catch (e: unknown) {
      const code = (e as { code?: unknown }).code;
      if (typeof code === "string") codes.push(code);
    }
    return prev;
  });

  await flushMicrotasks(5);
  assert.deepEqual(codes, ["ZRUI_REENTRANT_CALL", "ZRUI_REENTRANT_CALL", "ZRUI_REENTRANT_CALL"]);

  await app.stop();
});

test("chord-state transitions trigger rerenders for app.pendingChord consumers", async () => {
  const backend = new StubBackend();
  const snapshots: string[] = [];
  let readPendingChord: () => string | null = () => null;

  const app = createApp({
    backend,
    initialState: 0,
    config: {
      internal_onRender: () => {
        snapshots.push(readPendingChord() ?? "idle");
      },
    },
  });
  readPendingChord = () => app.pendingChord;

  app.view(() => ui.text(app.pendingChord ?? "idle"));
  app.keys({
    "g g": {
      handler: () => {},
      description: "Go to top",
    },
  });

  await app.start();
  try {
    await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 12 }]);
    assert.deepEqual(snapshots, ["idle"]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 2, key: 71, mods: 0, action: "down" }]);
    assert.deepEqual(snapshots, ["idle", "g"]);
    await settleNextFrame(backend);

    await pushEvents(backend, [{ kind: "key", timeMs: 3, key: 71, mods: 0, action: "down" }]);
    assert.deepEqual(snapshots, ["idle", "g", "idle"]);
    await settleNextFrame(backend);
  } finally {
    await app.stop();
  }
});
