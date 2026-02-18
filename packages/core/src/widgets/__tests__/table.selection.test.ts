import { assert, describe, test } from "@rezi-ui/testkit";
import type { ZrevEvent } from "../../events.js";
import { ZR_KEY_SPACE, ZR_MOD_CTRL, ZR_MOD_SHIFT } from "../../keybindings/keyCodes.js";
import type { TableLocalState } from "../../runtime/localState.js";
import { routeTableKey } from "../../runtime/router.js";
import type { TableRoutingCtx } from "../../runtime/router/types.js";
import { buildRowKeyIndex, clearSelection, computeSelection, selectAll } from "../table.js";

const ALL = ["r1", "r2", "r3", "r4", "r5"] as const;
const ZR_KEY_A = 65;

function keyEvent(key: number, mods = 0): ZrevEvent {
  return { kind: "key", action: "down", key, mods, timeMs: 0 };
}

function tableCtx(
  overrides: Partial<TableRoutingCtx<number>> & Partial<TableLocalState> = {},
): TableRoutingCtx<number> {
  const rowKeys = overrides.rowKeys ?? [...ALL];
  const state: TableLocalState = {
    scrollTop: overrides.scrollTop ?? 0,
    focusedRowIndex: overrides.focusedRowIndex ?? 0,
    focusedColumnIndex: overrides.focusedColumnIndex ?? 0,
    lastClickedKey: overrides.lastClickedKey ?? null,
    viewportHeight: overrides.viewportHeight ?? 4,
    startIndex: overrides.startIndex ?? 0,
    endIndex: overrides.endIndex ?? 4,
  };
  return {
    tableId: overrides.tableId ?? "tbl",
    rowKeys,
    ...(overrides.rowKeyToIndex ? { rowKeyToIndex: overrides.rowKeyToIndex } : {}),
    data: overrides.data ?? rowKeys.map((_, i) => i),
    rowHeight: overrides.rowHeight ?? 1,
    state,
    selection: overrides.selection ?? [],
    selectionMode: overrides.selectionMode ?? "multi",
    keyboardNavigation: overrides.keyboardNavigation ?? true,
  };
}

describe("table.selection - row selection semantics", () => {
  test("single mode selects exactly one row", () => {
    const result = computeSelection(
      ["r1"],
      "r3",
      "single",
      { shift: false, ctrl: false },
      ALL,
      null,
    );
    assert.deepEqual(result.selection, ["r3"]);
    assert.equal(result.changed, true);
  });

  test("single mode no-op when already selected", () => {
    const result = computeSelection(
      ["r2"],
      "r2",
      "single",
      { shift: false, ctrl: false },
      ALL,
      null,
    );
    assert.equal(result.changed, false);
  });

  test("multi plain click replaces selection", () => {
    const result = computeSelection(
      ["r1", "r2"],
      "r4",
      "multi",
      { shift: false, ctrl: false },
      ALL,
      null,
    );
    assert.deepEqual(result.selection, ["r4"]);
  });

  test("multi ctrl-click toggles row on", () => {
    const result = computeSelection(["r1"], "r3", "multi", { shift: false, ctrl: true }, ALL, null);
    assert.deepEqual(result.selection, ["r1", "r3"]);
  });

  test("multi ctrl-click toggles row off", () => {
    const result = computeSelection(
      ["r1", "r3"],
      "r3",
      "multi",
      { shift: false, ctrl: true },
      ALL,
      null,
    );
    assert.deepEqual(result.selection, ["r1"]);
  });

  test("multi shift-click extends range forward", () => {
    const result = computeSelection(["r2"], "r5", "multi", { shift: true, ctrl: false }, ALL, "r2");
    assert.deepEqual(result.selection, ["r2", "r3", "r4", "r5"]);
  });

  test("multi shift-click extends range backward", () => {
    const result = computeSelection(["r4"], "r2", "multi", { shift: true, ctrl: false }, ALL, "r4");
    assert.deepEqual(result.selection, ["r4", "r2", "r3"]);
  });

  test("shift range uses rowKeyToIndex map", () => {
    const map = buildRowKeyIndex(ALL);
    const result = computeSelection(
      ["r1"],
      "r4",
      "multi",
      { shift: true, ctrl: false },
      ALL,
      "r1",
      map,
    );
    assert.deepEqual(result.selection, ["r1", "r2", "r3", "r4"]);
  });

  test("none mode always returns empty selection", () => {
    const result = computeSelection(["r1"], "r2", "none", { shift: false, ctrl: false }, ALL, null);
    assert.deepEqual(result.selection, []);
  });

  test("selectAll selects full dataset", () => {
    const result = selectAll(ALL, []);
    assert.deepEqual(result.selection, ALL);
    assert.equal(result.changed, true);
  });

  test("selectAll no-op when already fully selected", () => {
    const result = selectAll(ALL, ALL);
    assert.equal(result.changed, false);
  });

  test("clearSelection empties selection", () => {
    const result = clearSelection(["r1", "r2"]);
    assert.deepEqual(result.selection, []);
    assert.equal(result.changed, true);
  });

  test("Space toggles current row in multi mode", () => {
    const result = routeTableKey(
      keyEvent(ZR_KEY_SPACE),
      tableCtx({ focusedRowIndex: 2, selection: ["r1"], selectionMode: "multi" }),
    );
    assert.deepEqual(result.nextSelection, ["r1", "r3"]);
    assert.equal(result.nextLastClickedKey, "r3");
  });

  test("Shift+Space extends selection from last clicked", () => {
    const result = routeTableKey(
      keyEvent(ZR_KEY_SPACE, ZR_MOD_SHIFT),
      tableCtx({
        focusedRowIndex: 3,
        selection: ["r1"],
        lastClickedKey: "r1",
        rowKeyToIndex: buildRowKeyIndex(ALL),
      }),
    );
    assert.deepEqual(result.nextSelection, ["r1", "r2", "r3", "r4"]);
  });

  test("Ctrl+A selects all rows in multi mode", () => {
    const result = routeTableKey(keyEvent(ZR_KEY_A, ZR_MOD_CTRL), tableCtx({ selection: ["r2"] }));
    assert.deepEqual(result.nextSelection, ALL);
  });
});
