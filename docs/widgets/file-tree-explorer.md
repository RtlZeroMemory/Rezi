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
  onChange: (node, expanded) => toggleNode(node, expanded),
  onSelect: (node) => selectNode(node),
  onPress: (node) => openNode(node),
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
| `onChange` | `(node, expanded) => void` | **required** | Expand/collapse callback |
| `onSelect` | `(node) => void` | **required** | Selection callback |
| `onPress` | `(node) => void` | **required** | Activate callback (Enter/double-click) |
| `onContextMenu` | `(node) => void` | - | Context menu callback for right-click mouse routing |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses row highlight |
| `renderNode` | `(node, depth, state) => VNode` | - | Custom row renderer; replaces the built-in icon/status/name line |

## Behavior

### Keyboard

- **Arrow keys** navigate. **Enter** activates the focused node.

### Mouse

- **Left click** on a node calls `onSelect(node)` immediately on mouse down, moving selection to that node.
- **Double-click** (two clicks within 500ms on the same node) calls `onPress(node)` on mouse up. For directory nodes, apps typically toggle expand/collapse; for files, apps open the file.
- **Right click** on a node calls `onContextMenu(node)` when provided.
- **Wheel** scroll moves the visible row window when the explorer content overflows the viewport.
- Mouse click routing follows the same press/release model as the Table widget: mouse down captures the target node index, mouse up verifies the same node was hit before firing activation.

## Notes

- `FileNode` includes `name`, `path`, `type`, and optional `children` and `status`.
- `status` values: `"modified"`, `"staged"`, `"untracked"`, `"deleted"`, `"renamed"`.
- `showIcons` and `showStatus` only affect the built-in row renderer.
- `renderNode(node, depth, state)` replaces the built-in row content entirely and receives row metadata for `expanded`, `selected`, `focused`, and `hasChildren`.
- The core renderer wires `onContextMenu` from right-click mouse input; it does not currently register a dedicated keyboard Menu-key handler.

## Focus Control

By default, the focused node row is highlighted with the theme's `info` color. To suppress this (e.g., when the tree is inside a pane with its own active/inactive border chrome), use `focusConfig`:

```ts
ui.fileTreeExplorer({
  id: "explorer",
  data: state.data,
  expanded: state.expanded,
  focusConfig: { indicator: "none" },
  onChange: handleToggle,
  onSelect: handleSelect,
  onPress: handleActivate,
})
```

See [Focus Styles](../styling/focus-styles.md) for details on `focusConfig`.

## Related

- [File picker](file-picker.md)
- [Tree](tree.md)
- [Focus Styles](../styling/focus-styles.md) - Per-widget focus control
- [Mouse Support](../guide/mouse-support.md) - Mouse routing details
