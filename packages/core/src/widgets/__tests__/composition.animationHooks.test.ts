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
} {
  const registry = createCompositeInstanceRegistry();
  registry.create(instanceId, "CompositionAnimationHooksHarness");

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
      const next = h.render((hooks) => useTransition(hooks, 10, { duration: 80, easing: "linear" }));
      mid = next.result;
      h.runPending(next.pendingEffects);
      return mid > 0 && mid < 10;
    });
    assert.ok(mid > 0 && mid < 10);

    let finalValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) => useTransition(hooks, 10, { duration: 80, easing: "linear" }));
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
});

describe("composition animation hooks - useSequence", () => {
  test("steps through keyframes over time", async () => {
    const h = createHarness();
    const keyframes = [0, 10, 20];
    const config = { duration: 60, easing: "linear" as const };

    let render = h.render((hooks) => useSequence(hooks, keyframes, config));
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
});

describe("composition animation hooks - useStagger", () => {
  test("returns staggered per-item progress values", async () => {
    const h = createHarness();
    const items = ["a", "b", "c"];
    const config = { delay: 40, duration: 80, easing: "linear" as const };

    let render = h.render((hooks) => useStagger(hooks, items, config));
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
});
