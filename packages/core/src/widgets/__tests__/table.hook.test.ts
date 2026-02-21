import { assert, describe, test } from "@rezi-ui/testkit";
import {
  createHookContext,
  createCompositeInstanceRegistry,
  runPendingEffects,
} from "../../runtime/instances.js";
import { createWidgetContext } from "../composition.js";
import type { TableColumn } from "../types.js";
import { useTable, type UseTableOptions } from "../useTable.js";

type Row = Readonly<{
  id: string;
  name: string;
  size: number;
}>;

const BASE_COLUMNS: readonly TableColumn<Row>[] = Object.freeze([
  { key: "name", header: "Name", flex: 1 },
  { key: "size", header: "Size", width: 8 },
]);

function createUseTableHarness() {
  const registry = createCompositeInstanceRegistry();
  const instanceId = 1;
  registry.create(instanceId, "UseTableHarness");

  return {
    render(options: UseTableOptions<Row>) {
      registry.beginRender(instanceId);
      const state = registry.get(instanceId);
      if (!state) throw new Error("test harness: missing instance state");

      const onInvalidate = () => {
        registry.invalidate(instanceId);
      };
      const hookCtx = createHookContext(state, onInvalidate);
      const ctx = createWidgetContext(
        "UseTableHarness",
        0,
        hookCtx,
        undefined,
        {
          width: 80,
          height: 24,
          breakpoint: "md",
        },
        onInvalidate,
      );

      const table = useTable(ctx, options);
      const pending = registry.endRender(instanceId);
      runPendingEffects(pending);
      return table;
    },
  };
}

describe("useTable", () => {
  test("returns pre-wired table props and managed state", () => {
    const h = createUseTableHarness();
    const rows: readonly Row[] = [
      { id: "b", name: "Beta", size: 20 },
      { id: "a", name: "Alpha", size: 10 },
    ];
    const options: UseTableOptions<Row> = {
      id: "files",
      rows,
      columns: BASE_COLUMNS,
      selectable: "multi",
      sortable: true,
    };

    let table = h.render(options);
    assert.equal(table.props.id, "files");
    assert.deepEqual(table.selection, []);
    assert.equal(table.sortColumn, undefined);

    table.props.onSelectionChange?.(["a"]);
    table.props.onSort?.("name", "asc");

    table = h.render(options);
    assert.deepEqual(table.selection, ["a"]);
    assert.equal(table.sortColumn, "name");
    assert.equal(table.sortDirection, "asc");
    assert.deepEqual(
      table.props.data.map((row) => row.id),
      ["a", "b"],
    );
  });

  test("sortable:true defaults columns to sortable when omitted", () => {
    const h = createUseTableHarness();
    const table = h.render({
      id: "files",
      rows: [{ id: "a", name: "Alpha", size: 1 }],
      columns: BASE_COLUMNS,
      sortable: true,
    });

    assert.equal(table.props.columns[0]?.sortable, true);
    assert.equal(table.props.columns[1]?.sortable, true);
  });

  test("clearSelection helper resets managed selection", () => {
    const h = createUseTableHarness();
    const options: UseTableOptions<Row> = {
      id: "files",
      rows: [{ id: "a", name: "Alpha", size: 1 }],
      columns: BASE_COLUMNS,
      selectable: "multi",
    };

    let table = h.render(options);
    table.props.onSelectionChange?.(["a"]);
    table = h.render(options);
    assert.deepEqual(table.selection, ["a"]);

    table.clearSelection();
    table = h.render(options);
    assert.deepEqual(table.selection, []);
  });

  test("selection is pruned when rows disappear", () => {
    const h = createUseTableHarness();
    const optionsA: UseTableOptions<Row> = {
      id: "files",
      rows: [
        { id: "a", name: "Alpha", size: 1 },
        { id: "b", name: "Beta", size: 2 },
      ],
      columns: BASE_COLUMNS,
      selectable: "multi",
    };
    const optionsB: UseTableOptions<Row> = {
      ...optionsA,
      rows: [{ id: "a", name: "Alpha", size: 1 }],
    };

    let table = h.render(optionsA);
    table.props.onSelectionChange?.(["a", "b"]);
    table = h.render(optionsA);
    assert.deepEqual(table.selection, ["a", "b"]);

    h.render(optionsB); // render where pruning effect runs
    table = h.render(optionsB);
    assert.deepEqual(table.selection, ["a"]);
  });
});
