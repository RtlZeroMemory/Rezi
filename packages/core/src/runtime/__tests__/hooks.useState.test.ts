import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type HookContext,
  createCompositeInstanceRegistry,
  createHookContext,
} from "../instances.js";

type StateSetter<T> = (v: T | ((prev: T) => T)) => void;

function createUseStateHarness(instanceId = 1): {
  render: <T>(renderFn: (hooks: HookContext) => T) => T;
  unmount: () => void;
  incrementGeneration: () => number;
  getInvalidateCount: () => number;
  getNeedsRender: () => boolean;
  isMounted: () => boolean;
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, `UseStateHarness_${String(instanceId)}`);

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
    unmount: () => {
      registry.delete(instanceId);
    },
    incrementGeneration: () => registry.incrementGeneration(instanceId),
    getInvalidateCount: () => invalidateCount,
    getNeedsRender: () => registry.get(instanceId)?.needsRender ?? false,
    isMounted: () => registry.get(instanceId) !== undefined,
  };
}

describe("runtime hooks - useState hardening", () => {
  test("initializes from a literal value", () => {
    const h = createUseStateHarness();
    const [value] = h.render((hooks) => hooks.useState(42));
    assert.equal(value, 42);
  });

  test("initializes from a lazy initializer", () => {
    const h = createUseStateHarness();
    let calls = 0;
    const [value] = h.render((hooks) =>
      hooks.useState(() => {
        calls++;
        return 7;
      }),
    );

    assert.equal(value, 7);
    assert.equal(calls, 1);
  });

  test("lazy initializer runs only once across rerenders", () => {
    const h = createUseStateHarness();
    let calls = 0;

    h.render((hooks) =>
      hooks.useState(() => {
        calls++;
        return 1;
      }),
    );
    const [value] = h.render((hooks) =>
      hooks.useState(() => {
        calls++;
        return 999;
      }),
    );

    assert.equal(value, 1);
    assert.equal(calls, 1);
  });

  test("each lazy state slot initializes only once", () => {
    const h = createUseStateHarness();
    let firstCalls = 0;
    let secondCalls = 0;

    h.render((hooks) => {
      hooks.useState(() => {
        firstCalls++;
        return 10;
      });
      hooks.useState(() => {
        secondCalls++;
        return 20;
      });
    });

    h.render((hooks) => {
      hooks.useState(() => {
        firstCalls++;
        return -1;
      });
      hooks.useState(() => {
        secondCalls++;
        return -2;
      });
    });

    assert.equal(firstCalls, 1);
    assert.equal(secondCalls, 1);
  });

  test("multiple state slots persist independently", () => {
    const h = createUseStateHarness();
    let setA: StateSetter<number> = () => {};
    let setB: StateSetter<number> = () => {};

    let values = h.render((hooks) => {
      const [a, nextSetA] = hooks.useState(1);
      const [b, nextSetB] = hooks.useState(10);
      setA = nextSetA;
      setB = nextSetB;
      return [a, b] as const;
    });
    assert.deepEqual(values, [1, 10]);

    setA(2);
    values = h.render((hooks) => {
      const [a, nextSetA] = hooks.useState(1);
      const [b, nextSetB] = hooks.useState(10);
      setA = nextSetA;
      setB = nextSetB;
      return [a, b] as const;
    });
    assert.deepEqual(values, [2, 10]);

    setB(20);
    values = h.render((hooks) => {
      const [a] = hooks.useState(1);
      const [b] = hooks.useState(10);
      return [a, b] as const;
    });
    assert.deepEqual(values, [2, 20]);
  });

  test("updating the first slot does not change the second slot", () => {
    const h = createUseStateHarness();
    let setA: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSetA] = hooks.useState(3);
      hooks.useState(30);
      setA = nextSetA;
    });

    setA(4);
    const values = h.render((hooks) => {
      const [a] = hooks.useState(0);
      const [b] = hooks.useState(0);
      return [a, b] as const;
    });

    assert.deepEqual(values, [4, 30]);
  });

  test("updating the second slot does not change the first slot", () => {
    const h = createUseStateHarness();
    let setB: StateSetter<number> = () => {};

    h.render((hooks) => {
      hooks.useState(5);
      const [, nextSetB] = hooks.useState(50);
      setB = nextSetB;
    });

    setB(55);
    const values = h.render((hooks) => {
      const [a] = hooks.useState(0);
      const [b] = hooks.useState(0);
      return [a, b] as const;
    });

    assert.deepEqual(values, [5, 55]);
  });

  test("functional updater receives previous value", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(10);
      setValue = nextSet;
    });

    setValue((prev) => prev + 5);
    const [value] = h.render((hooks) => hooks.useState(0));
    assert.equal(value, 15);
  });

  test("multiple functional updates in one event are applied in order", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(0);
      setValue = nextSet;
    });

    setValue((prev) => prev + 1);
    setValue((prev) => prev + 1);
    setValue((prev) => prev + 1);

    const [value] = h.render((hooks) => hooks.useState(0));
    assert.equal(value, 3);
  });

  test("mixed direct and functional updates in one event use the latest intermediate value", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(1);
      setValue = nextSet;
    });

    setValue((prev) => prev * 2);
    setValue(7);
    setValue((prev) => prev + 1);

    const [value] = h.render((hooks) => hooks.useState(0));
    assert.equal(value, 8);
  });

  test("multiple slot updates in one event preserve both final values", () => {
    const h = createUseStateHarness();
    let setA: StateSetter<number> = () => {};
    let setB: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSetA] = hooks.useState(1);
      const [, nextSetB] = hooks.useState(10);
      setA = nextSetA;
      setB = nextSetB;
    });

    setA((prev) => prev + 4);
    setB((prev) => prev - 3);

    const values = h.render((hooks) => {
      const [a] = hooks.useState(0);
      const [b] = hooks.useState(0);
      return [a, b] as const;
    });
    assert.deepEqual(values, [5, 7]);
  });

  test("functional updater returning the same value does not invalidate", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(4);
      setValue = nextSet;
    });

    setValue((prev) => prev);
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("changed updates increment invalidation count", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(1);
      setValue = nextSet;
    });

    setValue(2);
    assert.equal(h.getInvalidateCount(), 1);
  });

  test("changed updates mark instance as needing render", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(1);
      setValue = nextSet;
    });

    assert.equal(h.getNeedsRender(), false);
    setValue(2);
    assert.equal(h.getNeedsRender(), true);
  });

  test("same-value updates do not mark instance as needing render", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(9);
      setValue = nextSet;
    });

    assert.equal(h.getNeedsRender(), false);
    setValue(9);
    assert.equal(h.getNeedsRender(), false);
  });

  test("needsRender is reset after rerender completes", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(1);
      setValue = nextSet;
    });

    setValue(2);
    assert.equal(h.getNeedsRender(), true);

    h.render((hooks) => hooks.useState(0));
    assert.equal(h.getNeedsRender(), false);
  });

  test("Object.is treats NaN as unchanged", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(Number.NaN);
      setValue = nextSet;
    });

    setValue(Number.NaN);
    const [value] = h.render((hooks) => hooks.useState(0));

    assert.equal(Number.isNaN(value), true);
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("Object.is treats +0 and -0 as different (+0 -> -0)", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(0);
      setValue = nextSet;
    });

    setValue(-0);
    const [value] = h.render((hooks) => hooks.useState(0));

    assert.equal(Object.is(value, -0), true);
    assert.equal(h.getInvalidateCount(), 1);
  });

  test("Object.is treats -0 and +0 as different (-0 -> +0)", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(-0);
      setValue = nextSet;
    });

    setValue(0);
    const [value] = h.render((hooks) => hooks.useState(-0));

    assert.equal(Object.is(value, 0), true);
    assert.equal(h.getInvalidateCount(), 1);
  });

  test("Object.is treats same object reference as unchanged", () => {
    const h = createUseStateHarness();
    const shared = { count: 1 };
    let setValue: StateSetter<{ count: number }> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(shared);
      setValue = nextSet;
    });

    setValue(shared);
    const [value] = h.render((hooks) => hooks.useState({ count: -1 }));

    assert.equal(value, shared);
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("Object.is treats structurally equal but new object as changed", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<{ count: number }> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState({ count: 1 });
      setValue = nextSet;
    });

    setValue({ count: 1 });
    const [value] = h.render((hooks) => hooks.useState({ count: -1 }));

    assert.equal(value.count, 1);
    assert.equal(h.getInvalidateCount(), 1);
  });

  test("setter is a no-op and does not throw after unmount", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(1);
      setValue = nextSet;
    });

    h.unmount();
    let threw = false;
    try {
      setValue(123);
    } catch {
      threw = true;
    }

    assert.equal(threw, false);
    assert.equal(h.isMounted(), false);
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("functional setter after unmount is a no-op and does not evaluate updater", () => {
    const h = createUseStateHarness();
    let setValue: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(5);
      setValue = nextSet;
    });

    h.unmount();
    let updaterCalled = false;
    setValue((prev) => {
      updaterCalled = true;
      return prev + 1;
    });

    assert.equal(updaterCalled, false);
    assert.equal(h.getInvalidateCount(), 0);
  });

  test("stale setter after generation change is ignored", () => {
    const h = createUseStateHarness();
    let staleSetter: StateSetter<number> = () => {};

    h.render((hooks) => {
      const [, nextSet] = hooks.useState(0);
      staleSetter = nextSet;
    });

    h.incrementGeneration();
    staleSetter(999);

    const [value] = h.render((hooks) => hooks.useState(0));
    assert.equal(value, 0);
    assert.equal(h.getInvalidateCount(), 0);
  });
});
