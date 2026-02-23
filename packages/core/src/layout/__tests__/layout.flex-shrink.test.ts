import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";
import { getResponsiveViewport, setResponsiveViewport } from "../responsive.js";

function mustRow(children: readonly ReturnType<typeof ui.box>[], width: number) {
  const res = layout(ui.row({ width, gap: 0 }, children), 0, 0, width, 20, "row");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function box(props: {
  width?: number;
  minWidth?: number;
  flex?: number;
  flexShrink?: number;
  flexBasis?: number;
}) {
  return ui.box({ border: "none", ...props }, []);
}

describe("layout flex shrink + basis", () => {
  test("three shrinkable children share overflow proportionally", () => {
    const out = mustRow(
      [
        box({ width: 40, flexShrink: 1 }),
        box({ width: 40, flexShrink: 1 }),
        box({ width: 40, flexShrink: 1 }),
      ],
      100,
    );
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [33, 33, 34],
    );
  });

  test("flexShrink:0 child is never shrunk", () => {
    const out = mustRow(
      [
        box({ width: 50, flexShrink: 0 }),
        box({ width: 40, flexShrink: 1 }),
        box({ width: 40, flexShrink: 1 }),
      ],
      100,
    );
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [50, 25, 25],
    );
  });

  test("higher shrink factor shrinks proportionally more", () => {
    const out = mustRow([box({ width: 60, flexShrink: 2 }), box({ width: 60, flexShrink: 1 })], 90);
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [40, 50],
    );
  });

  test("minWidth floors shrink", () => {
    const out = mustRow(
      [box({ width: 60, minWidth: 50, flexShrink: 1 }), box({ width: 60, flexShrink: 1 })],
      90,
    );
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [50, 40],
    );
  });

  test("no overflow keeps sizes unchanged", () => {
    const out = mustRow([box({ width: 30, flexShrink: 1 }), box({ width: 20, flexShrink: 2 })], 60);
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [30, 20],
    );
  });

  test("default flexShrink is 0 (backward compatibility)", () => {
    const out = mustRow([box({ width: 40 }), box({ width: 40 })], 50);
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [40, 10],
    );
  });

  test("flexBasis participates as initial main size before growth", () => {
    const out = mustRow([box({ flex: 1, flexBasis: 50 }), box({ flex: 1, flexBasis: 10 })], 120);
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [80, 40],
    );
  });

  test('responsive flexBasis "auto" resolves before basis planning', () => {
    const prev = getResponsiveViewport();
    setResponsiveViewport(70, 24);
    try {
      const out = mustRow(
        [
          ui.box({ border: "none", flex: 1, flexBasis: { sm: "auto" } }, [ui.text("123456")]),
          ui.box({ border: "none", flex: 1, flexBasis: { sm: "auto" } }, [ui.text("12")]),
        ],
        20,
      );
      assert.deepEqual(
        out.children.map((child) => child.rect.w),
        [12, 8],
      );
    } finally {
      setResponsiveViewport(prev.width, prev.height);
    }
  });

  test("intrinsic min-content floor is used when explicit minWidth is absent", () => {
    const out = mustRow(
      [
        ui.box({ border: "none", width: 5, flexShrink: 1 }, [ui.text("HELLO")]),
        ui.box({ border: "none", width: 5, flexShrink: 1 }, [ui.text("WORLD")]),
      ],
      8,
    );
    assert.deepEqual(
      out.children.map((child) => child.rect.w),
      [5, 5],
    );
  });

  test("column flexBasis percentages resolve against parent height (main axis)", () => {
    const tree = ui.column({ width: 20, height: 10, gap: 0 }, [
      ui.box({ border: "none", flexBasis: "50%" }, []),
      ui.box({ border: "none", flexBasis: "50%" }, []),
    ]);
    const res = layout(tree, 0, 0, 20, 10, "column");
    assert.ok(res.ok);
    if (!res.ok) return;
    assert.deepEqual(
      res.value.children.map((child) => child.rect.h),
      [5, 5],
    );
  });
});
