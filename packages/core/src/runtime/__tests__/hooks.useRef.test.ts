import { assert, describe, test } from "@rezi-ui/testkit";
import {
  type HookContext,
  createCompositeInstanceRegistry,
  createHookContext,
} from "../instances.js";

function createUseRefHarness(
  instanceId = 1,
  sharedRegistry = createCompositeInstanceRegistry(),
): {
  render: <T>(renderFn: (hooks: HookContext) => T) => T;
  unmount: () => void;
  getInvalidateCount: () => number;
  getNeedsRender: () => boolean;
} {
  if (!sharedRegistry.get(instanceId)) {
    sharedRegistry.create(instanceId, `UseRefHarness_${String(instanceId)}`);
  }

  let invalidateCount = 0;
  const onInvalidate = () => {
    invalidateCount++;
    sharedRegistry.invalidate(instanceId);
  };

  const render = <T>(renderFn: (hooks: HookContext) => T): T => {
    const state = sharedRegistry.get(instanceId);
    if (!state) {
      throw new Error("test harness: missing instance");
    }

    sharedRegistry.beginRender(instanceId);
    const hooks = createHookContext(state, onInvalidate);
    const result = renderFn(hooks);
    sharedRegistry.endRender(instanceId);
    return result;
  };

  return {
    render,
    unmount: () => {
      sharedRegistry.delete(instanceId);
    },
    getInvalidateCount: () => invalidateCount,
    getNeedsRender: () => sharedRegistry.get(instanceId)?.needsRender ?? false,
  };
}

describe("runtime hooks - useRef hardening", () => {
  test("initializes ref from the provided initial value", () => {
    const h = createUseRefHarness();
    const ref = h.render((hooks) => hooks.useRef("initial"));
    assert.equal(ref.current, "initial");
  });

  test("returns the same ref object across rerenders", () => {
    const h = createUseRefHarness();
    const ref1 = h.render((hooks) => hooks.useRef({ count: 0 }));
    const ref2 = h.render((hooks) => hooks.useRef({ count: 999 }));
    assert.equal(ref1, ref2);
  });

  test("applies initialization only once even if later initial values differ", () => {
    const h = createUseRefHarness();
    const ref1 = h.render((hooks) => hooks.useRef("first"));
    const ref2 = h.render((hooks) => hooks.useRef("second"));

    assert.equal(ref2.current, "first");
    assert.equal(ref1, ref2);
  });

  test("ref current is mutable", () => {
    const h = createUseRefHarness();
    const ref = h.render((hooks) => hooks.useRef(1));
    ref.current = 42;
    assert.equal(ref.current, 42);
  });

  test("mutated ref current persists across rerenders", () => {
    const h = createUseRefHarness();
    const ref1 = h.render((hooks) => hooks.useRef({ label: "a" }));
    ref1.current.label = "updated";

    const ref2 = h.render((hooks) => hooks.useRef({ label: "ignored" }));
    assert.equal(ref2.current.label, "updated");
    assert.equal(ref1, ref2);
  });

  test("mutating ref current does not trigger invalidation", () => {
    const h = createUseRefHarness();
    const ref = h.render((hooks) => hooks.useRef({ n: 1 }));

    assert.equal(h.getInvalidateCount(), 0);
    assert.equal(h.getNeedsRender(), false);

    ref.current.n = 2;

    assert.equal(h.getInvalidateCount(), 0);
    assert.equal(h.getNeedsRender(), false);
  });

  test("multiple ref slots remain independent", () => {
    const h = createUseRefHarness();
    let refs = h.render((hooks) => [hooks.useRef({ n: 1 }), hooks.useRef({ n: 10 })] as const);
    refs[0].current.n = 2;

    refs = h.render((hooks) => [hooks.useRef({ n: -1 }), hooks.useRef({ n: -1 })] as const);
    assert.equal(refs[0].current.n, 2);
    assert.equal(refs[1].current.n, 10);
  });

  test("updating one ref slot does not mutate another slot", () => {
    const h = createUseRefHarness();
    const refs = h.render((hooks) => [hooks.useRef("left"), hooks.useRef("right")] as const);

    refs[0].current = "left-updated";
    const next = h.render((hooks) => [hooks.useRef("x"), hooks.useRef("y")] as const);

    assert.equal(next[0].current, "left-updated");
    assert.equal(next[1].current, "right");
  });

  test("ref identity persists when rerender is driven by useState", () => {
    const h = createUseRefHarness();
    let setValue: (v: number | ((prev: number) => number)) => void = () => {};

    const first = h.render((hooks) => {
      const ref = hooks.useRef({ clicks: 0 });
      const [, nextSet] = hooks.useState(0);
      setValue = nextSet;
      return ref;
    });

    setValue(1);
    const second = h.render((hooks) => {
      const ref = hooks.useRef({ clicks: -1 });
      hooks.useState(0);
      return ref;
    });

    assert.equal(first, second);
  });

  test("refs are independent across different instances", () => {
    const registry = createCompositeInstanceRegistry();
    const a = createUseRefHarness(1, registry);
    const b = createUseRefHarness(2, registry);

    const refA = a.render((hooks) => hooks.useRef({ value: 1 }));
    const refB = b.render((hooks) => hooks.useRef({ value: 10 }));

    refA.current.value = 2;
    refB.current.value = 20;

    const nextA = a.render((hooks) => hooks.useRef({ value: 0 }));
    const nextB = b.render((hooks) => hooks.useRef({ value: 0 }));

    assert.notEqual(nextA, nextB);
    assert.equal(nextA.current.value, 2);
    assert.equal(nextB.current.value, 20);
  });

  test("hook order mismatch throws when useRef/useState order changes", () => {
    const h = createUseRefHarness();

    h.render((hooks) => {
      hooks.useRef("r");
      hooks.useState(0);
    });

    assert.throws(() => {
      h.render((hooks) => {
        hooks.useState(0);
        hooks.useRef("r");
      });
    });
  });

  test("hook order mismatch throws when replacing useRef with useEffect", () => {
    const h = createUseRefHarness();

    h.render((hooks) => {
      hooks.useRef("r");
    });

    assert.throws(() => {
      h.render((hooks) => {
        hooks.useEffect(() => {});
      });
    });
  });

  test("rendering more refs than previous render throws hook count mismatch", () => {
    const h = createUseRefHarness();

    h.render((hooks) => {
      hooks.useRef("a");
    });

    assert.throws(() => {
      h.render((hooks) => {
        hooks.useRef("a");
        hooks.useRef("b");
      });
    });
  });

  test("rendering fewer hooks than previous render throws at endRender", () => {
    const h = createUseRefHarness();

    h.render((hooks) => {
      hooks.useRef("a");
      hooks.useRef("b");
    });

    assert.throws(() => {
      h.render((hooks) => {
        hooks.useRef("a");
      });
    });
  });

  test("captured ref object remains mutable after unmount without runtime callbacks", () => {
    const h = createUseRefHarness();
    const ref = h.render((hooks) => hooks.useRef({ done: false }));

    h.unmount();
    ref.current.done = true;

    assert.equal(ref.current.done, true);
    assert.equal(h.getInvalidateCount(), 0);
  });
});
