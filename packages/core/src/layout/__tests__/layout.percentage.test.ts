import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";
type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

type PercentageCase = Readonly<{
  name: string;
  vnode: VNode;
  maxW: number;
  maxH: number;
  axis: Axis;
  expectedRoot: Rect;
  expectedChildren: readonly Rect[];
  expectedChild0Children?: readonly Rect[];
}>;

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

const ROW_CASES: readonly PercentageCase[] = [
  {
    name: 'row main-axis "100%" consumes full width',
    vnode: ui.row({ gap: 0, width: 20, height: 6 }, [
      ui.box({ border: "none", width: "100%" }, []),
    ]),
    maxW: 20,
    maxH: 6,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 6 },
    expectedChildren: [{ x: 0, y: 0, w: 20, h: 0 }],
  },
  {
    name: 'row main-axis "0%" yields zero-width sibling',
    vnode: ui.row({ gap: 0, width: 20, height: 6 }, [
      ui.box({ border: "none", width: "0%" }, []),
      ui.box({ border: "none", width: 4 }, []),
    ]),
    maxW: 20,
    maxH: 6,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 6 },
    expectedChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 4, h: 0 },
    ],
  },
  {
    name: 'row main-axis "150%" clamps to available width',
    vnode: ui.row({ gap: 0, width: 20, height: 6 }, [
      ui.box({ border: "none", width: "150%" }, []),
    ]),
    maxW: 20,
    maxH: 6,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 6 },
    expectedChildren: [{ x: 0, y: 0, w: 20, h: 0 }],
  },
  {
    name: 'row "150%" first child can starve later fixed sibling',
    vnode: ui.row({ gap: 0, width: 20, height: 6 }, [
      ui.box({ border: "none", width: "150%" }, []),
      ui.box({ border: "none", width: 3 }, []),
    ]),
    maxW: 20,
    maxH: 6,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 6 },
    expectedChildren: [
      { x: 0, y: 0, w: 20, h: 0 },
      { x: 20, y: 0, w: 0, h: 0 },
    ],
  },
  {
    name: "row nested percentages 50% -> 50% resolve recursively",
    vnode: ui.row({ gap: 0, width: 40, height: 8 }, [
      ui.box({ border: "none", width: "50%" }, [
        ui.box({ border: "none", width: "50%" }, [ui.text("x")]),
      ]),
    ]),
    maxW: 40,
    maxH: 8,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 40, h: 8 },
    expectedChildren: [{ x: 0, y: 0, w: 20, h: 1 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 10, h: 1 }],
  },
  {
    name: "row nested 100% parent + 150% child clamps at parent content",
    vnode: ui.row({ gap: 0, width: 20, height: 8 }, [
      ui.box({ border: "none", width: "100%" }, [
        ui.box({ border: "none", width: "150%" }, [ui.text("x")]),
      ]),
    ]),
    maxW: 20,
    maxH: 8,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 8 },
    expectedChildren: [{ x: 0, y: 0, w: 20, h: 1 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 20, h: 1 }],
  },
  {
    name: "row cross-axis 50% height triggers parent fill-cross behavior",
    vnode: ui.row({ gap: 0, width: 20 }, [ui.box({ border: "none", width: 4, height: "50%" }, [])]),
    maxW: 20,
    maxH: 10,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 10 },
    expectedChildren: [{ x: 0, y: 0, w: 4, h: 5 }],
  },
  {
    name: 'row cross-axis "0%" height resolves to zero',
    vnode: ui.row({ gap: 0, width: 20, height: 10 }, [
      ui.box({ border: "none", width: 4, height: "0%" }, []),
    ]),
    maxW: 20,
    maxH: 10,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 10 },
    expectedChildren: [{ x: 0, y: 0, w: 4, h: 0 }],
  },
  {
    name: 'row cross-axis "150%" height clamps to container height',
    vnode: ui.row({ gap: 0, width: 20, height: 10 }, [
      ui.box({ border: "none", width: 4, height: "150%" }, []),
    ]),
    maxW: 20,
    maxH: 10,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 10 },
    expectedChildren: [{ x: 0, y: 0, w: 4, h: 10 }],
  },
  {
    name: "row percentage sizing subtracts total gap before allocation",
    vnode: ui.row({ width: 21, height: 5, gap: 2 }, [
      ui.box({ border: "none", width: "50%" }, []),
      ui.box({ border: "none", width: "50%" }, []),
    ]),
    maxW: 21,
    maxH: 5,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 21, h: 5 },
    expectedChildren: [
      { x: 0, y: 0, w: 10, h: 0 },
      { x: 12, y: 0, w: 9, h: 0 },
    ],
  },
  {
    name: "row percent + flex ordering is stable",
    vnode: ui.row({ gap: 0, width: 20, height: 5 }, [
      ui.box({ border: "none", width: "25%" }, []),
      ui.box({ border: "none", flex: 1 }, []),
      ui.box({ border: "none", width: "25%" }, []),
      ui.box({ border: "none", flex: 3 }, []),
    ]),
    maxW: 20,
    maxH: 5,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 20, h: 5 },
    expectedChildren: [
      { x: 0, y: 0, w: 5, h: 0 },
      { x: 5, y: 0, w: 3, h: 0 },
      { x: 8, y: 0, w: 5, h: 0 },
      { x: 13, y: 0, w: 7, h: 0 },
    ],
  },
  {
    name: "row near-full percentages distribute remainder deterministically",
    vnode: ui.row({ gap: 0, width: 100, height: 4 }, [
      ui.box({ border: "none", width: "33%" }, []),
      ui.box({ border: "none", width: "33%" }, []),
      ui.box({ border: "none", width: "33%" }, []),
    ]),
    maxW: 100,
    maxH: 4,
    axis: "row",
    expectedRoot: { x: 0, y: 0, w: 100, h: 4 },
    expectedChildren: [
      { x: 0, y: 0, w: 34, h: 0 },
      { x: 34, y: 0, w: 33, h: 0 },
      { x: 67, y: 0, w: 33, h: 0 },
    ],
  },
] as const;

const COLUMN_CASES: readonly PercentageCase[] = [
  {
    name: 'column main-axis "100%" consumes full height',
    vnode: ui.column({ gap: 0, height: 20, width: 6 }, [
      ui.box({ border: "none", height: "100%" }, []),
    ]),
    maxW: 6,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 6, h: 20 },
    expectedChildren: [{ x: 0, y: 0, w: 0, h: 20 }],
  },
  {
    name: 'column main-axis "0%" yields zero-height sibling',
    vnode: ui.column({ gap: 0, height: 20, width: 6 }, [
      ui.box({ border: "none", height: "0%" }, []),
      ui.box({ border: "none", height: 4 }, []),
    ]),
    maxW: 6,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 6, h: 20 },
    expectedChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 4 },
    ],
  },
  {
    name: 'column main-axis "150%" clamps to available height',
    vnode: ui.column({ gap: 0, height: 20, width: 6 }, [
      ui.box({ border: "none", height: "150%" }, []),
    ]),
    maxW: 6,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 6, h: 20 },
    expectedChildren: [{ x: 0, y: 0, w: 0, h: 20 }],
  },
  {
    name: 'column "150%" first child can starve later fixed sibling',
    vnode: ui.column({ gap: 0, height: 20, width: 6 }, [
      ui.box({ border: "none", height: "150%" }, []),
      ui.box({ border: "none", height: 3 }, []),
    ]),
    maxW: 6,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 6, h: 20 },
    expectedChildren: [
      { x: 0, y: 0, w: 0, h: 20 },
      { x: 0, y: 20, w: 0, h: 0 },
    ],
  },
  {
    name: "column nested percentages 50% -> 50% resolve recursively",
    vnode: ui.column({ gap: 0, height: 40, width: 8 }, [
      ui.box({ border: "none", height: "50%" }, [
        ui.box({ border: "none", height: "50%" }, [ui.text("x")]),
      ]),
    ]),
    maxW: 8,
    maxH: 40,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 8, h: 40 },
    expectedChildren: [{ x: 0, y: 0, w: 1, h: 20 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 1, h: 10 }],
  },
  {
    name: "column nested 100% parent + 150% child clamps at parent content",
    vnode: ui.column({ gap: 0, height: 20, width: 8 }, [
      ui.box({ border: "none", height: "100%" }, [
        ui.box({ border: "none", height: "150%" }, [ui.text("x")]),
      ]),
    ]),
    maxW: 8,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 8, h: 20 },
    expectedChildren: [{ x: 0, y: 0, w: 1, h: 20 }],
    expectedChild0Children: [{ x: 0, y: 0, w: 1, h: 20 }],
  },
  {
    name: "column cross-axis 50% width triggers parent fill-cross behavior",
    vnode: ui.column({ gap: 0, height: 20 }, [
      ui.box({ border: "none", height: 4, width: "50%" }, []),
    ]),
    maxW: 10,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 10, h: 20 },
    expectedChildren: [{ x: 0, y: 0, w: 5, h: 4 }],
  },
  {
    name: 'column cross-axis "0%" width resolves to zero',
    vnode: ui.column({ gap: 0, height: 20, width: 10 }, [
      ui.box({ border: "none", height: 4, width: "0%" }, []),
    ]),
    maxW: 10,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 10, h: 20 },
    expectedChildren: [{ x: 0, y: 0, w: 0, h: 4 }],
  },
  {
    name: 'column cross-axis "150%" width clamps to container width',
    vnode: ui.column({ gap: 0, height: 20, width: 10 }, [
      ui.box({ border: "none", height: 4, width: "150%" }, []),
    ]),
    maxW: 10,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 10, h: 20 },
    expectedChildren: [{ x: 0, y: 0, w: 10, h: 4 }],
  },
  {
    name: "column percentage sizing subtracts total gap before allocation",
    vnode: ui.column({ height: 21, width: 5, gap: 2 }, [
      ui.box({ border: "none", height: "50%" }, []),
      ui.box({ border: "none", height: "50%" }, []),
    ]),
    maxW: 5,
    maxH: 21,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 5, h: 21 },
    expectedChildren: [
      { x: 0, y: 0, w: 0, h: 10 },
      { x: 0, y: 12, w: 0, h: 9 },
    ],
  },
  {
    name: "column percent + flex ordering is stable",
    vnode: ui.column({ gap: 0, height: 20, width: 5 }, [
      ui.box({ border: "none", height: "25%" }, []),
      ui.box({ border: "none", flex: 1 }, []),
      ui.box({ border: "none", height: "25%" }, []),
      ui.box({ border: "none", flex: 3 }, []),
    ]),
    maxW: 5,
    maxH: 20,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 5, h: 20 },
    expectedChildren: [
      { x: 0, y: 0, w: 0, h: 5 },
      { x: 0, y: 5, w: 0, h: 3 },
      { x: 0, y: 8, w: 0, h: 5 },
      { x: 0, y: 13, w: 0, h: 7 },
    ],
  },
  {
    name: "column near-full percentages distribute remainder deterministically",
    vnode: ui.column({ gap: 0, height: 100, width: 4 }, [
      ui.box({ border: "none", height: "33%" }, []),
      ui.box({ border: "none", height: "33%" }, []),
      ui.box({ border: "none", height: "33%" }, []),
    ]),
    maxW: 4,
    maxH: 100,
    axis: "column",
    expectedRoot: { x: 0, y: 0, w: 4, h: 100 },
    expectedChildren: [
      { x: 0, y: 0, w: 0, h: 34 },
      { x: 0, y: 34, w: 0, h: 33 },
      { x: 0, y: 67, w: 0, h: 33 },
    ],
  },
] as const;

describe("layout percentages (deterministic)", () => {
  for (const c of ROW_CASES) {
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

  for (const c of COLUMN_CASES) {
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

  test('"full" width on row remains width-constrained inside column parent', () => {
    const tree = mustLayout(
      ui.column({ width: 20, height: 10 }, [
        ui.row({ width: "full" }, [ui.box({ border: "none", width: 1, height: 1 }, [])]),
        ui.box({ border: "none", height: 2 }, []),
      ]),
      20,
      10,
      "column",
    );
    assert.equal(tree.children[0]?.rect.w, 20);
    assert.equal(tree.children[0]?.rect.h, 1);
  });

  test('"full" height on column remains height-constrained inside row parent', () => {
    const tree = mustLayout(
      ui.row({ width: 20, height: 10 }, [
        ui.column({ height: "full" }, [ui.box({ border: "none", width: 1, height: 1 }, [])]),
        ui.box({ border: "none", width: 2 }, []),
      ]),
      20,
      10,
      "row",
    );
    assert.equal(tree.children[0]?.rect.h, 10);
    assert.equal(tree.children[0]?.rect.w, 1);
  });
});
