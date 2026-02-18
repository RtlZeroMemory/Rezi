import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_HOME,
  ZR_KEY_UP,
} from "../../keybindings/keyCodes.js";
import type { TableLocalState } from "../../runtime/localState.js";
import { routeTableKey } from "../../runtime/router.js";
import type { TableRoutingCtx } from "../../runtime/router/types.js";
import { getRowIndex, getRowKeyAtIndex } from "../table.js";

function key(keyCode: number): ZrevEvent {
  return { kind: "key", key: keyCode, action: "down", mods: 0, timeMs: 0 };
}

function context(
  overrides: Partial<TableRoutingCtx<number>> & Partial<TableLocalState> = {},
): TableRoutingCtx<number> {
  const rowKeys = overrides.rowKeys ?? ["r1"];
  const state: TableLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    focusedRowIndex: overrides.focusedRowIndex ?? 0,
    focusedColumnIndex: overrides.focusedColumnIndex ?? 0,
    lastClickedKey: overrides.lastClickedKey ?? null,
    viewportHeight: overrides.viewportHeight ?? 1,
    startIndex: overrides.startIndex ?? 0,
    endIndex: overrides.endIndex ?? 1,
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

describe("table.edge - empty/small/extreme cases", () => {
  test("empty table does not consume movement keys", () => {
    const result = routeTableKey(key(ZR_KEY_DOWN), context({ rowKeys: [] }));
    assert.equal(result.consumed, false);
  });

  test("single-row table clamps ArrowUp", () => {
    const result = routeTableKey(key(ZR_KEY_UP), context({ rowKeys: ["r1"], focusedRowIndex: 0 }));
    assert.equal(result.nextFocusedRowIndex, undefined);
    assert.equal(result.consumed, true);
  });

  test("single-row table clamps ArrowDown", () => {
    const result = routeTableKey(
      key(ZR_KEY_DOWN),
      context({ rowKeys: ["r1"], focusedRowIndex: 0 }),
    );
    assert.equal(result.nextFocusedRowIndex, undefined);
    assert.equal(result.consumed, true);
  });

  test("single-row table Home no-op stays consumed", () => {
    const result = routeTableKey(
      key(ZR_KEY_HOME),
      context({ rowKeys: ["r1"], focusedRowIndex: 0 }),
    );
    assert.equal(result.consumed, true);
  });

  test("single-row table End no-op stays consumed", () => {
    const result = routeTableKey(key(ZR_KEY_END), context({ rowKeys: ["r1"], focusedRowIndex: 0 }));
    assert.equal(result.consumed, true);
  });

  test("single-row table Enter activates index 0", () => {
    const result = routeTableKey(
      key(ZR_KEY_ENTER),
      context({ rowKeys: ["r1"], focusedRowIndex: 0 }),
    );
    assert.deepEqual(result.action, { id: "tbl", action: "rowPress", rowIndex: 0 });
  });

  test("non-positive rowHeight still produces deterministic movement", () => {
    const result = routeTableKey(
      key(ZR_KEY_DOWN),
      context({ rowKeys: ["a", "b", "c"], rowHeight: 0 }),
    );
    assert.equal(result.nextFocusedRowIndex, 1);
  });

  test("getRowIndex handles missing key", () => {
    assert.equal(getRowIndex(["a", "b"], "missing"), -1);
  });

  test("getRowKeyAtIndex handles out of range indices", () => {
    assert.equal(getRowKeyAtIndex(["a", "b"], -1), undefined);
    assert.equal(getRowKeyAtIndex(["a", "b"], 2), undefined);
  });

  test("keyboardNavigation=false returns consumed=false", () => {
    const result = routeTableKey(key(ZR_KEY_DOWN), context({ keyboardNavigation: false }));
    assert.equal(result.consumed, false);
  });
});
