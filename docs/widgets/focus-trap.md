# Focus Trap

Constrains focus within a subtree when active. Used by modals and overlays to prevent focus from escaping to background content.

## Usage

```typescript
ui.focusTrap(
  { id: "modal-trap", active: state.modalOpen },
  [
    ui.text("Are you sure?"),
    ui.button({ id: "confirm", label: "Confirm" }),
    ui.button({ id: "cancel", label: "Cancel" }),
  ]
)
```

## Layout behavior

`focusTrap` is layout-transparent when it wraps exactly one child: the child keeps its own layout semantics.

When you pass multiple direct children, current behavior falls back to legacy column stacking for backward compatibility. Prefer wrapping multi-child content in an explicit row/column:

```typescript
ui.focusTrap(
  { id: "modal-trap", active: state.modalOpen },
  [
    ui.row({ gap: 1 }, [
      ui.button({ id: "a", label: "A" }),
      ui.button({ id: "b", label: "B" }),
    ]),
  ]
)
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `id` | `string` | **required** | Unique identifier for the trap |
| `active` | `boolean` | **required** | Whether focus is currently trapped |
| `initialFocus` | `string` | - | ID of element to focus when trap activates |
| `returnFocusTo` | `string` | - | ID of element to focus when trap deactivates |
| `key` | `string` | - | Reconciliation key |

## Behavior

When `active` is `true`:

- Tab/Shift+Tab cycles only through focusable elements inside the trap
- Focus cannot escape to elements outside the trap
- Attempting to Tab past the last element wraps to the first
- Attempting to Shift+Tab before the first element wraps to the last

When `active` becomes `false`:

- Focus is restored to `returnFocusTo` if specified
- Normal Tab navigation resumes

## Initial Focus

Specify which element receives focus when the trap activates:

```typescript
ui.focusTrap({
  id: "confirm-dialog",
  active: state.showConfirm,
  initialFocus: "cancel",  // Focus "Cancel" by default
}, [
  ui.text("Delete this item?"),
  ui.button({ id: "delete", label: "Delete" }),
  ui.button({ id: "cancel", label: "Cancel" }),
])
```

## Focus Restoration

Restore focus to a specific element when the trap closes:

```typescript
ui.focusTrap({
  id: "settings",
  active: state.showSettings,
  returnFocusTo: "settings-btn",  // Return to the button that opened it
}, [...])
```

## Modal Example

Focus traps are typically used with modals:

```typescript
state.showModal && ui.layer({
  id: "modal-layer",
  backdrop: "dim",
  content: ui.focusTrap({
    id: "modal-trap",
    active: true,
    initialFocus: "ok",
    returnFocusTo: "open-modal-btn",
  }, [
    ui.box({ title: "Settings", p: 2 }, [
      // Modal content
      ui.row({ gap: 2 }, [
        ui.button({ id: "ok", label: "OK" }),
        ui.button({ id: "cancel", label: "Cancel" }),
      ]),
    ]),
  ]),
})
```

## Nested Traps

When traps are nested, only the innermost active trap is effective:

```typescript
ui.focusTrap({ id: "outer", active: true }, [
  // Outer content
  ui.focusTrap({ id: "inner", active: state.showInner }, [
    // Inner content - focus trapped here when showInner is true
  ]),
])
```

## Mouse Behavior

When a focus trap is active, mouse clicks outside the trap region are blocked. Clicking widgets inside the trap works normally — the clicked widget receives focus.

## Related

- [Focus Zone](focus-zone.md) - Group focusable widgets
- [Modal](modal.md) - Modal dialog widget
- [Layer](layer.md) - Generic overlay layer
- [Mouse Support](../guide/mouse-support.md) - Mouse interaction details
