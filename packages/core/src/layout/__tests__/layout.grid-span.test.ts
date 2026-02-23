import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";

type GridPlacementProps = Readonly<{
  gridColumn?: number;
  gridRow?: number;
  colSpan?: number;
  rowSpan?: number;
}>;

function mustLayout(tree: ReturnType<typeof ui.grid>) {
  const res = layout(tree, 0, 0, 80, 24, "column");
  assert.ok(res.ok);
  if (!res.ok) {
    throw new Error("layout failed");
  }
  return res.value;
}

function item(props: GridPlacementProps = {}) {
  return ui.box({ border: "none", width: 1, height: 1, ...props }, []);
}

describe("layout grid spans + explicit placement", () => {
  test("colSpan:2 child occupies two columns", () => {
    const tree = ui.grid({ columns: "4 4 4", rows: "2", gap: 0 }, item({ colSpan: 2 }));
    const out = mustLayout(tree);
    const a = out.children[0];
    assert.ok(a !== undefined);
    if (!a) return;
    assert.strictEqual(a.rect.x, 0);
    assert.strictEqual(a.rect.y, 0);
    assert.strictEqual(a.rect.w, 8);
    assert.strictEqual(a.rect.h, 2);
  });

  test("rowSpan:2 child occupies two rows", () => {
    const tree = ui.grid({ columns: "4", rows: "2 2 2", gap: 0 }, item({ rowSpan: 2 }));
    const out = mustLayout(tree);
    const a = out.children[0];
    assert.ok(a !== undefined);
    if (!a) return;
    assert.strictEqual(a.rect.x, 0);
    assert.strictEqual(a.rect.y, 0);
    assert.strictEqual(a.rect.w, 4);
    assert.strictEqual(a.rect.h, 4);
  });

  test("gridColumn/gridRow explicit placement uses 1-based coordinates", () => {
    const tree = ui.grid(
      { columns: "4 4 4", rows: "2 2", gap: 0 },
      item({ gridColumn: 2, gridRow: 1 }),
    );
    const out = mustLayout(tree);
    const a = out.children[0];
    assert.ok(a !== undefined);
    if (!a) return;
    assert.strictEqual(a.rect.x, 4);
    assert.strictEqual(a.rect.y, 0);
  });

  test("auto placement skips occupied cells", () => {
    const tree = ui.grid(
      { columns: "4 4 4", rows: "2 2", gap: 0 },
      item({ colSpan: 2 }),
      item(),
      item(),
    );
    const out = mustLayout(tree);
    const [a, b, c] = out.children;
    assert.ok(a !== undefined && b !== undefined && c !== undefined);
    if (!a || !b || !c) return;
    assert.strictEqual(a.rect.x, 0);
    assert.strictEqual(a.rect.y, 0);
    assert.strictEqual(b.rect.x, 8);
    assert.strictEqual(b.rect.y, 0);
    assert.strictEqual(c.rect.x, 0);
    assert.strictEqual(c.rect.y, 2);
  });

  test("mixed explicit + auto placement preserves child order and placement", () => {
    const tree = ui.grid(
      { columns: "4 4 4", rows: "1 1", gap: 0 },
      item(),
      item({ gridColumn: 2, gridRow: 1 }),
      item(),
    );
    const out = mustLayout(tree);
    const [a, b, c] = out.children;
    assert.ok(a !== undefined && b !== undefined && c !== undefined);
    if (!a || !b || !c) return;
    assert.strictEqual(a.rect.x, 0);
    assert.strictEqual(a.rect.y, 0);
    assert.strictEqual(b.rect.x, 4);
    assert.strictEqual(b.rect.y, 0);
    assert.strictEqual(c.rect.x, 8);
    assert.strictEqual(c.rect.y, 0);
  });

  test("colSpan exceeding column count clamps to remaining columns", () => {
    const tree = ui.grid(
      { columns: "4 4 4", rows: "2", gap: 0 },
      item({ gridColumn: 3, colSpan: 99 }),
    );
    const out = mustLayout(tree);
    const a = out.children[0];
    assert.ok(a !== undefined);
    if (!a) return;
    assert.strictEqual(a.rect.x, 8);
    assert.strictEqual(a.rect.w, 4);
  });
});
