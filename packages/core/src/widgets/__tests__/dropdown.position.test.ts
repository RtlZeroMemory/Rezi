import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_ESCAPE,
  ZR_KEY_SPACE,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import { calculateAnchorPosition, createAnchorLookup } from "../../layout/positioning.js";
import { routeDropdownKey } from "../../runtime/router.js";
import type { DropdownItem } from "../types.js";

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

function item(id: string, label = id, overrides: Partial<DropdownItem> = {}): DropdownItem {
  return {
    id,
    label,
    ...overrides,
  };
}

describe("dropdown.position - keyboard routing", () => {
  test("ignores non-key events", () => {
    const result = routeDropdownKey(mouseEvent(), {
      dropdownId: "dd",
      items: [item("a")],
      selectedIndex: 0,
    });
    assert.equal(result.consumed, false);
  });

  test("ignores key-up events", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_DOWN, "up"), {
      dropdownId: "dd",
      items: [item("a")],
      selectedIndex: 0,
    });
    assert.equal(result.consumed, false);
  });

  test("no selectable items: non-escape does not consume", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_DOWN), {
      dropdownId: "dd",
      items: [item("d", "divider", { divider: true }), item("x", "disabled", { disabled: true })],
      selectedIndex: 0,
    });
    assert.equal(result.consumed, false);
  });

  test("no selectable items: escape closes and calls onClose", () => {
    let closed = false;
    const result = routeDropdownKey(keyEvent(ZR_KEY_ESCAPE), {
      dropdownId: "dd",
      items: [item("d", "divider", { divider: true })],
      selectedIndex: 0,
      onClose: () => {
        closed = true;
      },
    });
    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
    assert.equal(closed, true);
  });

  test("ArrowDown skips divider/disabled entries", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_DOWN), {
      dropdownId: "dd",
      items: [
        item("a"),
        item("div", "", { divider: true }),
        item("x", "X", { disabled: true }),
        item("b"),
      ],
      selectedIndex: 0,
    });
    assert.equal(result.nextSelectedIndex, 3);
    assert.equal(result.consumed, true);
  });

  test("ArrowUp wraps from first selectable to last selectable", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_UP), {
      dropdownId: "dd",
      items: [item("a"), item("b"), item("c")],
      selectedIndex: 0,
    });
    assert.equal(result.nextSelectedIndex, 2);
  });

  test("stale selectedIndex falls back to first selectable before navigation", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_DOWN), {
      dropdownId: "dd",
      items: [item("a"), item("b"), item("c")],
      selectedIndex: 99,
    });
    assert.equal(result.nextSelectedIndex, 1);
  });

  test("Enter activates selected item and requests close", () => {
    let selected: string | null = null;
    const result = routeDropdownKey(keyEvent(ZR_KEY_ENTER), {
      dropdownId: "dd",
      items: [item("a"), item("b")],
      selectedIndex: 1,
      onSelect: (i) => {
        selected = i.id;
      },
    });
    assert.equal(result.activatedItem?.id, "b");
    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
    assert.equal(selected, "b");
  });

  test("Space activates selected item and requests close", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_SPACE), {
      dropdownId: "dd",
      items: [item("a")],
      selectedIndex: 0,
    });
    assert.equal(result.activatedItem?.id, "a");
    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
  });

  test("Enter on disabled/divider index follows selectable fallback rules", () => {
    const disabledResult = routeDropdownKey(keyEvent(ZR_KEY_ENTER), {
      dropdownId: "dd",
      items: [item("a", "A", { disabled: true })],
      selectedIndex: 0,
    });
    assert.equal(disabledResult.consumed, false);
    assert.equal(disabledResult.activatedItem, undefined);
    assert.equal(disabledResult.shouldClose, undefined);

    const dividerResult = routeDropdownKey(keyEvent(ZR_KEY_ENTER), {
      dropdownId: "dd",
      items: [item("d", "", { divider: true }), item("a")],
      selectedIndex: 0,
    });
    assert.equal(dividerResult.consumed, true);
    assert.equal(dividerResult.activatedItem?.id, "a");
    assert.equal(dividerResult.shouldClose, true);
  });

  test("Escape always requests close", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_ESCAPE), {
      dropdownId: "dd",
      items: [item("a")],
      selectedIndex: 0,
    });
    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
  });

  test("selection callback errors are swallowed", () => {
    const result = routeDropdownKey(keyEvent(ZR_KEY_ENTER), {
      dropdownId: "dd",
      items: [item("a")],
      selectedIndex: 0,
      onSelect: () => {
        throw new Error("no-op");
      },
    });
    assert.equal(result.shouldClose, true);
    assert.equal(result.consumed, true);
  });

  test("duplicate item references navigate by index identity", () => {
    const shared = item("shared", "Shared");
    const items = [shared, item("mid", "Mid"), shared];

    const down = routeDropdownKey(keyEvent(ZR_KEY_DOWN), {
      dropdownId: "dd",
      items,
      selectedIndex: 2,
    });
    assert.equal(down.nextSelectedIndex, 0);

    const up = routeDropdownKey(keyEvent(ZR_KEY_UP), {
      dropdownId: "dd",
      items,
      selectedIndex: 2,
    });
    assert.equal(up.nextSelectedIndex, 1);
  });
});

describe("dropdown.position - anchor positioning and edge flipping", () => {
  test("below-start position uses anchor origin when space is available", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 5, w: 8, h: 2 },
      overlaySize: { w: 12, h: 4 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.deepEqual(result.rect, { x: 10, y: 7, w: 12, h: 4 });
    assert.equal(result.flippedHorizontal, false);
    assert.equal(result.flippedVertical, false);
  });

  test("flips vertically near viewport bottom", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 22, w: 8, h: 1 },
      overlaySize: { w: 12, h: 4 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
      flip: true,
    });

    assert.equal(result.position.startsWith("above"), true);
    assert.equal(result.flippedVertical, true);
    assert.equal(result.rect.y <= 18, true);
  });

  test("flips horizontally from start to end near right edge", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 75, y: 5, w: 4, h: 1 },
      overlaySize: { w: 12, h: 3 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
      flip: true,
    });

    assert.equal(result.position.endsWith("end"), true);
    assert.equal(result.flippedHorizontal, true);
  });

  test("flips horizontally from end to start near left edge", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 0, y: 5, w: 3, h: 1 },
      overlaySize: { w: 12, h: 3 },
      position: "below-end",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
      flip: true,
    });

    assert.equal(result.position.endsWith("start"), true);
    assert.equal(result.flippedHorizontal, true);
  });

  test("flip=false keeps requested side and clamps to viewport", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 78, y: 23, w: 2, h: 1 },
      overlaySize: { w: 10, h: 5 },
      position: "below-start",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
      flip: false,
    });

    assert.equal(result.flippedHorizontal, false);
    assert.equal(result.flippedVertical, false);
    assert.equal(result.rect.x + result.rect.w <= 80, true);
    assert.equal(result.rect.y + result.rect.h <= 24, true);
  });

  test("overlay larger than viewport is clamped deterministically", () => {
    const result = calculateAnchorPosition({
      anchor: { x: 10, y: 10, w: 5, h: 1 },
      overlaySize: { w: 200, h: 100 },
      position: "below-center",
      viewport: { x: 0, y: 0, width: 80, height: 24 },
    });

    assert.deepEqual(result.rect, { x: 0, y: 0, w: 80, h: 24 });
  });

  test("createAnchorLookup returns anchor rects and null for missing ids", () => {
    const lookup = createAnchorLookup(
      new Map([
        ["a", { x: 1, y: 2, w: 3, h: 4 }],
        ["b", { x: 10, y: 20, w: 5, h: 6 }],
      ]),
    );

    assert.deepEqual(lookup("a"), { x: 1, y: 2, w: 3, h: 4 });
    assert.deepEqual(lookup("b"), { x: 10, y: 20, w: 5, h: 6 });
    assert.equal(lookup("missing"), null);
  });
});
