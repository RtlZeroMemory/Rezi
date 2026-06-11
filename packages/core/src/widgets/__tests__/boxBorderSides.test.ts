import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../testing/index.js";
import { ui } from "../ui.js";

function render(node: ReturnType<typeof ui.box>, cols = 24, rows = 6): string[] {
  return createTestRenderer({ viewport: { cols, rows } }).render(node).toText().split("\n");
}

describe("box per-side borders", () => {
  test("left-only border renders a bar on a single-row box", () => {
    const lines = render(
      ui.box(
        {
          border: "single",
          borderTop: false,
          borderRight: false,
          borderBottom: false,
          borderLeft: true,
          pl: 1,
        },
        [ui.text("quote line")],
      ),
    );
    assert.equal(lines[0]?.startsWith("│ quote line"), true, lines.join("\n"));
  });

  test("left-only border covers every content row", () => {
    const lines = render(
      ui.box(
        {
          border: "single",
          borderTop: false,
          borderRight: false,
          borderBottom: false,
          borderLeft: true,
          pl: 1,
        },
        [ui.text("first"), ui.text("second")],
      ),
    );
    assert.equal(lines[0]?.startsWith("│ first"), true);
    assert.equal(lines[1]?.startsWith("│ second"), true);
  });

  test("right-only border renders at the box edge", () => {
    const lines = render(
      ui.box(
        {
          border: "single",
          borderTop: false,
          borderRight: true,
          borderBottom: false,
          borderLeft: false,
          width: 10,
        },
        [ui.text("ab")],
      ),
    );
    assert.equal(lines[0]?.trimEnd().endsWith("│"), true, lines.join("\n"));
    assert.equal(lines[0]?.includes("ab"), true);
  });

  test("left and right bars without horizontal edges render at h=1", () => {
    const lines = render(
      ui.box(
        {
          border: "single",
          borderTop: false,
          borderRight: true,
          borderBottom: false,
          borderLeft: true,
          width: 8,
        },
        [ui.text("x")],
      ),
    );
    const first = lines[0]?.trimEnd() ?? "";
    assert.equal(first.startsWith("│"), true, first);
    assert.equal(first.endsWith("│"), true, first);
  });

  test("top-only border renders a single rule above content", () => {
    const lines = render(
      ui.box(
        {
          border: "single",
          borderTop: true,
          borderRight: false,
          borderBottom: false,
          borderLeft: false,
          width: 6,
        },
        [ui.text("x")],
      ),
    );
    assert.equal(lines[0]?.startsWith("──"), true, lines.join("\n"));
    assert.equal(lines[1]?.includes("x"), true);
  });

  test("full borders keep corner requirements unchanged", () => {
    const lines = render(ui.box({ border: "single" }, [ui.text("x")]));
    assert.equal(lines[0]?.startsWith("┌"), true);
    assert.equal(lines[1]?.startsWith("│x"), true);
    assert.equal(lines[2]?.startsWith("└"), true);
  });
});
