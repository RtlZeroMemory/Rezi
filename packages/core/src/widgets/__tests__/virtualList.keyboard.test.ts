import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_HOME,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_SPACE,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import type { VirtualListLocalState } from "../../runtime/localState.js";
import { routeVirtualListKey } from "../../runtime/router.js";
import type { VirtualListRoutingCtx } from "../../runtime/router/types.js";

function createKeyEvent(key: number, action: "down" | "up" = "down"): ZrevEvent {
  return { kind: "key", key, action, mods: 0, timeMs: 0 };
}

function createMouseEvent(): ZrevEvent {
  return {
    kind: "mouse",
    x: 0,
    y: 0,
    mouseKind: 1,
    mods: 0,
    buttons: 0,
    wheelX: 0,
    wheelY: 0,
    timeMs: 0,
  };
}

function ctx(
  overrides: Partial<VirtualListRoutingCtx<number>> & Partial<VirtualListLocalState> = {},
): VirtualListRoutingCtx<number> {
  const items = overrides.items ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const state: VirtualListLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    selectedIndex: overrides.selectedIndex ?? 0,
    viewportHeight: overrides.viewportHeight ?? 4,
    startIndex: overrides.startIndex ?? 0,
    endIndex: overrides.endIndex ?? 4,
  };
  return {
    virtualListId: "list",
    items,
    itemHeight: overrides.itemHeight ?? 1,
    state,
    keyboardNavigation: overrides.keyboardNavigation ?? true,
    wrapAround: overrides.wrapAround ?? false,
  };
}

describe("virtualList.keyboard - boundary routing", () => {
  test("ArrowUp clamps at start without wrap", () => {
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_UP), ctx({ selectedIndex: 0 }));
    assert.equal(result.nextSelectedIndex, undefined);
  });

  test("ArrowUp wraps to end with wrapAround", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_UP),
      ctx({ selectedIndex: 0, wrapAround: true }),
    );
    assert.equal(result.nextSelectedIndex, 9);
  });

  test("ArrowDown clamps at end without wrap", () => {
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx({ selectedIndex: 9 }));
    assert.equal(result.nextSelectedIndex, undefined);
  });

  test("ArrowDown wraps to start with wrapAround", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_DOWN),
      ctx({ selectedIndex: 9, wrapAround: true }),
    );
    assert.equal(result.nextSelectedIndex, 0);
  });

  test("PageUp clamps to row 0", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_PAGE_UP),
      ctx({ selectedIndex: 1, viewportHeight: 4 }),
    );
    assert.equal(result.nextSelectedIndex, 0);
  });

  test("PageDown clamps to last row", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_PAGE_DOWN),
      ctx({ selectedIndex: 8, viewportHeight: 4 }),
    );
    assert.equal(result.nextSelectedIndex, 9);
  });

  test("Home moves to first row and resets scroll", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_HOME),
      ctx({ selectedIndex: 4, scrollTop: 20 }),
    );
    assert.equal(result.nextSelectedIndex, 0);
    assert.equal(result.nextScrollTop, 0);
  });

  test("End moves to last row and sets max scroll", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_END),
      ctx({ selectedIndex: 0, viewportHeight: 3, itemHeight: 2 }),
    );
    assert.equal(result.nextSelectedIndex, 9);
    assert.equal(result.nextScrollTop, 17);
  });

  test("Enter emits select action for clamped selected index", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_ENTER),
      ctx({ selectedIndex: 99, items: [1, 2] }),
    );
    assert.deepEqual(result.action, { id: "list", action: "select", index: 1 });
  });

  test("Space emits select action", () => {
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_SPACE), ctx({ selectedIndex: 3 }));
    assert.deepEqual(result.action, { id: "list", action: "select", index: 3 });
  });

  test("non-down key action is ignored", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_DOWN, "up"),
      ctx({ selectedIndex: 2 }),
    );
    assert.deepEqual(result, {});
  });

  test("non-key event is ignored", () => {
    const result = routeVirtualListKey(createMouseEvent(), ctx({ selectedIndex: 2 }));
    assert.deepEqual(result, {});
  });

  test("keyboardNavigation=false ignores keys", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_DOWN),
      ctx({ keyboardNavigation: false }),
    );
    assert.deepEqual(result, {});
  });

  test("PageDown uses visible span for variable-height lists", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_PAGE_DOWN),
      ctx({
        itemHeight: (x: number) => x + 1,
        selectedIndex: 1,
        startIndex: 2,
        endIndex: 6,
        items: [0, 1, 2, 3, 4, 5, 6],
      }),
    );
    assert.equal(result.nextSelectedIndex, 5);
  });

  test("PageDown with zero fixed row height still advances safely", () => {
    const result = routeVirtualListKey(
      createKeyEvent(ZR_KEY_PAGE_DOWN),
      ctx({ itemHeight: 0, viewportHeight: 4, selectedIndex: 0 }),
    );
    assert.equal(result.nextSelectedIndex, 4);
  });
});
