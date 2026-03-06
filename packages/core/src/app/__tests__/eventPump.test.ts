import { assert, test } from "@rezi-ui/testkit";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

test("event pump ordering + overrun emission + release semantics (#60)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  const seen: string[] = [];
  app.onEvent((ev) => {
    if (ev.kind === "overrun") {
      seen.push(`overrun:${ev.engineTruncated ? 1 : 0}:${ev.droppedBatches}`);
    }
    if (ev.kind === "engine") {
      seen.push(`engine:${ev.event.kind}`);
    }
  });

  await app.start();

  let released = 0;
  const bytes = encodeZrevBatchV1({
    flags: 1,
    events: [{ kind: "text", timeMs: 1, codepoint: 65 }],
  });
  backend.pushBatch(makeBackendBatch({ bytes, droppedBatches: 2, onRelease: () => released++ }));

  await flushMicrotasks(5);

  assert.deepEqual(seen, ["overrun:1:2", "engine:text"]);
  assert.equal(released, 1);
});

test("parse failure is fatal protocol error and still releases batch (#60/#63)", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  const fatal: string[] = [];
  app.onEvent((ev) => {
    if (ev.kind === "fatal") fatal.push(ev.code);
  });

  await app.start();

  let released = 0;
  const bad = new Uint8Array(24);
  backend.pushBatch(makeBackendBatch({ bytes: bad, onRelease: () => released++ }));

  await flushMicrotasks(5);

  assert.deepEqual(fatal, ["ZRUI_PROTOCOL_ERROR"]);
  assert.equal(released, 1);
  assert.equal(backend.stopCalls, 1);
  assert.equal(backend.disposeCalls, 1);
});

test("faulted turn drains remaining batches without double-releasing processed batch", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  app.onEvent((ev) => {
    if (ev.kind === "engine" && ev.event.kind === "text") {
      throw new Error("boom");
    }
  });

  await app.start();

  let firstReleased = 0;
  let secondReleased = 0;
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "text", timeMs: 1, codepoint: 65 }],
      }),
      onRelease: () => firstReleased++,
    }),
  );
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "text", timeMs: 2, codepoint: 66 }],
      }),
      onRelease: () => secondReleased++,
    }),
  );

  await flushMicrotasks(20);

  assert.equal(firstReleased, 1);
  assert.equal(secondReleased, 1);
});
