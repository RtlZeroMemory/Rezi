# Benchmarks

Rezi includes a benchmark suite comparing terminal UI pipelines across 22 scenarios. The authoritative write-up, methodology, and raw artifacts live in:

- [`BENCHMARKS.md`](../BENCHMARKS.md) — full scenario definitions, results, and caveats
- [`benchmarks/`](../benchmarks/) — committed JSON + Markdown result sets

## Frameworks

| Framework | Runtime | Notes |
|---|---|---|
| **Rezi** | Node.js | Full layout engine, binary drawlist, native C renderer |
| **Ink** | Node.js | React reconciler + Yoga layout + ANSI string output |
| **OpenTUI (React)** | Bun | React declarative driver on `@opentui/core` |
| **OpenTUI (Core)** | Bun | Direct imperative API, no React overhead |
| **Bubble Tea** | Go binary | Elm architecture, `lipgloss` string rendering |
| **terminal-kit** | Node.js | Low-level terminal buffer, no layout system |
| **blessed** | Node.js | Imperative terminal UI, no constraint layout |
| **Ratatui** | Rust binary | Native immediate-mode renderer |

## Selected results — 2026-02-27, M4 Pro, PTY mode

Single-replicate quick run. Numbers are directional; see `BENCHMARKS.md` for caveats.

### Primitive workloads

**rerender** — one value changes in a stable tree:

| Framework | Mean | ops/s |
|---|---:|---:|
| terminal-kit | 60µs | 16,400 |
| Ratatui | 70µs | 14,300 |
| blessed | 71µs | 14,000 |
| **Rezi** | **391µs** | **2,600** |
| OpenTUI (Core) | 1.18ms | 850 |
| OpenTUI (React) | 2.72ms | 368 |
| Bubble Tea | 8.32ms | 120 |
| Ink | 20.03ms | 50 |

**tree-construction** — build a widget tree from scratch:

| Framework | 100 items | 1000 items |
|---|---:|---:|
| **Rezi** | **209µs** | **1.55ms** |
| terminal-kit | 203µs | 1.91ms |
| Ratatui | 917µs | 2.37ms |
| OpenTUI (Core) | 1.59ms | 17.60ms |
| blessed | 1.82ms | 19.73ms |
| Ink | 24.61ms | 78.94ms |
| OpenTUI (React) | 10.67ms | 102.49ms |

### Full-app workloads (PTY output)

**terminal-full-ui** — composite dashboard, 24 services, 40×120 terminal:

| Framework | Mean | ops/s | Peak RSS |
|---|---:|---:|---:|
| Ratatui | 267µs | 3,700 | 2.8 MB |
| blessed | 331µs | 3,000 | 100 MB |
| **Rezi** | **1.24ms** | **806** | **89 MB** |
| OpenTUI (Core) | 1.31ms | 765 | 107 MB |
| OpenTUI (React) | 3.15ms | 317 | 162 MB |
| Bubble Tea | 8.33ms | 120 | ~2 MB |
| Ink | 22.09ms | 45 | 170 MB |

**terminal-strict-ui** — structured multi-panel layout (header, 3-column body, footer, status bar):

| Framework | Mean | ops/s |
|---|---:|---:|
| Ratatui | 189µs | 5,300 |
| blessed | 334µs | 3,000 |
| **Rezi** | **950µs** | **1,100** |
| OpenTUI (Core) | 1.27ms | 788 |
| OpenTUI (React) | 4.60ms | 217 |
| Bubble Tea | 8.32ms | 120 |
| Ink | 22.41ms | 45 |

**terminal-virtual-list** — 100K items, 40-row viewport, full PTY output:

| Framework | Mean | ops/s |
|---|---:|---:|
| Ratatui | 129µs | 7,700 |
| blessed | 154µs | 6,500 |
| **Rezi** | **798µs** | **1,300** |
| OpenTUI (Core) | 1.09ms | 916 |
| OpenTUI (React) | 6.75ms | 148 |
| Bubble Tea | 8.32ms | 120 |
| Ink | 22.56ms | 44 |

### Memory

Peak RSS at terminal-level workloads:

| Framework | Typical range |
|---|---|
| Ratatui | 2–3 MB |
| Bubble Tea | 1–30 MB |
| **Rezi** | **83–215 MB** |
| terminal-kit | 83–142 MB |
| blessed | 85–420 MB |
| OpenTUI (Core) | 85–243 MB |
| Ink | 128–1,250 MB |
| OpenTUI (React) | 96–5,440 MB |

## Running benchmarks

### Prerequisites

```bash
# Build Rezi
npm ci && npm run build && npm run build:native
npx tsc -b packages/bench

# Bun — required for OpenTUI scenarios
# Install: curl -fsSL https://bun.sh/install | bash

# Go — required for Bubble Tea (built automatically on first run)
# Rust/cargo — required for Ratatui (built automatically on first run)
```

### Quick run — all frameworks, PTY mode

```bash
PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$PATH" \
REZI_BUN_BIN="$HOME/.bun/bin/bun" \
node --expose-gc packages/bench/dist/run.js \
  --suite all --io pty --quick \
  --output-dir benchmarks/local-all
```

### Full run (more iterations)

```bash
PATH="$HOME/.cargo/bin:$HOME/.bun/bin:$PATH" \
REZI_BUN_BIN="$HOME/.bun/bin/bun" \
node --expose-gc packages/bench/dist/run.js \
  --suite all --io pty \
  --output-dir benchmarks/local-full
```

### Rigorous terminal suite — multi-replicate, shuffled

Suitable for publication-grade comparisons. Requires bare-metal Linux with CPU pinning for minimal jitter:

```bash
node --expose-gc packages/bench/dist/run.js \
  --suite terminal --io pty \
  --replicates 7 --discard-first-replicate \
  --shuffle-framework-order --shuffle-seed my-run \
  --cpu-affinity 0-7 --env-check warn \
  --output-dir benchmarks/local-terminal
```

### Targeted runs

```bash
# One scenario across all frameworks
node --expose-gc packages/bench/dist/run.js \
  --scenario terminal-full-ui --io pty --quick

# One framework across all scenarios
node --expose-gc packages/bench/dist/run.js \
  --framework rezi-native --io pty --quick

# Rezi vs OpenTUI Core
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui --opentui-driver core \
  --io pty --quick --output-dir benchmarks/local-matchup
```

### Key flags

| Flag | Description |
|---|---|
| `--suite all\|terminal` | All scenarios, or terminal-only |
| `--framework <name>` | Single framework |
| `--scenario <name>` | Single scenario |
| `--io stub\|pty` | Stub (no PTY) or real terminal write |
| `--quick` | Reduced iteration counts for fast checks |
| `--replicates <n>` | Repeat the full run N times |
| `--output-dir <path>` | Write `results.json` + `results.md` |

See [`BENCHMARKS.md`](../BENCHMARKS.md) for the full scenario reference, methodology notes, and interpretation guidance.
