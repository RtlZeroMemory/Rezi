# `Dropdown`

Dropdown menu positioned relative to an anchor widget.

## Usage

```ts
ui.dropdown({
  id: "file-menu",
  anchorId: "file-button",
  position: "below-start",
  items: [
    { id: "new", label: "New", shortcut: "Ctrl+N" },
    { id: "open", label: "Open", shortcut: "Ctrl+O" },
    { id: "divider", label: "", divider: true },
    { id: "exit", label: "Exit" },
  ],
  onSelect: (item) => handleAction(item.id),
  onClose: () => app.update((s) => ({ ...s, menuOpen: false })),
})
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique dropdown identifier |
| `anchorId` | `string` | **required** | ID of anchor widget used for positioning |
| `position` | `DropdownPosition` | `"below-start"` | Placement relative to anchor |
| `items` | `DropdownItem[]` | **required** | Menu rows (including optional dividers) |
| `frameStyle` | `{ background?, foreground?, border? }` | - | Optional frame/surface colors for menu background, text, and border |
| `onSelect` | `(item) => void` | - | Called when a selectable item is activated |
| `onClose` | `() => void` | - | Called when dropdown should close |

## Behavior

- **Arrow keys** navigate items. **Enter** selects the highlighted item.
- The current selection is visually highlighted.
- **Mouse click** on an item selects it and fires the `onSelect` callback.
- **Clicking outside** the dropdown closes it (calls `onClose`).
- Dropdown overlays register in the shared `LayerRegistry`, so z-order and
  hit-testing behavior is consistent with modal/layer overlays.
- Item `shortcut` text is a display hint. Register actual key combos with
  `app.keys()` and route to the same action handlers.

## Notes

- Use `anchorId` to position the dropdown relative to an element in the layout tree.
- Render dropdowns inside `ui.layers(...)` so they stack above base UI.

### Keyboard shortcut example

```ts
ui.dropdown({
  id: "file-menu",
  anchorId: "file-btn",
  items: [
    { id: "save", label: "Save", shortcut: "Ctrl+S" },
    { id: "quit", label: "Quit", shortcut: "Ctrl+Q" },
  ],
  onSelect: (item) => runCommand(item.id),
})
```

Pair the labels with explicit bindings:

```ts
app.keys({
  "ctrl+s": () => runCommand("save"),
  "ctrl+q": () => runCommand("quit"),
})
```
