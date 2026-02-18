import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type LayoutTree, layout, measure } from "../layout.js";

type Axis = "row" | "column";
type Rect = Readonly<{ x: number; y: number; w: number; h: number }>;
type Size = Readonly<{ w: number; h: number }>;

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function mustMeasure(node: VNode, maxW: number, maxH: number, axis: Axis): Size {
  const res = measure(node, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`measure failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function assertRects(actual: readonly LayoutTree[], expected: readonly Rect[]): void {
  assert.equal(actual.length, expected.length, "child count should match");
  for (let i = 0; i < expected.length; i++) {
    assert.deepEqual(actual[i]?.rect, expected[i], `child #${i} rect`);
  }
}

function box(props: {
  width?: number | `${number}%`;
  height?: number | `${number}%`;
  flex?: number;
}): VNode {
  return ui.box({ border: "none", ...props }, []);
}

describe("layout wrap (deterministic)", () => {
  test("row wrap=true matches wrap=false when all children fit", () => {
    const children = [box({ width: 2, height: 2 }), box({ width: 3, height: 1 })];
    const wrapped = mustLayout(
      ui.row({ width: 10, height: 4, gap: 1, wrap: true }, children),
      10,
      4,
      "row",
    );
    const unwrapped = mustLayout(
      ui.row({ width: 10, height: 4, gap: 1, wrap: false }, children),
      10,
      4,
      "row",
    );
    const expected: readonly Rect[] = [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 3, y: 0, w: 3, h: 1 },
    ];

    assert.deepEqual(wrapped.rect, { x: 0, y: 0, w: 10, h: 4 });
    assert.deepEqual(unwrapped.rect, { x: 0, y: 0, w: 10, h: 4 });
    assertRects(wrapped.children, expected);
    assertRects(unwrapped.children, expected);
  });

  test("column wrap=true matches wrap=false when all children fit", () => {
    const children = [box({ width: 2, height: 2 }), box({ width: 1, height: 3 })];
    const wrapped = mustLayout(
      ui.column({ width: 4, height: 10, gap: 1, wrap: true }, children),
      4,
      10,
      "column",
    );
    const unwrapped = mustLayout(
      ui.column({ width: 4, height: 10, gap: 1, wrap: false }, children),
      4,
      10,
      "column",
    );
    const expected: readonly Rect[] = [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 0, y: 3, w: 1, h: 3 },
    ];

    assert.deepEqual(wrapped.rect, { x: 0, y: 0, w: 4, h: 10 });
    assert.deepEqual(unwrapped.rect, { x: 0, y: 0, w: 4, h: 10 });
    assertRects(wrapped.children, expected);
    assertRects(unwrapped.children, expected);
  });

  test("row wrap single child keeps direct child rect", () => {
    const child = box({ width: 5, height: 2 });
    const wrapped = mustLayout(ui.row({ width: 8, height: 6, wrap: true }, [child]), 8, 6, "row");
    const direct = mustLayout(child, 8, 6, "row");

    assert.deepEqual(wrapped.rect, { x: 0, y: 0, w: 8, h: 6 });
    assert.deepEqual(wrapped.children[0]?.rect, { x: 0, y: 0, w: 5, h: 2 });
    assert.deepEqual(wrapped.children[0]?.rect, direct.rect);
  });

  test("column wrap single child keeps direct child rect", () => {
    const child = box({ width: 2, height: 5 });
    const wrapped = mustLayout(
      ui.column({ width: 6, height: 8, wrap: true }, [child]),
      6,
      8,
      "column",
    );
    const direct = mustLayout(child, 6, 8, "column");

    assert.deepEqual(wrapped.rect, { x: 0, y: 0, w: 6, h: 8 });
    assert.deepEqual(wrapped.children[0]?.rect, { x: 0, y: 0, w: 2, h: 5 });
    assert.deepEqual(wrapped.children[0]?.rect, direct.rect);
  });

  test("row wrap places oversized fixed children on separate lines", () => {
    const out = mustLayout(
      ui.row({ width: 4, wrap: true, gap: 1 }, [
        box({ width: 6, height: 1 }),
        box({ width: 5, height: 1 }),
        box({ width: 7, height: 1 }),
      ]),
      4,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 4, h: 5 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 4, h: 1 },
      { x: 0, y: 2, w: 4, h: 1 },
      { x: 0, y: 4, w: 4, h: 1 },
    ]);
  });

  test("column wrap places oversized fixed children on separate lines", () => {
    const out = mustLayout(
      ui.column({ height: 4, wrap: true, gap: 1 }, [
        box({ width: 1, height: 6 }),
        box({ width: 1, height: 5 }),
        box({ width: 1, height: 7 }),
      ]),
      10,
      4,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 4 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 1, h: 4 },
      { x: 2, y: 0, w: 1, h: 4 },
      { x: 4, y: 0, w: 1, h: 4 },
    ]);
  });

  test("row wrap clamps oversized child width to line width", () => {
    const out = mustLayout(
      ui.row({ width: 5, height: 6, wrap: true, gap: 1 }, [
        box({ width: 9, height: 1 }),
        box({ width: 3, height: 1 }),
      ]),
      5,
      6,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 6 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 5, h: 1 },
      { x: 0, y: 2, w: 3, h: 1 },
    ]);
  });

  test("column wrap clamps oversized child height to line height", () => {
    const out = mustLayout(
      ui.column({ width: 6, height: 5, wrap: true, gap: 1 }, [
        box({ width: 2, height: 9 }),
        box({ width: 2, height: 3 }),
      ]),
      6,
      5,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 5 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 2, h: 5 },
      { x: 3, y: 0, w: 2, h: 3 },
    ]);
  });

  test("measure row wrap empty container is zero-sized", () => {
    assert.deepEqual(mustMeasure(ui.row({ wrap: true }, []), 20, 10, "row"), { w: 0, h: 0 });
  });

  test("measure column wrap empty container is zero-sized", () => {
    assert.deepEqual(mustMeasure(ui.column({ wrap: true }, []), 20, 10, "column"), { w: 0, h: 0 });
  });

  test("layout row wrap empty container honors forced size", () => {
    const out = mustLayout(ui.row({ width: 7, height: 3, wrap: true }, []), 20, 10, "row");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 7, h: 3 });
    assert.equal(out.children.length, 0);
  });

  test("layout column wrap empty container honors forced size", () => {
    const out = mustLayout(ui.column({ width: 4, height: 6, wrap: true }, []), 20, 10, "column");
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 4, h: 6 });
    assert.equal(out.children.length, 0);
  });

  test("row wrap gap=0 keeps contiguous placement within and across lines", () => {
    const out = mustLayout(
      ui.row({ width: 4, wrap: true, gap: 0 }, [
        box({ width: 2, height: 1 }),
        box({ width: 2, height: 1 }),
        box({ width: 2, height: 1 }),
      ]),
      4,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 4, h: 2 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 2, y: 0, w: 2, h: 1 },
      { x: 0, y: 1, w: 2, h: 1 },
    ]);
  });

  test("column wrap gap=0 keeps contiguous placement within and across lines", () => {
    const out = mustLayout(
      ui.column({ height: 4, wrap: true, gap: 0 }, [
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 2 }),
      ]),
      10,
      4,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 2, h: 4 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 1, h: 2 },
      { x: 0, y: 2, w: 1, h: 2 },
      { x: 1, y: 0, w: 1, h: 2 },
    ]);
  });

  test("row wrap applies between-line gap in Y", () => {
    const out = mustLayout(
      ui.row({ width: 5, wrap: true, gap: 2 }, [
        box({ width: 3, height: 1 }),
        box({ width: 3, height: 1 }),
        box({ width: 3, height: 1 }),
      ]),
      5,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 7 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 3, h: 1 },
      { x: 0, y: 3, w: 3, h: 1 },
      { x: 0, y: 6, w: 3, h: 1 },
    ]);
  });

  test("column wrap applies between-line gap in X", () => {
    const out = mustLayout(
      ui.column({ height: 5, wrap: true, gap: 2 }, [
        box({ width: 1, height: 3 }),
        box({ width: 1, height: 3 }),
        box({ width: 1, height: 3 }),
      ]),
      10,
      5,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 7, h: 5 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 1, h: 3 },
      { x: 3, y: 0, w: 1, h: 3 },
      { x: 6, y: 0, w: 1, h: 3 },
    ]);
  });

  test("row wrap align=center is computed per line", () => {
    const out = mustLayout(
      ui.row({ width: 6, wrap: true, gap: 1, align: "center" }, [
        box({ width: 2, height: 3 }),
        box({ width: 2, height: 1 }),
        box({ width: 2, height: 2 }),
      ]),
      6,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 6 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 2, h: 3 },
      { x: 3, y: 1, w: 2, h: 1 },
      { x: 0, y: 4, w: 2, h: 2 },
    ]);
  });

  test("column wrap align=center is computed per line", () => {
    const out = mustLayout(
      ui.column({ height: 6, wrap: true, gap: 1, align: "center" }, [
        box({ width: 3, height: 2 }),
        box({ width: 1, height: 2 }),
        box({ width: 2, height: 2 }),
      ]),
      10,
      6,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 6 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 1, y: 3, w: 1, h: 2 },
      { x: 4, y: 0, w: 2, h: 2 },
    ]);
  });

  test("row wrap align=stretch uses per-line intrinsic cross size", () => {
    const out = mustLayout(
      ui.row({ width: 5, height: 10, wrap: true, gap: 1, align: "stretch" }, [
        box({ width: 2, height: 2 }),
        box({ width: 2, height: 1 }),
        box({ width: 5, height: 1 }),
      ]),
      5,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 10 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 3, y: 0, w: 2, h: 2 },
      { x: 0, y: 3, w: 5, h: 1 },
    ]);
  });

  test("column wrap align=stretch uses per-line intrinsic cross size", () => {
    const out = mustLayout(
      ui.column({ width: 10, height: 5, wrap: true, gap: 1, align: "stretch" }, [
        box({ width: 2, height: 2 }),
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 5 }),
      ]),
      10,
      5,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 10, h: 5 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 0, y: 3, w: 2, h: 2 },
      { x: 3, y: 0, w: 1, h: 5 },
    ]);
  });

  test("row wrap justify=center is computed per line", () => {
    const out = mustLayout(
      ui.row({ width: 8, wrap: true, gap: 1, justify: "center" }, [
        box({ width: 2, height: 1 }),
        box({ width: 2, height: 1 }),
        box({ width: 3, height: 1 }),
      ]),
      8,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 3 });
    assertRects(out.children, [
      { x: 1, y: 0, w: 2, h: 1 },
      { x: 4, y: 0, w: 2, h: 1 },
      { x: 2, y: 2, w: 3, h: 1 },
    ]);
  });

  test("column wrap justify=evenly is computed per line", () => {
    const out = mustLayout(
      ui.column({ height: 8, wrap: true, gap: 1, justify: "evenly" }, [
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 3 }),
      ]),
      10,
      8,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 3, h: 8 });
    assertRects(out.children, [
      { x: 0, y: 1, w: 1, h: 2 },
      { x: 0, y: 5, w: 1, h: 2 },
      { x: 2, y: 3, w: 1, h: 3 },
    ]);
  });

  test("row wrap justify=between applies extra only to multi-item lines", () => {
    const out = mustLayout(
      ui.row({ width: 8, wrap: true, gap: 1, justify: "between" }, [
        box({ width: 2, height: 1 }),
        box({ width: 2, height: 1 }),
        box({ width: 3, height: 1 }),
      ]),
      8,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 3 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 6, y: 0, w: 2, h: 1 },
      { x: 0, y: 2, w: 3, h: 1 },
    ]);
  });

  test("column wrap justify=between applies extra only to multi-item lines", () => {
    const out = mustLayout(
      ui.column({ height: 8, wrap: true, gap: 1, justify: "between" }, [
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 2 }),
        box({ width: 1, height: 3 }),
      ]),
      10,
      8,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 3, h: 8 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 1, h: 2 },
      { x: 0, y: 6, w: 1, h: 2 },
      { x: 2, y: 0, w: 1, h: 3 },
    ]);
  });

  test("row wrap flex distribution is solved independently per line", () => {
    const out = mustLayout(
      ui.row({ width: 10, wrap: true, gap: 1 }, [
        box({ flex: 1, height: 1 }),
        box({ flex: 1, height: 1 }),
        box({ width: 10, height: 1 }),
        box({ flex: 1, height: 1 }),
        box({ flex: 1, height: 1 }),
      ]),
      10,
      10,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 10, h: 5 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 5, h: 1 },
      { x: 6, y: 0, w: 4, h: 1 },
      { x: 0, y: 2, w: 10, h: 1 },
      { x: 0, y: 4, w: 5, h: 1 },
      { x: 6, y: 4, w: 4, h: 1 },
    ]);
  });

  test("column wrap flex distribution is solved independently per line", () => {
    const out = mustLayout(
      ui.column({ height: 10, wrap: true, gap: 1 }, [
        box({ width: 1, flex: 1 }),
        box({ width: 1, flex: 1 }),
        box({ width: 1, height: 10 }),
        box({ width: 1, flex: 1 }),
        box({ width: 1, flex: 1 }),
      ]),
      10,
      10,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 5, h: 10 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 1, h: 5 },
      { x: 0, y: 6, w: 1, h: 4 },
      { x: 2, y: 0, w: 1, h: 10 },
      { x: 4, y: 0, w: 1, h: 5 },
      { x: 4, y: 6, w: 1, h: 4 },
    ]);
  });

  test("measure row wrap natural size uses max line main and total cross", () => {
    const size = mustMeasure(
      ui.row({ wrap: true, gap: 1 }, [
        box({ width: 4, height: 2 }),
        box({ width: 4, height: 3 }),
        box({ width: 2, height: 1 }),
      ]),
      6,
      10,
      "row",
    );
    assert.deepEqual(size, { w: 4, h: 8 });
  });

  test("measure column wrap natural size uses max line main and total cross", () => {
    const size = mustMeasure(
      ui.column({ wrap: true, gap: 1 }, [
        box({ width: 2, height: 4 }),
        box({ width: 3, height: 4 }),
        box({ width: 1, height: 2 }),
      ]),
      10,
      6,
      "column",
    );
    assert.deepEqual(size, { w: 8, h: 4 });
  });

  test("row wrap percent widths use container width, not per-line remaining width (assumption)", () => {
    // Assumption documented here: percent widths resolve from full row content width.
    const out = mustLayout(
      ui.row({ width: 8, height: 6, wrap: true, gap: 1 }, [
        box({ width: "50%", height: 1 }),
        box({ width: "50%", height: 1 }),
      ]),
      8,
      6,
      "row",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 6 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 4, h: 1 },
      { x: 0, y: 2, w: 4, h: 1 },
    ]);
  });

  test("column wrap percent heights use container height, not per-line remaining height (assumption)", () => {
    // Assumption documented here: percent heights resolve from full column content height.
    const out = mustLayout(
      ui.column({ width: 6, height: 8, wrap: true, gap: 1 }, [
        box({ width: 1, height: "50%" }),
        box({ width: 1, height: "50%" }),
      ]),
      6,
      8,
      "column",
    );

    assert.deepEqual(out.rect, { x: 0, y: 0, w: 6, h: 8 });
    assertRects(out.children, [
      { x: 0, y: 0, w: 1, h: 4 },
      { x: 2, y: 0, w: 1, h: 4 },
    ]);
  });
});
