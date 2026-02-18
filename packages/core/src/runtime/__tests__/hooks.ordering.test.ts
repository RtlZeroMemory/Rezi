import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState } from "../instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../instances.js";

function getState(
  registry: ReturnType<typeof createCompositeInstanceRegistry>,
  instanceId: number,
): CompositeInstanceState {
  const state = registry.get(instanceId);
  if (!state) {
    throw new Error(`test harness: missing state for instance ${String(instanceId)}`);
  }
  return state;
}

describe("runtime hook ordering invariants", () => {
  test("stable hook order and count across renders does not throw", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");

    for (let i = 0; i < 3; i++) {
      registry.beginRender(1);
      const hooks = createHookContext(getState(registry, 1), () => {
        registry.invalidate(1);
      });

      hooks.useState(0);
      hooks.useRef("stable");
      hooks.useEffect(() => {}, []);

      const pending = registry.endRender(1);
      runPendingEffects(pending);
    }

    const state = getState(registry, 1);
    assert.equal(state.expectedHookCount, 3);
  });

  test("adding a conditional hook throws count mismatch with index and hook kind", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");

    let enabled = false;

    registry.beginRender(1);
    let hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    if (enabled) {
      hooks.useRef("x");
    }
    registry.endRender(1);

    enabled = true;

    registry.beginRender(1);
    hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);

    assert.throws(() => {
      hooks.useRef("x");
    }, /Hook count mismatch at index 1: rendered more hooks than previous render while reading ref/);
  });

  test("removing a conditional hook throws count mismatch at endRender with instance id", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");

    let enabled = true;

    registry.beginRender(1);
    let hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    if (enabled) {
      hooks.useRef("x");
    }
    registry.endRender(1);

    enabled = false;

    registry.beginRender(1);
    hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);

    assert.throws(() => {
      registry.endRender(1);
    }, /Hook count mismatch for instance 1: expected 2, got 1/);
  });

  test("changing hook kind at the same index throws explicit order mismatch", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");

    registry.beginRender(1);
    let hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    registry.endRender(1);

    registry.beginRender(1);
    hooks = createHookContext(getState(registry, 1), () => {});

    assert.throws(() => {
      hooks.useRef("x");
    }, /Hook order mismatch at index 0: expected ref, got state/);
  });

  test("reordering hooks between renders throws at the first mismatched index", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");

    registry.beginRender(1);
    let hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    hooks.useEffect(() => {}, []);
    registry.endRender(1);

    registry.beginRender(1);
    hooks = createHookContext(getState(registry, 1), () => {});

    assert.throws(() => {
      hooks.useEffect(() => {}, []);
    }, /Hook order mismatch at index 0: expected effect, got state/);
  });

  test("too many hooks error mentions the requested hook type", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");

    registry.beginRender(1);
    let hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    registry.endRender(1);

    registry.beginRender(1);
    hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);

    assert.throws(() => {
      hooks.useEffect(() => {}, []);
    }, /while reading effect/);
  });

  test("ordering mismatch in one instance does not corrupt invariant checks for another instance", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "OrderingWidget");
    registry.create(2, "OrderingWidget");

    registry.beginRender(1);
    let hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    registry.endRender(1);

    registry.beginRender(2);
    hooks = createHookContext(getState(registry, 2), () => {});
    hooks.useState(0);
    registry.endRender(2);

    registry.beginRender(1);
    hooks = createHookContext(getState(registry, 1), () => {});
    hooks.useState(0);
    assert.throws(() => {
      hooks.useRef("x");
    }, /Hook count mismatch at index 1: rendered more hooks than previous render while reading ref/);

    registry.beginRender(2);
    hooks = createHookContext(getState(registry, 2), () => {});
    hooks.useState(0);

    assert.doesNotThrow(() => {
      registry.endRender(2);
    });
  });
});
