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

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Widget identifier for focus and routing |
| `items` | `T[]` | **required** | Items to render |
| `itemHeight` | `number \| (item, index) => number` | **required** | Fixed or variable row height |
| `renderItem` | `(item, index, focused) => VNode` | **required** | Render function for each item |
| `overscan` | `number` | `3` | Extra items rendered above/below viewport |
| `keyboardNavigation` | `boolean` | `true` | Enable arrow/page/home/end navigation |
| `wrapAround` | `boolean` | `false` | Wrap selection from end to start |
| `onScroll` | `(scrollTop, range) => void` | - | Scroll callback with visible range |
| `onSelect` | `(item, index) => void` | - | Selection callback |

## Behavior

- **Arrow Up/Down** navigates items. **Page Up/Down** and **Home/End** jump by page or to boundaries.
- **Mouse scroll wheel** scrolls the list (3 lines per tick).
- The `onScroll` callback fires for both keyboard navigation and mouse wheel input.

## Notes

- Use `itemHeight` callback for variable-height rows.
- `renderItem` receives a `focused` flag for styling.
- The `range` passed to `onScroll` is `[startIndex, endIndex)` and includes overscan.

## Related

- [Table](table.md)
- [Tree](tree.md)
