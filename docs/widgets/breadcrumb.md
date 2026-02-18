# Breadcrumb

Shows a hierarchical path. Parent items can be clickable; the last item is
always treated as the current location.

## Usage

```ts
ui.breadcrumb({
  items: [
    { label: "Home", onPress: () => navigate("/") },
    { label: "Docs", onPress: () => navigate("/docs") },
    { label: "Tabs" },
  ],
  separator: " > ",
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `items` | `Array<{ label: string; onPress?: () => void }>` | **required** | Breadcrumb entries |
| `separator` | `string` | `" > "` | Text between items |
| `id` | `string` | auto-generated | Optional stable id |
| `key` | `string` | - | Reconciliation key |

## Keyboard Behavior

- `Tab/Shift+Tab`: moves across clickable breadcrumb items.
- `Enter`: activates the focused breadcrumb item.
- The last breadcrumb item is not clickable.
