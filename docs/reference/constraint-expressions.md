# Constraint Expressions (DSL Reference)

`expr("...")` is Rezi’s constraint expression escape hatch. It’s used for **derived layout relationships** (parent/viewport/sibling/intrinsic).

Prefer the helper layer for common patterns:
- `docs/reference/constraints-api.md`
- `docs/guide/constraints.md`

---

## Where expressions are allowed

Constraint expressions are accepted on **supported layout props** such as:

- `width`, `height`
- `minWidth`, `minHeight`, `maxWidth`, `maxHeight`
- `flexBasis`
- `display` (layout-driven visibility)

Notably, `grid.columns` is **not** expression-enabled in the alpha contract:

```ts
ui.grid({ columns: 3 }, children)              // ok
ui.grid({ columns: "14 auto 1fr" }, children) // ok
ui.grid({ columns: expr("...") }, children)   // invalid in alpha
```

---

## References

Inside `expr("...")`, these references are supported:

- `parent.w`, `parent.h` — parent content size
- `viewport.w`, `viewport.h` — terminal viewport size
- `intrinsic.w`, `intrinsic.h` — widget’s measured natural size (when available)
- `#id.w`, `#id.h`, `#id.min_w`, `#id.min_h` — sibling widget metrics

Notes:
- Direct `#id.*` references require a **unique target id** in scope.
- Shared ids are allowed (for non-interactive nodes) but must be used with sibling aggregation functions (`max_sibling`, `sum_sibling`) to avoid ambiguity.

---

## Operators and syntax

Supported operators:

- Arithmetic: `+`, `-`, `*`, `/`
- Comparisons: `>`, `>=`, `<`, `<=`, `==`, `!=`
- Ternary: `cond ? then : else`
- Grouping: `( ... )`

There is **no** `&&` / `||` operator. Combine conditions using `if(...)` or ternary.

Comparison operators evaluate to numeric truthiness:
- true → `1`
- false → `0`

Division by zero evaluates deterministically as `0`.

---

## Function allowlist

Supported functions:

- `clamp(min, value, max)`
- `min(a, b)`
- `max(a, b)`
- `floor(x)`
- `ceil(x)`
- `round(x)`
- `abs(x)`
- `if(cond, then, else)` (`cond > 0` is truthy)
- `max_sibling(#id.<metric>)`
- `sum_sibling(#id.<metric>)`
- `steps(value, t1: r1, t2: r2, ...)`

Unknown function names are deterministic errors (`ZRUI_INVALID_CONSTRAINT`).

---

## Examples

```ts
expr("parent.w * 0.5")
expr("clamp(20, viewport.w * 0.25, 50)")
expr("viewport.w >= 110 ? 1 : 0")
expr("if(viewport.w >= 120, 60, 100)")
expr("max(0, parent.w - #sidebar.w - #rail.w - 1)")
expr("max_sibling(#kv-key.min_w)")
expr("steps(viewport.w, 80: 10, 120: 20, 160: 30)")
```

`steps(...)` is a compact breakpoint helper:
- returns the first matching `value` where `input < threshold`
- uses the final provided value as the fallback when `input` exceeds all thresholds

---

## Diagnostics

### Parse-time (`expr(...)`)

Invalid DSL syntax throws `ConstraintSyntaxError` and includes source + position.

### Frame-time

Constraint and layout integration failures surface deterministically:

- `ZRUI_INVALID_CONSTRAINT` — unknown function, unknown/ambiguous ref, invalid graph usage
- `ZRUI_CIRCULAR_CONSTRAINT` — a dependency cycle was detected
- `ZRUI_INVALID_PROPS` — constraint usage violates widget/layout contracts (for example `%` size strings, responsive-map size constraints, or `grid.columns: expr(...)`)

See `docs/guide/debugging-constraints.md` for a diagnosis flow.
