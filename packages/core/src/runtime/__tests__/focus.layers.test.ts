import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_SPACE,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import type { DropdownItem } from "../../widgets/types.js";
import {
  computeZoneTraversal,
  createFocusManagerState,
  finalizeFocusWithPreCollectedMetadata,
} from "../focus.js";
import type { FocusZone } from "../focus.js";
import { createLayerStackState, getTopmostLayerId, popLayer, pushLayer } from "../layers.js";
import { routeDropdownKey, routeLayerEscape } from "../router.js";
import type { CollectedTrap, CollectedZone } from "../widgetMeta.js";

function keyEvent(key: number, action: "down" | "up" = "down"): ZrevEvent {
  return { kind: "key", key, mods: 0, action, timeMs: 0 };
}

function zone(id: string, focusableIds: readonly string[]): CollectedZone {
  return {
    id,
    tabIndex: 0,
    navigation: "linear",
    columns: 1,
    wrapAround: true,
    focusableIds,
  };
}

function trap(args: {
  id: string;
  active: boolean;
  focusableIds: readonly string[];
  initialFocus?: string | null;
  returnFocusTo?: string | null;
}): CollectedTrap {
  return {
    id: args.id,
    active: args.active,
    focusableIds: args.focusableIds,
    initialFocus: args.initialFocus ?? null,
    returnFocusTo: args.returnFocusTo ?? null,
  };
}

function focusZone(id: string, focusableIds: readonly string[]): FocusZone {
  return {
    id,
    tabIndex: 0,
    navigation: "linear",
    columns: 1,
    wrapAround: true,
    focusableIds,
    lastFocusedId: null,
  };
}

describe("focus layers - modal focus trap lifecycle", () => {
  test("modal open activates trap and focuses initialFocus", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "trigger",
    });
    const focusList = ["trigger", "modal-cancel", "modal-confirm"];
    const zones = new Map<string, CollectedZone>([
      ["main-zone", zone("main-zone", ["trigger"])],
      ["modal-zone", zone("modal-zone", ["modal-cancel", "modal-confirm"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal",
        trap({
          id: "modal",
          active: true,
          initialFocus: "modal-confirm",
          returnFocusTo: "trigger",
          focusableIds: ["modal-cancel", "modal-confirm"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);

    assert.equal(next.focusedId, "modal-confirm");
    assert.deepEqual(next.trapStack, ["modal"]);
    assert.equal(next.activeZoneId, "modal-zone");
    assert.equal(next.lastFocusedByZone.get("modal-zone"), "modal-confirm");
  });

  test("modal open falls back to first trap focusable when initialFocus is missing", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "trigger",
    });
    const focusList = ["trigger", "modal-first", "modal-second"];
    const zones = new Map<string, CollectedZone>([
      ["main-zone", zone("main-zone", ["trigger"])],
      ["modal-zone", zone("modal-zone", ["modal-first", "modal-second"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal",
        trap({
          id: "modal",
          active: true,
          initialFocus: "does-not-exist",
          focusableIds: ["modal-first", "modal-second"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.equal(next.focusedId, "modal-first");
    assert.deepEqual(next.trapStack, ["modal"]);
  });

  test("modal open with no focusables keeps current focus", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "trigger",
    });
    const focusList = ["trigger"];
    const zones = new Map<string, CollectedZone>([["main-zone", zone("main-zone", ["trigger"])]]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal",
        trap({
          id: "modal",
          active: true,
          focusableIds: [],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.equal(next.focusedId, "trigger");
    assert.deepEqual(next.trapStack, ["modal"]);
  });

  test("active trap keeps TAB traversal within current context", () => {
    const zones = new Map<string, FocusZone>([
      ["zone-a", focusZone("zone-a", ["a1", "a2"])],
      ["zone-b", focusZone("zone-b", ["b1", "b2"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal",
        trap({
          id: "modal",
          active: true,
          focusableIds: ["a1", "a2"],
        }),
      ],
    ]);

    const next = computeZoneTraversal(zones, "zone-a", "next", ["modal"], traps);
    assert.equal(next.nextZoneId, "zone-a");
    assert.equal(next.nextFocusedId, null);
  });

  test("stacked modals keep topmost trap active and focused", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "a-first",
      trapStack: Object.freeze(["modal-a"]),
    });
    const focusList = ["trigger", "a-first", "b-first", "b-second"];
    const zones = new Map<string, CollectedZone>([
      ["main-zone", zone("main-zone", ["trigger"])],
      ["modal-a-zone", zone("modal-a-zone", ["a-first"])],
      ["modal-b-zone", zone("modal-b-zone", ["b-first", "b-second"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal-a",
        trap({
          id: "modal-a",
          active: true,
          initialFocus: "a-first",
          focusableIds: ["a-first"],
        }),
      ],
      [
        "modal-b",
        trap({
          id: "modal-b",
          active: true,
          initialFocus: "b-second",
          focusableIds: ["b-first", "b-second"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.deepEqual(next.trapStack, ["modal-a", "modal-b"]);
    assert.equal(next.focusedId, "b-second");
    assert.equal(next.activeZoneId, "modal-b-zone");
  });

  test("modal close returns focus to returnFocusTo target", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "modal-ok",
      trapStack: Object.freeze(["modal"]),
      lastFocusedByZone: new Map([["modal-zone", "modal-ok"]]),
    });
    const focusList = ["trigger", "modal-ok"];
    const zones = new Map<string, CollectedZone>([
      ["main-zone", zone("main-zone", ["trigger"])],
      ["modal-zone", zone("modal-zone", ["modal-ok"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal",
        trap({
          id: "modal",
          active: false,
          returnFocusTo: "trigger",
          focusableIds: ["modal-ok"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.deepEqual(next.trapStack, []);
    assert.equal(next.focusedId, "trigger");
    assert.equal(next.activeZoneId, "main-zone");
  });

  test("modal close keeps current focus when returnFocusTo target is unavailable", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "modal-ok",
      trapStack: Object.freeze(["modal"]),
    });
    const focusList = ["modal-ok", "other"];
    const zones = new Map<string, CollectedZone>([
      ["modal-zone", zone("modal-zone", ["modal-ok"])],
      ["other-zone", zone("other-zone", ["other"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal",
        trap({
          id: "modal",
          active: false,
          returnFocusTo: "missing",
          focusableIds: ["modal-ok"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.deepEqual(next.trapStack, []);
    assert.equal(next.focusedId, "modal-ok");
    assert.equal(next.activeZoneId, "modal-zone");
  });

  test("closing top modal in a stack returns focus to underlying modal target", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "b-ok",
      trapStack: Object.freeze(["modal-a", "modal-b"]),
    });
    const focusList = ["trigger", "a-ok", "b-ok"];
    const zones = new Map<string, CollectedZone>([
      ["main-zone", zone("main-zone", ["trigger"])],
      ["modal-a-zone", zone("modal-a-zone", ["a-ok"])],
      ["modal-b-zone", zone("modal-b-zone", ["b-ok"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal-a",
        trap({
          id: "modal-a",
          active: true,
          focusableIds: ["a-ok"],
        }),
      ],
      [
        "modal-b",
        trap({
          id: "modal-b",
          active: false,
          returnFocusTo: "a-ok",
          focusableIds: ["b-ok"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.deepEqual(next.trapStack, ["modal-a"]);
    assert.equal(next.focusedId, "a-ok");
    assert.equal(next.activeZoneId, "modal-a-zone");
  });

  test("closing lower modal out of order preserves top modal trap", () => {
    const state = Object.freeze({
      ...createFocusManagerState(),
      focusedId: "b-ok",
      trapStack: Object.freeze(["modal-a", "modal-b"]),
    });
    const focusList = ["trigger", "b-ok"];
    const zones = new Map<string, CollectedZone>([
      ["main-zone", zone("main-zone", ["trigger"])],
      ["modal-b-zone", zone("modal-b-zone", ["b-ok"])],
    ]);
    const traps = new Map<string, CollectedTrap>([
      [
        "modal-b",
        trap({
          id: "modal-b",
          active: true,
          focusableIds: ["b-ok"],
        }),
      ],
    ]);

    const next = finalizeFocusWithPreCollectedMetadata(state, focusList, zones, traps);
    assert.deepEqual(next.trapStack, ["modal-b"]);
    assert.equal(next.focusedId, "b-ok");
    assert.equal(next.activeZoneId, "modal-b-zone");
  });
});

describe("focus layers - ESC and layer stack routing", () => {
  test("ESC closes topmost closable layer", () => {
    let closedLayer: string | null = null;
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal-a", "modal-b"],
      closeOnEscape: new Map([
        ["modal-a", true],
        ["modal-b", true],
      ]),
      onClose: new Map([
        [
          "modal-b",
          () => {
            closedLayer = "modal-b";
          },
        ],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "modal-b");
    assert.equal(closedLayer, "modal-b");
  });

  test("ESC skips top layer when closeOnEscape is false", () => {
    let closedLayer: string | null = null;
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["modal-a", "modal-b"],
      closeOnEscape: new Map([
        ["modal-a", true],
        ["modal-b", false],
      ]),
      onClose: new Map([
        [
          "modal-a",
          () => {
            closedLayer = "modal-a";
          },
        ],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "modal-a");
    assert.equal(closedLayer, "modal-a");
  });

  test("ESC skips closable layers without callbacks", () => {
    let closedLayer: string | null = null;
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["base", "middle", "top"],
      closeOnEscape: new Map([
        ["base", true],
        ["middle", true],
        ["top", true],
      ]),
      onClose: new Map([
        [
          "middle",
          () => {
            closedLayer = "middle";
          },
        ],
      ]),
    });

    assert.equal(result.consumed, true);
    assert.equal(result.closedLayerId, "middle");
    assert.equal(closedLayer, "middle");
  });

  test("ESC is not consumed when all layers are non-closable or missing callbacks", () => {
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE), {
      layerStack: ["a", "b", "c"],
      closeOnEscape: new Map([
        ["a", false],
        ["b", true],
        ["c", false],
      ]),
      onClose: new Map(),
    });

    assert.equal(result.consumed, false);
    assert.equal(result.closedLayerId, undefined);
  });

  test("ESC key up is ignored", () => {
    const result = routeLayerEscape(keyEvent(ZR_KEY_ESCAPE, "up"), {
      layerStack: ["modal"],
      closeOnEscape: new Map([["modal", true]]),
      onClose: new Map([
        [
          "modal",
          () => {
            throw new Error("should not run");
          },
        ],
      ]),
    });

    assert.equal(result.consumed, false);
  });

  test("close callback errors are swallowed and ESC remains consumed", () => {
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

  test("popLayer removes a middle layer deterministically", () => {
    let state = createLayerStackState();
    state = pushLayer(state, "a");
    state = pushLayer(state, "b");
    state = pushLayer(state, "c");

    const popped = popLayer(state, "b");
    assert.deepEqual(popped.state.stack, ["a", "c"]);
    assert.equal(getTopmostLayerId(popped.state), "c");
  });

  test("popLayer out of order returns removed callback", () => {
    let state = createLayerStackState();
    const onCloseA = () => {};
    const onCloseB = () => {};
    const onCloseC = () => {};
    state = pushLayer(state, "a", onCloseA);
    state = pushLayer(state, "b", onCloseB);
    state = pushLayer(state, "c", onCloseC);

    const popped = popLayer(state, "b");
    assert.equal(popped.onClose, onCloseB);
    assert.equal(popped.state.closeCallbacks.has("b"), false);
    assert.equal(popped.state.closeCallbacks.get("a"), onCloseA);
    assert.equal(popped.state.closeCallbacks.get("c"), onCloseC);
  });
});

describe("focus layers - dropdown keyboard routing", () => {
  const mixedItems: readonly DropdownItem[] = [
    { id: "divider", label: "", divider: true },
    { id: "disabled", label: "Disabled", disabled: true },
    { id: "new", label: "New" },
    { id: "open", label: "Open" },
  ];

  test("Enter from a non-selectable index activates the first selectable item", () => {
    let selected: string | null = null;
    const result = routeDropdownKey(keyEvent(ZR_KEY_ENTER), {
      dropdownId: "menu",
      items: mixedItems,
      selectedIndex: 0,
      onSelect: (item) => {
        selected = item.id;
      },
    });

    assert.equal(result.consumed, true);
    assert.equal(result.shouldClose, true);
    assert.equal(result.activatedItem?.id, "new");
    assert.equal(selected, "new");
  });

  test("Space from a non-selectable index activates the first selectable item", () => {
    let selected: string | null = null;
    const result = routeDropdownKey(keyEvent(ZR_KEY_SPACE), {
      dropdownId: "menu",
      items: mixedItems,
      selectedIndex: 0,
      onSelect: (item) => {
        selected = item.id;
      },
    });

    assert.equal(result.consumed, true);
    assert.equal(result.shouldClose, true);
    assert.equal(result.activatedItem?.id, "new");
    assert.equal(selected, "new");
  });

  test("ArrowDown navigates only selectable items and wraps", () => {
    const downFromFirst = routeDropdownKey(keyEvent(ZR_KEY_DOWN), {
      dropdownId: "menu",
      items: mixedItems,
      selectedIndex: 2,
    });
    assert.equal(downFromFirst.nextSelectedIndex, 3);

    const wrapFromLast = routeDropdownKey(keyEvent(ZR_KEY_DOWN), {
      dropdownId: "menu",
      items: mixedItems,
      selectedIndex: 3,
    });
    assert.equal(wrapFromLast.nextSelectedIndex, 2);
  });

  test("ArrowUp from first selectable wraps to last selectable", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_UP), {
      dropdownId: "menu",
      items: mixedItems,
      selectedIndex: 2,
    });

    assert.equal(result.consumed, true);
    assert.equal(result.nextSelectedIndex, 3);
  });

  test("Escape closes dropdown even when no selectable items exist", () => {
    let closed = false;
    const result = routeDropdownKey(keyEvent(ZR_KEY_ESCAPE), {
      dropdownId: "menu",
      items: [{ id: "divider", label: "", divider: true }],
      selectedIndex: 0,
      onClose: () => {
        closed = true;
      },
    });

    assert.equal(result.consumed, true);
    assert.equal(result.shouldClose, true);
    assert.equal(closed, true);
  });

  test("non-key and key-up events are ignored", () => {
    const textResult = routeDropdownKey(
      { kind: "text", codepoint: 65, timeMs: 0 },
      {
        dropdownId: "menu",
        items: mixedItems,
        selectedIndex: 2,
      },
    );
    const keyUpResult = routeDropdownKey(keyEvent(ZR_KEY_DOWN, "up"), {
      dropdownId: "menu",
      items: mixedItems,
      selectedIndex: 2,
    });

    assert.equal(textResult.consumed, false);
    assert.equal(keyUpResult.consumed, false);
  });
});
