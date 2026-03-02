import { assert, describe, test } from "@rezi-ui/testkit";
import { type TestRenderResult, type VNode, createTestRenderer, ui } from "../../index.js";

function mustRow(children: readonly VNode[], width: number) {
  const renderer = createTestRenderer({ viewport: { cols: width, rows: 20 } });
  return renderer.render(ui.row({ width, gap: 0 }, children));
}

function childRectMeasure(out: TestRenderResult, ids: string[], dimension: "w" | "h") {
  return ids.map((id) => {
    const node = out.findById(id);
    if (node === null) {
      assert.fail(`missing node with id=${id}`);
    }
    return node.rect[dimension];
  });
}

function box(
  id: string,
  props: {
    width?: number;
    minWidth?: number;
    flex?: number;
    flexShrink?: number;
    flexBasis?: number | "auto";
  },
) {
  return ui.box({ id, border: "none", ...props }, []);
}

describe("layout flex shrink + basis", () => {
  test("three shrinkable children share overflow proportionally", () => {
    const ids = ["a", "b", "c"];
    const out = mustRow(
      [
        box(ids[0] ?? "a", { width: 40, flexShrink: 1 }),
        box(ids[1] ?? "b", { width: 40, flexShrink: 1 }),
        box(ids[2] ?? "c", { width: 40, flexShrink: 1 }),
      ],
      100,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [33, 33, 34]);
  });

  test("flexShrink:0 child is never shrunk", () => {
    const ids = ["a", "b", "c"];
    const out = mustRow(
      [
        box(ids[0] ?? "a", { width: 50, flexShrink: 0 }),
        box(ids[1] ?? "b", { width: 40, flexShrink: 1 }),
        box(ids[2] ?? "c", { width: 40, flexShrink: 1 }),
      ],
      100,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [50, 25, 25]);
  });

  test("higher shrink factor shrinks proportionally more", () => {
    const ids = ["a", "b"];
    const out = mustRow(
      [
        box(ids[0] ?? "a", { width: 60, flexShrink: 2 }),
        box(ids[1] ?? "b", { width: 60, flexShrink: 1 }),
      ],
      90,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [40, 50]);
  });

  test("minWidth floors shrink", () => {
    const ids = ["a", "b"];
    const out = mustRow(
      [
        box(ids[0] ?? "a", { width: 60, minWidth: 50, flexShrink: 1 }),
        box(ids[1] ?? "b", { width: 60, flexShrink: 1 }),
      ],
      90,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [50, 40]);
  });

  test("no overflow keeps sizes unchanged", () => {
    const ids = ["a", "b"];
    const out = mustRow(
      [
        box(ids[0] ?? "a", { width: 30, flexShrink: 1 }),
        box(ids[1] ?? "b", { width: 20, flexShrink: 2 }),
      ],
      60,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [30, 20]);
  });

  test("default flexShrink is 0 (backward compatibility)", () => {
    const ids = ["a", "b"];
    const out = mustRow([box(ids[0] ?? "a", { width: 40 }), box(ids[1] ?? "b", { width: 40 })], 50);
    assert.deepEqual(childRectMeasure(out, ids, "w"), [40, 10]);
  });

  test("flexBasis participates as initial main size before growth", () => {
    const ids = ["a", "b"];
    const out = mustRow(
      [
        box(ids[0] ?? "a", { flex: 1, flexBasis: 50 }),
        box(ids[1] ?? "b", { flex: 1, flexBasis: 10 }),
      ],
      120,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [80, 40]);
  });

  test('flexBasis "auto" resolves before basis planning', () => {
    const ids = ["a", "b"];
    const out = mustRow(
      [
        ui.box({ id: ids[0] ?? "a", border: "none", flex: 1, flexBasis: "auto" }, [
          ui.text("123456"),
        ]),
        ui.box({ id: ids[1] ?? "b", border: "none", flex: 1, flexBasis: "auto" }, [ui.text("12")]),
      ],
      20,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [12, 8]);
  });

  test("intrinsic min-content floor is used when explicit minWidth is absent", () => {
    const ids = ["a", "b"];
    const out = mustRow(
      [
        ui.box({ id: ids[0] ?? "a", border: "none", width: 5, flexShrink: 1 }, [ui.text("HELLO")]),
        ui.box({ id: ids[1] ?? "b", border: "none", width: 5, flexShrink: 1 }, [ui.text("WORLD")]),
      ],
      8,
    );
    assert.deepEqual(childRectMeasure(out, ids, "w"), [5, 5]);
  });

  test("column flexBasis numeric values resolve against parent height (main axis)", () => {
    const ids = ["a", "b"];
    const tree = ui.column({ width: 20, height: 10, gap: 0 }, [
      ui.box({ id: ids[0] ?? "a", border: "none", flexBasis: 5 }, []),
      ui.box({ id: ids[1] ?? "b", border: "none", flexBasis: 5 }, []),
    ]);
    const renderer = createTestRenderer({ viewport: { cols: 20, rows: 10 } });
    const out = renderer.render(tree);
    assert.deepEqual(childRectMeasure(out, ids, "h"), [5, 5]);
  });
});
