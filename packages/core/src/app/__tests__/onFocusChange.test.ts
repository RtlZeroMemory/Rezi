import { assert, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { ZR_KEY_TAB } from "../../keybindings/keyCodes.js";
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

test("onFocusChange emits on initial focus and keyboard traversal", async () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: 0,
  });

  app.view(() =>
    ui.column({}, [ui.input({ id: "name", value: "" }), ui.button({ id: "save", label: "Save" })]),
  );

  const seenIds: Array<string | null> = [];
  app.onFocusChange((info) => {
    seenIds.push(info.id);
  });

  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
  assert.deepEqual(seenIds, []);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_TAB, action: "down" }]);
  assert.deepEqual(seenIds, ["name"]);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 3, key: ZR_KEY_TAB, action: "down" }]);
  assert.deepEqual(seenIds, ["name", "save"]);

  await settleNextFrame(backend);
});

test("onFocusChange unsubscribe stops future callbacks", async () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: 0,
  });

  app.view(() =>
    ui.column({}, [ui.input({ id: "name", value: "" }), ui.button({ id: "save", label: "Save" })]),
  );

  const seenIds: Array<string | null> = [];
  let unsubscribe: () => void = () => {};
  unsubscribe = app.onFocusChange((info) => {
    seenIds.push(info.id);
    if (seenIds.length === 1) unsubscribe();
  });

  await app.start();
  await pushEvents(backend, [{ kind: "resize", timeMs: 1, cols: 40, rows: 10 }]);
  assert.deepEqual(seenIds, []);

  await settleNextFrame(backend);

  await pushEvents(backend, [{ kind: "key", timeMs: 2, key: ZR_KEY_TAB, action: "down" }]);
  assert.deepEqual(seenIds, ["name"]);

  await settleNextFrame(backend);
});
