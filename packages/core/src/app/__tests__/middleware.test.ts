import { assert, describe, test } from "@rezi-ui/testkit";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

describe("app.use() middleware", () => {
  test("middleware receives events and can pass through", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    const seen: string[] = [];
    app.use((_ev, _ctx, next) => {
      seen.push("mw");
      next();
    });
    app.onEvent((ev) => {
      if (ev.kind === "engine") seen.push("handler");
    });

    await app.start();
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({ events: [{ kind: "text", timeMs: 1, codepoint: 65 }] }),
      }),
    );
    await flushMicrotasks(5);

    assert.ok(seen.includes("mw"));
    assert.ok(seen.includes("handler"));
  });

  test("middleware can suppress events by not calling next()", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    const seen: string[] = [];
    app.use((_ev, _ctx, _next) => {
      seen.push("mw-suppress");
      // no next()
    });
    app.onEvent(() => {
      seen.push("handler");
    });

    await app.start();
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({ events: [{ kind: "text", timeMs: 1, codepoint: 65 }] }),
      }),
    );
    await flushMicrotasks(5);

    assert.ok(seen.includes("mw-suppress"));
    assert.equal(seen.includes("handler"), false);
  });

  test("middleware can call ctx.update()", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    app.use((_ev, ctx, next) => {
      ctx.update((state) => state + 1);
      next();
    });

    await app.start();
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({ events: [{ kind: "text", timeMs: 1, codepoint: 65 }] }),
      }),
    );
    await flushMicrotasks(5);

    assert.equal(app.getState(), 1);
  });

  test("middleware chain executes in registration order", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    const order: number[] = [];
    app.use((_ev, _ctx, next) => {
      order.push(1);
      next();
    });
    app.use((_ev, _ctx, next) => {
      order.push(2);
      next();
    });
    app.use((_ev, _ctx, next) => {
      order.push(3);
      next();
    });

    await app.start();
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({ events: [{ kind: "text", timeMs: 1, codepoint: 65 }] }),
      }),
    );
    await flushMicrotasks(5);

    assert.deepEqual(order, [1, 2, 3]);
  });

  test("unsubscribe removes middleware", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: 0 });
    app.draw((g) => g.clear());

    const seen: string[] = [];
    const unsub = app.use((_ev, _ctx, next) => {
      seen.push("mw");
      next();
    });
    unsub();

    await app.start();
    backend.pushBatch(
      makeBackendBatch({
        bytes: encodeZrevBatchV1({ events: [{ kind: "text", timeMs: 1, codepoint: 65 }] }),
      }),
    );
    await flushMicrotasks(5);

    assert.equal(seen.includes("mw"), false);
  });

  test("getState() returns current committed state", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: { count: 42 } });
    app.draw((g) => g.clear());

    await app.start();
    assert.deepEqual(app.getState(), { count: 42 });
  });
});
