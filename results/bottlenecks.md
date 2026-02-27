# Ink-Compat Bottlenecks (Ranked)

This table is based on:

- Per-frame JSONL timings (`frames.jsonl`)
- Per-run summaries (`run-summary.json` / `batch-summary.json`)
- CPU profiles (`--cpu-prof`, `.cpuprofile`)

Evidence directories are local `results/ink-bench_*` batches (ignored by git; reproducible via `npm run bench`).

| Rank | Bottleneck | Location | % cost | Evidence | Fix plan | Expected gain | Actual gain |
|---:|---|---|---:|---|---|---:|---:|
| 1 | **Extra frames (poor coalescing) on `ink-compat`** under `maxFps` | `packages/ink-compat/src/runtime/render.ts` (`createThrottle`, `scheduleRender`) | **Work multiplier** (frames/update) | Baseline `dashboard-grid`: `ink-compat` emitted ~`136` frames for `140` updates vs Ink ~`78` for `140` (renderTotal `+36%`). Batch: `results/ink-bench_dashboard-grid_ink-compat_2026-02-27T16-54-55-795Z` vs `results/ink-bench_dashboard-grid_real-ink_2026-02-27T16-54-43-532Z`. | Implement Ink-matching throttle/coalescing semantics for commit-triggered renders (debounce+maxWait), keep resize redraw correctness. | 20–50% lower `meanRenderTotalMs` in frame-heavy scenarios | Achieved: `dashboard-grid` renderTotal **121ms → 81ms** (`-33%`) and frames **136 → 72** (`-47%`). Batch: `results/ink-bench_dashboard-grid_ink-compat_2026-02-27T17-33-45-750Z`. Similar gains in `style-churn` and `streaming-chat` (frames normalized; renderTotal fell 27–37%). |
| 2 | **Translation cache invalidation (revision churn)** preventing `propsToVNode` reuse | `packages/ink-compat/src/reconciler/types.ts` (`setNodeProps`, `propsSemanticallyEqual`) + `packages/ink-compat/src/translation/propsToVNode.ts` | ~5–15% of `renderTimeMs` (scenario-dependent) | With `BENCH_DETAIL=1`, observed persistent stale-miss patterns (cache hits ~0) until semantic-equality short-circuiting was added; after fix, hits appear and `translatedNodes` drops (see `dashboard-grid` detail runs). | Keep semantic equality guardrails; expand safely to more prop shapes if needed; add correctness tests for edge props. | 5–20% lower translation time / alloc churn | Achieved: translation counters show non-zero cache hits post-fix; per-frame `translationMs` fell and stabilized (see `BENCH_DETAIL=1` runs). |
| 3 | **Unnecessary commitUpdate calls** due to non-null “no update” payload | `packages/ink-compat/src/reconciler/hostConfig.ts` (`prepareUpdate`) | Small (overhead per commit) | Unit test + reconciler behavior: returning `false` triggers commitUpdate path in React; returning `null` skips it. | Return `null` when props are shallow-equal (excluding `children`/`ref`/`key`), keep commitUpdate fast-paths. | Low single-digit % CPU | Achieved: test suite confirms `null` semantics; reduces commitUpdate dispatch work. |
| 4 | **Fairness bug: Ink `renderTime` excludes Yoga layout** (measurement only) | `scripts/ink-compat-bench/preload.mjs` (real Ink instance patching) | n/a | Verified by call stack: Yoga layout occurs in `resetAfterCommit` via `rootNode.onComputeLayout`, outside Ink’s `onRender.renderTime`. | Measure Yoga layout separately and include in `renderTotalMs` for Ink. | n/a (correctness) | Achieved: `layoutTimeMs` is now recorded for `real-ink` frames, making `renderTotalMs` comparable. |

## Notes

- `% cost` for “extra frames” is not a single function’s self-time: it’s a **multiplier** on all per-frame costs (translation/layout/ANSI/write).
- `.cpuprofile` captures wall-clock samples and includes idle; use it for **call stacks**, not as the sole source of %CPU.

