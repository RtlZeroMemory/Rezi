import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { useSequence, useSpring, useStagger, useTransition } from "../composition.js";

type HookProgram<T> = (hooks: HookContext) => T;

function createHarness(instanceId = 1): {
  render: <T>(program: HookProgram<T>) => {
    result: T;
    pendingEffects: readonly EffectState[];
  };
  runPending: (effects: readonly EffectState[]) => void;
  unmount: () => boolean;
  getInvalidateCount: () => number;
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "CompositionAnimationHooksHarness");
  let invalidateCount = 0;

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
      invalidateCount++;
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
    getInvalidateCount: () => invalidateCount,
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

describe("composition animation hooks - useTransition", () => {
  test("animates numeric values over duration", async () => {
    const h = createHarness();

    let render = h.render((hooks) => useTransition(hooks, 0, { duration: 80, easing: "linear" }));
    assert.equal(render.result, 0);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, 10, { duration: 80, easing: "linear" }));
    assert.equal(render.result, 0);
    h.runPending(render.pendingEffects);

    let mid = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, { duration: 80, easing: "linear" }),
      );
      mid = next.result;
      h.runPending(next.pendingEffects);
      return mid > 0 && mid < 10;
    });
    assert.ok(mid > 0 && mid < 10);

    let finalValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, { duration: 80, easing: "linear" }),
      );
      finalValue = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue - 10) <= 0.05;
    });
    assert.ok(Math.abs(finalValue - 10) <= 0.05);
    assert.equal(h.unmount(), true);
  });

  test("non-positive duration snaps on next effect pass", () => {
    const h = createHarness();

    let render = h.render((hooks) => useTransition(hooks, 1, { duration: 0 }));
    assert.equal(render.result, 1);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, 3, { duration: 0 }));
    assert.equal(render.result, 1);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, 3, { duration: 0 }));
    assert.equal(render.result, 3);
    assert.equal(h.unmount(), true);
  });

  test("retargets from the current interpolated value", async () => {
    const h = createHarness();

    let render = h.render((hooks) => useTransition(hooks, 0, { duration: 180, easing: "linear" }));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, 20, { duration: 180, easing: "linear" }));
    h.runPending(render.pendingEffects);

    let mid = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 20, { duration: 180, easing: "linear" }),
      );
      mid = next.result;
      h.runPending(next.pendingEffects);
      return mid > 1 && mid < 19;
    });

    render = h.render((hooks) => useTransition(hooks, -6, { duration: 180, easing: "linear" }));
    h.runPending(render.pendingEffects);

    let movedTowardNewTarget = mid;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, -6, { duration: 180, easing: "linear" }),
      );
      movedTowardNewTarget = next.result;
      h.runPending(next.pendingEffects);
      return movedTowardNewTarget < mid - 0.25;
    });
    assert.ok(movedTowardNewTarget < mid);

    let finalValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, -6, { duration: 180, easing: "linear" }),
      );
      finalValue = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue + 6) <= 0.1;
    });
    assert.ok(Math.abs(finalValue + 6) <= 0.1);
    assert.equal(h.unmount(), true);
  });

  test("respects delay before starting transition", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 80, easing: "linear", delay: 100 }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 80, easing: "linear", delay: 100 }),
    );
    h.runPending(render.pendingEffects);

    await sleep(60);
    const duringDelay = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 80, easing: "linear", delay: 100 }),
    );
    h.runPending(duringDelay.pendingEffects);
    assert.ok(Math.abs(duringDelay.result) <= 0.05);

    let started = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, { duration: 80, easing: "linear", delay: 100 }),
      );
      started = next.result;
      h.runPending(next.pendingEffects);
      return started > 0.5;
    });
    assert.ok(started > 0.5);
    assert.equal(h.unmount(), true);
  });

  test("retargeting during delay cancels pending delay", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 120, easing: "linear", delay: 120 }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 120, easing: "linear", delay: 120 }),
    );
    h.runPending(render.pendingEffects);

    await sleep(40);

    render = h.render((hooks) =>
      useTransition(hooks, 20, { duration: 120, easing: "linear", delay: 0 }),
    );
    h.runPending(render.pendingEffects);

    let moved = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 20, { duration: 120, easing: "linear", delay: 0 }),
      );
      moved = next.result;
      h.runPending(next.pendingEffects);
      return moved > 0.5;
    }, 300);
    assert.ok(moved > 0.5);
    assert.equal(h.unmount(), true);
  });

  test("handles non-finite values by snapping on effect", () => {
    const h = createHarness();

    let render = h.render((hooks) => useTransition(hooks, 1, { duration: 80 }));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, Number.NaN, { duration: 80 }));
    assert.equal(render.result, 1);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, Number.NaN, { duration: 80 }));
    assert.equal(Number.isNaN(render.result), true);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, 5, { duration: 80 }));
    assert.equal(Number.isNaN(render.result), true);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useTransition(hooks, 5, { duration: 80 }));
    assert.equal(render.result, 5);
    assert.equal(h.unmount(), true);
  });

  test("cleans up timers on unmount", async () => {
    const h = createHarness();

    let render = h.render((hooks) => useTransition(hooks, 0, { duration: 200, easing: "linear" }));
    h.runPending(render.pendingEffects);
    render = h.render((hooks) => useTransition(hooks, 100, { duration: 200, easing: "linear" }));
    h.runPending(render.pendingEffects);

    await sleep(30);
    assert.ok(h.getInvalidateCount() > 0);
    assert.equal(h.unmount(), true);
    const atUnmount = h.getInvalidateCount();
    await sleep(80);
    assert.equal(h.getInvalidateCount(), atUnmount);
  });
});

describe("composition animation hooks - useSpring", () => {
  test("converges to target value", async () => {
    const h = createHarness();
    const config = { stiffness: 220, damping: 24, restDelta: 0.01, restSpeed: 0.01 };

    let render = h.render((hooks) => useSpring(hooks, 0, config));
    assert.equal(render.result, 0);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSpring(hooks, 12, config));
    assert.equal(render.result, 0);
    h.runPending(render.pendingEffects);

    let moved = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, 12, config));
      moved = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(moved) > 0.5;
    });
    assert.ok(Math.abs(moved) > 0.5);

    let finalValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, 12, config));
      finalValue = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue - 12) <= 0.1;
    });
    assert.ok(Math.abs(finalValue - 12) <= 0.1);
    assert.equal(h.unmount(), true);
  });

  test("retargets while in motion", async () => {
    const h = createHarness();
    const config = { stiffness: 180, damping: 20, restDelta: 0.01, restSpeed: 0.01 };

    let render = h.render((hooks) => useSpring(hooks, 0, config));
    h.runPending(render.pendingEffects);
    render = h.render((hooks) => useSpring(hooks, 16, config));
    h.runPending(render.pendingEffects);

    let mid = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, 16, config));
      mid = next.result;
      h.runPending(next.pendingEffects);
      return mid > 1 && mid < 15;
    });

    render = h.render((hooks) => useSpring(hooks, -4, config));
    h.runPending(render.pendingEffects);

    let retargeted = mid;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, -4, config));
      retargeted = next.result;
      h.runPending(next.pendingEffects);
      return retargeted < mid - 0.25;
    });
    assert.ok(retargeted < mid);

    let finalValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, -4, config));
      finalValue = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue + 4) <= 0.1;
    });
    assert.ok(Math.abs(finalValue + 4) <= 0.1);
    assert.equal(h.unmount(), true);
  });

  test("respects delay before starting spring motion", async () => {
    const h = createHarness();
    const config = { stiffness: 220, damping: 24, restDelta: 0.01, restSpeed: 0.01, delay: 50 };

    let render = h.render((hooks) => useSpring(hooks, 0, config));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSpring(hooks, 10, config));
    h.runPending(render.pendingEffects);

    await sleep(25);
    const duringDelay = h.render((hooks) => useSpring(hooks, 10, config));
    h.runPending(duringDelay.pendingEffects);
    assert.ok(Math.abs(duringDelay.result) <= 0.05);

    let moved = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSpring(hooks, 10, config));
      moved = next.result;
      h.runPending(next.pendingEffects);
      return moved > 0.25;
    });
    assert.ok(moved > 0.25);
    assert.equal(h.unmount(), true);
  });

  test("non-finite target snaps on effect pass", () => {
    const h = createHarness();
    const config = { stiffness: 160, damping: 18 };

    let render = h.render((hooks) => useSpring(hooks, 1, config));
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSpring(hooks, Number.POSITIVE_INFINITY, config));
    assert.equal(render.result, 1);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSpring(hooks, Number.POSITIVE_INFINITY, config));
    assert.equal(render.result, Number.POSITIVE_INFINITY);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSpring(hooks, 7, config));
    h.runPending(render.pendingEffects);
    render = h.render((hooks) => useSpring(hooks, 7, config));
    assert.equal(render.result, 7);
    assert.equal(h.unmount(), true);
  });

  test("cleans up spring timers on unmount", async () => {
    const h = createHarness();
    const config = { stiffness: 200, damping: 20 };

    let render = h.render((hooks) => useSpring(hooks, 0, config));
    h.runPending(render.pendingEffects);
    render = h.render((hooks) => useSpring(hooks, 50, config));
    h.runPending(render.pendingEffects);

    await sleep(30);
    assert.ok(h.getInvalidateCount() > 0);
    assert.equal(h.unmount(), true);
    const atUnmount = h.getInvalidateCount();
    await sleep(80);
    assert.equal(h.getInvalidateCount(), atUnmount);
  });
});

describe("composition animation hooks - useSequence", () => {
  test("steps through keyframes over time", async () => {
    const h = createHarness();
    const keyframes = [0, 10, 20];
    const config = { duration: 60, easing: "linear" as const };

    const render = h.render((hooks) => useSequence(hooks, keyframes, config));
    assert.equal(render.result, 0);
    h.runPending(render.pendingEffects);

    let mid = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSequence(hooks, keyframes, config));
      mid = next.result;
      h.runPending(next.pendingEffects);
      return mid > 0 && mid < 20;
    });
    assert.ok(mid > 0 && mid < 20);

    let finalValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSequence(hooks, keyframes, config));
      finalValue = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue - 20) <= 0.05;
    });
    assert.ok(Math.abs(finalValue - 20) <= 0.05);
    assert.equal(h.unmount(), true);
  });

  test("empty keyframes resolve to zero", () => {
    const h = createHarness();

    let render = h.render((hooks) => useSequence(hooks, [], { duration: 40 }));
    assert.equal(render.result, 0);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useSequence(hooks, [], { duration: 40 }));
    assert.equal(render.result, 0);
    assert.equal(h.unmount(), true);
  });

  test("loop mode keeps values bounded and changing", async () => {
    const h = createHarness();
    const keyframes = [0, 10, 0];
    const config = { duration: 40, easing: "linear" as const, loop: true };

    const render = h.render((hooks) => useSequence(hooks, keyframes, config));
    h.runPending(render.pendingEffects);

    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;
    await waitFor(() => {
      const next = h.render((hooks) => useSequence(hooks, keyframes, config));
      const value = next.result;
      h.runPending(next.pendingEffects);
      if (value < minValue) minValue = value;
      if (value > maxValue) maxValue = value;
      return maxValue - minValue > 4;
    });

    assert.ok(minValue >= -0.1);
    assert.ok(maxValue <= 10.1);
    assert.equal(h.unmount(), true);
  });

  test("changing keyframes rebinds sequence progression", async () => {
    const h = createHarness();
    const config = { duration: 70, easing: "linear" as const };

    let keyframes: readonly number[] = [0, 10];
    let render = h.render((hooks) => useSequence(hooks, keyframes, config));
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) => useSequence(hooks, keyframes, config));
      h.runPending(next.pendingEffects);
      return next.result > 1;
    });

    keyframes = [100, 120];
    render = h.render((hooks) => useSequence(hooks, keyframes, config));
    h.runPending(render.pendingEffects);

    let reboundValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useSequence(hooks, keyframes, config));
      reboundValue = next.result;
      h.runPending(next.pendingEffects);
      return reboundValue > 100;
    });
    assert.ok(reboundValue > 100);
    assert.equal(h.unmount(), true);
  });
});

describe("composition animation hooks - useStagger", () => {
  test("returns staggered per-item progress values", async () => {
    const h = createHarness();
    const items = ["a", "b", "c"];
    const config = { delay: 40, duration: 80, easing: "linear" as const };

    const render = h.render((hooks) => useStagger(hooks, items, config));
    assert.equal(render.result.length, 3);
    h.runPending(render.pendingEffects);

    let staggered: readonly number[] = [];
    await waitFor(() => {
      const next = h.render((hooks) => useStagger(hooks, items, config));
      staggered = next.result;
      h.runPending(next.pendingEffects);
      const first = staggered[0] ?? 0;
      const second = staggered[1] ?? 0;
      return first > second;
    });
    assert.ok((staggered[0] ?? 0) > (staggered[1] ?? 0));

    let completed: readonly number[] = [];
    await waitFor(() => {
      const next = h.render((hooks) => useStagger(hooks, items, config));
      completed = next.result;
      h.runPending(next.pendingEffects);
      return completed.every((value) => Math.abs(value - 1) <= 0.01);
    });
    assert.ok(completed.every((value) => Math.abs(value - 1) <= 0.01));
    assert.equal(h.unmount(), true);
  });

  test("empty item lists resolve to empty progress arrays", () => {
    const h = createHarness();

    let render = h.render((hooks) => useStagger(hooks, [], { delay: 20, duration: 50 }));
    assert.deepEqual(render.result, []);
    h.runPending(render.pendingEffects);

    render = h.render((hooks) => useStagger(hooks, [], { delay: 20, duration: 50 }));
    assert.deepEqual(render.result, []);
    assert.equal(h.unmount(), true);
  });

  test("item count changes update progress vector shape", async () => {
    const h = createHarness();
    const config = { delay: 25, duration: 70, easing: "linear" as const };

    let items: readonly string[] = ["a", "b"];
    let render = h.render((hooks) => useStagger(hooks, items, config));
    assert.equal(render.result.length, 2);
    h.runPending(render.pendingEffects);

    await waitFor(() => {
      const next = h.render((hooks) => useStagger(hooks, items, config));
      h.runPending(next.pendingEffects);
      return (next.result[0] ?? 0) > (next.result[1] ?? 0);
    });

    items = ["a", "b", "c", "d"];
    render = h.render((hooks) => useStagger(hooks, items, config));
    h.runPending(render.pendingEffects);

    let latest: readonly number[] = [];
    await waitFor(() => {
      const next = h.render((hooks) => useStagger(hooks, items, config));
      latest = next.result;
      h.runPending(next.pendingEffects);
      return latest.length === 4 && (latest[0] ?? 0) > (latest[3] ?? 0);
    });
    assert.equal(latest.length, 4);
    assert.equal(h.unmount(), true);
  });

  test("zero duration eventually completes all items", async () => {
    const h = createHarness();
    const items = ["x", "y", "z"];
    const config = { delay: 0, duration: 0, easing: "linear" as const };

    const render = h.render((hooks) => useStagger(hooks, items, config));
    h.runPending(render.pendingEffects);

    let latest: readonly number[] = [];
    await waitFor(() => {
      const next = h.render((hooks) => useStagger(hooks, items, config));
      latest = next.result;
      h.runPending(next.pendingEffects);
      return latest.every((value) => value === 1);
    });
    assert.deepEqual(latest, [1, 1, 1]);
    assert.equal(h.unmount(), true);
  });
});
