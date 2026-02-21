import { assert, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import { defineWidget, ui } from "../../index.js";
import { ZR_KEY_ENTER, ZR_KEY_HOME, ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
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

function latestFrameStrings(backend: StubBackend): readonly string[] {
  const frame = backend.requestedFrames[backend.requestedFrames.length - 1];
  return parseInternedStrings(frame ?? new Uint8Array());
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

async function resolvePendingFrames(
  backend: StubBackend,
  tracker: Readonly<{ count: () => number; inc: () => void }>,
): Promise<void> {
  while (tracker.count() < backend.requestedFrames.length) {
    backend.resolveNextFrame();
    tracker.inc();
    await flushMicrotasks(20);
  }
}

test("replaceView while running preserves local widget state and focused input cursor", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: {} });

  const inputEvents: Array<readonly [string, number]> = [];
  let lastFocusedId: string | null = null;
  let resolvedFrames = 0;
  const frameTracker = {
    count: () => resolvedFrames,
    inc: () => {
      resolvedFrames++;
    },
  };

  const Counter = defineWidget<{ labelPrefix: string; key?: string }>((props, ctx) => {
    const [count, setCount] = ctx.useState(0);
    return ui.column({}, [
      ui.text(`${props.labelPrefix}${String(count)}`),
      ui.button({
        id: "inc",
        label: "Increment",
        onPress: () => setCount((prev) => prev + 1),
      }),
      ui.input({
        id: "name",
        value: "abc",
        onInput: (value, cursor) => {
          inputEvents.push([value, cursor]);
        },
      }),
    ]);
  });

  const initialView = () => ui.column({}, [Counter({ key: "counter", labelPrefix: "old:" })]);
  const reloadedView = () => ui.column({}, [Counter({ key: "counter", labelPrefix: "new:" })]);

  app.view(initialView);
  app.onFocusChange((info) => {
    lastFocusedId = info.id;
  });

  await app.start();
  await emitResize(backend);
  assert.equal(backend.requestedFrames.length, 1);
  assert.equal(latestFrameStrings(backend).includes("old:0"), true);
  await resolvePendingFrames(backend, frameTracker);

  await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_TAB, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);

  await pushEvents(backend, [{ kind: "key", timeMs: 3, key: ZR_KEY_ENTER, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);
  assert.equal(latestFrameStrings(backend).includes("old:1"), true);

  await pushEvents(backend, [{ kind: "key", timeMs: 4, key: ZR_KEY_TAB, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);
  assert.equal(lastFocusedId, "name");

  await pushEvents(backend, [{ kind: "key", timeMs: 5, key: ZR_KEY_HOME, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);

  const beforeReloadFrames = backend.requestedFrames.length;
  app.replaceView(reloadedView);
  await flushMicrotasks(30);
  assert.equal(backend.requestedFrames.length > beforeReloadFrames, true);
  assert.equal(latestFrameStrings(backend).includes("new:1"), true);
  await resolvePendingFrames(backend, frameTracker);

  await pushEvents(backend, [{ kind: "text", timeMs: 6, codepoint: 88 }]);
  await flushMicrotasks(30);

  const latestInput = inputEvents[inputEvents.length - 1];
  assert.deepEqual(latestInput, ["Xabc", 1]);
});

test("replaceView clears top-level error screen without requiring retry key", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  let resolvedFrames = 0;
  const frameTracker = {
    count: () => resolvedFrames,
    inc: () => {
      resolvedFrames++;
    },
  };

  app.view(() => {
    throw new Error("boom-before-reload");
  });

  await app.start();
  await emitResize(backend);
  assert.equal(backend.requestedFrames.length, 1);
  assert.equal(
    latestFrameStrings(backend).some((text) => text.includes("Press R to retry")),
    true,
  );
  await resolvePendingFrames(backend, frameTracker);

  app.replaceView(() => ui.text("reloaded-ok"));
  await flushMicrotasks(30);
  assert.equal(backend.requestedFrames.length, 2);
  assert.equal(latestFrameStrings(backend).includes("reloaded-ok"), true);
});

test("replaceView rejects draw mode", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  assert.throws(
    () => app.replaceView(() => ui.text("x")),
    (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_MODE_CONFLICT",
  );
});

test("replaceView rejects route-managed apps", () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: { count: 0 },
    routes: [
      {
        id: "home",
        screen: () => ui.text("home-screen"),
      },
    ],
    initialRoute: "home",
  });

  assert.throws(
    () => app.replaceView(() => ui.text("new-screen")),
    (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_MODE_CONFLICT",
  );
});

test("replaceRoutes while running preserves local widget state and focused input cursor", async () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: {},
    routes: [
      {
        id: "home",
        screen: () => ui.text("home"),
      },
      {
        id: "logs",
        screen: () => ui.text("placeholder"),
      },
    ],
    initialRoute: "home",
  });

  const inputEvents: Array<readonly [string, number]> = [];
  let resolvedFrames = 0;
  const frameTracker = {
    count: () => resolvedFrames,
    inc: () => {
      resolvedFrames++;
    },
  };

  const Counter = defineWidget<{ labelPrefix: string; key?: string }>((props, ctx) => {
    const [count, setCount] = ctx.useState(0);
    return ui.column({}, [
      ui.text(`${props.labelPrefix}${String(count)}`),
      ui.button({
        id: "inc",
        label: "Increment",
        onPress: () => setCount((prev) => prev + 1),
      }),
      ui.input({
        id: "name",
        value: "abc",
        onInput: (value, cursor) => {
          inputEvents.push([value, cursor]);
        },
      }),
    ]);
  });

  const buildRoutes = (labelPrefix: string) =>
    Object.freeze([
      {
        id: "home",
        screen: () => ui.text("home"),
      },
      {
        id: "logs",
        screen: () => ui.column({}, [Counter({ key: "counter", labelPrefix })]),
      },
    ] as const);

  app.replaceRoutes(buildRoutes("old:"));

  await app.start();
  await emitResize(backend);
  assert.equal(latestFrameStrings(backend).includes("home"), true);
  await resolvePendingFrames(backend, frameTracker);

  app.router?.navigate("logs");
  await flushMicrotasks(30);
  await resolvePendingFrames(backend, frameTracker);
  assert.equal(app.router?.currentRoute().id, "logs");
  assert.equal(latestFrameStrings(backend).includes("old:0"), true);

  await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_TAB, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);

  await pushEvents(backend, [{ kind: "key", timeMs: 3, key: ZR_KEY_ENTER, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);
  assert.equal(latestFrameStrings(backend).includes("old:1"), true);

  await pushEvents(backend, [{ kind: "key", timeMs: 4, key: ZR_KEY_TAB, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);

  await pushEvents(backend, [{ kind: "key", timeMs: 5, key: ZR_KEY_HOME, action: "down" }]);
  await resolvePendingFrames(backend, frameTracker);

  const beforeReloadFrames = backend.requestedFrames.length;
  app.replaceRoutes(buildRoutes("new:"));
  await flushMicrotasks(30);
  assert.equal(backend.requestedFrames.length > beforeReloadFrames, true);
  assert.equal(latestFrameStrings(backend).includes("new:1"), true);
  assert.deepEqual(app.router?.history(), [
    { id: "home", params: Object.freeze({}) },
    { id: "logs", params: Object.freeze({}) },
  ]);
  await resolvePendingFrames(backend, frameTracker);

  await pushEvents(backend, [{ kind: "text", timeMs: 6, codepoint: 88 }]);
  await flushMicrotasks(30);

  const latestInput = inputEvents[inputEvents.length - 1];
  assert.deepEqual(latestInput, ["Xabc", 1]);
});

test("replaceRoutes rejects non-route apps", () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.view(() => ui.text("view"));

  assert.throws(
    () =>
      app.replaceRoutes([
        {
          id: "home",
          screen: () => ui.text("home"),
        },
      ]),
    (error: unknown) => error instanceof ZrUiError && error.code === "ZRUI_MODE_CONFLICT",
  );
});

test("replaceRoutes clears top-level route render error without retry key", async () => {
  const backend = new StubBackend();
  let resolvedFrames = 0;
  const frameTracker = {
    count: () => resolvedFrames,
    inc: () => {
      resolvedFrames++;
    },
  };
  const app = createApp({
    backend,
    initialState: Object.freeze({}),
    routes: [
      {
        id: "home",
        screen: () => {
          throw new Error("route-crash-before-reload");
        },
      },
    ],
    initialRoute: "home",
  });

  await app.start();
  await emitResize(backend);
  assert.equal(
    latestFrameStrings(backend).some((text) => text.includes("Press R to retry")),
    true,
  );
  await resolvePendingFrames(backend, frameTracker);

  const beforeReloadFrames = backend.requestedFrames.length;
  app.replaceRoutes([
    {
      id: "home",
      screen: () => ui.text("route-reloaded-ok"),
    },
  ]);
  await flushMicrotasks(30);
  assert.equal(backend.requestedFrames.length > beforeReloadFrames, true);
  await resolvePendingFrames(backend, frameTracker);
  assert.equal(latestFrameStrings(backend).includes("route-reloaded-ok"), true);
});

test("replaceRoutes can be called before start and remaps initial route", async () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: Object.freeze({}),
    routes: [
      {
        id: "home",
        screen: () => ui.text("home"),
      },
      {
        id: "logs",
        screen: () => ui.text("logs"),
      },
    ],
    initialRoute: "home",
  });

  app.replaceRoutes([
    {
      id: "settings",
      screen: () => ui.text("settings"),
    },
  ]);

  await app.start();
  await emitResize(backend);
  assert.equal(app.router?.currentRoute().id, "settings");
  assert.equal(latestFrameStrings(backend).includes("settings"), true);
});
