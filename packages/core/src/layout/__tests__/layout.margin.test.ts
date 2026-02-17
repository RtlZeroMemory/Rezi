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

describe("layout margin (deterministic)", () => {
  test("root box uniform margin insets by all sides", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 4, height: 2, m: 1 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 10, 10);
    assert.deepEqual(out.rect, { x: 1, y: 1, w: 4, h: 2 });
  });

  test("root box asymmetric margin offsets x/y deterministically", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 6, height: 3, mt: 2, mr: 1, mb: 0, ml: 3 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 20, 10);
    assert.deepEqual(out.rect, { x: 3, y: 2, w: 6, h: 3 });
  });

  test("row root margin insets stack and child coordinates", () => {
    const node: VNode = {
      kind: "row",
      props: { m: 2 },
      children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
    };
    const out = mustLayout(node, 10, 10, "row");
    assert.deepEqual(out.rect, { x: 2, y: 2, w: 1, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: 2, y: 2, w: 1, h: 1 });
  });

  test("column root margin insets stack and child coordinates", () => {
    const node: VNode = {
      kind: "column",
      props: { m: 1 },
      children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
    };
    const out = mustLayout(node, 10, 10, "column");
    assert.deepEqual(out.rect, { x: 1, y: 1, w: 1, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: 1, y: 1, w: 1, h: 1 });
  });

  test("negative root margins can expand rendered box from zero outer size", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 2, height: 1, ml: -2, mr: -1, mt: -1, mb: -2 },
      children: Object.freeze([]),
    };
    const size = mustMeasure(node, 4, 4);
    const out = mustLayout(node, 4, 4);
    assert.deepEqual(size, { w: 0, h: 0 });
    assert.deepEqual(out.rect, { x: -2, y: -1, w: 3, h: 3 });
  });

  test("negative row child margins can expand child rect beyond parent", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", width: 1, height: 1, ml: -2, mr: -2, mt: -1, mb: -1 },
          children: Object.freeze([]),
        },
        {
          kind: "box",
          props: { border: "none", width: 2, height: 1 },
          children: Object.freeze([]),
        },
      ]),
    };
    const out = mustLayout(row, 5, 2, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 2, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: -2, y: -1, w: 4, h: 2 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 0, w: 2, h: 1 });
  });

  test("negative column child margins can expand child rect beyond parent", () => {
    const column: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", width: 2, height: 1, ml: -1, mr: -1, mt: -2, mb: -1 },
          children: Object.freeze([]),
        },
        {
          kind: "box",
          props: { border: "none", width: 1, height: 1 },
          children: Object.freeze([]),
        },
      ]),
    };
    const out = mustLayout(column, 4, 3, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 1, h: 1 });
    assert.deepEqual(out.children[0]?.rect, { x: -1, y: -2, w: 2, h: 3 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 0, w: 1, h: 1 });
  });

  test("child margin and parent padding offsets are additive", () => {
    const row: VNode = {
      kind: "row",
      props: { p: 1 },
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", width: 2, height: 1, m: 1 },
          children: Object.freeze([]),
        },
      ]),
    };
    const out = mustLayout(row, 20, 10, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 5 });
    assert.deepEqual(out.children[0]?.rect, { x: 2, y: 2, w: 2, h: 1 });
  });

  test("row margin and padding shrink-wrap deterministically", () => {
    const row: VNode = {
      kind: "row",
      props: { m: 1, p: 1 },
      children: Object.freeze([{ kind: "text", text: "AA", props: {} }]),
    };
    const out = mustLayout(row, 20, 10, "row");
    assert.deepEqual(out.rect, { x: 1, y: 1, w: 4, h: 3 });
    assert.deepEqual(out.children[0]?.rect, { x: 2, y: 2, w: 2, h: 1 });
  });

  test("column margin and padding shrink-wrap deterministically", () => {
    const column: VNode = {
      kind: "column",
      props: { m: 1, p: 1 },
      children: Object.freeze([{ kind: "text", text: "A", props: {} }]),
    };
    const out = mustLayout(column, 20, 10, "column");
    assert.deepEqual(out.rect, { x: 1, y: 1, w: 3, h: 3 });
    assert.deepEqual(out.children[0]?.rect, { x: 2, y: 2, w: 1, h: 1 });
  });

  test('spacing key resolution: m:"md" matches numeric m:2', () => {
    const withKey: VNode = {
      kind: "row",
      props: { m: "md", p: "sm" },
      children: Object.freeze([{ kind: "text", text: "X", props: {} }]),
    };
    const numeric: VNode = {
      kind: "row",
      props: { m: 2, p: 1 },
      children: Object.freeze([{ kind: "text", text: "X", props: {} }]),
    };
    const a = mustLayout(withKey, 20, 10, "row");
    const b = mustLayout(numeric, 20, 10, "row");
    assert.deepEqual(a.rect, b.rect);
    assert.deepEqual(a.children[0]?.rect, b.children[0]?.rect);
  });

  test('spacing key resolution: p:"lg" resolves to 3 cells per side', () => {
    const column: VNode = {
      kind: "column",
      props: { p: "lg" },
      children: Object.freeze([{ kind: "text", text: "AB", props: {} }]),
    };
    const out = mustLayout(column, 20, 10, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 7 });
    assert.deepEqual(out.children[0]?.rect, { x: 3, y: 3, w: 2, h: 1 });
  });

  test('spacing key resolution: m:"xs" and m:"sm" are equivalent', () => {
    const xsNode: VNode = {
      kind: "box",
      props: { border: "none", width: 2, height: 1, m: "xs" },
      children: Object.freeze([]),
    };
    const smNode: VNode = {
      kind: "box",
      props: { border: "none", width: 2, height: 1, m: "sm" },
      children: Object.freeze([]),
    };
    const xs = mustLayout(xsNode, 20, 10);
    const sm = mustLayout(smNode, 20, 10);
    assert.deepEqual(xs.rect, sm.rect);
  });

  test("per-side margins override mx/my/m in layout", () => {
    const box: VNode = {
      kind: "box",
      props: {
        border: "none",
        width: 4,
        height: 2,
        m: 1,
        mx: 2,
        my: 3,
        mt: 4,
        mr: 5,
        mb: 6,
        ml: 7,
      },
      children: Object.freeze([]),
    };
    const size = mustMeasure(box, 40, 40);
    const out = mustLayout(box, 40, 40);
    assert.deepEqual(size, { w: 16, h: 12 });
    assert.deepEqual(out.rect, { x: 7, y: 4, w: 4, h: 2 });
  });

  test("mixed margin shorthand and side override resolve deterministically", () => {
    const box: VNode = {
      kind: "box",
      props: { border: "none", width: 3, height: 1, m: "xl", mx: "sm", ml: 0 },
      children: Object.freeze([]),
    };
    const size = mustMeasure(box, 20, 20);
    const out = mustLayout(box, 20, 20);
    assert.deepEqual(size, { w: 4, h: 9 });
    assert.deepEqual(out.rect, { x: 0, y: 4, w: 3, h: 1 });
  });

  test('large spacing key margin "2xl" can clamp content area to zero', () => {
    const box: VNode = {
      kind: "box",
      props: { border: "none", width: 5, height: 2, m: "2xl" },
      children: Object.freeze([]),
    };
    const size = mustMeasure(box, 8, 6);
    const out = mustLayout(box, 8, 6);
    assert.deepEqual(size, { w: 8, h: 6 });
    assert.deepEqual(out.rect, { x: 6, y: 6, w: 0, h: 0 });
  });
});
