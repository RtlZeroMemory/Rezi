import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { ZR_KEY_DOWN, ZR_KEY_TAB, ZR_KEY_UP, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import { commitVNodeTree } from "../commit.js";
import {
  type FocusZone,
  computeGridMovement,
  computeZoneMovement,
  computeZoneTraversal,
} from "../focus.js";
import { createInstanceIdAllocator } from "../instance.js";
import { routeKeyWithZones } from "../router.js";
import type { KeyRoutingCtxWithZones } from "../router.js";
import { collectFocusZones } from "../widgetMeta.js";
import type { CollectedTrap } from "../widgetMeta.js";

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

function zone(args: {
  id: string;
  tabIndex?: number;
  navigation?: FocusZone["navigation"];
  columns?: number;
  wrapAround?: boolean;
  focusableIds: readonly string[];
  lastFocusedId?: string | null;
}): FocusZone {
  return {
    id: args.id,
    tabIndex: args.tabIndex ?? 0,
    navigation: args.navigation ?? "linear",
    columns: args.columns ?? 1,
    wrapAround: args.wrapAround ?? true,
    focusableIds: args.focusableIds,
    lastFocusedId: args.lastFocusedId ?? null,
  };
}

function keyEvent(key: number, mods = 0) {
  return { kind: "key" as const, action: "down" as const, key, mods, timeMs: 0 };
}

function routingCtx(overrides: Partial<KeyRoutingCtxWithZones>): KeyRoutingCtxWithZones {
  const enabledById = new Map<string, boolean>();
  for (const id of overrides.focusList ?? []) {
    enabledById.set(id, true);
  }

  return {
    focusedId: null,
    activeZoneId: null,
    focusList: [],
    zones: new Map<string, FocusZone>(),
    lastFocusedByZone: new Map<string, string>(),
    traps: new Map<string, CollectedTrap>(),
    trapStack: [],
    enabledById,
    ...overrides,
  };
}

describe("focus zones - computeGridMovement", () => {
  test("returns null for empty grids", () => {
    assert.equal(computeGridMovement(0, 3, 0, "next", true), null);
  });

  test("moves down by column count", () => {
    assert.equal(computeGridMovement(1, 3, 9, "down", true), 4);
  });

  test("wraps right from last item to first when enabled", () => {
    assert.equal(computeGridMovement(8, 3, 9, "right", true), 0);
  });

  test("blocks right from last item when wrap is disabled", () => {
    assert.equal(computeGridMovement(8, 3, 9, "right", false), null);
  });

  test("wraps up from first row to last row in same column", () => {
    assert.equal(computeGridMovement(1, 3, 9, "up", true), 7);
  });
});

describe("focus zones - computeZoneMovement", () => {
  test("linear down moves to next id", () => {
    const z = zone({ id: "z", navigation: "linear", focusableIds: ["a", "b", "c"] });
    assert.equal(computeZoneMovement(z, "a", "down"), "b");
  });

  test("linear up moves to previous id", () => {
    const z = zone({ id: "z", navigation: "linear", focusableIds: ["a", "b", "c"] });
    assert.equal(computeZoneMovement(z, "b", "up"), "a");
  });

  test("linear boundaries return null when wrapAround=false", () => {
    const z = zone({
      id: "z",
      navigation: "linear",
      wrapAround: false,
      focusableIds: ["a", "b", "c"],
    });
    assert.equal(computeZoneMovement(z, "c", "down"), null);
  });

  test("grid down moves by column count", () => {
    const z = zone({
      id: "z",
      navigation: "grid",
      columns: 2,
      focusableIds: ["a", "b", "c", "d"],
    });
    assert.equal(computeZoneMovement(z, "b", "down"), "d");
  });

  test("grid right at row edge returns null when wrapAround=false", () => {
    const z = zone({
      id: "z",
      navigation: "grid",
      columns: 2,
      wrapAround: false,
      focusableIds: ["a", "b", "c", "d"],
    });
    assert.equal(computeZoneMovement(z, "b", "right"), null);
  });

  test("navigation=none blocks arrow movement", () => {
    const z = zone({ id: "z", navigation: "none", focusableIds: ["a", "b"] });
    assert.equal(computeZoneMovement(z, "a", "down"), null);
  });

  test("focus outside zone starts at first focusable", () => {
    const z = zone({ id: "z", navigation: "linear", focusableIds: ["a", "b"] });
    assert.equal(computeZoneMovement(z, "missing", "down"), "a");
  });

  test("empty zones cannot move focus", () => {
    const z = zone({ id: "z", navigation: "linear", focusableIds: [] });
    assert.equal(computeZoneMovement(z, null, "down"), null);
  });
});

describe("focus zones - computeZoneTraversal", () => {
  test("TAB moves to the next zone by tabIndex", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a", "b"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["c", "d"] })],
    ]);

    const next = computeZoneTraversal(zones, "z1", "next", [], new Map());
    assert.equal(next.nextZoneId, "z2");
    assert.equal(next.nextFocusedId, "c");
  });

  test("Shift+TAB moves to previous zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a", "b"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["c", "d"] })],
    ]);

    const prev = computeZoneTraversal(zones, "z2", "prev", [], new Map());
    assert.equal(prev.nextZoneId, "z1");
    assert.equal(prev.nextFocusedId, "b");
  });

  test("TAB wraps from last zone back to first", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b"] })],
    ]);

    const next = computeZoneTraversal(zones, "z2", "next", [], new Map());
    assert.equal(next.nextZoneId, "z1");
    assert.equal(next.nextFocusedId, "a");
  });

  test("skips empty zones while traversing", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: [] })],
      ["z3", zone({ id: "z3", tabIndex: 2, focusableIds: ["c"] })],
    ]);

    const next = computeZoneTraversal(zones, "z1", "next", [], new Map());
    assert.equal(next.nextZoneId, "z3");
    assert.equal(next.nextFocusedId, "c");
  });

  test("prefers authoritative lastFocusedByZone over zone metadata", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a", "b"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["c", "d"], lastFocusedId: "d" })],
    ]);

    const remembered = new Map<string, string>([["z2", "c"]]);
    const next = computeZoneTraversal(zones, "z1", "next", [], new Map(), remembered);
    assert.equal(next.nextZoneId, "z2");
    assert.equal(next.nextFocusedId, "c");
  });

  test("stale remembered id falls back to zone boundary", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a", "b"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["c", "d"], lastFocusedId: "gone" })],
    ]);

    const next = computeZoneTraversal(zones, "z1", "next", [], new Map());
    assert.equal(next.nextZoneId, "z2");
    assert.equal(next.nextFocusedId, "c");

    const prev = computeZoneTraversal(zones, "z1", "prev", [], new Map());
    assert.equal(prev.nextZoneId, "z2");
    assert.equal(prev.nextFocusedId, "d");
  });

  test("tabIndex ties preserve traversal order (not zone id)", () => {
    const zones = new Map<string, FocusZone>([
      ["zoneZ", zone({ id: "zoneZ", tabIndex: 0, focusableIds: ["z"] })],
      ["zoneA", zone({ id: "zoneA", tabIndex: 0, focusableIds: ["a"] })],
    ]);

    const first = computeZoneTraversal(zones, null, "next", [], new Map());
    assert.equal(first.nextZoneId, "zoneZ");
    assert.equal(first.nextFocusedId, "z");

    const second = computeZoneTraversal(zones, "zoneZ", "next", [], new Map());
    assert.equal(second.nextZoneId, "zoneA");
    assert.equal(second.nextFocusedId, "a");
  });

  test("without active zone, next starts at first sorted zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 5, focusableIds: ["a"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b"] })],
    ]);

    const next = computeZoneTraversal(zones, null, "next", [], new Map());
    assert.equal(next.nextZoneId, "z2");
    assert.equal(next.nextFocusedId, "b");
  });

  test("without active zone, prev starts at last sorted zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a"] })],
      ["z2", zone({ id: "z2", tabIndex: 10, focusableIds: ["b"] })],
    ]);

    const prev = computeZoneTraversal(zones, null, "prev", [], new Map());
    assert.equal(prev.nextZoneId, "z2");
    assert.equal(prev.nextFocusedId, "b");
  });
});

describe("focus zones - metadata collection", () => {
  test("nested zones exclude nested focusables from outer zone", () => {
    const tree: VNode = {
      kind: "focusZone",
      props: { id: "outer", tabIndex: 0 },
      children: [
        { kind: "button", props: { id: "outer-a", label: "A" } },
        {
          kind: "box",
          props: {},
          children: [
            { kind: "button", props: { id: "outer-b", label: "B" } },
            {
              kind: "focusZone",
              props: { id: "inner", tabIndex: 1 },
              children: [{ kind: "button", props: { id: "inner-a", label: "IA" } }],
            },
          ],
        },
      ],
    };

    const zones = collectFocusZones(commitTree(tree));
    assert.deepEqual(zones.get("outer")?.focusableIds ?? [], ["outer-a", "outer-b"]);
    assert.deepEqual(zones.get("inner")?.focusableIds ?? [], ["inner-a"]);
  });

  test("collects zones in DFS traversal order", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "focusZone", props: { id: "z1" }, children: [] },
        {
          kind: "box",
          props: {},
          children: [
            { kind: "focusZone", props: { id: "z2" }, children: [] },
            { kind: "focusZone", props: { id: "z3" }, children: [] },
          ],
        },
      ],
    };

    const keys = [...collectFocusZones(commitTree(tree)).keys()];
    assert.deepEqual(keys, ["z1", "z2", "z3"]);
  });

  test("zones with no focusable children are empty", () => {
    const tree: VNode = {
      kind: "focusZone",
      props: { id: "empty" },
      children: [{ kind: "text", text: "none", props: {} }],
    };

    const zones = collectFocusZones(commitTree(tree));
    assert.deepEqual(zones.get("empty")?.focusableIds ?? ["unexpected"], []);
  });
});

describe("focus zones - routeKeyWithZones", () => {
  test("zones-only TAB uses zone traversal", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a1", "a2"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b1", "b2"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB),
      routingCtx({
        focusedId: "a2",
        activeZoneId: "z1",
        focusList: ["a1", "a2", "b1", "b2"],
        zones,
      }),
    );

    assert.equal(res.nextZoneId, "z2");
    assert.equal(res.nextFocusedId, "b1");
  });

  test("zones-only Shift+TAB moves to previous zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a1", "a2"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b1", "b2"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB, ZR_MOD_SHIFT),
      routingCtx({
        focusedId: "b1",
        activeZoneId: "z2",
        focusList: ["a1", "a2", "b1", "b2"],
        zones,
      }),
    );

    assert.equal(res.nextZoneId, "z1");
    assert.equal(res.nextFocusedId, "a2");
  });

  test("mixed focus list: TAB from zoned item reaches non-zoned item", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a1", "a2"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b1"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB),
      routingCtx({
        focusedId: "a2",
        activeZoneId: "z1",
        focusList: ["a1", "a2", "outside", "b1"],
        zones,
      }),
    );

    assert.equal(res.nextFocusedId, "outside");
    assert.equal(res.nextZoneId, null);
  });

  test("mixed focus list: Shift+TAB from zoned item reaches previous non-zoned item", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a1", "a2"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b1"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB, ZR_MOD_SHIFT),
      routingCtx({
        focusedId: "b1",
        activeZoneId: "z2",
        focusList: ["a1", "a2", "outside", "b1"],
        zones,
      }),
    );

    assert.equal(res.nextFocusedId, "outside");
    assert.equal(res.nextZoneId, null);
  });

  test("mixed focus list: TAB from non-zone item can enter zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a1", "a2"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b1"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB),
      routingCtx({
        focusedId: "outside",
        activeZoneId: null,
        focusList: ["outside", "b1"],
        zones,
      }),
    );

    assert.equal(res.nextFocusedId, "b1");
    assert.equal(res.nextZoneId, "z2");
  });

  test("mixed focus list: Shift+TAB from non-zone item can enter previous zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, focusableIds: ["a1", "a2"] })],
      ["z2", zone({ id: "z2", tabIndex: 1, focusableIds: ["b1"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_TAB, ZR_MOD_SHIFT),
      routingCtx({
        focusedId: "outside",
        activeZoneId: null,
        focusList: ["a2", "outside", "b1"],
        zones,
      }),
    );

    assert.equal(res.nextFocusedId, "a2");
    assert.equal(res.nextZoneId, "z1");
  });

  test("arrow key navigation still works within an active zone", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, navigation: "linear", focusableIds: ["a", "b"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_DOWN),
      routingCtx({
        focusedId: "a",
        activeZoneId: "z1",
        focusList: ["a", "b"],
        zones,
      }),
    );

    assert.equal(res.nextFocusedId, "b");
    assert.equal(res.nextZoneId, "z1");
  });

  test("navigation=none ignores arrow keys", () => {
    const zones = new Map<string, FocusZone>([
      ["z1", zone({ id: "z1", tabIndex: 0, navigation: "none", focusableIds: ["a", "b"] })],
    ]);

    const res = routeKeyWithZones(
      keyEvent(ZR_KEY_UP),
      routingCtx({
        focusedId: "a",
        activeZoneId: "z1",
        focusList: ["a", "b"],
        zones,
      }),
    );

    assert.equal(res.nextFocusedId, undefined);
    assert.equal(res.nextZoneId, undefined);
  });
});
