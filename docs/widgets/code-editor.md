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
| `diagnostics` | `{ range: { start: { line: number; column: number }; end: { line: number; column: number } }; severity?: "error" \| "warning" \| "info" \| "hint"; message?: string }[]` | - | Inline diagnostics rendered with curly underlines |
| `onChange` | `(lines, cursor) => void` | **required** | Content change callback |
| `onSelectionChange` | `(selection) => void` | **required** | Selection change callback |
| `onScroll` | `(scrollTop, scrollLeft) => void` | **required** | Scroll callback |
| `onUndo` | `() => void` | - | Undo callback |
| `onRedo` | `() => void` | - | Redo callback |

## Mouse Behavior

- **Mouse scroll wheel** scrolls the editor vertically and horizontally, firing the `onScroll` callback.
- **Clicking** the editor area focuses the widget.

## Notes

- `lines` is the source of truth; update it in `onChange` to keep the editor controlled.
- Diagnostic ranges render with themed curly underlines when provided.

## Related

- [Diff viewer](diff-viewer.md)
- [Logs console](logs-console.md)
