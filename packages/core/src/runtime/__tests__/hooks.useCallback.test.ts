import { assert, describe, test } from "@rezi-ui/testkit";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../instances.js";

function createHarness(instanceId = 1) {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "UseCallbackHarness");

  return {
    render<T>(program: (hooks: ReturnType<typeof createHookContext>) => T): T {
      registry.beginRender(instanceId);
      const state = registry.get(instanceId);
      if (!state) throw new Error("test harness: missing instance state");
      const hooks = createHookContext(state, () => {
        registry.invalidate(instanceId);
      });
      const result = program(hooks);
      const pending = registry.endRender(instanceId);
      runPendingEffects(pending);
      return result;
    },
  };
}

describe("runtime hooks - useCallback", () => {
  test("returns stable callback when deps are stable", () => {
    const h = createHarness();
    let dep = 1;

    const a = h.render((hooks) => hooks.useCallback(() => dep, [dep]));
    const b = h.render((hooks) => hooks.useCallback(() => dep, [dep]));

    assert.equal(a, b);
    assert.equal(a(), 1);
  });

  test("returns a new callback when deps change", () => {
    const h = createHarness();
    let dep = 1;

    const a = h.render((hooks) => hooks.useCallback(() => dep, [dep]));

    dep = 2;
    const b = h.render((hooks) => hooks.useCallback(() => dep, [dep]));

    assert.notEqual(a, b);
    assert.equal(b(), 2);
  });

  test("without deps it returns a new callback each render", () => {
    const h = createHarness();
    const a = h.render((hooks) => hooks.useCallback(() => 1));
    const b = h.render((hooks) => hooks.useCallback(() => 1));
    assert.notEqual(a, b);
  });

  test("stabilized callback prevents effect dependency churn", () => {
    const h = createHarness();
    let dep = "a";
    let effectRuns = 0;

    h.render((hooks) => {
      const fn = hooks.useCallback(() => dep, [dep]);
      hooks.useEffect(() => {
        effectRuns++;
        void fn();
      }, [fn]);
    });

    h.render((hooks) => {
      const fn = hooks.useCallback(() => dep, [dep]);
      hooks.useEffect(() => {
        effectRuns++;
        void fn();
      }, [fn]);
    });

    dep = "b";
    h.render((hooks) => {
      const fn = hooks.useCallback(() => dep, [dep]);
      hooks.useEffect(() => {
        effectRuns++;
        void fn();
      }, [fn]);
    });

    assert.equal(effectRuns, 2);
  });
});
