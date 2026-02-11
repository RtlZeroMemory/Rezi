# `PanelGroup`

Container for resizable panels (equal distribution by default).

## Usage

```ts
ui.panelGroup(
  {
    id: "panel-group",
    direction: "horizontal",
  },
  [
    ui.resizablePanel({ defaultSize: 25 }, [Sidebar()]),
    ui.resizablePanel({ defaultSize: 75, minSize: 50 }, [Content()]),
  ]
)
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Group identifier |
| `direction` | `"horizontal" \| "vertical"` | **required** | Layout direction |

## Notes

- `PanelGroup` distributes space based on `ResizablePanel` size hints (with equal distribution when unspecified).
- `ResizablePanel` size hints are interpreted as percentages of the group's width/height (based on `direction`).
- Use [`SplitPane`](split-pane.md) for draggable resizing.

## Related

- [Resizable panel](resizable-panel.md)
- [Split pane](split-pane.md)
