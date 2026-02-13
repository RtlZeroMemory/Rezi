/**
 * packages/core/src/widgets/__tests__/table.golden.test.ts
 *
 * Tests for the table widget algorithms: column width distribution,
 * selection handling, sort state, and keyboard navigation.
 *
 * @see docs/widgets/table.md
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
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import type { TableLocalState } from "../../runtime/localState.js";
import { type TableRoutingCtx, routeTableKey } from "../../runtime/router.js";
import {
  SORT_INDICATOR_ASC,
  SORT_INDICATOR_DESC,
  type TableColumn,
  alignCellText,
  buildRowKeyIndex,
  clearSelection,
  computeSelection,
  distributeColumnWidths,
  extractRowKeys,
  getRowIndex,
  getRowKeyAtIndex,
  getSortIndicator,
  selectAll,
  toggleSort,
} from "../table.js";

/* ========== Helper Functions ========== */

function createKeyEvent(key: number, action: "down" | "up" = "down", mods = 0): ZrevEvent {
  return { kind: "key", timeMs: 0, key, mods, action };
}

function createTableCtx<T>(
  overrides: Partial<TableRoutingCtx<T>> & Partial<TableLocalState> = {},
): TableRoutingCtx<T> {
  const rowKeys = overrides.rowKeys ?? ["r1", "r2", "r3", "r4", "r5"];
  const data = (overrides.data ?? [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]) as T[];

  const state: TableLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    focusedRowIndex: overrides.focusedRowIndex ?? 0,
    focusedColumnIndex: overrides.focusedColumnIndex ?? 0,
    lastClickedKey: overrides.lastClickedKey ?? null,
    viewportHeight: overrides.viewportHeight ?? 10,
    startIndex: 0,
    endIndex: 0,
  };

  return {
    tableId: overrides.tableId ?? "test-table",
    rowKeys,
    ...(overrides.rowKeyToIndex ? { rowKeyToIndex: overrides.rowKeyToIndex } : {}),
    data,
    rowHeight: overrides.rowHeight ?? 1,
    state,
    selection: overrides.selection ?? [],
    selectionMode: overrides.selectionMode ?? "none",
    keyboardNavigation: overrides.keyboardNavigation ?? true,
  };
}

/* ========== Column Width Distribution Tests ========== */

describe("table - distributeColumnWidths", () => {
  test("flex distribution: flex:1, flex:2, width:10, total 100", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 1 },
      { key: "b", header: "B", flex: 2 },
      { key: "c", header: "C", width: 10 },
    ];

    const result = distributeColumnWidths(columns, 100);

    // 100 - 10 (fixed) = 90 for flex
    // flex:1 gets 90/3 = 30
    // flex:2 gets 90*2/3 = 60
    assert.equal(result.widths[0], 30);
    assert.equal(result.widths[1], 60);
    assert.equal(result.widths[2], 10);
    assert.equal(result.totalWidth, 100);
  });

  test("all fixed widths", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", width: 20 },
      { key: "b", header: "B", width: 30 },
      { key: "c", header: "C", width: 50 },
    ];

    const result = distributeColumnWidths(columns, 200);

    assert.equal(result.widths[0], 20);
    assert.equal(result.widths[1], 30);
    assert.equal(result.widths[2], 50);
    assert.equal(result.totalWidth, 100);
  });

  test("minWidth constraint", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 1, minWidth: 40 },
      { key: "b", header: "B", flex: 1 },
    ];

    // With 50 total, each would get 25, but minWidth forces a to 40
    const result = distributeColumnWidths(columns, 50);

    assert.ok(result.widths[0] !== undefined && result.widths[0] >= 40);
  });

  test("maxWidth constraint", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 1, maxWidth: 20 },
      { key: "b", header: "B", flex: 1 },
    ];

    const result = distributeColumnWidths(columns, 100);

    assert.ok(result.widths[0] !== undefined && result.widths[0] <= 20);
  });

  test("empty columns array", () => {
    const result = distributeColumnWidths([], 100);

    assert.deepEqual([...result.widths], []);
    assert.equal(result.totalWidth, 0);
  });

  test("default flex is 1", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
    ];

    const result = distributeColumnWidths(columns, 100);

    // Both should get equal width
    assert.equal(result.widths[0], 50);
    assert.equal(result.widths[1], 50);
  });

  test("fractional flex widths are deterministic across runs", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 1 },
      { key: "b", header: "B", flex: 1 },
      { key: "c", header: "C", flex: 1 },
    ];

    const first = distributeColumnWidths(columns, 10);
    const second = distributeColumnWidths(columns, 10);

    assert.deepEqual([...first.widths], [3, 3, 3]);
    assert.deepEqual([...second.widths], [3, 3, 3]);
    assert.equal(first.totalWidth, 9);
    assert.equal(second.totalWidth, 9);
  });

  test("mixed fixed/flex/min/max distribution is deterministic", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 3, minWidth: 10 },
      { key: "b", header: "B", flex: 1, maxWidth: 5 },
      { key: "c", header: "C", width: 7 },
    ];

    const first = distributeColumnWidths(columns, 31);
    const second = distributeColumnWidths(columns, 31);

    assert.deepEqual([...first.widths], [18, 5, 7]);
    assert.deepEqual([...second.widths], [18, 5, 7]);
    assert.equal(first.totalWidth, 30);
    assert.equal(second.totalWidth, 30);
  });
});

/* ========== Selection Tests ========== */

describe("table - selection", () => {
  const allKeys = ["r1", "r2", "r3", "r4", "r5"];

  test("single mode: click selects only that row", () => {
    const result = computeSelection(
      [],
      "r2",
      "single",
      { shift: false, ctrl: false },
      allKeys,
      null,
    );

    assert.deepEqual([...result.selection], ["r2"]);
    assert.equal(result.changed, true);
  });

  test("single mode: click different row replaces selection", () => {
    const result = computeSelection(
      ["r1"],
      "r3",
      "single",
      { shift: false, ctrl: false },
      allKeys,
      null,
    );

    assert.deepEqual([...result.selection], ["r3"]);
    assert.equal(result.changed, true);
  });

  test("multi mode: plain click selects only that row", () => {
    const result = computeSelection(
      ["r1", "r2"],
      "r4",
      "multi",
      { shift: false, ctrl: false },
      allKeys,
      null,
    );

    assert.deepEqual([...result.selection], ["r4"]);
    assert.equal(result.changed, true);
  });

  test("multi mode: ctrl+click toggles selection", () => {
    const result = computeSelection(
      ["r1", "r3"],
      "r2",
      "multi",
      { shift: false, ctrl: true },
      allKeys,
      null,
    );

    // r2 should be added
    assert.ok(result.selection.includes("r2"));
    assert.equal(result.changed, true);
  });

  test("multi mode: ctrl+click on selected deselects", () => {
    const result = computeSelection(
      ["r1", "r2", "r3"],
      "r2",
      "multi",
      { shift: false, ctrl: true },
      allKeys,
      null,
    );

    // r2 should be removed
    assert.ok(!result.selection.includes("r2"));
    assert.equal(result.changed, true);
  });

  test("multi mode: shift+click selects range", () => {
    const result = computeSelection(
      ["r2"],
      "r5",
      "multi",
      { shift: true, ctrl: false },
      allKeys,
      "r2",
    );

    // Should select r2, r3, r4, r5
    assert.ok(result.selection.includes("r2"));
    assert.ok(result.selection.includes("r3"));
    assert.ok(result.selection.includes("r4"));
    assert.ok(result.selection.includes("r5"));
    assert.equal(result.changed, true);
  });

  test("shift+click uses rowKeyToIndex fast-path (including index 0)", () => {
    const keys = ["r1", "r2", "r3", "r4"];
    Object.defineProperty(keys, "indexOf", {
      value: () => {
        throw new Error("indexOf fallback should not be used when map lookup succeeds");
      },
    });
    const index = buildRowKeyIndex(keys);

    const result = computeSelection(
      ["r1"],
      "r3",
      "multi",
      { shift: true, ctrl: false },
      keys,
      "r1",
      index,
    );

    assert.deepEqual([...result.selection], ["r1", "r2", "r3"]);
    assert.equal(result.changed, true);
  });

  test("none mode: always returns empty selection", () => {
    const result = computeSelection(
      ["r1"],
      "r2",
      "none",
      { shift: false, ctrl: false },
      allKeys,
      null,
    );

    assert.deepEqual([...result.selection], []);
    assert.equal(result.changed, false);
  });

  test("selectAll selects all rows", () => {
    const result = selectAll(allKeys, []);

    assert.deepEqual([...result.selection], allKeys);
    assert.equal(result.changed, true);
  });

  test("selectAll returns unchanged when all already selected", () => {
    const result = selectAll(allKeys, allKeys);

    assert.deepEqual([...result.selection], allKeys);
    assert.equal(result.changed, false);
  });

  test("selectAll handles large datasets efficiently", () => {
    // Generate large dataset to verify O(n) performance (not O(n²))
    const largeKeys = Array.from({ length: 10000 }, (_, i) => `r${i}`);
    const result = selectAll(largeKeys, largeKeys);

    assert.equal(result.changed, false);
    assert.equal(result.selection.length, 10000);
  });

  test("clearSelection clears all", () => {
    const result = clearSelection(["r1", "r2"]);

    assert.deepEqual([...result.selection], []);
    assert.equal(result.changed, true);
  });
});

/* ========== Sort Tests ========== */

describe("table - sort", () => {
  test("clicking unsorted column starts ascending", () => {
    const result = toggleSort(undefined, undefined, "name");

    assert.equal(result.column, "name");
    assert.equal(result.direction, "asc");
  });

  test("clicking ascending column switches to descending", () => {
    const result = toggleSort("name", "asc", "name");

    assert.equal(result.column, "name");
    assert.equal(result.direction, "desc");
  });

  test("clicking descending column switches to ascending", () => {
    const result = toggleSort("name", "desc", "name");

    assert.equal(result.column, "name");
    assert.equal(result.direction, "asc");
  });

  test("clicking different column starts ascending", () => {
    const result = toggleSort("name", "desc", "size");

    assert.equal(result.column, "size");
    assert.equal(result.direction, "asc");
  });

  test("getSortIndicator returns correct indicator", () => {
    assert.equal(getSortIndicator("name", "name", "asc"), SORT_INDICATOR_ASC);
    assert.equal(getSortIndicator("name", "name", "desc"), SORT_INDICATOR_DESC);
    assert.equal(getSortIndicator("name", "size", "asc"), "");
    assert.equal(getSortIndicator("name", undefined, undefined), "");
  });
});

/* ========== Cell Alignment Tests ========== */

describe("table - alignCellText", () => {
  test("left alignment", () => {
    const result = alignCellText("abc", 10, "left");
    assert.equal(result, "abc       ");
    assert.equal(result.length, 10);
  });

  test("right alignment", () => {
    const result = alignCellText("abc", 10, "right");
    assert.equal(result, "       abc");
    assert.equal(result.length, 10);
  });

  test("center alignment", () => {
    const result = alignCellText("abc", 10, "center");
    assert.equal(result, "   abc    ");
    assert.equal(result.length, 10);
  });

  test("truncates when text too long", () => {
    const result = alignCellText("abcdefghij", 5, "left");
    assert.equal(result, "abcde");
    assert.equal(result.length, 5);
  });
});

/* ========== Row Key Extraction Tests ========== */

describe("table - extractRowKeys", () => {
  test("extracts keys from data", () => {
    const data = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const keys = extractRowKeys(data, (row) => row.id);

    assert.deepEqual([...keys], ["a", "b", "c"]);
  });

  test("uses index for empty data", () => {
    const data: Array<{ id: string } | undefined> = [{ id: "a" }, undefined, { id: "c" }];
    const keys = extractRowKeys(data, (row, i) => row?.id ?? `empty_${i}`);

    assert.equal(keys.length, 3);
  });

  test("stable row keys follow row identity after reorder", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }] as const;
    const reordered = [rows[2], rows[0], rows[1]];

    const first = extractRowKeys(rows, (row) => row.id);
    const second = extractRowKeys(reordered, (row) => row.id);

    assert.deepEqual([...first], ["a", "b", "c"]);
    assert.deepEqual([...second], ["c", "a", "b"]);
  });
});

/* ========== Row Navigation Helpers ========== */

describe("table - row navigation helpers", () => {
  const keys = ["a", "b", "c", "d", "e"];

  test("getRowIndex finds correct index", () => {
    assert.equal(getRowIndex(keys, "c"), 2);
    assert.equal(getRowIndex(keys, "notfound"), -1);
  });

  test("getRowKeyAtIndex returns correct key", () => {
    assert.equal(getRowKeyAtIndex(keys, 2), "c");
    assert.equal(getRowKeyAtIndex(keys, -1), undefined);
    assert.equal(getRowKeyAtIndex(keys, 10), undefined);
  });
});

/* ========== Keyboard Navigation Tests ========== */

describe("table - keyboard navigation", () => {
  test("arrow down moves focus", () => {
    const ctx = createTableCtx({ focusedRowIndex: 2 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_DOWN), ctx);

    assert.equal(result.nextFocusedRowIndex, 3);
    assert.equal(result.consumed, true);
  });

  test("arrow up moves focus", () => {
    const ctx = createTableCtx({ focusedRowIndex: 2 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_UP), ctx);

    assert.equal(result.nextFocusedRowIndex, 1);
    assert.equal(result.consumed, true);
  });

  test("arrow up at index 0 stays at 0", () => {
    const ctx = createTableCtx({ focusedRowIndex: 0 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_UP), ctx);

    // No change when at start
    assert.equal(result.nextFocusedRowIndex, undefined);
    assert.equal(result.consumed, true);
  });

  test("arrow down at last index stays at last", () => {
    const ctx = createTableCtx({ focusedRowIndex: 4 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_DOWN), ctx);

    // No change when at end
    assert.equal(result.nextFocusedRowIndex, undefined);
    assert.equal(result.consumed, true);
  });

  test("home jumps to first row", () => {
    const ctx = createTableCtx({ focusedRowIndex: 3 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_HOME), ctx);

    assert.equal(result.nextFocusedRowIndex, 0);
    assert.equal(result.nextScrollTop, 0);
    assert.equal(result.consumed, true);
  });

  test("end jumps to last row", () => {
    const ctx = createTableCtx({ focusedRowIndex: 0 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_END), ctx);

    assert.equal(result.nextFocusedRowIndex, 4);
    assert.equal(result.consumed, true);
  });

  test("enter emits rowPress action", () => {
    const ctx = createTableCtx({ focusedRowIndex: 2 });
    const result = routeTableKey(createKeyEvent(ZR_KEY_ENTER), ctx);

    assert.deepEqual(result.action, {
      id: "test-table",
      action: "rowPress",
      rowIndex: 2,
    });
    assert.equal(result.consumed, true);
  });

  test("space toggles selection in multi mode", () => {
    const ctx = createTableCtx({
      focusedRowIndex: 1,
      selection: [],
      selectionMode: "multi",
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_SPACE), ctx);

    assert.ok(result.nextSelection !== undefined);
    assert.ok(result.nextSelection.includes("r2"));
    assert.equal(result.consumed, true);
  });

  test("navigation keys do not mutate selection in multi mode", () => {
    const ctx = createTableCtx({
      focusedRowIndex: 2,
      selection: ["r1", "r3"],
      selectionMode: "multi",
      viewportHeight: 3,
      rowHeight: 1,
      rowKeys: ["r1", "r2", "r3", "r4", "r5", "r6"],
    });

    for (const key of [
      ZR_KEY_UP,
      ZR_KEY_DOWN,
      ZR_KEY_PAGE_UP,
      ZR_KEY_PAGE_DOWN,
      ZR_KEY_HOME,
      ZR_KEY_END,
    ]) {
      const result = routeTableKey(createKeyEvent(key), ctx);
      assert.equal(result.nextSelection, undefined);
      assert.equal(result.consumed, true);
    }
  });

  test("shift+space selection uses rowKeyToIndex fast-path", () => {
    const rowKeys = ["r1", "r2", "r3", "r4"];
    Object.defineProperty(rowKeys, "indexOf", {
      value: () => {
        throw new Error("indexOf fallback should not be used when map lookup succeeds");
      },
    });

    const ctx = createTableCtx({
      rowKeys,
      focusedRowIndex: 2,
      lastClickedKey: "r1",
      selection: ["r1"],
      selectionMode: "multi",
      rowKeyToIndex: buildRowKeyIndex(rowKeys),
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_SPACE, "down", ZR_MOD_SHIFT), ctx);

    assert.deepEqual(result.nextSelection, ["r1", "r2", "r3"]);
    assert.equal(result.nextLastClickedKey, "r3");
    assert.equal(result.consumed, true);
  });

  test("page down moves by page", () => {
    const ctx = createTableCtx({
      focusedRowIndex: 0,
      viewportHeight: 3,
      rowHeight: 1,
      rowKeys: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"],
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_PAGE_DOWN), ctx);

    assert.equal(result.nextFocusedRowIndex, 3);
    assert.equal(result.consumed, true);
  });

  test("page up moves by page", () => {
    const ctx = createTableCtx({
      focusedRowIndex: 5,
      viewportHeight: 3,
      rowHeight: 1,
      rowKeys: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"],
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_PAGE_UP), ctx);

    assert.equal(result.nextFocusedRowIndex, 2);
    assert.equal(result.consumed, true);
  });

  test("keyboard navigation disabled returns consumed: false", () => {
    const ctx = createTableCtx({ keyboardNavigation: false });
    const result = routeTableKey(createKeyEvent(ZR_KEY_DOWN), ctx);

    assert.equal(result.consumed, false);
  });
});

/* ========== Scroll Into View Tests ========== */

describe("table - scroll into view on navigation", () => {
  test("arrow down at viewport edge scrolls", () => {
    // Focused at row 9, viewport shows rows 0-9, moving to 10 should scroll
    const ctx = createTableCtx({
      focusedRowIndex: 9,
      scrollTop: 0,
      viewportHeight: 10,
      rowHeight: 1,
      rowKeys: Array.from({ length: 20 }, (_, i) => `r${i}`),
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_DOWN), ctx);

    assert.equal(result.nextFocusedRowIndex, 10);
    assert.ok(result.nextScrollTop !== undefined && result.nextScrollTop > 0);
  });

  test("arrow up at viewport top scrolls", () => {
    // Focused at row 5, viewport shows rows 5-14, moving to 4 should scroll
    const ctx = createTableCtx({
      focusedRowIndex: 5,
      scrollTop: 5,
      viewportHeight: 10,
      rowHeight: 1,
      rowKeys: Array.from({ length: 20 }, (_, i) => `r${i}`),
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_UP), ctx);

    assert.equal(result.nextFocusedRowIndex, 4);
    assert.equal(result.nextScrollTop, 4);
  });

  test("stale scrollTop is clamped when viewport grows (resize contract)", () => {
    const ctx = createTableCtx({
      focusedRowIndex: 90,
      scrollTop: 50,
      viewportHeight: 80,
      rowHeight: 1,
      rowKeys: Array.from({ length: 100 }, (_, i) => `r${i}`),
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_DOWN), ctx);

    assert.equal(result.nextFocusedRowIndex, 91);
    assert.equal(result.nextScrollTop, 20);
  });

  test("non-positive rowHeight uses safe keyboard page size", () => {
    const ctx = createTableCtx({
      focusedRowIndex: 0,
      scrollTop: 0,
      viewportHeight: 4,
      rowHeight: 0,
      rowKeys: ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"],
    });
    const result = routeTableKey(createKeyEvent(ZR_KEY_PAGE_DOWN), ctx);

    assert.equal(result.nextFocusedRowIndex, 4);
    assert.equal(result.nextScrollTop, 1);
  });
});
