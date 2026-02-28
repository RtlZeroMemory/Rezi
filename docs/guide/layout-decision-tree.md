# Layout Decision Tree

Rezi has a “simple first” layout philosophy: fixed and flex layouts stay simple; constraints are for relational/derived rules.

---

## Decision tree

Need to set a size?

1. **Fixed cells**
   - Use: `width: 24`, `height: 3`
   - Avoid: `expr("24")`

2. **Share space with siblings**
   - Use: `flex: 1` (and `flexShrink`/`flexBasis` when needed)
   - Avoid: manual `parent.w / n` math in view code

3. **Smooth scaling with viewport**
   - Use: `fluid(min, max, options?)`

4. **Derived relationships (relational intent)**
   - Use helper constraints (preferred):
     - `visibilityConstraints.*`
     - `widthConstraints.*`
     - `heightConstraints.*`
     - `spaceConstraints.*`
     - `groupConstraints.*`
     - `conditionalConstraints.*`
   - Use `expr("...")` when helpers don’t express the rule

5. **2D arrangement**
   - Use: `ui.grid({ columns: number | string, ... })`
   - For responsive columns in alpha: compose multiple grids and switch via `display`

---

## Visibility rule of thumb

- Layout/viewport visibility → `display: ...` constraint
- Business logic visibility → `show(...)` / `when(...)` / `maybe(...)` / `match(...)`

---

## Links

- `docs/guide/constraints.md`
- `docs/reference/constraints-api.md`
- `docs/reference/constraint-expressions.md`
- `docs/guide/constraint-recipes.md`

