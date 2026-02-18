# Pagination

Renders page navigation controls for paged datasets.

## Usage

```ts
ui.pagination({
  id: "results-pages",
  page: state.page,
  totalPages: state.totalPages,
  onChange: (page) => app.update({ page }),
  showFirstLast: true,
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Stable pagination widget id |
| `page` | `number` | **required** | Current page (1-based) |
| `totalPages` | `number` | **required** | Total page count |
| `onChange` | `(page: number) => void` | **required** | Called when page changes |
| `showFirstLast` | `boolean` | `false` | Shows first/last page controls |
| `key` | `string` | - | Reconciliation key |

## Keyboard Behavior

- `Left/Right`: moves to previous/next page when available.
- `Home/End`: jumps to first/last page when `showFirstLast` is enabled.
- `Tab/Shift+Tab`: moves across focusable pagination controls.
