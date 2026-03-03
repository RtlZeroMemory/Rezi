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
      ui.box({ id: "first", border: "none", width: 10 }, [
        ui.text("abcdefghijklmnopqrst", { wrap: true }),
      ]),
      ui.box({ id: "second", border: "none", width: 10 }, [ui.text("x")]),
    ]);
    const out = createTestRenderer({ viewport: { cols: 20, rows: 10 } }).render(tree);
    assert.equal(mustNodeById(out, "root").h, 2);
    assert.equal(mustNodeById(out, "first").w, 10);
    assert.equal(mustNodeById(out, "first").h, 2);
    assert.equal(mustNodeById(out, "second").x, 10);
  });

  test("wrap stack uses remeasured line cross-size before placing later lines", () => {
    const tree = ui.row({ id: "root", width: 8, wrap: true, gap: 1, align: "start" }, [
      ui.box({ id: "first", border: "none", width: 4 }, [ui.text("abcdefghij", { wrap: true })]),
      ui.box({ id: "second", border: "none", width: 4 }, [ui.text("x")]),
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

  test("engineering-style wide row keeps canvas pane visible across viewports", () => {
    const tree = ui.column({ id: "root", gap: 1, width: "full" }, [
      ui.panel("Engineering Controls", [ui.text("Control summary")]),
      ui.row({ id: "deck-layout", gap: 1, items: "stretch", width: "full" }, [
        ui.box({ id: "left-pane", border: "none", p: 0, flex: 2 }, [
          ui.panel("Reactor Schematic", [
            ui.canvas({
              id: "reactor-canvas",
              width: 44,
              height: 14,
              draw: (canvas) => {
                canvas.clear();
              },
            }),
          ]),
        ]),
        ui.box({ id: "right-pane", border: "none", p: 0, flex: 3 }, [
          ui.panel("Power Distribution", [
            ui.text("Power lanes"),
            ui.progress(0.8, { label: "Warp Core" }),
            ui.progress(0.7, { label: "Impulse Engines" }),
          ]),
        ]),
      ]),
    ]);

    const renderer = createTestRenderer();
    const wide = renderer.render(tree, { viewport: { cols: 300, rows: 68 } });
    const compact = renderer.render(tree, { viewport: { cols: 167, rows: 60 } });

    const wideCanvas = mustNodeById(wide, "reactor-canvas");
    const compactCanvas = mustNodeById(compact, "reactor-canvas");
    const wideLeft = mustNodeById(wide, "left-pane");
    const wideRight = mustNodeById(wide, "right-pane");
    const compactLeft = mustNodeById(compact, "left-pane");
    const compactRight = mustNodeById(compact, "right-pane");

    assert.equal(wideCanvas.w > 0, true);
    assert.equal(wideCanvas.h > 0, true);
    assert.equal(compactCanvas.w > 0, true);
    assert.equal(compactCanvas.h > 0, true);
    assert.equal(wideLeft.w > 0, true);
    assert.equal(wideRight.w > 0, true);
    assert.equal(compactLeft.w > 0, true);
    assert.equal(compactRight.w > 0, true);
  });
});
