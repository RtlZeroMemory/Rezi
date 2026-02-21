import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  clampCodeCursor,
  createCodeEditorState,
  findBannerCursor,
  joinCodeLines,
  splitCodeDraft,
} from "../hsr/widget-code-editor-state.mjs";

describe("widget code editor state helper", () => {
  test("splitCodeDraft normalizes CRLF and always returns at least one line", () => {
    assert.deepEqual(splitCodeDraft("a\r\nb\r\n"), ["a", "b", ""]);
    assert.deepEqual(splitCodeDraft(""), [""]);
    assert.deepEqual(splitCodeDraft(undefined), [""]);
  });

  test("joinCodeLines is deterministic for invalid/empty input", () => {
    assert.equal(joinCodeLines([]), "");
    assert.equal(joinCodeLines(undefined), "");
    assert.equal(joinCodeLines(["a", "b"]), "a\nb");
  });

  test("clampCodeCursor clamps out-of-range line/column values", () => {
    const lines = ["one", "two"];
    assert.deepEqual(clampCodeCursor(lines, { line: 9, column: 99 }), { line: 1, column: 3 });
    assert.deepEqual(clampCodeCursor(lines, { line: -2, column: -1 }), { line: 0, column: 0 });
  });

  test("findBannerCursor lands on SELF_EDIT_BANNER string position", () => {
    const lines = [
      'import { ui } from "@rezi-ui/core";',
      'export const SELF_EDIT_BANNER = "REZO";',
      "export function render() {}",
    ];
    const cursor = findBannerCursor(lines);
    assert.equal(cursor.line, 1);
    assert.equal(cursor.column > 0, true);
  });

  test("findBannerCursor falls back to the end of the last line when marker is absent", () => {
    const lines = ["const a = 1;", "const b = 2;"];
    const cursor = findBannerCursor(lines);
    assert.deepEqual(cursor, { line: 1, column: 12 });
  });

  test("createCodeEditorState composes normalized lines/cursor with defaults", () => {
    const state = createCodeEditorState('export const SELF_EDIT_BANNER = "X";');
    assert.equal(Array.isArray(state.lines), true);
    assert.equal(state.lines.length >= 1, true);
    assert.equal(typeof state.cursor.line, "number");
    assert.equal(state.selection, null);
    assert.equal(state.scrollTop, 0);
    assert.equal(state.scrollLeft, 0);
  });

  test("createCodeEditorState honors cursor/scroll options and clamps invalid cursor", () => {
    const state = createCodeEditorState("one\ntwo", {
      cursor: { line: 99, column: 99 },
      scrollTop: 5.8,
      scrollLeft: 3.3,
    });
    assert.deepEqual(state.cursor, { line: 1, column: 3 });
    assert.equal(state.scrollTop, 5);
    assert.equal(state.scrollLeft, 3);
  });
});
