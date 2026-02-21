import { assert, describe, test } from "@rezi-ui/testkit";
import { createCompositeInstanceRegistry, createHookContext } from "../instances.js";

function createHarness(instanceId = 1) {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "UseMemoHarness");

  return {
    render<T>(program: (hooks: ReturnType<typeof createHookContext>) => T): T {
      registry.beginRender(instanceId);
      const state = registry.get(instanceId);
      if (!state) throw new Error("test harness: missing instance state");
      const hooks = createHookContext(state, () => {
        registry.invalidate(instanceId);
      });
      const result = program(hooks);
      registry.endRender(instanceId);
      return result;
    },
  };
}

describe("runtime hooks - useMemo", () => {
  test("memoizes computed value when deps are stable", () => {
    const h = createHarness();
    let computeCount = 0;

    const a = h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return { value: 42 };
      }, [1]),
    );
    const b = h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return { value: 42 };
      }, [1]),
    );

    assert.equal(computeCount, 1);
    assert.equal(a, b);
  });

  test("recomputes when deps change", () => {
    const h = createHarness();
    let dep = 1;
    let computeCount = 0;

    h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return dep * 2;
      }, [dep]),
    );

    dep = 2;
    const next = h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return dep * 2;
      }, [dep]),
    );

    assert.equal(computeCount, 2);
    assert.equal(next, 4);
  });

  test("without deps it recomputes every render", () => {
    const h = createHarness();
    let computeCount = 0;

    h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return computeCount;
      }),
    );
    h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return computeCount;
      }),
    );

    assert.equal(computeCount, 2);
  });

  test("dependency comparison uses Object.is", () => {
    const h = createHarness();
    let dep = Number.NaN;
    let computeCount = 0;

    h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return "value";
      }, [dep]),
    );

    dep = Number.NaN;
    h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return "value";
      }, [dep]),
    );

    dep = -0;
    h.render((hooks) =>
      hooks.useMemo(() => {
        computeCount++;
        return "value";
      }, [dep]),
    );

    assert.equal(computeCount, 2);
  });
});
