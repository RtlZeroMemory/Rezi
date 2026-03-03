# Styling with Constraints

Constraints answer “**how big / where**” while the design system answers “**how it looks**”.

Use constraints to encode layout intent (derived relationships) and keep visual styling consistent by relying on:
- `ui.page()` / `ui.appShell()` structure (both accept layout constraints like `width`, `height`, `display`, and min/max bounds)
- `ui.panel()` grouping
- spacing scale (`gap`, `p`)
- design-system recipes (`intent`, `dsSize`, `dsTone`, etc.)

See also:
- `docs/guide/styling.md`
- `docs/guide/constraints.md`

---

## Principles

- Keep simple layouts simple: fixed numbers, `flex`, and `fluid(...)` are still the default.
- Use constraints for relationships (viewport breakpoints, sibling-derived widths, intrinsic-aware overlays).
- Prefer `display: ...` constraints for viewport/layout visibility; keep business logic visibility in `show(...)`.

---

## Spacing and rhythm

Constraints should not replace spacing scale usage. Prefer:

```ts
ui.page({ p: 1, gap: 1, header, body })
ui.panel("Title", [...])
ui.row({ gap: 1 }, [...])
```

Use constraints to size regions, not to encode padding/gap rules.

---

## Responsive shell pattern (styled)

```ts
ui.appShell({
  p: 1,
  gap: 1,
  display: visibilityConstraints.viewportHeightAtLeast(24),
  width: widthConstraints.percentOfParent(0.98),
  sidebar: {
    width: widthConstraints.clampedPercentOfParent({ ratio: 0.22, min: 18, max: 32 }),
    content: ui.panel({ title: "Navigation" }, [...]),
  },
  body: ui.row({ gap: 1 }, [
    ui.panel(
      {
        id: "main",
        title: "Main",
        width: spaceConstraints.remainingWidth({ subtract: [{ id: "rail" }], minus: 1 }),
      },
      [...],
    ),
    ui.panel(
      {
        id: "rail",
        title: "Details",
        width: widthConstraints.clampedPercentOfParent({ ratio: 0.28, min: 26, max: 44 }),
        display: visibilityConstraints.viewportAtLeast({ width: 110, height: 28 }),
      },
      [...],
    ),
  ]),
})
```

Visual structure remains idiomatic (`panel`/spacing), while constraints define responsive region sizing.

---

## Intrinsic-aware overlays (modals, palettes)

Use intrinsic-aware helpers to keep overlays:
- content-driven in size
- bounded to the viewport
- stable across theme/font changes

```ts
ui.modal({
  id: "help",
  title: "Commands",
  width: widthConstraints.clampedIntrinsicPlus({ pad: 8, min: 44, max: "parent" }),
  height: heightConstraints.clampedIntrinsicPlus({ pad: 4, min: 10, max: "parent" }),
  content: ui.column({ gap: 1 }, [...]),
})
```
