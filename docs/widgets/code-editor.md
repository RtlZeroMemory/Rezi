# `CodeEditor`

Code-oriented text editor widget (cursor, selection, search, and scrolling).

## Usage

```ts
ui.codeEditor({
  id: "editor",
  lines: state.lines,
  cursor: state.cursor,
  selection: state.selection,
  scrollTop: state.scrollTop,
  scrollLeft: state.scrollLeft,
  syntaxLanguage: "typescript",
  lineNumbers: true,
  tabSize: 2,
  onChange: (lines, cursor) => app.update((s) => ({ ...s, lines, cursor })),
  onSelectionChange: (sel) => app.update((s) => ({ ...s, selection: sel })),
  onScroll: (top, left) => app.update((s) => ({ ...s, scrollTop: top, scrollLeft: left })),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `lines` | `string[]` | **required** | Document content (lines) |
| `cursor` | `{ line: number; column: number }` | **required** | Cursor position (0-based) |
| `selection` | `EditorSelection \| null` | **required** | Selection range |
| `scrollTop` | `number` | **required** | Vertical scroll (lines) |
| `scrollLeft` | `number` | **required** | Horizontal scroll (columns) |
| `tabSize` | `number` | `2` | Tab width |
| `insertSpaces` | `boolean` | `true` | Insert spaces instead of tabs |
| `lineNumbers` | `boolean` | `true` | Show line numbers |
| `wordWrap` | `boolean` | `false` | Wrap long lines |
| `readOnly` | `boolean` | `false` | Read-only mode |
| `searchQuery` | `string` | - | Search text |
| `searchMatches` | `SearchMatch[]` | - | Match ranges |
| `currentMatchIndex` | `number` | - | Highlighted match |
| `diagnostics` | `{ line: number; startColumn: number; endColumn: number; severity: "error" \| "warning" \| "info" \| "hint"; message?: string }[]` | - | Inline diagnostics rendered with curly underlines |
| `syntaxLanguage` | `"plain" \| "typescript" \| "javascript" \| "json" \| "go" \| "rust" \| "c" \| "cpp" \| "c++" \| "csharp" \| "c#" \| "java" \| "python" \| "bash"` | `"plain"` | Built-in syntax preset |
| `tokenizeLine` | `(line, context) => CodeEditorSyntaxToken[]` | - | Custom per-line tokenizer override |
| `highlightActiveCursorCell` | `boolean` | `true` | Draw a visible highlighted cursor cell |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses active cursor cell highlight (equivalent to `highlightActiveCursorCell: false` when focused) |
| `onChange` | `(lines, cursor) => void` | **required** | Content change callback |
| `onSelectionChange` | `(selection) => void` | **required** | Selection change callback |
| `onScroll` | `(scrollTop, scrollLeft) => void` | **required** | Scroll callback |
| `onUndo` | `() => void` | - | Undo callback |
| `onRedo` | `() => void` | - | Redo callback |

## Syntax Tokenization

`ui.codeEditor` supports built-in lexical highlighting presets through `syntaxLanguage`.

Supported presets:

- `plain`
- `typescript`, `javascript`, `json`
- `go`, `rust`
- `c`, `cpp` (`c++` alias), `csharp` (`c#` alias), `java`
- `python`, `bash`

You can also override tokenization with `tokenizeLine` for DSLs or domain-specific snippets.

```ts
import { tokenizeCodeEditorLine, ui } from "@rezi-ui/core";

ui.codeEditor({
  id: "editor",
  lines: state.lines,
  cursor: state.cursor,
  selection: state.selection,
  scrollTop: state.scrollTop,
  scrollLeft: state.scrollLeft,
  syntaxLanguage: "plain",
  tokenizeLine: (line, context) => {
    // Domain keyword override, then fallback to built-in tokenizer.
    if (line.startsWith("SERVICE ")) {
      return [{ start: 0, end: 7, kind: "keyword" }];
    }
    return tokenizeCodeEditorLine(line, context);
  },
  onChange: (lines, cursor) => app.update((s) => ({ ...s, lines, cursor })),
  onSelectionChange: (selection) => app.update((s) => ({ ...s, selection })),
  onScroll: (scrollTop, scrollLeft) => app.update((s) => ({ ...s, scrollTop, scrollLeft })),
})
```

## Mouse Behavior

- **Mouse scroll wheel** scrolls the editor vertically and horizontally, firing the `onScroll` callback.
- **Clicking** the editor area focuses the widget.

## Keyboard Clipboard

- **Ctrl+C** copies the active selection to system clipboard via OSC 52.
- **Ctrl+X** cuts the active selection (when `readOnly !== true`) and writes it to system clipboard via OSC 52.

## Notes

- `lines` is the source of truth; update it in `onChange` to keep the editor controlled.
- Diagnostic ranges render with themed curly underlines when provided.
- Syntax highlighting is lexical and line-based; you can use built-in language presets or provide `tokenizeLine` for custom DSLs.
- Unknown/unsupported language names safely fall back to `plain`.

## Related

- [Diff viewer](diff-viewer.md)
- [Logs console](logs-console.md)
