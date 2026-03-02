# Constraints Guide

Rezi's constraint DSL (`expr("...")`) is the canonical way to express derived layout relationships in the breaking alpha branch.

See also:
- [Layout Guide](layout.md)
- [Constraint Recipes](constraint-recipes.md)
- [Constraints API Reference](../reference/constraints-api.md)
- [Constraint Expressions Reference](../reference/constraint-expressions.md)
- [Debugging Constraints](debugging-constraints.md)
- [Performance with Constraints](performance-with-constraints.md)
- [Design Principles](../design-principles.md)

## Alpha Contract

- Use `expr("...")` for derived layout values (`width`, `height`, min/max constraints, `flexBasis`, and `display` on supported widgets).
- Prefer the helper layer for common patterns (`visibilityConstraints`, `widthConstraints`, `heightConstraints`, `spaceConstraints`, `groupConstraints`, `conditionalConstraints`); keep raw `expr("...")` as the advanced escape hatch.
- Use `display: expr("...")` for layout/viewport visibility decisions.
- Keep business-logic visibility in `show(...)`, `when(...)`, `match(...)`, or `maybe(...)`.
- `%` layout size strings and responsive-map layout constraints (`{ sm, md, ... }`) are removed.
- `grid.columns` supports `number | string` only in alpha. `columns: expr(...)` is intentionally invalid.

## Supported References

Inside `expr("...")`, these references are supported:

- `parent.w`, `parent.h`
- `viewport.w`, `viewport.h`
- `intrinsic.w`, `intrinsic.h`
- `#id.w`, `#id.h`, `#id.min_w`, `#id.min_h`

Direct `#id.*` references require a unique target ID in scope. Shared IDs must use aggregation functions.

## Supported Functions

Constraint function allowlist:

- `clamp(min, value, max)`
- `min(a, b)`
- `max(a, b)`
- `floor(x)`
- `ceil(x)`
- `round(x)`
- `abs(x)`
- `if(cond, then, else)` (`cond > 0` is truthy)
- `max_sibling(#id.min_w)` (or other supported `#id.*` metric)
- `sum_sibling(#id.w)` (or other supported `#id.*` metric)
- `steps(value, threshold1: result1, threshold2: result2, ...)`

Unknown function names are deterministic errors (`ZRUI_INVALID_CONSTRAINT`).

## Syntax

Supported operators:

- Arithmetic: `+`, `-`, `*`, `/`
- Comparisons: `>`, `>=`, `<`, `<=`, `==`, `!=`
- Ternary: `cond ? then : else`
- Grouping: `( ... )`

Examples:

```ts
expr("parent.w - #sidebar.w")
expr("clamp(20, viewport.w * 0.25, 50)")
expr("viewport.w >= 110 ? 1 : 0")
expr("steps(viewport.w, 80: 10, 120: 20, 160: 30)")
```

## Where to Use Constraints

Use constraints when layout depends on relationships:

- Parent-relative sizing: `expr("parent.w * 0.5")`
- Viewport breakpoints: `expr("if(viewport.w >= 110, 32, 20)")`
- Sibling-relative sizing: `expr("parent.w - #sidebar.w - #rail.w")`
- Intrinsic sizing with bounds: `expr("clamp(30, intrinsic.w + 4, parent.w)")`

Use non-constraint APIs when relationships are not needed:

- Fixed size: `width: 24`
- Flex distribution: `flex: 1`
- Smooth interpolation: `fluid(min, max)`
- Business logic visibility: `show(state.ready, widget)`

## Layout Visibility (`display`)

`display` can be constraint-driven:

```ts
ui.box({
  id: "detail-rail",
  display: expr("viewport.w >= 110"),
  width: 28,
}, [...]);
```

Notes:

- Hidden nodes are excluded from normal layout and metadata surfaces (focus/hit-test).
- Sibling metric lookups to hidden nodes resolve deterministically as zero-sized metrics.

## Grid Contract (Important)

`grid.columns` does not currently accept `expr(...)` in alpha.

Supported:

```ts
ui.grid({ columns: 3, gap: 1 }, ...children)
ui.grid({ columns: "14 auto 1fr", gap: 1 }, ...children)
```

Not supported:

```ts
ui.grid({ columns: expr("max(1, floor(parent.w / 24))") }, ...children) // invalid in alpha
```

For responsive behavior, compose multiple grids and switch with `display: expr(...)`.

```ts
ui.column({ gap: 1 }, [
  ui.grid({
    id: "compact-grid",
    columns: 2,
    display: expr("viewport.w < 110"),
    gap: 1,
  }, ...compactChildren),
  ui.grid({
    id: "wide-grid",
    columns: "1fr 1fr 1fr 1fr",
    display: expr("viewport.w >= 110"),
    gap: 1,
  }, ...wideChildren),
]);
```

## Diagnostics and Error Codes

### Parse-time (`expr(...)` call)

- `ConstraintSyntaxError` is thrown for invalid DSL syntax.
- Error includes the source expression and a caret position.

### Frame-time (submit/layout pipeline)

- `ZRUI_INVALID_CONSTRAINT`
  - Unknown function name (for example `clmp`)
  - Unknown or ambiguous widget reference
  - Other invalid constraint graph cases
- `ZRUI_CIRCULAR_CONSTRAINT`
  - Cycle in constraint dependencies
- `ZRUI_INVALID_PROPS`
  - Invalid layout prop contract usage (for example `%` strings, responsive-map layout constraints, or unsupported `grid.columns: expr(...)`)

These diagnostics are deterministic and should be treated as actionable failures, not soft warnings.

## Migration Patterns

| Legacy pattern | Use now |
|---|---|
| `width: "50%"` | `width: expr("parent.w * 0.5")` |
| `width: { sm: 10, md: 20, lg: 30 }` | `width: expr("steps(viewport.w, 80: 10, 120: 20, 160: 30)")` or `fluid(10, 30)` |
| `show(viewportW >= 100, panel)` | `display: expr("viewport.w >= 100")` |
| View-function `Math.max/Math.min/Math.floor` for layout sizing | Constraint expressions (`clamp`, `steps`, `floor`, `if`) |

## Quick Checklist

Before merging constraint-related changes:

- [ ] No `%` layout strings
- [ ] No responsive-map layout constraints for size/display
- [ ] No unsupported `grid.columns: expr(...)`
- [ ] No manual viewport arithmetic for layout where DSL expresses the same rule
- [ ] `display: expr(...)` used for layout visibility, not business logic
- [ ] Constraint examples use only supported references/functions
