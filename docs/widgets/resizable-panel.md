# `ResizablePanel`

Panel used inside a `PanelGroup`.

## Usage

```ts
ui.panelGroup(
  { id: "main", direction: "horizontal" },
  [
    ui.resizablePanel({ defaultSize: 25, minSize: 20 }, [Sidebar()]),
    ui.resizablePanel({ defaultSize: 75 }, [Content()]),
  ]
)
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultSize` | `number` | auto | Initial size (percentage of the parent axis) |
| `minSize` | `number` | - | Minimum size (percentage) |
| `maxSize` | `number` | - | Maximum size (percentage) |
| `collapsible` | `boolean` | `false` | Allow collapsing the panel |

## Notes

- `ResizablePanel` should contain exactly one child widget.
- `PanelGroup` uses `defaultSize`/`minSize`/`maxSize` as sizing hints along its primary axis.
- For draggable sizing, use [`SplitPane`](split-pane.md).
