# Modal

An overlay container for dialogs and focused interactions.

## Usage

```ts
ui.layers([
  MainContent(),
  state.showModal &&
    ui.modal({
      id: "confirm",
      title: "Confirm Action",
      content: ui.text("Are you sure?"),
      actions: [
        ui.button({ id: "yes", label: "Yes" }),
        ui.button({ id: "no", label: "No" }),
      ],
      onClose: () => app.update((s) => ({ ...s, showModal: false })),
    }),
])
```

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | **required** | Unique identifier |
| `title` | `string` | - | Optional modal header title |
| `content` | `VNode` | **required** | Main modal body |
| `actions` | `VNode[]` | `[]` | Action row (typically buttons) |
| `width` | `number \| "auto"` | `~70%` | Preferred modal width |
| `maxWidth` | `number` | - | Maximum width constraint |
| `backdrop` | `"none" \| "dim" \| "opaque"` | `"dim"` | Backdrop style |
| `closeOnBackdrop` | `boolean` | `true` | Close when clicking backdrop |
| `closeOnEscape` | `boolean` | `true` | Close on `Esc` |
| `onClose` | `() => void` | - | Callback when modal requests close |
| `initialFocus` | `string` | - | ID to focus when modal opens |
| `returnFocusTo` | `string` | - | ID to restore focus on close |

## Examples

### Confirmation dialog with explicit focus target

```ts
ui.modal({
  id: "delete-confirm",
  title: "Delete item?",
  content: ui.text("This action cannot be undone."),
  actions: [
    ui.button({ id: "cancel", label: "Cancel" }),
    ui.button({ id: "confirm", label: "Delete" }),
  ],
  initialFocus: "cancel",
  returnFocusTo: "open-delete-modal",
  onClose: () => app.update((s) => ({ ...s, showDeleteModal: false })),
})
```

## Mouse Behavior

- **Clicking the backdrop** closes the modal when `closeOnBackdrop` is `true` (the default).
- **Clicking action buttons** activates them the same as pressing Enter/Space.
- Mouse events to widgets below the modal are blocked when the modal is active.

## Notes

- Modals are rendered by conditionally including them in the tree (there is no `open` prop).
- Render modals inside `ui.layers(...)` so they stack above base content.
- Backdrops are rendered behind the modal. `"dim"` uses a light shade pattern; `"opaque"` clears the area behind the modal to the theme background color.
- `width: "auto"` sizes to content/actions and is clamped by `maxWidth` and the viewport.

## Related

- [Layers](layers.md) - Overlay stacking container
- [Layer](layer.md) - Generic layer primitive
- [Focus Trap](focus-trap.md) - Keep keyboard focus inside overlays
