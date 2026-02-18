import { assert, describe, test } from "@rezi-ui/testkit";
import {
  computeAutoIndent,
  dedentLines,
  deleteRange,
  ensureCursorVisible,
  getSelectedText,
  insertText,
  moveCursor,
  moveCursorByWord,
} from "../codeEditor.js";
import type { CursorPosition, EditorSelection } from "../types.js";

function pos(line: number, column: number): CursorPosition {
  return { line, column };
}

function selection(anchor: CursorPosition, active: CursorPosition): EditorSelection {
  return { anchor, active };
}

describe("codeEditor.edge - empty and tiny documents", () => {
  const directions = ["up", "down", "left", "right", "home", "end", "docStart", "docEnd"] as const;

  for (const direction of directions) {
    test(`moveCursor on empty document is stable for ${direction}`, () => {
      assert.deepEqual(moveCursor([], pos(10, 10), direction), pos(0, 0));
    });
  }

  test("moveCursorByWord on empty document is stable", () => {
    assert.deepEqual(moveCursorByWord([], pos(99, 99), "left"), pos(0, 0));
    assert.deepEqual(moveCursorByWord([], pos(99, 99), "right"), pos(0, 0));
  });

  test("single-character document supports insert and delete", () => {
    const inserted = insertText(["a"], pos(0, 1), "b");
    assert.deepEqual(inserted.lines, ["ab"]);

    const deleted = deleteRange(inserted.lines, selection(pos(0, 1), pos(0, 2)));
    assert.deepEqual(deleted.lines, ["a"]);
  });
});

describe("codeEditor.edge - large content boundaries", () => {
  test("1000+ char line preserves deterministic cursor math", () => {
    const longLine = "x".repeat(1500);
    const inserted = insertText([longLine], pos(0, 1500), "Y");
    assert.equal(inserted.lines[0]?.length, 1501);
    assert.deepEqual(inserted.cursor, pos(0, 1501));

    const end = moveCursor(inserted.lines, pos(0, 0), "end");
    assert.deepEqual(end, pos(0, 1501));
  });

  test("10k+ lines docEnd lands on final line", () => {
    const lines = Array.from({ length: 10001 }, (_, i) => `line-${i}`);
    const end = moveCursor(lines, pos(0, 0), "docEnd");
    assert.equal(end.line, 10000);
    assert.equal(end.column, "line-10000".length);
  });

  test("ensureCursorVisible handles large negative/positive scroll values", () => {
    const top = ensureCursorVisible(-500, pos(0, 0), 20);
    const deep = ensureCursorVisible(10, pos(50_000, 0), 30);
    assert.equal(top, 0);
    assert.equal(deep, 49_971);
  });
});

describe("codeEditor.edge - mixed whitespace and clamped ranges", () => {
  test("computeAutoIndent preserves tabs/spaces prefix", () => {
    const lines = ["\t  if (x) {"];
    const indent = computeAutoIndent(lines, pos(0, lines[0]?.length ?? 0), 2);
    assert.equal(indent, "\t    ");
  });

  test("dedentLines handles mixed tabs/spaces consistently", () => {
    const lines = ["\tfoo", "    bar", "  baz", "qux"];
    const dedented = dedentLines(lines, [0, 3], 2);
    assert.deepEqual(dedented, ["foo", "  bar", "baz", "qux"]);
  });

  test("deleteRange clamps line/column bounds on malformed selection", () => {
    const lines = ["ab", "cd", "ef"];
    const result = deleteRange(lines, selection(pos(-99, -4), pos(99, 99)));
    assert.deepEqual(result.lines, [""]);
    assert.deepEqual(result.cursor, pos(0, 0));
  });

  test("getSelectedText tolerates out-of-range lines without throwing", () => {
    const lines = ["ab", "cd"];
    const text = getSelectedText(lines, selection(pos(0, 1), pos(2, 9)));
    assert.equal(text, "b\ncd\n");
  });
});
