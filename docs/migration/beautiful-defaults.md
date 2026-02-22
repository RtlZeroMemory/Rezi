# Migration: Beautiful Defaults (Design System by Default)

Rezi’s core widgets are now wired to the design system so applications look professional without manual styling.

This page documents what changed and how to control it.

## What changed

When the active theme provides semantic color tokens (`bg.base`, `fg.primary`, etc.), these widgets use recipes by default:

- `ui.button(...)` (defaults to a `"soft"` look)
- `ui.input(...)` / `ui.textarea(...)`
- `ui.select(...)`
- `ui.checkbox(...)`
- `ui.progress(...)`
- `ui.callout(...)`

If the active theme does **not** provide semantic color tokens, these widgets fall back to non-recipe rendering.

## New APIs

### Button intent

Use `intent` instead of juggling `dsVariant` + `dsTone` (+ `dsSize`):

```ts
ui.button({ id: "save", label: "Save", intent: "primary" })
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

> Breaking (alpha): older builds treated some manual `style` props as an opt-out from recipe styling. This migration removes that opt-out to keep defaults consistent and avoid hidden behavior.

## Height constraints for framed controls

Some recipe-styled widgets can draw a framed control (border + interior). A framed border requires at least **3 rows** of height; in a 1-row layout, widgets still use recipe text/background styling, but they render without a box border.
