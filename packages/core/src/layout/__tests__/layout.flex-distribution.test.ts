import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";

type ChildSpec = Readonly<{
  flex?: number;
  main?: number | `${number}%`;
  min?: number;
  max?: number;
}>;

type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;

type FlexCase = Readonly<{
  name: string;
  main: number;
  cross: number;
  gap?: number;
  children: readonly ChildSpec[];
  expectedRowChildren: readonly Rect[];
  expectedColumnChildren: readonly Rect[];
}>;

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function buildChild(axis: Axis, spec: ChildSpec): VNode {
  const props: {
    border: "none";
    flex?: number;
    width?: number | `${number}%`;
    height?: number | `${number}%`;
    minWidth?: number;
    minHeight?: number;
    maxWidth?: number;
    maxHeight?: number;
  } = { border: "none" };

  if (spec.flex !== undefined) props.flex = spec.flex;

  if (axis === "row") {
    if (spec.main !== undefined) props.width = spec.main;
    if (spec.min !== undefined) props.minWidth = spec.min;
    if (spec.max !== undefined) props.maxWidth = spec.max;
  } else {
    if (spec.main !== undefined) props.height = spec.main;
    if (spec.min !== undefined) props.minHeight = spec.min;
    if (spec.max !== undefined) props.maxHeight = spec.max;
  }

  return ui.box(props, []);
}

function buildStack(axis: Axis, c: FlexCase): VNode {
  const props: { width?: number; height?: number; gap?: number } = {};
  if (axis === "row") {
    props.width = c.main;
    props.height = c.cross;
  } else {
    props.width = c.cross;
    props.height = c.main;
  }
  props.gap = c.gap ?? 0;

  const children = c.children.map((spec) => buildChild(axis, spec));
  return axis === "row" ? ui.row(props, children) : ui.column(props, children);
}

const CASES: readonly FlexCase[] = [
  {
    name: "flex:1 + flex:2 splits 90 as 30/60",
    main: 90,
    cross: 5,
    children: [{ flex: 1 }, { flex: 2 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 30, h: 0 },
      { x: 30, y: 0, w: 60, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 30 },
      { x: 0, y: 30, w: 0, h: 60 },
    ],
  },
  {
    name: "flex:0 child does not receive distributed space",
    main: 30,
    cross: 5,
    children: [{ flex: 0 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 30, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 0, w: 0, h: 30 },
    ],
  },
  {
    name: "fractional 1/1/1 with gap rounds deterministically",
    main: 10,
    cross: 5,
    gap: 1,
    children: [{ flex: 1 }, { flex: 1 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 3, h: 0 },
      { x: 4, y: 0, w: 3, h: 0 },
      { x: 8, y: 0, w: 2, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 3 },
      { x: 0, y: 4, w: 0, h: 3 },
      { x: 0, y: 8, w: 0, h: 2 },
    ],
  },
  {
    name: "fractional 1/2/3 in 17 => 3/6/8",
    main: 17,
    cross: 5,
    children: [{ flex: 1 }, { flex: 2 }, { flex: 3 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 3, h: 0 },
      { x: 3, y: 0, w: 6, h: 0 },
      { x: 9, y: 0, w: 8, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 3 },
      { x: 0, y: 3, w: 0, h: 6 },
      { x: 0, y: 9, w: 0, h: 8 },
    ],
  },
  {
    name: "min/max constraints override naive equal flex",
    main: 20,
    cross: 5,
    children: [{ flex: 1, min: 7 }, { flex: 1, max: 3 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 9, h: 0 },
      { x: 9, y: 0, w: 3, h: 0 },
      { x: 12, y: 0, w: 8, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 9 },
      { x: 0, y: 9, w: 0, h: 3 },
      { x: 0, y: 12, w: 0, h: 8 },
    ],
  },
  {
    name: "percent children are resolved before flex distribution",
    main: 20,
    cross: 5,
    children: [{ main: "50%" }, { flex: 1 }, { main: "25%" }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 10, h: 0 },
      { x: 10, y: 0, w: 3, h: 0 },
      { x: 13, y: 0, w: 5, h: 0 },
      { x: 18, y: 0, w: 2, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 10 },
      { x: 0, y: 10, w: 0, h: 3 },
      { x: 0, y: 13, w: 0, h: 5 },
      { x: 0, y: 18, w: 0, h: 2 },
    ],
  },
  {
    name: "gap is subtracted before flex share computation",
    main: 25,
    cross: 5,
    gap: 2,
    children: [{ flex: 1 }, { flex: 1 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 7, h: 0 },
      { x: 9, y: 0, w: 7, h: 0 },
      { x: 18, y: 0, w: 7, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 7 },
      { x: 0, y: 9, w: 0, h: 7 },
      { x: 0, y: 18, w: 0, h: 7 },
    ],
  },
  {
    name: "max caps trigger redistribution to uncapped flex siblings",
    main: 18,
    cross: 5,
    children: [{ flex: 1, max: 2 }, { flex: 1, max: 4 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 2, h: 0 },
      { x: 2, y: 0, w: 4, h: 0 },
      { x: 6, y: 0, w: 12, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 2 },
      { x: 0, y: 2, w: 0, h: 4 },
      { x: 0, y: 6, w: 0, h: 12 },
    ],
  },
  {
    name: "fixed main-size child is allocated before flex children",
    main: 19,
    cross: 5,
    gap: 1,
    children: [{ main: 4 }, { flex: 2 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 4, h: 0 },
      { x: 5, y: 0, w: 9, h: 0 },
      { x: 15, y: 0, w: 4, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 4 },
      { x: 0, y: 5, w: 0, h: 9 },
      { x: 0, y: 15, w: 0, h: 4 },
    ],
  },
  {
    name: "flex:0 with explicit fixed main-size keeps fixed value",
    main: 16,
    cross: 5,
    children: [{ main: 5, flex: 0 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 5, h: 0 },
      { x: 5, y: 0, w: 11, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 5 },
      { x: 0, y: 5, w: 0, h: 11 },
    ],
  },
  {
    name: "min constraints do not backfill when no remaining space exists",
    main: 12,
    cross: 5,
    children: [{ flex: 1, min: 8 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 6, h: 0 },
      { x: 6, y: 0, w: 6, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 6 },
      { x: 0, y: 6, w: 0, h: 6 },
    ],
  },
  {
    name: "fractional remainder ties break by lower child index",
    main: 8,
    cross: 5,
    children: [{ flex: 1 }, { flex: 1 }, { flex: 1 }, { flex: 1 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 2, h: 0 },
      { x: 2, y: 0, w: 2, h: 0 },
      { x: 4, y: 0, w: 2, h: 0 },
      { x: 6, y: 0, w: 1, h: 0 },
      { x: 7, y: 0, w: 1, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 2 },
      { x: 0, y: 2, w: 0, h: 2 },
      { x: 0, y: 4, w: 0, h: 2 },
      { x: 0, y: 6, w: 0, h: 1 },
      { x: 0, y: 7, w: 0, h: 1 },
    ],
  },
  {
    name: "single flex child receives all remaining space",
    main: 20,
    cross: 5,
    gap: 2,
    children: [{ main: 3 }, { flex: 1 }, { main: 5 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 3, h: 0 },
      { x: 5, y: 0, w: 8, h: 0 },
      { x: 15, y: 0, w: 5, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 3 },
      { x: 0, y: 5, w: 0, h: 8 },
      { x: 0, y: 15, w: 0, h: 5 },
    ],
  },
  {
    name: "total flex is zero and oversized fixed children clamp without negatives",
    main: 5,
    cross: 5,
    children: [
      { main: 6, flex: 0 },
      { main: 6, flex: 0 },
    ],
    expectedRowChildren: [
      { x: 0, y: 0, w: 5, h: 0 },
      { x: 5, y: 0, w: 0, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 5 },
      { x: 0, y: 5, w: 0, h: 0 },
    ],
  },
  {
    name: "fractional flex 0.5 vs 1.5 rounds to deterministic 2/6 split",
    main: 8,
    cross: 5,
    children: [{ flex: 0.5 }, { flex: 1.5 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 2, h: 0 },
      { x: 2, y: 0, w: 6, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 2 },
      { x: 0, y: 2, w: 0, h: 6 },
    ],
  },
  {
    name: "flex children collapse to zero when no main-axis space remains after gap",
    main: 1,
    cross: 5,
    gap: 1,
    children: [{ flex: 1 }, { flex: 1 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 1, y: 0, w: 0, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 1, w: 0, h: 0 },
    ],
  },
  {
    name: "all flex:0 children remain zero-size and only advance by gap",
    main: 10,
    cross: 5,
    gap: 1,
    children: [{ flex: 0 }, { flex: 0 }, { flex: 0 }],
    expectedRowChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 1, y: 0, w: 0, h: 0 },
      { x: 2, y: 0, w: 0, h: 0 },
    ],
    expectedColumnChildren: [
      { x: 0, y: 0, w: 0, h: 0 },
      { x: 0, y: 1, w: 0, h: 0 },
      { x: 0, y: 2, w: 0, h: 0 },
    ],
  },
] as const;

describe("layout flex distribution (deterministic)", () => {
  for (const c of CASES) {
    test(`row: ${c.name}`, () => {
      const tree = mustLayout(buildStack("row", c), c.main, c.cross, "row");
      assert.deepEqual(tree.rect, { x: 0, y: 0, w: c.main, h: c.cross });
      assert.deepEqual(
        tree.children.map((child) => child.rect),
        c.expectedRowChildren,
      );
    });

    test(`column: ${c.name}`, () => {
      const tree = mustLayout(buildStack("column", c), c.cross, c.main, "column");
      assert.deepEqual(tree.rect, { x: 0, y: 0, w: c.cross, h: c.main });
      assert.deepEqual(
        tree.children.map((child) => child.rect),
        c.expectedColumnChildren,
      );
    });
  }
});
