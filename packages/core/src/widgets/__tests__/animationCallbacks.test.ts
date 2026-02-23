import { assert, describe, test } from "@rezi-ui/testkit";
import { resolveEasing } from "../../animation/easing.js";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { useSequence, useSpring, useStagger, useTransition } from "../composition.js";

// Intentional hook-level harness: these tests validate hook lifecycle semantics directly
// via createCompositeInstanceRegistry/createHookContext/runPendingEffects.
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
  registry.create(instanceId, "AnimationCallbacksHarness");

  const getState = (): CompositeInstanceState => {
    const state = registry.get(instanceId);
    if (!state) throw new Error("test harness: missing instance state");
    return state;
  };

  const render = <T>(
    program: HookProgram<T>,
  ): {
    result: T;
    pendingEffects: readonly EffectState[];
  } => {
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

async function waitFor(check: () => boolean, timeoutMs = 1200): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (check()) return;
    await sleep(12);
  }
  throw new Error("timed out waiting for condition");
}

describe("animation callbacks - useTransition", () => {
  test("calls onComplete exactly once when animation finishes", async () => {
    const h = createHarness();
    let onCompleteCalls = 0;

    let render = h.render((hooks) => useTransition(hooks, 0, { duration: 80, easing: "linear" }));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, {
        duration: 80,
        easing: "linear",
        onComplete: () => {
          onCompleteCalls++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, {
          duration: 80,
          easing: "linear",
          onComplete: () => {
            onCompleteCalls++;
          },
        }),
      );
      h.runPending(next.pendingEffects);
      return Math.abs(next.result - 10) <= 0.05;
    });

    await waitFor(() => onCompleteCalls === 1);
    await sleep(30);
    assert.equal(onCompleteCalls, 1);
    assert.equal(h.unmount(), true);
  });

  test("does not call superseded onComplete when retargeted mid-animation", async () => {
    const h = createHarness();
    let firstTargetCompletions = 0;
    let secondTargetCompletions = 0;

    let render = h.render((hooks) => useTransition(hooks, 0, { duration: 180, easing: "linear" }));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 20, {
        duration: 180,
        easing: "linear",
        onComplete: () => {
          firstTargetCompletions++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 20, {
          duration: 180,
          easing: "linear",
          onComplete: () => {
            firstTargetCompletions++;
          },
        }),
      );
      h.runPending(next.pendingEffects);
      return next.result > 1 && next.result < 19;
    });

    render = h.render((hooks) =>
      useTransition(hooks, -6, {
        duration: 180,
        easing: "linear",
        onComplete: () => {
          secondTargetCompletions++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, -6, {
          duration: 180,
          easing: "linear",
          onComplete: () => {
            secondTargetCompletions++;
          },
        }),
      );
      h.runPending(next.pendingEffects);
      return Math.abs(next.result + 6) <= 0.1;
    });

    await waitFor(() => secondTargetCompletions === 1);
    assert.equal(firstTargetCompletions, 0);
    assert.equal(secondTargetCompletions, 1);
    assert.equal(h.unmount(), true);
  });

  test("duration: 0 still calls onComplete after snap", async () => {
    const h = createHarness();
    let onCompleteCalls = 0;

    let render = h.render((hooks) => useTransition(hooks, 1, { duration: 0 }));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 3, {
        duration: 0,
        onComplete: () => {
          onCompleteCalls++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => onCompleteCalls === 1);
    assert.equal(onCompleteCalls, 1);
    assert.equal(h.unmount(), true);
  });
});

describe("animation callbacks - useSpring/useSequence/useStagger", () => {
  test("useSpring calls onComplete when spring converges", async () => {
    const h = createHarness();
    let onCompleteCalls = 0;
    const config = {
      stiffness: 220,
      damping: 24,
      restDelta: 0.01,
      restSpeed: 0.01,
      onComplete: () => {
        onCompleteCalls++;
      },
    };

    let render = h.render((hooks) => useSpring(hooks, 0, config));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSpring(hooks, 12, config));
    h.runPending(render.pendingEffects);

    let latestValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, 12, config));
      latestValue = next.result;
      h.runPending(next.pendingEffects);
      return onCompleteCalls === 1;
    }, 2400);

    assert.ok(Math.abs(latestValue - 12) <= 0.1);
    assert.equal(onCompleteCalls, 1);
    assert.equal(h.unmount(), true);
  });

  test("useSequence calls onComplete when non-loop sequence ends", async () => {
    const h = createHarness();
    let onCompleteCalls = 0;
    const keyframes = [0, 10, 20] as const;

    const render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 50,
        easing: "linear",
        onComplete: () => {
          onCompleteCalls++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) =>
        useSequence(hooks, keyframes, {
          duration: 50,
          easing: "linear",
          onComplete: () => {
            onCompleteCalls++;
          },
        }),
      );
      h.runPending(next.pendingEffects);
      return Math.abs(next.result - 20) <= 0.05;
    });

    await waitFor(() => onCompleteCalls === 1);
    assert.equal(onCompleteCalls, 1);
    assert.equal(h.unmount(), true);
  });

  test("useSequence does not call onComplete when loop=true", async () => {
    const h = createHarness();
    let onCompleteCalls = 0;
    const keyframes = [0, 10, 20] as const;

    const render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 40,
        loop: true,
        onComplete: () => {
          onCompleteCalls++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await sleep(260);
    const next = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 40,
        loop: true,
        onComplete: () => {
          onCompleteCalls++;
        },
      }),
    );
    h.runPending(next.pendingEffects);
    assert.equal(onCompleteCalls, 0);
    assert.equal(h.unmount(), true);
  });

  test("useStagger calls onComplete when all items complete", async () => {
    const h = createHarness();
    let onCompleteCalls = 0;
    const items = ["a", "b", "c"];

    const render = h.render((hooks) =>
      useStagger(hooks, items, {
        delay: 30,
        duration: 70,
        easing: "linear",
        onComplete: () => {
          onCompleteCalls++;
        },
      }),
    );
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) =>
        useStagger(hooks, items, {
          delay: 30,
          duration: 70,
          easing: "linear",
          onComplete: () => {
            onCompleteCalls++;
          },
        }),
      );
      h.runPending(next.pendingEffects);
      return next.result.every((value) => Math.abs(value - 1) <= 0.01);
    });

    await waitFor(() => onCompleteCalls === 1);
    assert.equal(onCompleteCalls, 1);
    assert.equal(h.unmount(), true);
  });
});

describe("animation callbacks - new easing presets", () => {
  test("new easing presets preserve 0/1 boundaries", () => {
    const newPresetNames = [
      "easeInExpo",
      "easeOutExpo",
      "easeInOutExpo",
      "easeInBack",
      "easeOutBack",
      "easeInOutBack",
      "easeOutBounce",
      "easeInBounce",
    ] as const;

    for (const presetName of newPresetNames) {
      const easing = resolveEasing(presetName);
      assert.ok(Math.abs(easing(0) - 0) <= 1e-12);
      assert.ok(Math.abs(easing(1) - 1) <= 1e-12);
    }
  });

  test("easeOutBounce stays in [0, 1] range for t in [0, 1]", () => {
    const easing = resolveEasing("easeOutBounce");
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000;
      const value = easing(t);
      assert.ok(value >= 0 && value <= 1, `expected in-range value for t=${String(t)}`);
    }
  });
});
