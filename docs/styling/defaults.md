# Default Recipe Behavior

This page documents the current default recipe behavior for core widgets and how to override it.

## Default behavior

When the active theme provides semantic color tokens (`bg.base`, `fg.primary`, etc.), these widgets use recipes by default:

- `ui.button(...)` (defaults to a `"soft"` look)
- `ui.input(...)`
- `ui.checkbox(...)`
- `ui.select(...)`
- `ui.table(...)`
- `ui.progress(...)`
- `ui.badge(...)`
- `ui.callout(...)`
- `ui.scrollbar(...)`
- `ui.modal(...)`
- `ui.divider(...)`
- `ui.surface(...)`
- `ui.text(...)`

If the active theme does **not** provide semantic color tokens, these widgets fall back to non-recipe rendering.

## Recommended APIs

### Button intent

Use `intent` instead of juggling `dsVariant` + `dsTone` (+ `dsSize`):

```ts
ui.button({ id: "save", label: "Save", intent: "primary" })
ui.button({ id: "cancel", label: "Cancel", intent: "secondary" })
ui.button({ id: "delete", label: "Delete", intent: "danger" })
ui.button({ id: "learn", label: "Learn more", intent: "link" })
```

### Box presets

Use `preset` for consistent container defaults:

```ts
ui.box({ preset: "card" }, [ui.text("Card content")])
```

### Composition helpers

New layout helpers reduce boilerplate:

- `ui.page`, `ui.header`, `ui.statusBar`
- `ui.appShell`, `ui.sidebar`, `ui.masterDetail`
- `ui.card`, `ui.toolbar`

## Manual overrides

Manual styling props do **not** disable recipes.

When semantic color tokens are available, recipe styles are always applied, and manual props like `style`, `pressedStyle`, `px`, and `trackStyle` are merged on top to override specific attributes.

## Height constraints for framed controls

Some recipe-styled widgets can draw a framed control (border + interior). A framed border requires at least **3 rows** of height; in a 1-row layout, widgets still use recipe text/background styling, but they render without a box border.
