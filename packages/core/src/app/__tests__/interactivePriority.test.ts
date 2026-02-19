import { assert, test } from "@rezi-ui/testkit";
import { ui } from "../../widgets/ui.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

test("interactive input can overcommit one frame under backpressure", async () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: 0,
    config: { maxFramesInFlight: 1 },
  });

  app.draw((g) => g.clear());
  app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    if (ev.event.kind !== "text") return;
    app.update((n) => n + 1);
  });

  await app.start();
  await flushMicrotasks(3);
  assert.equal(backend.requestedFrames.length, 1);

  // Keep the initial frame unresolved (simulates a slow backend / worker).
  // An interactive input event should still trigger one urgent frame request.
  const bytes = encodeZrevBatchV1({
    flags: 0,
    events: [{ kind: "text", timeMs: 1, codepoint: "j".codePointAt(0) ?? 0 }],
  });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(5);
  assert.equal(backend.requestedFrames.length, 2);
});

test("non-interactive workload does not overcommit frames under backpressure", async () => {
  const backend = new StubBackend();
  const app = createApp({
    backend,
    initialState: 0,
    config: { maxFramesInFlight: 1 },
  });

  app.draw((g) => g.clear());
  app.onEvent((ev) => {
    if (ev.kind !== "engine") return;
    if (ev.event.kind !== "resize") return;
    app.update((n) => n + 1);
  });

  await app.start();
  await flushMicrotasks(3);
  assert.equal(backend.requestedFrames.length, 1);

  // Keep the initial frame unresolved; tick updates should not bypass the
  // maxFramesInFlight backpressure.
  const bytes = encodeZrevBatchV1({
    flags: 0,
    events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
  });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(5);
  assert.equal(backend.requestedFrames.length, 1);
});

test("raw mode tick does not force render when no state changed", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  app.draw((g) => g.clear());

  await app.start();
  await flushMicrotasks(3);
  assert.equal(backend.requestedFrames.length, 1);

  backend.resolveNextFrame();
  await flushMicrotasks(3);

  const bytes = encodeZrevBatchV1({
    flags: 0,
    events: [{ kind: "tick", timeMs: 10 }],
  });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(5);
  assert.equal(backend.requestedFrames.length, 1);
});

test("widget mode tick does not force render when no spinner exists", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  app.view(() => ui.text("static"));

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        flags: 0,
        events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 1);

  backend.resolveNextFrame();
  await flushMicrotasks(3);

  const bytes = encodeZrevBatchV1({
    flags: 0,
    events: [{ kind: "tick", timeMs: 10 }],
  });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(5);
  assert.equal(backend.requestedFrames.length, 1);
});

test("widget mode spinner tick rendering is throttled", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });

  app.view(() => ui.spinner({ variant: "line", label: "Loading" }));

  await app.start();
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        flags: 0,
        events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
      }),
    }),
  );
  await flushMicrotasks(10);
  assert.equal(backend.requestedFrames.length, 1);

  backend.resolveNextFrame();
  await flushMicrotasks(3);

  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        flags: 0,
        events: [
          { kind: "tick", timeMs: 10 },
          { kind: "tick", timeMs: 20 },
          { kind: "tick", timeMs: 30 },
          { kind: "tick", timeMs: 40 },
        ],
      }),
    }),
  );
  await flushMicrotasks(5);
  assert.equal(backend.requestedFrames.length, 2);

  backend.resolveNextFrame();
  await flushMicrotasks(3);

  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        flags: 0,
        events: [{ kind: "tick", timeMs: 200 }],
      }),
    }),
  );
  await flushMicrotasks(5);
  assert.equal(backend.requestedFrames.length, 3);
});
