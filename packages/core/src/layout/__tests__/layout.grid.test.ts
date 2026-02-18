import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import type { LayoutTree } from "../layout.js";
import { layout, measure } from "../layout.js";
import type { Axis } from "../types.js";

type GridProps = Readonly<{
  columns: number | string;
  rows?: number | string;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
}>;

function mustMeasure(node: VNode, maxW: number, maxH: number, axis: Axis = "column") {
  const res = measure(node, maxW, maxH, axis);
  assert.equal(res.ok, true, "measure should succeed");
  if (!res.ok) {
    throw new Error("measure failed");
  }
  return res.value;
}

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis = "column"): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, axis);
  assert.equal(res.ok, true, "layout should succeed");
  if (!res.ok) {
    throw new Error("layout failed");
  }
  return res.value;
}

function text(value: string): VNode {
  return { kind: "text", text: value, props: {} };
}

function box(width: number, height: number): VNode {
  return {
    kind: "box",
    props: { border: "none", width, height },
    children: Object.freeze([]),
  };
}

function gridNode(props: GridProps, children: readonly (VNode | undefined)[]): VNode {
  return {
    kind: "grid",
    props,
    children: Object.freeze([...children]) as readonly VNode[],
  };
}

function childRects(node: LayoutTree) {
  return node.children.map((c) => c.rect);
}

describe("layout grid (deterministic)", () => {
  test("fixed numeric columns measure inferred rows and per-column naturals", () => {
    const node = gridNode(
      { columns: 3 },
      Object.freeze([text("A"), text("BB"), text("CCC"), text("DDDD")]),
    );
    assert.deepEqual(mustMeasure(node, 40, 10), { w: 9, h: 2 });
  });

  test("fixed numeric columns layout uses equal count-track widths", () => {
    const node = gridNode(
      { columns: 3 },
      Object.freeze([text("A"), text("BB"), text("CCC"), text("DDDD")]),
    );
    const out = mustLayout(node, 40, 10);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 9, h: 2 });
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 3, y: 0, w: 3, h: 1 },
      { x: 6, y: 0, w: 3, h: 1 },
      { x: 0, y: 1, w: 3, h: 1 },
    ]);
  });

  test("fixed numeric columns distribute constrained remainder deterministically", () => {
    const node = gridNode(
      { columns: 3 },
      Object.freeze([text("AAAA"), text("BBBB"), text("CCCC")]),
    );
    const out = mustLayout(node, 5, 4);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 1 });
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 2, y: 0, w: 2, h: 1 },
      { x: 4, y: 0, w: 1, h: 1 },
    ]);
  });

  test("explicit rows=0 capacity drops all children", () => {
    const node = gridNode(
      { columns: 3, rows: 0 },
      Object.freeze([text("A"), text("B"), text("C")]),
    );
    assert.deepEqual(mustMeasure(node, 40, 10), { w: 0, h: 0 });
    const out = mustLayout(node, 40, 10);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(out.children.length, 0);
  });

  test("mixed string tracks (fixed/auto/fr + fixed/auto rows) layout deterministically", () => {
    const node = gridNode(
      { columns: "4 auto 1fr", rows: "2 auto" },
      Object.freeze([text("a"), text("bb"), text("ccc"), text("d"), text("eeeee"), text("f")]),
    );
    assert.deepEqual(mustMeasure(node, 100, 100), { w: 9, h: 3 });

    const out = mustLayout(node, 100, 100);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 9, h: 3 });
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 4, y: 0, w: 5, h: 2 },
      { x: 9, y: 0, w: 0, h: 2 },
      { x: 0, y: 2, w: 4, h: 1 },
      { x: 4, y: 2, w: 5, h: 1 },
      { x: 9, y: 2, w: 0, h: 1 },
    ]);

    const forced = mustLayout(gridNode({ columns: "12", rows: "3" }, Object.freeze([node])), 12, 3);
    const forcedInner = forced.children[0];
    assert.ok(forcedInner !== undefined);
    assert.deepEqual(forcedInner.rect, { x: 0, y: 0, w: 12, h: 3 });
    assert.deepEqual(childRects(forcedInner), [
      { x: 0, y: 0, w: 4, h: 2 },
      { x: 4, y: 0, w: 5, h: 2 },
      { x: 9, y: 0, w: 3, h: 2 },
      { x: 0, y: 2, w: 4, h: 1 },
      { x: 4, y: 2, w: 5, h: 1 },
      { x: 9, y: 2, w: 3, h: 1 },
    ]);
  });

  test("string tracks parse commas and whitespace equivalently", () => {
    const a = gridNode(
      { columns: "2, auto, 1fr", rows: "1, auto" },
      Object.freeze([text("A"), text("BBBB"), text("CC"), text("D"), text("EEE"), text("F")]),
    );
    const b = gridNode(
      { columns: "2 auto 1fr", rows: "1 auto" },
      Object.freeze([text("A"), text("BBBB"), text("CC"), text("D"), text("EEE"), text("F")]),
    );

    assert.deepEqual(mustMeasure(a, 60, 20), mustMeasure(b, 60, 20));
    const outA = mustLayout(a, 60, 20);
    const outB = mustLayout(b, 60, 20);
    assert.deepEqual(outA.rect, outB.rect);
    assert.deepEqual(childRects(outA), childRects(outB));
  });

  test("bare fr token behaves as 1fr", () => {
    const withBare = gridNode(
      { columns: "fr 2fr", rows: "1" },
      Object.freeze([text("AAAAAA"), text("BBBBBB")]),
    );
    const withOne = gridNode(
      { columns: "1fr 2fr", rows: "1" },
      Object.freeze([text("AAAAAA"), text("BBBBBB")]),
    );

    assert.deepEqual(mustMeasure(withBare, 6, 4), { w: 0, h: 1 });
    assert.deepEqual(mustMeasure(withOne, 6, 4), { w: 0, h: 1 });

    const outerA = mustLayout(
      gridNode({ columns: "6", rows: "1" }, Object.freeze([withBare])),
      6,
      1,
    );
    const outerB = mustLayout(
      gridNode({ columns: "6", rows: "1" }, Object.freeze([withOne])),
      6,
      1,
    );
    const a = outerA.children[0];
    const b = outerB.children[0];
    assert.ok(a !== undefined);
    assert.ok(b !== undefined);
    assert.deepEqual(a.rect, { x: 0, y: 0, w: 6, h: 1 });
    assert.deepEqual(childRects(a), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 2, y: 0, w: 4, h: 1 },
    ]);
    assert.deepEqual(childRects(a), childRects(b));
  });

  test("auto-flow places children left-to-right then wraps top-to-bottom", () => {
    const node = gridNode(
      { columns: 2 },
      Object.freeze([text("A"), text("B"), text("C"), text("D"), text("E")]),
    );

    const out = mustLayout(node, 20, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 2, h: 3 });
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 1, h: 1 },
      { x: 1, y: 1, w: 1, h: 1 },
      { x: 0, y: 2, w: 1, h: 1 },
    ]);
  });

  test("auto-flow compacts sparse child arrays by skipping undefined entries", () => {
    const node = gridNode(
      { columns: 2 },
      Object.freeze([text("A"), undefined, text("B"), text("C")]),
    );

    const out = mustLayout(node, 20, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 2, h: 2 });
    assert.equal(out.children.length, 3);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 1, h: 1 },
    ]);
  });

  test("gap applies to both axes when rowGap/columnGap are omitted", () => {
    const node = gridNode(
      { columns: "2 2", rows: "1 1", gap: 1 },
      Object.freeze([text("A"), text("B"), text("C"), text("D")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 5, h: 3 });
    const out = mustLayout(node, 40, 20);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 3, y: 0, w: 2, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
      { x: 3, y: 2, w: 2, h: 1 },
    ]);
  });

  test("rowGap overrides gap for vertical spacing only", () => {
    const node = gridNode(
      { columns: "2 2", rows: "1 1", gap: 1, rowGap: 2 },
      Object.freeze([text("A"), text("B"), text("C"), text("D")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 5, h: 4 });
    const out = mustLayout(node, 40, 20);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 3, y: 0, w: 2, h: 1 },
      { x: 0, y: 3, w: 2, h: 1 },
      { x: 3, y: 3, w: 2, h: 1 },
    ]);
  });

  test("columnGap overrides gap for horizontal spacing only", () => {
    const node = gridNode(
      { columns: "2 2", rows: "1 1", gap: 1, columnGap: 2 },
      Object.freeze([text("A"), text("B"), text("C"), text("D")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 6, h: 3 });
    const out = mustLayout(node, 40, 20);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 4, y: 0, w: 2, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
      { x: 4, y: 2, w: 2, h: 1 },
    ]);
  });

  test("rowGap and columnGap both override gap", () => {
    const node = gridNode(
      { columns: "2 2", rows: "1 1", gap: 3, rowGap: 1, columnGap: 2 },
      Object.freeze([text("A"), text("B"), text("C"), text("D")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 6, h: 3 });
    const out = mustLayout(node, 40, 20);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 4, y: 0, w: 2, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
      { x: 4, y: 2, w: 2, h: 1 },
    ]);
  });

  test("fr tracks distribute width proportionally under constrained space", () => {
    const inner = gridNode(
      { columns: "1fr 2fr 3fr", rows: "1" },
      Object.freeze([text("XXXXXXXXXX"), text("YYYYYYYYYY"), text("ZZZZZZZZZZ")]),
    );

    assert.deepEqual(mustMeasure(inner, 24, 10), { w: 0, h: 1 });
    const out = mustLayout(gridNode({ columns: "24", rows: "1" }, Object.freeze([inner])), 24, 1);
    const forcedInner = out.children[0];
    assert.ok(forcedInner !== undefined);
    assert.deepEqual(forcedInner.rect, { x: 0, y: 0, w: 24, h: 1 });
    assert.deepEqual(childRects(forcedInner), [
      { x: 0, y: 0, w: 4, h: 1 },
      { x: 4, y: 0, w: 8, h: 1 },
      { x: 12, y: 0, w: 12, h: 1 },
    ]);
  });

  test("fr remainder distribution is deterministic by track order", () => {
    const inner = gridNode(
      { columns: "1fr 1fr 1fr", rows: "1" },
      Object.freeze([text("AAAA"), text("BBBB"), text("CCCC")]),
    );

    assert.deepEqual(mustMeasure(inner, 5, 10), { w: 0, h: 1 });
    const out = mustLayout(gridNode({ columns: "5", rows: "1" }, Object.freeze([inner])), 5, 1);
    const forcedInner = out.children[0];
    assert.ok(forcedInner !== undefined);
    assert.deepEqual(forcedInner.rect, { x: 0, y: 0, w: 5, h: 1 });
    assert.deepEqual(childRects(forcedInner), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 2, y: 0, w: 2, h: 1 },
      { x: 4, y: 0, w: 1, h: 1 },
    ]);
  });

  test("mixed fixed and fr columns allocate fixed first then flex remainder", () => {
    const inner = gridNode(
      { columns: "3 1fr 2fr", rows: "1" },
      Object.freeze([text("AAAAAA"), text("BBBBBB"), text("CCCCCC")]),
    );

    assert.deepEqual(mustMeasure(inner, 12, 10), { w: 3, h: 1 });
    const out = mustLayout(gridNode({ columns: "12", rows: "1" }, Object.freeze([inner])), 12, 1);
    const forcedInner = out.children[0];
    assert.ok(forcedInner !== undefined);
    assert.deepEqual(forcedInner.rect, { x: 0, y: 0, w: 12, h: 1 });
    assert.deepEqual(childRects(forcedInner), [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 3, y: 0, w: 3, h: 1 },
      { x: 6, y: 0, w: 6, h: 1 },
    ]);
  });

  test("auto columns use largest natural width in each column", () => {
    const node = gridNode(
      { columns: "auto auto", rows: "auto auto" },
      Object.freeze([text("AA"), text("BBBB"), text("CCCCC"), text("D")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 10), { w: 9, h: 2 });
    const out = mustLayout(node, 40, 10);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 5, h: 1 },
      { x: 5, y: 0, w: 4, h: 1 },
      { x: 0, y: 1, w: 5, h: 1 },
      { x: 5, y: 1, w: 4, h: 1 },
    ]);
  });

  test("auto rows use tallest natural child height in each row", () => {
    const node = gridNode(
      { columns: "1 1", rows: "auto auto" },
      Object.freeze([box(1, 1), box(1, 3), box(1, 2), box(1, 1)]),
    );

    assert.deepEqual(mustMeasure(node, 20, 20), { w: 2, h: 5 });
    const out = mustLayout(node, 20, 20);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 1, h: 3 },
      { x: 1, y: 0, w: 1, h: 3 },
      { x: 0, y: 3, w: 1, h: 2 },
      { x: 1, y: 3, w: 1, h: 2 },
    ]);
  });

  test("explicit numeric rows enforce capacity and drop overflow children", () => {
    const node = gridNode(
      { columns: 2, rows: 2 },
      Object.freeze([text("A"), text("B"), text("C"), text("D"), text("LLLLLLLLLL"), text("MMMM")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 2, h: 2 });
    const out = mustLayout(node, 40, 20);
    assert.equal(out.children.length, 4);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 1, h: 1 },
      { x: 1, y: 1, w: 1, h: 1 },
    ]);
  });

  test("explicit string rows enforce capacity and drop overflow children", () => {
    const node = gridNode(
      { columns: "3 3", rows: "1" },
      Object.freeze([text("A"), text("B"), text("CCCCCCCC")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 6, h: 1 });
    const out = mustLayout(node, 40, 20);
    assert.equal(out.children.length, 2);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 3, y: 0, w: 3, h: 1 },
    ]);
  });

  test("overflow children do not affect auto track sizing when rows are explicit", () => {
    const node = gridNode(
      { columns: "auto auto", rows: 1 },
      Object.freeze([text("AA"), text("BBB"), text("MMMMMMMMMMMM")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 5, h: 1 });
    const out = mustLayout(node, 40, 20);
    assert.equal(out.children.length, 2);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 2, y: 0, w: 3, h: 1 },
    ]);
  });

  test("rows are inferred when omitted", () => {
    const node = gridNode(
      { columns: 3 },
      Object.freeze([text("A"), text("B"), text("C"), text("D"), text("E"), text("F"), text("G")]),
    );

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 3, h: 3 });
    const out = mustLayout(node, 40, 20);
    assert.equal(out.children.length, 7);
    assert.deepEqual(out.children[6]?.rect, { x: 0, y: 2, w: 1, h: 1 });
  });

  test("inferred rows include gap in measured and laid out height", () => {
    const node = gridNode({ columns: 2, gap: 1 }, Object.freeze([text("A"), text("B"), text("C")]));

    assert.deepEqual(mustMeasure(node, 40, 20), { w: 3, h: 3 });
    const out = mustLayout(node, 40, 20);
    assert.deepEqual(childRects(out), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 2, y: 0, w: 1, h: 1 },
      { x: 0, y: 2, w: 1, h: 1 },
    ]);
  });

  test("rows omitted with zero children produce zero-sized grid", () => {
    const node = gridNode({ columns: 3 }, Object.freeze([]));
    assert.deepEqual(mustMeasure(node, 40, 20), { w: 0, h: 0 });
    const out = mustLayout(node, 40, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(out.children.length, 0);
  });

  test("nested: grid inside row lays out deterministically", () => {
    const innerGrid = gridNode(
      { columns: "2 2", rows: "1" },
      Object.freeze([text("a"), text("b")]),
    );
    const row: VNode = {
      kind: "row",
      props: { gap: 1 },
      children: Object.freeze([text("L"), innerGrid, text("R")]),
    };

    const out = mustLayout(row, 30, 10, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(out.children[1]?.rect, { x: 2, y: 0, w: 4, h: 1 });
    assert.deepEqual(out.children[2]?.rect, { x: 7, y: 0, w: 1, h: 1 });
    const gridLayout = out.children[1];
    assert.ok(gridLayout !== undefined);
    assert.deepEqual(childRects(gridLayout), [
      { x: 2, y: 0, w: 2, h: 1 },
      { x: 4, y: 0, w: 2, h: 1 },
    ]);
  });

  test("nested: grid inside column lays out deterministically", () => {
    const innerGrid = gridNode(
      { columns: "2 2", rows: "1 1" },
      Object.freeze([text("a"), text("b"), text("c"), text("d")]),
    );
    const column: VNode = {
      kind: "column",
      props: { gap: 1 },
      children: Object.freeze([text("T"), innerGrid]),
    };

    const out = mustLayout(column, 30, 20, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 4, h: 4 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 2, w: 4, h: 2 });
    const gridLayout = out.children[1];
    assert.ok(gridLayout !== undefined);
    assert.deepEqual(childRects(gridLayout), [
      { x: 0, y: 2, w: 2, h: 1 },
      { x: 2, y: 2, w: 2, h: 1 },
      { x: 0, y: 3, w: 2, h: 1 },
      { x: 2, y: 3, w: 2, h: 1 },
    ]);
  });

  test("nested: row inside grid cell is forced to cell rect", () => {
    const innerRow: VNode = {
      kind: "row",
      props: { gap: 1 },
      children: Object.freeze([text("A"), text("B")]),
    };
    const node = gridNode({ columns: "5", rows: "2" }, Object.freeze([innerRow]));

    const out = mustLayout(node, 20, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 2 });
    const rowLayout = out.children[0];
    assert.ok(rowLayout !== undefined);
    assert.deepEqual(rowLayout.rect, { x: 0, y: 0, w: 5, h: 2 });
    assert.deepEqual(childRects(rowLayout), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 2, y: 0, w: 1, h: 1 },
    ]);
  });

  test("nested: column inside grid cell is forced to cell rect", () => {
    const innerColumn: VNode = {
      kind: "column",
      props: { gap: 1 },
      children: Object.freeze([text("A"), text("B")]),
    };
    const node = gridNode({ columns: "4", rows: "3" }, Object.freeze([innerColumn]));

    const out = mustLayout(node, 20, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 4, h: 3 });
    const columnLayout = out.children[0];
    assert.ok(columnLayout !== undefined);
    assert.deepEqual(columnLayout.rect, { x: 0, y: 0, w: 4, h: 3 });
    assert.deepEqual(childRects(columnLayout), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 2, w: 1, h: 1 },
    ]);
  });

  test("nested: row and column children can occupy separate grid cells", () => {
    const cellRow: VNode = {
      kind: "row",
      props: { gap: 1 },
      children: Object.freeze([text("L"), text("R")]),
    };
    const cellColumn: VNode = {
      kind: "column",
      props: { gap: 1 },
      children: Object.freeze([text("T"), text("B")]),
    };
    const node = gridNode({ columns: "4 4", rows: "2" }, Object.freeze([cellRow, cellColumn]));

    const out = mustLayout(node, 40, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 2 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 4, h: 2 });
    assert.deepEqual(out.children[1]?.rect, { x: 4, y: 0, w: 4, h: 2 });
    const rowLayout = out.children[0];
    const columnLayout = out.children[1];
    assert.ok(rowLayout !== undefined);
    assert.ok(columnLayout !== undefined);
    assert.deepEqual(childRects(rowLayout), [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 2, y: 0, w: 1, h: 1 },
    ]);
    assert.deepEqual(childRects(columnLayout), [
      { x: 4, y: 0, w: 1, h: 1 },
      { x: 4, y: 2, w: 0, h: 0 },
    ]);
  });
});
