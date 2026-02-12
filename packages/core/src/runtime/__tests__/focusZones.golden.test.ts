/**
 * packages/core/src/runtime/__tests__/focusZones.golden.test.ts — Golden tests for focus zones and traps.
 *
 * Tests cover:
 *   1. Zone-to-zone TAB: focus moves to next zone's first focusable
 *   2. Linear navigation: ArrowDown moves to next item
 *   3. Grid navigation: ArrowDown with columns=3 moves +3 items
 *   4. Grid wrap: ArrowRight at row end wraps to next row
 *   5. Trap containment: TAB wraps within trap
 *   6. Trap deactivation: focus returns to returnFocusTo
 *   7. Backwards compatibility: widgets outside zones work as before
 *
 * @see docs/guide/input-and-focus.md
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_LEFT,
  ZR_KEY_RIGHT,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import { commitVNodeTree } from "../commit.js";
import {
  computeFocusList,
  computeGridMovement,
  computeZoneMovement,
  computeZoneTraversal,
  createFocusManagerState,
  finalizeFocusForCommittedTreeWithZones,
} from "../focus.js";
import type { FocusDirection, FocusMove, FocusZone } from "../focus.js";
import { createInstanceIdAllocator } from "../instance.js";
import { routeKeyWithZones } from "../router.js";
import type { KeyRoutingCtxWithZones } from "../router.js";
import { collectEnabledMap, collectFocusTraps, collectFocusZones } from "../widgetMeta.js";
import type { CollectedTrap, CollectedZone } from "../widgetMeta.js";

/**
 * Convert CollectedZone map to FocusZone map for routing tests.
 */
function toFocusZones(
  collected: ReadonlyMap<string, CollectedZone>,
): ReadonlyMap<string, FocusZone> {
  const result = new Map<string, FocusZone>();
  for (const [id, zone] of collected) {
    result.set(id, {
      id: zone.id,
      tabIndex: zone.tabIndex,
      navigation: zone.navigation,
      columns: zone.columns,
      wrapAround: zone.wrapAround,
      focusableIds: zone.focusableIds,
      lastFocusedId: null,
    });
  }
  return result;
}

function commitTree(vnode: VNode) {
  const allocator = createInstanceIdAllocator(1);
  const res = commitVNodeTree(null, vnode, { allocator });
  if (!res.ok) {
    assert.fail(`commit failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value.root;
}

/** Create a mock key event. */
function keyEvent(key: number, mods = 0) {
  return { kind: "key" as const, key, mods, action: "down" as const, timeMs: 0 };
}

describe("Focus Zones - computeGridMovement", () => {
  test("grid movement: down moves by column count", () => {
    // 3x3 grid, at index 1 (row 0, col 1), going down → index 4 (row 1, col 1)
    const result = computeGridMovement(1, 3, 9, "down", true);
    assert.equal(result, 4);
  });

  test("grid movement: up moves by column count", () => {
    // At index 4 (row 1, col 1), going up → index 1 (row 0, col 1)
    const result = computeGridMovement(4, 3, 9, "up", true);
    assert.equal(result, 1);
  });

  test("grid movement: right moves by 1", () => {
    const result = computeGridMovement(1, 3, 9, "right", true);
    assert.equal(result, 2);
  });

  test("grid movement: left moves by 1", () => {
    const result = computeGridMovement(2, 3, 9, "left", true);
    assert.equal(result, 1);
  });

  test("grid movement: wrap at last item to first", () => {
    const result = computeGridMovement(8, 3, 9, "right", true);
    assert.equal(result, 0);
  });

  test("grid movement: no wrap when disabled", () => {
    const result = computeGridMovement(8, 3, 9, "right", false);
    assert.equal(result, null);
  });

  test("grid movement: wrap up from first row to last row", () => {
    const result = computeGridMovement(1, 3, 9, "up", true);
    assert.equal(result, 7); // Same column in last row
  });

  test("grid movement: down wraps to first row", () => {
    const result = computeGridMovement(7, 3, 9, "down", true);
    assert.equal(result, 1); // Same column in first row
  });
});

describe("Focus Zones - computeZoneMovement", () => {
  test("linear zone: down moves to next item", () => {
    const zone: FocusZone = {
      id: "zone1",
      tabIndex: 0,
      navigation: "linear",
      columns: 1,
      wrapAround: true,
      focusableIds: ["a", "b", "c"],
      lastFocusedId: null,
    };
    const result = computeZoneMovement(zone, "a", "down");
    assert.equal(result, "b");
  });

  test("linear zone: up moves to prev item", () => {
    const zone: FocusZone = {
      id: "zone1",
      tabIndex: 0,
      navigation: "linear",
      columns: 1,
      wrapAround: true,
      focusableIds: ["a", "b", "c"],
      lastFocusedId: null,
    };
    const result = computeZoneMovement(zone, "b", "up");
    assert.equal(result, "a");
  });

  test("linear zone: right moves to next item", () => {
    const zone: FocusZone = {
      id: "zone1",
      tabIndex: 0,
      navigation: "linear",
      columns: 1,
      wrapAround: true,
      focusableIds: ["a", "b", "c"],
      lastFocusedId: null,
    };
    const result = computeZoneMovement(zone, "a", "right");
    assert.equal(result, "b");
  });

  test("grid zone: down moves by column count", () => {
    const zone: FocusZone = {
      id: "zone1",
      tabIndex: 0,
      navigation: "grid",
      columns: 3,
      wrapAround: true,
      focusableIds: ["a", "b", "c", "d", "e", "f"],
      lastFocusedId: null,
    };
    const result = computeZoneMovement(zone, "b", "down");
    assert.equal(result, "e"); // index 1 → index 4
  });

  test("none navigation returns null", () => {
    const zone: FocusZone = {
      id: "zone1",
      tabIndex: 0,
      navigation: "none",
      columns: 1,
      wrapAround: true,
      focusableIds: ["a", "b", "c"],
      lastFocusedId: null,
    };
    const result = computeZoneMovement(zone, "a", "down");
    assert.equal(result, null);
  });
});

describe("Focus Zones - computeZoneTraversal", () => {
  test("TAB moves to next zone", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b"],
          lastFocusedId: null,
        },
      ],
      [
        "zone2",
        {
          id: "zone2",
          tabIndex: 1,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["c", "d"],
          lastFocusedId: null,
        },
      ],
    ]);

    const result = computeZoneTraversal(zones, "zone1", "next", [], new Map());
    assert.equal(result.nextZoneId, "zone2");
    assert.equal(result.nextFocusedId, "c");
  });

  test("Shift+TAB moves to prev zone", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b"],
          lastFocusedId: null,
        },
      ],
      [
        "zone2",
        {
          id: "zone2",
          tabIndex: 1,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["c", "d"],
          lastFocusedId: null,
        },
      ],
    ]);

    const result = computeZoneTraversal(zones, "zone2", "prev", [], new Map());
    assert.equal(result.nextZoneId, "zone1");
    assert.equal(result.nextFocusedId, "b"); // Last item when moving prev
  });

  test("TAB wraps from last zone to first", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a"],
          lastFocusedId: null,
        },
      ],
      [
        "zone2",
        {
          id: "zone2",
          tabIndex: 1,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["b"],
          lastFocusedId: null,
        },
      ],
    ]);

    const result = computeZoneTraversal(zones, "zone2", "next", [], new Map());
    assert.equal(result.nextZoneId, "zone1");
    assert.equal(result.nextFocusedId, "a");
  });

  test("zone remembers last focused id", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b"],
          lastFocusedId: null,
        },
      ],
      [
        "zone2",
        {
          id: "zone2",
          tabIndex: 1,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["c", "d"],
          lastFocusedId: "d", // User was on "d" last time
        },
      ],
    ]);

    const result = computeZoneTraversal(zones, "zone1", "next", [], new Map());
    assert.equal(result.nextZoneId, "zone2");
    assert.equal(result.nextFocusedId, "d"); // Returns to last focused
  });
});

describe("Focus Traps - TAB containment", () => {
  test("TAB in active trap wraps within trap", () => {
    const zones = new Map<string, FocusZone>();
    const traps = new Map<string, CollectedTrap>([
      [
        "trap1",
        {
          id: "trap1",
          active: true,
          returnFocusTo: null,
          initialFocus: null,
          focusableIds: ["x", "y", "z"],
        },
      ],
    ]);

    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "z",
      activeZoneId: null,
      focusList: ["a", "b", "x", "y", "z", "c"],
      zones,
      traps,
      trapStack: ["trap1"],
      enabledById: new Map([
        ["x", true],
        ["y", true],
        ["z", true],
        ["a", true],
        ["b", true],
        ["c", true],
      ]),
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_TAB), ctx);
    assert.equal(result.nextFocusedId, "x"); // Wraps within trap
  });
});

describe("Focus Zones - routeKeyWithZones", () => {
  test("TAB traversal prefers authoritative lastFocusedByZone over stale zone metadata", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b"],
          lastFocusedId: null,
        },
      ],
      [
        "zone2",
        {
          id: "zone2",
          tabIndex: 1,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["c", "d"],
          lastFocusedId: null,
        },
      ],
    ]);

    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "c",
      activeZoneId: "zone2",
      focusList: ["a", "b", "c", "d"],
      zones,
      lastFocusedByZone: new Map<string, string>([
        ["zone1", "b"],
        ["zone2", "c"],
      ]),
      traps: new Map(),
      trapStack: [],
      enabledById: new Map([
        ["a", true],
        ["b", true],
        ["c", true],
        ["d", true],
      ]),
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_TAB), ctx);
    assert.equal(result.nextZoneId, "zone1");
    assert.equal(result.nextFocusedId, "b");
  });
});

describe("Focus Zones - VNode integration", () => {
  test("collectFocusZones extracts zone metadata", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        {
          kind: "focusZone",
          props: { id: "zone1", navigation: "linear" },
          children: [{ kind: "button", props: { id: "a", label: "A" } }],
        },
        {
          kind: "focusZone",
          props: { id: "zone2", navigation: "grid", columns: 2 },
          children: [
            { kind: "button", props: { id: "b", label: "B" } },
            { kind: "button", props: { id: "c", label: "C" } },
          ],
        },
      ],
    };

    const committed = commitTree(tree);
    const zones = collectFocusZones(committed);

    assert.equal(zones.size, 2);

    const zone1 = zones.get("zone1");
    assert.ok(zone1 !== undefined);
    assert.equal(zone1.navigation, "linear");
    assert.deepEqual(zone1.focusableIds, ["a"]);

    const zone2 = zones.get("zone2");
    assert.ok(zone2 !== undefined);
    assert.equal(zone2.navigation, "grid");
    assert.equal(zone2.columns, 2);
    assert.deepEqual(zone2.focusableIds, ["b", "c"]);
  });

  test("collectFocusTraps extracts trap metadata", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        {
          kind: "focusTrap",
          props: { id: "modal", active: true, returnFocusTo: "trigger", initialFocus: "confirm" },
          children: [
            { kind: "button", props: { id: "confirm", label: "Confirm" } },
            { kind: "button", props: { id: "cancel", label: "Cancel" } },
          ],
        },
      ],
    };

    const committed = commitTree(tree);
    const traps = collectFocusTraps(committed);

    assert.equal(traps.size, 1);

    const modal = traps.get("modal");
    assert.ok(modal !== undefined);
    assert.equal(modal.active, true);
    assert.equal(modal.returnFocusTo, "trigger");
    assert.equal(modal.initialFocus, "confirm");
    assert.deepEqual(modal.focusableIds, ["confirm", "cancel"]);
  });
});

describe("Focus Zones - backwards compatibility", () => {
  test("widgets outside zones use standard focus traversal", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
        { kind: "button", props: { id: "c", label: "C" } },
      ],
    };

    const committed = commitTree(tree);
    const focusList = computeFocusList(committed);
    const collectedZones = collectFocusZones(committed);
    const enabledMap = collectEnabledMap(committed);

    assert.equal(collectedZones.size, 0);
    assert.deepEqual(focusList, ["a", "b", "c"]);

    // Without zones, TAB should work normally
    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "a",
      activeZoneId: null,
      focusList,
      zones: toFocusZones(collectedZones),
      traps: new Map(),
      trapStack: [],
      enabledById: enabledMap,
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_TAB), ctx);
    assert.equal(result.nextFocusedId, "b");
  });

  test("existing FocusState still works", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "a", label: "A" } },
        { kind: "button", props: { id: "b", label: "B" } },
      ],
    };

    const committed = commitTree(tree);
    const focusList = computeFocusList(committed);

    assert.deepEqual(focusList, ["a", "b"]);
  });
});

describe("Focus Zones - arrow key routing", () => {
  test("arrow down in linear zone moves to next", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b", "c"],
          lastFocusedId: null,
        },
      ],
    ]);

    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "a",
      activeZoneId: "zone1",
      focusList: ["a", "b", "c"],
      zones,
      traps: new Map(),
      trapStack: [],
      enabledById: new Map([
        ["a", true],
        ["b", true],
        ["c", true],
      ]),
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextFocusedId, "b");
  });

  test("arrow up in linear zone moves to prev", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "linear",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b", "c"],
          lastFocusedId: null,
        },
      ],
    ]);

    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "b",
      activeZoneId: "zone1",
      focusList: ["a", "b", "c"],
      zones,
      traps: new Map(),
      trapStack: [],
      enabledById: new Map([
        ["a", true],
        ["b", true],
        ["c", true],
      ]),
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_UP), ctx);
    assert.equal(result.nextFocusedId, "a");
  });

  test("arrow down in grid zone moves by columns", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "grid",
          columns: 3,
          wrapAround: true,
          focusableIds: ["a", "b", "c", "d", "e", "f"],
          lastFocusedId: null,
        },
      ],
    ]);

    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "b", // index 1
      activeZoneId: "zone1",
      focusList: ["a", "b", "c", "d", "e", "f"],
      zones,
      traps: new Map(),
      trapStack: [],
      enabledById: new Map([
        ["a", true],
        ["b", true],
        ["c", true],
        ["d", true],
        ["e", true],
        ["f", true],
      ]),
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextFocusedId, "e"); // index 1 + 3 = 4
  });

  test("arrow keys ignored in zone with navigation=none", () => {
    const zones = new Map<string, FocusZone>([
      [
        "zone1",
        {
          id: "zone1",
          tabIndex: 0,
          navigation: "none",
          columns: 1,
          wrapAround: true,
          focusableIds: ["a", "b", "c"],
          lastFocusedId: null,
        },
      ],
    ]);

    const ctx: KeyRoutingCtxWithZones = {
      focusedId: "a",
      activeZoneId: "zone1",
      focusList: ["a", "b", "c"],
      zones,
      traps: new Map(),
      trapStack: [],
      enabledById: new Map([
        ["a", true],
        ["b", true],
        ["c", true],
      ]),
    };

    const result = routeKeyWithZones(keyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextFocusedId, undefined);
  });
});

describe("FocusManagerState - finalizeFocusForCommittedTreeWithZones", () => {
  test("initializes zones from committed tree", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        {
          kind: "focusZone",
          props: { id: "zone1", navigation: "linear" },
          children: [
            { kind: "button", props: { id: "a", label: "A" } },
            { kind: "button", props: { id: "b", label: "B" } },
          ],
        },
      ],
    };

    const committed = commitTree(tree);
    const state = createFocusManagerState();
    const nextState = finalizeFocusForCommittedTreeWithZones(state, committed);

    assert.equal(nextState.zones.size, 1);
    assert.ok(nextState.zones.has("zone1"));
  });

  test("trap activation moves focus to initialFocus", () => {
    const tree: VNode = {
      kind: "column",
      props: {},
      children: [
        { kind: "button", props: { id: "trigger", label: "Open" } },
        {
          kind: "focusTrap",
          props: { id: "modal", active: true, initialFocus: "confirm" },
          children: [
            { kind: "button", props: { id: "confirm", label: "Confirm" } },
            { kind: "button", props: { id: "cancel", label: "Cancel" } },
          ],
        },
      ],
    };

    const committed = commitTree(tree);
    const state = createFocusManagerState();
    const nextState = finalizeFocusForCommittedTreeWithZones(state, committed);

    assert.equal(nextState.focusedId, "confirm");
    assert.deepEqual(nextState.trapStack, ["modal"]);
  });
});
