import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";

describe("layout stack cross-axis feedback", () => {
  test("non-wrap stack remeasures wrapped content at final allocated width", () => {
    const tree = ui.row({ width: 20, gap: 0, align: "start" }, [
      ui.box({ border: "none", width: "50%" }, [ui.text("abcdefghijklmnopqrst", { wrap: true })]),
      ui.box({ border: "none", width: "50%" }, [ui.text("x")]),
    ]);
    const res = layout(tree, 0, 0, 20, 10, "row");
    assert.ok(res.ok);
    if (!res.ok) return;

    const first = res.value.children[0];
    const second = res.value.children[1];
    assert.ok(first !== undefined && second !== undefined);
    if (!first || !second) return;

    assert.equal(res.value.rect.h, 2);
    assert.equal(first.rect.w, 10);
    assert.equal(first.rect.h, 2);
    assert.equal(second.rect.x, 10);
  });

  test("wrap stack uses remeasured line cross-size before placing later lines", () => {
    const tree = ui.row({ width: 8, wrap: true, gap: 1, align: "start" }, [
      ui.box({ border: "none", width: "50%" }, [ui.text("abcdefghij", { wrap: true })]),
      ui.box({ border: "none", width: "50%" }, [ui.text("x")]),
    ]);
    const res = layout(tree, 0, 0, 8, 20, "row");
    assert.ok(res.ok);
    if (!res.ok) return;

    const first = res.value.children[0];
    const second = res.value.children[1];
    assert.ok(first !== undefined && second !== undefined);
    if (!first || !second) return;

    assert.equal(first.rect.h, 3);
    assert.equal(second.rect.y, 4); // 3 (line 1 cross) + 1 (line gap)
  });

  test("flex shrink remeasures wrapped content at shrunken final width", () => {
    const tree = ui.row({ width: 8, gap: 0, align: "start" }, [
      ui.box({ border: "none", width: 8, flexShrink: 1 }, [ui.text("ab cd ef gh", { wrap: true })]),
      ui.box({ border: "none", width: 8, flexShrink: 1 }, [ui.text("x")]),
    ]);
    const res = layout(tree, 0, 0, 8, 20, "row");
    assert.ok(res.ok);
    if (!res.ok) return;

    const first = res.value.children[0];
    const second = res.value.children[1];
    assert.ok(first !== undefined && second !== undefined);
    if (!first || !second) return;

    assert.equal(first.rect.w, 4);
    assert.equal(second.rect.w, 4);
    assert.equal(first.rect.h, 4);
    assert.equal(res.value.rect.h, 4);
  });
});
