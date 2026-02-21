import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../ui.js";

describe("editor widgets - VNode construction", () => {
  test("codeEditor creates VNode with all props", () => {
    const vnode = ui.codeEditor({
      id: "editor",
      lines: ["const x = 1;", "console.log(x);"],
      cursor: { line: 1, column: 2 },
      selection: {
        anchor: { line: 0, column: 0 },
        active: { line: 0, column: 5 },
      },
      scrollTop: 0,
      scrollLeft: 0,
      tabSize: 4,
      insertSpaces: true,
      lineNumbers: true,
      wordWrap: false,
      readOnly: false,
      searchQuery: "x",
      searchMatches: [{ line: 0, startColumn: 6, endColumn: 7 }],
      currentMatchIndex: 0,
      syntaxLanguage: "typescript",
      tokenizeLine: (line) => [{ text: line, kind: "plain" }],
      highlightActiveCursorCell: true,
      onChange: () => undefined,
      onSelectionChange: () => undefined,
      onScroll: () => undefined,
      onUndo: () => undefined,
      onRedo: () => undefined,
    });

    assert.equal(vnode.kind, "codeEditor");
    assert.equal(vnode.props.id, "editor");
    assert.equal(vnode.props.lines.length, 2);
    assert.equal(vnode.props.cursor.line, 1);
    assert.equal(vnode.props.tabSize, 4);
  });

  test("diffViewer creates VNode with unified and side-by-side settings", () => {
    const diff = {
      oldPath: "a.txt",
      newPath: "a.txt",
      status: "modified",
      hunks: [
        {
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 1,
          lines: [
            { type: "delete", content: "old", oldLineNumber: 1 },
            { type: "add", content: "new", newLineNumber: 1 },
          ],
        },
      ],
    } as const;

    const unified = ui.diffViewer({
      id: "diff-u",
      diff,
      mode: "unified",
      scrollTop: 0,
      expandedHunks: [0],
      focusedHunk: 0,
      lineNumbers: true,
      contextLines: 3,
      onScroll: () => undefined,
      onHunkToggle: () => undefined,
      onStageHunk: () => undefined,
      onUnstageHunk: () => undefined,
      onApplyHunk: () => undefined,
      onRevertHunk: () => undefined,
    });
    assert.equal(unified.kind, "diffViewer");
    assert.equal(unified.props.mode, "unified");

    const sideBySide = ui.diffViewer({
      id: "diff-s",
      diff,
      mode: "sideBySide",
      scrollTop: Number.NaN,
      onScroll: () => undefined,
    });
    assert.equal(sideBySide.kind, "diffViewer");
    assert.equal(sideBySide.props.mode, "sideBySide");
    assert.equal(Number.isNaN(sideBySide.props.scrollTop), true);
  });

  test("logsConsole creates VNode and preserves filters and edge numeric values", () => {
    const vnode = ui.logsConsole({
      id: "logs",
      entries: [
        {
          id: "1",
          timestamp: 0,
          level: "warn",
          source: "worker",
          message: "retrying",
          details: "line one",
          tokens: { input: 1, output: 2, total: 3 },
          durationMs: Number.POSITIVE_INFINITY,
          costCents: Number.NaN,
        },
      ],
      autoScroll: true,
      levelFilter: ["warn", "error"],
      sourceFilter: ["worker"],
      searchQuery: "retry",
      scrollTop: -1,
      showTimestamps: true,
      showSource: true,
      expandedEntries: ["1"],
      onScroll: () => undefined,
      onEntryToggle: () => undefined,
      onClear: () => undefined,
    });

    assert.equal(vnode.kind, "logsConsole");
    assert.equal(vnode.props.entries.length, 1);
    assert.equal(vnode.props.levelFilter?.length, 2);
    assert.equal(vnode.props.scrollTop, -1);
  });
});
