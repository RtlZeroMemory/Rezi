import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_ESCAPE } from "../../keybindings/keyCodes.js";
import {
  computeZoneTraversal,
  createFocusManagerState,
  finalizeFocusWithPreCollectedMetadata,
} from "../../runtime/focus.js";
import type { FocusManagerState, FocusZone } from "../../runtime/focus.js";
import { routeLayerEscape } from "../../runtime/router.js";
import type { CollectedTrap, CollectedZone } from "../../runtime/widgetMeta.js";

function keyEvent(key: number, action: "down" | "up" = "down"): ZrevEvent {
  return { kind: "key", key, action, mods: 0, timeMs: 0 };
}

function mouseEvent(): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x: 0,
    y: 0,
    mouseKind: 2,
    mods: 0,
    buttons: 0,
    wheelX: 0,
    wheelY: 0,
  };
}

function zone(
  id: string,
  tabIndex: number,
  focusableIds: readonly string[],
  lastFocusedId: string | null,
): FocusZone {
  return Object.freeze({
    id,
    tabIndex,
    navigation: "linear",
    columns: 1,
    wrapAround: true,
    focusableIds,
    lastFocusedId,
  });
}

function collectedZone(
  id: string,
  tabIndex: number,
  focusableIds: readonly string[],
): CollectedZone {
  return Object.freeze({
    id,
    tabIndex,
    navigation: "linear",
    columns: 1,
    wrapAround: true,
    focusableIds,
  });
}

function collectedTrap(
  id: string,
  active: boolean,
  returnFocusTo: string | null,
  initialFocus: string | null,
  focusableIds: readonly string[],
): CollectedTrap {
  return Object.freeze({ id, active, returnFocusTo, initialFocus, focusableIds });
}

describe("modal.focus - layer escape routing", () => {
  test("ignores non-key events", () => {
    const result = routeLayerEscape(mouseEvent(), {
      layerStack: ["modal"],
      closeOnEscape: new Map(),
      onClose: new Map([["modal", () => undefined]]),
    });
    assert.equal(result.consumed, false);
  });

  test("ignores key-up events", () => {
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE, "up"), {
      layerStack: ["modal"],
      closeOnEscape: new Map(),
      onClose: new Map([["modal", () => undefined]]),
    });
    assert.equal(result.consumed, false);
  });

  test("ignores non-escape keys", () => {
    const result = routeLayerEscape(keyEvent(65), {
      layerStack: ["modal"],
      closeOnEscape: new Map(),
      onClose: new Map([["modal", () => undefined]]),
    });
    assert.equal(result.consumed, false);
  });

  test("closes topmost closable layer", () => {
    const closed: string[] = [];
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["a", "b"],
      closeOnEscape: new Map([
        ["a", true],
        ["b", true],
      ]),
      onClose: new Map([
        ["a", () => closed.push("a")],
        ["b", () => closed.push("b")],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "b");
    assert.deepEqual(closed, ["b"]);
  });

  test("skips layers with closeOnEscape=false", () => {
    const closed: string[] = [];
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["base", "modal"],
      closeOnEscape: new Map([
        ["base", true],
        ["modal", false],
      ]),
      onClose: new Map([
        ["base", () => closed.push("base")],
        ["modal", () => closed.push("modal")],
      ]),
    });

    assert.equal(result.closedLayerId, "base");
    assert.deepEqual(closed, ["base"]);
  });

  test("skips closable layer without onClose callback", () => {
    const closed: string[] = [];
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["base", "top"],
      closeOnEscape: new Map([
        ["base", true],
        ["top", true],
      ]),
      onClose: new Map([["base", () => closed.push("base")]]),
    });

    assert.equal(result.closedLayerId, "base");
    assert.deepEqual(closed, ["base"]);
  });

  test("swallows onClose callback errors and still consumes", () => {
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", true]]),
      onClose: new Map([
        [
          "modal",
          () => {
            throw new Error("boom");
          },
        ],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "modal");
  });

  test("returns not consumed when no layer can close", () => {
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", false]]),
      onClose: new Map([["modal", () => undefined]]),
    });
    assert.equal(result.consumed, false);
  });

  test("defaults closeOnEscape to true when map entry missing", () => {
    let closed = false;
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal"],
      closeOnEscape: new Map(),
      onClose: new Map([
        [
          "modal",
          () => {
            closed = true;
          },
        ],
      ]),
    });
    assert.equal(result.closedLayerId, "modal");
    assert.equal(closed, true);
  });

  test("respects stack order and closes nearest eligible layer only", () => {
    const closed: string[] = [];
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["one", "two", "three"],
      closeOnEscape: new Map([
        ["one", true],
        ["two", false],
        ["three", true],
      ]),
      onClose: new Map([
        ["one", () => closed.push("one")],
        ["three", () => closed.push("three")],
      ]),
    });

    assert.equal(result.closedLayerId, "three");
    assert.deepEqual(closed, ["three"]);
  });
});

describe("modal.focus - focus trap and zone traversal", () => {
  test("active trap keeps traversal in current zone", () => {
    const zones = new Map<string, FocusZone>([["z", zone("z", 0, ["a", "b"], "a")]]);
    const traps = new Map<string, CollectedTrap>([
      ["trap", collectedTrap("trap", true, null, null, ["a"])],
    ]);

    const result = computeZoneTraversal(zones, "z", "next", ["trap"], traps);
    assert.deepEqual(result, { nextZoneId: "z", nextFocusedId: null });
  });

  test("active trap with zero focusables returns null traversal", () => {
    const zones = new Map<string, FocusZone>([["z", zone("z", 0, ["a"], "a")]]);
    const traps = new Map<string, CollectedTrap>([
      ["trap", collectedTrap("trap", true, null, null, [])],
    ]);

    const result = computeZoneTraversal(zones, "z", "next", ["trap"], traps);
    assert.deepEqual(result, { nextZoneId: null, nextFocusedId: null });
  });

  test("traversal skips empty zones and uses remembered focus when valid", () => {
    const zones = new Map<string, FocusZone>([
      ["a", zone("a", 0, [], null)],
      ["b", zone("b", 1, ["b1", "b2"], "b2")],
      ["c", zone("c", 2, ["c1"], null)],
    ]);

    const result = computeZoneTraversal(zones, "a", "next", [], new Map(), new Map([["b", "b2"]]));
    assert.deepEqual(result, { nextZoneId: "b", nextFocusedId: "b2" });
  });

  test("prev traversal picks last focusable when no remembered focus", () => {
    const zones = new Map<string, FocusZone>([
      ["a", zone("a", 0, ["a1", "a2"], null)],
      ["b", zone("b", 1, ["b1", "b2", "b3"], null)],
    ]);

    const result = computeZoneTraversal(zones, "a", "prev", [], new Map());
    assert.deepEqual(result, { nextZoneId: "b", nextFocusedId: "b3" });
  });

  test("no zones returns null traversal", () => {
    const result = computeZoneTraversal(new Map(), null, "next", [], new Map());
    assert.deepEqual(result, { nextZoneId: null, nextFocusedId: null });
  });
});

describe("modal.focus - focus state finalization with traps", () => {
  test("applies pending focus when still focusable", () => {
    const base = createFocusManagerState();
    const state: FocusManagerState = Object.freeze({
      ...base,
      focusedId: "a",
      pendingFocusedId: "b",
    });

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["a", "b"],
      new Map<string, CollectedZone>(),
      new Map<string, CollectedTrap>(),
    );

    assert.equal(next.focusedId, "b");
  });

  test("falls back to first focusable when focused id disappears", () => {
    const base = createFocusManagerState();
    const state: FocusManagerState = Object.freeze({ ...base, focusedId: "missing" });

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["first", "second"],
      new Map<string, CollectedZone>(),
      new Map<string, CollectedTrap>(),
    );

    assert.equal(next.focusedId, "first");
  });

  test("new active trap applies valid initialFocus", () => {
    const state = createFocusManagerState();
    const traps = new Map<string, CollectedTrap>([
      ["modal", collectedTrap("modal", true, null, "confirm", ["confirm", "cancel"])],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["open", "confirm", "cancel"],
      new Map<string, CollectedZone>(),
      traps,
    );

    assert.equal(next.focusedId, "confirm");
    assert.deepEqual(next.trapStack, ["modal"]);
  });

  test("new active trap falls back to first trap focusable when initialFocus invalid", () => {
    const state = createFocusManagerState();
    const traps = new Map<string, CollectedTrap>([
      ["modal", collectedTrap("modal", true, null, "missing", ["first", "second"])],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["first", "second"],
      new Map<string, CollectedZone>(),
      traps,
    );

    assert.equal(next.focusedId, "first");
  });

  test("trap deactivation restores returnFocusTo", () => {
    const base = createFocusManagerState();
    const state: FocusManagerState = Object.freeze({
      ...base,
      focusedId: "inside",
      trapStack: Object.freeze(["modal"]),
    });
    const traps = new Map<string, CollectedTrap>([
      ["modal", collectedTrap("modal", false, "trigger", null, [])],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["trigger", "inside"],
      new Map<string, CollectedZone>(),
      traps,
    );

    assert.equal(next.focusedId, "trigger");
    assert.deepEqual(next.trapStack, []);
  });

  test("activeZoneId follows finalized focused id", () => {
    const base = createFocusManagerState();
    const state: FocusManagerState = Object.freeze({
      ...base,
      focusedId: "a",
      pendingFocusedId: "b",
    });
    const zones = new Map<string, CollectedZone>([
      ["zoneA", collectedZone("zoneA", 0, ["a"])],
      ["zoneB", collectedZone("zoneB", 1, ["b"])],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["a", "b"],
      zones,
      new Map<string, CollectedTrap>(),
    );

    assert.equal(next.focusedId, "b");
    assert.equal(next.activeZoneId, "zoneB");
  });

  test("lastFocusedByZone is pruned to existing zones and valid ids", () => {
    const base = createFocusManagerState();
    const state: FocusManagerState = Object.freeze({
      ...base,
      focusedId: "a",
      activeZoneId: "zoneA",
      lastFocusedByZone: new Map([
        ["zoneA", "missing"],
        ["zoneB", "b"],
        ["zoneGone", "z"],
      ]),
    });

    const zones = new Map<string, CollectedZone>([
      ["zoneA", collectedZone("zoneA", 0, ["a"])],
      ["zoneB", collectedZone("zoneB", 1, ["b"])],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(
      state,
      ["a", "b"],
      zones,
      new Map<string, CollectedTrap>(),
    );

    assert.equal(next.lastFocusedByZone.get("zoneGone"), undefined);
    assert.equal(next.lastFocusedByZone.get("zoneB"), "b");
    assert.equal(next.lastFocusedByZone.get("zoneA"), "a");
  });
});
