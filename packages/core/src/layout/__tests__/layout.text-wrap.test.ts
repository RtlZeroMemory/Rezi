import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";

function mustLayout(
  node: ReturnType<typeof ui.text> | ReturnType<typeof ui.row>,
  maxW: number,
  maxH: number,
) {
  const res = layout(node, 0, 0, maxW, maxH, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

describe("layout text wrap", () => {
  test("wrap=true wraps to multiple lines", () => {
    const out = mustLayout(ui.text("hello world", { wrap: true }), 6, 10);
    assert.strictEqual(out.rect.h, 2);
  });

  test("wrap=false remains single line", () => {
    const out = mustLayout(ui.text("hello world"), 6, 10);
    assert.strictEqual(out.rect.h, 1);
  });

  test("long word hard-breaks by grapheme width", () => {
    const out = mustLayout(ui.text("abcdefghij", { wrap: true }), 4, 10);
    assert.strictEqual(out.rect.h, 3);
  });

  test("wrap preserves repeated spaces instead of collapsing whitespace", () => {
    const out = mustLayout(ui.text("a  b", { wrap: true }), 3, 10);
    assert.strictEqual(out.rect.h, 2);
  });

  test("\\n forces line break", () => {
    const out = mustLayout(ui.text("foo\nbar baz", { wrap: true }), 7, 10);
    assert.strictEqual(out.rect.h, 2);
  });

  test("empty text with wrap has zero height", () => {
    const out = mustLayout(ui.text("", { wrap: true }), 10, 10);
    assert.strictEqual(out.rect.h, 0);
  });

  test("row cross-axis sizing uses wrapped text height", () => {
    const row = ui.row({ width: 6, gap: 0 }, [ui.text("hello world", { wrap: true })]);
    const res = layout(row, 0, 0, 6, 10, "row");
    assert.ok(res.ok);
    assert.strictEqual(res.value.rect.h, 2);
    assert.strictEqual(res.value.children[0]?.rect.h, 2);
  });

  test("maxWidth limits wrap width", () => {
    const out = mustLayout(ui.text("one two three", { wrap: true, maxWidth: 5 }), 20, 10);
    assert.strictEqual(out.rect.w, 5);
    assert.strictEqual(out.rect.h, 3);
  });

  test("CJK double-width text wraps in cell units", () => {
    const out = mustLayout(ui.text("你好世界你好", { wrap: true }), 4, 10);
    assert.strictEqual(out.rect.h, 3);
  });
});
