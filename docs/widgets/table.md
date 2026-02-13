# Table

Renders tabular data with column definitions, optional sorting, and row selection.

## Usage

```ts
ui.table({
  id: "users",
  columns: [
    { key: "name", header: "Name", flex: 1, sortable: true, overflow: "middle" },
    { key: "role", header: "Role", width: 12 },
  ],
  data: state.users,
  getRowKey: (u) => u.id,
  selection: state.selection,
  selectionMode: "multi",
  onSelectionChange: (keys) => app.update((s) => ({ ...s, selection: keys })),
  stripeStyle: { odd: { r: 34, g: 37, b: 45 } },
  borderStyle: { variant: "double", color: { r: 120, g: 130, b: 145 } },
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique identifier for focus and events |
| `columns` | `TableColumn[]` | **required** | Column definitions (`key`, `header`, width/flex, sortability, renderers, `overflow`) |
| `data` | `T[]` | **required** | Row data |
| `getRowKey` | `(row: T, index: number) => string` | **required** | Stable key for each row |
| `rowHeight` | `number` | `1` | Row height in cells. Use positive values for predictable keyboard and mouse navigation. |
| `headerHeight` | `number` | `1` | Header row height in cells when `showHeader` is `true`. |
| `selection` | `string[]` | `[]` | Currently selected row keys |
| `selectionMode` | `"none" \| "single" \| "multi"` | `"none"` | Selection behavior |
| `onSelectionChange` | `(keys: string[]) => void` | - | Called when selection changes |
| `sortColumn` | `string` | - | Currently sorted column key |
| `sortDirection` | `"asc" \| "desc"` | - | Current sort direction |
| `onSort` | `(column: string, direction: "asc" \| "desc") => void` | - | Called when sort changes |
| `onRowPress` | `(row: T, index: number) => void` | - | Row activation callback |
| `onRowDoublePress` | `(row: T, index: number) => void` | - | Row double-activation callback (double-click) |
| `virtualized` | `boolean` | `true` | Enable windowed rendering for large datasets |
| `overscan` | `number` | `3` | Extra rows rendered outside viewport |
| `showHeader` | `boolean` | `true` | Show/hide header row |
| `stripedRows` | `boolean` | `false` | Legacy stripe toggle (kept for compatibility) |
| `stripeStyle` | `{ odd?, even? }` | - | Stripe background colors. Providing this enables stripes even when `stripedRows` is `false`. |
| `border` | `"none" \| "single"` | `"none"` | Legacy border toggle (kept for compatibility) |
| `borderStyle` | `{ variant?, color? }` | - | Border glyph variant (`single`, `double`, `rounded`, `heavy`, `dashed`, `heavy-dashed`) and optional border color |

## Examples

### Sortable table

```ts
ui.table({
  id: "files",
  columns: [
    { key: "name", header: "Name", flex: 1, sortable: true },
    { key: "size", header: "Size", width: 10, align: "right", sortable: true },
  ],
  data: files,
  getRowKey: (f) => f.path,
  sortColumn: state.sortColumn,
  sortDirection: state.sortDirection,
  onSort: (column, direction) => app.update((s) => ({ ...s, sortColumn: column, sortDirection: direction })),
})
```

## Behavior

- **Arrow keys** navigate rows. **Enter** activates the selected row.
- **Mouse click** on a row selects it and moves focus to the table.
- **Mouse click** on a sortable header toggles sort and fires `onSort(column, direction)`.
- When focused: **Up** from the first row focuses the header. **Left/Right** moves between columns. **Enter** toggles sort on the focused header.
- **Double click** on a row fires `onRowDoublePress` (when provided).
- **Mouse scroll wheel** scrolls rows when the table is virtualized.

## Notes

- Tables can be virtualized; prefer virtualization for large datasets.
- Selection is tracked by row keys. Provide a stable `getRowKey`.
- `headerHeight` is ignored when `showHeader` is `false`.
- Column `overflow` defaults to `"ellipsis"` and supports `"clip"` and `"middle"` per column.
- `borderStyle` is applied only when `border !== "none"` to preserve legacy behavior.

## Related

- [Virtual List](virtual-list.md) - Windowed rendering for large linear datasets
- [Tree](tree.md) - Hierarchical data navigation
- [Input and Focus](../guide/input-and-focus.md) - Keyboard navigation behavior
