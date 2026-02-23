import { assert, describe, test } from "@rezi-ui/testkit";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = coerceToLegacyTheme(darkTheme);

type Row = Readonly<{ id: string; name: string }>;

const columns = [{ key: "name", header: "Name", sortable: true }] as const;
const data: readonly Row[] = [
  { id: "r0", name: "Alpha" },
  { id: "r1", name: "Beta" },
];

function rgbEquals(
  actual: unknown,
  expected: Readonly<{ r: number; g: number; b: number }> | undefined,
): boolean {
  if (!expected || typeof actual !== "object" || actual === null) return false;
  const a = actual as { r?: unknown; g?: unknown; b?: unknown };
  return a.r === expected.r && a.g === expected.g && a.b === expected.b;
}

function firstDrawText(
  ops: readonly DrawOp[],
  match: (text: string) => boolean,
): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && match(op.text));
}

describe("table recipe rendering", () => {
  test("uses table recipe colors for header, selected rows, and stripes", () => {
    const ops = renderOps(
      ui.table<Row>({
        id: "tbl",
        columns,
        data,
        getRowKey: (row) => row.id,
        selection: ["r0"],
        selectionMode: "single",
        stripedRows: true,
        border: "none",
      }),
      { viewport: { cols: 40, rows: 6 }, theme: dsTheme },
    );

    const header = firstDrawText(ops, (text) => text.includes("Name"));
    const selectedRow = firstDrawText(ops, (text) => text.includes("Alpha"));
    assert.ok(header && header.kind === "drawText");
    assert.ok(selectedRow && selectedRow.kind === "drawText");
    if (!header || header.kind !== "drawText" || !selectedRow || selectedRow.kind !== "drawText")
      return;
    assert.deepEqual(header.style?.fg, dsTheme.colors["fg.secondary"]);
    assert.equal(header.style?.bold, true);
    assert.deepEqual(selectedRow.style?.fg, dsTheme.colors["selected.fg"]);
    assert.equal(selectedRow.style?.bold, true);

    assert.equal(
      ops.some(
        (op) => op.kind === "fillRect" && rgbEquals(op.style?.bg, dsTheme.colors["bg.subtle"]),
      ),
      true,
      "striped rows should use recipe subtle background",
    );
  });

  test("uses focused-row recipe colors when table is focused", () => {
    const ops = renderOps(
      ui.table<Row>({
        id: "tbl-focus",
        columns,
        data,
        getRowKey: (row) => row.id,
        selectionMode: "single",
        border: "none",
      }),
      { viewport: { cols: 40, rows: 6 }, theme: dsTheme, focusedId: "tbl-focus" },
    );
    assert.equal(
      ops.some(
        (op) => op.kind === "fillRect" && rgbEquals(op.style?.bg, dsTheme.colors["focus.bg"]),
      ),
      true,
      "focused row should use recipe focus background",
    );
  });

  test("keeps legacy table fallback when semantic tokens are absent", () => {
    const ops = renderOps(
      ui.table<Row>({
        id: "legacy-table",
        columns,
        data,
        getRowKey: (row) => row.id,
        stripedRows: true,
        sortColumn: "name",
        sortDirection: "asc",
        border: "none",
      }),
      { viewport: { cols: 40, rows: 6 }, theme: defaultTheme },
    );

    const sortedHeader = firstDrawText(ops, (text) => text.includes("▲"));
    assert.ok(sortedHeader && sortedHeader.kind === "drawText");
    if (!sortedHeader || sortedHeader.kind !== "drawText") return;
    assert.deepEqual(sortedHeader.style?.fg, defaultTheme.colors.info);

    assert.equal(
      ops.some(
        (op) => op.kind === "fillRect" && rgbEquals(op.style?.bg, defaultTheme.colors.border),
      ),
      true,
      "legacy striped rows should still use theme.colors.border",
    );
  });
});
