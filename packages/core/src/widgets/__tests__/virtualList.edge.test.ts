import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_ENTER,
  ZR_KEY_PAGE_UP,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import type { VirtualListLocalState } from "../../runtime/localState.js";
import { routeVirtualListKey } from "../../runtime/router.js";
import type { VirtualListRoutingCtx } from "../../runtime/router/types.js";
import {
  clampScrollTop,
  computeVisibleRange,
  ensureVisible,
  getItemHeight,
  getItemOffset,
  getTotalHeight,
} from "../virtualList.js";

function keyEvent(key: number): ZrevEvent {
  return { kind: "key", action: "down", key, mods: 0, timeMs: 0 };
}

function ctxWith(
  overrides: Partial<VirtualListRoutingCtx<number>> & Partial<VirtualListLocalState> = {},
): VirtualListRoutingCtx<number> {
  const items = overrides.items ?? [0, 1, 2, 3, 4];
  const state: VirtualListLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    selectedIndex: overrides.selectedIndex ?? 0,
    viewportHeight: overrides.viewportHeight ?? 3,
    startIndex: overrides.startIndex ?? 0,
    endIndex: overrides.endIndex ?? 3,
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

describe("virtualList.edge - clamp and visibility boundaries", () => {
  const clampCases = [
    { name: "negative scroll", scrollTop: -10, total: 100, viewport: 20, expected: 0 },
    { name: "exact zero", scrollTop: 0, total: 100, viewport: 20, expected: 0 },
    { name: "middle", scrollTop: 30, total: 100, viewport: 20, expected: 30 },
    { name: "exact bottom", scrollTop: 80, total: 100, viewport: 20, expected: 80 },
    { name: "past bottom", scrollTop: 999, total: 100, viewport: 20, expected: 80 },
    { name: "viewport larger than total", scrollTop: 10, total: 5, viewport: 20, expected: 0 },
  ] as const;

  for (const c of clampCases) {
    test(`clampScrollTop ${c.name}`, () => {
      assert.equal(clampScrollTop(c.scrollTop, c.total, c.viewport), c.expected);
    });
  }

  const visibleCases = [
    {
      name: "empty list",
      items: [] as number[],
      scrollTop: 0,
      viewport: 4,
      overscan: 2,
      expected: [0, 0],
    },
    { name: "single item", items: [1], scrollTop: 0, viewport: 4, overscan: 2, expected: [0, 1] },
    {
      name: "exact bottom",
      items: [0, 1, 2, 3, 4],
      scrollTop: 2,
      viewport: 3,
      overscan: 0,
      expected: [2, 5],
    },
    {
      name: "past bottom clamps",
      items: [0, 1, 2, 3, 4],
      scrollTop: 50,
      viewport: 3,
      overscan: 0,
      expected: [2, 5],
    },
    {
      name: "past top clamps",
      items: [0, 1, 2, 3, 4],
      scrollTop: -50,
      viewport: 3,
      overscan: 0,
      expected: [0, 3],
    },
    {
      name: "negative overscan is clamped",
      items: [0, 1, 2, 3, 4, 5],
      scrollTop: 2,
      viewport: 2,
      overscan: -3,
      expected: [2, 4],
    },
    {
      name: "zero fixed itemHeight falls back safely",
      items: [0, 1, 2, 3],
      scrollTop: 2,
      viewport: 2,
      overscan: 1,
      expected: [1, 4],
    },
    {
      name: "negative viewport is clamped",
      items: [0, 1, 2, 3],
      scrollTop: 1,
      viewport: -2,
      overscan: 1,
      expected: [0, 2],
    },
  ] as const;

  for (const c of visibleCases) {
    test(`computeVisibleRange ${c.name}`, () => {
      const range = computeVisibleRange(c.items, 1, c.scrollTop, c.viewport, c.overscan);
      if (c.name === "zero fixed itemHeight falls back safely") {
        const fallback = computeVisibleRange(c.items, 0, c.scrollTop, c.viewport, c.overscan);
        assert.equal(fallback.startIndex, c.expected[0]);
        assert.equal(fallback.endIndex, c.expected[1]);
        return;
      }
      assert.equal(range.startIndex, c.expected[0]);
      assert.equal(range.endIndex, c.expected[1]);
    });
  }

  const ensureCases = [
    { name: "item above viewport", args: [10, 5, 4, 1] as const, expected: 4 },
    { name: "item below viewport", args: [0, 5, 8, 2] as const, expected: 5 },
    { name: "item already visible", args: [2, 5, 4, 1] as const, expected: 2 },
    { name: "item at top edge", args: [5, 4, 5, 1] as const, expected: 5 },
    { name: "item at bottom edge", args: [5, 4, 8, 1] as const, expected: 5 },
    { name: "zero-height item", args: [5, 4, 2, 0] as const, expected: 2 },
  ] as const;

  for (const c of ensureCases) {
    test(`ensureVisible ${c.name}`, () => {
      assert.equal(ensureVisible(c.args[0], c.args[1], c.args[2], c.args[3]), c.expected);
    });
  }
});

describe("virtualList.edge - helper math and dynamic data changes", () => {
  test("getItemOffset/getItemHeight/getTotalHeight handle invalid fixed height", () => {
    const items = [0, 1, 2];
    assert.equal(getItemOffset(items, 0, 2), 2);
    assert.equal(getItemHeight(items, 0, 1), 1);
    assert.equal(getTotalHeight(items, 0), 3);
  });

  test("routeVirtualListKey clamps stale selectedIndex on arrow keys after shrink", () => {
    const ctx = ctxWith({ items: [0, 1], selectedIndex: 9, viewportHeight: 1, scrollTop: 10 });
    const up = routeVirtualListKey(keyEvent(ZR_KEY_UP), ctx);
    assert.equal(up.nextSelectedIndex, 0);
    assert.equal(typeof up.nextScrollTop, "number");

    const down = routeVirtualListKey(keyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(down.nextSelectedIndex, undefined);
  });

  test("routeVirtualListKey clamps stale selectedIndex for action keys", () => {
    const ctx = ctxWith({ items: [10, 11], selectedIndex: 99 });
    const enter = routeVirtualListKey(keyEvent(ZR_KEY_ENTER), ctx);
    assert.deepEqual(enter.action, { id: "list", action: "select", index: 1 });
  });

  test("routeVirtualListKey page-up from stale selectedIndex clamps into range", () => {
    const ctx = ctxWith({
      items: [0, 1, 2],
      selectedIndex: 30,
      scrollTop: 20,
      viewportHeight: 2,
      itemHeight: 1,
    });
    const result = routeVirtualListKey(keyEvent(ZR_KEY_PAGE_UP), ctx);
    assert.equal(result.nextSelectedIndex, 0);
  });
});
