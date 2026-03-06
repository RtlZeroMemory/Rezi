import { assert, test } from "@rezi-ui/testkit";
import {
  createRuntimeLocalStateStore,
  createTreeStateStore,
  createVirtualListStateStore,
} from "../localState.js";

test("runtime-local state store set/get/delete keyed by instanceId (#66)", () => {
  const store = createRuntimeLocalStateStore();

  assert.equal(store.get(1), undefined);

  store.set(1, { hover: true });
  assert.deepEqual(store.get(1), {
    layout: null,
    hover: true,
    pressed: false,
    focusable: false,
    tabIndex: null,
  });

  store.set(1, { pressed: true, layout: { x: 1, y: 2, w: 3, h: 4 } });
  assert.deepEqual(store.get(1), {
    layout: { x: 1, y: 2, w: 3, h: 4 },
    hover: true,
    pressed: true,
    focusable: false,
    tabIndex: null,
  });

  store.delete(1);
  assert.equal(store.get(1), undefined);
});

test("virtual list state store clones measuredHeights inputs", () => {
  const store = createVirtualListStateStore();
  const measuredHeights = new Map<number, number>([[0, 2]]);

  const state = store.set("list", { measuredHeights });
  measuredHeights.set(1, 9);

  assert.notEqual(state.measuredHeights, measuredHeights);
  assert.equal(state.measuredHeights?.has(1), false);
  assert.equal(store.get("list").measuredHeights?.has(1), false);
  assert.throws(() =>
    (
      state.measuredHeights as unknown as {
        set: (key: number, value: number) => void;
      }
    ).set(2, 7),
  );
  assert.equal(store.get("list").measuredHeights?.has(2), false);
});

test("tree state store clones loading and expanded set inputs", () => {
  const store = createTreeStateStore();
  const loadingKeys = new Set<string>(["loading-a"]);
  const expandedSet = new Set<string>(["root"]);

  const state = store.set("tree", {
    loadingKeys,
    expandedSetRef: Object.freeze(["root"]),
    expandedSet,
  });
  loadingKeys.add("loading-b");
  expandedSet.add("child");

  assert.notEqual(state.loadingKeys, loadingKeys);
  assert.notEqual(state.expandedSet, expandedSet);
  assert.equal(state.loadingKeys.has("loading-b"), false);
  assert.equal(state.expandedSet?.has("child"), false);
  assert.equal(store.get("tree").loadingKeys.has("loading-b"), false);
  assert.equal(store.get("tree").expandedSet?.has("child"), false);
  assert.throws(() =>
    (
      state.loadingKeys as unknown as {
        add: (value: string) => void;
      }
    ).add("loading-c"),
  );
  assert.throws(() =>
    (
      state.expandedSet as unknown as {
        add: (value: string) => void;
      }
    ).add("grandchild"),
  );
  assert.equal(store.get("tree").loadingKeys.has("loading-c"), false);
  assert.equal(store.get("tree").expandedSet?.has("grandchild"), false);
});
