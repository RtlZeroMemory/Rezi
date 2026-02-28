# Benchmarks

Terminal UI benchmark suite comparing Rezi against other frameworks across 22 scenarios. Each scenario measures one complete render cycle — state update through final frame output — in PTY mode (real terminal write path).

## Frameworks

| Framework | Runtime | Driver | Notes |
|---|---|---|---|
| **Rezi** | Node.js (worker) | `@rezi-ui/core` + `@rezi-ui/node` | Full layout engine, binary drawlist, native C renderer |
| **Ink** | Node.js (worker) | React + Yoga + ANSI output | React reconciler, flexbox layout via Yoga |
| **OpenTUI (React)** | Bun (subprocess) | `@opentui/react` on `@opentui/core` | React declarative driver |
| **OpenTUI (Core)** | Bun (subprocess) | `@opentui/core` imperative API | Direct object mutation, no React overhead |
| **Bubble Tea** | Go (subprocess) | `charmbracelet/bubbletea` | Elm architecture, string-based `View()` rendering |
| **terminal-kit** | Node.js (worker) | `terminal-kit` | Low-level terminal buffer library, no layout system |
| **blessed** | Node.js (worker) | `blessed` | Imperative terminal UI, no constraint layout |
| **Ratatui** | Rust (subprocess) | `ratatui` | Native Rust terminal renderer, immediate mode |

These benchmarks compare frameworks, but also runtimes. Rezi, Ink, terminal-kit, and blessed run on Node.js; OpenTUI runs on Bun; Bubble Tea is a Go binary; Ratatui is a Rust binary. Runtime and toolchain differences are inseparable from framework differences in these numbers.

## Scenarios

**Primitive workloads** — isolated subsystem stress, run in stub I/O mode unless noted:

| Scenario | What it measures |
|---|---|
| `startup` | App create/destroy cycle |
| `tree-construction` (10, 100, 500, 1000 items) | Build widget tree from scratch |
| `rerender` | Single changing value in a stable tree |
| `content-update` | Text content refresh across a large tree |
| `layout-stress` | Grid layout with many rows and columns |
| `scroll-stress` | Scroll a 2000-item list |
| `virtual-list` | Viewport-windowed rendering over 100K items |
| `tables` | 100-row, 8-column data table |
| `memory-profile` | Steady-state memory behavior |

**Terminal-level workloads** — full render + PTY write, comparable across all frameworks:

| Scenario | What it measures |
|---|---|
| `terminal-rerender` | Stable tree, one value changes per frame |
| `terminal-frame-fill` (1 dirty line, 40 dirty lines) | Frame fill at different dirty-line counts |
| `terminal-screen-transition` | Full-screen content swap |
| `terminal-fps-stream` | 12-channel streaming data update |
| `terminal-input-latency` | Event-driven frame cycle |
| `terminal-memory-soak` | Memory stability over many frames |
| `terminal-virtual-list` | 100K-item list, windowed viewport |
| `terminal-table` | 40-row, 8-column table |

**Full-app workloads** — structured UI composition with terminal output:

| Scenario | What it measures |
|---|---|
| `terminal-full-ui` | Composite dashboard: panels, status bar, data sections |
| `terminal-full-ui-navigation` | Same dashboard with page routing |
| `terminal-strict-ui` | Multi-panel layout: header, 3-column body, footer, status bar |
| `terminal-strict-ui-navigation` | Same structured layout with navigation |

The strict and full-app scenarios exist to measure frameworks under conditions that require layout and composition, not just buffer writes. Low-level libraries (terminal-kit, blessed, Ratatui) do less work per frame on primitive scenarios — this is an inherent difference in abstraction level, not a flaw in either approach.

Note on Bubble Tea: its throughput clusters at ~120 ops/s across nearly all scenarios. This reflects the Go subprocess startup + IPC cost, not the framework's render performance. Bubble Tea results should be interpreted as a lower bound on actual render latency.

---

## Results — 2026-02-28, all frameworks, PTY mode

**Host**: Apple M4 Pro (12 cores), macOS Darwin 25.2.0, arm64, 24 GB RAM
**Run**: single-replicate, default iterations, `--io pty`, `--env-check off`
**Versions**: Node 24.12.0, Bun 1.3.10, rustc 1.93.0, cargo 1.93.0

Results are single-replicate. Directional, not confidence-grade. See [Reproducing](#reproducing) for multi-replicate options.

### startup

Creates and tears down a minimal app instance. Measures framework initialization overhead.

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| terminal-kit | 94µs | 10,600 | 181 MB |
| Ratatui | 189µs | 5,100 | 2.3 MB |
| blessed | 1.12ms | 311 | 378 MB |
| Rezi | 1.66ms | 593 | 175 MB |
| Ink | 3.96ms | 156 | 424 MB |
| OpenTUI (Core) | 4.27ms | 234 | 164 MB |
| OpenTUI (React) | 6.09ms | 33 | 342 MB |
| Bubble Tea | 8.67ms | 53 | ~2 MB |

terminal-kit is fastest because it has no widget system to initialize. Ratatui reflects Rust binary startup. Rezi initializes a full layout engine and native C renderer.

### tree-construction

Builds a widget tree from scratch at four sizes. Exercises the framework's widget allocation, reconciliation, and layout paths. terminal-kit and blessed don't have a layout engine, so their numbers reflect JS object allocation only — they'd still need to compute layout separately in a real app.

| Framework | 10 items | 100 items | 500 items | 1000 items |
|---|---:|---:|---:|---:|
| terminal-kit | 50µs | 177µs | 875µs | 1.84ms |
| Rezi | 39µs | 153µs | 675µs | 1.31ms |
| Ratatui | 847µs | 913µs | 1.23ms | 2.33ms |
| blessed | 206µs | 1.70ms | 9.11ms | 19.14ms |
| OpenTUI (Core) | 1.14ms | 1.51ms | 8.08ms | 17.35ms |
| Bubble Tea | ~8.33ms | ~8.33ms | ~8.33ms | ~8.33ms |
| Ink | 20.40ms | 24.16ms | 47.52ms | 79.60ms |
| OpenTUI (React) | 3.75ms | 24.38ms | 126.30ms | 277.10ms |

Rezi scales from 39µs at 10 items to 1.31ms at 1000. OpenTUI React reaches 10 GB RSS and 277ms at 1000 items.

### rerender

Updates a single counter value in a stable tree. Measures the marginal cost of one state change + render pass.

| Framework | Mean | ops/s |
|---|---:|---:|
| blessed | 39µs | 25,400 |
| terminal-kit | 42µs | 23,700 |
| Ratatui | 70µs | 14,400 |
| Rezi | 330µs | 3,000 |
| OpenTUI (Core) | 1.26ms | 790 |
| OpenTUI (React) | 2.90ms | 345 |
| Bubble Tea | ~8.33ms | 120 |
| Ink | 19.22ms | 52 |

The three low-level libraries are fastest here because a "rerender" for them is just a buffer write; they don't diffuse changes through a layout tree. Rezi's 330µs includes reconciliation, layout, drawlist build, and PTY write.

### content-update

Updates text content across 50 items in an existing tree. Closer to real app behavior than rerender — many nodes change, not just one.

| Framework | Mean | ops/s |
|---|---:|---:|
| blessed | 497µs | 2,000 |
| Rezi | 1.13ms | 882 |
| terminal-kit | 1.22ms | 817 |
| Ratatui | 1.37ms | 729 |
| OpenTUI (Core) | 8.33ms | 120 |
| Bubble Tea | ~8.33ms | 120 |
| Ink | 45.76ms | 22 |
| OpenTUI (React) | 171.66ms | 6 |

### layout-stress

Renders a 40-row, 4-column grid with many cells. Tests constraint-based layout computation. terminal-kit and blessed don't participate (no layout engine).

| Framework | Mean | ops/s |
|---|---:|---:|
| Rezi | 1.27ms | 789 |
| OpenTUI (Core) | 1.33ms | 752 |
| Bubble Tea | ~8.30ms | 120 |
| OpenTUI (React) | 24.37ms | 41 |
| Ink | 25.53ms | 39 |

Rezi and OpenTUI Core are close on dense layout work.

### scroll-stress

Scrolls through a 2000-item list, re-rendering the viewport on each scroll event.

| Framework | Mean | Peak RSS |
|---|---:|---:|
| Rezi | 6.99ms | 358 MB |
| Bubble Tea | ~8.32ms | ~3 MB |
| OpenTUI (Core) | 32.58ms | 273 MB |
| Ink | 182.35ms | 1.36 GB |
| OpenTUI (React) | 271.49ms | 7.42 GB |

### virtual-list

Renders a 40-row viewport window over 100,000 items. Only the visible rows are rendered.

| Framework | Mean | ops/s |
|---|---:|---:|
| Rezi | 639µs | 1,600 |
| OpenTUI (Core) | 1.20ms | 831 |
| Bubble Tea | ~8.31ms | 120 |
| Ink | 25.81ms | 39 |
| OpenTUI (React) | 22.03ms | 45 |

### tables

100-row, 8-column data table rendering. terminal-kit and blessed don't participate.

| Framework | Mean | ops/s |
|---|---:|---:|
| Rezi | 1.13ms | 884 |
| OpenTUI (Core) | 1.54ms | 650 |
| Bubble Tea | ~8.33ms | 120 |
| Ink | 33.29ms | 30 |
| OpenTUI (React) | 53.30ms | 19 |

### memory-profile

Steady-state memory behavior over many render cycles. Checks for leaks.

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| terminal-kit | 60µs | 16,600 | 96 MB |
| Ratatui | 80µs | 12,500 | ~2 MB |
| blessed | 154µs | 6,500 | 112 MB |
| Rezi | 644µs | 1,600 | 301 MB |
| OpenTUI (Core) | 1.19ms | 837 | 114 MB |
| Bubble Tea | ~8.31ms | 120 | ~3 MB |
| Ink | 23.03ms | 43 | 282 MB |
| OpenTUI (React) | 7.17ms | 139 | 878 MB |

All frameworks pass the stability check (no measurable slope KB/iter) in this scenario. Rezi's RSS here is higher than the terminal-level scenarios because this workload accumulates more heap over its iteration count.

---

### Terminal-level scenarios

These run with full PTY output. `Bytes(pty)` is the cross-framework comparable metric — bytes observed at the PTY device.

### terminal-rerender

Stable tree, one value changes per frame, full PTY write.

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| blessed | 43µs | 23,300 | 90 MB |
| Ratatui | 72µs | 13,900 | 2.3 MB |
| Rezi | 323µs | 3,100 | 99 MB |
| OpenTUI (Core) | 1.18ms | 847 | 102 MB |
| OpenTUI (React) | 2.63ms | 380 | 157 MB |
| Bubble Tea | ~8.32ms | 120 | ~3 MB |
| Ink | 18.84ms | 53 | 142 MB |

### terminal-frame-fill

Renders a full 40×120 frame with varying dirty-line counts. dirtyLines=1 represents a mostly stable screen; dirtyLines=40 is a full repaint.

| Framework | dirtyLines=1 | dirtyLines=40 |
|---|---:|---:|
| blessed | 45µs | 185µs |
| Ratatui | 185µs | 200µs |
| Rezi | 363µs | 637µs |
| OpenTUI (Core) | 1.18ms | 1.18ms |
| OpenTUI (React) | 3.35ms | 3.35ms |
| Bubble Tea | ~8.33ms | ~8.31ms |
| Ink | 21.73ms | 21.79ms |

Ratatui and blessed show near-flat cost between 1 and 40 dirty lines. Rezi's cost scales with dirty region size as the native framebuffer diff does more work.

### terminal-screen-transition

Full-screen content swap, 40×120 terminal.

| Framework | Mean | ops/s |
|---|---:|---:|
| Ratatui | 242µs | 4,100 |
| blessed | 255µs | 3,900 |
| Rezi | 658µs | 1,500 |
| OpenTUI (Core) | 1.19ms | 843 |
| OpenTUI (React) | 5.14ms | 195 |
| Bubble Tea | ~8.32ms | 120 |
| Ink | 21.27ms | 47 |

### terminal-fps-stream

12 data channels updating simultaneously, simulating a streaming dashboard.

| Framework | Mean | ops/s |
|---|---:|---:|
| Ratatui | 219µs | 4,600 |
| blessed | 268µs | 3,700 |
| Rezi | 1.16ms | 862 |
| OpenTUI (Core) | 1.27ms | 785 |
| OpenTUI (React) | 5.97ms | 167 |
| Bubble Tea | ~8.33ms | 120 |
| Ink | 22.23ms | 45 |

### terminal-input-latency

Keypress → state update → render → PTY write. Measures the event-driven frame cycle.

| Framework | Mean | ops/s |
|---|---:|---:|
| blessed | 169µs | 5,900 |
| Ratatui | 187µs | 5,300 |
| Rezi | 648µs | 1,500 |
| OpenTUI (Core) | 1.24ms | 804 |
| OpenTUI (React) | 5.15ms | 194 |
| Bubble Tea | ~8.32ms | 120 |
| Ink | 21.85ms | 46 |

### terminal-memory-soak

Sustained rendering across 1000+ frames. Tracks RSS growth over time.

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| blessed | 152µs | 6,600 | 142 MB |
| Ratatui | 197µs | 5,100 | 2.6 MB |
| Rezi | 624µs | 1,600 | 126 MB |
| OpenTUI (Core) | 1.27ms | 790 | 121 MB |
| OpenTUI (React) | 6.12ms | 163 | 1.01 GB |
| Bubble Tea | ~8.32ms | 120 | ~3 MB |
| Ink | 21.77ms | 46 | 291 MB |

### terminal-full-ui

Composite dashboard with panels, a status bar, data sections, and 24 services. Exercises the full widget composition and layout pipeline.

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| Ratatui | 258µs | 3,900 | 2.9 MB |
| blessed | 314µs | 3,200 | 260 MB |
| Rezi | 1.14ms | 874 | 129 MB |
| OpenTUI (Core) | 1.32ms | 760 | 131 MB |
| OpenTUI (React) | 6.10ms | 164 | 1.01 GB |
| Bubble Tea | ~8.33ms | 120 | ~3 MB |
| Ink | 22.34ms | 45 | 301 MB |

### terminal-full-ui-navigation

Same dashboard with active page routing (screens transition during the benchmark).

| Framework | Mean | ops/s |
|---|---:|---:|
| blessed | 212µs | 4,700 |
| Ratatui | 226µs | 4,400 |
| Rezi | 632µs | 1,600 |
| OpenTUI (Core) | 1.26ms | 792 |
| OpenTUI (React) | 5.98ms | 167 |
| Bubble Tea | ~8.33ms | 120 |
| Ink | 21.72ms | 46 |

### terminal-strict-ui / terminal-strict-ui-navigation

Multi-panel layout with a header, three-column body, footer, and status bar. Designed to compare on equal structural footing — all frameworks build the same layout. Navigation variant adds routing.

| Framework | Strict | Navigation |
|---|---:|---:|
| Ratatui | 183µs | 187µs |
| blessed | 302µs | 316µs |
| Rezi | 873µs | 950µs |
| OpenTUI (Core) | 1.27ms | 1.26ms |
| OpenTUI (React) | 26.36ms | 15.89ms |
| Bubble Tea | ~8.33ms | ~8.33ms |
| Ink | 22.14ms | 22.19ms |

### terminal-virtual-list

100K-item list, 40-row viewport, full PTY output.

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| Ratatui | 121µs | 8,300 | 2.5 MB |
| blessed | 124µs | 8,100 | 150 MB |
| Rezi | 644µs | 1,600 | 138 MB |
| OpenTUI (Core) | 1.28ms | 783 | 122 MB |
| Bubble Tea | ~8.33ms | 120 | ~2 MB |
| Ink | 22.32ms | 45 | 371 MB |
| OpenTUI (React) | 25.59ms | 39 | 3.50 GB |

### terminal-table

40-row, 8-column table with full PTY output.

| Framework | Mean | ops/s |
|---|---:|---:|
| blessed | 102µs | 9,800 |
| Ratatui | 177µs | 5,600 |
| Rezi | 445µs | 2,200 |
| OpenTUI (Core) | 1.23ms | 815 |
| OpenTUI (React) | 3.45ms | 290 |
| Bubble Tea | ~8.33ms | 120 |
| Ink | 21.78ms | 46 |

---

## Memory summary

Peak RSS across terminal-level workloads:

| Framework | Typical range | Notes |
|---|---|---|
| Ratatui | 2–3 MB | Native binary, minimal overhead |
| Bubble Tea | ~2–31 MB | Go runtime |
| Rezi | 97–358 MB | Scales with tree size and workload duration |
| terminal-kit | 86–181 MB | Lightweight, limited scenarios |
| OpenTUI (Core) | 101–273 MB | Comparable to Rezi on terminal scenarios |
| blessed | 87–429 MB | Varies with tree size |
| Ink | 142–2,030 MB | Grows with tree size and content updates |
| OpenTUI (React) | 157–10,090 MB | React driver memory scales poorly at large tree sizes |

---

## OpenTUI: React vs Core

OpenTUI provides two rendering paths. The Core driver uses direct imperative object mutation; the React driver routes through React reconciliation with `flushSync()`.

Core outperforms React in every measured scenario. On simple workloads the gap is ~2–3x; on tree-construction and content-update it reaches 10–50x. Memory is also substantially lower — Core stays under 280 MB where React can exceed 10 GB.

Both drivers are benchmarked as separate entries (`opentui` and `opentui-core`).

---

## Fairness notes

**What is measured**: each iteration covers the full pipeline from state update to final PTY write. For libraries without a layout engine (terminal-kit, blessed, Ratatui), the scenario implementations are equivalent in output but not in computation — they skip layout steps they don't have.

**Byte metrics**: `bytesProduced` is framework-local and not cross-comparable. `ptyBytesObserved` (PTY bytes) is the comparable metric in PTY-mode runs.

**Environment**: results are host-specific. Absolute numbers on a different machine will differ; relative ordering between frameworks on the same host is more stable. WSL and virtualized environments introduce scheduler jitter; treat results collected there as directional.

**Bubble Tea caveat**: the ~8.32ms floor across nearly all scenarios reflects Go subprocess startup cost in the benchmark harness, not Bubble Tea's render latency. Actual frame rendering inside the Go process is not separately measured.

---

## Artifacts

Latest all-framework PTY run (M4 Pro, macOS arm64):
- `benchmarks/local-2026-02-28/results-all-frameworks-pty-full.md`
- `benchmarks/local-2026-02-28/results-all-frameworks-pty-full.json`

Previous datasets:
- `benchmarks/local-2026-02-27/` — all-framework quick PTY run
- `benchmarks/2026-02-19-terminal-v3/` — rigorous terminal suite, multi-replicate
- `benchmarks/2026-02-20-rezi-opentui-bubbletea-core-all-quick-v3/`
- `benchmarks/2026-02-20-rezi-opentui-core-all-quick-v4/`
- `benchmarks/2026-02-20-rezi-opentui-react-all-quick-v6/`

CI baseline (rezi-native regression tracking):
- `benchmarks/ci-baseline/`

---

## Reproducing

### Prerequisites

```bash
# 1. Build Rezi
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench

# 2. Bun (for OpenTUI scenarios)
#    Install: https://bun.sh/install
bun --version

# 3. Go (for Bubble Tea scenarios — built automatically on first run)
go version   # >= 1.21

# 4. Rust (for Ratatui — must be built manually before running)
cd benchmarks/native/ratatui-bench && cargo build --release && cd -
# Override binary path: REZI_RATATUI_BENCH_BIN=/path/to/ratatui-bench
```

> `node-pty` is required for PTY mode. It is included in `packages/bench/package.json`
> and installed by `npm ci`. If you see "Cannot load node-pty", run:
> `npm i -w packages/bench -D node-pty`

### Quick run — all frameworks

```bash
PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$PATH" \
REZI_BUN_BIN="$HOME/.bun/bin/bun" \
node --expose-gc packages/bench/dist/run.js \
  --suite all \
  --io pty \
  --quick \
  --output-dir benchmarks/local-all
```

### Full run — all frameworks, default iterations

```bash
PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$PATH" \
REZI_BUN_BIN="$HOME/.bun/bin/bun" \
node --expose-gc packages/bench/dist/run.js \
  --suite all \
  --io pty \
  --output-dir benchmarks/local-all-full
```

### Rigorous terminal suite (multi-replicate, shuffled, CPU-pinned)

Suitable for publication-grade numbers on bare-metal Linux:

```bash
node --expose-gc packages/bench/dist/run.js \
  --suite terminal \
  --io pty \
  --replicates 7 \
  --discard-first-replicate \
  --shuffle-framework-order \
  --shuffle-seed my-run \
  --cpu-affinity 0-7 \
  --env-check warn \
  --output-dir benchmarks/local-terminal
```

### Single-framework or single-scenario

```bash
# One framework, all scenarios
node --expose-gc packages/bench/dist/run.js \
  --framework rezi-native --io pty --quick

# One scenario, all frameworks
node --expose-gc packages/bench/dist/run.js \
  --scenario terminal-full-ui --io pty --quick

# Rezi vs OpenTUI Core matchup
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --opentui-driver core \
  --io pty --quick \
  --output-dir benchmarks/local-rezi-vs-opentui-core
```

### Key flags

| Flag | Default | Description |
|---|---|---|
| `--suite all\|terminal` | `all` | Scenario set |
| `--framework <name>` | all | Run one framework |
| `--scenario <name>` | all | Run one scenario |
| `--io stub\|pty` | `stub` | I/O mode; PTY required for terminal-* scenarios |
| `--quick` | off | Reduced iteration counts |
| `--replicates <n>` | 1 | Repeat full run N times |
| `--discard-first-replicate` | off | Discard warmup replicate |
| `--shuffle-framework-order` | off | Randomize execution order |
| `--cpu-affinity <list>` | none | Linux `taskset` pinning (e.g. `0-7`) |
| `--output-dir <path>` | none | Write `results.json` + `results.md` |
| `--env-check warn\|off` | `warn` | Warn on/skip governor/WSL checks |
