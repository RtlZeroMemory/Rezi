# Benchmarks

This document tracks terminal rendering benchmark methodology, results, and committed artifacts.

## Frameworks

| Framework | Runtime | Driver | Notes |
|---|---|---|---|
| **Rezi** | Node.js (worker) | `@rezi-ui/core` + `@rezi-ui/node` | Full layout engine, binary drawlist, native C renderer |
| **Ink** | Node.js (worker) | React + Yoga + ANSI output | React reconciler, flexbox layout via Yoga |
| **OpenTUI (React)** | Bun (subprocess) | `@opentui/react` on `@opentui/core` | React declarative driver |
| **OpenTUI (Core)** | Bun (subprocess) | `@opentui/core` imperative API | Direct object mutation, no React overhead |
| **Bubble Tea** | Go (subprocess) | `charmbracelet/bubbletea` | Elm architecture, string-based `View()` rendering |
| **terminal-kit** | Node.js (worker) | `terminal-kit` | Low-level terminal buffer library, no widget/layout system |
| **blessed** | Node.js (worker) | `blessed` | Low-level terminal UI with box model, no constraint layout |
| **Ratatui** | Rust (subprocess) | `ratatui` | Native Rust terminal renderer, immediate mode |

`ink-compat` is deprecated and excluded from the active matrix.

## Scenarios

The suite contains 22 scenarios in three tiers:

**Primitive workloads** (isolated subsystem stress):
- `startup` — app create/destroy cycle
- `tree-construction` — build widget tree from scratch (parameterized: 10, 100, 500, 1000 items)
- `rerender` — update a single changing value in an existing tree
- `content-update` — update text content across a large tree
- `layout-stress` — grid layout with many cells
- `scroll-stress` — scroll a 2000-item list
- `virtual-list` — viewport-windowed rendering over 100K items
- `tables` — 100-row, 8-column data table rendering
- `memory-profile` — steady-state memory behavior

**Terminal-level workloads** (end-to-end render + terminal write):
- `terminal-rerender`, `terminal-frame-fill` (1 and 40 dirty lines), `terminal-screen-transition`, `terminal-fps-stream`, `terminal-input-latency`, `terminal-memory-soak`, `terminal-virtual-list`, `terminal-table`

**Full-app workloads** (structured UI composition):
- `terminal-full-ui` — composite dashboard shell with panels, status bar, data sections
- `terminal-full-ui-navigation` — same shell with page routing
- `terminal-strict-ui` — structured multi-panel layout (header, 3-column body, footer, status bar)
- `terminal-strict-ui-navigation` — same structured layout with navigation

The strict scenarios exist to reduce bias when comparing Rezi (which has a layout engine) against libraries that operate closer to raw terminal buffers (blessed, ratatui, terminal-kit). In primitive scenarios these libraries skip layout entirely, which flatters their numbers on simple workloads but does not reflect real application complexity.

## Results (2026-02-22, all frameworks, PTY mode)

Single-replicate, default iteration counts. WSL host (see caveats). These numbers are directional.

### Relative performance vs Rezi

Ratio >1 means the competitor is slower. Ratio <1 means the competitor is faster.

**vs Ink** (21 scenarios where both participate):

| Scenario | Ratio |
|---|---:|
| tree-construction (10 items) | 206x slower |
| tree-construction (100 items) | 80x slower |
| tree-construction (500 items) | 49x slower |
| tree-construction (1000 items) | 46x slower |
| rerender | 47x slower |
| content-update | 32x slower |
| layout-stress | 10x slower |
| scroll-stress | 12x slower |
| virtual-list | 23x slower |
| tables | 11x slower |
| terminal-rerender | 47x slower |
| terminal-frame-fill (1 dirty line) | 55x slower |
| terminal-frame-fill (40 dirty lines) | 36x slower |
| terminal-fps-stream | 10x slower |
| terminal-input-latency | 35x slower |
| terminal-full-ui | 10x slower |
| terminal-strict-ui | 21x slower |

Rezi is faster than Ink in every measured scenario. The gap is largest on tree construction and rerender workloads (45-206x) and smallest on complex UI composition (10x).

**vs OpenTUI (React)** (21 scenarios):

Rezi faster in all 21 scenarios. Range: 1.8x to 155x. Geomean: ~10x.

**vs OpenTUI (Core)** (21 scenarios):

Rezi faster in 19/21 scenarios. Range: 1.3x to 13x. Geomean: ~2.6x.

OpenTUI Core wins:
- `layout-stress`: Core 1.5x faster (517 vs 347 ops/s)
- `tables`: Core 1.6x faster (434 vs 277 ops/s)

**vs Bubble Tea** (21 scenarios):

Rezi faster in 20/21 scenarios. Bubble Tea throughput clusters around ~120 ops/s in most scenarios due to its 8.33ms tick rate. Rezi wins are large where it exceeds this ceiling.

Bubble Tea wins:
- `scroll-stress`: Bubble Tea 2.5x faster (120 vs 48 ops/s)

**vs terminal-kit / blessed / Ratatui** (subset of scenarios):

These three participate only in scenarios that make sense for their level of abstraction. terminal-kit and blessed are low-level buffer libraries without layout engines or widget systems. Ratatui is a native Rust renderer.

On **primitive** workloads (rerender, frame-fill, simple construction):
- terminal-kit: 1x-13x faster than Rezi
- blessed: 2x-19x faster than Rezi
- Ratatui: 2x-20x faster than Rezi

On **complex UI** workloads (strict-ui, full-ui, fps-stream, tables, virtual-list):
- Rezi is competitive or faster, because these scenarios exercise layout and composition which the primitive libraries lack

This is expected. terminal-kit and blessed write directly to terminal buffers without computing layout. Ratatui is compiled Rust. On workloads that actually require structured layout and widget composition, the gap narrows or reverses.

### Representative numbers

Selected scenarios showing the performance landscape across categories:

| Scenario | Rezi | Ink | OpenTUI React | OpenTUI Core | Bubble Tea | Ratatui |
|---|---:|---:|---:|---:|---:|---:|
| startup | 1.87ms (516 ops/s) | 5.62ms (112) | 8.68ms (33) | 4.92ms (38) | 9.94ms (49) | 184us (5.2K) |
| tree-construction (100) | 326us (3.1K) | 26ms (38) | 36ms (27) | 2.15ms (466) | 8.33ms (120) | 696us (1.4K) |
| rerender | 373us (2.7K) | 17.7ms (57) | 2.70ms (370) | 1.16ms (860) | 8.33ms (120) | 51us (19.7K) |
| layout-stress | 2.88ms (347) | 28ms (36) | 33ms (30) | 1.93ms (517) | 8.33ms (120) | -- |
| virtual-list (100K items) | 985us (1.0K) | 22.6ms (44) | 28.5ms (35) | 1.28ms (780) | 8.33ms (120) | -- |
| terminal-strict-ui | 1.19ms (836) | 25.5ms (39) | 19.4ms (51) | 1.77ms (565) | 8.33ms (120) | 240us (4.2K) |
| terminal-full-ui | 2.49ms (401) | 25.6ms (39) | 5.07ms (197) | 1.31ms (760) | 8.33ms (120) | 336us (3.0K) |

### Memory

| Framework | Typical peak RSS (UI scenarios) | Notes |
|---|---|---|
| Rezi | 80-210 MB | Heap ~20-120 MB depending on tree size |
| Ink | 120-980 MB | Grows significantly with tree size |
| OpenTUI (React) | 200 MB - 15 GB | Memory scales poorly; OOMs on tree-construction at 1000 items |
| OpenTUI (Core) | 100-190 MB | Comparable to Rezi |
| Bubble Tea | 7-10 MB | Go runtime baseline, very low footprint |
| Ratatui | 3-16 MB | Native binary, minimal overhead |
| terminal-kit | 69-83 MB | Lightweight buffer library |
| blessed | 77-300 MB | Varies with screen complexity |

### OpenTUI: React vs Core

OpenTUI has two rendering paths. The React driver (`@opentui/react`) uses React reconciliation with `flushSync()`. The Core driver (`@opentui/core`) uses direct imperative object mutation.

Core is faster than React in all 21 scenarios. Geomean speedup: ~4x. The difference is most dramatic on memory-intensive workloads:
- content-update: Core 96 ops/s vs React 4 ops/s (24x)
- tree-construction (500 items): Core 104 ops/s vs React 5 ops/s (20x)
- Peak RSS: Core ~180 MB vs React ~15 GB on content-update

Both drivers are benchmarked as separate framework entries (`opentui` and `opentui-core`).

## Fairness notes

### What is measured

Each benchmark iteration measures one complete render cycle: state update through final frame output. For PTY-mode benchmarks, this includes the terminal write path.

### Runtime differences

These benchmarks compare frameworks, but also inevitably compare runtimes:
- Rezi, Ink, blessed: Node.js worker processes
- OpenTUI (both drivers): Bun subprocesses
- Bubble Tea: Go subprocess
- Ratatui: Rust subprocess

Cross-framework numbers include runtime and toolchain effects alongside framework costs.

### Scenario parity

- Primitive scenarios (rerender, frame-fill) test narrow subsystem performance. Libraries without layout engines (terminal-kit, blessed, Ratatui) have an inherent advantage here because they do less work per frame.
- Strict-ui scenarios build equivalent multi-panel layouts across all frameworks. Bubble Tea renders via lipgloss string composition rather than a widget tree, which is a different code path than the others.
- Full-ui scenarios test composite dashboards with data sections, status bars, and navigation.

### Byte metrics

`bytesProduced` is framework-local and not directly comparable across frameworks. In PTY mode, `ptyBytesObserved` provides a cross-framework terminal I/O comparison.

### Environment

WSL and virtualized hosts introduce measurable scheduler jitter. Treat WSL-collected results as directional. For publication-grade numbers, use bare-metal Linux with CPU pinning and multiple replicates.

## Artifacts

Rigorous terminal-suite dataset (multi-replicate, confidence-focused):
- `benchmarks/2026-02-19-terminal-v3/`

Quick matchup snapshots (directional only):
- `benchmarks/2026-02-20-rezi-opentui-react-all-quick-v6/`
- `benchmarks/2026-02-20-rezi-opentui-core-all-quick-v4/`
- `benchmarks/2026-02-20-rezi-opentui-bubbletea-core-all-quick-v3/`

CI baseline (rezi-native regression tracking):
- `benchmarks/ci-baseline/`

## Reproducing

### Full cross-framework suite (PTY mode)

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench

# Build Ratatui bench binary
cd benchmarks/native/ratatui-bench
cargo build --release
cd -

node --expose-gc packages/bench/dist/run.js \
  --suite all \
  --io pty \
  --output-dir benchmarks/local-all
```

### Rigorous terminal suite (replicates + shuffle + affinity)

```bash
node --expose-gc packages/bench/dist/run.js \
  --suite terminal \
  --io pty \
  --replicates 7 \
  --discard-first-replicate \
  --shuffle-framework-order \
  --shuffle-seed local-terminal \
  --cpu-affinity 0-7 \
  --env-check warn \
  --output-dir benchmarks/local-terminal
```

### Quick matchup: Rezi vs OpenTUI

```bash
# React driver
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --io pty \
  --quick \
  --output-dir benchmarks/local-rezi-opentui-react-quick

# Core driver
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --opentui-driver core \
  --io pty \
  --quick \
  --output-dir benchmarks/local-rezi-opentui-core-quick
```

### Quick matchup: Rezi vs OpenTUI Core vs Bubble Tea

```bash
REZI_GO_BIN=/path/to/go \
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui-bubbletea \
  --opentui-driver core \
  --io pty \
  --quick \
  --output-dir benchmarks/local-rezi-opentui-bubbletea-core-quick
```

### Requirements

- Node.js 18+ with `--expose-gc`
- `node-pty` for PTY mode: `npm i -w @rezi-ui/bench -D node-pty`
- Bun for OpenTUI scenarios: `bun --version`
- Go >= 1.24 for Bubble Tea scenarios: `go version`
- Rust toolchain for Ratatui scenarios: `cargo build --release` in `benchmarks/native/ratatui-bench/`

## Limits

- PTY benchmarks include framework render + terminal write path, not terminal emulator pixel paint.
- Absolute numbers are host-specific; compare within the same dataset, mode, and host.
- Quick-mode single-replicate outputs are useful for trend checks, not confidence-grade claims.
- OpenTUI React OOMs on `tree-construction` at 1000 items (inherent to React driver memory scaling).
