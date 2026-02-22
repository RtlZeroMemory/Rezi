# `VirtualList`

Efficiently renders large lists by windowing only the visible range.

## Usage

```ts
ui.virtualList({
  id: "items",
  items: state.items,
  itemHeight: 1,
  renderItem: (item, index, focused) =>
    ui.text(focused ? `> ${item}` : `  ${item}`, {
      key: String(index),
      style: focused ? { bold: true } : {},
    }),
  onSelect: (item) => openItem(item),
})
```

### Variable-Height (Estimated + Corrected)

```ts
ui.virtualList({
  id: "chat",
  items: state.messages,
  estimateItemHeight: (msg) => (msg.preview ? 3 : 2),
  renderItem: (msg, _index, focused) =>
    ui.column(
      { gap: 0 },
      [
        ui.text(focused ? `> ${msg.author}` : `  ${msg.author}`),
        ui.text(msg.text),
        msg.preview ? ui.text(msg.preview, { style: { dim: true } }) : null,
      ].filter(Boolean),
    ),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier for focus and routing |
| `items` | `T[]` | **required** | Items to render |
| `itemHeight` | `number \| (item, index) => number` | `1` | Exact item height (fixed or precomputed variable) |
| `estimateItemHeight` | `number \| (item, index) => number` | - | Estimated height for variable-height virtualization |
| `measureItemHeight` | `(item, index, ctx) => number` | internal measurer | Optional custom measurement callback for estimate mode |
| `renderItem` | `(item, index, focused) => VNode` | **required** | Render function for each item |
| `overscan` | `number` | `3` | Extra items rendered above/below viewport |
| `keyboardNavigation` | `boolean` | `true` | Enable arrow/page/home/end navigation |
| `wrapAround` | `boolean` | `false` | Wrap selection from end to start |
| `onScroll` | `(scrollTop, range) => void` | - | Scroll callback with visible range |
| `onSelect` | `(item, index) => void` | - | Selection callback |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused item highlight |

## Behavior

- **Arrow Up/Down** navigates items. **Page Up/Down** and **Home/End** jump by page or to boundaries.
- **Mouse scroll wheel** scrolls the list (3 lines per tick).
- The `onScroll` callback fires for both keyboard navigation and mouse wheel input.

## Notes

- Use `itemHeight` for fixed heights or when exact heights are known up front.
- Use `estimateItemHeight` when true height depends on rendered content/width.
- In estimate mode, visible items are measured and cached, then scroll math is corrected.
- Measured-height cache resets when viewport width or item count changes.
- `renderItem` receives a `focused` flag for styling.
- The `range` passed to `onScroll` is `[startIndex, endIndex)` and includes overscan.

## Related

- [Table](table.md)
- [Tree](tree.md)
