# `Tree`

Renders a hierarchical tree view.

## Usage

```ts
ui.tree<FileNode>({
  id: "file-tree",
  data: state.root,
  getKey: (n) => n.path,
  getChildren: (n) => n.children,
  hasChildren: (n) => n.type === "directory",
  expanded: state.expandedPaths,
  selected: state.selectedPath,
  onChange: (node, exp) =>
    app.update((s) => ({
      ...s,
      expandedPaths: exp
        ? [...s.expandedPaths, node.path]
        : s.expandedPaths.filter((p) => p !== node.path),
    })),
  onSelect: (n) => app.update((s) => ({ ...s, selectedPath: n.path })),
  onPress: (n) => n.type === "file" && openFile(n.path),
  renderNode: (node, _depth, st) =>
    ui.row({ gap: 1 }, [
      ui.text(st.expanded ? "▼" : st.hasChildren ? "▶" : " "),
      ui.text(node.type === "directory" ? "📁" : "📄"),
      ui.text(node.name),
    ]),
  showLines: true,
})
```

## Notes

- `Tree` does not read the filesystem. You supply data and callbacks.
- Use `expanded` and `selected` to keep state in your app (controlled pattern).

Next: [`Modal`](modal.md).
