# Focus Trap

Constrains focus within a subtree when active. Used by modals and overlays to prevent focus from escaping to background content.

## Usage

```typescript
ui.focusTrap(
  { id: "modal-trap", active: state.modalOpen },
  [
    ui.column({ gap: 1 }, [
      ui.text("Are you sure?"),
      ui.row({ gap: 1 }, [
        ui.button({ id: "confirm", label: "Confirm" }),
        ui.button({ id: "cancel", label: "Cancel" }),
      ]),
    ]),
  ]
)
```

## Layout behavior

`focusTrap` is layout-transparent when it wraps a single child.
That child keeps its native layout semantics (`row`, `column`, `grid`, etc.).

For multi-child usage, direct children fall back to an implicit column layout.
Prefer an explicit container inside the trap when you need more than one child:

```typescript
ui.focusTrap(
  { id: "trap-example", active: true },
  [
    ui.button({ id: "a", label: "A" }),
    ui.button({ id: "b", label: "B" }),
  ]
)
```

When you want explicit arrangement, compose a normal layout container inside the trap:

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

- If the trap contains focusable elements, Tab/Shift+Tab cycles only through those elements
- Containment is focus-system based; `focusTrap` alone does not define an outside click boundary
- Attempting to Tab past the last element wraps to the first
- Attempting to Shift+Tab before the first element wraps to the last
- The trap is collected into the focus system (`CollectedTrap`) so modal overlays
  consistently block/contain background focus.
- If the active trap has no focusable descendants, it preserves the current focus unless
  `initialFocus` names a valid nested target.

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

`focusTrap` does not block outside clicks by itself.
Use it with `ui.modal()` or a layer-backed overlay when you need pointer containment as well as Tab containment.

## Related

- [Focus Zone](focus-zone.md) - Group focusable widgets
- [Modal](modal.md) - Modal dialog widget
- [Layer](layer.md) - Generic overlay layer
- [Mouse Support](../guide/mouse-support.md) - Mouse interaction details
