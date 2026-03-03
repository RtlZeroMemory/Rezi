import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";
type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

type AutoCase = Readonly<{
  name: string;
  vnode: VNode;
  axis: Axis;
  maxW: number;
  maxH: number;
  expectedRoot: Rect;
  expectedChildren: readonly Rect[];
  expectedChild0Children?: readonly Rect[];
}>;

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutTree {
  // Keep this test at the layout() layer so intrinsic sizing assertions are engine-only.
  const res = layout(node, 0, 0, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

const CASES: readonly AutoCase[] = [
  {
    name: 'row width:"auto" shrinks to text content + gap',
    vnode: ui.row({ width: "auto", gap: 1 }, [ui.text("abc"), ui.text("de")]),
    axis: "row",
    maxW: 50,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 6, h: 1 },
    expectedChildren: [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 4, y: 0, w: 2, h: 1 },
    ],
  },
  {
    name: 'column height:"auto" shrinks to text content + gap',
    vnode: ui.column({ height: "auto", gap: 1 }, [ui.text("abc"), ui.text("de")]),
    axis: "column",
    maxW: 50,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 3, h: 3 },
    expectedChildren: [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
    ],
  },
  {
    name: 'box width/height:"auto" sizes to child content',
    vnode: ui.box({ border: "none", width: "auto", height: "auto" }, [ui.text("hello")]),
    axis: "column",
    maxW: 50,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 5, h: 1 },
    expectedChildren: [{ x: 0, y: 0, w: 5, h: 1 }],
  },
  {
    name: "auto box includes padding in intrinsic size",
    vnode: ui.box({ border: "none", width: "auto", height: "auto", p: 2 }, [ui.text("hello")]),
    axis: "column",
    maxW: 50,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 9, h: 5 },
    expectedChildren: [{ x: 2, y: 2, w: 5, h: 1 }],
  },
  {
    name: "row auto child without flex does not join flex distribution",
    vnode: ui.row({ width: 20, height: 4, gap: 1 }, [
      ui.box({ border: "none", width: "auto" }, [ui.text("abcd")]),
      ui.box({ border: "none", flex: 1 }, []),
    ]),
    axis: "row",
    maxW: 20,
    maxH: 4,
    expectedRoot: { x: 0, y: 0, w: 20, h: 4 },
    expectedChildren: [
      { x: 0, y: 0, w: 4, h: 1 },
      { x: 5, y: 0, w: 15, h: 0 },
    ],
    expectedChild0Children: [{ x: 0, y: 0, w: 4, h: 1 }],
  },
  {
    name: "row auto child with flex participates in distribution",
    vnode: ui.row({ width: 20, height: 4, gap: 1 }, [
      ui.box({ border: "none", width: "auto", flex: 1 }, [ui.text("abcd")]),
      ui.box({ border: "none", flex: 1 }, []),
    ]),
    axis: "row",
    maxW: 20,
    maxH: 4,
    expectedRoot: { x: 0, y: 0, w: 20, h: 4 },
    expectedChildren: [
      { x: 0, y: 0, w: 10, h: 1 },
      { x: 11, y: 0, w: 9, h: 0 },
    ],
    expectedChild0Children: [{ x: 0, y: 0, w: 4, h: 1 }],
  },
  {
    name: "row auto child respects maxWidth before flex remainder",
    vnode: ui.row({ width: 20, height: 4, gap: 1 }, [
      ui.box({ border: "none", width: "auto", maxWidth: 2 }, [ui.text("abcdef")]),
      ui.box({ border: "none", flex: 1 }, []),
    ]),
    axis: "row",
    maxW: 20,
    maxH: 4,
    expectedRoot: { x: 0, y: 0, w: 20, h: 4 },
    expectedChildren: [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 3, y: 0, w: 17, h: 0 },
    ],
    expectedChild0Children: [{ x: 0, y: 0, w: 2, h: 1 }],
  },
  {
    name: "row auto child respects minWidth before flex remainder",
    vnode: ui.row({ width: 20, height: 4, gap: 1 }, [
      ui.box({ border: "none", width: "auto", minWidth: 6 }, [ui.text("ab")]),
      ui.box({ border: "none", flex: 1 }, []),
    ]),
    axis: "row",
    maxW: 20,
    maxH: 4,
    expectedRoot: { x: 0, y: 0, w: 20, h: 4 },
    expectedChildren: [
      { x: 0, y: 0, w: 6, h: 1 },
      { x: 7, y: 0, w: 13, h: 0 },
    ],
    expectedChild0Children: [{ x: 0, y: 0, w: 2, h: 1 }],
  },
  {
    name: "column auto child without flex does not join flex distribution",
    vnode: ui.column({ width: 12, height: 12, gap: 1 }, [
      ui.box({ border: "none", height: "auto" }, [ui.text("x")]),
      ui.box({ border: "none", flex: 1 }, []),
    ]),
    axis: "column",
    maxW: 12,
    maxH: 12,
    expectedRoot: { x: 0, y: 0, w: 12, h: 12 },
    expectedChildren: [
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 2, w: 0, h: 10 },
    ],
    expectedChild0Children: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  {
    name: "column auto child with flex participates in distribution",
    vnode: ui.column({ width: 12, height: 12, gap: 1 }, [
      ui.box({ border: "none", height: "auto", flex: 1 }, [ui.text("x")]),
      ui.box({ border: "none", flex: 1 }, []),
    ]),
    axis: "column",
    maxW: 12,
    maxH: 12,
    expectedRoot: { x: 0, y: 0, w: 12, h: 12 },
    expectedChildren: [
      { x: 0, y: 0, w: 1, h: 6 },
      { x: 0, y: 7, w: 0, h: 5 },
    ],
    expectedChild0Children: [{ x: 0, y: 0, w: 1, h: 1 }],
  },
  {
    name: "auto row without cross-axis percent keeps intrinsic height",
    vnode: ui.row({ width: "auto" }, [ui.box({ border: "none", width: "auto" }, [ui.text("xx")])]),
    axis: "row",
    maxW: 10,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 2, h: 1 },
    expectedChildren: [{ x: 0, y: 0, w: 2, h: 1 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 2, h: 1 }],
  },
  {
    name: "auto row with cross-axis full fills available height",
    vnode: ui.row({ width: "auto" }, [
      ui.box({ border: "none", width: "auto", height: "full" }, [ui.text("xx")]),
    ]),
    axis: "row",
    maxW: 10,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 2, h: 10 },
    expectedChildren: [{ x: 0, y: 0, w: 2, h: 10 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 2, h: 1 }],
  },
  {
    name: "auto column without cross-axis percent keeps intrinsic width",
    vnode: ui.column({ height: "auto" }, [
      ui.box({ border: "none", height: "auto" }, [ui.text("xx")]),
    ]),
    axis: "column",
    maxW: 10,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 2, h: 1 },
    expectedChildren: [{ x: 0, y: 0, w: 2, h: 1 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 2, h: 1 }],
  },
  {
    name: "auto column with cross-axis full fills available width",
    vnode: ui.column({ height: "auto" }, [
      ui.box({ border: "none", height: "auto", width: "full" }, [ui.text("xx")]),
    ]),
    axis: "column",
    maxW: 10,
    maxH: 10,
    expectedRoot: { x: 0, y: 0, w: 10, h: 1 },
    expectedChildren: [{ x: 0, y: 0, w: 10, h: 1 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 2, h: 1 }],
  },
] as const;

describe("layout auto sizing (deterministic)", () => {
  for (const c of CASES) {
    test(c.name, () => {
      const tree = mustLayout(c.vnode, c.maxW, c.maxH, c.axis);
      assert.deepEqual(tree.rect, c.expectedRoot);
      assert.deepEqual(
        tree.children.map((child) => child.rect),
        c.expectedChildren,
      );
      if (c.expectedChild0Children !== undefined) {
        assert.deepEqual(
          tree.children[0]?.children.map((child) => child.rect),
          c.expectedChild0Children,
        );
      }
    });
  }

  test("auto row intrinsic sizing ignores absolute children", () => {
    const tree = mustLayout(
      ui.row({ width: "auto", gap: 0 }, [
        ui.box({ border: "none", width: 10, height: 1 }, []),
        ui.box(
          { border: "none", position: "absolute", top: 0, left: 0, width: 200, height: 1 },
          [],
        ),
      ]),
      500,
      20,
      "row",
    );
    assert.equal(tree.rect.w, 10);
  });
});
