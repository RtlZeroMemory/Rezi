import { assert, describe, test } from "@rezi-ui/testkit";
import type { TableProps } from "../../widgets/types.js";
import { type TableRenderCache, rebuildRenderCaches } from "../widgetRenderer/renderCaches.js";

function createTableProps(
  data: readonly unknown[],
  getRowKey: (row: unknown, index: number) => string,
  selection: readonly string[] = [],
): TableProps<unknown> {
  return {
    id: "t",
    columns: [{ key: "id", header: "ID", flex: 1 }],
    data,
    getRowKey,
    selection,
  };
}

function rebuildTableCaches(
  tableById: ReadonlyMap<string, TableProps<unknown>>,
  tableRenderCacheById: Map<string, TableRenderCache>,
): void {
  rebuildRenderCaches({
    tableById,
    logsConsoleById: new Map(),
    diffViewerById: new Map(),
    codeEditorById: new Map(),
    tableRenderCacheById,
    logsConsoleRenderCacheById: new Map(),
    diffRenderCacheById: new Map(),
    codeEditorRenderCacheById: new Map(),
    emptyStringArray: Object.freeze([]),
  });
}

describe("table render cache contracts", () => {
  test("reuses rowKeys and rowKeyToIndex when data/getRowKey refs are stable", () => {
    const data = Object.freeze([{ id: "a" }, { id: "b" }, { id: "c" }]);
    let getRowKeyCalls = 0;
    const getRowKey = (row: unknown): string => {
      getRowKeyCalls++;
      return (row as { id: string }).id;
    };

    const tableById = new Map<string, TableProps<unknown>>([
      ["t", createTableProps(data, getRowKey)],
    ]);
    const cacheById = new Map<string, TableRenderCache>();

    rebuildTableCaches(tableById, cacheById);
    const first = cacheById.get("t");
    assert.ok(first !== undefined);
    assert.equal(getRowKeyCalls, 3);

    rebuildTableCaches(tableById, cacheById);
    const second = cacheById.get("t");
    assert.ok(second !== undefined);

    assert.equal(getRowKeyCalls, 3);
    assert.equal(second.rowKeys, first.rowKeys);
    assert.equal(second.rowKeyToIndex, first.rowKeyToIndex);
  });

  test("rebuilds row key caches when data reference changes", () => {
    const dataA = Object.freeze([{ id: "a" }, { id: "b" }, { id: "c" }]);
    const dataB = Object.freeze([{ id: "a" }, { id: "b" }, { id: "c" }]);
    let getRowKeyCalls = 0;
    const getRowKey = (row: unknown): string => {
      getRowKeyCalls++;
      return (row as { id: string }).id;
    };

    const tableById = new Map<string, TableProps<unknown>>([
      ["t", createTableProps(dataA, getRowKey)],
    ]);
    const cacheById = new Map<string, TableRenderCache>();

    rebuildTableCaches(tableById, cacheById);
    const first = cacheById.get("t");
    assert.ok(first !== undefined);
    assert.equal(getRowKeyCalls, 3);

    tableById.set("t", createTableProps(dataB, getRowKey));
    rebuildTableCaches(tableById, cacheById);
    const second = cacheById.get("t");
    assert.ok(second !== undefined);

    assert.equal(getRowKeyCalls, 6);
    assert.notEqual(second.rowKeys, first.rowKeys);
    assert.notEqual(second.rowKeyToIndex, first.rowKeyToIndex);
    assert.deepEqual([...second.rowKeys], ["a", "b", "c"]);
    assert.equal(second.rowKeyToIndex.get("a"), 0);
    assert.equal(second.rowKeyToIndex.get("b"), 1);
    assert.equal(second.rowKeyToIndex.get("c"), 2);
  });

  test("row key/index caches follow reordered data deterministically", () => {
    const a = Object.freeze({ id: "a" });
    const b = Object.freeze({ id: "b" });
    const c = Object.freeze({ id: "c" });

    const getRowKey = (row: unknown): string => (row as { id: string }).id;
    const tableById = new Map<string, TableProps<unknown>>([
      ["t", createTableProps(Object.freeze([a, b, c]), getRowKey)],
    ]);
    const cacheById = new Map<string, TableRenderCache>();

    rebuildTableCaches(tableById, cacheById);

    tableById.set("t", createTableProps(Object.freeze([c, a, b]), getRowKey));
    rebuildTableCaches(tableById, cacheById);
    const reordered = cacheById.get("t");
    assert.ok(reordered !== undefined);

    assert.deepEqual([...reordered.rowKeys], ["c", "a", "b"]);
    assert.equal(reordered.rowKeyToIndex.get("c"), 0);
    assert.equal(reordered.rowKeyToIndex.get("a"), 1);
    assert.equal(reordered.rowKeyToIndex.get("b"), 2);
  });

  test("selectionSet fast-path is keyed by selection reference", () => {
    const data = Object.freeze([{ id: "a" }, { id: "b" }]);
    const getRowKey = (row: unknown): string => (row as { id: string }).id;
    const stableSelection = Object.freeze(["a"]);
    const tableById = new Map<string, TableProps<unknown>>([
      ["t", createTableProps(data, getRowKey, stableSelection)],
    ]);
    const cacheById = new Map<string, TableRenderCache>();

    rebuildTableCaches(tableById, cacheById);
    const first = cacheById.get("t");
    assert.ok(first !== undefined);

    rebuildTableCaches(tableById, cacheById);
    const second = cacheById.get("t");
    assert.ok(second !== undefined);
    assert.equal(second.selectionSet, first.selectionSet);

    tableById.set("t", createTableProps(data, getRowKey, Object.freeze(["a"])));
    rebuildTableCaches(tableById, cacheById);
    const third = cacheById.get("t");
    assert.ok(third !== undefined);
    assert.notEqual(third.selectionSet, second.selectionSet);
  });
});
