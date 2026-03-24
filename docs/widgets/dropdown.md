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
- Long menus render a deterministic visible window and keep the highlighted item in view as you navigate.
- **Mouse click** on an item selects it and fires the `onSelect` callback.
- **Clicking outside** the dropdown closes it (calls `onClose`).
- Dropdown overlays register in the shared `LayerRegistry`, so z-order and
  hit-testing behavior is consistent with modal/layer overlays.
- Item `shortcut` bindings are active for the topmost open dropdown and trigger the same selection/close path as keyboard or mouse activation.

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

Optional app-level bindings for the same actions:

```ts
app.keys({
  "ctrl+s": () => runCommand("save"),
  "ctrl+q": () => runCommand("quit"),
})
```

Use `app.keys()` for app-level shortcuts that should work even when the dropdown is closed.
