import { assert, test } from "@rezi-ui/testkit";
import { createApp } from "../createApp.js";
import { flushMicrotasks } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

test("stub backend poll failure faults the app and disposes backend", async () => {
  const backend = new StubBackend();
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  const fatals: string[] = [];
  app.onEvent((event) => {
    if (event.kind === "fatal") fatals.push(`${event.code}:${event.detail}`);
  });

  await app.start();
  backend.resolveNextFrame();
  await flushMicrotasks(10);

  backend.queuePollFailure(new Error("poll boom"));
  await flushMicrotasks(20);

  assert.equal(fatals.length >= 1, true);
  assert.equal(fatals[0]?.startsWith("ZRUI_BACKEND_ERROR:pollEvents rejected:"), true);
  assert.equal(backend.stopCalls, 1);
  assert.equal(backend.disposeCalls, 1);
});

test("stub backend start failure is reusable for lifecycle tests", async () => {
  const backend = new StubBackend();
  backend.queueStartFailure(new Error("start boom"));
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  await assert.rejects(app.start(), /backend.start rejected: Error: start boom/);
});

test("stub backend getCaps failure queue is reusable for startup fallback tests", async () => {
  const backend = new StubBackend();
  backend.queueGetCapsFailure(new Error("caps unavailable"));
  const app = createApp({ backend, initialState: 0 });
  app.draw((g) => g.clear());

  await app.start();
  assert.equal(backend.startCalls, 1);
  await app.stop();
  app.dispose();
});
