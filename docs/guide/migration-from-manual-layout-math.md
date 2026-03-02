# Migration: From Manual Layout Math to Constraints

Constraints are for **relational / derived** sizing and visibility rules. They reduce glitch-prone “hand math” in view functions and make intent explicit.

This guide is a playbook for migrating older Rezi code (or early alpha experiments) into the helper-first constraint path.

See also:
- `docs/guide/constraints.md`
- `docs/reference/constraints-api.md`

---

## Decision tree (short)

- Fixed size? → `width: 24`
- Share space? → `flex: 1`
- Smooth interpolation? → `fluid(min, max)`
- Derived from parent/viewport/siblings/intrinsic? → helper constraints (or `expr("...")`)
- Layout-driven visibility? → `display: ...` constraints
- Business logic visibility? → `show(...)`, `when(...)`, `maybe(...)`, `match(...)`

---

## Common conversions

| Before (anti-pattern) | After (preferred) |
|---|---|
| `width: "50%"` | `width: widthConstraints.percentOfParent(0.5)` or `expr("parent.w * 0.5")` |
| `width: { sm: 10, md: 20 }` | `expr("steps(viewport.w, 80: 10, 120: 20)")` or `fluid(10, 20)` |
| `if (viewport.w < 80) return null` | Keep node, set `display: visibilityConstraints.viewportWidthAtLeast(80)` |
| `Math.max(56, viewport.w * 0.62)` | `widthConstraints.minViewportPercent({ ratio: 0.62, min: 56 })` |
| `clamp(viewport.w - 4, 20, 140)` | `widthConstraints.clampedViewportMinus({ minus: 4, min: 20, max: 140 })` |
| Repeated label padding hacks | `groupConstraints.maxSiblingMinWidth("kv-key")` |

---

## Before/after examples

### Responsive rail visibility

Before:

```ts
display: expr("if(viewport.w < 80, 0, 1)")
```

After:

```ts
display: visibilityConstraints.viewportWidthAtLeast(80)
```

### Viewport clamping

Before:

```ts
width: expr("clamp(20, viewport.w - 4, 140)")
```

After:

```ts
width: widthConstraints.clampedViewportMinus({ minus: 4, min: 20, max: 140 })
```

### Equalized key/value labels

Before (manual spacing guesses):

```ts
ui.box({ width: 12, border: "none", p: 0 }, [ui.text("Latency", { dim: true })])
```

After (derived from the widest sibling label):

```ts
ui.box(
  { id: "kv-key", width: groupConstraints.maxSiblingMinWidth("kv-key"), border: "none", p: 0 },
  [ui.text("Latency", { dim: true })],
)
```

---

## Anti-pattern checklist

When you see any of these in a view function, consider migrating:

- `Math.floor/ceil/max/min` used to compute widget `width`/`height`
- Persisting `viewport` sizes in state for layout decisions
- Long `expr("...")` strings for standard patterns (`clamp`, “remaining width”, visibility thresholds)
- Viewport-based visibility implemented via conditional rendering (`if (...) return ...`) instead of `display`

---

## Notes on determinism

Constraints are deterministic: unknown functions and invalid references are not silently coerced.

If a migration surfaces an error:
- Fix the expression, or
- Replace it with a helper that encodes the intended rule more clearly.
