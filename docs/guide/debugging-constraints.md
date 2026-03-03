# Debugging Constraints

Rezi constraint failures are **deterministic**: there are no silent fallbacks and no “best effort” coercions.

This guide is a diagnosis flow for the most common constraint/layout failures.

See also:
- `docs/guide/constraints.md`
- `docs/reference/constraint-expressions.md`
- `docs/dev/live-pty-debugging.md` (frame-audit workflow)

---

## 1) Identify the error class

### `ConstraintSyntaxError` (parse-time)

Cause: invalid DSL syntax in `expr("...")`.

Fix:
- Correct the expression string
- Prefer helper constraints to avoid hand-typed syntax for common patterns

### `ZRUI_INVALID_CONSTRAINT` (frame-time)

Common causes:
- Unknown function name (typo): `clmp(...)`
- Unknown widget ref: `#sidebr.w`
- Ambiguous direct widget ref when ids are shared
- Invalid `max_sibling` / `sum_sibling` usage

Fix:
- Check the expression source in the error detail
- If you intended a common pattern, replace it with a helper from `docs/reference/constraints-api.md`

### `ZRUI_CIRCULAR_CONSTRAINT` (frame-time)

Cause: a cycle in dependency graph (often mutual sibling width references).

Fix:
- Anchor one side of the relationship to `parent.*`, `viewport.*`, or `intrinsic.*`
- Avoid `#a` → `#b` and `#b` → `#a` loops

### `ZRUI_INVALID_PROPS`

Cause: prop contract violations, for example:
- `%` size strings
- responsive-map layout constraints (`{ sm, md, ... }`)
- `grid.columns: expr(...)` (invalid in alpha)

Fix:
- Migrate to helper constraints / `expr` where supported
- Use multiple grids and switch with `display` for responsive columns

---

## 2) Narrow down the source

Practical steps:

1. Search for `expr("` usages near the failing widget
2. Check for `#id.*` references and confirm the referenced ids exist in the same committed tree
3. Confirm direct `#id.*` targets are unique (use `max_sibling` / `sum_sibling` for shared ids)
4. Reduce the expression to a simpler form to isolate which term is invalid

---

## 3) Use deterministic runtime evidence (frame audit)

For hard-to-reproduce visual glitches, use the PTY + frame-audit workflow:

```bash
REZI_FRAME_AUDIT=1 REZI_FRAME_AUDIT_LOG=/tmp/rezi-frame-audit.ndjson node <your-app>
node scripts/frame-audit-report.mjs /tmp/rezi-frame-audit.ndjson --latest-pid
```

This helps confirm whether layout/renderer diverges across frames, and provides stage-level counters.

---

## 4) Use the dev inspector overlay (constraints instrumentation)

Rezi can surface **constraint graph + resolved values** in the dev inspector overlay.

Enable it by using `createAppWithInspectorOverlay(...)` (default toggle hotkey is `ctrl+shift+i`):

```ts
import { createAppWithInspectorOverlay } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const app = createAppWithInspectorOverlay({
  backend: createNodeBackend(),
  initialState: { /* ... */ },
});
```

What you’ll see:
- `constraints:` graph node count, hidden-by-display count, and whether the last resolution was reused / cache hit / computed.
- `constraints_focus:` resolved constraint values for the **currently focused widget id** (if present in the constraint graph).
- `constraints_exprs:` the constraint expressions that apply to that focused widget instance (truncated).

Notes:
- If an `id` is shared by multiple widgets, the overlay reports `instances=N` and shows one instance. Prefer unique ids when debugging.
- This instrumentation is intended for development (it adds per-frame bookkeeping and allocations).

---

## 5) Recognize common constraint bugs

- **Wrong `clamp(...)` argument order**: Rezi uses `clamp(min, value, max)`.
- **Assuming boolean operators exist**: the DSL does not support `&&`/`||`; use `if(...)` or ternary.
- **Creating “invisible dependencies”**: referencing a widget that is conditionally omitted via `show(...)` can invalidate sibling refs.
