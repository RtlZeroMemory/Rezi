# Constraint Recipes (Cookbook)

This page is a practical cookbook for building responsive, relational layouts with Rezi constraints.

Default path:
- Use helper constraints (`visibilityConstraints`, `widthConstraints`, `heightConstraints`, `spaceConstraints`, `groupConstraints`, `conditionalConstraints`)

Advanced path:
- Use `expr("...")` when you need a custom relationship not covered by helpers

See also:
- `docs/guide/constraints.md`
- `docs/reference/constraints-api.md`
- `docs/reference/constraint-expressions.md`

---

## 1) Responsive sidebars and rails (`display`)

```ts
ui.row({ gap: 1, width: "full", height: "full" }, [
  ui.box(
    {
      id: "nav",
      width: widthConstraints.clampedPercentOfParent({ ratio: 0.22, min: 18, max: 32 }),
      display: visibilityConstraints.viewportWidthAtLeast(70),
      border: "single",
      p: 1,
    },
    [ui.text("Navigation")],
  ),
  ui.box(
    {
      id: "main",
      width: spaceConstraints.remainingWidth({ subtract: [{ id: "nav" }, { id: "rail" }], minus: 2 }),
      border: "single",
      p: 1,
    },
    [ui.text("Main content")],
  ),
  ui.box(
    {
      id: "rail",
      width: widthConstraints.clampedPercentOfParent({ ratio: 0.28, min: 26, max: 44 }),
      display: visibilityConstraints.viewportAtLeast({ width: 110, height: 28 }),
      border: "single",
      p: 1,
    },
    [ui.text("Detail rail")],
  ),
])
```

Templates:
- `packages/create-rezi/templates/starship/src/screens/shell.ts`

---

## 2) Equal-width “key/value” rows (label equalization)

Use `max_sibling(#id.min_w)` through `groupConstraints.maxSiblingMinWidth(...)` to align labels.

```ts
const rows = entries.map((e) =>
  ui.row({ key: e.key, gap: 2, wrap: true }, [
    ui.text(e.key, {
      id: "kv-key",
      width: groupConstraints.maxSiblingMinWidth("kv-key"),
      dim: true,
    }),
    ui.text(e.value, { flex: 1 }),
  ]),
)
```

Template:
- `packages/create-rezi/templates/dashboard/src/screens/overview.ts`

---

## 3) Intrinsic-aware modals (content-driven but bounded)

```ts
ui.modal({
  id: "help",
  title: "Commands",
  width: widthConstraints.clampedIntrinsicPlus({ pad: 8, min: 44, max: "parent" }),
  height: heightConstraints.clampedIntrinsicPlus({ pad: 4, min: 10, max: "parent" }),
  content: ui.column({ gap: 1 }, [
    ui.text("q : quit"),
    ui.text("h : close"),
  ]),
})
```

---

## 4) Viewport-derived clamping (avoid fragile math strings)

```ts
ui.box({
  width: widthConstraints.clampedViewportMinus({ minus: 4, min: 20, max: 140 }),
  height: heightConstraints.clampedViewportMinus({ minus: 4, min: 8, max: 40 }),
})
```

Template:
- `packages/create-rezi/templates/animation-lab/src/screens/reactor-lab.ts`

---

## 5) Conditional sizing (“if-like” intent)

```ts
width: conditionalConstraints.ifThenElse(
  visibilityConstraints.viewportWidthAtLeast(120),
  60,
  100,
)
```

---

## 6) Responsive grid (alpha contract)

Because `grid.columns: expr(...)` is intentionally invalid in alpha, build two grids and switch with `display`.

```ts
ui.column({ gap: 1 }, [
  ui.grid({ columns: 2, display: visibilityConstraints.viewportWidthBelow(110), gap: 1 }, compactTiles),
  ui.grid({ columns: "1fr 1fr 1fr 1fr", display: visibilityConstraints.viewportWidthAtLeast(110), gap: 1 }, wideTiles),
])
```

---

## 7) Avoid cycles

Sibling references can create cycles when two nodes depend on each other.

Bad:

```ts
ui.box({ id: "a", width: expr("#b.w * 2") })
ui.box({ id: "b", width: expr("#a.w / 2") })
```

Good (anchor one side to parent/viewport/intrinsic):

```ts
ui.box({ id: "a", width: widthConstraints.clampedPercentOfParent({ ratio: 0.33, min: 10, max: 40 }) })
ui.box({ id: "b", width: expr("#a.w * 2") })
```

