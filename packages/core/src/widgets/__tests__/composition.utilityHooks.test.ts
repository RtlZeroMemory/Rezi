import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { useAsync, useDebounce, usePrevious } from "../composition.js";

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
  registry.create(instanceId, "CompositionUtilityHooksHarness");

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

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolveFn: ((value: T) => void) | undefined;
  let rejectFn: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  return {
    promise,
    resolve: (value: T) => {
      if (!resolveFn) throw new Error("test harness: resolve not initialized");
      resolveFn(value);
    },
    reject: (reason: unknown) => {
      if (!rejectFn) throw new Error("test harness: reject not initialized");
      rejectFn(reason);
    },
  };
}

async function flushAsyncUpdates(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("composition utility hooks - usePrevious", () => {
  test("returns previous render value", () => {
    const h = createHarness();

    let render = h.render((hooks) => usePrevious<number>(hooks, 1));
    assert.equal(render.result, undefined);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => usePrevious<number>(hooks, 2));
    assert.equal(render.result, 1);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => usePrevious<number>(hooks, 3));
    assert.equal(render.result, 2);
  });
});

describe("composition utility hooks - useDebounce", () => {
  test("preserves function values without invoking them during state init", () => {
    const h = createHarness();
    let callCount = 0;

    const callback = () => {
      callCount++;
      return "called";
    };

    const render = h.render((hooks) => useDebounce(hooks, callback, 25));

    assert.equal(render.result, callback);
    assert.equal(callCount, 0);
  });

  test("delays updates until the timeout completes", async () => {
    const h = createHarness();

    let render = h.render((hooks) => useDebounce(hooks, "a", 25));
    assert.equal(render.result, "a");
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useDebounce(hooks, "ab", 25));
    assert.equal(render.result, "a");
    h.runPending(render.pendingEffects);

    await new Promise<void>((resolve) => setTimeout(resolve, 35));

    render = h.render((hooks) => useDebounce(hooks, "ab", 25));
    assert.equal(render.result, "ab");
  });

  test("non-positive delay applies on the next effect pass", () => {
    const h = createHarness();

    let render = h.render((hooks) => useDebounce(hooks, "first", 0));
    assert.equal(render.result, "first");
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useDebounce(hooks, "second", 0));
    assert.equal(render.result, "first");
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useDebounce(hooks, "second", 0));
    assert.equal(render.result, "second");
  });
});

describe("composition utility hooks - useAsync", () => {
  test("resolves data and exits loading state", async () => {
    const h = createHarness();
    const request = createDeferred<string>();

    let render = h.render((hooks) => useAsync(hooks, () => request.promise, ["id-1"]));
    assert.equal(render.result.loading, true);
    assert.equal(render.result.data, undefined);
    assert.equal(render.result.error, undefined);
    h.runPending(render.pendingEffects);

    request.resolve("ready");
    await flushAsyncUpdates();

    render = h.render((hooks) => useAsync(hooks, () => request.promise, ["id-1"]));
    assert.equal(render.result.loading, false);
    assert.equal(render.result.data, "ready");
    assert.equal(render.result.error, undefined);
  });

  test("captures rejected errors", async () => {
    const h = createHarness();
    const request = createDeferred<number>();
    const expectedError = new Error("load failed");

    let render = h.render((hooks) => useAsync(hooks, () => request.promise, ["id-1"]));
    assert.equal(render.result.loading, true);
    h.runPending(render.pendingEffects);

    request.reject(expectedError);
    await flushAsyncUpdates();

    render = h.render((hooks) => useAsync(hooks, () => request.promise, ["id-1"]));
    assert.equal(render.result.loading, false);
    assert.equal(render.result.data, undefined);
    assert.equal(render.result.error, expectedError);
  });

  test("ignores stale completions when dependencies change", async () => {
    const h = createHarness();
    const first = createDeferred<string>();
    const second = createDeferred<string>();
    let requestKey = "first";

    const runTask = () => (requestKey === "first" ? first.promise : second.promise);

    let render = h.render((hooks) => useAsync(hooks, runTask, [requestKey]));
    assert.equal(render.result.loading, true);
    h.runPending(render.pendingEffects);

    requestKey = "second";
    render = h.render((hooks) => useAsync(hooks, runTask, [requestKey]));
    assert.equal(render.result.loading, true);
    h.runPending(render.pendingEffects);

    first.resolve("stale");
    await flushAsyncUpdates();

    render = h.render((hooks) => useAsync(hooks, runTask, [requestKey]));
    assert.equal(render.result.loading, true);
    assert.equal(render.result.data, undefined);
    assert.equal(render.result.error, undefined);

    second.resolve("fresh");
    await flushAsyncUpdates();

    render = h.render((hooks) => useAsync(hooks, runTask, [requestKey]));
    assert.equal(render.result.loading, false);
    assert.equal(render.result.data, "fresh");
    assert.equal(render.result.error, undefined);
  });

  test("state updates are ignored after unmount", async () => {
    const h = createHarness();
    const request = createDeferred<string>();

    const render = h.render((hooks) => useAsync(hooks, () => request.promise, ["id-1"]));
    h.runPending(render.pendingEffects);

    assert.equal(h.unmount(), true);
    request.resolve("late");
    await flushAsyncUpdates();

    assert.equal(h.getInvalidateCount(), 0);
  });
});
