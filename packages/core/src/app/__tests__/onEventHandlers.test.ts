import { assert, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

test("onEvent handler ordering + unsubscribe semantics (#80)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  app.draw((g) => g.clear());

  const calls: string[] = [];

  let unsubB: (() => void) | null = null;
  app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    calls.push("A");
    if (calls.length === 1) unsubB?.();
  });
  unsubB = app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    calls.push("B");
  });
  app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    calls.push("C");
  });

  await app.start();

  const bytes = encodeZrevBatchV1({
    events: [
      { kind: "text", timeMs: 1, codepoint: 65 },
      { kind: "text", timeMs: 2, codepoint: 66 },
    ],
  });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(5);

  // B is unsubscribed during the first event dispatch, but still receives that event.
  // It is not called for subsequent events.
  assert.deepEqual(calls, ["A", "B", "C", "A", "C"]);
});

test("onEvent handler failure aborts the current batch before later events commit", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  const rendered: number[] = [];
  app.view((state) => {
    rendered.push(state);
    return ui.text(`count:${String(state)}`);
  });

  let applyResizeUpdates = false;
  app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    if (ev.event.kind === "text") throw new Error("boom");
    if (applyResizeUpdates && ev.event.kind === "resize") {
      app.update((n) => n + 1);
    }
  });

  const fatals: string[] = [];
  app.onEvent((ev) => {
    if (ev.kind === "fatal") fatals.push(ev.detail);
  });

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
      }),
    }),
  );
  await flushMicrotasks(10);

  assert.deepEqual(rendered, [0]);
  assert.equal(backend.requestedFrames.length, 1);

  backend.resolveNextFrame();
  await flushMicrotasks(10);

  applyResizeUpdates = true;
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [
          { kind: "text", timeMs: 2, codepoint: 65 },
          { kind: "resize", timeMs: 3, cols: 81, rows: 24 },
        ],
      }),
    }),
  );
  await flushMicrotasks(20);

  assert.equal(fatals.length, 1);
  assert.deepEqual(rendered, [0]);
  assert.equal(backend.requestedFrames.length, 1);
  assert.equal(backend.stopCalls, 1);
  assert.equal(backend.disposeCalls, 1);
});
