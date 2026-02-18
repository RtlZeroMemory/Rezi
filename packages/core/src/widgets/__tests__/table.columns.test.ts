import { assert, describe, test } from "@rezi-ui/testkit";
import { alignCellText, distributeColumnWidths } from "../table.js";
import type { TableColumn } from "../types.js";

describe("table.columns - width allocation and truncation", () => {
  test("fixed+flex distribution fills remaining width", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", width: 20 },
      { key: "b", header: "B", flex: 1 },
      { key: "c", header: "C", flex: 2 },
    ];
    const result = distributeColumnWidths(columns, 80);
    assert.deepEqual(result.widths, [20, 20, 40]);
    assert.equal(result.totalWidth, 80);
  });

  test("default flex uses 1", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A" },
      { key: "b", header: "B" },
      { key: "c", header: "C" },
    ];
    const result = distributeColumnWidths(columns, 30);
    assert.deepEqual(result.widths, [10, 10, 10]);
  });

  test("minWidth is enforced", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 1, minWidth: 8 },
      { key: "b", header: "B", flex: 1 },
    ];
    const result = distributeColumnWidths(columns, 10);
    assert.ok((result.widths[0] ?? 0) >= 8);
  });

  test("maxWidth is enforced", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", flex: 3, maxWidth: 4 },
      { key: "b", header: "B", flex: 1 },
    ];
    const result = distributeColumnWidths(columns, 20);
    assert.equal(result.widths[0], 4);
  });

  test("negative fixed width clamps to zero", () => {
    const columns: TableColumn<unknown>[] = [
      { key: "a", header: "A", width: -10 },
      { key: "b", header: "B", flex: 1 },
    ];
    const result = distributeColumnWidths(columns, 20);
    assert.equal(result.widths[0], 0);
    assert.equal(result.totalWidth, 20);
  });

  test("empty column list returns empty widths", () => {
    const result = distributeColumnWidths([], 100);
    assert.deepEqual(result.widths, []);
    assert.equal(result.totalWidth, 0);
  });

  const alignCases = [
    { name: "left pad", text: "abc", width: 5, align: "left" as const, expected: "abc  " },
    { name: "right pad", text: "abc", width: 5, align: "right" as const, expected: "  abc" },
    { name: "center pad even", text: "ab", width: 6, align: "center" as const, expected: "  ab  " },
    { name: "center pad odd", text: "ab", width: 5, align: "center" as const, expected: " ab  " },
    { name: "exact width", text: "hello", width: 5, align: "left" as const, expected: "hello" },
    {
      name: "truncate left",
      text: "longvalue",
      width: 4,
      align: "left" as const,
      expected: "long",
    },
    {
      name: "truncate right",
      text: "longvalue",
      width: 4,
      align: "right" as const,
      expected: "long",
    },
    {
      name: "truncate center",
      text: "longvalue",
      width: 4,
      align: "center" as const,
      expected: "long",
    },
    { name: "zero width", text: "abc", width: 0, align: "left" as const, expected: "" },
  ] as const;

  for (const c of alignCases) {
    test(`alignCellText ${c.name}`, () => {
      const value = alignCellText(c.text, c.width, c.align);
      assert.equal(value, c.expected);
      assert.equal(value.length, c.expected.length);
    });
  }
});
