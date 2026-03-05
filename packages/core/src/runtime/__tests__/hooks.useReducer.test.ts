import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type HookContext,
  createCompositeInstanceRegistry,
  createHookContext,
} from "../instances.js";

type Dispatch<A> = (action: A) => void;

function createUseReducerHarness(instanceId = 1): {
  render: <T>(renderFn: (hooks: HookContext) => T) => T;
  incrementGeneration: () => number;
  getInvalidateCount: () => number;
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, `UseReducerHarness_${String(instanceId)}`);

  let invalidateCount = 0;
  const onInvalidate = () => {
    invalidateCount++;
    registry.invalidate(instanceId);
  };

  const render = <T>(renderFn: (hooks: HookContext) => T): T => {
    const state = registry.get(instanceId);
    if (!state) {
      throw new Error("test harness: missing instance");
    }

    registry.beginRender(instanceId);
    const hooks = createHookContext(state, onInvalidate);
    const result = renderFn(hooks);
    registry.endRender(instanceId);
    return result;
  };

  return {
    render,
    incrementGeneration: () => registry.incrementGeneration(instanceId),
    getInvalidateCount: () => invalidateCount,
  };
}

describe("runtime hooks - useReducer", () => {
  test("initializes from literal initial value", () => {
    const h = createUseReducerHarness();
    const [value] = h.render((hooks) => hooks.useReducer((s: number) => s, 4));
    assert.equal(value, 4);
  });

  test("lazy initializer runs only once across rerenders", () => {
    const h = createUseReducerHarness();
    let calls = 0;

    h.render((hooks) =>
      hooks.useReducer(
        (s: number) => s,
        () => {
          calls++;
          return 10;
        },
      ),
    );
    const [value] = h.render((hooks) =>
      hooks.useReducer(
        (s: number) => s,
        () => {
          calls++;
          return 999;
        },
      ),
    );

    assert.equal(value, 10);
    assert.equal(calls, 1);
  });

  test("dispatch applies reducer transitions in order", () => {
    const h = createUseReducerHarness();
    let dispatch: Dispatch<{ type: "inc" | "dec" }> = () => {};

    h.render((hooks) => {
      const [, nextDispatch] = hooks.useReducer(
        (state: number, action: { type: "inc" | "dec" }) => {
          if (action.type === "inc") return state + 1;
          return state - 1;
        },
        0,
      );
      dispatch = nextDispatch;
    });

    dispatch({ type: "inc" });
    dispatch({ type: "inc" });
    dispatch({ type: "dec" });

    const [value] = h.render((hooks) =>
      hooks.useReducer(
        (state: number, action: { type: "inc" | "dec" }) =>
          action.type === "inc" ? state + 1 : state - 1,
        0,
      ),
    );
    assert.equal(value, 1);
  });

  test("dispatch returning same state does not invalidate", () => {
    const h = createUseReducerHarness();
    let dispatch: Dispatch<{ type: "noop" }> = () => {};

    h.render((hooks) => {
      const [, nextDispatch] = hooks.useReducer(
        (state: number, _action: { type: "noop" }) => state,
        1,
      );
      dispatch = nextDispatch;
    });

    dispatch({ type: "noop" });
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("dispatch from stale closure is ignored after generation change", () => {
    const h = createUseReducerHarness();
    let staleDispatch: Dispatch<{ type: "set"; value: number }> = () => {};

    h.render((hooks) => {
      const [, dispatch] = hooks.useReducer(
        (state: number, action: { type: "set"; value: number }) => action.value,
        0,
      );
      staleDispatch = dispatch;
    });

    h.incrementGeneration();
    staleDispatch({ type: "set", value: 10 });

    const [value] = h.render((hooks) =>
      hooks.useReducer((state: number, action: { type: "set"; value: number }) => action.value, 0),
    );
    assert.equal(value, 0);
  });

  test("latest reducer reference is used on subsequent renders", () => {
    const h = createUseReducerHarness();
    let dispatch: Dispatch<number> = () => {};
    let useMultiply = false;

    h.render((hooks) => {
      const [, nextDispatch] = hooks.useReducer(
        (state: number, action: number) => (useMultiply ? state * action : state + action),
        2,
      );
      dispatch = nextDispatch;
    });

    useMultiply = true;
    h.render((hooks) => {
      const [, nextDispatch] = hooks.useReducer(
        (state: number, action: number) => (useMultiply ? state * action : state + action),
        2,
      );
      dispatch = nextDispatch;
    });

    dispatch(3);
    const [value] = h.render((hooks) =>
      hooks.useReducer(
        (state: number, action: number) => (useMultiply ? state * action : state + action),
        0,
      ),
    );
    assert.equal(value, 6);
  });
});
