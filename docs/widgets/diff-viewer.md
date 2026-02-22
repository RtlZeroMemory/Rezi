# `DiffViewer`

Renders unified or side-by-side diffs with hunk navigation.

## Usage

```ts
ui.diffViewer({
  id: "diff",
  diff: state.diff,
  mode: "unified",
  scrollTop: state.scrollTop,
  lineNumbers: true,
  contextLines: 3,
  onScroll: (top) => app.update((s) => ({ ...s, scrollTop: top })),
  onStageHunk: (i) => stageHunk(i),
  onRevertHunk: (i) => revertHunk(i),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `diff` | `DiffData` | **required** | Diff data model |
| `mode` | `"unified" \| "sideBySide"` | **required** | Render mode |
| `scrollTop` | `number` | **required** | Scroll offset (lines) |
| `lineNumbers` | `boolean` | `true` | Show line numbers |
| `contextLines` | `number` | `3` | Context lines around changes |
| `expandedHunks` | `number[]` | - | Hunks expanded beyond default threshold |
| `focusedHunk` | `number` | - | Focused hunk index |
| `onScroll` | `(scrollTop) => void` | **required** | Scroll callback |
| `onHunkToggle` | `(index, expanded) => void` | - | Expand/collapse callback |
| `onStageHunk` | `(index) => void` | - | Stage callback |
| `onUnstageHunk` | `(index) => void` | - | Unstage callback |
| `onApplyHunk` | `(index) => void` | - | Apply callback |
| `onRevertHunk` | `(index) => void` | - | Revert callback |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focus decoration |
| `scrollbarVariant` | `"minimal" \| "classic" \| "modern" \| "dots" \| "thin"` | `"minimal"` | Scrollbar glyph variant |
| `scrollbarStyle` | `TextStyle` | - | Style override for scrollbar |

## Scrollbar

A vertical scrollbar is rendered on the right edge when content exceeds the viewport height. Set `scrollbarVariant` to choose a glyph style. Use `scrollbarStyle` to override scrollbar colors.

## Mouse Behavior

- **Mouse scroll wheel** scrolls diff content, firing the `onScroll` callback. Scroll works when hovering over the widget, even without focus.
- **Clicking** the viewer area focuses the widget.

## Notes

- `DiffData` includes file paths, hunks, and optional binary flag.
- Provide `expandedHunks` to keep large hunks open by default.

## Related

- [Logs console](logs-console.md)
