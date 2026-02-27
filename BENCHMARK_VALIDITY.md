# Ink vs Ink-Compat Benchmark Validity (FAIR)

This benchmark suite compares:

- **`real-ink`**: `@jrichman/ink`
- **`ink-compat`**: `@rezi-ui/ink-compat` (Rezi-backed Ink replacement)

The **exact same benchmark app code** runs in both modes (`packages/bench-app`). The only difference is **module resolution for `ink`** at runtime (a symlink in `packages/bench-app/node_modules/ink`).

If equivalence fails, the benchmark is **invalid** until fixed.

## Renderer Selection (Same App Code)

`bench-app` imports from `ink` normally:

- `import { render, Box, Text } from "ink"`

`bench-runner` switches renderers by linking:

- `real-ink`: `packages/bench-app/node_modules/ink -> node_modules/@jrichman/ink`
- `ink-compat`: `packages/bench-app/node_modules/ink -> packages/ink-compat`

React is resolved from the workspace root, keeping a singleton React version across both runs.

## Determinism & Terminal Fairness

### PTY + fixed terminal

All runs execute inside a PTY (`node-pty`) with fixed dimensions:

- `BENCH_COLS` (default `80`)
- `BENCH_ROWS` (default `24`)

The harness forces a consistent terminal identity:

- `TERM=xterm-256color`
- `COLUMNS`, `LINES` set to `BENCH_COLS/BENCH_ROWS`
- `FORCE_COLOR=1`

### Rendering mode

The benchmark app uses consistent Ink render options for both renderers:

- `alternateBuffer: false`
- `incrementalRendering: true`
- `maxFps: BENCH_MAX_FPS` (default `60`)
- `patchConsole: false`

### Offline, scripted inputs

Scenarios are driven via a control socket (JSON lines) plus optional scripted keypresses/resizes:

- streaming tokens / ticks are deterministic
- large-list-scroll uses scripted `↓` inputs
- no network access

## Output Equivalence (Correctness Gate)

For every verify run:

1. The harness captures **raw PTY output bytes** (`pty-output.bin`).
2. Output is applied to a headless terminal (`@xterm/headless`) to reconstruct the **final screen buffer** (`screen-final.txt`).
3. `npm run verify` compares `real-ink` vs `ink-compat` final screens.

Rules:

- If **final screen differs**, the scenario comparison is **invalid**.
- If intermediate frames differ but the final screen matches, we allow it and report only final equivalence (intermediate equivalence is currently **UNPROVEN**).

Known limitation:

- `resize-storm` currently fails final-screen equivalence and is excluded from valid comparisons.

## Settle Detection (Time To Stable)

The harness tracks a rolling screen hash and marks the run **stable** when:

- screen hash is unchanged for `stableWindowMs` (default `250ms`)

Reported:

- `timeToStableMs`: time from start until the first moment stability is satisfied
- `meanWallS`: end-to-end wall time to settle (`timeToStableMs/1000`, falling back to total duration if stability isn’t reached)

## Meaningful Paint Signal

The benchmark app always renders a deterministic marker:

- `BENCH_READY ...`

The harness reports:

- `timeToFirstMeaningfulPaintMs`: first time any screen line contains `BENCH_READY`

## Metrics: What’s Measured (Per Frame)

Per-frame metrics are written as JSONL:

- `packages/bench-app/dist/entry.js` writes `frames.jsonl` on exit.

Each frame corresponds to one `onRender()` callback invocation.

### Shared metrics

- `renderTimeMs`
  - from renderer `onRender({renderTime})`
  - **excludes** any time spent waiting for throttling/scheduling
- `layoutTimeMs`
  - **real-ink only**: Yoga layout wall time measured via preload instrumentation (see below)
- `renderTotalMs`
  - `renderTimeMs + (layoutTimeMs ?? 0)`
  - primary “render CPU work” accumulator for comparisons (still see UNPROVEN caveats)
- `scheduleWaitMs`
  - time from “first update requested” until “frame start”
  - reported separately; **excluded** from `renderTotalMs`
- `stdoutWriteMs`, `stdoutBytes`, `stdoutWrites`
  - measured by wrapping `process.stdout.write()` inside the app
  - **caveat**: this measures JS time spent in `write()` calls, not kernel flush completion
- `updatesRequestedDelta`
  - number of app updates requested since prior frame
  - used to compute coalescing stats (`updatesRequested`, `updatesPerFrameMean`, etc.)

### Ink-compat-only phase breakdown (when enabled)

When `BENCH_INK_COMPAT_PHASES=1`, `ink-compat` emits phase timings into the app’s frame record:

- `translationMs`
- `percentResolveMs`
- `coreRenderMs`
- `assignLayoutsMs`
- `rectScanMs`
- `ansiMs`
- plus node/op counts

High-cardinality counters (translation cache hits/misses, etc.) are gated by:

- `BENCH_DETAIL=1`

## Metrics: What’s Measured (Per Run)

Per-run summaries are written to `run-summary.json` and `batch-summary.json`:

Primary KPIs:

- `meanWallS`
- `totalCpuTimeS`
  - derived from `/proc/<pid>/stat` sampling (user+system ticks), converted using `getconf CLK_TCK`
- `meanRenderTotalMs` (sum of per-frame `renderTotalMs`)
- `timeToFirstMeaningfulPaintMs`
- `timeToStableMs`

Secondary KPIs:

- render latency distribution: `renderTotalP50Ms`, `renderTotalP95Ms`, `renderTotalP99Ms`, `renderTotalMaxMs`
- scheduling distribution: `scheduleWaitP50Ms`, `scheduleWaitP95Ms`, `scheduleWaitP99Ms`, `scheduleWaitMaxMs`
- coalescing stats: `updatesRequested`, `updatesPerFrameMean`, `framesWithCoalescedUpdates`, `maxUpdatesInFrame`
- I/O stats: `writes`, `bytes`, `renderMsPerKB`
- memory: `peakRssBytes` (from `/proc` samples)

## What `renderTime` Includes / Excludes (Renderer-Specific)

### `real-ink` (`@jrichman/ink`)

`renderTimeMs` comes from Ink’s `onRender` callback.

- **Includes**: Ink’s JS-side render pipeline inside `Ink.onRender()` (output generation + stdout writes).
- **Excludes**: Yoga layout time, because Yoga layout runs via `rootNode.onComputeLayout()` during React commit (`resetAfterCommit`).

To make comparisons fair, we instrument Yoga layout:

- A preload script patches each Ink instance’s `rootNode.onComputeLayout` to time Yoga layout and attaches `layoutTimeMs` to the `onRender` metrics.
- The benchmark uses `renderTotalMs = renderTimeMs + layoutTimeMs`.

### `ink-compat` (`@rezi-ui/ink-compat`)

`renderTimeMs` is measured around `renderFrame()`:

- **Includes** (when phases enabled): translation, percent resolve, Rezi core render/layout, ANSI serialization, stdout write.
- **Excludes**: time spent waiting on throttle / scheduling.

## UNPROVEN / Known Gaps (and how to prove)

### React reconcile/commit time breakdown

We do **not** currently provide a proven, apples-to-apples split of:

- React reconcile time
- React commit time

for both renderers.

Minimum instrumentation to prove:

- Add an optional preload (both modes) that wraps `react-reconciler` scheduler entrypoints (e.g. `performWorkOnRootViaSchedulerTask`) and accumulates commit/reconcile durations per frame.
- Alternatively, instrument renderer-specific “commit complete” hooks and wall-clock around them, with care to exclude throttle waits.

### Intermediate frame equivalence

We only gate on **final screen** equivalence.

Minimum instrumentation to prove:

- During verify, snapshot and hash the reconstructed screen buffer on every frame (or every N ms) and diff sequences.

### Stdout write latency

`stdoutWriteMs` is JS time inside `write()`. It does not include terminal emulator processing time.

Minimum instrumentation to prove:

- backpressure-aware measurements (bytes accepted vs drained), plus optional `strace`/`perf` outside this suite.

