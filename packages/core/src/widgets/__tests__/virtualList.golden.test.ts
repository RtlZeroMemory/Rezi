/**
 * packages/core/src/widgets/__tests__/virtualList.golden.test.ts
 *
 * Tests for the virtualList widget algorithms: visible range computation,
 * keyboard navigation, and scroll-into-view behavior.
 *
 * @see docs/widgets/virtual-list.md
 */

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
import {
  type VirtualListRoutingCtx,
  type VirtualListWheelCtx,
  routeVirtualListKey,
  routeVirtualListWheel,
} from "../../runtime/router.js";
import {
  clampScrollTop,
  computeVisibleRange,
  ensureVisible,
  getItemHeight,
  getItemOffset,
  getTotalHeight,
} from "../virtualList.js";

/* ========== Helper Functions ========== */

function nowMs(): number {
  const perf = (globalThis as { performance?: { now: () => number } }).performance;
  return perf ? perf.now() : Date.now();
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (sorted.length % 2 === 0 && left !== undefined && right !== undefined) {
    return (left + right) / 2;
  }
  return right ?? 0;
}

function measureMedianMs(run: () => void, warmupRuns = 2, measuredRuns = 5): number {
  for (let i = 0; i < warmupRuns; i++) {
    run();
  }
  const samples: number[] = [];
  for (let i = 0; i < measuredRuns; i++) {
    const start = nowMs();
    run();
    samples.push(nowMs() - start);
  }
  return median(samples);
}

function createKeyEvent(key: number, action: "down" | "up" = "down"): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods: 0, action };
}

function createWheelEvent(wheelY: number): ZrevEvent {
  return {
    kind: "mouse",
    timeMs: 0,
    x: 0,
    y: 0,
    mouseKind: 5, // scroll
    mods: 0,
    buttons: 0,
    wheelX: 0,
    wheelY,
  };
}

function createTestCtx(
  overrides: Partial<VirtualListRoutingCtx<number>> & Partial<VirtualListLocalState> = {},
): VirtualListRoutingCtx<number> {
  const items = overrides.items ?? Array.from({ length: 1000 }, (_, i) => i);
  const state: VirtualListLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    selectedIndex: overrides.selectedIndex ?? 0,
    viewportHeight: overrides.viewportHeight ?? 10,
    startIndex: 0,
    endIndex: 0,
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

/* ========== Key Code Constants ========== */
/* ========== computeVisibleRange Tests ========== */

describe("virtualList - computeVisibleRange", () => {
  test("initial render with overscan: 1000 items, viewport 10, overscan 3", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const result = computeVisibleRange(items, 1, 0, 10, 3);

    // At scrollTop=0 with viewport=10, visible range is 0-9
    // With overscan=3, we extend: startIndex=max(0,0-3)=0, endIndex=min(1000,10+3)=13
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 13);
    assert.equal(result.itemOffsets.length, 1001);
  });

  test("scroll down: scrollTop=50, viewport 10, overscan 3", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const result = computeVisibleRange(items, 1, 50, 10, 3);

    // At scrollTop=50, first visible item is 50, last is 59
    // With overscan=3: startIndex=47, endIndex=63
    assert.equal(result.startIndex, 47);
    assert.equal(result.endIndex, 63);
  });

  test("variable height items", () => {
    const items = [{ h: 1 }, { h: 2 }, { h: 1 }, { h: 3 }, { h: 1 }];
    const heightFn = (it: { h: number }) => it.h;
    const result = computeVisibleRange(items, heightFn, 0, 5, 1);

    // Offsets: [0, 1, 3, 4, 7, 8]
    // Item 0: y=0, h=1
    // Item 1: y=1, h=2
    // Item 2: y=3, h=1
    // Item 3: y=4, h=3
    // Item 4: y=7, h=1
    assert.deepEqual([...result.itemOffsets], [0, 1, 3, 4, 7, 8]);
  });

  test("empty items list", () => {
    const result = computeVisibleRange([], 1, 0, 10, 3);
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 0);
    assert.deepEqual([...result.itemOffsets], [0]);
  });

  test("viewport larger than content", () => {
    const items = Array.from({ length: 5 }, (_, i) => i);
    const result = computeVisibleRange(items, 1, 0, 100, 3);

    // All items visible, overscan clamped
    assert.equal(result.startIndex, 0);
    assert.equal(result.endIndex, 5);
  });

  test("scroll at end of list", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const result = computeVisibleRange(items, 1, 90, 10, 3);

    // At scrollTop=90, visible 90-99
    // With overscan: startIndex=87, endIndex=100 (clamped)
    assert.equal(result.startIndex, 87);
    assert.equal(result.endIndex, 100);
  });
});

/* ========== getItemOffset Tests ========== */

describe("virtualList - getItemOffset", () => {
  test("fixed height offset calculation", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    assert.equal(getItemOffset(items, 5, 0), 0);
    assert.equal(getItemOffset(items, 5, 3), 15);
    assert.equal(getItemOffset(items, 5, 9), 45);
  });

  test("variable height offset calculation", () => {
    const items = [10, 20, 30, 40];
    const heightFn = (item: number) => item;
    assert.equal(getItemOffset(items, heightFn, 0), 0);
    assert.equal(getItemOffset(items, heightFn, 1), 10);
    assert.equal(getItemOffset(items, heightFn, 2), 30);
    assert.equal(getItemOffset(items, heightFn, 3), 60);
  });

  test("out of bounds returns 0", () => {
    const items = [1, 2, 3];
    assert.equal(getItemOffset(items, 1, -1), 0);
    assert.equal(getItemOffset(items, 1, 5), 0);
  });
});

/* ========== getItemHeight Tests ========== */

describe("virtualList - getItemHeight", () => {
  test("fixed height", () => {
    const items = [1, 2, 3];
    assert.equal(getItemHeight(items, 5, 0), 5);
    assert.equal(getItemHeight(items, 5, 2), 5);
  });

  test("variable height", () => {
    const items = [10, 20, 30];
    const heightFn = (item: number) => item;
    assert.equal(getItemHeight(items, heightFn, 0), 10);
    assert.equal(getItemHeight(items, heightFn, 1), 20);
    assert.equal(getItemHeight(items, heightFn, 2), 30);
  });

  test("out of bounds returns 0", () => {
    const items = [1, 2, 3];
    assert.equal(getItemHeight(items, 5, -1), 0);
    assert.equal(getItemHeight(items, 5, 10), 0);
  });
});

/* ========== getTotalHeight Tests ========== */

describe("virtualList - getTotalHeight", () => {
  test("fixed height total", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    assert.equal(getTotalHeight(items, 3), 300);
  });

  test("variable height total", () => {
    const items = [1, 2, 3, 4, 5];
    const heightFn = (item: number) => item;
    assert.equal(getTotalHeight(items, heightFn), 15);
  });

  test("empty list returns 0", () => {
    assert.equal(getTotalHeight([], 5), 0);
  });
});

/* ========== ensureVisible Tests ========== */

describe("virtualList - ensureVisible", () => {
  test("item above viewport scrolls up", () => {
    // Viewport at 50-60, item at 30-31 should scroll to 30
    const result = ensureVisible(50, 10, 30, 1);
    assert.equal(result, 30);
  });

  test("item below viewport scrolls down", () => {
    // Viewport at 0-10, item at 15-16 should scroll to 6 (16-10)
    const result = ensureVisible(0, 10, 15, 1);
    assert.equal(result, 6);
  });

  test("item visible returns unchanged scrollTop", () => {
    // Viewport at 10-20, item at 15-16 is visible
    const result = ensureVisible(10, 10, 15, 1);
    assert.equal(result, 10);
  });

  test("item at top edge is visible", () => {
    // Viewport at 10-20, item at 10-11 is visible
    const result = ensureVisible(10, 10, 10, 1);
    assert.equal(result, 10);
  });

  test("item at bottom edge is visible", () => {
    // Viewport at 10-20, item at 19-20 is visible (bottom = 20 = scrollTop + viewport)
    const result = ensureVisible(10, 10, 19, 1);
    assert.equal(result, 10);
  });
});

/* ========== clampScrollTop Tests ========== */

describe("virtualList - clampScrollTop", () => {
  test("clamps negative scrollTop to 0", () => {
    assert.equal(clampScrollTop(-10, 100, 10), 0);
  });

  test("clamps excessive scrollTop to max", () => {
    // totalHeight=100, viewport=10, max scroll=90
    assert.equal(clampScrollTop(95, 100, 10), 90);
  });

  test("returns valid scrollTop unchanged", () => {
    assert.equal(clampScrollTop(50, 100, 10), 50);
  });

  test("handles viewport >= totalHeight", () => {
    // When viewport >= content, max scroll is 0
    assert.equal(clampScrollTop(10, 50, 100), 0);
  });
});

/* ========== Keyboard Navigation Tests ========== */

describe("virtualList - keyboard navigation", () => {
  test("arrow down moves selection", () => {
    const ctx = createTestCtx({ selectedIndex: 5 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, 6);
  });

  test("arrow up moves selection", () => {
    const ctx = createTestCtx({ selectedIndex: 5 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_UP), ctx);
    assert.equal(result.nextSelectedIndex, 4);
  });

  test("arrow up at index 0 without wrap stays at 0", () => {
    const ctx = createTestCtx({ selectedIndex: 0, wrapAround: false });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_UP), ctx);
    // No change when at start without wrap
    assert.equal(result.nextSelectedIndex, undefined);
  });

  test("arrow up at index 0 with wrap goes to last", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const ctx = createTestCtx({ items, selectedIndex: 0, wrapAround: true });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_UP), ctx);
    assert.equal(result.nextSelectedIndex, 9);
  });

  test("arrow down at last index without wrap stays at last", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const ctx = createTestCtx({ items, selectedIndex: 9, wrapAround: false });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, undefined);
  });

  test("arrow down at last index with wrap goes to first", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const ctx = createTestCtx({ items, selectedIndex: 9, wrapAround: true });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, 0);
  });

  test("page down moves by page", () => {
    const ctx = createTestCtx({ selectedIndex: 0, viewportHeight: 10 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_PAGE_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, 10);
  });

  test("page up moves by page", () => {
    const ctx = createTestCtx({ selectedIndex: 50, viewportHeight: 10 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_PAGE_UP), ctx);
    assert.equal(result.nextSelectedIndex, 40);
  });

  test("home jumps to first item", () => {
    const ctx = createTestCtx({ selectedIndex: 500 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_HOME), ctx);
    assert.equal(result.nextSelectedIndex, 0);
    assert.equal(result.nextScrollTop, 0);
  });

  test("end jumps to last item", () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const ctx = createTestCtx({ items, selectedIndex: 0 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_END), ctx);
    assert.equal(result.nextSelectedIndex, 99);
  });

  test("enter emits select action", () => {
    const ctx = createTestCtx({ selectedIndex: 42 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_ENTER), ctx);
    assert.deepEqual(result.action, { id: "list", action: "select", index: 42 });
  });

  test("space emits select action", () => {
    const ctx = createTestCtx({ selectedIndex: 7 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_SPACE), ctx);
    assert.deepEqual(result.action, { id: "list", action: "select", index: 7 });
  });

  test("keyboard navigation disabled returns empty", () => {
    const ctx = createTestCtx({ keyboardNavigation: false });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, undefined);
    assert.equal(result.action, undefined);
  });
});

/* ========== Scroll Into View Tests ========== */

describe("virtualList - scroll into view on navigation", () => {
  test("arrow down at viewport edge scrolls", () => {
    // Selected at 9, viewport shows 0-9, moving to 10 should scroll
    const ctx = createTestCtx({ selectedIndex: 9, scrollTop: 0, viewportHeight: 10 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, 10);
    assert.equal(result.nextScrollTop, 1);
  });

  test("arrow up at viewport top scrolls", () => {
    // Selected at 50, viewport shows 50-59, moving to 49 should scroll
    const ctx = createTestCtx({ selectedIndex: 50, scrollTop: 50, viewportHeight: 10 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_UP), ctx);
    assert.equal(result.nextSelectedIndex, 49);
    assert.equal(result.nextScrollTop, 49);
  });

  test("no scroll when item already visible", () => {
    // Selected at 5, viewport shows 0-9, moving to 6 doesn't need scroll
    const ctx = createTestCtx({ selectedIndex: 5, scrollTop: 0, viewportHeight: 10 });
    const result = routeVirtualListKey(createKeyEvent(ZR_KEY_DOWN), ctx);
    assert.equal(result.nextSelectedIndex, 6);
    assert.equal(result.nextScrollTop, undefined);
  });
});

/* ========== Mouse Wheel Tests ========== */

describe("virtualList - mouse wheel", () => {
  test("wheel down scrolls content", () => {
    const ctx: VirtualListWheelCtx = { scrollTop: 0, totalHeight: 100, viewportHeight: 10 };
    const result = routeVirtualListWheel(createWheelEvent(1), ctx);
    // wheelY=1 * 3 lines = scroll down 3
    assert.equal(result.nextScrollTop, 3);
  });

  test("wheel up scrolls content", () => {
    const ctx: VirtualListWheelCtx = { scrollTop: 50, totalHeight: 100, viewportHeight: 10 };
    const result = routeVirtualListWheel(createWheelEvent(-1), ctx);
    // wheelY=-1 * 3 lines = scroll up 3
    assert.equal(result.nextScrollTop, 47);
  });

  test("wheel clamps to bounds", () => {
    const ctx: VirtualListWheelCtx = { scrollTop: 0, totalHeight: 100, viewportHeight: 10 };
    const result = routeVirtualListWheel(createWheelEvent(-5), ctx);
    // Can't scroll above 0
    assert.equal(result.nextScrollTop, undefined); // No change when already at 0
  });

  test("wheel at max doesn't overflow", () => {
    const ctx: VirtualListWheelCtx = { scrollTop: 90, totalHeight: 100, viewportHeight: 10 };
    const result = routeVirtualListWheel(createWheelEvent(5), ctx);
    // Max scroll is 90, already there
    assert.equal(result.nextScrollTop, undefined);
  });
});

/* ========== Performance Tests ========== */

describe("virtualList - performance", () => {
  const env = process.env as NodeJS.ProcessEnv & { CI?: string };
  const IS_CI = env.CI === "true";
  const IS_WINDOWS = process.platform === "win32";
  const FIXED_HEIGHT_BUDGET_MS = IS_WINDOWS ? (IS_CI ? 7 : 6) : 5;
  const VARIABLE_HEIGHT_BUDGET_MS = IS_WINDOWS ? (IS_CI ? 90 : 70) : 50;

  test("100k items renders under fixed-height budget", () => {
    const items = Array.from({ length: 100000 }, (_, i) => i);
    const elapsed = measureMedianMs(() => {
      computeVisibleRange(items, 1, 50000, 25, 3);
    });
    assert.ok(
      elapsed < FIXED_HEIGHT_BUDGET_MS,
      `Expected fixed-height median <${FIXED_HEIGHT_BUDGET_MS}ms, got ${elapsed}ms`,
    );
  });

  test("variable height 10k items performance", () => {
    const items = Array.from({ length: 10000 }, (_, i) => ({ h: (i % 5) + 1 }));
    const heightFn = (it: { h: number }) => it.h;
    const elapsed = measureMedianMs(() => {
      computeVisibleRange(items, heightFn, 5000, 50, 5);
    });
    // Variable height has O(n) offset building, should still be fast
    assert.ok(
      elapsed < VARIABLE_HEIGHT_BUDGET_MS,
      `Expected variable-height median <${VARIABLE_HEIGHT_BUDGET_MS}ms, got ${elapsed}ms`,
    );
  });
});
