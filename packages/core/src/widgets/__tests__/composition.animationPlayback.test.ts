import { assert, describe, test } from "@rezi-ui/testkit";
import type { CompositeInstanceState, EffectState, HookContext } from "../../runtime/instances.js";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  runPendingEffects,
} from "../../runtime/instances.js";
import { useSequence, useTransition } from "../composition.js";

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
  registry.create(instanceId, "AnimationPlaybackHarness");

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

describe("composition animation hooks - playback controls", () => {
  test("paused transition freezes current value", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 200, easing: "linear", playback: { paused: false } }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 200, easing: "linear", playback: { paused: false } }),
    );
    h.runPending(render.pendingEffects);

    let moving = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, {
          duration: 200,
          easing: "linear",
          playback: { paused: false },
        }),
      );
      moving = next.result;
      h.runPending(next.pendingEffects);
      return moving > 0.5;
    });

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 200, easing: "linear", playback: { paused: true } }),
    );
    const pausedValue = render.result;
    h.runPending(render.pendingEffects);

    await sleep(80);
    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 200, easing: "linear", playback: { paused: true } }),
    );
    h.runPending(render.pendingEffects);
    assert.ok(Math.abs(render.result - pausedValue) <= 0.1);

    assert.equal(h.unmount(), true);
  });

  test("unpausing transition resumes progression", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 220, easing: "linear", playback: { paused: false } }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 220, easing: "linear", playback: { paused: false } }),
    );
    h.runPending(render.pendingEffects);

    let pausedValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, {
          duration: 220,
          easing: "linear",
          playback: { paused: false },
        }),
      );
      h.runPending(next.pendingEffects);
      if (next.result > 1) {
        pausedValue = next.result;
        return true;
      }
      return false;
    });

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 220, easing: "linear", playback: { paused: true } }),
    );
    pausedValue = render.result;
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 220, easing: "linear", playback: { paused: false } }),
    );
    h.runPending(render.pendingEffects);

    let resumedValue = pausedValue;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, {
          duration: 220,
          easing: "linear",
          playback: { paused: false },
        }),
      );
      resumedValue = next.result;
      h.runPending(next.pendingEffects);
      return resumedValue > pausedValue + 0.5;
    });

    assert.ok(resumedValue > pausedValue);
    assert.equal(h.unmount(), true);
  });

  test("reversed transition animates from target back to start", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 120, easing: "linear", playback: { reversed: true } }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 120, easing: "linear", playback: { reversed: true } }),
    );
    h.runPending(render.pendingEffects);

    let mid = 10;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, {
          duration: 120,
          easing: "linear",
          playback: { reversed: true },
        }),
      );
      mid = next.result;
      h.runPending(next.pendingEffects);
      return mid < 9.5;
    });

    assert.ok(mid < 9.5);

    let finalValue = 10;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useTransition(hooks, 10, {
          duration: 120,
          easing: "linear",
          playback: { reversed: true },
        }),
      );
      finalValue = next.result;
      h.runPending(next.pendingEffects);
      return Math.abs(finalValue) <= 0.1;
    });

    assert.ok(Math.abs(finalValue) <= 0.1);
    assert.equal(h.unmount(), true);
  });

  test("rate 2 completes transition faster", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 200, easing: "linear", playback: { rate: 2 } }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 200, easing: "linear", playback: { rate: 2 } }),
    );
    h.runPending(render.pendingEffects);

    await sleep(110);
    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 200, easing: "linear", playback: { rate: 2 } }),
    );
    h.runPending(render.pendingEffects);

    assert.ok(Math.abs(render.result - 10) <= 0.25);
    assert.equal(h.unmount(), true);
  });

  test("rate 0.5 slows transition", async () => {
    const h = createHarness();

    let render = h.render((hooks) =>
      useTransition(hooks, 0, { duration: 120, easing: "linear", playback: { rate: 0.5 } }),
    );
    h.runPending(render.pendingEffects);

    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 120, easing: "linear", playback: { rate: 0.5 } }),
    );
    h.runPending(render.pendingEffects);

    await sleep(80);
    render = h.render((hooks) =>
      useTransition(hooks, 10, { duration: 120, easing: "linear", playback: { rate: 0.5 } }),
    );
    h.runPending(render.pendingEffects);

    assert.ok(render.result > 0 && render.result < 10);
    assert.equal(h.unmount(), true);
  });

  test("pause and resume works on sequence", async () => {
    const h = createHarness();
    const keyframes = [0, 10, 20] as const;

    let render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 80,
        easing: "linear",
        playback: { paused: false },
      }),
    );
    h.runPending(render.pendingEffects);

    let pausedValue = 0;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useSequence(hooks, keyframes, {
          duration: 80,
          easing: "linear",
          playback: { paused: false },
        }),
      );
      pausedValue = next.result;
      h.runPending(next.pendingEffects);
      return pausedValue > 1;
    });

    render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 80,
        easing: "linear",
        playback: { paused: true },
      }),
    );
    pausedValue = render.result;
    h.runPending(render.pendingEffects);

    await sleep(80);
    render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 80,
        easing: "linear",
        playback: { paused: true },
      }),
    );
    h.runPending(render.pendingEffects);
    assert.ok(Math.abs(render.result - pausedValue) <= 0.1);

    render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 80,
        easing: "linear",
        playback: { paused: false },
      }),
    );
    h.runPending(render.pendingEffects);

    let resumedValue = pausedValue;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useSequence(hooks, keyframes, {
          duration: 80,
          easing: "linear",
          playback: { paused: false },
        }),
      );
      resumedValue = next.result;
      h.runPending(next.pendingEffects);
      return resumedValue > pausedValue + 0.2;
    });

    assert.ok(resumedValue > pausedValue);
    assert.equal(h.unmount(), true);
  });

  test("reverse playback works on looping sequence", async () => {
    const h = createHarness();
    const keyframes = [0, 10, 0] as const;

    const render = h.render((hooks) =>
      useSequence(hooks, keyframes, {
        duration: 60,
        easing: "linear",
        loop: true,
        playback: { reversed: true },
      }),
    );
    h.runPending(render.pendingEffects);

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    await waitFor(() => {
      const next = h.render((hooks) =>
        useSequence(hooks, keyframes, {
          duration: 60,
          easing: "linear",
          loop: true,
          playback: { reversed: true },
        }),
      );
      const value = next.result;
      if (value < min) min = value;
      if (value > max) max = value;
      h.runPending(next.pendingEffects);
      return max - min > 4;
    });

    assert.ok(min >= -0.1);
    assert.ok(max <= 10.1);
    assert.equal(h.unmount(), true);
  });
});
