import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_HOME,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import type { TableLocalState } from "../../runtime/localState.js";
import { routeTableKey } from "../../runtime/router.js";
import type { TableRoutingCtx } from "../../runtime/router/types.js";

function event(key: number): ZrevEvent {
  return { kind: "key", key, action: "down", mods: 0, timeMs: 0 };
}

function ctx(
  overrides: Partial<TableRoutingCtx<number>> & Partial<TableLocalState> = {},
): TableRoutingCtx<number> {
  const rowKeys = overrides.rowKeys ?? Array.from({ length: 10_000 }, (_, i) => `r${i}`);
  const state: TableLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    focusedRowIndex: overrides.focusedRowIndex ?? 0,
    focusedColumnIndex: overrides.focusedColumnIndex ?? 0,
    lastClickedKey: overrides.lastClickedKey ?? null,
    viewportHeight: overrides.viewportHeight ?? 20,
    startIndex: overrides.startIndex ?? 0,
    endIndex: overrides.endIndex ?? 20,
  };
  return {
    tableId: "tbl",
    rowKeys,
    ...(overrides.rowKeyToIndex ? { rowKeyToIndex: overrides.rowKeyToIndex } : {}),
    data: overrides.data ?? rowKeys.map((_, i) => i),
    rowHeight: overrides.rowHeight ?? 1,
    state,
    selection: overrides.selection ?? [],
    selectionMode: overrides.selectionMode ?? "single",
    keyboardNavigation: overrides.keyboardNavigation ?? true,
  };
}

describe("table.virtualization - scroll/focus invariants", () => {
  test("ArrowDown advances focus in a large table", () => {
    const result = routeTableKey(event(ZR_KEY_DOWN), ctx({ focusedRowIndex: 40 }));
    assert.equal(result.nextFocusedRowIndex, 41);
  });

  test("ArrowUp clamps at row 0", () => {
    const result = routeTableKey(event(ZR_KEY_UP), ctx({ focusedRowIndex: 0 }));
    assert.equal(result.nextFocusedRowIndex, undefined);
    assert.equal(result.consumed, true);
  });

  test("PageDown uses viewport-derived page size", () => {
    const result = routeTableKey(
      event(ZR_KEY_PAGE_DOWN),
      ctx({ focusedRowIndex: 0, viewportHeight: 25 }),
    );
    assert.equal(result.nextFocusedRowIndex, 25);
  });

  test("PageUp clamps at top", () => {
    const result = routeTableKey(
      event(ZR_KEY_PAGE_UP),
      ctx({ focusedRowIndex: 5, viewportHeight: 25 }),
    );
    assert.equal(result.nextFocusedRowIndex, 0);
  });

  test("Home jumps to first row and resets scrollTop", () => {
    const result = routeTableKey(event(ZR_KEY_HOME), ctx({ focusedRowIndex: 500, scrollTop: 300 }));
    assert.equal(result.nextFocusedRowIndex, 0);
    assert.equal(result.nextScrollTop, 0);
  });

  test("End jumps to last row", () => {
    const result = routeTableKey(event(ZR_KEY_END), ctx({ focusedRowIndex: 0 }));
    assert.equal(result.nextFocusedRowIndex, 9_999);
  });

  test("scrollTop is clamped before navigation when viewport changes", () => {
    const result = routeTableKey(
      event(ZR_KEY_DOWN),
      ctx({ focusedRowIndex: 50, scrollTop: 9_999, viewportHeight: 300 }),
    );
    assert.equal(result.nextFocusedRowIndex, 51);
    assert.ok((result.nextScrollTop ?? 0) <= 9_700);
  });

  test("stale focusedRowIndex is clamped after data shrink", () => {
    const result = routeTableKey(
      event(ZR_KEY_DOWN),
      ctx({ rowKeys: ["a", "b"], focusedRowIndex: 99, viewportHeight: 1 }),
    );
    assert.equal(result.nextFocusedRowIndex, 1);
  });

  test("Enter action emits clamped row index after data shrink", () => {
    const result = routeTableKey(
      event(ZR_KEY_ENTER),
      ctx({ rowKeys: ["a", "b"], focusedRowIndex: 99 }),
    );
    assert.deepEqual(result.action, { id: "tbl", action: "rowPress", rowIndex: 1 });
  });

  test("selection state is preserved during navigation", () => {
    const result = routeTableKey(
      event(ZR_KEY_DOWN),
      ctx({ focusedRowIndex: 8, selection: ["r8"] }),
    );
    assert.equal(result.nextSelection, undefined);
    assert.equal(result.nextFocusedRowIndex, 9);
  });
});
