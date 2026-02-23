import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { useChain, useParallel } from "../composition.js";

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
  registry.create(instanceId, "AnimationOrchestrationHarness");

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

describe("composition animation hooks - orchestration", () => {
  test("useParallel runs multiple transitions concurrently", async () => {
    const h = createHarness();
    const animations = [
      { target: 5, config: { duration: 90, easing: "linear" as const } },
      { target: 10, config: { duration: 90, easing: "linear" as const } },
      { target: 15, config: { duration: 90, easing: "linear" as const } },
    ] as const;

    const render = h.render((hooks) => useParallel(hooks, animations));
    h.runPending(render.pendingEffects);

    let mid = render.result;
    await waitFor(() => {
      const next = h.render((hooks) => useParallel(hooks, animations));
      mid = next.result;
      h.runPending(next.pendingEffects);
      return (mid[0]?.value ?? 0) > 0 && (mid[1]?.value ?? 0) > 0 && (mid[2]?.value ?? 0) > 0;
    });

    assert.equal(mid.length, 3);
    assert.equal(
      mid.every((entry) => entry.isAnimating),
      true,
    );

    let final = mid;
    await waitFor(() => {
      const next = h.render((hooks) => useParallel(hooks, animations));
      final = next.result;
      h.runPending(next.pendingEffects);
      return final.every((entry) => entry.isAnimating === false);
    });

    assert.ok(Math.abs((final[0]?.value ?? 0) - 5) <= 0.1);
    assert.ok(Math.abs((final[1]?.value ?? 0) - 10) <= 0.1);
    assert.ok(Math.abs((final[2]?.value ?? 0) - 15) <= 0.1);
    assert.equal(h.unmount(), true);
  });

  test("useParallel reports per-entry isAnimating state", async () => {
    const h = createHarness();
    const animations = [
      { target: 5, config: { duration: 40, easing: "linear" as const } },
      { target: 10, config: { duration: 140, easing: "linear" as const } },
    ] as const;

    const render = h.render((hooks) => useParallel(hooks, animations));
    h.runPending(render.pendingEffects);

    let snapshot = render.result;
    await waitFor(() => {
      const next = h.render((hooks) => useParallel(hooks, animations));
      snapshot = next.result;
      h.runPending(next.pendingEffects);
      return (snapshot[0]?.isAnimating ?? false) === false && (snapshot[1]?.isAnimating ?? false);
    });

    assert.equal(snapshot[0]?.isAnimating, false);
    assert.equal(snapshot[1]?.isAnimating, true);
    assert.equal(h.unmount(), true);
  });

  test("useChain advances step-by-step and reports completion", async () => {
    const h = createHarness();
    const steps = [
      { target: 5, config: { duration: 70, easing: "linear" as const } },
      { target: 10, config: { duration: 70, easing: "linear" as const } },
      { target: 15, config: { duration: 70, easing: "linear" as const } },
    ] as const;

    const render = h.render((hooks) => useChain(hooks, steps));
    h.runPending(render.pendingEffects);

    assert.equal(render.result.currentStep, 0);
    assert.equal(render.result.isComplete, false);

    let reachedStepOne = false;
    await waitFor(() => {
      const next = h.render((hooks) => useChain(hooks, steps));
      h.runPending(next.pendingEffects);
      reachedStepOne = next.result.currentStep >= 1;
      return reachedStepOne;
    });

    assert.equal(reachedStepOne, true);

    let reachedStepTwo = false;
    await waitFor(() => {
      const next = h.render((hooks) => useChain(hooks, steps));
      h.runPending(next.pendingEffects);
      reachedStepTwo = next.result.currentStep >= 2;
      return reachedStepTwo;
    });

    assert.equal(reachedStepTwo, true);

    let final = render.result;
    await waitFor(() => {
      const next = h.render((hooks) => useChain(hooks, steps));
      final = next.result;
      h.runPending(next.pendingEffects);
      return final.isComplete;
    });

    assert.equal(final.currentStep, steps.length);
    assert.equal(final.isComplete, true);
    assert.ok(Math.abs(final.value - 15) <= 0.1);
    assert.equal(h.unmount(), true);
  });
});
