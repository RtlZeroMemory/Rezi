import { assert, test } from "@rezi-ui/testkit";
import { ZrUiError } from "../../abi.js";
import { darkTheme } from "../../theme/presets.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

test("update() commits at end of explicit user turn (#57)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());
  await app.start();

  const seen: number[] = [];
  app.update((prev) => {
    seen.push(prev);
    return prev + 1;
  });
  app.update((prev) => {
    seen.push(prev);
    return prev + 1;
  });
  assert.deepEqual(seen, []);

  await flushMicrotasks(3);
  assert.deepEqual(seen, [0, 1]);
});

test("update() inside onEvent commits at end of batch (#57)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  const log: string[] = [];
  app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    log.push("handler");
    app.update((prev) => {
      log.push(`updater:${prev}`);
      return prev;
    });
  });

  await app.start();

  const bytes = encodeZrevBatchV1({ events: [{ kind: "text", timeMs: 1, codepoint: 65 }] });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(5);
  assert.deepEqual(log, ["handler", "updater:0"]);
});

test("update() during render throws ZRUI_UPDATE_DURING_RENDER (#57)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  const codes: string[] = [];
  const details: string[] = [];
  app.draw((g) => {
    try {
      app.update((s) => s);
    } catch (e: unknown) {
      if (e instanceof ZrUiError) {
        codes.push(e.code);
        details.push(e.message);
      }
    }
    g.clear();
  });

  await app.start();
  await flushMicrotasks(3);

  assert.deepEqual(codes, ["ZRUI_UPDATE_DURING_RENDER"]);
  assert.equal(details.length, 1);
  assert.equal(details[0]?.includes("update: called during render"), true);
  assert.equal(details[0]?.includes("Hint:"), true);
});

test("setTheme() during render throws ZRUI_UPDATE_DURING_RENDER with hint", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  const codes: string[] = [];
  const details: string[] = [];
  app.draw((g) => {
    try {
      app.setTheme(darkTheme);
    } catch (e: unknown) {
      if (e instanceof ZrUiError) {
        codes.push(e.code);
        details.push(e.message);
      }
    }
    g.clear();
  });

  await app.start();
  await flushMicrotasks(3);

  assert.deepEqual(codes, ["ZRUI_UPDATE_DURING_RENDER"]);
  assert.equal(details.length, 1);
  assert.equal(details[0]?.includes("setTheme: called during render"), true);
  assert.equal(details[0]?.includes("Hint:"), true);
});

test("app API calls during commit throw ZRUI_REENTRANT_CALL (#57)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());
  await app.start();

  const codes: string[] = [];
  app.update((prev) => {
    try {
      app.update((s) => s);
    } catch (e: unknown) {
      if (e instanceof ZrUiError) codes.push(e.code);
    }
    return prev;
  });

  await flushMicrotasks(3);
  assert.deepEqual(codes, ["ZRUI_REENTRANT_CALL"]);
});

test("explicit undefined initialState is preserved", async () => {
  const backend = new StubBackend();
  const app = createApp<undefined>({ backend, initialState: undefined });
  app.draw((g) => g.clear());
  await app.start();

  const seen: unknown[] = [];
  app.update((prev) => {
    seen.push(prev);
    return prev;
  });

  await flushMicrotasks(3);
  assert.deepEqual(seen, [undefined]);

  app.dispose();
});

test("explicit null initialState is preserved", async () => {
  const backend = new StubBackend();
  const app = createApp<null>({ backend, initialState: null });
  app.draw((g) => g.clear());
  await app.start();

  const seen: unknown[] = [];
  app.update((prev) => {
    seen.push(prev);
    return prev;
  });

  await flushMicrotasks(3);
  assert.deepEqual(seen, [null]);

  app.dispose();
});
