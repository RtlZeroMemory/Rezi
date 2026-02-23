import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type HookContext,
  createCompositeInstanceRegistry,
  createHookContext,
} from "../instances.js";

function createUseReducerHarness(instanceId = 1): {
  render: <T>(renderFn: (hooks: HookContext) => T) => T;
  unmount: () => void;
  incrementGeneration: () => number;
  getInvalidateCount: () => number;
  getNeedsRender: () => boolean;
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
    if (!state) throw new Error("test harness: missing instance");

    registry.beginRender(instanceId);
    const hooks = createHookContext(state, onInvalidate);
    const result = renderFn(hooks);
    registry.endRender(instanceId);
    return result;
  };

  return {
    render,
    unmount: () => {
      registry.delete(instanceId);
    },
    incrementGeneration: () => registry.incrementGeneration(instanceId),
    getInvalidateCount: () => invalidateCount,
    getNeedsRender: () => registry.get(instanceId)?.needsRender ?? false,
  };
}

type CountAction = { type: "increment" } | { type: "decrement" } | { type: "reset"; value: number };

function countReducer(state: number, action: CountAction): number {
  switch (action.type) {
    case "increment":
      return state + 1;
    case "decrement":
      return state - 1;
    case "reset":
      return action.value;
  }
}

describe("runtime hooks - useReducer", () => {
  test("initializes with literal value", () => {
    const h = createUseReducerHarness();
    const [value] = h.render((hooks) => hooks.useReducer(countReducer, 0));
    assert.equal(value, 0);
  });

  test("initializes with lazy initializer", () => {
    const h = createUseReducerHarness();
    const [value] = h.render((hooks) => hooks.useReducer(countReducer, () => 42));
    assert.equal(value, 42);
  });

  test("dispatch updates state", () => {
    const h = createUseReducerHarness();
    let dispatch!: (a: CountAction) => void;

    h.render((hooks) => {
      const result = hooks.useReducer(countReducer, 0);
      dispatch = result[1];
      return result;
    });

    dispatch({ type: "increment" });
    const [value] = h.render((hooks) => hooks.useReducer(countReducer, 0));
    assert.equal(value, 1);
  });

  test("dispatch is no-op after generation bump (stale closure)", () => {
    const h = createUseReducerHarness();
    let dispatch!: (a: CountAction) => void;

    h.render((hooks) => {
      const result = hooks.useReducer(countReducer, 10);
      dispatch = result[1];
      return result;
    });

    h.incrementGeneration();
    dispatch({ type: "increment" });
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("Object.is equality check prevents unnecessary invalidation", () => {
    const h = createUseReducerHarness();
    const identityReducer = (s: number, _a: string) => s;
    let dispatch!: (a: string) => void;

    h.render((hooks) => {
      const result = hooks.useReducer(identityReducer, 5);
      dispatch = result[1];
      return result;
    });

    dispatch("anything");
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("hook order mismatch throws", () => {
    const h = createUseReducerHarness();

    h.render((hooks) => {
      hooks.useState(0);
      hooks.useReducer(countReducer, 0);
    });

    assert.throws(() => {
      h.render((hooks) => {
        hooks.useReducer(countReducer, 0);
        hooks.useState(0);
      });
    }, /Hook order mismatch/);
  });
});
