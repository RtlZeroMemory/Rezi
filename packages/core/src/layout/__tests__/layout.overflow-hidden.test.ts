import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { hitTestFocusable } from "../hitTest.js";
import type { LayoutTree } from "../layout.js";
import { layout } from "../layout.js";
import type { Rect } from "../types.js";

type Axis = "row" | "column";

type OverflowMeta = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

function mustLayout(vnode: VNode, maxW: number, maxH: number, axis: Axis): LayoutTree {
  const out = layout(vnode, 0, 0, maxW, maxH, axis);
  if (!out.ok) {
    assert.fail(`layout failed: ${out.fatal.code}: ${out.fatal.detail}`);
  }
  return out.value;
}

function layoutNode(
  vnode: VNode,
  rect: Rect,
  children: readonly LayoutTree[] = [],
  meta?: OverflowMeta,
): LayoutTree {
  if (meta === undefined) {
    return {
      vnode,
      rect,
      children: Object.freeze([...children]),
    };
  }
  return {
    vnode,
    rect,
    children: Object.freeze([...children]),
    meta,
  };
}

const IMPOSSIBLE_SCROLL_META: OverflowMeta = Object.freeze({
  scrollX: 999,
  scrollY: 999,
  contentWidth: 999,
  contentHeight: 999,
  viewportWidth: 0,
  viewportHeight: 0,
});

describe("layout overflow:hidden (deterministic)", () => {
  describe("clipping in hidden containers", () => {
    test("hidden row clips right-side child overflow", () => {
      const button = ui.button({ id: "clip-row", label: "clip-row" });
      const root = ui.row({ overflow: "hidden" }, [button]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 4, h: 1 }, [
        layoutNode(button, { x: 0, y: 0, w: 8, h: 1 }),
      ]);

      assert.equal(hitTestFocusable(root, tree, 1, 0), "clip-row");
      assert.equal(hitTestFocusable(root, tree, 4, 0), null);
    });

    test("hidden column clips bottom-side child overflow", () => {
      const button = ui.button({ id: "clip-column", label: "clip-column" });
      const root = ui.column({ overflow: "hidden" }, [button]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 3, h: 2 }, [
        layoutNode(button, { x: 0, y: 0, w: 3, h: 4 }),
      ]);

      assert.equal(hitTestFocusable(root, tree, 1, 1), "clip-column");
      assert.equal(hitTestFocusable(root, tree, 1, 2), null);
    });

    test("hidden box clips child overflow that starts left of the box rect", () => {
      const button = ui.button({ id: "clip-box-left", label: "clip-box-left" });
      const root = ui.box({ border: "none", overflow: "hidden" }, [button]);
      const tree = layoutNode(root, { x: 2, y: 0, w: 4, h: 1 }, [
        layoutNode(button, { x: 0, y: 0, w: 6, h: 1 }),
      ]);

      assert.equal(hitTestFocusable(root, tree, 2, 0), "clip-box-left");
      assert.equal(hitTestFocusable(root, tree, 1, 0), null);
    });

    test("hidden box border clips descendants to the inner content rect", () => {
      const button = ui.button({ id: "clip-box-border", label: "clip-box-border" });
      const root = ui.box({ border: "single", overflow: "hidden" }, [button]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 6, h: 3 }, [
        layoutNode(button, { x: 1, y: 1, w: 8, h: 1 }),
      ]);

      assert.equal(hitTestFocusable(root, tree, 4, 1), "clip-box-border");
      assert.equal(hitTestFocusable(root, tree, 5, 1), null);
    });

    test("hidden box padding clips descendants to padded content", () => {
      const button = ui.button({ id: "clip-box-padding", label: "clip-box-padding" });
      const root = ui.box({ border: "none", p: 1, overflow: "hidden" }, [button]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 6, h: 3 }, [
        layoutNode(button, { x: 0, y: 1, w: 6, h: 1 }),
      ]);

      assert.equal(hitTestFocusable(root, tree, 1, 1), "clip-box-padding");
      assert.equal(hitTestFocusable(root, tree, 0, 1), null);
      assert.equal(hitTestFocusable(root, tree, 5, 1), null);
    });
  });

  describe("no scrollbar metadata reliance", () => {
    test("hidden row ignores impossible scroll metadata", () => {
      const button = ui.button({ id: "hidden-row-meta", label: "hidden-row-meta" });
      const root = ui.row({ overflow: "hidden" }, [button]);
      const tree = layoutNode(
        root,
        { x: 0, y: 0, w: 5, h: 1 },
        [layoutNode(button, { x: 0, y: 0, w: 8, h: 1 })],
        IMPOSSIBLE_SCROLL_META,
      );

      assert.equal(hitTestFocusable(root, tree, 1, 0), "hidden-row-meta");
      assert.equal(hitTestFocusable(root, tree, 5, 0), null);
    });

    test("hidden box ignores impossible scroll metadata and still uses content clipping", () => {
      const button = ui.button({ id: "hidden-box-meta", label: "hidden-box-meta" });
      const root = ui.box({ border: "none", p: 1, overflow: "hidden" }, [button]);
      const tree = layoutNode(
        root,
        { x: 0, y: 0, w: 7, h: 3 },
        [layoutNode(button, { x: 1, y: 1, w: 6, h: 1 })],
        IMPOSSIBLE_SCROLL_META,
      );

      assert.equal(hitTestFocusable(root, tree, 2, 1), "hidden-box-meta");
      assert.equal(hitTestFocusable(root, tree, 0, 1), null);
    });

    test("hidden column still clips deterministically when metadata is absent", () => {
      const button = ui.button({ id: "hidden-column-no-meta", label: "hidden-column-no-meta" });
      const root = ui.column({ overflow: "hidden" }, [button]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 3, h: 2 }, [
        layoutNode(button, { x: 0, y: 0, w: 3, h: 4 }),
      ]);

      assert.equal(hitTestFocusable(root, tree, 1, 1), "hidden-column-no-meta");
      assert.equal(hitTestFocusable(root, tree, 1, 2), null);
    });
  });

  describe("nested hidden clip intersections", () => {
    test("two-level hidden intersection allows hits in overlap", () => {
      const leaf = ui.button({ id: "nested-two", label: "nested-two" });
      const mid = ui.column({ overflow: "hidden" }, [leaf]);
      const root = ui.row({ overflow: "hidden" }, [mid]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 8, h: 3 }, [
        layoutNode(mid, { x: 6, y: 0, w: 6, h: 3 }, [layoutNode(leaf, { x: 7, y: 1, w: 4, h: 1 })]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 7, 1), "nested-two");
    });

    test("two-level hidden intersection rejects points outside overlap", () => {
      const leaf = ui.button({ id: "nested-two", label: "nested-two" });
      const mid = ui.column({ overflow: "hidden" }, [leaf]);
      const root = ui.row({ overflow: "hidden" }, [mid]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 8, h: 3 }, [
        layoutNode(mid, { x: 6, y: 0, w: 6, h: 3 }, [layoutNode(leaf, { x: 7, y: 1, w: 4, h: 1 })]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 8, 1), null);
    });

    test("triple hidden intersection keeps one-cell overlap hit-testable", () => {
      const leaf = ui.button({ id: "nested-three", label: "nested-three" });
      const midB = ui.box({ border: "none", overflow: "hidden" }, [leaf]);
      const midA = ui.column({ overflow: "hidden" }, [midB]);
      const root = ui.row({ overflow: "hidden" }, [midA]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 10, h: 4 }, [
        layoutNode(midA, { x: 2, y: 0, w: 8, h: 4 }, [
          layoutNode(midB, { x: 5, y: 0, w: 6, h: 4 }, [
            layoutNode(leaf, { x: 9, y: 2, w: 4, h: 1 }),
          ]),
        ]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 9, 2), "nested-three");
    });

    test("triple hidden intersection excludes adjacent cell outside overlap", () => {
      const leaf = ui.button({ id: "nested-three", label: "nested-three" });
      const midB = ui.box({ border: "none", overflow: "hidden" }, [leaf]);
      const midA = ui.column({ overflow: "hidden" }, [midB]);
      const root = ui.row({ overflow: "hidden" }, [midA]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 10, h: 4 }, [
        layoutNode(midA, { x: 2, y: 0, w: 8, h: 4 }, [
          layoutNode(midB, { x: 5, y: 0, w: 6, h: 4 }, [
            layoutNode(leaf, { x: 9, y: 2, w: 4, h: 1 }),
          ]),
        ]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 10, 2), null);
    });
  });

  describe("zero-size hidden container behavior", () => {
    test("hidden row with width=0 is never hit-testable", () => {
      const root = ui.row({ overflow: "hidden", width: 0 }, [ui.button({ id: "zero-row", label: "zero-row" })]);
      const tree = mustLayout(root, 0, 3, "row");

      assert.equal(tree.rect.w, 0);
      assert.equal(hitTestFocusable(root, tree, 0, 0), null);
      assert.equal(tree.children[0]?.rect.w, 0);
    });

    test("hidden column with height=0 is never hit-testable", () => {
      const root = ui.column({ overflow: "hidden", height: 0 }, [
        ui.button({ id: "zero-col", label: "zero-col" }),
      ]);
      const tree = mustLayout(root, 8, 0, "column");

      assert.equal(tree.rect.h, 0);
      assert.equal(hitTestFocusable(root, tree, 0, 0), null);
      assert.equal(tree.children[0]?.rect.h, 0);
    });

    test("hidden box with explicit width/height=0 clips out descendants", () => {
      const root = ui.box({ border: "none", overflow: "hidden", width: 0, height: 0 }, [
        ui.button({ id: "zero-box", label: "zero-box" }),
      ]);
      const tree = mustLayout(root, 10, 10, "column");

      assert.deepEqual(tree.rect, { x: 0, y: 0, w: 0, h: 0 });
      assert.equal(hitTestFocusable(root, tree, 0, 0), null);
    });
  });

  describe("mixed row/column/box hidden layouts", () => {
    test("mixed hidden containers allow hits inside final clipped intersection", () => {
      const leaf = ui.button({ id: "mixed-visible", label: "mixed-visible" });
      const box = ui.box({ border: "none", p: 1, overflow: "hidden" }, [leaf]);
      const column = ui.column({ p: 1, overflow: "hidden" }, [box]);
      const root = ui.row({ p: 1, overflow: "hidden" }, [column]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 12, h: 5 }, [
        layoutNode(column, { x: 1, y: 1, w: 10, h: 4 }, [
          layoutNode(box, { x: 2, y: 2, w: 8, h: 3 }, [
            layoutNode(leaf, { x: 3, y: 3, w: 8, h: 1 }),
          ]),
        ]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 3, 3), "mixed-visible");
    });

    test("mixed hidden containers reject horizontal overflow outside final clip", () => {
      const leaf = ui.button({ id: "mixed-visible", label: "mixed-visible" });
      const box = ui.box({ border: "none", p: 1, overflow: "hidden" }, [leaf]);
      const column = ui.column({ p: 1, overflow: "hidden" }, [box]);
      const root = ui.row({ p: 1, overflow: "hidden" }, [column]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 12, h: 5 }, [
        layoutNode(column, { x: 1, y: 1, w: 10, h: 4 }, [
          layoutNode(box, { x: 2, y: 2, w: 8, h: 3 }, [
            layoutNode(leaf, { x: 3, y: 3, w: 8, h: 1 }),
          ]),
        ]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 9, 3), null);
    });

    test("mixed hidden containers reject vertical overflow outside final clip", () => {
      const leaf = ui.button({ id: "mixed-visible", label: "mixed-visible" });
      const box = ui.box({ border: "none", p: 1, overflow: "hidden" }, [leaf]);
      const column = ui.column({ p: 1, overflow: "hidden" }, [box]);
      const root = ui.row({ p: 1, overflow: "hidden" }, [column]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 12, h: 5 }, [
        layoutNode(column, { x: 1, y: 1, w: 10, h: 4 }, [
          layoutNode(box, { x: 2, y: 2, w: 8, h: 3 }, [
            layoutNode(leaf, { x: 3, y: 3, w: 8, h: 1 }),
          ]),
        ]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 3, 2), null);
    });

    test("mixed hidden row/column/box honors outer-row padding clip", () => {
      const leaf = ui.button({ id: "mixed-row-padding", label: "mixed-row-padding" });
      const box = ui.box({ border: "none", overflow: "hidden" }, [leaf]);
      const column = ui.column({ overflow: "hidden" }, [box]);
      const root = ui.row({ p: 1, overflow: "hidden" }, [column]);
      const tree = layoutNode(root, { x: 0, y: 0, w: 8, h: 3 }, [
        layoutNode(column, { x: 0, y: 1, w: 8, h: 2 }, [
          layoutNode(box, { x: 0, y: 1, w: 8, h: 2 }, [
            layoutNode(leaf, { x: 0, y: 1, w: 4, h: 1 }),
          ]),
        ]),
      ]);

      assert.equal(hitTestFocusable(root, tree, 1, 1), "mixed-row-padding");
      assert.equal(hitTestFocusable(root, tree, 0, 1), null);
    });
  });
});
