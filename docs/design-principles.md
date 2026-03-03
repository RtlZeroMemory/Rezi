# Design Principles (Breaking Alpha)

This page describes the project’s high-level product principles for the breaking alpha.

---

## Canonical layout mechanisms

Use the first mechanism that fits the need:

1. Fixed cells: `width: 20`
2. Flex distribution: `flex: 1`
3. Grid placement: `ui.grid({ columns: ... })`
4. Helper constraints (preferred) or `expr("...")` for derived relationships
5. `fluid(min, max)` for smooth scaling

---

## Constraint policy (summary)

- Helper-first constraints are the mainstream path:
  - `visibilityConstraints`, `widthConstraints`, `heightConstraints`, `spaceConstraints`, `groupConstraints`, `conditionalConstraints`
- Raw `expr("...")` is the escape hatch for custom rules.
- `%` size strings and responsive-map layout constraints (`{ sm, md, ... }`) are removed in the breaking alpha.
- `grid.columns` accepts `number | string` only in alpha; `columns: expr(...)` is invalid.
- Layout-driven visibility uses `display: ...` constraints; business logic visibility uses `show(...)`/`when(...)`/`maybe(...)`/`match(...)`.

---

## Banned patterns (high signal)

- Manual `Math.floor/ceil/min/max` to compute widget `width`/`height` in view functions
- Threading viewport size through application state for layout decisions
- `%` layout size strings
- responsive-map layout constraints for sizing/visibility

For detailed examples, see `docs/guide/constraints.md` and `docs/guide/layout-decision-tree.md`.
