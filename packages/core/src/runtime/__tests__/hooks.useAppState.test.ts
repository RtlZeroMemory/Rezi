import { assert, describe, test } from "@rezi-ui/testkit";
import { defineWidget } from "../../widgets/composition.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";
import { type CommitOk, type RuntimeInstance, commitVNodeTree } from "../commit.js";
import { type InstanceId, createInstanceIdAllocator } from "../instance.js";
import { createCompositeInstanceRegistry } from "../instances.js";

type CompositeHarness<State> = Readonly<{
  commit: (vnode: VNode, appState: State) => CommitOk;
  invalidatedInstanceIds: InstanceId[];
}>;

function createCompositeHarness<State>(): CompositeHarness<State> {
  const allocator = createInstanceIdAllocator(1);
  const registry = createCompositeInstanceRegistry();
  const invalidatedInstanceIds: InstanceId[] = [];
  let prevRoot: RuntimeInstance | null = null;

  return Object.freeze({
    commit: (vnode: VNode, appState: State): CommitOk => {
      const res = commitVNodeTree(prevRoot, vnode, {
        allocator,
        composite: {
          registry,
          appState,
          onInvalidate: (instanceId: InstanceId) => {
            invalidatedInstanceIds.push(instanceId);
          },
        },
      });

      if (!res.ok) {
        throw new Error(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
      }

      const next = res.value;
      prevRoot = next.root;
      return next;
    },
    invalidatedInstanceIds,
  });
}

describe("runtime hooks - useAppState rerender gating", () => {
  test("selector is called with current app-state snapshot on initial render", () => {
    type AppState = Readonly<{ count: number }>;

    const snapshot: AppState = Object.freeze({ count: 7 });
    let renderCount = 0;
    const selectorStates: AppState[] = [];
    const selectedValues: number[] = [];

    const selectCount = (state: AppState): number => {
      selectorStates.push(state);
      return state.count;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState(selectCount);
      selectedValues.push(selected);
      return ui.text(`count:${selected}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshot);

    assert.equal(renderCount, 1);
    assert.equal(selectorStates.length, 1);
    assert.equal(selectorStates[0], snapshot);
    assert.deepEqual(selectedValues, [7]);
  });

  test("selector receives latest app-state during gating checks without rerender", () => {
    type AppState = Readonly<{ count: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ count: 5, unrelated: 0 }),
      Object.freeze({ count: 5, unrelated: 1 }),
    ];

    let renderCount = 0;
    const selectorStates: AppState[] = [];
    const selectedValues: number[] = [];

    const selectCount = (state: AppState): number => {
      selectorStates.push(state);
      return state.count;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState(selectCount);
      selectedValues.push(selected);
      return ui.text(`count:${selected}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 1);
    assert.equal(selectorStates.length, 2);
    assert.equal(selectorStates[1], snapshots[1]);
    assert.deepEqual(selectedValues, [5]);
  });

  test("widget rerenders when selected primitive state changes", () => {
    type AppState = Readonly<{ count: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ count: 1, unrelated: 0 }),
      Object.freeze({ count: 2, unrelated: 99 }),
    ];

    let renderCount = 0;
    const selectedValues: number[] = [];

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState((state) => state.count);
      selectedValues.push(selected);
      return ui.text(`count:${selected}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 2);
    assert.deepEqual(selectedValues, [1, 2]);
  });

  test("prop changes do not evaluate stale selectors before rerender", () => {
    type AppState = Readonly<{
      a?: Readonly<{ value: number }>;
      b?: Readonly<{ value: number }>;
    }>;
    type Props = Readonly<{ mode: "a" | "b"; key?: string }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ a: Object.freeze({ value: 1 }) }),
      Object.freeze({ b: Object.freeze({ value: 2 }) }),
    ];

    let renderCount = 0;
    const selectedValues: number[] = [];

    const Widget = defineWidget<Props, AppState>((props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState((state) => {
        if (props.mode === "a") {
          if (!state.a) throw new Error("missing a branch");
          return state.a.value;
        }
        if (!state.b) throw new Error("missing b branch");
        return state.b.value;
      });
      selectedValues.push(selected);
      return ui.text(String(selected));
    });

    const h = createCompositeHarness<AppState>();
    assert.doesNotThrow(() => {
      h.commit(Widget({ mode: "a" }), snapshots[0]);
    });
    assert.doesNotThrow(() => {
      h.commit(Widget({ mode: "b" }), snapshots[1]);
    });

    assert.equal(renderCount, 2);
    assert.deepEqual(selectedValues, [1, 2]);
  });

  test("widget does not rerender when unrelated app-state changes", () => {
    type AppState = Readonly<{ count: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ count: 3, unrelated: 0 }),
      Object.freeze({ count: 3, unrelated: 42 }),
    ];

    let renderCount = 0;
    let selectorCallCount = 0;
    const selectedValues: number[] = [];

    const selectCount = (state: AppState): number => {
      selectorCallCount++;
      return state.count;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState(selectCount);
      selectedValues.push(selected);
      return ui.text(`count:${selected}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 1);
    assert.equal(selectorCallCount, 2);
    assert.deepEqual(selectedValues, [3]);
  });

  test("selector returning the same reference prevents rerender", () => {
    type StableSlice = Readonly<{ token: string }>;
    type AppState = Readonly<{ slice: StableSlice; unrelated: number }>;

    const stableSlice: StableSlice = Object.freeze({ token: "stable" });
    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ slice: stableSlice, unrelated: 0 }),
      Object.freeze({ slice: stableSlice, unrelated: 1 }),
    ];

    let renderCount = 0;
    let selectorCallCount = 0;
    const selectedRefs: StableSlice[] = [];

    const selectSlice = (state: AppState): StableSlice => {
      selectorCallCount++;
      return state.slice;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState(selectSlice);
      selectedRefs.push(selected);
      return ui.text(selected.token);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 1);
    assert.equal(selectorCallCount, 2);
    assert.equal(selectedRefs.length, 1);
    assert.equal(selectedRefs[0], stableSlice);
  });

  test("selector returning a new reference causes rerender even with equal shape", () => {
    type AppState = Readonly<{ label: string; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ label: "A", unrelated: 0 }),
      Object.freeze({ label: "A", unrelated: 9 }),
    ];

    let renderCount = 0;
    let selectorCallCount = 0;
    const selectedValues: Array<Readonly<{ label: string }>> = [];

    const selectObject = (state: AppState): Readonly<{ label: string }> => {
      selectorCallCount++;
      return { label: state.label };
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState(selectObject);
      selectedValues.push(selected);
      return ui.text(selected.label);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 2);
    assert.equal(selectorCallCount, 3);
    assert.deepEqual(selectedValues, [{ label: "A" }, { label: "A" }]);
    assert.notEqual(selectedValues[0], selectedValues[1]);
  });

  test("multiple selectors rerender widget when any selected value changes", () => {
    type AppState = Readonly<{ left: number; right: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ left: 1, right: 2, unrelated: 0 }),
      Object.freeze({ left: 1, right: 3, unrelated: 5 }),
    ];

    let renderCount = 0;
    let leftSelectorCalls = 0;
    let rightSelectorCalls = 0;
    const selectedPairs: string[] = [];

    const selectLeft = (state: AppState): number => {
      leftSelectorCalls++;
      return state.left;
    };

    const selectRight = (state: AppState): number => {
      rightSelectorCalls++;
      return state.right;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const left = ctx.useAppState(selectLeft);
      const right = ctx.useAppState(selectRight);
      selectedPairs.push(`${left}:${right}`);
      return ui.text(`${left}:${right}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 2);
    assert.equal(leftSelectorCalls, 3);
    assert.equal(rightSelectorCalls, 3);
    assert.deepEqual(selectedPairs, ["1:2", "1:3"]);
  });

  test("multiple selectors skip rerender when all selected values are stable", () => {
    type AppState = Readonly<{ left: number; right: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ left: 9, right: 4, unrelated: 0 }),
      Object.freeze({ left: 9, right: 4, unrelated: 99 }),
    ];

    let renderCount = 0;
    let leftSelectorCalls = 0;
    let rightSelectorCalls = 0;
    const selectedPairs: string[] = [];

    const selectLeft = (state: AppState): number => {
      leftSelectorCalls++;
      return state.left;
    };

    const selectRight = (state: AppState): number => {
      rightSelectorCalls++;
      return state.right;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const left = ctx.useAppState(selectLeft);
      const right = ctx.useAppState(selectRight);
      selectedPairs.push(`${left}:${right}`);
      return ui.text(`${left}:${right}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 1);
    assert.equal(leftSelectorCalls, 2);
    assert.equal(rightSelectorCalls, 2);
    assert.deepEqual(selectedPairs, ["9:4"]);
  });

  test("multiple selectors short-circuit gating when an early selector changes", () => {
    type AppState = Readonly<{ first: number; second: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ first: 1, second: 1, unrelated: 0 }),
      Object.freeze({ first: 2, second: 1, unrelated: 0 }),
    ];

    let renderCount = 0;
    let firstSelectorCalls = 0;
    let secondSelectorCalls = 0;
    const selectedPairs: string[] = [];

    const selectFirst = (state: AppState): number => {
      firstSelectorCalls++;
      return state.first;
    };

    const selectSecond = (state: AppState): number => {
      secondSelectorCalls++;
      return state.second;
    };

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const first = ctx.useAppState(selectFirst);
      const second = ctx.useAppState(selectSecond);
      selectedPairs.push(`${first}:${second}`);
      return ui.text(`${first}:${second}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);
    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 2);
    assert.equal(firstSelectorCalls, 3);
    assert.equal(secondSelectorCalls, 2);
    assert.deepEqual(selectedPairs, ["1:1", "2:1"]);
  });

  test("multiple widget instances gate rerenders independently by selector", () => {
    type AppState = Readonly<{ a: number; b: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ a: 1, b: 10, unrelated: 0 }),
      Object.freeze({ a: 2, b: 10, unrelated: 1 }),
    ];

    let widgetARenderCount = 0;
    let widgetBRenderCount = 0;
    let selectorACalls = 0;
    let selectorBCalls = 0;
    const selectedA: number[] = [];
    const selectedB: number[] = [];

    const WidgetA = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      widgetARenderCount++;
      const a = ctx.useAppState((state) => {
        selectorACalls++;
        return state.a;
      });
      selectedA.push(a);
      return ui.text(`a:${a}`);
    });

    const WidgetB = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      widgetBRenderCount++;
      const b = ctx.useAppState((state) => {
        selectorBCalls++;
        return state.b;
      });
      selectedB.push(b);
      return ui.text(`b:${b}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(ui.column({}, [WidgetA({ key: "a" }), WidgetB({ key: "b" })]), snapshots[0]);
    h.commit(ui.column({}, [WidgetA({ key: "a" }), WidgetB({ key: "b" })]), snapshots[1]);

    assert.equal(widgetARenderCount, 2);
    assert.equal(widgetBRenderCount, 1);
    assert.equal(selectorACalls, 3);
    assert.equal(selectorBCalls, 2);
    assert.deepEqual(selectedA, [1, 2]);
    assert.deepEqual(selectedB, [10]);
  });

  test("local useState invalidation rerenders even when selected app-state stays stable", () => {
    type AppState = Readonly<{ count: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ count: 5, unrelated: 0 }),
      Object.freeze({ count: 5, unrelated: 1 }),
    ];

    let renderCount = 0;
    let selectorCallCount = 0;
    const selectedValues: number[] = [];
    const localValues: number[] = [];
    let setLocal: ((v: number | ((prev: number) => number)) => void) | null = null;

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      const selected = ctx.useAppState((state) => {
        selectorCallCount++;
        return state.count;
      });
      const [local, setLocalState] = ctx.useState(0);
      setLocal = setLocalState;
      selectedValues.push(selected);
      localValues.push(local);
      return ui.text(`${selected}:${local}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);

    const setLocalNow = setLocal as ((v: number | ((prev: number) => number)) => void) | null;
    if (setLocalNow === null) throw new Error("expected local state setter");
    setLocalNow(1);
    assert.deepEqual(h.invalidatedInstanceIds, [1]);

    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 2);
    assert.equal(selectorCallCount, 2);
    assert.deepEqual(selectedValues, [5, 5]);
    assert.deepEqual(localValues, [0, 1]);
  });

  test("local useState set to same value does not force rerender", () => {
    type AppState = Readonly<{ count: number; unrelated: number }>;

    const snapshots: readonly [AppState, AppState] = [
      Object.freeze({ count: 8, unrelated: 0 }),
      Object.freeze({ count: 8, unrelated: 1 }),
    ];

    let renderCount = 0;
    let selectorCallCount = 0;
    const localValues: number[] = [];
    let setLocal: ((v: number | ((prev: number) => number)) => void) | null = null;

    const Widget = defineWidget<{ key?: string }, AppState>((_props, ctx) => {
      renderCount++;
      ctx.useAppState((state) => {
        selectorCallCount++;
        return state.count;
      });
      const [local, setLocalState] = ctx.useState(0);
      setLocal = setLocalState;
      localValues.push(local);
      return ui.text(`local:${local}`);
    });

    const h = createCompositeHarness<AppState>();
    h.commit(Widget({}), snapshots[0]);

    const setLocalNow = setLocal as ((v: number | ((prev: number) => number)) => void) | null;
    if (setLocalNow === null) throw new Error("expected local state setter");
    setLocalNow(0);
    assert.deepEqual(h.invalidatedInstanceIds, []);

    h.commit(Widget({}), snapshots[1]);

    assert.equal(renderCount, 1);
    assert.equal(selectorCallCount, 2);
    assert.deepEqual(localValues, [0]);
  });
});
