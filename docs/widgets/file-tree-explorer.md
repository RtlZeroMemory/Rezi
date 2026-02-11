# `FileTreeExplorer`

Tree view specialized for file/directory nodes with icons and optional git status.

## Usage

```ts
ui.fileTreeExplorer({
  id: "explorer",
  data: state.data,
  expanded: state.expanded,
  selected: state.selected,
  showIcons: true,
  showStatus: true,
  onToggle: (node, expanded) => toggleNode(node, expanded),
  onSelect: (node) => selectNode(node),
  onActivate: (node) => openNode(node),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier |
| `data` | `FileNode \| FileNode[]` | **required** | Tree data (no filesystem access in core) |
| `expanded` | `string[]` | **required** | Expanded node paths |
| `selected` | `string` | - | Selected node path |
| `focused` | `string` | - | Focused node path |
| `showIcons` | `boolean` | `true` | Show file icons |
| `showStatus` | `boolean` | `true` | Show git status indicators |
| `indentSize` | `number` | `2` | Indentation per depth level |
| `onToggle` | `(node, expanded) => void` | **required** | Expand/collapse callback |
| `onSelect` | `(node) => void` | **required** | Selection callback |
| `onActivate` | `(node) => void` | **required** | Activate callback (Enter/double-click) |
| `onContextMenu` | `(node) => void` | - | Context menu callback |
| `renderNode` | `(node, depth, state) => VNode` | - | Custom renderer |

## Behavior

- **Arrow keys** navigate. **Enter** activates the focused node.
- **Right click** on a node calls `onContextMenu(node)` when provided.

## Notes

- `FileNode` includes `name`, `path`, `type`, and optional `children` and `status`.
- `status` values: `"modified"`, `"staged"`, `"untracked"`, `"deleted"`, `"renamed"`.
- Use `renderNode` to customize icons, colors, or badges.

## Related

- [File picker](file-picker.md)
- [Tree](tree.md)
