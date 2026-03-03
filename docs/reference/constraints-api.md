# Constraints API Reference

Rezi supports **constraint-driven layout** via `expr("...")` and a **helper-first** API layer that generates constraint expressions for common patterns.

This page documents the public helper layer exported from:

- `@rezi-ui/core`
- `@rezi-ui/jsx` (re-exports for parity)

See also:
- `docs/guide/constraints.md`
- `docs/reference/constraint-expressions.md`

---

## `expr(source)`

`expr("...")` parses a constraint DSL string and returns a frozen `ConstraintExpr` object.

Use it when:
- You need a layout relationship that isn’t covered by helpers
- You’re prototyping, or translating an existing expression from docs/tests

Prefer helpers for day-to-day usage so app code reads like layout intent.

---

## Helper namespaces

All helpers:
- Return `ConstraintExpr`
- Validate arguments and throw `ConstraintHelperError` with a clear message
- Preserve solver semantics by compiling to `expr("...")` (no implicit fallbacks)

### `visibilityConstraints.*`

For `display: ...` rules (layout/viewport-driven visibility).

- `viewportWidthAtLeast(cols: number)`
- `viewportWidthBelow(cols: number)`
- `viewportHeightAtLeast(rows: number)`
- `viewportHeightBelow(rows: number)`
- `viewportAtLeast(options: { width?: number; height?: number })`

Examples:

```ts
ui.box({ display: visibilityConstraints.viewportWidthAtLeast(80) }, [...])
ui.box({ display: visibilityConstraints.viewportAtLeast({ width: 110, height: 28 }) }, [...])
```

### `conditionalConstraints.*`

Intent wrapper for conditional sizing.

- `ifThenElse(cond: number | ConstraintExpr, thenValue: number | ConstraintExpr, elseValue: number | ConstraintExpr)`

Example:

```ts
width: conditionalConstraints.ifThenElse(
  visibilityConstraints.viewportWidthAtLeast(120),
  60,
  100,
)
```

### `widthConstraints.*`

Common width sizing patterns.

- `percentOfParent(ratio: number)` → `parent.w * ratio`
- `percentOfViewport(ratio: number)` → `viewport.w * ratio`
- `clampedPercentOfParent({ ratio, min, max })` → `clamp(min, parent.w * ratio, max)`
- `clampedViewportMinus({ minus, min, max })` → `clamp(min, viewport.w - minus, max)`
- `minViewportPercent({ ratio, min })` → `max(min, viewport.w * ratio)`
- `stepsByViewportWidth({ steps })` → `steps(viewport.w, t1: v1, t2: v2, ...)`
- `clampedIntrinsicPlus({ pad, min, max?: number | "parent" })` → `clamp(min, intrinsic.w + pad, parent.w|max)`

### `heightConstraints.*`

Height analogs of `widthConstraints`.

- `percentOfParent(ratio: number)`
- `percentOfViewport(ratio: number)`
- `minViewportPercent({ ratio, min })` → `max(min, viewport.h * ratio)`
- `clampedPercentOfParent({ ratio, min, max })`
- `clampedPercentOfViewport({ ratio, min, max })`
- `clampedViewportMinus({ minus, min, max })`
- `stepsByViewportHeight({ steps })` → `steps(viewport.h, t1: v1, t2: v2, ...)`
- `clampedIntrinsicPlus({ pad, min, max?: number | "parent" })`

### `groupConstraints.*`

Sibling aggregation wrappers (equalization / totals).

These are most useful when **multiple siblings share the same non-interactive `id`** (for example repeated label widgets), and you want a max/sum across that group.

- `maxSiblingWidth(id: string)` → `max_sibling(#id.w)`
- `maxSiblingHeight(id: string)` → `max_sibling(#id.h)`
- `maxSiblingMinWidth(id: string)` → `max_sibling(#id.min_w)`
- `maxSiblingMinHeight(id: string)` → `max_sibling(#id.min_h)`
- `sumSiblingWidth(id: string)` → `sum_sibling(#id.w)`
- `sumSiblingHeight(id: string)` → `sum_sibling(#id.h)`
- `sumSiblingMinWidth(id: string)` → `sum_sibling(#id.min_w)`
- `sumSiblingMinHeight(id: string)` → `sum_sibling(#id.min_h)`

Example:

```ts
ui.row({ gap: 2 }, [
  ui.box(
    { id: "kv-key", width: groupConstraints.maxSiblingMinWidth("kv-key"), border: "none", p: 0 },
    [ui.text("Latency", { dim: true })],
  ),
  ui.text("12ms"),
])
```

### `spaceConstraints.*`

“Derived remaining space” helpers (make intent explicit, avoid manual math).

- `remainingWidth({ subtract, minus?, clampMin? })`
- `remainingHeight({ subtract, minus?, clampMin? })`

`subtract` terms:

```ts
type SpaceTerm = { id: string; metric?: "width" | "height" | "minWidth" | "minHeight"; aggregation?: "none" | "max" | "sum" }
```

Example:

```ts
ui.row({}, [
  ui.box({ id: "sidebar", width: 24 }, [...]),
  ui.box({ id: "main", width: spaceConstraints.remainingWidth({ subtract: [{ id: "sidebar" }], minus: 1 }) }, [...]),
])
```
