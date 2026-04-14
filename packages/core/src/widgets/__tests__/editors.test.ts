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
});
