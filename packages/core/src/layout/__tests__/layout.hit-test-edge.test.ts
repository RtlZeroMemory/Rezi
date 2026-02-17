import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { hitTestFocusable } from "../hitTest.js";
import type { LayoutTree } from "../layout.js";
import type { Rect } from "../types.js";

function buttonNode(id: string): VNode {
  return { kind: "button", props: { id, label: id } } as unknown as VNode;
}

function containerNode(children: readonly VNode[]): VNode {
  return {
    kind: "column",
    props: {},
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function layoutNode(vnode: VNode, rect: Rect, children: readonly LayoutTree[] = []): LayoutTree {
  return {
    vnode,
    rect,
    children: Object.freeze([...children]),
  };
}

describe("hit test edge behavior", () => {
  test("nested clip intersections allow hits inside the final intersection", () => {
    const leaf = buttonNode("btn");
    const parent = containerNode([leaf]);
    const root = containerNode([parent]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 8, h: 4 }, [
      layoutNode(parent, { x: 6, y: 0, w: 6, h: 4 }, [
        layoutNode(leaf, { x: 7, y: 1, w: 4, h: 2 }),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 7, 1), "btn");
  });

  test("nested clip intersections exclude overflow outside combined clip", () => {
    const leaf = buttonNode("btn");
    const parent = containerNode([leaf]);
    const root = containerNode([parent]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 8, h: 4 }, [
      layoutNode(parent, { x: 6, y: 0, w: 6, h: 4 }, [
        layoutNode(leaf, { x: 7, y: 1, w: 4, h: 2 }),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 8, 1), null);
  });

  test("triple-nested clip intersection still hits at one-cell overlap", () => {
    const leaf = buttonNode("deep");
    const midB = containerNode([leaf]);
    const midA = containerNode([midB]);
    const root = containerNode([midA]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 10, h: 5 }, [
      layoutNode(midA, { x: 2, y: 0, w: 8, h: 5 }, [
        layoutNode(midB, { x: 5, y: 0, w: 6, h: 5 }, [
          layoutNode(leaf, { x: 9, y: 2, w: 4, h: 1 }),
        ]),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 9, 2), "deep");
  });

  test("triple-nested clip excludes points just outside overlap", () => {
    const leaf = buttonNode("deep");
    const midB = containerNode([leaf]);
    const midA = containerNode([midB]);
    const root = containerNode([midA]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 10, h: 5 }, [
      layoutNode(midA, { x: 2, y: 0, w: 8, h: 5 }, [
        layoutNode(midB, { x: 5, y: 0, w: 6, h: 5 }, [
          layoutNode(leaf, { x: 9, y: 2, w: 4, h: 1 }),
        ]),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 10, 2), null);
  });

  test("left and top boundaries are inclusive", () => {
    const leaf = buttonNode("edge");
    const root = containerNode([leaf]);
    const tree = layoutNode(root, { x: 0, y: 0, w: 20, h: 10 }, [
      layoutNode(leaf, { x: 3, y: 4, w: 5, h: 2 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 3, 4), "edge");
  });

  test("right boundary is exclusive", () => {
    const leaf = buttonNode("edge");
    const root = containerNode([leaf]);
    const tree = layoutNode(root, { x: 0, y: 0, w: 20, h: 10 }, [
      layoutNode(leaf, { x: 3, y: 4, w: 5, h: 2 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 8, 4), null);
  });

  test("bottom boundary is exclusive", () => {
    const leaf = buttonNode("edge");
    const root = containerNode([leaf]);
    const tree = layoutNode(root, { x: 0, y: 0, w: 20, h: 10 }, [
      layoutNode(leaf, { x: 3, y: 4, w: 5, h: 2 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 3, 6), null);
  });

  test("empty root clip produces no hits", () => {
    const leaf = buttonNode("zero");
    const root = containerNode([leaf]);
    const tree = layoutNode(root, { x: 0, y: 0, w: 0, h: 5 }, [
      layoutNode(leaf, { x: 0, y: 0, w: 3, h: 1 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 0, 0), null);
  });

  test("empty clip from ancestor intersection produces no hits", () => {
    const leaf = buttonNode("zero");
    const parent = containerNode([leaf]);
    const root = containerNode([parent]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 5, h: 2 }, [
      layoutNode(parent, { x: 0, y: 2, w: 5, h: 2 }, [
        layoutNode(leaf, { x: 0, y: 2, w: 3, h: 1 }),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 0, 2), null);
  });

  test("deep nesting still resolves hits deterministically", () => {
    const leaf = buttonNode("deep-leaf");
    const n5 = containerNode([leaf]);
    const n4 = containerNode([n5]);
    const n3 = containerNode([n4]);
    const n2 = containerNode([n3]);
    const n1 = containerNode([n2]);
    const root = containerNode([n1]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 20, h: 20 }, [
      layoutNode(n1, { x: 1, y: 1, w: 18, h: 18 }, [
        layoutNode(n2, { x: 2, y: 2, w: 16, h: 16 }, [
          layoutNode(n3, { x: 3, y: 3, w: 14, h: 14 }, [
            layoutNode(n4, { x: 4, y: 4, w: 12, h: 12 }, [
              layoutNode(n5, { x: 5, y: 5, w: 10, h: 10 }, [
                layoutNode(leaf, { x: 6, y: 6, w: 3, h: 1 }),
              ]),
            ]),
          ]),
        ]),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 6, 6), "deep-leaf");
  });

  test("deep nesting returns null when an inner ancestor clips away the point", () => {
    const leaf = buttonNode("deep-leaf");
    const n3 = containerNode([leaf]);
    const n2 = containerNode([n3]);
    const n1 = containerNode([n2]);
    const root = containerNode([n1]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 20, h: 20 }, [
      layoutNode(n1, { x: 1, y: 1, w: 18, h: 18 }, [
        layoutNode(n2, { x: 2, y: 2, w: 4, h: 4 }, [
          layoutNode(n3, { x: 10, y: 10, w: 3, h: 3 }, [
            layoutNode(leaf, { x: 10, y: 10, w: 3, h: 1 }),
          ]),
        ]),
      ]),
    ]);

    assert.equal(hitTestFocusable(root, tree, 10, 10), null);
  });

  test("later overlapping sibling wins within clipped bounds", () => {
    const first = buttonNode("first");
    const second = buttonNode("second");
    const root = containerNode([first, second]);

    const tree = layoutNode(root, { x: 0, y: 0, w: 6, h: 2 }, [
      layoutNode(first, { x: 1, y: 0, w: 4, h: 1 }),
      layoutNode(second, { x: 2, y: 0, w: 4, h: 1 }),
    ]);

    assert.equal(hitTestFocusable(root, tree, 2, 0), "second");
  });
});
