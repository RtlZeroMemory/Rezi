# Benchmarks

Rezi benchmarks focus on cross-framework terminal rendering performance with reproducible methodology and confidence-aware reporting.

## Scope

Active competitor matrix:
- **Rezi** (`@rezi-ui/core` + native Zireael engine)
- **Ink** (React in terminal, Node.js)
- **OpenTUI** (React in terminal, Bun)
- **blessed** (imperative Node.js baseline)
- **ratatui** (native Rust baseline)

`ink-compat` is no longer part of the active benchmark matrix.

## Latest Dataset

Primary dataset:
- `benchmarks/2026-02-19-terminal-v2/results.json`
- `benchmarks/2026-02-19-terminal-v2/results.md`

Run metadata (from dataset header):
- Date: **2026-02-19**
- Mode: `--suite terminal --io pty`
- Replicates: `7` with `--discard-first-replicate` (6 measured runs per scenario/framework)
- Ordering: `--shuffle-framework-order --shuffle-seed 2026-02-19-terminal-v2`
- Affinity: `--cpu-affinity 0-7`
- Host: Linux (WSL2), Node `v20.19.5`, Bun `1.3.9`, Rust `1.93.0`

## Scenario Set

Terminal suite scenarios (all measured in PTY mode):
- `terminal-rerender`
- `terminal-frame-fill` (`dirtyLines=1`, `dirtyLines=40`)
- `terminal-screen-transition`
- `terminal-fps-stream`
- `terminal-input-latency`
- `terminal-memory-soak`
- `terminal-virtual-list`
- `terminal-table`

## Results Summary (Rezi Positioning)

From `benchmarks/2026-02-19-terminal-v2/results.md`:

| Scenario | Rezi | Ink | OpenTUI | Rezi vs Ink | Rezi vs OpenTUI |
|---|---:|---:|---:|---:|---:|
| `terminal-rerender` | 316µs | 17.55ms | 2.58ms | 55.5x faster | 8.2x faster |
| `terminal-frame-fill` (`dirtyLines=1`) | 353µs | 21.97ms | 3.97ms | 62.2x faster | 11.2x faster |
| `terminal-frame-fill` (`dirtyLines=40`) | 673µs | 22.11ms | 3.91ms | 32.8x faster | 5.8x faster |
| `terminal-screen-transition` | 739µs | 22.03ms | 4.28ms | 29.8x faster | 5.8x faster |
| `terminal-fps-stream` | 3.42ms | 25.09ms | 4.67ms | 7.3x faster | 1.4x faster |
| `terminal-input-latency` | 662µs | 22.34ms | 4.37ms | 33.8x faster | 6.6x faster |
| `terminal-memory-soak` | 641µs | 22.04ms | 4.62ms | 34.4x faster | 7.2x faster |
| `terminal-virtual-list` | 674µs | 22.52ms | 33.38ms | 33.4x faster | 49.5x faster |
| `terminal-table` | 383µs | 21.20ms | 3.66ms | 55.4x faster | 9.6x faster |

Aggregate positioning in this dataset:
- Rezi is **7.3x to 62.2x faster than Ink**.
- Rezi is **1.4x to 49.5x faster than OpenTUI**.
- Rezi remains slower than native Rust (`ratatui`) in these microbenchmarks (**1.7x to 14.5x**, scenario-dependent).

Memory observations:
- OpenTUI shows high memory pressure on larger churn workloads (for example `terminal-virtual-list` peak RSS around **3.45GB** in this run).
- Rezi remains in low hundreds of MB peak RSS across this suite on this host.

## Reliability / Precision

This suite now reports precision-oriented signals directly:
- **Replicate CV** per framework/scenario (run-to-run stability).
- **95% CI of means** in each scenario table.
- **Ratio confidence bands** in the relative comparison table (vs Rezi native).

Interpretation rules used in report output:
- Ratio rows are based on CI bands, not only single means.
- Rows marked `(inconclusive)` indicate CI overlap with parity (`1x`).
- In this dataset, Rezi vs Ink/OpenTUI rows are not CI-overlap cases.

## Reproducing

Build dependencies:

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench

cd benchmarks/native/ratatui-bench
cargo build --release
cd -
```

Run the full terminal suite with the same methodology:

```bash
npm run bench -- \
  --suite terminal \
  --io pty \
  --replicates 7 \
  --discard-first-replicate \
  --shuffle-framework-order \
  --shuffle-seed 2026-02-19-terminal-v2 \
  --cpu-affinity 0-7 \
  --env-check warn \
  --output-dir benchmarks/local-terminal-v2
```

Optional tool path overrides:

```bash
REZI_BUN_BIN=/path/to/bun \
REZI_RATATUI_BENCH_BIN=/path/to/ratatui-bench \
npm run bench -- --suite terminal --io pty
```

## Notes and Limits

- PTY mode measures framework render + terminal write-path bytes, but not terminal emulator pixel paint.
- Absolute timings are environment-specific; compare ratios and CI bands within the same dataset.
- WSL/VM hosts can add jitter; native Linux/macOS bare-metal is preferable for release claims.
- Rezi supports both Node and Bun runtimes; this suite runs Rezi and Ink on Node for direct comparability, while OpenTUI is executed by Bun via `packages/bench/opentui-bench/run.ts`.
- These are rendering microbenchmarks, not end-to-end app throughput benchmarks.

## Historical Artifacts

Older committed datasets are retained for trend history:
- `benchmarks/2026-02-11-terminal/`
- `benchmarks/2026-02-11-pty/`
- `benchmarks/2026-02-11-full/`
