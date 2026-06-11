import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../testing/index.js";
import { darkTheme, lightTheme } from "../../theme/presets.js";
import { ui } from "../ui.js";

const KITCHEN_SINK = [
  "# Release notes",
  "",
  "Ships `ui.markdown` with **bold**, *italic*, ~~gone~~, and [links](https://rezitui.dev).",
  "",
  "- [x] parser",
  "- [ ] docs",
  "- plain item",
  "  - nested item",
  "",
  "1. first",
  "2. second",
  "",
  "> Quoted wisdom",
  "> spanning lines.",
  "",
  "```ts",
  "const x: number = 1; // comment",
  "```",
  "",
  "| Name | Count |",
  "| :--- | ----: |",
  "| core | 12    |",
  "",
  "---",
  "",
  "Done. See https://rezitui.dev/docs for more.",
].join("\n");

function renderToText(source: string, cols = 56, rows = 44): string {
  return createTestRenderer({ viewport: { cols, rows } }).render(ui.markdown(source)).toText();
}

describe("ui.markdown rendered output", () => {
  test("kitchen-sink document renders every block type", () => {
    const out = renderToText(KITCHEN_SINK);

    assert.ok(out.includes("Release notes"), "heading text");
    assert.ok(
      out.includes("Ships ui.markdown with bold, italic, gone, and links."),
      `inline flow with glued punctuation, got:\n${out}`,
    );
    assert.ok(out.includes("[x] parser"), "checked task");
    assert.ok(out.includes("[ ] docs"), "unchecked task");
    assert.ok(out.includes("• nested item"), "nested bullet");
    assert.ok(out.includes("1. first") && out.includes("2. second"), "ordered list");
    assert.ok(out.includes("╭") && out.includes("Quoted wisdom spanning lines."), "quote box");
    assert.ok(out.includes("const x: number = 1; // comment"), "code block content");
    assert.ok(out.includes("┌") && out.includes("└"), "code block frame");
    assert.ok(out.includes("Name │ Count"), "table header");
    assert.ok(out.includes("─┼─"), "table rule");
    assert.ok(/core │ +12/.test(out), "right-aligned table cell");
    assert.ok(out.includes("Done. See https://rezitui.dev/docs for more."), "bare url paragraph");
  });

  test("nested list items render tight without blank rows", () => {
    const out = renderToText("- parent\n  - child");
    const lines = out.split("\n").filter((line) => line.trim().length > 0);
    const parentIndex = lines.findIndex((line) => line.includes("parent"));
    const childLine = lines[parentIndex + 1];
    assert.ok(childLine?.includes("child"), out);
  });

  test("styled paragraphs wrap inside narrow viewports", () => {
    const out = renderToText("**alpha beta gamma delta epsilon zeta**", 14, 12);
    const lines = out.split("\n").filter((line) => line.trim().length > 0);
    assert.ok(lines.length >= 3, `expected wrapping, got:\n${out}`);
    for (const word of ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]) {
      assert.ok(out.includes(word), `missing word ${word}`);
    }
    for (const line of out.split("\n")) {
      assert.ok(line.length <= 14, `line exceeds viewport: ${JSON.stringify(line)}`);
    }
  });

  test("blockGap controls spacing between top-level blocks", () => {
    const tight = renderToText("# head\n\nbody", 30, 8).split("\n");
    const headIndex = tight.findIndex((line) => line.includes("head"));
    assert.ok(tight[headIndex + 1]?.trim() === "", "default gap leaves one blank row");
    assert.ok(tight[headIndex + 2]?.includes("body"));

    const zero = createTestRenderer({ viewport: { cols: 30, rows: 8 } })
      .render(ui.markdown("# head\n\nbody", { blockGap: 0 }))
      .toText()
      .split("\n");
    const zeroHead = zero.findIndex((line) => line.includes("head"));
    assert.ok(zero[zeroHead + 1]?.includes("body"), "blockGap 0 removes the blank row");
  });

  test("empty and whitespace-only sources render nothing", () => {
    assert.equal(renderToText("", 20, 4).trim(), "");
    assert.equal(renderToText("   \n\n  ", 20, 4).trim(), "");
  });

  test("output text is theme-independent", () => {
    const dark = createTestRenderer({ viewport: { cols: 48, rows: 40 }, theme: darkTheme })
      .render(ui.markdown(KITCHEN_SINK))
      .toText();
    const light = createTestRenderer({ viewport: { cols: 48, rows: 40 }, theme: lightTheme })
      .render(ui.markdown(KITCHEN_SINK))
      .toText();
    assert.equal(dark, light);
  });

  test("raw html renders as literal text", () => {
    const out = renderToText('before <div class="x"> after');
    assert.ok(out.includes('<div class="x">'), out);
  });
});
