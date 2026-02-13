import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { DEFAULT_TERMINAL_CAPS, ZrUiError, parseEventBatchV1 } from "@rezi-ui/core";
import { createNodeBackendInternal } from "../backend/nodeBackend.js";
import {
  FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD,
  FRAME_SAB_CONTROL_HEADER_WORDS,
  FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD,
  FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD,
  FRAME_SAB_CONTROL_WORDS_PER_SLOT,
  FRAME_SAB_SLOT_STATE_FREE,
  FRAME_SAB_SLOT_STATE_READY,
  FRAME_TRANSPORT_SAB_V1,
  FRAME_TRANSPORT_VERSION,
  type MainToWorkerMessage,
  type WorkerToMainMessage,
} from "../worker/protocol.js";

type Msg = WorkerToMainMessage;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeWorker(): Worker {
  const entry = new URL("../worker/engineWorker.js", import.meta.url);
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  return new Worker(entry, { workerData: { nativeShimModule: shim } });
}

function waitFor(worker: Worker, pred: (m: Msg) => boolean): Promise<Msg> {
  return new Promise((resolve, reject) => {
    const onMsg = (m: unknown) => {
      if (typeof m !== "object" || m === null) return;
      const type = (m as { type?: unknown }).type;
      if (typeof type !== "string") return;
      const msg = m as Msg;
      if (msg.type === "fatal") {
        cleanup();
        reject(new Error(`worker fatal: ${msg.where} (${msg.code}): ${msg.detail}`));
        return;
      }
      if (pred(msg)) {
        cleanup();
        resolve(msg);
      }
    };

    const onExit = (code: number) => {
      cleanup();
      reject(new Error(`worker exited before expected message: code=${String(code)}`));
    };

    const cleanup = () => {
      worker.off("message", onMsg);
      worker.off("exit", onExit);
    };

    worker.on("message", onMsg);
    worker.on("exit", onExit);
  });
}

function post(worker: Worker, msg: MainToWorkerMessage, transfer?: readonly ArrayBuffer[]): void {
  if (transfer !== undefined) {
    worker.postMessage(msg, transfer as unknown as Array<ArrayBuffer>);
    return;
  }
  worker.postMessage(msg);
}

test("worker: init/ready + latest-wins transfer mailbox avoids stale fatal", async () => {
  const worker = makeWorker();
  try {
    // Frame #1 would fatal if submitted; frame #2 is valid. With latest-wins
    // mailbox semantics and back-to-back queueing before first tick, only #2
    // should be consumed.
    const stale = Uint8Array.from([0xff, 1, 2, 3]);
    const latest = Uint8Array.from([9, 8, 7, 6]);
    const ab1 = stale.buffer.slice(0);
    const ab2 = latest.buffer.slice(0);

    // Queue init + frames before awaiting "ready" so frame messages are
    // coalesced before the first worker tick.
    post(worker, { type: "init", config: { maxEventBytes: 1024, fpsCap: 1000 } });
    post(worker, { type: "frame", frameSeq: 1, drawlist: ab1, byteLen: stale.byteLength }, [ab1]);
    post(worker, { type: "frame", frameSeq: 2, drawlist: ab2, byteLen: latest.byteLength }, [ab2]);

    await waitFor(worker, (m) => m.type === "ready");
    await delay(25);
    post(worker, { type: "shutdown" });
    await waitFor(worker, (m) => m.type === "shutdownComplete");
    await once(worker, "exit");
  } finally {
    await worker.terminate();
  }
});

test("worker: SAB transport mailbox latest-wins + slot release", async () => {
  const worker = makeWorker();
  const slotCount = 2;
  const slotBytes = 32;
  const control = new SharedArrayBuffer(
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount * FRAME_SAB_CONTROL_WORDS_PER_SLOT) *
      Int32Array.BYTES_PER_ELEMENT,
  );
  const header = new Int32Array(control, 0, FRAME_SAB_CONTROL_HEADER_WORDS);
  const states = new Int32Array(
    control,
    FRAME_SAB_CONTROL_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const tokens = new Int32Array(
    control,
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount) * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const data = new SharedArrayBuffer(slotCount * slotBytes);
  const dataView = new Uint8Array(data);

  const publishSabFrame = (
    slotIndex: number,
    bytes: Uint8Array,
    frameSeq: number,
    slotToken = frameSeq,
  ): void => {
    const off = slotIndex * slotBytes;
    dataView.fill(0, off, off + slotBytes);
    dataView.set(bytes, off);
    Atomics.store(tokens, slotIndex, slotToken);
    Atomics.store(states, slotIndex, FRAME_SAB_SLOT_STATE_READY);
    Atomics.store(header, FRAME_SAB_CONTROL_PUBLISHED_SLOT_WORD, slotIndex);
    Atomics.store(header, FRAME_SAB_CONTROL_PUBLISHED_BYTES_WORD, bytes.byteLength);
    Atomics.store(header, FRAME_SAB_CONTROL_PUBLISHED_TOKEN_WORD, slotToken);
    Atomics.store(header, FRAME_SAB_CONTROL_PUBLISHED_SEQ_WORD, frameSeq);
  };

  try {
    post(worker, {
      type: "init",
      config: {
        maxEventBytes: 1024,
        fpsCap: 1000,
        frameTransport: {
          kind: FRAME_TRANSPORT_SAB_V1,
          version: FRAME_TRANSPORT_VERSION,
          slotCount,
          slotBytes,
          control,
          data,
        },
      },
    });

    await waitFor(worker, (m) => m.type === "ready");
    publishSabFrame(0, Uint8Array.from([0xff, 1, 2, 3]), 1, 11);
    publishSabFrame(1, Uint8Array.from([8, 7, 6, 5, 4, 3, 2, 1]), 2, 22);
    post(worker, { type: "frameKick", frameSeq: 2 });

    const frameStatus = (await waitFor(
      worker,
      (m) => m.type === "frameStatus" && m.completedSeq === 2,
    )) as Extract<WorkerToMainMessage, Readonly<{ type: "frameStatus" }>>;

    assert.equal(frameStatus.acceptedSeq, 2);
    assert.equal(frameStatus.completedResult, 0);
    assert.equal(Atomics.load(states, 1), FRAME_SAB_SLOT_STATE_FREE);
    assert.notEqual(Atomics.load(states, 0), 1);

    post(worker, { type: "shutdown" });
    await waitFor(worker, (m) => m.type === "shutdownComplete");
    await once(worker, "exit");
  } finally {
    await worker.terminate();
  }
});

test("worker: SAB stale token frame is dropped without fatal and latest token wins", async () => {
  const worker = makeWorker();
  const slotCount = 1;
  const slotBytes = 32;
  const control = new SharedArrayBuffer(
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount * FRAME_SAB_CONTROL_WORDS_PER_SLOT) *
      Int32Array.BYTES_PER_ELEMENT,
  );
  const header = new Int32Array(control, 0, FRAME_SAB_CONTROL_HEADER_WORDS);
  const states = new Int32Array(
    control,
    FRAME_SAB_CONTROL_HEADER_WORDS * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const tokens = new Int32Array(
    control,
    (FRAME_SAB_CONTROL_HEADER_WORDS + slotCount) * Int32Array.BYTES_PER_ELEMENT,
    slotCount,
  );
  const data = new SharedArrayBuffer(slotCount * slotBytes);
  const dataView = new Uint8Array(data);

  const writeSabSlot = (bytes: Uint8Array, slotToken: number): void => {
    dataView.fill(0, 0, slotBytes);
    dataView.set(bytes, 0);
    Atomics.store(tokens, 0, slotToken);
    Atomics.store(states, 0, FRAME_SAB_SLOT_STATE_READY);
  };

  try {
    post(worker, {
      type: "init",
      config: {
        maxEventBytes: 1024,
        fpsCap: 1000,
        frameTransport: {
          kind: FRAME_TRANSPORT_SAB_V1,
          version: FRAME_TRANSPORT_VERSION,
          slotCount,
          slotBytes,
          control,
          data,
        },
      },
    });

    await waitFor(worker, (m) => m.type === "ready");

    // Simulate a stale message (slot token advanced before this message is consumed).
    writeSabSlot(Uint8Array.from([9, 9, 9, 9]), 22);
    post(worker, {
      type: "frame",
      frameSeq: 1,
      byteLen: 4,
      transport: FRAME_TRANSPORT_SAB_V1,
      slotIndex: 0,
      slotToken: 21,
    });

    // Deliver the latest frame for the current token.
    writeSabSlot(Uint8Array.from([1, 2, 3, 4]), 22);
    post(worker, {
      type: "frame",
      frameSeq: 2,
      byteLen: 4,
      transport: FRAME_TRANSPORT_SAB_V1,
      slotIndex: 0,
      slotToken: 22,
    });
    post(worker, { type: "frameKick", frameSeq: 2 });

    await delay(25);

    assert.ok(Atomics.load(header, FRAME_SAB_CONTROL_CONSUMED_SEQ_WORD) >= 0);
    assert.equal(Atomics.load(states, 0), FRAME_SAB_SLOT_STATE_FREE);

    post(worker, { type: "shutdown" });
    await waitFor(worker, (m) => m.type === "shutdownComplete");
    await once(worker, "exit");
  } finally {
    await worker.terminate();
  }
});

test("worker: event pool backpressure + droppedSinceLast", async () => {
  const worker = makeWorker();
  try {
    post(worker, { type: "init", config: { maxEventBytes: 1024, fpsCap: 1000 } });
    await waitFor(worker, (m) => m.type === "ready");

    const payloadA = new Uint8Array(new ArrayBuffer(3));
    payloadA.set([1, 2, 3]);
    post(
      worker,
      { type: "postUserEvent", tag: 111, payload: payloadA.buffer, byteLen: payloadA.byteLength },
      [payloadA.buffer],
    );

    const payloadB = new Uint8Array(new ArrayBuffer(2));
    payloadB.set([4, 5]);
    post(
      worker,
      { type: "postUserEvent", tag: 222, payload: payloadB.buffer, byteLen: payloadB.byteLength },
      [payloadB.buffer],
    );

    const e1 = await waitFor(worker, (m) => m.type === "events");
    const e2 = await waitFor(worker, (m) => m.type === "events");
    assert.equal(e1.type, "events");
    assert.equal(e2.type, "events");
    assert.equal(e1.droppedSinceLast, 0);
    assert.equal(e2.droppedSinceLast, 0);

    const p1 = parseEventBatchV1(new Uint8Array(e1.batch, 0, e1.byteLen));
    const p2 = parseEventBatchV1(new Uint8Array(e2.batch, 0, e2.byteLen));
    assert.equal(p1.ok, true);
    assert.equal(p2.ok, true);

    // Exhaust EVENT_POOL_SIZE (2) by withholding both acks, then generate drops.
    const dropped = 5;
    for (let i = 0; i < dropped; i++) {
      const payload = new Uint8Array(new ArrayBuffer(1));
      payload[0] = i;
      post(
        worker,
        {
          type: "postUserEvent",
          tag: 900 + i,
          payload: payload.buffer,
          byteLen: payload.byteLength,
        },
        [payload.buffer],
      );
    }

    // Barrier: ensure at least one tick ran after the drop-queue was populated.
    await delay(25);

    // Return one buffer, then emit one more event; next sent batch must include droppedSinceLast.
    post(worker, { type: "eventsAck", buffer: e1.batch }, [e1.batch]);

    const payloadC = new Uint8Array(new ArrayBuffer(4));
    payloadC.set([6, 7, 8, 9]);
    const payloadCExp = Array.from(payloadC);
    post(
      worker,
      { type: "postUserEvent", tag: 333, payload: payloadC.buffer, byteLen: payloadC.byteLength },
      [payloadC.buffer],
    );

    const e3 = await waitFor(worker, (m) => m.type === "events");
    assert.equal(e3.type, "events");
    assert.equal(e3.droppedSinceLast, dropped);

    const p3 = parseEventBatchV1(new Uint8Array(e3.batch, 0, e3.byteLen));
    assert.equal(p3.ok, true);
    if (p3.ok) {
      assert.equal(p3.value.events.length, 1);
      const ev0 = p3.value.events[0];
      assert.ok(ev0 !== undefined);
      const ev = ev0;
      assert.equal(ev.kind, "user");
      if (ev.kind !== "user") throw new Error("expected user event");
      assert.equal(ev.tag, 333);
      assert.deepEqual(Array.from(ev.payload), payloadCExp);
    }

    // Cleanup: return remaining buffers.
    post(worker, { type: "eventsAck", buffer: e2.batch }, [e2.batch]);
    post(worker, { type: "eventsAck", buffer: e3.batch }, [e3.batch]);
  } finally {
    await worker.terminate();
  }
});

test("worker: oversized event batch (ZR_ERR_LIMIT) is dropped without fatal", async () => {
  const worker = makeWorker();
  try {
    post(worker, { type: "init", config: { maxEventBytes: 64, fpsCap: 1000 } });
    await waitFor(worker, (m) => m.type === "ready");

    const oversizedPayload = new Uint8Array(new ArrayBuffer(16));
    oversizedPayload.set([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    post(
      worker,
      {
        type: "postUserEvent",
        tag: 7001,
        payload: oversizedPayload.buffer,
        byteLen: oversizedPayload.byteLength,
      },
      [oversizedPayload.buffer],
    );

    const smallPayload = new Uint8Array(new ArrayBuffer(1));
    smallPayload[0] = 9;
    post(
      worker,
      {
        type: "postUserEvent",
        tag: 7002,
        payload: smallPayload.buffer,
        byteLen: smallPayload.byteLength,
      },
      [smallPayload.buffer],
    );

    const next = await waitFor(worker, (m) => m.type === "events");
    assert.equal(next.type, "events");
    assert.equal(next.droppedSinceLast, 1);

    const parsed = parseEventBatchV1(new Uint8Array(next.batch, 0, next.byteLen));
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.events.length, 1);
      const ev0 = parsed.value.events[0];
      assert.ok(ev0 !== undefined);
      const ev = ev0;
      assert.equal(ev.kind, "user");
      if (ev.kind !== "user") throw new Error("expected user event");
      assert.equal(ev.tag, 7002);
      assert.deepEqual(Array.from(ev.payload), [9]);
    }

    post(worker, { type: "eventsAck", buffer: next.batch }, [next.batch]);
    post(worker, { type: "shutdown" });
    await waitFor(worker, (m) => m.type === "shutdownComplete");
    await once(worker, "exit");
  } finally {
    await worker.terminate();
  }
});

test("worker: deterministic shutdownComplete + exit", async () => {
  const worker = makeWorker();
  try {
    post(worker, { type: "init", config: { maxEventBytes: 1024, fpsCap: 1000 } });
    await waitFor(worker, (m) => m.type === "ready");

    post(worker, { type: "shutdown" });
    await waitFor(worker, (m) => m.type === "shutdownComplete");
    await once(worker, "exit");
  } finally {
    await worker.terminate();
  }
});

test("backend: createNodeBackendInternal integrates worker buffers + release", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  const payload = new Uint8Array(new ArrayBuffer(3));
  payload.set([10, 11, 12]);
  backend.postUserEvent(4242, payload);

  const batch = await backend.pollEvents();
  const parsed = parseEventBatchV1(batch.bytes);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.events.length, 1);
    const ev0 = parsed.value.events[0];
    assert.ok(ev0 !== undefined);
    const ev = ev0;
    assert.equal(ev.kind, "user");
    if (ev.kind !== "user") throw new Error("expected user event");
    assert.equal(ev.tag, 4242);
    assert.deepEqual(Array.from(ev.payload), [10, 11, 12]);
  }

  batch.release();
  batch.release();

  const drawlist = new Uint8Array(new ArrayBuffer(8));
  drawlist.set([1, 1, 2, 3, 5, 8, 13, 21]);
  await backend.requestFrame(drawlist);

  await backend.stop();
  backend.dispose();
});

test("backend: pollEvents recovers from oversized event batch (ZR_ERR_LIMIT)", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 64 },
    nativeShimModule: shim,
  });

  await backend.start();

  const oversizedPayload = new Uint8Array(new ArrayBuffer(16));
  oversizedPayload.set([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  backend.postUserEvent(8101, oversizedPayload);

  const smallPayload = new Uint8Array(new ArrayBuffer(1));
  smallPayload[0] = 7;
  backend.postUserEvent(8102, smallPayload);

  const batch = await backend.pollEvents();
  assert.equal(batch.droppedBatches, 1);

  const parsed = parseEventBatchV1(batch.bytes);
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.equal(parsed.value.events.length, 1);
    const ev0 = parsed.value.events[0];
    assert.ok(ev0 !== undefined);
    const ev = ev0;
    assert.equal(ev.kind, "user");
    if (ev.kind !== "user") throw new Error("expected user event");
    assert.equal(ev.tag, 8102);
    assert.deepEqual(Array.from(ev.payload), [7]);
  }
  batch.release();

  const drawlist = Uint8Array.from([1, 2, 3, 4]);
  await backend.requestFrame(drawlist);

  await backend.stop();
  backend.dispose();
});

test("backend: maps fpsCap to native targetFps during init", async () => {
  const shim = new URL("../worker/testShims/targetFpsNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 777, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();
  await backend.stop();
  backend.dispose();
});

test("backend: worker path fails deterministically on invalid engine_poll_events byte counts", async () => {
  const shim = new URL("../worker/testShims/invalidPollBytesNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 64 },
    nativeShimModule: shim,
  });

  await backend.start();
  await assert.rejects(
    backend.pollEvents(),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_BACKEND_ERROR" &&
      err.message.includes(
        "engine_poll_events returned invalid byte count: written=65 capacity=64",
      ),
  );
  backend.dispose();
});

test("backend: inline path fails deterministically on invalid engine_poll_events byte counts", async () => {
  const shim = new URL("../worker/testShims/invalidPollBytesNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { executionMode: "inline", fpsCap: 1000, maxEventBytes: 64 },
    nativeShimModule: shim,
  });

  await backend.start();
  await assert.rejects(
    backend.pollEvents(),
    (err) =>
      err instanceof ZrUiError &&
      err.code === "ZRUI_BACKEND_ERROR" &&
      err.message.includes(
        "engine_poll_events returned invalid byte count: written=65 capacity=64",
      ),
  );
  backend.dispose();
});

test("backend: mailbox resolves coalesced frame sequences", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  const a = Uint8Array.from([1, 2, 3, 4]);
  const b = Uint8Array.from([5, 6, 7, 8]);
  await Promise.all([backend.requestFrame(a), backend.requestFrame(b)]);

  await backend.stop();
  backend.dispose();
});

test("backend: requestFrame settles asynchronously after worker completion", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  const drawlist = Uint8Array.from([1, 2, 3, 4]);
  let settled = false;
  const inFlight = backend.requestFrame(drawlist).then(() => {
    settled = true;
  });

  // requestFrame must not settle on publish; completion arrives from the worker.
  await Promise.resolve();
  assert.equal(settled, false);

  await inFlight;
  assert.equal(settled, true);

  await backend.stop();
  backend.dispose();
});

test("backend: requestFrame accepts subarray views without detaching input", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024, frameTransport: "transfer" },
    nativeShimModule: shim,
  });

  await backend.start();

  const full = new Uint8Array(new ArrayBuffer(8));
  full.set([1, 2, 3, 4, 5, 6, 7, 8]);
  const view = full.subarray(2, 6);

  await backend.requestFrame(view);
  assert.equal(full.byteLength, 8);
  assert.deepEqual(Array.from(full), [1, 2, 3, 4, 5, 6, 7, 8]);

  await backend.stop();
  backend.dispose();
});

test("backend: requestFrame does not detach full-buffer inputs", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024, frameTransport: "transfer" },
    nativeShimModule: shim,
  });

  await backend.start();

  const full = new Uint8Array(new ArrayBuffer(8));
  full.set([1, 2, 3, 4, 5, 6, 7, 8]);

  await backend.requestFrame(full);
  assert.equal(full.byteLength, 8);
  assert.deepEqual(Array.from(full), [1, 2, 3, 4, 5, 6, 7, 8]);

  await backend.stop();
  backend.dispose();
});

test("backend:inline: requestFrame keeps caller buffers attached", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { executionMode: "inline", fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  const full = new Uint8Array(new ArrayBuffer(8));
  full.set([1, 2, 3, 4, 5, 6, 7, 8]);
  const view = full.subarray(1, 7);

  await backend.requestFrame(view);
  assert.equal(full.byteLength, 8);
  assert.deepEqual(Array.from(full), [1, 2, 3, 4, 5, 6, 7, 8]);

  await backend.stop();
  backend.dispose();
});

test("backend: SAB requestFrame keeps caller buffers attached", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: {
      fpsCap: 1000,
      maxEventBytes: 1024,
      frameTransport: "sab",
      frameSabSlotCount: 2,
      frameSabSlotBytes: 64,
    },
    nativeShimModule: shim,
  });

  await backend.start();

  const full = new Uint8Array(new ArrayBuffer(8));
  full.set([1, 2, 3, 4, 5, 6, 7, 8]);
  const view = full.subarray(2, 7);

  await backend.requestFrame(view);
  assert.equal(full.byteLength, 8);
  assert.deepEqual(Array.from(full), [1, 2, 3, 4, 5, 6, 7, 8]);

  await backend.stop();
  backend.dispose();
});

test("backend: SAB transport falls back to transfer for oversized frames", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: {
      fpsCap: 1000,
      maxEventBytes: 1024,
      frameTransport: "sab",
      frameSabSlotCount: 2,
      frameSabSlotBytes: 4,
    },
    nativeShimModule: shim,
  });

  await backend.start();

  const full = new Uint8Array(new ArrayBuffer(8));
  full.set([8, 7, 6, 5, 4, 3, 2, 1]);

  await backend.requestFrame(full);
  assert.equal(full.byteLength, 8);
  assert.deepEqual(Array.from(full), [8, 7, 6, 5, 4, 3, 2, 1]);

  await backend.stop();
  backend.dispose();
});

test("backend: stop rejects pollEvents and blocks subsequent requestFrame deterministically", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  const pEvents = backend.pollEvents();
  const pEventsAssert = assert.rejects(pEvents, /stopped/);

  await backend.stop();
  await pEventsAssert;

  const dl = new Uint8Array(new ArrayBuffer(8));
  dl.set([1, 2, 3, 4, 5, 6, 7, 8]);
  await assert.rejects(backend.requestFrame(dl), /stopped/);
  backend.dispose();
});

test("backend:inline: stop rejects pollEvents and blocks subsequent requestFrame", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { executionMode: "inline", fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  await backend.stop();
  await assert.rejects(backend.pollEvents(), /stopped/);

  const dl = new Uint8Array(new ArrayBuffer(8));
  dl.set([1, 2, 3, 4, 5, 6, 7, 8]);
  await assert.rejects(backend.requestFrame(dl), /stopped/);
  backend.dispose();
});

test("backend: frame submission failure becomes fatal ZRUI_BACKEND_ERROR", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  const dl = new Uint8Array(new ArrayBuffer(4));
  dl.set([0xff, 1, 2, 3]); // triggers deterministic failure in mockNative

  // requestFrame now settles on worker completion/failure.
  await assert.rejects(backend.requestFrame(dl), (err) => {
    return err instanceof ZrUiError && err.code === "ZRUI_BACKEND_ERROR";
  });

  // Subsequent operations should fail due to fatal state
  await assert.rejects(backend.requestFrame(new Uint8Array(4)), (err) => {
    return err instanceof ZrUiError && err.code === "ZRUI_BACKEND_ERROR";
  });

  backend.dispose();
});

test("backend: getCaps returns defaults before start and worker caps after start", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  const pre = await backend.getCaps();
  assert.deepEqual(pre, DEFAULT_TERMINAL_CAPS);

  await backend.start();
  const caps = await backend.getCaps();
  assert.deepEqual(caps, {
    colorMode: 2,
    supportsMouse: true,
    supportsBracketedPaste: true,
    supportsFocusEvents: true,
    supportsOsc52: false,
    supportsSyncUpdate: true,
    supportsScrollRegion: true,
    supportsCursorShape: true,
    supportsOutputWaitWritable: true,
    sgrAttrsSupported: 0xffffffff,
  });

  await backend.stop();
  backend.dispose();
});

test("backend: debugQuery clamps maxRecords to avoid large allocations", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();
  await backend.debug.debugEnable({ enabled: true });

  const out = await backend.debug.debugQuery({ maxRecords: 1_000_000_000 });
  assert.equal(out.result.recordsReturned, 16384);
  assert.equal(out.headers.byteLength, 16384 * 40);

  await backend.stop();
  backend.dispose();
});

test("backend: perfSnapshot returns valid structure when REZI_PERF is enabled", async () => {
  const shim = new URL("../worker/testShims/mockNative.js", import.meta.url).href;
  const backend = createNodeBackendInternal({
    config: { fpsCap: 1000, maxEventBytes: 1024 },
    nativeShimModule: shim,
  });

  await backend.start();

  // Submit a frame to generate some perf data in the worker
  const drawlist = new Uint8Array(new ArrayBuffer(8));
  drawlist.set([1, 2, 3, 4, 5, 6, 7, 8]);
  await backend.requestFrame(drawlist);

  // Get perf snapshot
  const snapshot = await backend.perf.perfSnapshot();

  // Verify structure
  assert.ok(snapshot !== null && typeof snapshot === "object");
  assert.ok("phases" in snapshot);
  assert.ok(typeof snapshot.phases === "object");

  // Each phase should have the expected structure if present
  for (const [phase, stats] of Object.entries(snapshot.phases)) {
    assert.ok(typeof phase === "string");
    assert.ok(stats !== null && typeof stats === "object");
    if (stats) {
      const s = stats as { count?: number; avg?: number; p50?: number; p95?: number; max?: number };
      if (s.count !== undefined) assert.ok(typeof s.count === "number" && s.count >= 0);
      if (s.avg !== undefined) assert.ok(typeof s.avg === "number");
      if (s.p50 !== undefined) assert.ok(typeof s.p50 === "number");
      if (s.p95 !== undefined) assert.ok(typeof s.p95 === "number");
      if (s.max !== undefined) assert.ok(typeof s.max === "number");
    }
  }

  await backend.stop();
  backend.dispose();
});
