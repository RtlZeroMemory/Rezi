import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

function mustLayout(node: VNode, maxW: number, maxH: number): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, "row");
  assert.equal(res.ok, true);
  if (!res.ok) throw new Error("unexpected fatal");
  return res.value;
}

describe("constraints (deterministic) - golden cases", () => {
  test("flex:1 + flex:2 in row of width 90 => 30 + 60", () => {
    const tree = ui.row({}, [
      ui.box({ border: "none", flex: 1 }, []),
      ui.box({ border: "none", flex: 2 }, []),
    ]);

    const out = mustLayout(tree, 90, 10);
    assert.equal(out.children[0]?.rect.w, 30);
    assert.equal(out.children[1]?.rect.w, 60);
  });

  test('width:"50%" in parent width 80 => 40', () => {
    const tree = ui.row({}, [ui.box({ border: "none", width: "50%" }, [])]);
    const out = mustLayout(tree, 80, 10);
    assert.equal(out.children[0]?.rect.w, 40);
  });

  test("flex:1 with minWidth:20, maxWidth:50 in space 100 => 50", () => {
    const tree = ui.row({}, [ui.box({ border: "none", flex: 1, minWidth: 20, maxWidth: 50 }, [])]);
    const out = mustLayout(tree, 100, 10);
    assert.equal(out.children[0]?.rect.w, 50);
  });

  test("nested percentages: 100 -> 50% -> 50% = 25", () => {
    const tree = ui.row({}, [
      ui.box({ border: "none", width: "50%" }, [
        ui.box({ border: "none", width: "50%" }, [ui.text("x")]),
      ]),
    ]);
    const out = mustLayout(tree, 100, 10);
    assert.equal(out.children[0]?.rect.w, 50);
    assert.equal(out.children[0]?.children[0]?.rect.w, 25);
  });

  test("flex allocation respects maxWidth across iterations", () => {
    const tree = ui.row({}, [
      ui.box({ border: "none", flex: 100, maxWidth: 10 }, []),
      ui.box({ border: "none", flex: 1 }, []),
      ui.box({ border: "none", flex: 1, maxWidth: 30 }, []),
    ]);

    const out = mustLayout(tree, 100, 10);
    assert.equal(out.children[0]?.rect.w, 10);
    assert.equal(out.children[2]?.rect.w, 30);
    assert.equal(out.children[1]?.rect.w, 60);
  });

  test('row align:"stretch" propagates forced cross-size to descendants', () => {
    const tree = ui.row({ width: 20, height: 10, align: "stretch" }, [
      ui.box({ border: "none", height: "50%" }, [ui.box({ border: "none", height: "100%" }, [])]),
    ]);

    const out = mustLayout(tree, 20, 10);
    assert.equal(out.children[0]?.rect.h, 10);
    assert.equal(out.children[0]?.children[0]?.rect.h, 10);
  });

  test("nested row with capped flex children does not starve sibling width", () => {
    const tree = ui.row({}, [
      ui.row({}, [
        ui.box({ border: "none", flex: 1, maxWidth: 3 }, []),
        ui.box({ border: "none", flex: 1, maxWidth: 3 }, []),
      ]),
      ui.box({ border: "none" }, [ui.text("z")]),
    ]);

    const out = mustLayout(tree, 20, 5);
    assert.equal(out.children[0]?.rect.w, 6);
    assert.equal(out.children[1]?.rect.w, 1);
  });

  test("nested column with capped flex children does not starve sibling height", () => {
    const tree = ui.column({}, [
      ui.column({}, [
        ui.box({ border: "none", flex: 1, maxHeight: 2 }, []),
        ui.box({ border: "none", flex: 1, maxHeight: 2 }, []),
      ]),
      ui.box({ border: "none" }, [ui.text("y")]),
    ]);

    const out = mustLayout(tree, 10, 10);
    assert.equal(out.children[0]?.rect.h, 4);
    assert.equal(out.children[1]?.rect.h, 1);
  });

  test("row child margin reserves outer space and offsets child rect", () => {
    const tree = ui.row({}, [
      ui.box({ border: "none", width: 4, height: 2, m: 1 }, [ui.text("x")]),
      ui.box({ border: "none", width: 2, height: 1 }, []),
    ]);

    const out = mustLayout(tree, 20, 5);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 8, h: 4 });
    assert.deepEqual(out.children[0]?.rect, { x: 1, y: 1, w: 4, h: 2 });
    assert.deepEqual(out.children[1]?.rect, { x: 6, y: 0, w: 2, h: 1 });
  });

  test("row child per-side margin reserves outer space and offsets child rect", () => {
    const tree = ui.row({}, [
      ui.box({ border: "none", width: 4, height: 2, mt: 1, mr: 2, ml: 3 }, [ui.text("x")]),
      ui.box({ border: "none", width: 2, height: 1 }, []),
    ]);

    const out = mustLayout(tree, 20, 5);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 11, h: 3 });
    assert.deepEqual(out.children[0]?.rect, { x: 3, y: 1, w: 4, h: 2 });
    assert.deepEqual(out.children[1]?.rect, { x: 9, y: 0, w: 2, h: 1 });
  });

  test("root margin insets the rendered rect inside viewport bounds", () => {
    const tree = ui.box({ border: "none", width: 4, height: 2, m: 1 }, [ui.text("x")]);

    const out = mustLayout(tree, 10, 10);
    assert.deepEqual(out.rect, { x: 1, y: 1, w: 4, h: 2 });
  });
});
