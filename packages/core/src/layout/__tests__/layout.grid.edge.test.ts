import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import type { LayoutTree } from "../layout.js";
import { layout, measure } from "../layout.js";
import type { Axis } from "../types.js";

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

function fixedBox(width: number, height: number): VNode {
  return {
    kind: "box",
    props: { border: "none", width, height },
    children: Object.freeze([]),
  };
}

describe("layout grid edge cases (deterministic)", () => {
  test("empty implicit grid measures and layouts to zero", () => {
    const grid: VNode = { kind: "grid", props: { columns: 3 }, children: Object.freeze([]) };
    assert.deepEqual(mustMeasure(grid, 40, 20), { w: 0, h: 0 });
    const laidOut = mustLayout(grid, 40, 20);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(laidOut.children.length, 0);
  });

  test("empty explicit tracks keep gap-only footprint", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "auto auto auto", rows: "auto auto", columnGap: 3, rowGap: 5 },
      children: Object.freeze([]),
    };
    assert.deepEqual(mustMeasure(grid, 40, 20), { w: 6, h: 5 });
    const laidOut = mustLayout(grid, 40, 20);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 6, h: 5 });
    assert.equal(laidOut.children.length, 0);
  });

  test("rows:0 creates explicit zero-capacity grid", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: 2, rows: 0 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1)]),
    };
    assert.deepEqual(mustMeasure(grid, 20, 20), { w: 0, h: 0 });
    const laidOut = mustLayout(grid, 20, 20);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(laidOut.children.length, 0);
  });

  test("1-column implicit rows behave like vertical stack ordering", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: 1, rowGap: 1 },
      children: Object.freeze([fixedBox(2, 1), fixedBox(4, 2), fixedBox(3, 1)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 4, h: 6 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 4, h: 6 });
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 4, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 0, y: 2, w: 4, h: 2 });
    assert.deepEqual(laidOut.children[2]?.rect, { x: 0, y: 5, w: 4, h: 1 });
  });

  test("1-column explicit rows drops overflow children", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: 1, rows: 2, rowGap: 1 },
      children: Object.freeze([fixedBox(2, 1), fixedBox(3, 2), fixedBox(9, 9)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 3, h: 4 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.equal(laidOut.children.length, 2);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 3, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 0, y: 2, w: 3, h: 2 });
  });

  test("children beyond explicit rows*columns are dropped", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "2 3", rows: 1, columnGap: 1 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1), fixedBox(9, 9)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 6, h: 1 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.equal(laidOut.children.length, 2);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 3, y: 0, w: 3, h: 1 });
  });

  test("zero available space produces zero-size tracks and child rects", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "auto auto", rows: "auto auto" },
      children: Object.freeze([fixedBox(2, 2), fixedBox(3, 1), fixedBox(1, 4), fixedBox(2, 3)]),
    };

    const laidOut = mustLayout(grid, 0, 0);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(laidOut.children.length, 4);
    for (const child of laidOut.children) {
      assert.deepEqual(child.rect, { x: 0, y: 0, w: 0, h: 0 });
    }
  });

  test("all auto tracks size from per-track max content", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "auto auto", rows: "auto auto", columnGap: 1, rowGap: 2 },
      children: Object.freeze([fixedBox(2, 1), fixedBox(5, 2), fixedBox(3, 4), fixedBox(1, 3)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 9, h: 8 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 9, h: 8 });
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 3, h: 2 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 4, y: 0, w: 5, h: 2 });
    assert.deepEqual(laidOut.children[2]?.rect, { x: 0, y: 4, w: 3, h: 4 });
    assert.deepEqual(laidOut.children[3]?.rect, { x: 4, y: 4, w: 5, h: 4 });
  });

  test("all fr tracks distribute constrained space deterministically", () => {
    const inner: VNode = {
      kind: "grid",
      props: { columns: "1fr 2fr", rows: "1fr 3fr", columnGap: 1, rowGap: 1 },
      children: Object.freeze([fixedBox(5, 2), fixedBox(1, 1), fixedBox(3, 2), fixedBox(1, 2)]),
    };

    assert.deepEqual(mustMeasure(inner, 50, 50), { w: 1, h: 1 });
    const wrapper: VNode = {
      kind: "grid",
      props: { columns: "7", rows: "5" },
      children: Object.freeze([inner]),
    };
    const laidOut = mustLayout(wrapper, 7, 5);
    const forcedInner = laidOut.children[0];
    assert.ok(forcedInner !== undefined);
    assert.deepEqual(forcedInner.rect, { x: 0, y: 0, w: 7, h: 5 });
    assert.deepEqual(forcedInner.children[0]?.rect, { x: 0, y: 0, w: 2, h: 1 });
    assert.deepEqual(forcedInner.children[1]?.rect, { x: 3, y: 0, w: 4, h: 1 });
    assert.deepEqual(forcedInner.children[2]?.rect, { x: 0, y: 2, w: 2, h: 3 });
    assert.deepEqual(forcedInner.children[3]?.rect, { x: 3, y: 2, w: 4, h: 3 });
  });

  test("mixed auto/fr/fixed tracks clamp under constrained space", () => {
    const inner: VNode = {
      kind: "grid",
      props: { columns: "auto 1fr 4", rows: "auto 1fr", columnGap: 1, rowGap: 1 },
      children: Object.freeze([
        fixedBox(5, 2),
        fixedBox(3, 1),
        fixedBox(1, 2),
        fixedBox(4, 4),
        fixedBox(2, 3),
        fixedBox(2, 1),
      ]),
    };

    assert.deepEqual(mustMeasure(inner, 10, 5), { w: 10, h: 3 });
    const wrapper: VNode = {
      kind: "grid",
      props: { columns: "10", rows: "5" },
      children: Object.freeze([inner]),
    };
    const laidOut = mustLayout(wrapper, 10, 5);
    const forcedInner = laidOut.children[0];
    assert.ok(forcedInner !== undefined);
    assert.deepEqual(forcedInner.rect, { x: 0, y: 0, w: 10, h: 5 });
    assert.deepEqual(forcedInner.children[0]?.rect, { x: 0, y: 0, w: 5, h: 2 });
    assert.deepEqual(forcedInner.children[1]?.rect, { x: 6, y: 0, w: 0, h: 2 });
    assert.deepEqual(forcedInner.children[2]?.rect, { x: 7, y: 0, w: 3, h: 2 });
    assert.deepEqual(forcedInner.children[3]?.rect, { x: 0, y: 3, w: 5, h: 2 });
    assert.deepEqual(forcedInner.children[4]?.rect, { x: 6, y: 3, w: 0, h: 2 });
    assert.deepEqual(forcedInner.children[5]?.rect, { x: 7, y: 3, w: 3, h: 2 });
  });

  test("large odd gaps are preserved in measure and placement", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "2 2 2", rows: "1 1", columnGap: 5, rowGap: 3 },
      children: Object.freeze([
        fixedBox(1, 1),
        fixedBox(1, 1),
        fixedBox(1, 1),
        fixedBox(1, 1),
        fixedBox(1, 1),
        fixedBox(1, 1),
      ]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 16, h: 5 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 7, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[2]?.rect, { x: 14, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[5]?.rect, { x: 14, y: 4, w: 2, h: 1 });
  });

  test("zero gaps create contiguous track starts", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "2 3", rows: "1 2", gap: 0 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 5, h: 3 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 2, y: 0, w: 3, h: 1 });
    assert.deepEqual(laidOut.children[2]?.rect, { x: 0, y: 1, w: 2, h: 2 });
    assert.deepEqual(laidOut.children[3]?.rect, { x: 2, y: 1, w: 3, h: 2 });
  });

  test("fractional columns number is truncated", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: 2.9, rows: 2, gap: 0 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 2, h: 2 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 1, y: 0, w: 1, h: 1 });
    assert.deepEqual(laidOut.children[2]?.rect, { x: 0, y: 1, w: 1, h: 1 });
    assert.deepEqual(laidOut.children[3]?.rect, { x: 1, y: 1, w: 1, h: 1 });
  });

  test("fractional rows number is truncated and overflow is dropped", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: 2, rows: 1.9, gap: 0 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1), fixedBox(9, 9)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 2, h: 1 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.equal(laidOut.children.length, 2);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 1, y: 0, w: 1, h: 1 });
  });

  test("fractional gap is truncated and shared by row/column gaps", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "1 1", rows: "1 1", gap: 2.9 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 4, h: 4 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.children[3]?.rect, { x: 3, y: 3, w: 1, h: 1 });
  });

  test("rowGap/columnGap override gap and truncate independently", () => {
    const grid: VNode = {
      kind: "grid",
      props: { columns: "1 1", rows: "1 1", gap: 9.9, rowGap: 1.9, columnGap: 3.9 },
      children: Object.freeze([fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1), fixedBox(1, 1)]),
    };

    assert.deepEqual(mustMeasure(grid, 50, 50), { w: 5, h: 3 });
    const laidOut = mustLayout(grid, 50, 50);
    assert.deepEqual(laidOut.children[1]?.rect, { x: 4, y: 0, w: 1, h: 1 });
    assert.deepEqual(laidOut.children[3]?.rect, { x: 4, y: 2, w: 1, h: 1 });
  });

  test("sparse children arrays are tolerated and holes do not consume grid slots", () => {
    const sparseGrid = {
      kind: "grid",
      props: { columns: "2 2", rows: "1 1", gap: 1 },
      children: Object.freeze([
        fixedBox(1, 1),
        undefined,
        fixedBox(1, 1),
        undefined,
        fixedBox(1, 1),
      ]),
    } as unknown as VNode;

    assert.deepEqual(mustMeasure(sparseGrid, 50, 50), { w: 5, h: 3 });
    const laidOut = mustLayout(sparseGrid, 50, 50);
    assert.equal(laidOut.children.length, 3);
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[1]?.rect, { x: 3, y: 0, w: 2, h: 1 });
    assert.deepEqual(laidOut.children[2]?.rect, { x: 0, y: 2, w: 2, h: 1 });
  });
});
