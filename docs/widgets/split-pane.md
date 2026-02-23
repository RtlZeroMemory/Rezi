# `SplitPane`

A resizable split view container with a draggable divider.

## Usage

```ts
ui.splitPane(
  {
    id: "main-split",
    direction: "horizontal",
    sizes: state.panelSizes,
    minSizes: [20, 30, 20],
    dividerSize: 1,
    onResize: (sizes) => app.update((s) => ({ ...s, panelSizes: sizes })),
  },
  [FileExplorer(), Editor(), LogsPanel()]
)
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Split identifier |
| `direction` | `"horizontal" \| "vertical"` | **required** | Layout direction |
| `sizes` | `number[]` | **required** | Panel sizes (percent or cells) |
| `sizeMode` | `"percent" \| "absolute"` | `"percent"` | Size interpretation |
| `minSizes` | `number[]` | - | Per-panel minimums |
| `maxSizes` | `number[]` | - | Per-panel maximums |
| `dividerSize` | `number` | `1` | Divider width/height in cells |
| `collapsible` | `boolean` | `false` | Allow collapsing panels |
| `collapsed` | `number[]` | - | Collapsed panel indices |
| `onResize` | `(sizes) => void` | **required** | Resize callback |
| `onCollapse` | `(index, collapsed) => void` | - | Collapse callback |

## Behavior

Dividers between panels can be dragged with the mouse to resize:

- **Mouse down** on a divider starts the drag
- **Moving the mouse** updates panel sizes in real-time via the `onResize` callback
- **Mouse up** ends the drag

The hit area for dividers extends 1 cell on each side of the divider for easier grabbing.

### Collapse

When `collapsible: true`:

- A panel index in `collapsed` is laid out at its minimum size (`minSizes[index]` or `0`).
- **Double-click** near a divider to toggle collapse:
  - Click just to the **left/top** of a divider to target the panel on that side
  - Click just to the **right/bottom** of a divider to target the other panel
- Use `onCollapse(index, collapsed)` to update your `collapsed` list (controlled state).

## Notes

- `sizes` length should match the number of child panels.
- In percent mode, panel cell allocation uses deterministic integer remainder distribution (for example `33/33/33` in 100 cells becomes `34/33/33`).
- Tie-breaking for remainder cells is stable by lower panel index.
- Use [`PanelGroup`](panel-group.md) for equal distribution without drag handles.

## Related

- [Panel group](panel-group.md)
- [Resizable panel](resizable-panel.md)
