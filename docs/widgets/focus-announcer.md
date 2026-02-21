# Focus Announcer

Displays a live text announcement for the currently focused widget.

## Usage

```typescript
ui.focusAnnouncer()

ui.focusAnnouncer({
  emptyText: "No focus",
})
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `emptyText` | `string` | - | Text shown when no widget is focused |
| `style` | `TextStyle` | - | Optional style override |
| `key` | `string` | - | Reconciliation key |

## Behavior

- Renders the focused element's computed announcement string.
- Uses semantic labels when provided via `accessibleLabel`.
- Includes `field` metadata in announcements (for example required/error context).
- Renders `emptyText` when focus is `null`.

## Example

```typescript
ui.column({}, [
  ui.focusAnnouncer({ emptyText: "No focus" }),
  ui.field({
    label: "Email",
    required: true,
    error: state.errors.email,
    children: ui.input({
      id: "email",
      value: state.email,
      accessibleLabel: "Email input",
      onInput: (value) => app.update((s) => ({ ...s, email: value })),
    }),
  }),
])
```

## Related

- [Input & Focus Guide](../guide/input-and-focus.md)
- [Focus Zone](focus-zone.md)
- [Focus Trap](focus-trap.md)
