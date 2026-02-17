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

function deepest(node: LayoutTree): LayoutTree {
  let cur = node;
  while (cur.children.length === 1) {
    const next = cur.children[0];
    if (!next) break;
    cur = next;
  }
  return cur;
}

function chainDepth(node: LayoutTree): number {
  let depth = 1;
  let cur = node;
  while (cur.children.length === 1) {
    const next = cur.children[0];
    if (!next) break;
    cur = next;
    depth++;
  }
  return depth;
}

function assertAllZeroRect(node: LayoutTree): void {
  assert.equal(node.rect.w, 0, "expected zero width");
  assert.equal(node.rect.h, 0, "expected zero height");
  for (const child of node.children) {
    assertAllZeroRect(child);
  }
}

describe("layout zero/empty edges (deterministic)", () => {
  test("row with zero children measures as zero", () => {
    const row: VNode = { kind: "row", props: {}, children: Object.freeze([]) };
    assert.deepEqual(mustMeasure(row, 80, 24, "row"), { w: 0, h: 0 });
  });

  test("column with zero children measures as zero", () => {
    const column: VNode = { kind: "column", props: {}, children: Object.freeze([]) };
    assert.deepEqual(mustMeasure(column, 80, 24, "column"), { w: 0, h: 0 });
  });

  test("row with zero children but padding retains footprint", () => {
    const row: VNode = { kind: "row", props: { p: 1 }, children: Object.freeze([]) };
    assert.deepEqual(mustMeasure(row, 10, 6, "row"), { w: 2, h: 2 });
  });

  test("column with zero children but padding retains footprint", () => {
    const column: VNode = { kind: "column", props: { p: 1 }, children: Object.freeze([]) };
    assert.deepEqual(mustMeasure(column, 10, 6, "column"), { w: 2, h: 2 });
  });

  test("row with zero children layouts to empty tree", () => {
    const row: VNode = { kind: "row", props: {}, children: Object.freeze([]) };
    const out = mustLayout(row, 10, 6, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(out.children.length, 0);
  });

  test("column with zero children layouts to empty tree", () => {
    const column: VNode = { kind: "column", props: {}, children: Object.freeze([]) };
    const out = mustLayout(column, 10, 6, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.equal(out.children.length, 0);
  });

  test("row in zero-width viewport produces zero-size children", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        { kind: "text", text: "abc", props: {} } as VNode,
        {
          kind: "box",
          props: { border: "none", width: 2, height: 1 },
          children: Object.freeze([]),
        } as VNode,
      ]),
    };
    const out = mustLayout(row, 0, 4, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 0, w: 0, h: 0 });
  });

  test("column in zero-height viewport produces zero-size children", () => {
    const column: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([
        { kind: "text", text: "abc", props: {} } as VNode,
        {
          kind: "box",
          props: { border: "none", width: 1, height: 2 },
          children: Object.freeze([]),
        } as VNode,
      ]),
    };
    const out = mustLayout(column, 4, 0, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 0, w: 0, h: 0 });
  });

  test("explicit zero-size child survives in row tree", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", width: 0, height: 0 },
          children: Object.freeze([]),
        } as VNode,
        { kind: "text", text: "A", props: {} } as VNode,
      ]),
    };
    const out = mustLayout(row, 5, 2, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 0, w: 1, h: 1 });
  });

  test("explicit zero-size child survives in column tree", () => {
    const column: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", width: 0, height: 0 },
          children: Object.freeze([]),
        } as VNode,
        { kind: "text", text: "B", props: {} } as VNode,
      ]),
    };
    const out = mustLayout(column, 4, 3, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 0, h: 0 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 0, w: 1, h: 1 });
  });

  test("empty text measures as width 0 and height 1", () => {
    const text: VNode = { kind: "text", text: "", props: {} };
    assert.deepEqual(mustMeasure(text, 10, 3), { w: 0, h: 1 });
  });

  test("empty text layout with maxW=0 keeps deterministic height", () => {
    const text: VNode = { kind: "text", text: "", props: {} };
    const out = mustLayout(text, 0, 3);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 1 });
  });

  test("row containing only empty text has zero width but non-zero row height", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([{ kind: "text", text: "", props: {} }]),
    };
    const out = mustLayout(row, 5, 3, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 0, h: 0 });
  });

  test("deep nesting 24 columns with empty text remains stable", () => {
    let node: VNode = { kind: "text", text: "", props: {} };
    for (let i = 0; i < 24; i++) {
      node = { kind: "column", props: {}, children: Object.freeze([node]) };
    }
    const out = mustLayout(node, 5, 5, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 0, h: 1 });
    assert.equal(chainDepth(out), 25);
    const leaf = deepest(out);
    assert.equal(leaf.vnode.kind, "text");
    assert.deepEqual(leaf.rect, { x: 0, y: 0, w: 0, h: 1 });
  });

  test("deep alternating nesting 25+ levels in zero viewport remains all-zero", () => {
    let node: VNode = { kind: "text", text: "Z", props: {} };
    for (let i = 0; i < 25; i++) {
      node =
        i % 2 === 0
          ? { kind: "row", props: {}, children: Object.freeze([node]) }
          : { kind: "column", props: {}, children: Object.freeze([node]) };
    }
    const rootAxis: Axis = node.kind === "row" ? "row" : "column";
    const out = mustLayout(node, 0, 0, rootAxis);
    assert.equal(chainDepth(out), 26);
    assertAllZeroRect(out);
  });

  test("single-child row is equivalent to direct child layout", () => {
    const child: VNode = {
      kind: "box",
      props: { border: "none", width: 3, height: 2 },
      children: Object.freeze([]),
    };
    const direct = mustLayout(child, 10, 10, "column");
    const rowWrapped: VNode = { kind: "row", props: {}, children: Object.freeze([child]) };
    const wrapped = mustLayout(rowWrapped, 10, 10, "row");
    assert.deepEqual(wrapped.rect, direct.rect);
    assert.deepEqual(wrapped.children[0]?.rect, direct.rect);
  });

  test("single-child column is equivalent to direct child layout", () => {
    const child: VNode = {
      kind: "box",
      props: { border: "none", width: 2, height: 3 },
      children: Object.freeze([]),
    };
    const direct = mustLayout(child, 10, 10, "column");
    const wrappedColumn: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([child]),
    };
    const wrapped = mustLayout(wrappedColumn, 10, 10, "column");
    assert.deepEqual(wrapped.rect, direct.rect);
    assert.deepEqual(wrapped.children[0]?.rect, direct.rect);
  });
});
