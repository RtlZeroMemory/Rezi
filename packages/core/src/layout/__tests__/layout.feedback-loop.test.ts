import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { createTestRenderer } from "../../testing/renderer.js";

function mustNodeById(
  out: ReturnType<ReturnType<typeof createTestRenderer>["render"]>,
  id: string,
): Readonly<{ x: number; y: number; w: number; h: number }> {
  const node = out.findById(id);
  if (!node) assert.fail(`node not found: ${id}`);
  return node.rect;
}

describe("layout stack cross-axis feedback", () => {
  test("non-wrap stack remeasures wrapped content at final allocated width", () => {
    const tree = ui.row({ id: "root", width: 20, gap: 0, align: "start" }, [
      ui.box({ id: "first", border: "none", width: "50%" }, [
        ui.text("abcdefghijklmnopqrst", { wrap: true }),
      ]),
      ui.box({ id: "second", border: "none", width: "50%" }, [ui.text("x")]),
    ]);
    const out = createTestRenderer({ viewport: { cols: 20, rows: 10 } }).render(tree);
    assert.equal(mustNodeById(out, "root").h, 2);
    assert.equal(mustNodeById(out, "first").w, 10);
    assert.equal(mustNodeById(out, "first").h, 2);
    assert.equal(mustNodeById(out, "second").x, 10);
  });

  test("wrap stack uses remeasured line cross-size before placing later lines", () => {
    const tree = ui.row({ id: "root", width: 8, wrap: true, gap: 1, align: "start" }, [
      ui.box({ id: "first", border: "none", width: "50%" }, [
        ui.text("abcdefghij", { wrap: true }),
      ]),
      ui.box({ id: "second", border: "none", width: "50%" }, [ui.text("x")]),
    ]);
    const out = createTestRenderer({ viewport: { cols: 8, rows: 20 } }).render(tree);
    assert.equal(mustNodeById(out, "first").h, 3);
    assert.equal(mustNodeById(out, "second").y, 4); // 3 (line 1 cross) + 1 (line gap)
  });

  test("flex shrink remeasures wrapped content at shrunken final width", () => {
    const tree = ui.row({ id: "root", width: 8, gap: 0, align: "start" }, [
      ui.box({ id: "first", border: "none", width: 8, flexShrink: 1 }, [
        ui.text("ab cd ef gh", { wrap: true }),
      ]),
      ui.box({ id: "second", border: "none", width: 8, flexShrink: 1 }, [ui.text("x")]),
    ]);
    const out = createTestRenderer({ viewport: { cols: 8, rows: 20 } }).render(tree);
    assert.equal(mustNodeById(out, "first").w, 4);
    assert.equal(mustNodeById(out, "second").w, 4);
    assert.equal(mustNodeById(out, "first").h, 4);
    assert.equal(mustNodeById(out, "root").h, 4);
  });
});
