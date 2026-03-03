# Performance with Constraints

Constraints are designed to be deterministic and debuggable, but they still have a cost model. This guide explains what matters in real apps.

See also:
- `docs/guide/performance.md`
- `docs/dev/testing.md` (perf and audit gates)

---

## Cost model (what you pay for)

1. **Parsing**: `expr("...")` parses DSL text into a frozen AST.
2. **Graph build**: expressions referencing `parent/viewport/#id/intrinsic` participate in a dependency graph.
3. **Resolution**: expressions are evaluated deterministically against resolved ref values.
4. **Layout**: resolved numbers flow into the layout engine.

Helper constraints compile to `expr("...")`, so they share the same underlying work.

Implementation note: `expr("...")` is cached by source string (small LRU), so repeating the same expression source does not re-parse each frame.

---

## Best practices

- Prefer helpers: they reduce mistakes and keep expressions simple.
- Hoist stable constraints out of hot render paths when practical:

```ts
const showRail = visibilityConstraints.viewportWidthAtLeast(110)

app.view(() => ui.box({ display: showRail }, [...]))
```

- Avoid generating lots of unique expression strings per frame (for example string concatenation with varying numbers).
- Use `steps(...)` or a small number of discrete breakpoints rather than many micro-variants.

---

## When to simplify

If you’re using constraints for something that’s naturally expressed by:
- `flex`
- fixed sizes
- `fluid(...)`

…switch back to those simpler primitives. Constraints are for relationships, not for everything.

---

## Validation tools

- Run the full deterministic test suite:
  - `npm run build`
  - `node scripts/run-tests.mjs`
- Use frame-audit when changing layout/constraints:
  - `docs/dev/live-pty-debugging.md`
