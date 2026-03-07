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

  test("useParallel uses the latest onComplete callback without restarting", async () => {
    const h = createHarness();
    const calls: string[] = [];
    try {
      let render = h.render((hooks) =>
        useParallel(hooks, [
          {
            target: 8,
            config: { duration: 80, easing: "linear", onComplete: () => calls.push("A") },
          },
        ]),
      );
      h.runPending(render.pendingEffects);

      render = h.render((hooks) =>
        useParallel(hooks, [
          {
            target: 8,
            config: { duration: 80, easing: "linear", onComplete: () => calls.push("B") },
          },
        ]),
      );
      h.runPending(render.pendingEffects);

      await waitFor(() => {
        const next = h.render((hooks) =>
          useParallel(hooks, [
            {
              target: 8,
              config: { duration: 80, easing: "linear", onComplete: () => calls.push("B") },
            },
          ]),
        );
        h.runPending(next.pendingEffects);
        return calls.length >= 1;
      });

      assert.deepEqual(calls, ["B"]);
    } finally {
      assert.equal(h.unmount(), true);
    }
  });

  test("useParallel playback pause and resume preserves elapsed progress", async () => {
    const h = createHarness();
    try {
      const running = [
        {
          target: 10,
          config: { duration: 140, easing: "linear" as const, playback: { paused: false } },
        },
      ] as const;
      const paused = [
        {
          target: 10,
          config: { duration: 140, easing: "linear" as const, playback: { paused: true } },
        },
      ] as const;

      let render = h.render((hooks) =>
        useParallel(hooks, [{ target: 0, config: { duration: 140, easing: "linear" as const } }]),
      );
      h.runPending(render.pendingEffects);

      render = h.render((hooks) => useParallel(hooks, running));
      h.runPending(render.pendingEffects);

      let pausedValue = 0;
      await waitFor(() => {
        const next = h.render((hooks) => useParallel(hooks, running));
        pausedValue = next.result[0]?.value ?? 0;
        h.runPending(next.pendingEffects);
        return pausedValue > 2 && pausedValue < 9;
      });

      render = h.render((hooks) => useParallel(hooks, paused));
      pausedValue = render.result[0]?.value ?? 0;
      h.runPending(render.pendingEffects);

      await waitFor(() => {
        const next = h.render((hooks) => useParallel(hooks, paused));
        render = next;
        h.runPending(next.pendingEffects);
        const entry = next.result[0];
        if (!entry) return false;
        return Math.abs(entry.value - pausedValue) <= 0.1 && entry.isAnimating === false;
      });

      render = h.render((hooks) => useParallel(hooks, running));
      h.runPending(render.pendingEffects);

      await waitFor(() => {
        const next = h.render((hooks) => useParallel(hooks, running));
        render = next;
        h.runPending(next.pendingEffects);
        return Math.abs((next.result[0]?.value ?? 0) - 10) <= 0.2;
      });

      assert.equal(render.result[0]?.isAnimating, false);
    } finally {
      assert.equal(h.unmount(), true);
    }
  });

  test("useParallel reapplies delay when delay changes mid-flight", async () => {
    const h = createHarness();
    try {
      const immediate = [
        { target: 10, config: { duration: 140, easing: "linear" as const } },
      ] as const;
      const delayed = [
        { target: 10, config: { duration: 140, delay: 90, easing: "linear" as const } },
      ] as const;

      let render = h.render((hooks) =>
        useParallel(hooks, [{ target: 0, config: { duration: 140, easing: "linear" as const } }]),
      );
      h.runPending(render.pendingEffects);

      render = h.render((hooks) => useParallel(hooks, immediate));
      h.runPending(render.pendingEffects);

      let midValue = 0;
      await waitFor(() => {
        const next = h.render((hooks) => useParallel(hooks, immediate));
        midValue = next.result[0]?.value ?? 0;
        h.runPending(next.pendingEffects);
        return midValue > 2 && midValue < 9;
      });

      render = h.render((hooks) => useParallel(hooks, delayed));
      h.runPending(render.pendingEffects);

      await sleep(60);
      render = h.render((hooks) => useParallel(hooks, delayed));
      h.runPending(render.pendingEffects);
      assert.ok(Math.abs((render.result[0]?.value ?? 0) - midValue) <= 0.2);

      await waitFor(() => {
        const next = h.render((hooks) => useParallel(hooks, delayed));
        render = next;
        h.runPending(next.pendingEffects);
        return (next.result[0]?.value ?? 0) > midValue + 0.25;
      });
    } finally {
      assert.equal(h.unmount(), true);
    }
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

  test("useChain uses latest step callbacks while preserving step order", async () => {
    const h = createHarness();
    const calls: string[] = [];
    try {
      let render = h.render((hooks) =>
        useChain(hooks, [
          {
            target: 4,
            config: { duration: 50, easing: "linear", onComplete: () => calls.push("A") },
          },
          { target: 8, config: { duration: 50, easing: "linear" } },
        ]),
      );
      h.runPending(render.pendingEffects);

      render = h.render((hooks) =>
        useChain(hooks, [
          {
            target: 4,
            config: { duration: 50, easing: "linear", onComplete: () => calls.push("B") },
          },
          { target: 8, config: { duration: 50, easing: "linear" } },
        ]),
      );
      h.runPending(render.pendingEffects);

      await waitFor(() => {
        const next = h.render((hooks) =>
          useChain(hooks, [
            {
              target: 4,
              config: { duration: 50, easing: "linear", onComplete: () => calls.push("B") },
            },
            { target: 8, config: { duration: 50, easing: "linear" } },
          ]),
        );
        h.runPending(next.pendingEffects);
        return calls.length >= 1 && next.result.currentStep >= 1;
      });

      assert.deepEqual(calls, ["B"]);
    } finally {
      assert.equal(h.unmount(), true);
    }
  });

  test("useChain playback changes do not reset the active step", async () => {
    const h = createHarness();
    try {
      const running = [
        {
          target: 4,
          config: { duration: 90, easing: "linear" as const, playback: { paused: false } },
        },
        {
          target: 8,
          config: { duration: 90, easing: "linear" as const, playback: { paused: false } },
        },
      ] as const;
      const paused = [
        {
          target: 4,
          config: { duration: 90, easing: "linear" as const, playback: { paused: true } },
        },
        {
          target: 8,
          config: { duration: 90, easing: "linear" as const, playback: { paused: false } },
        },
      ] as const;

      let render = h.render((hooks) => useChain(hooks, running));
      h.runPending(render.pendingEffects);

      await waitFor(() => {
        const next = h.render((hooks) => useChain(hooks, running));
        render = next;
        h.runPending(next.pendingEffects);
        return (next.result.value ?? 0) > 1;
      });

      render = h.render((hooks) => useChain(hooks, paused));
      h.runPending(render.pendingEffects);
      assert.equal(render.result.currentStep, 0);

      await sleep(80);
      render = h.render((hooks) => useChain(hooks, paused));
      h.runPending(render.pendingEffects);
      assert.equal(render.result.currentStep, 0);

      render = h.render((hooks) => useChain(hooks, running));
      h.runPending(render.pendingEffects);

      await waitFor(() => {
        const next = h.render((hooks) => useChain(hooks, running));
        render = next;
        h.runPending(next.pendingEffects);
        return next.result.currentStep >= 1;
      });

      assert.equal(render.result.currentStep >= 1, true);
    } finally {
      assert.equal(h.unmount(), true);
    }
  });
});
