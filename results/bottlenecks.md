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
| 5 | **Runtime hot-path allocation churn** (eager test-renderer node materialization + commit signature strings) | `packages/core/src/testing/renderer.ts`, `packages/ink-compat/src/runtime/render.ts` | **~0.6% self** pre-fix (`collectNodes` 0.3% + `rootChildRevisionSignature` 0.3%) | Pre-fix cpuprofile shows both symbols on the commit path (`18-23-12-600Z` run). Post-fix profile (`18-33-45-835Z`) no longer shows either symbol in filtered top output. Bench delta: dashboard-grid `renderTotalP95Ms` **1.94ms → 1.83ms** and gap vs Ink **+18.4% → +10.4%**. | Use lazy `nodes` in runtime mode + `forEachLayoutNode` traversal for hot path; replace revision-signature string building with numeric revision tracking. | 3–10% p95 tail reduction | Achieved in this increment: `meanRenderTotalMs` `-2.8%`, `renderTotalP95Ms` `-5.9%`, `totalCpuTimeS` `-3.7%` (ink-compat, dashboard-grid). |

## Notes

- `% cost` for “extra frames” is not a single function’s self-time: it’s a **multiplier** on all per-frame costs (translation/layout/ANSI/write).
- `.cpuprofile` captures wall-clock samples and includes idle; use it for **call stacks**, not as the sole source of %CPU.

## CPU profile evidence (call stacks)

Percentages below come from `summarize-cpuprofile.mjs --active` (i.e. **non-idle samples only**).

### 1) Extra frames (poor coalescing) under `maxFps`

Cpuprofile (pre-fix `dashboard-grid`, `ink-compat`, 136 frames):

- `results/ink-bench_dashboard-grid_ink-compat_2026-02-27T16-22-32-765Z/run_01/cpu-prof/dashboard-grid_ink-compat_run1.cpuprofile`

Representative leaf frames in `packages/ink-compat/dist/runtime/render.js`:

- `renderOpsToAnsi` — **0.7% self** (active samples)
  ```text
  processTimers (node:internal/timers:504:25)
  listOnTimeout (node:internal/timers:524:25)
  flushScheduledRender (packages/ink-compat/dist/runtime/render.js:2574:34)
  renderFrame (packages/ink-compat/dist/runtime/render.js:2233:25)
  renderOpsToAnsi (packages/ink-compat/dist/runtime/render.js:1481:25)
  ```
- `bridge.rootNode.onCommit` — **0.7% self**
  ```text
  performWorkOnRootViaSchedulerTask (packages/ink-compat/node_modules/react-reconciler/cjs/react-reconciler.development.js:2125:47)
  commitRoot (packages/ink-compat/node_modules/react-reconciler/cjs/react-reconciler.development.js:12831:24)
  resetAfterCommit (packages/ink-compat/dist/reconciler/hostConfig.js:106:21)
  bridge.rootNode.onCommit (packages/ink-compat/dist/runtime/render.js:2606:32)
  ```
- `readWindowSize` — **0.4% self**
  ```text
  flushScheduledRender (packages/ink-compat/dist/runtime/render.js:2574:34)
  renderFrame (packages/ink-compat/dist/runtime/render.js:2233:25)
  readViewportSize (packages/ink-compat/dist/runtime/render.js:18:26)
  readWindowSize (packages/ink-compat/dist/runtime/render.js:25:28)
  ```

### 2) Translation cache invalidation (revision churn)

Cpuprofile (translation-heavy `style-churn`, `ink-compat`):

- `results/ink-bench_style-churn_ink-compat_2026-02-27T17-29-35-710Z/run_01/cpu-prof/style-churn_ink-compat_run1.cpuprofile`

Representative leaf frames in `packages/ink-compat/dist/translation/propsToVNode.js`:

- `translateText` — **0.3% self** (active samples)
  ```text
  translateNodeUncached (packages/ink-compat/dist/translation/propsToVNode.js:232:31)
  translateBox (packages/ink-compat/dist/translation/propsToVNode.js:314:22)
  translateNode (packages/ink-compat/dist/translation/propsToVNode.js:181:23)
  translateNodeUncached (packages/ink-compat/dist/translation/propsToVNode.js:232:31)
  translateText (packages/ink-compat/dist/translation/propsToVNode.js:716:23)
  ```
- `flattenTextChildren` — **0.3% self**
  ```text
  translateNodeUncached (packages/ink-compat/dist/translation/propsToVNode.js:232:31)
  translateText (packages/ink-compat/dist/translation/propsToVNode.js:716:23)
  flattenTextChildren (packages/ink-compat/dist/translation/propsToVNode.js:805:29)
  ```
- `translateNodeUncached` — **0.3% self**
  ```text
  flushPendingRender (packages/ink-compat/dist/runtime/render.js:2658:32)
  renderFrame (packages/ink-compat/dist/runtime/render.js:2298:25)
  translateDynamicTreeWithMetadata (packages/ink-compat/dist/translation/propsToVNode.js:157:49)
  translateNode (packages/ink-compat/dist/translation/propsToVNode.js:181:23)
  translateNodeUncached (packages/ink-compat/dist/translation/propsToVNode.js:232:31)
  ```

### 3) Unnecessary `commitUpdate` calls

Cpuprofile (same `style-churn`, `ink-compat` capture):

- `results/ink-bench_style-churn_ink-compat_2026-02-27T17-29-35-710Z/run_01/cpu-prof/style-churn_ink-compat_run1.cpuprofile`

Representative leaf frames in `packages/ink-compat/dist/reconciler/hostConfig.js`:

- `sanitizeProps` — **0.3% self** (active samples)
  ```text
  commitHostUpdate (packages/ink-compat/node_modules/react-reconciler/cjs/react-reconciler.development.js:9778:30)
  commitUpdate (packages/ink-compat/dist/reconciler/hostConfig.js:55:17)
  sanitizeProps (packages/ink-compat/dist/reconciler/hostConfig.js:9:23)
  ```
- `commitTextUpdate` — **0.3% self**
  ```text
  commitMutationEffectsOnFiber (packages/ink-compat/node_modules/react-reconciler/cjs/react-reconciler.development.js:10521:42)
  commitTextUpdate (packages/ink-compat/dist/reconciler/hostConfig.js:68:21)
  ```

### 4) Fairness: Ink `renderTime` excludes Yoga layout

Cpuprofile (`dashboard-grid`, `real-ink`):

- `results/ink-bench_dashboard-grid_real-ink_2026-02-27T17-29-17-074Z/run_01/cpu-prof/dashboard-grid_real-ink_run1.cpuprofile`

Representative Yoga layout stacks:

- `calculateLayout` — **0.2% self** (active samples)
  ```text
  resetAfterCommit (ink/build/reconciler.js:71:21)
  rootNode.onComputeLayout (scripts/ink-compat-bench/preload.mjs:62:38)
  calculateLayout (ink/build/ink.js:151:23)
  ```
- Yoga wasm leaf (anonymous) — **0.2% self**
  ```text
  resetAfterCommit (ink/build/reconciler.js:71:21)
  (anonymous) (dist/binaries/yoga-wasm-base64-esm.js:32:295)
  ```

### 5) Runtime hot-path allocation churn

Pre-fix cpuprofile (`dashboard-grid`, ink-compat):

- `results/ink-bench_dashboard-grid_ink-compat_2026-02-27T18-23-12-600Z/run_01/cpu-prof/dashboard-grid_ink-compat_run1.cpuprofile`

Representative leaf frames (active samples):

- `collectNodes` — **0.3% self**
  ```text
  commitRoot -> resetAfterCommit -> bridge.rootNode.onCommit -> scheduleRender
  -> flushPendingRender -> renderFrame -> render (testing/renderer.js)
  -> collectNodes (testing/renderer.js)
  ```
- `rootChildRevisionSignature` — **0.3% self**
  ```text
  performWorkOnRootViaSchedulerTask -> commitRoot -> resetAfterCommit
  -> bridge.rootNode.onCommit -> rootChildRevisionSignature (runtime/render.js)
  ```

Post-fix cpuprofile (`dashboard-grid`, ink-compat):

- `results/ink-bench_dashboard-grid_ink-compat_2026-02-27T18-33-45-835Z/run_01/cpu-prof/dashboard-grid_ink-compat_run1.cpuprofile`

Filtered summaries for `packages/core/dist/testing/renderer.js` and `rootChildRevisionsChanged` return **no top self-time entries**, consistent with removing those hot-path costs from default runtime rendering.
