---
name: rezi-perf-profiling
description: Profile and optimize Rezi app performance. Use when app feels slow, frames drop, or render phases take too long.
---

## When to use

Use this skill when:

- App feels slow or unresponsive
- Frames drop or input lags
- Need to identify which render phase is the bottleneck
- Optimizing a specific widget or screen

## Source of truth

- `packages/core/src/app/widgetRenderer.ts` — render pipeline with phase timing
- `packages/core/src/runtime/commit.ts` — reconciliation (leaf/container reuse)
- `packages/core/src/layout/` — layout engine (FNV-1a stability signatures)
- `packages/bench/src/` — profiling scripts

## Steps

1. **Enable profiling** and run:
   ```bash
   REZI_PERF=1 REZI_PERF_DETAIL=1 node your-app.js
   ```

2. **Observe phase timings**: view → commit → layout → render → build

3. **Run systematic profiling**:
   ```bash
   npx tsx packages/bench/src/profile-phases.ts
   npx tsx packages/bench/src/profile-construction.ts
   ```

4. **Apply common fixes**:

   | Bottleneck | Fix |
   |-----------|-----|
   | View phase slow | `useMemo()` for expensive computations |
   | Commit phase slow | Add `key` props on list items for stable reconciliation |
   | Layout phase slow | Reduce nesting depth; layout stability signatures skip relayout when tree is stable |
   | Render phase slow | Use `ui.virtualList()` for large datasets |
   | Overall slow | Flatten unnecessary wrapper nodes |

5. **Depth guardrails**:
   - Warning at 200 levels
   - Fatal at 500 levels
   - Refactor deep nesting into flatter structures

## Key optimization patterns

- `useMemo(ctx, () => expensiveComputation, [deps])` — skip recomputation
- `key` on every list item — enables O(1) reconciliation
- `ui.virtualList()` — only renders visible rows
- Avoid creating new closures/objects in render — use `useCallback(ctx, fn, [deps])`
