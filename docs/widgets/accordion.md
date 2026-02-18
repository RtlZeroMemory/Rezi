# Accordion

Displays stacked sections that can be expanded or collapsed.

## Usage

```ts
ui.accordion({
  id: "faq",
  items: [
    { key: "install", title: "How do I install?", content: ui.text("Use npm or bun") },
    { key: "mouse", title: "Mouse support?", content: ui.text("Yes") },
  ],
  expanded: state.expanded,
  onChange: (expanded) => app.update({ expanded }),
  allowMultiple: false,
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Stable accordion widget id |
| `items` | `Array<{ key: string; title: string; content: VNode }>` | **required** | Accordion sections |
| `expanded` | `string[]` | **required** | Expanded section keys |
| `onChange` | `(expanded: readonly string[]) => void` | **required** | Called when expansion changes |
| `allowMultiple` | `boolean` | `false` | Allows multiple expanded sections |
| `key` | `string` | - | Reconciliation key |

## Keyboard Behavior

- `Up/Down`: moves focus between section headers.
- `Enter/Space`: toggles the focused section.
- `Tab/Shift+Tab`: enters/leaves accordion header focus.
