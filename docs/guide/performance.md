# Performance

Rezi’s performance model is built around **bounded work** and **deterministic scheduling**. You get the best results when you keep views pure, keep identities stable, and use virtualization for large datasets.

## Reconciliation keys

When rendering lists, provide a stable `key` so Rezi can reconcile efficiently:

```typescript
import { ui } from "@rezi-ui/core";

ui.column({ gap: 1 }, items.map((it) => ui.text(it.name, { key: it.id })));
```

Guidelines:

- `key` must be unique among siblings.
- Prefer real IDs over array indices.
- Changing keys forces unmount/mount and can invalidate local state for complex widgets.

## Avoiding re-renders

Views are re-run when committed state changes. Keep `view(state)`:

- **pure** (no side effects)
- **cheap** (avoid large allocations each frame)
- **stable** (avoid rebuilding huge derived structures inline)

Patterns:

- Precompute derived data in state updates instead of inside `view`.
- Keep large static arrays/constants outside the view closure.
- Prefer event handlers that call `app.update(...)` without doing heavy work in render.
- For animation, prefer tick-driven widget updates over ad-hoc timer loops; Rezi
  bounds animation cadence to keep render and input responsive.

## Virtual lists

For large datasets, use `ui.virtualList` to window the rendered items:

```typescript
import { ui } from "@rezi-ui/core";

ui.virtualList({
  id: "results",
  items: state.rows,
  itemHeight: 1,
  overscan: 3,
  renderItem: (row, index, focused) =>
    ui.text(`${focused ? "> " : "  "}${row.name}`, { key: row.id }),
});
```

This keeps render + layout work proportional to the visible window rather than the full dataset size.

## Caps and limits

The runtime enforces hard limits (drawlist sizes, event batch validation, etc.). These failures are deterministic and surfaced as fatal errors in development to prevent “slow corruption” or non-deterministic behavior.

If you hit limits:

- reduce per-frame draw commands (simplify UI or virtualize)
- avoid rendering off-screen content
- ensure your view isn’t duplicating large subtrees unnecessarily

## Profiling

Use the debug trace system to inspect frame timing and hotspots. For normal
apps, use `createNodeApp()`. `createNodeBackend()` is used here only to wire
the debug backend explicitly.

```typescript
import { createDebugController, categoriesToMask } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();
const debug = createDebugController({ backend: backend.debug, maxFrames: 300 });
await debug.enable({ categoryMask: categoriesToMask(["perf", "frame"]) });
```

See: [Debugging](debugging.md).

## Common pitfalls

- **Missing `key`** in dynamic lists → high churn, lost local state
- **Using array index as `key`** → reordering causes remounts
- **Allocating large arrays/objects** inside `view` every frame
- **Calling `update()` during render** → throws deterministically (`ZRUI_UPDATE_DURING_RENDER`)
- **Rendering large tables without `ui.table`/`ui.virtualList`** → unbounded work

## Related

- [Lifecycle & Updates](lifecycle-and-updates.md) - Commit points and frame coalescing
- [Layout](layout.md) - How size constraints and clipping affect work

Next: [Debugging](debugging.md).
