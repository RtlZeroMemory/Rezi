import { assert, describe, test } from "@rezi-ui/testkit";
import {
  SORT_INDICATOR_ASC,
  SORT_INDICATOR_DESC,
  buildRowKeyIndex,
  extractRowKeys,
  getSortIndicator,
  toggleSort,
} from "../table.js";

describe("table.sorting - sort-state and identity invariants", () => {
  const sortCases = [
    {
      name: "new column starts asc",
      args: [undefined, undefined, "name"] as const,
      expected: ["name", "asc"] as const,
    },
    {
      name: "asc toggles to desc",
      args: ["name", "asc", "name"] as const,
      expected: ["name", "desc"] as const,
    },
    {
      name: "desc toggles to asc",
      args: ["name", "desc", "name"] as const,
      expected: ["name", "asc"] as const,
    },
    {
      name: "switching column resets to asc",
      args: ["name", "desc", "size"] as const,
      expected: ["size", "asc"] as const,
    },
    {
      name: "undefined direction toggles to asc",
      args: ["name", undefined, "name"] as const,
      expected: ["name", "asc"] as const,
    },
  ] as const;

  for (const c of sortCases) {
    test(`toggleSort ${c.name}`, () => {
      const next = toggleSort(c.args[0], c.args[1], c.args[2]);
      assert.equal(next.column, c.expected[0]);
      assert.equal(next.direction, c.expected[1]);
    });
  }

  const indicatorCases = [
    { name: "asc indicator", args: ["name", "name", "asc"] as const, expected: SORT_INDICATOR_ASC },
    {
      name: "desc indicator",
      args: ["name", "name", "desc"] as const,
      expected: SORT_INDICATOR_DESC,
    },
    { name: "unsorted column", args: ["name", "size", "asc"] as const, expected: "" },
    { name: "no sort state", args: ["name", undefined, undefined] as const, expected: "" },
  ] as const;

  for (const c of indicatorCases) {
    test(`getSortIndicator ${c.name}`, () => {
      assert.equal(getSortIndicator(c.args[0], c.args[1], c.args[2]), c.expected);
    });
  }

  test("extractRowKeys keeps row identity stable across reorders", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }] as const;
    const reordered = [rows[2], rows[0], rows[1]];
    assert.deepEqual(
      extractRowKeys(rows, (r) => r.id),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      extractRowKeys(reordered, (r) => r.id),
      ["c", "a", "b"],
    );
  });

  test("extractRowKeys emits deterministic placeholders for sparse entries", () => {
    const rows: Array<{ id: string } | undefined> = [{ id: "a" }, undefined, { id: "c" }];
    assert.deepEqual(
      extractRowKeys(rows, (r, i) => r?.id ?? `x${i}`),
      ["a", "__empty_1", "c"],
    );
  });

  test("buildRowKeyIndex maps keys to positions", () => {
    const map = buildRowKeyIndex(["k0", "k1", "k2"]);
    assert.equal(map.get("k0"), 0);
    assert.equal(map.get("k2"), 2);
    assert.equal(map.get("missing"), undefined);
  });

  test("buildRowKeyIndex resolves duplicates to last index deterministically", () => {
    const map = buildRowKeyIndex(["dup", "x", "dup"]);
    assert.equal(map.get("dup"), 2);
    assert.equal(map.get("x"), 1);
  });

  test("row identity map after reorder reflects new indices", () => {
    const map = buildRowKeyIndex(["c", "a", "b"]);
    assert.equal(map.get("a"), 1);
    assert.equal(map.get("b"), 2);
    assert.equal(map.get("c"), 0);
  });

  test("toggleSort is pure and does not mutate inputs", () => {
    const column = "name";
    const direction: "asc" | "desc" = "asc";
    const next = toggleSort(column, direction, "name");
    assert.equal(column, "name");
    assert.equal(direction, "asc");
    assert.equal(next.direction, "desc");
  });
});
