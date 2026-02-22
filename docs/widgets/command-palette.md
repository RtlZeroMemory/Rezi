# `CommandPalette`

A searchable command UI for fast actions (similar to “Command Palette” in editors).

## Usage

```ts
ui.commandPalette({
  id: "palette",
  open: state.open,
  query: state.query,
  placeholder: "Search files and commands...",
  maxVisible: 8,
  loading: state.commandsLoading,
  sources: [
    {
      id: "cmd",
      name: "Commands",
      prefix: ">",
      getItems: (q) => getCommandItems(q),
    },
  ],
  selectedIndex: state.selectedIndex,
  onQueryChange: (q) => app.update((s) => ({ ...s, query: q })),
  onSelectionChange: (i) => app.update((s) => ({ ...s, selectedIndex: i })),
  onSelect: (item) => runCommand(item.id),
  onClose: () => app.update((s) => ({ ...s, open: false })),
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Widget identifier. |
| `open` | `boolean` | **required** | Whether the palette is visible. |
| `query` | `string` | **required** | Current search query. |
| `sources` | `CommandSource[]` | **required** | Command providers used to produce results. |
| `selectedIndex` | `number` | **required** | Currently highlighted result index. |
| `loading` | `boolean` | `false` | Shows a loading indicator in the input area. Async `getItems` fetches also set loading internally while pending. |
| `placeholder` | `string` | `"Search commands..."` | Text shown when `query` is empty. Keep it short so the input stays readable on narrow terminals. |
| `maxVisible` | `number` | `10` | Maximum visible result rows. Useful for capping palette height in smaller viewports. |
| `frameStyle` | `{ background?, foreground?, border? }` | - | Optional frame/surface colors for palette background, text, and border. |
| `onQueryChange` | `(query) => void` | **required** | Called when the query changes. |
| `onSelect` | `(item) => void` | **required** | Called when a result item is selected. |
| `onClose` | `() => void` | **required** | Called when the palette should close. |
| `onSelectionChange` | `(index) => void` | - | Called when highlighted index changes. |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused item highlight |

## Notes

- Command sources can be sync or async (`getItems` may return a `Promise`).
- Keep `query` and `selectedIndex` in your app state (controlled pattern).
- `maxVisible` accepts non-negative values; `0` hides the results list while keeping the palette input visible.

Next: [`Code editor`](code-editor.md).
