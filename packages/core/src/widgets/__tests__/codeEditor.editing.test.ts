import { assert, describe, test } from "@rezi-ui/testkit";
import type { EditAction, EditResult } from "../codeEditor.js";
import {
  MAX_UNDO_STACK,
  UNDO_GROUP_WINDOW,
  UndoStack,
  computeAutoIndent,
  dedentLines,
  deleteCharAfter,
  deleteCharBefore,
  deleteRange,
  indentLines,
  insertText,
} from "../codeEditor.js";
import type { CursorPosition, EditorSelection } from "../types.js";

function pos(line: number, column: number): CursorPosition {
  return { line, column };
}

function sel(
  anchorLine: number,
  anchorColumn: number,
  activeLine: number,
  activeColumn: number,
): EditorSelection {
  return {
    anchor: pos(anchorLine, anchorColumn),
    active: pos(activeLine, activeColumn),
  };
}

function assertEdit(
  result: EditResult,
  expectedLines: readonly string[],
  line: number,
  column: number,
): void {
  assert.deepEqual(result.lines, expectedLines);
  assert.equal(result.cursor.line, line);
  assert.equal(result.cursor.column, column);
  assert.equal(result.selection, null);
}

describe("codeEditor.editing - insert/delete core", () => {
  const insertCases = [
    {
      name: "inserts into empty document",
      lines: [] as readonly string[],
      cursor: pos(0, 0),
      text: "hello",
      expectedLines: ["hello"],
      expectedCursor: pos(0, 5),
    },
    {
      name: "clamps negative cursor",
      lines: ["abcd"],
      cursor: pos(-5, -5),
      text: "X",
      expectedLines: ["Xabcd"],
      expectedCursor: pos(0, 1),
    },
    {
      name: "clamps out-of-range cursor to line end",
      lines: ["ab"],
      cursor: pos(10, 50),
      text: "Z",
      expectedLines: ["abZ"],
      expectedCursor: pos(0, 3),
    },
    {
      name: "single-line insert in middle",
      lines: ["abcde"],
      cursor: pos(0, 2),
      text: "--",
      expectedLines: ["ab--cde"],
      expectedCursor: pos(0, 4),
    },
    {
      name: "multiline insert splits current line",
      lines: ["abcd"],
      cursor: pos(0, 2),
      text: "X\nY",
      expectedLines: ["abX", "Ycd"],
      expectedCursor: pos(1, 1),
    },
    {
      name: "multiline insert with empty middle line",
      lines: ["abcd"],
      cursor: pos(0, 2),
      text: "X\n\nY",
      expectedLines: ["abX", "", "Ycd"],
      expectedCursor: pos(2, 1),
    },
  ] as const;

  for (const c of insertCases) {
    test(`insertText ${c.name}`, () => {
      const result = insertText(c.lines, c.cursor, c.text);
      assertEdit(result, c.expectedLines, c.expectedCursor.line, c.expectedCursor.column);
    });
  }

  const deleteCases = [
    {
      name: "deletes same-line range",
      lines: ["abcdef"],
      selection: sel(0, 2, 0, 4),
      expectedLines: ["abef"],
      expectedCursor: pos(0, 2),
    },
    {
      name: "deletes multi-line range and joins",
      lines: ["ab", "cd", "ef"],
      selection: sel(0, 1, 2, 1),
      expectedLines: ["af"],
      expectedCursor: pos(0, 1),
    },
    {
      name: "normalizes reversed selection",
      lines: ["abcdef"],
      selection: sel(0, 5, 0, 2),
      expectedLines: ["abf"],
      expectedCursor: pos(0, 2),
    },
    {
      name: "clamps out-of-range selection coordinates",
      lines: ["ab", "cd"],
      selection: sel(-10, -10, 10, 10),
      expectedLines: [""],
      expectedCursor: pos(0, 0),
    },
  ] as const;

  for (const c of deleteCases) {
    test(`deleteRange ${c.name}`, () => {
      const result = deleteRange(c.lines, c.selection);
      assertEdit(result, c.expectedLines, c.expectedCursor.line, c.expectedCursor.column);
    });
  }

  const backspaceCases = [
    {
      name: "deletes previous character",
      lines: ["abc"],
      cursor: pos(0, 2),
      expectedLines: ["ac"],
      expectedCursor: pos(0, 1),
    },
    {
      name: "joins with previous line at column zero",
      lines: ["ab", "cd"],
      cursor: pos(1, 0),
      expectedLines: ["abcd"],
      expectedCursor: pos(0, 2),
    },
    {
      name: "no-op at document start",
      lines: ["ab"],
      cursor: pos(0, 0),
      expectedLines: ["ab"],
      expectedCursor: pos(0, 0),
    },
  ] as const;

  for (const c of backspaceCases) {
    test(`deleteCharBefore ${c.name}`, () => {
      const result = deleteCharBefore(c.lines, c.cursor);
      assertEdit(result, c.expectedLines, c.expectedCursor.line, c.expectedCursor.column);
    });
  }

  const deleteCasesAfter = [
    {
      name: "deletes next character",
      lines: ["abc"],
      cursor: pos(0, 1),
      expectedLines: ["ac"],
      expectedCursor: pos(0, 1),
    },
    {
      name: "joins with next line at end",
      lines: ["ab", "cd"],
      cursor: pos(0, 2),
      expectedLines: ["abcd"],
      expectedCursor: pos(0, 2),
    },
    {
      name: "no-op at document end",
      lines: ["ab"],
      cursor: pos(0, 2),
      expectedLines: ["ab"],
      expectedCursor: pos(0, 2),
    },
  ] as const;

  for (const c of deleteCasesAfter) {
    test(`deleteCharAfter ${c.name}`, () => {
      const result = deleteCharAfter(c.lines, c.cursor);
      assertEdit(result, c.expectedLines, c.expectedCursor.line, c.expectedCursor.column);
    });
  }
});

describe("codeEditor.editing - indentation helpers", () => {
  const indentTriggers = [
    { suffix: "{", expected: "  " },
    { suffix: "[", expected: "  " },
    { suffix: "(", expected: "  " },
    { suffix: ":", expected: "  " },
    { suffix: ";", expected: "" },
  ] as const;

  for (const c of indentTriggers) {
    test(`computeAutoIndent reacts to '${c.suffix}'`, () => {
      const lines = [`    if x ${c.suffix}`];
      const result = computeAutoIndent(lines, pos(0, lines[0]?.length ?? 0), 2);
      assert.equal(result, `    ${c.expected}`);
    });
  }

  test("indentLines uses spaces by default", () => {
    const result = indentLines(["a", "b", "c"], [0, 1], 2, true);
    assert.deepEqual(result, ["  a", "  b", "c"]);
  });

  test("indentLines can use tabs", () => {
    const result = indentLines(["a", "b"], [0, 1], 4, false);
    assert.deepEqual(result, ["\ta", "\tb"]);
  });

  test("dedentLines removes up to tabSize spaces or one tab", () => {
    const result = dedentLines(["    a", "\tb", " c"], [0, 2], 2);
    assert.deepEqual(result, ["  a", "b", "c"]);
  });
});

describe("codeEditor.editing - undo/redo stack integrity", () => {
  function action(type: EditAction["type"], text: string, timestamp: number): EditAction {
    return {
      type,
      range: sel(0, 0, 0, text.length),
      text,
      timestamp,
    };
  }

  test("groups adjacent actions of same type within window", () => {
    const stack = new UndoStack();
    stack.push(action("insert", "a", 100));
    stack.push(action("insert", "ab", 100 + UNDO_GROUP_WINDOW - 1));

    const firstUndo = stack.undo();
    const secondUndo = stack.undo();
    assert.equal(firstUndo?.text, "ab");
    assert.equal(secondUndo, null);
  });

  test("does not group actions outside grouping window", () => {
    const stack = new UndoStack();
    stack.push(action("insert", "a", 100));
    stack.push(action("insert", "ab", 100 + UNDO_GROUP_WINDOW + 1));

    const firstUndo = stack.undo();
    const secondUndo = stack.undo();
    assert.equal(firstUndo?.text, "ab");
    assert.equal(secondUndo?.text, "a");
  });

  test("does not group different action types", () => {
    const stack = new UndoStack();
    stack.push(action("insert", "a", 100));
    stack.push(action("delete", "", 101));

    assert.equal(stack.undo()?.type, "delete");
    assert.equal(stack.undo()?.type, "insert");
  });

  test("new push clears redo stack", () => {
    const stack = new UndoStack();
    stack.push(action("insert", "a", 100));
    const undone = stack.undo();
    assert.equal(undone?.text, "a");
    assert.equal(stack.canRedo(), true);

    stack.push(action("insert", "b", 100 + UNDO_GROUP_WINDOW + 1));
    assert.equal(stack.canRedo(), false);
  });

  test("enforces MAX_UNDO_STACK bound without corruption", () => {
    const stack = new UndoStack();
    for (let i = 0; i < MAX_UNDO_STACK + 5; i++) {
      stack.push(action("insert", String(i), i * (UNDO_GROUP_WINDOW + 1)));
    }

    let undoCount = 0;
    while (stack.undo()) {
      undoCount++;
    }
    assert.equal(undoCount, MAX_UNDO_STACK);
  });

  test("clear resets both stacks", () => {
    const stack = new UndoStack();
    stack.push(action("insert", "a", 1));
    stack.undo();
    stack.clear();

    assert.equal(stack.canUndo(), false);
    assert.equal(stack.canRedo(), false);
    assert.equal(stack.undo(), null);
    assert.equal(stack.redo(), null);
  });
});
