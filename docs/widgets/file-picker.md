# `FilePicker`

File picker widget for browsing and selecting workspace files. Rezi core does not read the filesystem; you provide the file tree data.

## Usage

```ts
ui.filePicker({
  id: "picker",
  rootPath: state.rootPath,
  data: state.data,
  selectedPath: state.selectedPath,
  expandedPaths: state.expandedPaths,
  onSelect: (path) => app.update((s) => ({ ...s, selectedPath: path })),
  onChange: (path, expanded) =>
    app.update((s) => ({
      ...s,
      expandedPaths: expanded
        ? [...s.expandedPaths, path]
        : s.expandedPaths.filter((p) => p !== path),
    })),
  onPress: (path) => openFile(path),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `rootPath` | `string` | **required** | Root path label |
| `data` | `FileNode \| FileNode[]` | **required** | File tree data |
| `selectedPath` | `string` | - | Active file path. In multi-select mode this remains the keyboard and shift-click anchor. |
| `expandedPaths` | `string[]` | **required** | Expanded directory paths |
| `modifiedPaths` | `string[]` | - | Modified file paths |
| `stagedPaths` | `string[]` | - | Staged file paths |
| `filter` | `string` | - | Accepted by the API but not currently applied by the core renderer |
| `showHidden` | `boolean` | - | Accepted by the API but not currently applied by the core renderer |
| `multiSelect` | `boolean` | - | Enable controlled multi-select rendering and interaction |
| `selection` | `string[]` | - | Controlled selected paths when `multiSelect` is `true` |
| `onSelect` | `(path) => void` | **required** | Active-path callback. Update `selectedPath` here. |
| `onChange` | `(path, expanded) => void` | **required** | Expand/collapse callback |
| `onPress` | `(path) => void` | **required** | Open callback |
| `onSelectionChange` | `(paths) => void` | - | Controlled multi-select callback |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused row highlight |

## Notes

- `FileNode` includes `name`, `path`, `type`, and optional `children` and `status`.
- Single-select highlighting comes from `selectedPath`.
- When `multiSelect` is `true`, checked/highlighted rows come from `selection` while `selectedPath` remains the active row for keyboard navigation and shift-click range selection.
- Mouse plain click selects one row, Ctrl-click toggles the clicked row, Shift-click extends from the active `selectedPath`, and keyboard `Space` toggles the focused row.

## Related

- [File tree explorer](file-tree-explorer.md)
- [Tree](tree.md)
