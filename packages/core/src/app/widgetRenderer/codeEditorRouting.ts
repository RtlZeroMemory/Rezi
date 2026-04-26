import type { ZrevEvent } from "../../events.js";
import {
  ZR_KEY_BACKSPACE,
  ZR_KEY_DELETE,
  ZR_KEY_DOWN,
  ZR_KEY_END,
  ZR_KEY_ENTER,
  ZR_KEY_HOME,
  ZR_KEY_LEFT,
  ZR_KEY_PAGE_DOWN,
  ZR_KEY_PAGE_UP,
  ZR_KEY_RIGHT,
  ZR_KEY_TAB,
  ZR_KEY_UP,
  ZR_MOD_CTRL,
  ZR_MOD_SHIFT,
} from "../../keybindings/keyCodes.js";
import type { Rect } from "../../layout/types.js";
import {
  computeAutoIndent,
  dedentLines,
  deleteCharAfter,
  deleteCharBefore,
  deleteRange,
  ensureCursorVisible,
  indentLines,
  insertText,
  moveCursor,
  moveCursorByWord,
  normalizeSelection,
} from "../../widgets/codeEditor.js";
import type { CodeEditorProps } from "../../widgets/types.js";
import { invokeCallbackSafely } from "./safeCallback.js";

export type CodeEditorRoutingResult = Readonly<{ needsRender: boolean }>;

export function routeCodeEditorKeyDown(
  event: ZrevEvent,
  editor: CodeEditorProps,
  rect: Rect | null,
): CodeEditorRoutingResult | null {
  if (event.kind !== "key" || event.action !== "down") return null;

  const isCtrl = (event.mods & ZR_MOD_CTRL) !== 0;
  const isShift = (event.mods & ZR_MOD_SHIFT) !== 0;

  const viewportHeight = rect ? Math.max(1, rect.h) : 1;
  const lineNumbers = editor.lineNumbers !== false;
  const lineNumWidth = lineNumbers ? String(editor.lines.length).length + 1 : 0;
  const viewportWidth = rect ? Math.max(1, rect.w - lineNumWidth) : 1;

  const tabSize = editor.tabSize ?? 2;
  const insertSpaces = editor.insertSpaces !== false;

  const clampCursor = (c: { line: number; column: number }) => {
    const line = Math.max(0, Math.min(c.line, Math.max(0, editor.lines.length - 1)));
    const text = editor.lines[line] ?? "";
    const column = Math.max(0, Math.min(c.column, text.length));
    return Object.freeze({ line, column });
  };

  const commitCursorMove = (nextCursorRaw: { line: number; column: number }) => {
    const nextCursor = clampCursor(nextCursorRaw);
    const nextSelection = isShift
      ? Object.freeze({
          anchor: editor.selection ? editor.selection.anchor : editor.cursor,
          active: nextCursor,
        })
      : null;

    if (isShift) {
      invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, nextSelection);
    } else if (editor.selection !== null) {
      invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
    }

    invokeCallbackSafely("codeEditor.onChange", editor.onChange, editor.lines, nextCursor);

    let nextScrollTop = editor.scrollTop;
    nextScrollTop = ensureCursorVisible(nextScrollTop, nextCursor, viewportHeight);

    let nextScrollLeft = editor.scrollLeft;
    if (nextCursor.column < nextScrollLeft) nextScrollLeft = nextCursor.column;
    else if (nextCursor.column >= nextScrollLeft + viewportWidth) {
      nextScrollLeft = Math.max(0, nextCursor.column - viewportWidth + 1);
    }

    if (nextScrollTop !== editor.scrollTop || nextScrollLeft !== editor.scrollLeft) {
      invokeCallbackSafely("codeEditor.onScroll", editor.onScroll, nextScrollTop, nextScrollLeft);
    }
  };

  // Undo/redo shortcuts
  if (isCtrl && event.key === 90 /* Z */) {
    if (isShift) {
      invokeCallbackSafely("codeEditor.onRedo", editor.onRedo);
    } else {
      invokeCallbackSafely("codeEditor.onUndo", editor.onUndo);
    }
    return Object.freeze({ needsRender: true });
  }
  if (isCtrl && event.key === 89 /* Y */) {
    invokeCallbackSafely("codeEditor.onRedo", editor.onRedo);
    return Object.freeze({ needsRender: true });
  }

  // Select all
  if (isCtrl && event.key === 65 /* A */) {
    const lastLine = Math.max(0, editor.lines.length - 1);
    const endCol = (editor.lines[lastLine] ?? "").length;
    invokeCallbackSafely(
      "codeEditor.onSelectionChange",
      editor.onSelectionChange,
      Object.freeze({
        anchor: Object.freeze({ line: 0, column: 0 }),
        active: Object.freeze({ line: lastLine, column: endCol }),
      }),
    );
    invokeCallbackSafely(
      "codeEditor.onChange",
      editor.onChange,
      editor.lines,
      Object.freeze({ line: lastLine, column: endCol }),
    );
    invokeCallbackSafely(
      "codeEditor.onScroll",
      editor.onScroll,
      ensureCursorVisible(editor.scrollTop, { line: lastLine, column: endCol }, viewportHeight),
      editor.scrollLeft,
    );
    return Object.freeze({ needsRender: true });
  }

  // Page scrolling
  if (event.key === ZR_KEY_PAGE_DOWN || event.key === ZR_KEY_PAGE_UP) {
    const dir = event.key === ZR_KEY_PAGE_UP ? -1 : 1;
    const maxScroll = Math.max(0, editor.lines.length - viewportHeight);
    const nextScrollTop = Math.max(0, Math.min(maxScroll, editor.scrollTop + dir * viewportHeight));
    if (nextScrollTop !== editor.scrollTop) {
      invokeCallbackSafely(
        "codeEditor.onScroll",
        editor.onScroll,
        nextScrollTop,
        editor.scrollLeft,
      );
      return Object.freeze({ needsRender: true });
    }
    return Object.freeze({ needsRender: false });
  }

  // Tab / shift+tab
  if (event.key === ZR_KEY_TAB && editor.readOnly !== true) {
    if (editor.selection) {
      const [start, end] = normalizeSelection(editor.selection);
      let startLine = start.line;
      let endLine = end.line;
      if (endLine > startLine && end.column === 0) endLine--;
      startLine = Math.max(0, Math.min(startLine, editor.lines.length - 1));
      endLine = Math.max(startLine, Math.min(endLine, editor.lines.length - 1));

      const nextLines = isShift
        ? dedentLines(editor.lines, Object.freeze([startLine, endLine]), tabSize)
        : indentLines(editor.lines, Object.freeze([startLine, endLine]), tabSize, insertSpaces);
      invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
      invokeCallbackSafely(
        "codeEditor.onChange",
        editor.onChange,
        nextLines,
        clampCursor(editor.cursor),
      );
      return Object.freeze({ needsRender: true });
    }

    if (isShift) {
      // Dedent current line.
      const line = editor.lines[editor.cursor.line] ?? "";
      let removed = 0;
      if (line.startsWith("\t")) removed = 1;
      else {
        while (removed < tabSize && removed < line.length && line[removed] === " ") removed++;
      }

      if (removed > 0) {
        const nextLines = dedentLines(
          editor.lines,
          Object.freeze([editor.cursor.line, editor.cursor.line]),
          tabSize,
        );
        const nextCursor = Object.freeze({
          line: editor.cursor.line,
          column: Math.max(0, editor.cursor.column - Math.min(editor.cursor.column, removed)),
        });
        invokeCallbackSafely(
          "codeEditor.onChange",
          editor.onChange,
          nextLines,
          clampCursor(nextCursor),
        );
        return Object.freeze({ needsRender: true });
      }
      return Object.freeze({ needsRender: false });
    }

    const indent = insertSpaces ? " ".repeat(tabSize) : "\t";
    const base = editor.selection ? deleteRange(editor.lines, editor.selection) : null;
    const next = insertText(
      base ? base.lines : editor.lines,
      base ? base.cursor : editor.cursor,
      indent,
    );
    if (editor.selection !== null) {
      invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
    }
    invokeCallbackSafely("codeEditor.onChange", editor.onChange, next.lines, next.cursor);
    return Object.freeze({ needsRender: true });
  }

  // Backspace/Delete
  if (editor.readOnly !== true && (event.key === ZR_KEY_BACKSPACE || event.key === ZR_KEY_DELETE)) {
    const next = editor.selection
      ? deleteRange(editor.lines, editor.selection)
      : event.key === ZR_KEY_BACKSPACE
        ? deleteCharBefore(editor.lines, editor.cursor)
        : deleteCharAfter(editor.lines, editor.cursor);
    if (editor.selection !== null) {
      invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
    }
    invokeCallbackSafely("codeEditor.onChange", editor.onChange, next.lines, next.cursor);
    return Object.freeze({ needsRender: true });
  }

  // Enter inserts newline + auto-indent
  if (editor.readOnly !== true && event.key === ZR_KEY_ENTER) {
    const base = editor.selection ? deleteRange(editor.lines, editor.selection) : null;
    const lines = base ? base.lines : editor.lines;
    const cursor = base ? base.cursor : editor.cursor;
    const indent = computeAutoIndent(lines, cursor, tabSize);
    const next = insertText(lines, cursor, `\n${indent}`);
    if (editor.selection !== null) {
      invokeCallbackSafely("codeEditor.onSelectionChange", editor.onSelectionChange, null);
    }
    invokeCallbackSafely("codeEditor.onChange", editor.onChange, next.lines, next.cursor);
    return Object.freeze({ needsRender: true });
  }

  // Cursor movement (arrows, home/end)
  if (
    event.key === ZR_KEY_UP ||
    event.key === ZR_KEY_DOWN ||
    event.key === ZR_KEY_LEFT ||
    event.key === ZR_KEY_RIGHT ||
    event.key === ZR_KEY_HOME ||
    event.key === ZR_KEY_END
  ) {
    if (isCtrl && (event.key === ZR_KEY_LEFT || event.key === ZR_KEY_RIGHT)) {
      const dir = event.key === ZR_KEY_LEFT ? "left" : "right";
      commitCursorMove(moveCursorByWord(editor.lines, editor.cursor, dir));
      return Object.freeze({ needsRender: true });
    }

    if (isCtrl && (event.key === ZR_KEY_HOME || event.key === ZR_KEY_END)) {
      commitCursorMove(
        moveCursor(editor.lines, editor.cursor, event.key === ZR_KEY_HOME ? "docStart" : "docEnd"),
      );
      return Object.freeze({ needsRender: true });
    }

    const dir =
      event.key === ZR_KEY_UP
        ? "up"
        : event.key === ZR_KEY_DOWN
          ? "down"
          : event.key === ZR_KEY_LEFT
            ? "left"
            : event.key === ZR_KEY_RIGHT
              ? "right"
              : event.key === ZR_KEY_HOME
                ? "home"
                : "end";
    commitCursorMove(moveCursor(editor.lines, editor.cursor, dir));
    return Object.freeze({ needsRender: true });
  }

  return null;
}
