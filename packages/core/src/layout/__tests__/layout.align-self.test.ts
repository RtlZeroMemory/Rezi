import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, ui } from "../../index.js";
import { type LayoutTree, layout } from "../layout.js";

type Axis = "row" | "column";

function mustLayout(node: VNode, maxW: number, maxH: number, axis: Axis): LayoutTree {
  const res = layout(node, 0, 0, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function box(props: {
  width?: number;
  height?: number;
  alignSelf?: "auto" | "start" | "center" | "end" | "stretch";
}): VNode {
  return ui.box({ border: "none", ...props }, []);
}

describe("layout alignSelf", () => {
  test("parent align=start + child alignSelf=center centers child on cross axis", () => {
    const out = mustLayout(
      ui.row({ width: 40, height: 10, align: "start" }, [
        box({ width: 4, height: 3, alignSelf: "center" }),
      ]),
      40,
      10,
      "row",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 3, w: 4, h: 3 });
  });

  test("parent align=start + child alignSelf=end places child at cross-axis end", () => {
    const out = mustLayout(
      ui.row({ width: 40, height: 10, align: "start" }, [
        box({ width: 4, height: 3, alignSelf: "end" }),
      ]),
      40,
      10,
      "row",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 7, w: 4, h: 3 });
  });

  test("parent align=stretch + child alignSelf=start does not stretch that child", () => {
    const out = mustLayout(
      ui.row({ width: 40, height: 10, align: "stretch" }, [
        box({ width: 4, height: 3, alignSelf: "start" }),
      ]),
      40,
      10,
      "row",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 4, h: 3 });
  });

  test("alignSelf=auto inherits parent align", () => {
    const out = mustLayout(
      ui.row({ width: 40, height: 10, align: "end" }, [
        box({ width: 4, height: 3, alignSelf: "auto" }),
      ]),
      40,
      10,
      "row",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 7, w: 4, h: 3 });
  });

  test("mixed alignSelf values in one row are applied per child", () => {
    const out = mustLayout(
      ui.row({ width: 30, height: 9, gap: 0, align: "start" }, [
        box({ width: 2, height: 3, alignSelf: "start" }),
        box({ width: 2, height: 3, alignSelf: "center" }),
        box({ width: 2, height: 3, alignSelf: "end" }),
      ]),
      30,
      9,
      "row",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 2, h: 3 });
    assert.deepEqual(out.children[1]?.rect, { x: 2, y: 3, w: 2, h: 3 });
    assert.deepEqual(out.children[2]?.rect, { x: 4, y: 6, w: 2, h: 3 });
  });

  test("wrap mode applies alignSelf per line", () => {
    const out = mustLayout(
      ui.row({ width: 6, height: 12, wrap: true, gap: 1, align: "start" }, [
        box({ width: 2, height: 3, alignSelf: "start" }),
        box({ width: 2, height: 1, alignSelf: "end" }),
        box({ width: 2, height: 2, alignSelf: "center" }),
      ]),
      6,
      12,
      "row",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 0, y: 0, w: 2, h: 3 });
    assert.deepEqual(out.children[1]?.rect, { x: 3, y: 2, w: 2, h: 1 });
    assert.deepEqual(out.children[2]?.rect, { x: 0, y: 4, w: 2, h: 2 });
  });

  test("column axis uses alignSelf for horizontal positioning", () => {
    const out = mustLayout(
      ui.column({ width: 20, height: 20, gap: 0, align: "start" }, [
        box({ width: 4, height: 3, alignSelf: "center" }),
        box({ width: 4, height: 3, alignSelf: "end" }),
      ]),
      20,
      20,
      "column",
    );
    assert.deepEqual(out.children[0]?.rect, { x: 8, y: 0, w: 4, h: 3 });
    assert.deepEqual(out.children[1]?.rect, { x: 16, y: 3, w: 4, h: 3 });
  });
});
