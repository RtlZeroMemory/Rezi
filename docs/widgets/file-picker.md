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
  onToggle: (path, expanded) =>
    app.update((s) => ({
      ...s,
      expandedPaths: expanded
        ? [...s.expandedPaths, path]
        : s.expandedPaths.filter((p) => p !== path),
    })),
  onOpen: (path) => openFile(path),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `rootPath` | `string` | **required** | Root path label |
| `data` | `FileNode \| FileNode[]` | **required** | File tree data |
| `selectedPath` | `string` | - | Selected file path |
| `expandedPaths` | `string[]` | **required** | Expanded directory paths |
| `modifiedPaths` | `string[]` | - | Modified file paths |
| `stagedPaths` | `string[]` | - | Staged file paths |
| `filter` | `string` | - | Glob filter |
| `showHidden` | `boolean` | - | Show hidden files |
| `multiSelect` | `boolean` | - | Enable multi-select |
| `selection` | `string[]` | - | Selected paths (multi-select) |
| `onSelect` | `(path) => void` | **required** | Selection callback |
| `onToggle` | `(path, expanded) => void` | **required** | Expand/collapse callback |
| `onOpen` | `(path) => void` | **required** | Open callback |
| `onSelectionChange` | `(paths) => void` | - | Multi-select change callback |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused row highlight |

## Notes

- `FileNode` includes `name`, `path`, `type`, and optional `children` and `status`.

## Related

- [File tree explorer](file-tree-explorer.md)
- [Tree](tree.md)
