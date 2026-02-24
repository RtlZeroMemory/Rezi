import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { useAnimatedValue } from "../composition.js";

type HookProgram<T> = (hooks: HookContext) => T;

function createHarness(instanceId = 1): {
  render: <T>(program: HookProgram<T>) => {
    result: T;
    pendingEffects: readonly EffectState[];
  };
  runPending: (effects: readonly EffectState[]) => void;
  unmount: () => boolean;
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "UseAnimatedValueHarness");

  const getState = (): CompositeInstanceState => {
    const state = registry.get(instanceId);
    if (!state) throw new Error("test harness: missing instance state");
    return state;
  };

  const render = <T>(
    program: HookProgram<T>,
  ): { result: T; pendingEffects: readonly EffectState[] } => {
    registry.beginRender(instanceId);
    const hooks = createHookContext(getState(), () => {
      registry.invalidate(instanceId);
    });
    const result = program(hooks);
    const pendingEffects = registry.endRender(instanceId);
    return { result, pendingEffects };
  };

  return {
    render,
    runPending: runPendingEffects,
    unmount: () => registry.delete(instanceId),
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitFor(check: () => boolean, timeoutMs = 1400): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return;
    await sleep(12);
  }
  throw new Error("timed out waiting for condition");
}

describe("composition animation hooks - useAnimatedValue", () => {
  test("transition mode animates to target value", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useAnimatedValue(hooks, 0, {
        mode: "transition",
        transition: { duration: 80, easing: "linear" },
      }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useAnimatedValue(hooks, 10, {
        mode: "transition",
        transition: { duration: 80, easing: "linear" },
      }),
    );
    h.runPending(render.pendingEffects);

    let midValue = 0;
    let sawAnimating = false;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useAnimatedValue(hooks, 10, {
          mode: "transition",
          transition: { duration: 80, easing: "linear" },
        }),
      );
      midValue = next.result.value;
      sawAnimating = sawAnimating || next.result.isAnimating;
      assert.equal(next.result.velocity, 0);
      h.runPending(next.pendingEffects);
      return midValue > 0 && midValue < 10;
    });

    assert.ok(sawAnimating);

    let finalValue = 0;
    let finalAnimating = true;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useAnimatedValue(hooks, 10, {
          mode: "transition",
          transition: { duration: 80, easing: "linear" },
        }),
      );
      finalValue = next.result.value;
      finalAnimating = next.result.isAnimating;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue - 10) <= 0.05 && finalAnimating === false;
    });

    assert.ok(Math.abs(finalValue - 10) <= 0.05);
    assert.equal(finalAnimating, false);
    assert.equal(h.unmount(), true);
  });

  test("spring mode animates with spring velocity", async () => {
    const h = createHarness();
    const config = {
      mode: "spring" as const,
      spring: { stiffness: 220, damping: 24, restDelta: 0.01, restSpeed: 0.01 },
    };

    let render = h.render((hooks) => useAnimatedValue(hooks, 0, config));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useAnimatedValue(hooks, 12, config));
    h.runPending(render.pendingEffects);

    let sawVelocity = false;
    await waitFor(() => {
      const next = h.render((hooks) => useAnimatedValue(hooks, 12, config));
      if (Math.abs(next.result.velocity) > 0.01) sawVelocity = true;
      h.runPending(next.pendingEffects);
      return next.result.value > 0.5;
    });

    assert.equal(sawVelocity, true);

    let settled = false;
    await waitFor(() => {
      const next = h.render((hooks) => useAnimatedValue(hooks, 12, config));
      settled = Math.abs(next.result.value - 12) <= 0.1 && next.result.isAnimating === false;
      h.runPending(next.pendingEffects);
      return settled;
    });

    assert.equal(settled, true);
    assert.equal(h.unmount(), true);
  });

  test("retargeting mid-flight works without jump", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useAnimatedValue(hooks, 0, {
        mode: "transition",
        transition: { duration: 180, easing: "linear" },
      }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useAnimatedValue(hooks, 20, {
        mode: "transition",
        transition: { duration: 180, easing: "linear" },
      }),
    );
    h.runPending(render.pendingEffects);

    let mid = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useAnimatedValue(hooks, 20, {
          mode: "transition",
          transition: { duration: 180, easing: "linear" },
        }),
      );
      mid = next.result.value;
      h.runPending(next.pendingEffects);
      return mid > 1 && mid < 19;
    });

    render = h.render((hooks) =>
      useAnimatedValue(hooks, -6, {
        mode: "transition",
        transition: { duration: 180, easing: "linear" },
      }),
    );
    const immediateRetargetValue = render.result.value;
    h.runPending(render.pendingEffects);
    assert.ok(Math.abs(immediateRetargetValue - mid) <= 0.5);

    let movedTowardNewTarget = mid;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useAnimatedValue(hooks, -6, {
          mode: "transition",
          transition: { duration: 180, easing: "linear" },
        }),
      );
      movedTowardNewTarget = next.result.value;
      h.runPending(next.pendingEffects);
      return movedTowardNewTarget < mid - 0.25;
    });

    assert.ok(movedTowardNewTarget < mid);
    assert.equal(h.unmount(), true);
  });

  test("onComplete fires on settlement", async () => {
    const h = createHarness();
    let transitionCompleteCount = 0;

    let render = h.render((hooks) =>
      useAnimatedValue(hooks, 0, {
        mode: "transition",
        transition: { duration: 70, easing: "linear", onComplete: () => transitionCompleteCount++ },
      }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useAnimatedValue(hooks, 8, {
        mode: "transition",
        transition: { duration: 70, easing: "linear", onComplete: () => transitionCompleteCount++ },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) =>
        useAnimatedValue(hooks, 8, {
          mode: "transition",
          transition: {
            duration: 70,
            easing: "linear",
            onComplete: () => transitionCompleteCount++,
          },
        }),
      );
      h.runPending(next.pendingEffects);
      return transitionCompleteCount >= 1;
    });

    assert.equal(transitionCompleteCount, 1);
    assert.equal(h.unmount(), true);
  });
});
