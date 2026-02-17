import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import type { LayoutTree } from "../layout.js";
import { layout } from "../layout.js";
import type { Axis } from "../types.js";

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis = "column"): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, axis);
  assert.equal(res.ok, true, "layout should succeed");
  if (!res.ok) {
    throw new Error("layout failed");
  }
  return res.value;
}

describe("layout aspect-ratio (deterministic)", () => {
  test("width -> height derives via aspectRatio", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 8, aspectRatio: 2 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 4 });
  });

  test("height -> width derives via aspectRatio", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", height: 6, aspectRatio: 2 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 12, h: 6 });
  });

  test("both width and height take precedence over aspectRatio", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 10, height: 3, aspectRatio: 2 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 10, h: 3 });
  });

  test("derived height uses floor rounding", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 7, aspectRatio: 2 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 7, h: 3 });
  });

  test("percent width with aspectRatio resolves against parent width", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: "50%", aspectRatio: 2 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 15, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 7, h: 3 });
  });

  test("percent height with aspectRatio resolves against parent height", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", height: "25%", aspectRatio: 2 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 20, 13);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 3 });
  });

  test("minHeight clamp applies after width -> height derivation", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 8, aspectRatio: 2, minHeight: 5 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 5 });
  });

  test("maxHeight clamp applies after width -> height derivation", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", width: 20, aspectRatio: 2, maxHeight: 6 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 20, h: 6 });
  });

  test("minWidth clamp applies after height -> width derivation", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", height: 4, aspectRatio: 2, minWidth: 10 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 10, h: 4 });
  });

  test("maxWidth clamp applies after height -> width derivation", () => {
    const node: VNode = {
      kind: "box",
      props: { border: "none", height: 10, aspectRatio: 2, maxWidth: 15 },
      children: Object.freeze([]),
    };
    const out = mustLayout(node, 30, 20);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 15, h: 10 });
  });

  test("row flex context respects aspect-derived fixed width", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", height: 4, aspectRatio: 2 },
          children: Object.freeze([]),
        },
        { kind: "box", props: { border: "none", flex: 1 }, children: Object.freeze([]) },
      ]),
    };
    const out = mustLayout(row, 20, 6, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 20, h: 4 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 8, h: 4 });
    assert.deepEqual(out.children[1]?.rect, { x: 8, y: 0, w: 12, h: 0 });
  });

  test("column flex context respects aspect-derived fixed height", () => {
    const column: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([
        {
          kind: "box",
          props: { border: "none", width: 6, aspectRatio: 2 },
          children: Object.freeze([]),
        },
        { kind: "box", props: { border: "none", flex: 1 }, children: Object.freeze([]) },
      ]),
    };
    const out = mustLayout(column, 8, 12, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 12 });
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 6, h: 3 });
    assert.deepEqual(out.children[1]?.rect, { x: 0, y: 3, w: 0, h: 9 });
  });
});
