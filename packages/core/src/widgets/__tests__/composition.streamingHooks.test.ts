import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import {
  type EventSourceFactory,
  type EventSourceLike,
  type TailSource,
  type UseEventSourceMessage,
  type WebSocketLike,
  type WebSocketSendPayload,
  setDefaultTailSourceFactory,
  useEventSource,
  useInterval,
  useStream,
  useTail,
  useWebSocket,
} from "../composition.js";

type HookProgram<T> = (hooks: HookContext) => T;

function createHarness(instanceId = 1): {
  render: <T>(program: HookProgram<T>) => {
    result: T;
    pendingEffects: readonly EffectState[];
  };
  runPending: (effects: readonly EffectState[]) => void;
  unmount: () => boolean;
  getInvalidateCount: () => number;
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "CompositionStreamingHooksHarness");

  let invalidateCount = 0;

  const getState = (): CompositeInstanceState => {
    const state = registry.get(instanceId);
    if (!state) {
      throw new Error("test harness: missing instance state");
    }
    return state;
  };

  const render = <T>(
    program: HookProgram<T>,
  ): { result: T; pendingEffects: readonly EffectState[] } => {
    registry.beginRender(instanceId);
    const hooks = createHookContext(getState(), () => {
      invalidateCount++;
      registry.invalidate(instanceId);
    });

    const result = program(hooks);
    const pendingEffects = registry.endRender(instanceId);

    return {
      result,
      pendingEffects,
    };
  };

  return {
    render,
    runPending: runPendingEffects,
    unmount: () => registry.delete(instanceId),
    getInvalidateCount: () => invalidateCount,
  };
}

type StreamQueueEntry<T> =
  | Readonly<{ kind: "value"; value: T }>
  | Readonly<{ kind: "done" }>
  | Readonly<{ kind: "error"; error: unknown }>;

function createControlledStream<T>(): {
  stream: AsyncIterable<T>;
  emit: (value: T) => void;
  end: () => void;
  fail: (error: unknown) => void;
  getReturnCount: () => number;
} {
  const queue: StreamQueueEntry<T>[] = [];
  const waiters: {
    resolve: (entry: StreamQueueEntry<T>) => void;
    reject: (error: unknown) => void;
  }[] = [];

  let closed = false;
  let returnCount = 0;

  const flushWaiter = (entry: StreamQueueEntry<T>): void => {
    const waiter = waiters.shift();
    if (!waiter) {
      queue.push(entry);
      return;
    }
    if (entry.kind === "error") {
      waiter.reject(entry.error);
      return;
    }
    waiter.resolve(entry);
  };

  const closeWithDone = (): void => {
    closed = true;
    while (waiters.length > 0) {
      const waiter = waiters.shift();
      if (!waiter) continue;
      waiter.resolve({ kind: "done" });
    }
  };

  const iterator: AsyncIterator<T> = {
    next: () => {
      if (queue.length > 0) {
        const next = queue.shift();
        if (!next) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        if (next.kind === "error") {
          return Promise.reject(next.error);
        }
        if (next.kind === "done") {
          closed = true;
          return Promise.resolve({ value: undefined as T, done: true });
        }
        return Promise.resolve({ value: next.value, done: false });
      }

      if (closed) {
        return Promise.resolve({ value: undefined as T, done: true });
      }

      return new Promise<StreamQueueEntry<T>>((resolve, reject) => {
        waiters.push({ resolve, reject });
      }).then((entry) => {
        if (entry.kind === "done") {
          closed = true;
          return { value: undefined as T, done: true };
        }
        if (entry.kind === "error") {
          throw entry.error;
        }
        return { value: entry.value, done: false };
      });
    },
    return: () => {
      returnCount += 1;
      closeWithDone();
      return Promise.resolve({ value: undefined as T, done: true });
    },
  };

  const stream: AsyncIterable<T> = {
    [Symbol.asyncIterator]: () => iterator,
  };

  return {
    stream,
    emit: (value: T) => {
      if (closed) return;
      flushWaiter({ kind: "value", value });
    },
    end: () => {
      if (closed) return;
      closed = true;
      flushWaiter({ kind: "done" });
      closeWithDone();
    },
    fail: (error: unknown) => {
      if (closed) return;
      closed = true;
      flushWaiter({ kind: "error", error });
      closeWithDone();
    },
    getReturnCount: () => returnCount,
  };
}

class FakeEventSource implements EventSourceLike {
  public closed = false;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const bucket = this.listeners.get(type) ?? new Set<(event: unknown) => void>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    bucket.delete(listener);
    if (bucket.size === 0) {
      this.listeners.delete(type);
    }
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: unknown): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    for (const listener of bucket) {
      listener(event);
    }
  }
}

function createEventSourceFactoryHarness(): {
  factory: EventSourceFactory;
  instances: FakeEventSource[];
} {
  const instances: FakeEventSource[] = [];
  const factory: EventSourceFactory = () => {
    const source = new FakeEventSource();
    instances.push(source);
    return source;
  };
  return { factory, instances };
}

class FakeWebSocket implements WebSocketLike {
  public closed = false;
  public sent: WebSocketSendPayload[] = [];
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const bucket = this.listeners.get(type) ?? new Set<(event: unknown) => void>();
    bucket.add(listener);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    bucket.delete(listener);
    if (bucket.size === 0) {
      this.listeners.delete(type);
    }
  }

  send(payload: WebSocketSendPayload): void {
    if (this.closed) {
      throw new Error("socket closed");
    }
    this.sent.push(payload);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: unknown): void {
    const bucket = this.listeners.get(type);
    if (!bucket) return;
    for (const listener of bucket) {
      listener(event);
    }
  }
}

function createWebSocketFactoryHarness(): {
  factory: (url: string, protocol?: string | readonly string[]) => WebSocketLike;
  instances: FakeWebSocket[];
} {
  const instances: FakeWebSocket[] = [];
  return {
    factory: () => {
      const socket = new FakeWebSocket();
      instances.push(socket);
      return socket;
    },
    instances,
  };
}

function createTailSourceHarness(): {
  source: TailSource<string>;
  emit: (line: string) => void;
  end: () => void;
  wasClosed: () => boolean;
  getReturnCount: () => number;
} {
  const controlled = createControlledStream<string>();
  let closed = false;

  const source: TailSource<string> = {
    [Symbol.asyncIterator]: () => controlled.stream[Symbol.asyncIterator](),
    close: () => {
      closed = true;
      controlled.end();
    },
  };

  return {
    source,
    emit: controlled.emit,
    end: controlled.end,
    wasClosed: () => closed,
    getReturnCount: controlled.getReturnCount,
  };
}

async function waitMs(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function flushAsyncUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await waitMs(0);
}

describe("composition streaming hooks - useStream", () => {
  test("subscribes to async iterables and updates on each value", async () => {
    const h = createHarness();
    const stream = createControlledStream<number>();

    let render = h.render((hooks) => useStream(hooks, stream.stream, [stream.stream]));
    assert.equal(render.result.loading, true);
    assert.equal(render.result.done, false);
    h.runPending(render.pendingEffects);

    stream.emit(1);
    await flushAsyncUpdates();

    render = h.render((hooks) => useStream(hooks, stream.stream, [stream.stream]));
    assert.equal(render.result.value, 1);
    assert.equal(render.result.loading, false);
    assert.equal(render.result.done, false);

    stream.emit(2);
    await flushAsyncUpdates();

    render = h.render((hooks) => useStream(hooks, stream.stream, [stream.stream]));
    assert.equal(render.result.value, 2);
    assert.equal(render.result.loading, false);
    assert.equal(render.result.done, false);

    stream.end();
    await flushAsyncUpdates();

    render = h.render((hooks) => useStream(hooks, stream.stream, [stream.stream]));
    assert.equal(render.result.done, true);
  });

  test("ignores stale stream values after dependency changes", async () => {
    const h = createHarness();
    const first = createControlledStream<string>();
    const second = createControlledStream<string>();
    let active = first.stream;

    let render = h.render((hooks) => useStream(hooks, active, [active]));
    h.runPending(render.pendingEffects);

    active = second.stream;
    render = h.render((hooks) => useStream(hooks, active, [active]));
    h.runPending(render.pendingEffects);

    first.emit("stale");
    await flushAsyncUpdates();

    render = h.render((hooks) => useStream(hooks, active, [active]));
    assert.equal(render.result.value, undefined);
    assert.equal(render.result.loading, true);

    second.emit("fresh");
    await flushAsyncUpdates();

    render = h.render((hooks) => useStream(hooks, active, [active]));
    assert.equal(render.result.value, "fresh");
    assert.equal(render.result.loading, false);
  });

  test("closes iterators when unmounted", async () => {
    const h = createHarness();
    const stream = createControlledStream<number>();

    const render = h.render((hooks) => useStream(hooks, stream.stream, [stream.stream]));
    h.runPending(render.pendingEffects);
    await flushAsyncUpdates();
    assert.equal(h.unmount(), true);
    assert.equal(stream.getReturnCount(), 1);
  });
});

describe("composition streaming hooks - useInterval", () => {
  test("invokes callbacks and stops after unmount", async () => {
    const h = createHarness();
    let ticks = 0;

    const render = h.render((hooks) =>
      useInterval(
        hooks,
        () => {
          ticks += 1;
        },
        15,
      ),
    );
    h.runPending(render.pendingEffects);

    await waitMs(50);
    assert.ok(ticks >= 2);

    const beforeUnmount = ticks;
    assert.equal(h.unmount(), true);
    await waitMs(35);
    assert.equal(ticks, beforeUnmount);
  });
});

describe("composition streaming hooks - useEventSource", () => {
  test("parses message events and tracks connection state", async () => {
    const h = createHarness();
    const harness = createEventSourceFactoryHarness();
    const parseMessage = (message: UseEventSourceMessage) =>
      JSON.parse(message.data) as { value: number };

    let render = h.render((hooks) =>
      useEventSource<{ value: number }>(hooks, "https://example.test/events", {
        factory: harness.factory,
        parse: parseMessage,
      }),
    );
    h.runPending(render.pendingEffects);

    const first = harness.instances[0];
    if (!first) throw new Error("expected first EventSource instance");
    first.emit("open", {});
    first.emit("message", { data: '{"value":42}' });
    await flushAsyncUpdates();

    render = h.render((hooks) =>
      useEventSource<{ value: number }>(hooks, "https://example.test/events", {
        factory: harness.factory,
        parse: parseMessage,
      }),
    );

    assert.equal(render.result.loading, false);
    assert.equal(render.result.connected, true);
    assert.deepEqual(render.result.value, { value: 42 });
  });

  test("auto-reconnects after errors", async () => {
    const h = createHarness();
    const harness = createEventSourceFactoryHarness();

    let render = h.render((hooks) =>
      useEventSource(hooks, "https://example.test/events", {
        factory: harness.factory,
        reconnectMs: 10,
      }),
    );
    h.runPending(render.pendingEffects);

    const first = harness.instances[0];
    if (!first) throw new Error("expected first EventSource instance");
    first.emit("open", {});
    first.emit("error", new Error("disconnect"));

    await waitMs(30);
    assert.equal(harness.instances.length, 2);

    const second = harness.instances[1];
    if (!second) throw new Error("expected second EventSource instance");
    second.emit("open", {});
    second.emit("message", { data: "up" });
    await flushAsyncUpdates();

    render = h.render((hooks) =>
      useEventSource(hooks, "https://example.test/events", {
        factory: harness.factory,
        reconnectMs: 10,
      }),
    );

    assert.equal(render.result.connected, true);
    assert.equal(render.result.value, "up");
    assert.equal(render.result.reconnectAttempts, 1);
  });
});

describe("composition streaming hooks - useWebSocket", () => {
  test("parses messages, sends payloads, and reconnects on close", async () => {
    const h = createHarness();
    const harness = createWebSocketFactoryHarness();
    const parseMessage = (payload: unknown) => JSON.parse(String(payload)) as { value: number };

    let render = h.render((hooks) =>
      useWebSocket<{ value: number }>(hooks, "ws://example.test/live", "json", {
        factory: harness.factory,
        reconnectMs: 10,
        parse: parseMessage,
      }),
    );
    h.runPending(render.pendingEffects);

    const first = harness.instances[0];
    if (!first) throw new Error("expected first WebSocket instance");
    first.emit("open", {});
    first.emit("message", { data: '{"value":7}' });
    await flushAsyncUpdates();

    render = h.render((hooks) =>
      useWebSocket<{ value: number }>(hooks, "ws://example.test/live", "json", {
        factory: harness.factory,
        reconnectMs: 10,
        parse: parseMessage,
      }),
    );

    assert.equal(render.result.connected, true);
    assert.deepEqual(render.result.value, { value: 7 });
    assert.equal(render.result.send("ping"), true);
    assert.equal(first.sent[0], "ping");

    first.emit("close", { code: 1006 });
    await waitMs(30);
    assert.equal(harness.instances.length, 2);

    const second = harness.instances[1];
    if (!second) throw new Error("expected second WebSocket instance");
    second.emit("open", {});
    second.emit("message", { data: '{"value":11}' });
    await flushAsyncUpdates();

    render = h.render((hooks) =>
      useWebSocket<{ value: number }>(hooks, "ws://example.test/live", "json", {
        factory: harness.factory,
        reconnectMs: 10,
        parse: parseMessage,
      }),
    );

    assert.equal(render.result.connected, true);
    assert.deepEqual(render.result.value, { value: 11 });
    assert.equal(render.result.reconnectAttempts, 1);
  });
});

describe("composition streaming hooks - useTail", () => {
  test("buffers tailed lines with bounded backpressure behavior", async () => {
    const h = createHarness();
    const tail = createTailSourceHarness();

    let render = h.render((hooks) =>
      useTail(hooks, "/tmp/app.log", {
        sourceFactory: () => tail.source,
        maxBuffer: 3,
        parse: (line) => line.toUpperCase(),
      }),
    );
    h.runPending(render.pendingEffects);

    tail.emit("a");
    tail.emit("b");
    tail.emit("c");
    tail.emit("d");
    tail.emit("e");
    await flushAsyncUpdates();

    render = h.render((hooks) =>
      useTail(hooks, "/tmp/app.log", {
        sourceFactory: () => tail.source,
        maxBuffer: 3,
        parse: (line) => line.toUpperCase(),
      }),
    );

    assert.equal(render.result.latest, "E");
    assert.deepEqual(render.result.lines, ["C", "D", "E"]);
    assert.equal(render.result.dropped, 2);
    assert.equal(render.result.loading, false);

    assert.equal(h.unmount(), true);
    assert.equal(tail.wasClosed(), true);
    assert.equal(tail.getReturnCount(), 1);
  });

  test("uses configured default source factory when options omit one", async () => {
    const h = createHarness();
    const tail = createTailSourceHarness();
    const defaultFactory = () => tail.source;

    setDefaultTailSourceFactory(defaultFactory);
    try {
      let render = h.render((hooks) => useTail(hooks, "/tmp/default.log"));
      h.runPending(render.pendingEffects);

      tail.emit("line");
      await flushAsyncUpdates();

      render = h.render((hooks) => useTail(hooks, "/tmp/default.log"));
      assert.equal(render.result.latest, "line");
      assert.deepEqual(render.result.lines, ["line"]);
      assert.equal(render.result.error, undefined);
    } finally {
      setDefaultTailSourceFactory(undefined);
    }
  });
});
