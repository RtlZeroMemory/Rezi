# `Layer`

Explicit overlay entry within the layer stack.

## Usage

```ts
ui.layer({
  id: "tooltip",
  zIndex: 100,
  modal: false,
  content: ui.text("Tooltip text"),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Layer identifier |
| `zIndex` | `number` | insertion order | Higher values render on top (clamped for deterministic ordering) |
| `frameStyle` | `{ background?, foreground?, border? }` | - | Optional layer surface/frame colors (background fill, inherited text color, and border) |
| `backdrop` | `"none" \| "dim" \| "opaque"` | `"none"` | Backdrop behind the layer |
| `modal` | `boolean` | `false` | Block input to lower layers |
| `closeOnEscape` | `boolean` | `true` | Close on Escape key |
| `onClose` | `() => void` | - | Called when layer should close |
| `content` | `VNode` | **required** | Layer content |

## Mouse Behavior

- When `modal` is `true`, mouse events to widgets in lower layers are blocked.
- Clicking the backdrop area triggers the `onClose` callback (if provided).

## Notes

- Use [`Layers`](layers.md) to manage stacking order and modals.
- `zIndex` is truncated to an integer and clamped to the safe range (`±9,007,199,253`) so very large values don't break ordering.
- `BackdropStyle` values: `"none"`, `"dim"`, `"opaque"`.
- Backdrops are rendered behind the layer. `"dim"` uses a light shade pattern; `"opaque"` clears the area behind the layer to the theme background color.

## Related

- [Layers](layers.md)
- [Modal](modal.md)
- [Dropdown](dropdown.md)
