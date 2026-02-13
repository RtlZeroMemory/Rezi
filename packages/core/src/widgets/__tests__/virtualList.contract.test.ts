/**
 * packages/core/src/widgets/__tests__/virtualList.contract.test.ts
 *
 * Deterministic contract tests for virtual list range/window and navigation behavior.
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_END, ZR_KEY_PAGE_DOWN, ZR_KEY_PAGE_UP } from "../../keybindings/keyCodes.js";
import type { VirtualListLocalState } from "../../runtime/localState.js";
import { type VirtualListRoutingCtx, routeVirtualListKey } from "../../runtime/router.js";
import { computeVisibleRange } from "../virtualList.js";

function createKeyEvent(key: number, action: "down" | "up" = "down"): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action };
}

function createTestCtx(
  overrides: Partial<VirtualListRoutingCtx<number>> & Partial<VirtualListLocalState> = {},
): VirtualListRoutingCtx<number> {
  const items = overrides.items ?? Array.from({ length: 100 }, (_, i) => i);
  const state: VirtualListLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    selectedIndex: overrides.selectedIndex ?? 0,
    viewportHeight: overrides.viewportHeight ?? 10,
    startIndex: overrides.startIndex ?? 0,
    endIndex: overrides.endIndex ?? 0,
  };

  return {
    virtualListId: overrides.virtualListId ?? "list",
    items,
    itemHeight: overrides.itemHeight ?? 1,
    state,
    keyboardNavigation: overrides.keyboardNavigation ?? true,
    wrapAround: overrides.wrapAround ?? false,
  };
}

describe("virtualList contracts - visible range/window", () => {
  test("fixed-height window tracks scrollTop changes with overscan", () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const expected = [
      { scrollTop: 0, startIndex: 0, endIndex: 7 },
      { scrollTop: 1, startIndex: 0, endIndex: 8 },
      { scrollTop: 2, startIndex: 0, endIndex: 9 },
      { scrollTop: 5, startIndex: 3, endIndex: 12 },
      { scrollTop: 14, startIndex: 12, endIndex: 20 },
      { scrollTop: 15, startIndex: 13, endIndex: 20 },
    ] as const;

    for (const contract of expected) {
      const result = computeVisibleRange(items, 1, contract.scrollTop, 5, 2);
      assert.equal(result.startIndex, contract.startIndex);
      assert.equal(result.endIndex, contract.endIndex);
    }
  });

  test("overscan expands both ends when viewport is away from list bounds", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const base = computeVisibleRange(items, 1, 6, 5, 0);
    const withOverscan = computeVisibleRange(items, 1, 6, 5, 2);

    assert.equal(base.startIndex, 6);
    assert.equal(base.endIndex, 11);
    assert.equal(withOverscan.startIndex, 4);
    assert.equal(withOverscan.endIndex, 13);
  });

  test("variable-height window remains deterministic across scrollTop changes", () => {
    const items = [2, 1, 3, 1, 2];
    const itemHeight = (item: number) => item;

    const atTop = computeVisibleRange(items, itemHeight, 0, 3, 1);
    const middle = computeVisibleRange(items, itemHeight, 2, 3, 1);
    const atEnd = computeVisibleRange(items, itemHeight, 6, 3, 1);

    assert.equal(atTop.startIndex, 0);
    assert.equal(atTop.endIndex, 3);
    assert.equal(middle.startIndex, 0);
    assert.equal(middle.endIndex, 4);
    assert.equal(atEnd.startIndex, 2);
    assert.equal(atEnd.endIndex, 5);
  });
});

describe("virtualList contracts - computeVisibleRange clamps scrollTop", () => {
  test("negative scrollTop is clamped to zero", () => {
    const fixedItems = Array.from({ length: 10 }, (_, i) => i);
    const fixedAtZero = computeVisibleRange(fixedItems, 2, 0, 4, 1);
    const fixedNegative = computeVisibleRange(fixedItems, 2, -100, 4, 1);

    assert.equal(fixedNegative.startIndex, fixedAtZero.startIndex);
    assert.equal(fixedNegative.endIndex, fixedAtZero.endIndex);

    const variableItems = Array.from({ length: 10 }, (_, i) => i);
    const variableHeight = () => 1;
    const variableAtZero = computeVisibleRange(variableItems, variableHeight, 0, 4, 1);
    const variableNegative = computeVisibleRange(variableItems, variableHeight, -100, 4, 1);

    assert.equal(variableNegative.startIndex, variableAtZero.startIndex);
    assert.equal(variableNegative.endIndex, variableAtZero.endIndex);
  });

  test("scrollTop beyond max is clamped to end of content", () => {
    const fixedItems = Array.from({ length: 10 }, (_, i) => i);
    const fixedAtEnd = computeVisibleRange(fixedItems, 2, 16, 4, 1);
    const fixedTooHigh = computeVisibleRange(fixedItems, 2, 1000, 4, 1);

    assert.equal(fixedTooHigh.startIndex, fixedAtEnd.startIndex);
    assert.equal(fixedTooHigh.endIndex, fixedAtEnd.endIndex);
    assert.ok(fixedTooHigh.startIndex <= fixedTooHigh.endIndex);

    const variableItems = Array.from({ length: 10 }, (_, i) => i);
    const variableHeight = () => 1;
    const variableAtEnd = computeVisibleRange(variableItems, variableHeight, 6, 4, 1);
    const variableTooHigh = computeVisibleRange(variableItems, variableHeight, 1000, 4, 1);

    assert.equal(variableTooHigh.startIndex, variableAtEnd.startIndex);
    assert.equal(variableTooHigh.endIndex, variableAtEnd.endIndex);
  });
});

describe("virtualList contracts - keyboard navigation", () => {
  test("page down uses visible span when it is available", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const ctx = createTestCtx({
      items,
      itemHeight: () => 2,
      selectedIndex: 3,
      viewportHeight: 9,
      startIndex: 10,
      endIndex: 14,
    });

    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_PAGE_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, 7);
  });

  test("page-size fallback is used when visible range span is zero", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const downCtx = createTestCtx({
      items,
      itemHeight: () => 2,
      selectedIndex: 3,
      scrollTop: 0,
      viewportHeight: 9,
      startIndex: 8,
      endIndex: 8,
    });

    const down = routeVirtualListKey(createKeyEvent(ZR_KEY_PAGE_DOWN), downCtx);
    assert.equal(down.nextSelectedIndex, 7);
    assert.equal(down.nextScrollTop, 7);

    const upCtx = createTestCtx({
      items,
      itemHeight: () => 2,
      selectedIndex: 7,
      scrollTop: 7,
      viewportHeight: 9,
      startIndex: 8,
      endIndex: 8,
    });

    const up = routeVirtualListKey(createKeyEvent(ZR_KEY_PAGE_UP), upCtx);
    assert.equal(up.nextSelectedIndex, 3);
  });

  test("end key jumps to last item and scrolls to max", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const ctx = createTestCtx({
      items,
      itemHeight: 2,
      selectedIndex: 0,
      viewportHeight: 5,
    });

    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_END), ctx);
    assert.equal(result.nextSelectedIndex, 9);
    assert.equal(result.nextScrollTop, 15);
  });
});
