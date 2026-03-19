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
  onChange: (q) => app.update((s) => ({ ...s, query: q })),
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
| `width` | `number` | `60` | Palette width in cells (clamped to viewport width). |
| `frameStyle` | `{ background?, foreground?, border? }` | - | Optional frame/surface colors for palette background, text, and border. |
| `onChange` | `(query) => void` | **required** | Called when the query changes. |
| `onSelect` | `(item) => void` | **required** | Called when a result item is selected. |
| `onClose` | `() => void` | **required** | Called when the palette should close. |
| `onSelectionChange` | `(index) => void` | - | Called when highlighted index changes. |
| `focusConfig` | `FocusConfig` | - | Control focus visuals; `{ indicator: "none" }` suppresses focused item highlight |

## Notes

- Command sources can be sync or async (`getItems` may return a `Promise`).
- `open`, `query`, and `selectedIndex` are controlled props. Keep them in app state, update `query` from `onChange`, close state from `onClose`, and update `selectedIndex` from `onSelectionChange` when you want keyboard highlight changes to persist between frames.
- `maxVisible` accepts non-negative values; `0` hides the results list while keeping the palette input visible.
- Height is derived from `maxVisible + 4` (frame + input + separator + list rows), then clamped to viewport height.
- Palette x/y placement is clamped to the viewport (default y target is roughly one-third from top).
- Enabled item `shortcut` values become active overlay shortcuts while this palette is open and topmost. Matching a shortcut calls `onSelect(item)` and then `onClose()`.
- Disabled items do not register shortcuts. If multiple enabled results in the active palette share one shortcut, the later result in the resolved item list wins.
- Shortcut labels are display and routing metadata only; they are not used in palette filtering or ranking today.

## Shortcut behavior

```ts
ui.commandPalette({
  id: "palette",
  open: state.open,
  query: state.query,
  sources: [
    {
      id: "commands",
      name: "Commands",
      getItems: () => [
        { id: "save", label: "Save File", shortcut: "Ctrl+S" },
        { id: "open", label: "Open File", shortcut: "Ctrl+O" },
      ],
    },
  ],
  selectedIndex: state.selectedIndex,
  onChange: (query) => app.update((s) => ({ ...s, query })),
  onSelectionChange: (selectedIndex) => app.update((s) => ({ ...s, selectedIndex })),
  onSelect: (item) => runCommand(item.id),
  onClose: () => app.update((s) => ({ ...s, open: false })),
})
```

When the palette is open, the shortcuts above are active automatically. Use `app.keys()` only for shortcuts that should continue to work when the palette is closed:

```ts
app.keys({
  "ctrl+s": () => runCommand("save"),
  "ctrl+o": () => runCommand("open"),
})
```

Next: [`Code editor`](code-editor.md).
