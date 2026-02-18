import { assert, describe, test } from "@rezi-ui/testkit";
import {
  encodeZrevBatchV1,
  flushMicrotasks,
  makeBackendBatch,
} from "../../app/__tests__/helpers.js";
import { StubBackend } from "../../app/__tests__/stubBackend.js";
import { createApp } from "../../app/createApp.js";
import { type VNode, defineWidget, ui } from "../../index.js";
import { type RuntimeInstance, commitVNodeTree } from "../commit.js";
import { createInstanceIdAllocator } from "../instance.js";
import { createCompositeInstanceRegistry, runPendingEffects } from "../instances.js";

function widgetHost(children: readonly VNode[]): VNode {
  return ui.column({}, children);
}

function firstChildId(root: RuntimeInstance): number {
  const first = root.children[0];
  if (!first) {
    assert.fail("expected root to have at least one child");
    throw new Error("unreachable");
  }
  return first.instanceId;
}

function childIdByKey(root: RuntimeInstance, key: string): number {
  for (const child of root.children) {
    const props = child.vnode.props as { key?: string };
    if (props.key === key) return child.instanceId;
  }
  assert.fail(`missing child with key ${key}`);
  throw new Error("unreachable");
}

function emitResize(backend: StubBackend, timeMs = 1): void {
  backend.pushBatch(
    makeBackendBatch({
      bytes: encodeZrevBatchV1({
        events: [{ kind: "resize", timeMs, cols: 60, rows: 16 }],
      }),
    }),
  );
}

function createHarness(start = 1) {
  return {
    allocator: createInstanceIdAllocator(start),
    registry: createCompositeInstanceRegistry(),
    invalidated: [] as number[],
  };
}

function commitComposite(
  prevRoot: RuntimeInstance | null,
  vnode: VNode,
  harness: ReturnType<typeof createHarness>,
) {
  const res = commitVNodeTree(prevRoot, vnode, {
    allocator: harness.allocator,
    collectLifecycleInstanceIds: true,
    composite: {
      registry: harness.registry,
      appState: {},
      onInvalidate: (instanceId) => {
        harness.invalidated.push(instanceId);
      },
    },
  });

  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
    throw new Error("unreachable");
  }

  runPendingEffects(res.value.pendingEffects);
  return res.value;
}

function deleteUnmounted(
  commitResult: Readonly<{
    unmountedInstanceIds: readonly number[];
  }>,
  harness: ReturnType<typeof createHarness>,
): void {
  for (const id of commitResult.unmountedInstanceIds) {
    harness.registry.delete(id);
  }
}

describe("reconciliation - defineWidget/composite", () => {
  test("same widget + different props reuses widget instance", () => {
    const harness = createHarness();
    const Banner = defineWidget<{ label: string; key?: string }>((props) =>
      ui.text(`label:${props.label}`),
    );

    const c0 = commitComposite(null, widgetHost([Banner({ label: "a", key: "banner" })]), harness);
    const c1 = commitComposite(
      c0.root,
      widgetHost([Banner({ label: "b", key: "banner" })]),
      harness,
    );

    const id0 = firstChildId(c0.root);
    const id1 = firstChildId(c1.root);

    assert.equal(id1, id0);
    assert.equal(c1.reusedInstanceIds.includes(id0), true);
    assert.equal(c1.mountedInstanceIds.includes(id0), false);
  });

  test("useState persists across prop changes for same widget instance", () => {
    const harness = createHarness();
    const seen: number[] = [];
    let setCount: ((v: number) => void) | null = null;

    const Counter = defineWidget<{ initial: number; key?: string }>((props, ctx) => {
      const [count, setValue] = ctx.useState(props.initial);
      setCount = (v: number) => setValue(v);
      seen.push(count);
      return ui.text(`count:${String(count)}`);
    });

    const c0 = commitComposite(
      null,
      widgetHost([Counter({ initial: 1, key: "counter" })]),
      harness,
    );
    const widgetId = firstChildId(c0.root);

    const applySetCount = setCount as ((v: number) => void) | null;
    if (applySetCount === null) {
      assert.fail("expected setCount to be captured");
      return;
    }
    applySetCount(7);
    assert.equal(harness.invalidated.includes(widgetId), true);

    const c1 = commitComposite(
      c0.root,
      widgetHost([Counter({ initial: 999, key: "counter" })]),
      harness,
    );

    assert.equal(firstChildId(c1.root), widgetId);
    assert.deepEqual(seen, [1, 7]);
  });

  test("different widget type with same key remounts", () => {
    const harness = createHarness();
    const A = defineWidget<{ key?: string }>(() => ui.text("A"));
    const B = defineWidget<{ key?: string }>(() => ui.text("B"));

    const c0 = commitComposite(null, widgetHost([A({ key: "slot" })]), harness);
    const oldId = firstChildId(c0.root);

    const c1 = commitComposite(c0.root, widgetHost([B({ key: "slot" })]), harness);
    const newId = firstChildId(c1.root);

    assert.notEqual(newId, oldId);
    assert.equal(c1.unmountedInstanceIds.includes(oldId), true);
    assert.equal(c1.mountedInstanceIds.includes(newId), true);
  });

  test("widget removed then re-added with same key performs fresh mount", () => {
    const harness = createHarness();
    let initCalls = 0;

    const Counter = defineWidget<{ key?: string }>((_props, ctx) => {
      const [value] = ctx.useState(() => {
        initCalls++;
        return initCalls;
      });
      return ui.text(`value:${String(value)}`);
    });

    const c0 = commitComposite(null, widgetHost([Counter({ key: "counter" })]), harness);
    const firstId = firstChildId(c0.root);

    const c1 = commitComposite(c0.root, widgetHost([ui.text("gone")]), harness);
    deleteUnmounted(c1, harness);

    const c2 = commitComposite(c1.root, widgetHost([Counter({ key: "counter" })]), harness);
    const secondId = firstChildId(c2.root);

    assert.notEqual(secondId, firstId);
    assert.equal(initCalls, 2);
  });

  test("useEffect cleanup runs on unmount when unmounted ids are deleted", () => {
    const harness = createHarness();
    let mounts = 0;
    let cleanups = 0;

    const WithEffect = defineWidget<{ key?: string }>((_props, ctx) => {
      ctx.useEffect(() => {
        mounts++;
        return () => {
          cleanups++;
        };
      }, []);
      return ui.text("effect");
    });

    const c0 = commitComposite(null, widgetHost([WithEffect({ key: "e" })]), harness);
    assert.equal(mounts, 1);
    assert.equal(cleanups, 0);

    const c1 = commitComposite(c0.root, widgetHost([ui.text("off")]), harness);
    assert.equal(c1.unmountedInstanceIds.length > 0, true);

    deleteUnmounted(c1, harness);
    assert.equal(cleanups, 1);
  });

  test("useEffect cleanup runs when widget type swaps on same key", () => {
    const harness = createHarness();
    let cleanups = 0;

    const Old = defineWidget<{ key?: string }>((_props, ctx) => {
      ctx.useEffect(() => {
        return () => {
          cleanups++;
        };
      }, []);
      return ui.text("old");
    });

    const New = defineWidget<{ key?: string }>(() => ui.text("new"));

    const c0 = commitComposite(null, widgetHost([Old({ key: "same" })]), harness);
    const c1 = commitComposite(c0.root, widgetHost([New({ key: "same" })]), harness);

    deleteUnmounted(c1, harness);
    assert.equal(cleanups, 1);
  });

  test("keyed widget reorder preserves per-key state", () => {
    const harness = createHarness();
    const seen = new Map<string, number[]>();
    const setters = new Map<string, (value: number) => void>();

    const Counter = defineWidget<{ name: string; initial: number; key?: string }>((props, ctx) => {
      const [count, setCount] = ctx.useState(props.initial);
      const history = seen.get(props.name) ?? [];
      history.push(count);
      seen.set(props.name, history);
      setters.set(props.name, (value: number) => setCount(value));
      return ui.text(`${props.name}:${String(count)}`);
    });

    const c0 = commitComposite(
      null,
      widgetHost([
        Counter({ name: "a", initial: 1, key: "a" }),
        Counter({ name: "b", initial: 2, key: "b" }),
      ]),
      harness,
    );

    const a0 = childIdByKey(c0.root, "a");
    const b0 = childIdByKey(c0.root, "b");

    const setA = setters.get("a");
    const setB = setters.get("b");
    assert.ok(setA !== undefined, "expected setter for a");
    assert.ok(setB !== undefined, "expected setter for b");
    if (!setA || !setB) {
      assert.fail("missing expected setters");
      return;
    }
    setA(11);
    setB(22);

    const c1 = commitComposite(
      c0.root,
      widgetHost([
        Counter({ name: "b", initial: 2, key: "b" }),
        Counter({ name: "a", initial: 1, key: "a" }),
      ]),
      harness,
    );

    assert.equal(childIdByKey(c1.root, "a"), a0);
    assert.equal(childIdByKey(c1.root, "b"), b0);
    assert.deepEqual(seen.get("a"), [1, 11]);
    assert.deepEqual(seen.get("b"), [2, 22]);
  });

  test("stale setter from replaced widget instance is ignored", () => {
    const harness = createHarness();
    let staleSetter: ((v: number) => void) | null = null;
    const newSeen: number[] = [];

    const Old = defineWidget<{ key?: string }>((_props, ctx) => {
      const [count, setCount] = ctx.useState(0);
      staleSetter = (v: number) => setCount(v);
      return ui.text(`old:${String(count)}`);
    });

    const New = defineWidget<{ key?: string }>((_props, ctx) => {
      const [count] = ctx.useState(7);
      newSeen.push(count);
      return ui.text(`new:${String(count)}`);
    });

    const c0 = commitComposite(null, widgetHost([Old({ key: "slot" })]), harness);
    const c1 = commitComposite(c0.root, widgetHost([New({ key: "slot" })]), harness);

    const invalidatedBefore = harness.invalidated.length;
    const invokeStaleSetter = staleSetter as ((v: number) => void) | null;
    if (invokeStaleSetter === null) {
      assert.fail("expected stale setter from old widget");
      return;
    }
    invokeStaleSetter(123);

    commitComposite(c1.root, widgetHost([New({ key: "slot" })]), harness);
    assert.equal(harness.invalidated.length, invalidatedBefore);
    assert.deepEqual(newSeen, [7, 7]);
  });

  test("useEffect deps change runs cleanup before next effect", () => {
    const harness = createHarness();
    const runs: number[] = [];
    const cleanups: number[] = [];

    const Effectful = defineWidget<{ dep: number; key?: string }>((props, ctx) => {
      ctx.useEffect(() => {
        runs.push(props.dep);
        return () => {
          cleanups.push(props.dep);
        };
      }, [props.dep]);
      return ui.text(`dep:${String(props.dep)}`);
    });

    const c0 = commitComposite(null, widgetHost([Effectful({ dep: 1, key: "e" })]), harness);
    const c1 = commitComposite(c0.root, widgetHost([Effectful({ dep: 2, key: "e" })]), harness);
    commitComposite(c1.root, widgetHost([Effectful({ dep: 2, key: "e" })]), harness);

    assert.deepEqual(runs, [1, 2]);
    assert.deepEqual(cleanups, [1]);
  });

  test("same unkeyed widget at same position is reused", () => {
    const harness = createHarness();
    const Plain = defineWidget<{ value: number; key?: string }>((props) =>
      ui.text(`v:${String(props.value)}`),
    );

    const c0 = commitComposite(null, widgetHost([Plain({ value: 1 })]), harness);
    const c1 = commitComposite(c0.root, widgetHost([Plain({ value: 2 })]), harness);

    assert.equal(firstChildId(c1.root), firstChildId(c0.root));
  });

  test("keyed widget becoming unkeyed remounts", () => {
    const harness = createHarness();
    const Widget = defineWidget<{ key?: string }>(() => ui.text("w"));

    const c0 = commitComposite(null, widgetHost([Widget({ key: "slot" })]), harness);
    const oldId = firstChildId(c0.root);

    const c1 = commitComposite(c0.root, widgetHost([Widget({})]), harness);
    const newId = firstChildId(c1.root);

    assert.notEqual(newId, oldId);
    assert.equal(c1.unmountedInstanceIds.includes(oldId), true);
    assert.equal(c1.mountedInstanceIds.includes(newId), true);
  });

  test("unkeyed widget becoming keyed remounts", () => {
    const harness = createHarness();
    const Widget = defineWidget<{ key?: string }>(() => ui.text("w"));

    const c0 = commitComposite(null, widgetHost([Widget({})]), harness);
    const oldId = firstChildId(c0.root);

    const c1 = commitComposite(c0.root, widgetHost([Widget({ key: "slot" })]), harness);
    const newId = firstChildId(c1.root);

    assert.notEqual(newId, oldId);
    assert.equal(c1.unmountedInstanceIds.includes(oldId), true);
    assert.equal(c1.mountedInstanceIds.includes(newId), true);
  });

  test("parent sibling updates do not remount keyed widget", () => {
    const harness = createHarness();
    const Widget = defineWidget<{ key?: string }>(() => ui.text("stable"));

    const c0 = commitComposite(
      null,
      widgetHost([Widget({ key: "w" }), ui.text("tick:0")]),
      harness,
    );
    const c1 = commitComposite(
      c0.root,
      widgetHost([Widget({ key: "w" }), ui.text("tick:1")]),
      harness,
    );

    assert.equal(childIdByKey(c1.root, "w"), childIdByKey(c0.root, "w"));
  });

  test("removing one keyed widget triggers cleanup for only that widget", () => {
    const harness = createHarness();
    const cleanups: string[] = [];

    const Effectful = defineWidget<{ name: string; key?: string }>((props, ctx) => {
      ctx.useEffect(() => {
        return () => {
          cleanups.push(props.name);
        };
      }, []);
      return ui.text(`name:${props.name}`);
    });

    const c0 = commitComposite(
      null,
      widgetHost([
        Effectful({ name: "a", key: "a" }),
        Effectful({ name: "b", key: "b" }),
        Effectful({ name: "c", key: "c" }),
      ]),
      harness,
    );

    const c1 = commitComposite(
      c0.root,
      widgetHost([Effectful({ name: "a", key: "a" }), Effectful({ name: "c", key: "c" })]),
      harness,
    );

    deleteUnmounted(c1, harness);
    assert.deepEqual(cleanups, ["b"]);
  });

  test("StubBackend integration: cleanup fires on unmount", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: { show: true } });

    let mounts = 0;
    let cleanups = 0;

    const W = defineWidget<{ key?: string }>((_props, ctx) => {
      ctx.useEffect(() => {
        mounts++;
        return () => {
          cleanups++;
        };
      }, []);
      return ui.text("widget");
    });

    app.view((state) => widgetHost([state.show ? W({ key: "w" }) : ui.text("off")]));

    await app.start();
    emitResize(backend, 1);
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(20);

    assert.equal(mounts, 1);
    assert.equal(cleanups, 0);

    app.update((prev) => ({ ...prev, show: false }));
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(20);
    assert.equal(cleanups, 1);

    await app.stop();
    await flushMicrotasks(20);
  });

  test("StubBackend integration: remove + re-add same key creates fresh state", async () => {
    const backend = new StubBackend();
    const app = createApp({ backend, initialState: { show: true } });

    let initCalls = 0;
    const seenSeeds: number[] = [];

    const W = defineWidget<{ key?: string }>((_props, ctx) => {
      const [seed] = ctx.useState(() => {
        initCalls++;
        return initCalls;
      });
      seenSeeds.push(seed);
      return ui.text(`seed:${String(seed)}`);
    });

    app.view((state) => widgetHost([state.show ? W({ key: "same" }) : ui.text("hidden")]));

    await app.start();
    emitResize(backend, 2);
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(20);

    app.update((prev) => ({ ...prev, show: false }));
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(20);

    app.update((prev) => ({ ...prev, show: true }));
    await flushMicrotasks(20);
    backend.resolveNextFrame();
    await flushMicrotasks(20);

    assert.equal(initCalls, 2);
    assert.deepEqual(seenSeeds, [1, 2]);

    await app.stop();
    await flushMicrotasks(20);
  });
});
