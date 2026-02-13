# `Layers`

Stack-based overlay system used for modals, dropdowns, and transient UI.

## Usage

```ts
ui.layers([
  MainContent(),
  state.showModal && ui.modal({ /* ... */ }),
  state.menuOpen && ui.dropdown({ /* ... */ }),
])
```

## Notes

- Child order defines z-order: later children render on top.
- Use [`Layer`](layer.md) for explicit z-index or custom backdrops.
- Overlay primitives (`Modal`, `Layer`, `Dropdown`, `CommandPalette`, `Toast`) share `frameStyle` for consistent background/foreground/border customization.
- Layers enable deterministic hit testing and focus management across overlaps.
- Backdrops (from [`Modal`](modal.md) and [`Layer`](layer.md)) render behind the active overlay(s) and stack in draw order.

## Related

- [Layer](layer.md)
- [Modal](modal.md)
- [Dropdown](dropdown.md)
