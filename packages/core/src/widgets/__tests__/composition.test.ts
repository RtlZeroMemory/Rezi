/**
 * packages/core/src/widgets/__tests__/composition.test.ts — Tests for widget composition API.
 *
 * Tests cover:
 *   1. useState persists across renders
 *   2. Scoped IDs unique per instance
 *   3. useEffect runs after commit, cleanup on unmount
 *   4. Instance state resets on key change
 *   5. Hook order validation
 *
 * @see docs/guide/composition.md (GitHub issue #116)
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import {
  createCompositeInstanceRegistry,
  createHookContext,
  gcUnmountedInstances,
  runPendingCleanups,
  runPendingEffects,
} from "../../runtime/instances.js";
import {
  createWidgetContext,
  defineWidget,
  getCompositeMeta,
  isCompositeVNode,
  scopedId,
} from "../composition.js";
import type { VNode } from "../types.js";
import { ui } from "../ui.js";

describe("Composition API - defineWidget", () => {
  test("creates a widget factory function", () => {
    const Counter = defineWidget<{ initial: number; key?: string }>((props, ctx) => {
      return ui.text(`Count: ${props.initial}`);
    });

    const vnode = Counter({ initial: 5 });
    assert.ok(isCompositeVNode(vnode));
  });

  test("composite VNode has metadata", () => {
    const Counter = defineWidget<{ initial: number; key?: string }>(
      (props, ctx) => ui.text(`Count: ${props.initial}`),
      { name: "Counter" },
    );

    const vnode = Counter({ initial: 5 });
    const meta = getCompositeMeta(vnode);

    assert.ok(meta !== null);
    assert.ok(meta.widgetKey.startsWith("Counter_"));
    assert.deepEqual(meta.props, { initial: 5 });
  });

  test("different widgets have different keys", () => {
    const Widget1 = defineWidget<Record<string, never>>(() => ui.text("1"));
    const Widget2 = defineWidget<Record<string, never>>(() => ui.text("2"));

    const v1 = Widget1({});
    const v2 = Widget2({});

    const m1 = getCompositeMeta(v1);
    const m2 = getCompositeMeta(v2);

    assert.ok(m1 !== null && m2 !== null);
    assert.notEqual(m1.widgetKey, m2.widgetKey);
  });

  test("key prop is passed through", () => {
    const Widget = defineWidget<{ key?: string }>(() => ui.text("test"));

    const vnode = Widget({ key: "my-key" });
    const meta = getCompositeMeta(vnode);

    assert.ok(meta !== null);
    assert.equal(meta.key, "my-key");
  });

  test("wrapper option controls composite container kind", () => {
    const InlineRow = defineWidget<{ key?: string }>(() => ui.text("inline"), { wrapper: "row" });
    const vnode = InlineRow({});
    assert.equal(vnode.kind, "row");
  });
});

describe("Composition API - scopedId", () => {
  test("generates scoped IDs", () => {
    const id1 = scopedId("Counter", 0, "button");
    const id2 = scopedId("Counter", 1, "button");
    const id3 = scopedId("Counter", 0, "input");

    assert.equal(id1, "Counter_0_button");
    assert.equal(id2, "Counter_1_button");
    assert.equal(id3, "Counter_0_input");
  });

  test("IDs are unique per instance", () => {
    const id1 = scopedId("Widget", 0, "inc");
    const id2 = scopedId("Widget", 1, "inc");

    assert.notEqual(id1, id2);
  });
});

describe("Composition API - Instance Registry", () => {
  test("creates new instances", () => {
    const registry = createCompositeInstanceRegistry();

    const state = registry.create(1, "Counter");

    assert.equal(state.instanceId, 1);
    assert.equal(state.widgetKey, "Counter");
    assert.deepEqual(state.hooks, []);
  });

  test("throws on duplicate instance", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "Counter");

    assert.throws(() => {
      registry.create(1, "Counter");
    });
  });

  test("deletes instances", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "Counter");

    const deleted = registry.delete(1);

    assert.equal(deleted, true);
    assert.equal(registry.get(1), undefined);
  });

  test("invalidate marks instance for re-render", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    // Initial state has needsRender = true
    assert.equal(state.needsRender, true);

    // After end render, needsRender is false
    registry.endRender(1);
    const updated = registry.get(1);
    assert.ok(updated);
    assert.equal(updated.needsRender, false);

    // Invalidate sets it back to true
    registry.invalidate(1);
    const invalidated = registry.get(1);
    assert.ok(invalidated);
    assert.equal(invalidated.needsRender, true);
  });

  test("gcUnmountedInstances removes unmounted instances", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "A");
    registry.create(2, "B");
    registry.create(3, "C");

    const mounted = new Set([1, 3]);
    const removed = gcUnmountedInstances(registry, mounted);

    assert.deepEqual(removed, [2]);
    assert.ok(registry.get(1));
    assert.equal(registry.get(2), undefined);
    assert.ok(registry.get(3));
  });
});

describe("Composition API - Hooks", () => {
  test("useState initializes with value", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    registry.beginRender(1);
    const hookCtx = createHookContext(state, () => {});

    const [value] = hookCtx.useState(42);

    assert.equal(value, 42);
  });

  test("useState initializes with lazy function", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    registry.beginRender(1);
    const hookCtx = createHookContext(state, () => {});

    let called = false;
    const [value] = hookCtx.useState(() => {
      called = true;
      return 100;
    });

    assert.equal(value, 100);
    assert.equal(called, true);
  });

  test("useState persists across renders", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    // First render
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    const [value1, setValue] = hookCtx.useState(0);
    registry.endRender(1);

    assert.equal(value1, 0);

    // Update value
    setValue(5);

    // Second render
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    const [value2] = hookCtx.useState(0);
    registry.endRender(1);

    assert.equal(value2, 5);
  });

  test("useState setter with updater function", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    const [, setValue] = hookCtx.useState(10);
    registry.endRender(1);

    setValue((prev) => prev + 5);

    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    const [value] = hookCtx.useState(10);

    assert.equal(value, 15);
  });

  test("useState setter ignores updates after generation change (stale closure)", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    // First render - capture the setter
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    const [, staleSetValue] = hookCtx.useState(0);
    registry.endRender(1);

    // Increment generation (simulating widget re-keying/unmount)
    registry.incrementGeneration(1);

    // Try to use the stale setter
    staleSetValue(999);

    // Second render - value should NOT have changed
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    const [value] = hookCtx.useState(0);
    registry.endRender(1);

    // Value should still be 0, not 999
    assert.equal(value, 0);
  });

  test("useState setter with same value does not trigger invalidation (Object.is)", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    let invalidateCount = 0;

    registry.beginRender(1);
    const hookCtx = createHookContext(state, () => {
      invalidateCount++;
    });
    const [, setValue] = hookCtx.useState(42);
    registry.endRender(1);

    // Set to same value - should NOT call invalidate
    setValue(42);
    assert.equal(invalidateCount, 0);

    // Set to different value - should call invalidate
    setValue(43);
    assert.equal(invalidateCount, 1);

    // Set to same new value - should NOT call invalidate
    setValue(43);
    assert.equal(invalidateCount, 1);
  });

  test("useRef creates mutable ref", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    registry.beginRender(1);
    const hookCtx = createHookContext(state, () => {});

    const ref = hookCtx.useRef("initial");

    assert.equal(ref.current, "initial");

    // Mutate ref
    ref.current = "updated";
    assert.equal(ref.current, "updated");
  });

  test("useRef persists across renders without re-render", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    // First render
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    const ref1 = hookCtx.useRef({ count: 0 });
    ref1.current.count = 42;
    registry.endRender(1);

    // Second render
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    const ref2 = hookCtx.useRef({ count: 0 });

    // Same ref object
    assert.equal(ref1, ref2);
    assert.equal(ref2.current.count, 42);
  });

  test("useEffect schedules effect for first render", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    registry.beginRender(1);
    const hookCtx = createHookContext(state, () => {});

    let effectRan = false;
    hookCtx.useEffect(() => {
      effectRan = true;
    }, []);

    const pendingEffects = registry.endRender(1);

    assert.equal(pendingEffects.length, 1);
    assert.equal(effectRan, false); // Not run yet

    runPendingEffects(pendingEffects);
    assert.equal(effectRan, true);
  });

  test("useEffect with no deps runs on every render", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    let runCount = 0;

    // First render
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    hookCtx.useEffect(() => {
      runCount++;
    }); // No deps = run every time
    let pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.equal(runCount, 1);

    // Second render
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    hookCtx.useEffect(() => {
      runCount++;
    });
    pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.equal(runCount, 2);
  });

  test("useEffect with deps only runs when deps change", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    let runCount = 0;
    let currentDep = 1;

    // First render
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    hookCtx.useEffect(() => {
      runCount++;
    }, [currentDep]);
    let pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.equal(runCount, 1);

    // Second render with same deps
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    hookCtx.useEffect(() => {
      runCount++;
    }, [currentDep]);
    pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.equal(runCount, 1); // Didn't run again

    // Third render with changed deps
    currentDep = 2;
    registry.beginRender(1);
    const instance2 = registry.get(1);
    assert.ok(instance2 !== undefined);
    hookCtx = createHookContext(instance2, () => {});
    hookCtx.useEffect(() => {
      runCount++;
    }, [currentDep]);
    pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.equal(runCount, 2);
  });

  test("useEffect cleanup runs on unmount", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    let cleanupRan = false;

    registry.beginRender(1);
    const hookCtx = createHookContext(state, () => {});
    hookCtx.useEffect(() => {
      return () => {
        cleanupRan = true;
      };
    }, []);
    const pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.equal(cleanupRan, false);

    // Delete instance (unmount)
    registry.delete(1);

    assert.equal(cleanupRan, true);
  });

  test("useEffect cleanup runs before new effect when deps change", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    const events: string[] = [];
    let currentDep = 1;

    // First render
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    hookCtx.useEffect(() => {
      const dep = currentDep;
      events.push(`effect-${dep}`);
      return () => {
        events.push(`cleanup-${dep}`);
      };
    }, [currentDep]);
    let pending = registry.endRender(1);
    runPendingEffects(pending);

    assert.deepEqual(events, ["effect-1"]);

    // Second render with changed deps
    currentDep = 2;
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});
    hookCtx.useEffect(() => {
      const dep = currentDep;
      events.push(`effect-${dep}`);
      return () => {
        events.push(`cleanup-${dep}`);
      };
    }, [currentDep]);
    pending = registry.endRender(1);
    const pendingCleanups = registry.getPendingCleanups(1);

    // Both cleanup and next effect are deferred to post-commit.
    assert.deepEqual(events, ["effect-1"]);

    runPendingCleanups(pendingCleanups);
    assert.deepEqual(events, ["effect-1", "cleanup-1"]);

    // Now run the pending effect
    runPendingEffects(pending);

    // New effect runs after commit
    assert.deepEqual(events, ["effect-1", "cleanup-1", "effect-2"]);
  });

  test("hook order mismatch throws error", () => {
    const registry = createCompositeInstanceRegistry();
    const state = registry.create(1, "Counter");

    // First render: useState, useRef
    registry.beginRender(1);
    let hookCtx = createHookContext(state, () => {});
    hookCtx.useState(0);
    hookCtx.useRef("test");
    registry.endRender(1);

    // Second render: useRef, useState (wrong order)
    registry.beginRender(1);
    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    hookCtx = createHookContext(instance, () => {});

    assert.throws(() => {
      hookCtx.useRef("test"); // Should be useState first
    });
  });
});

describe("Composition API - createWidgetContext", () => {
  test("creates complete context", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "Counter");
    registry.beginRender(1);

    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    const hookCtx = createHookContext(instance, () => {});
    const appState = { user: { name: "Test" } };

    const ctx = createWidgetContext(
      "Counter",
      0,
      hookCtx,
      appState,
      {
        width: 80,
        height: 24,
        breakpoint: "md",
      },
      () => {},
    );

    assert.equal(typeof ctx.id, "function");
    assert.equal(typeof ctx.useState, "function");
    assert.equal(typeof ctx.useRef, "function");
    assert.equal(typeof ctx.useEffect, "function");
    assert.equal(typeof ctx.useMemo, "function");
    assert.equal(typeof ctx.useCallback, "function");
    assert.equal(typeof ctx.useAppState, "function");
    assert.equal(typeof ctx.invalidate, "function");
  });

  test("id function returns scoped IDs", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "Counter");
    registry.beginRender(1);

    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    const hookCtx = createHookContext(instance, () => {});
    const ctx = createWidgetContext(
      "Counter",
      5,
      hookCtx,
      {},
      {
        width: 80,
        height: 24,
        breakpoint: "md",
      },
      () => {},
    );

    assert.equal(ctx.id("button"), "Counter_5_button");
    assert.equal(ctx.id("input"), "Counter_5_input");
  });

  test("useAppState selects from app state", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "Counter");
    registry.beginRender(1);

    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    const hookCtx = createHookContext(instance, () => {});
    const appState = { count: 42, name: "Test" };

    const ctx = createWidgetContext(
      "Counter",
      0,
      hookCtx,
      appState,
      {
        width: 80,
        height: 24,
        breakpoint: "md",
      },
      () => {},
    );

    const count = ctx.useAppState((s) => s.count);
    const name = ctx.useAppState((s) => s.name);

    assert.equal(count, 42);
    assert.equal(name, "Test");
  });

  test("invalidate callback is called", () => {
    const registry = createCompositeInstanceRegistry();
    registry.create(1, "Counter");
    registry.beginRender(1);

    const instance = registry.get(1);
    assert.ok(instance !== undefined);
    const hookCtx = createHookContext(instance, () => {});

    let invalidateCalled = false;
    const ctx = createWidgetContext(
      "Counter",
      0,
      hookCtx,
      {},
      {
        width: 80,
        height: 24,
        breakpoint: "md",
      },
      () => {
        invalidateCalled = true;
      },
    );

    ctx.invalidate();

    assert.equal(invalidateCalled, true);
  });
});
