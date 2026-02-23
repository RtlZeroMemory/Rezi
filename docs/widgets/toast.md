# `Toast`

Transient notification UI anchored to a screen edge.

## Usage

```ts
ui.toastContainer({
  toasts: state.toasts,
  position: "bottom-right",
  maxVisible: 5,
  onDismiss: (id) =>
    app.update((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })),
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `toasts` | `Toast[]` | **required** | Active toasts |
| `position` | `ToastPosition` | `"bottom-right"` | Container position |
| `maxVisible` | `number` | `5` | Max visible toasts |
| `width` | `number` | `40` | Toast container width in cells (clamped to viewport width) |
| `frameStyle` | `{ background?, foreground?, border? }` | - | Optional frame/surface colors for toast background, message text, and border |
| `onDismiss` | `(id) => void` | **required** | Dismiss callback |

## Mouse Behavior

Toast action buttons (e.g., "Undo") can be clicked with the mouse to trigger their `onAction` callback.

## Overlay stacking

Toast containers register in the shared `LayerRegistry`, so toast z-order is
managed by the same overlay system as modals and dropdowns.

Container height is derived from `maxVisible * toastHeight` and clamped to viewport height.

## Toast shape

- `id`: unique toast identifier
- `message`: message text
- `type`: `"info" | "success" | "warning" | "error"`
- `duration`: auto-dismiss ms (0 = persistent, default: 3000)
- `action`: optional `{ label, onAction }`
- `progress`: optional `0–100` value

`ToastPosition` values:
`"top-left"`, `"top-center"`, `"top-right"`, `"bottom-left"`, `"bottom-center"`, `"bottom-right"`.

## Related

- [Callout](callout.md)
- [Error display](error-display.md)
