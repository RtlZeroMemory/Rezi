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
| `frameStyle` | `{ background?, foreground?, border? }` | - | Optional modal frame/surface colors |
| `backdrop` | `"none" \| "dim" \| "opaque" \| { variant?, pattern?, foreground?, background? }` | `"dim"` | Backdrop preset or extended config |
| `closeOnBackdrop` | `boolean` | `true` | Close when clicking backdrop |
| `closeOnEscape` | `boolean` | `true` | Close on `Esc` |
| `onClose` | `() => void` | - | Callback when modal requests close |
| `initialFocus` | `string` | - | ID to focus when modal opens |
| `returnFocusTo` | `string` | - | ID to restore focus on close |

## Design System Styling

Modals can be styled via the recipe system for consistent surface, title, and backdrop treatment:

```typescript
import { recipe } from "@rezi-ui/core";
// recipe.modal(colors, { focused: true | false })
// recipe.surface(colors, { elevation: 3, focused: true | false })
```

The recipe system provides elevation-aware styling that respects the active theme. See the [Design System specification](../design-system.md) for details.

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

### Multi-action dialogs with `ui.dialog`

```ts
ui.dialog({
  id: "save",
  title: "Unsaved Changes",
  message: "Save before closing?",
  actions: [
    { label: "Save", intent: "primary", onPress: save },
    { label: "Don't Save", intent: "danger", onPress: discard },
    { label: "Cancel", onPress: cancel },
  ],
})
```

### Stacked overlays with `useModalStack`

```ts
const modals = useModalStack(ctx);

modals.push("login", {
  title: "Login",
  content: ui.text("Enter credentials"),
  actions: [ui.button({ id: "login-ok", label: "Continue" })],
});

modals.push("mfa", {
  title: "2FA",
  content: ui.text("Enter your code"),
  actions: [ui.button({ id: "mfa-ok", label: "Verify" })],
});

return ui.layers([MainContent(), ...modals.render()]);
```

`useModalStack` provides `push`, `pop`, `clear`, `current`, `size`, and `render`.

## Mouse Behavior

- **Clicking the backdrop** closes the modal when `closeOnBackdrop` is `true` (the default).
- **Clicking action buttons** activates them the same as pressing Enter/Space.
- Mouse events to widgets below the modal are blocked when the modal is active.

## Notes

- Modals are rendered by conditionally including them in the tree (there is no `open` prop).
- Render modals inside `ui.layers(...)` so they stack above base content.
- Backdrops are rendered behind the modal. `"dim"` uses a light shade pattern; `"opaque"` clears the area behind the modal to the theme background color.
- Extended backdrop config uses object form: `variant` (preset), `pattern` (dim glyph), and optional `foreground`/`background` colors.
- `width: "auto"` sizes to content/actions and is clamped by `maxWidth` and the viewport.
- `useModalStack` applies focus-return wiring between stacked dialogs and keeps modal layering LIFO.

## Related

- [Layers](layers.md) - Overlay stacking container
- [Layer](layer.md) - Generic layer primitive
- [Focus Trap](focus-trap.md) - Keep keyboard focus inside overlays
