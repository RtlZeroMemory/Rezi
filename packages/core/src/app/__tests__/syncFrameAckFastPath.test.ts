import { assert, test } from "@rezi-ui/testkit";
import { defineWidget, ui } from "../../index.js";
import { createApp } from "../createApp.js";
import { encodeZrevBatchV1, flushMicrotasks, makeBackendBatch } from "./helpers.js";
import { StubBackend } from "./stubBackend.js";

const SYNC_FRAME_ACK_MARKER = "__reziSyncFrameAck";
const SYNC_FRAME_ACK = Promise.resolve() as Promise<void> &
  Readonly<Record<typeof SYNC_FRAME_ACK_MARKER, true>>;
Object.defineProperty(SYNC_FRAME_ACK, SYNC_FRAME_ACK_MARKER, {
  value: true,
  configurable: false,
  enumerable: false,
  writable: false,
});

class SyncFrameAckBackend extends StubBackend {
  override requestFrame(drawlist: Uint8Array): Promise<void> {
    this.requestedFrames.push(drawlist);
    this.callLog.push("requestFrame");
    return SYNC_FRAME_ACK;
  }
}

test("sync frame-ack marker allows next render without waiting for frameSettled turn", async () => {
  const backend = new SyncFrameAckBackend();
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

  const bytes = encodeZrevBatchV1({
    flags: 0,
    events: [{ kind: "resize", timeMs: 1, cols: 120, rows: 40 }],
  });
  backend.pushBatch(makeBackendBatch({ bytes }));

  await flushMicrotasks(3);
  assert.equal(backend.requestedFrames.length, 2);

  app.dispose();
});

test("sync frame-ack still schedules a follow-up frame for effect-driven invalidation", async () => {
  const backend = new SyncFrameAckBackend();
  const app = createApp({
    backend,
    initialState: 0,
    config: { maxFramesInFlight: 1 },
  });

  const seenCounts: number[] = [];
  const Counter = defineWidget<{ key?: string }>((_props, ctx) => {
    const [count, setCount] = ctx.useState(0);
    seenCounts.push(count);
    ctx.useEffect(() => {
      if (count === 0) setCount(1);
    }, [count]);
    return ui.text(`count:${String(count)}`);
  });

  app.view(() => Counter({ key: "counter" }));
  await app.start();

  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs: 1, cols: 80, rows: 24 }],
      }),
    }),
  );

  await flushMicrotasks(20);

  assert.equal(backend.requestedFrames.length, 2);
  assert.deepEqual(seenCounts, [0, 1]);

  app.dispose();
});
