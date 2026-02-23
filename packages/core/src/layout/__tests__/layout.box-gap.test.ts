import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";

describe("layout \u203a box gap", () => {
  test("gap: 0 (default) - children are contiguous", () => {
    const tree = ui.box({ border: "none", width: 20, height: 10 }, [ui.text("A"), ui.text("B")]);
    const res = layout(tree, 0, 0, 80, 24, "column");
    assert.ok(res.ok);
    if (!res.ok) return;
    const [a, b] = res.value.children;
    assert.strictEqual(a?.rect.y, 0);
    assert.strictEqual(b?.rect.y, 1);
  });

  test("gap: 2 - children spaced 2 cells apart", () => {
    const tree = ui.box({ border: "none", width: 20, height: 10, gap: 2 }, [
      ui.text("A"),
      ui.text("B"),
    ]);
    const res = layout(tree, 0, 0, 80, 24, "column");
    assert.ok(res.ok);
    if (!res.ok) return;
    const [a, b] = res.value.children;
    assert.strictEqual(a?.rect.y, 0);
    assert.strictEqual(b?.rect.y, 3);
  });

  test("gap with border - gap applies inside border", () => {
    const tree = ui.box({ border: "single", width: 20, height: 10, gap: 1 }, [
      ui.text("A"),
      ui.text("B"),
    ]);
    const res = layout(tree, 0, 0, 80, 24, "column");
    assert.ok(res.ok);
    if (!res.ok) return;
    const [a, b] = res.value.children;
    assert.strictEqual(a?.rect.y, 1);
    assert.strictEqual(b?.rect.y, 3);
    assert.strictEqual((b?.rect.y ?? 0) - (a?.rect.y ?? 0), 2);
  });
});
