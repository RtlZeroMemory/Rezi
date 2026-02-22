# Benchmarks

This document tracks terminal rendering benchmark methodology and committed result artifacts.

## Scope

Frameworks currently covered:
- Rezi native (`@rezi-ui/core` + `@rezi-ui/node`)
- OpenTUI React driver (`@opentui/react` on top of `@opentui/core`, Bun runner)
- OpenTUI core-imperative driver (`@opentui/core` renderables, Bun runner)
- Bubble Tea (`github.com/charmbracelet/bubbletea`, Go runner)
- Ink / blessed / ratatui in the terminal competitor suite

`ink-compat` remains deprecated and is not part of the active matrix.

Terminal suite coverage includes both primitive and full-app workloads:
- primitives: rerender, frame-fill, virtual-list, table, screen-transition, fps-stream, input-latency, memory-soak
- full-app: `terminal-full-ui` (composite shell) and `terminal-full-ui-navigation` (route/page flow)
- strict apples-to-apples: `terminal-strict-ui` and `terminal-strict-ui-navigation`
  - goal: compare structured panel composition across frameworks (not only line-level primitives)
  - fairness intent: reduce bias when comparing Rezi against lower-level backends (notably blessed/ratatui)

## Latest Artifacts

Rigorous terminal-suite dataset (multi-replicate, confidence-focused):
- `benchmarks/2026-02-19-terminal-v3/results.json`
- `benchmarks/2026-02-19-terminal-v3/results.md`

Latest driver/framework matchup snapshots (quick mode, single replicate):
- Rezi vs OpenTUI React: `benchmarks/2026-02-20-rezi-opentui-react-all-quick-v6/results.json`
- Rezi vs OpenTUI Core: `benchmarks/2026-02-20-rezi-opentui-core-all-quick-v4/results.json`
- Rezi vs OpenTUI Core vs Bubble Tea: `benchmarks/2026-02-20-rezi-opentui-bubbletea-core-all-quick-v3/results.json`

## Summary (2026-02-20 Quick Matchups)

These are directional quick runs (`--quick`, one replicate), not publication-grade confidence claims:

| Matchup | Cases | Rezi Faster | Opponent Faster | Geomean (opponent/Rezi) | Implied Rezi Advantage |
|---|---:|---:|---:|---:|---:|
| Rezi vs OpenTUI React | 21 | 21 | 0 | 0.096x | ~10.4x faster |
| Rezi vs OpenTUI Core | 21 | 19 | 2 | 0.383x | ~2.6x faster |
| Rezi vs Bubble Tea (3-way run) | 21 | 20 | 1 | 0.118x | ~8.5x faster |

Case-level notes:
- OpenTUI Core wins vs Rezi in:
  - `layout-stress` (`~1.12x`)
  - `terminal-fps-stream` (`~2.41x`)
- Bubble Tea wins vs Rezi in:
  - `scroll-stress` (`~1.67x`)
- OpenTUI Core vs OpenTUI React (same scenario set):
  - Core is faster in `21/21` cases
  - Geomean core/react speedup: `~4.0x`

## Fairness Notes

- OpenTUI now has explicit driver selection in the harness:
  - `--opentui-driver react` (default)
  - `--opentui-driver core` (imperative)
- Bubble Tea is executed through `packages/bench/bubbletea-bench/main.go` using Bubble Tea's normal program loop and terminal renderer.
- In these runs, Bubble Tea throughput clusters around ~120 fps-equivalent in many scenarios. This behavior is visible directly in per-scenario ops/s and should be considered when interpreting throughput-style loops.
- PTY mode (`--io pty`) is required for OpenTUI and Bubble Tea measurements in this suite.

### Known Comparability Caveats

- Runtime mismatch:
  - OpenTUI rows are executed in a Bun subprocess.
  - Rezi / Ink / blessed rows execute in Node worker processes.
  - Ratatui and Bubble Tea execute in native subprocesses (Rust / Go).
  - Cross-framework results therefore include both framework cost and runtime/toolchain effects.
- Strict scenario implementation parity:
  - `terminal-strict-ui` and `terminal-strict-ui-navigation` are structured-panel composition scenarios by intent.
  - Rezi / Ink / OpenTUI (React and core) / blessed / ratatui execute structured panel composition paths.
  - Bubble Tea uses lipgloss-composed bordered panel layouts in its `View()` string path (not a separate widget-tree runtime), with shared strict workload sections.
  - Keep this distinction explicit when publishing strict-scenario comparisons.
- Byte metrics:
  - `bytesProduced` is framework-local and not semantically identical across frameworks.
  - Prefer `ptyBytesObserved` for cross-framework terminal I/O comparisons in PTY mode.
- Environment jitter:
  - WSL/virtualized hosts can materially increase jitter and scheduler noise.
  - Treat WSL-collected artifacts as directional unless confirmed on bare-metal Linux.

## Reproducing

### 1) Rigorous terminal suite (replicates + shuffle + affinity)

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench

cd benchmarks/native/ratatui-bench
cargo build --release
cd -

node --expose-gc packages/bench/dist/run.js \
  --suite terminal \
  --io pty \
  --replicates 7 \
  --discard-first-replicate \
  --shuffle-framework-order \
  --shuffle-seed 2026-02-19-terminal-v3 \
  --cpu-affinity 0-7 \
  --env-check warn \
  --output-dir benchmarks/local-terminal-v3
```

### 2) Rezi vs OpenTUI React (quick)

```bash
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --opentui-driver react \
  --io pty \
  --quick \
  --output-dir benchmarks/local-rezi-opentui-react-quick
```

### 3) Rezi vs OpenTUI Core (quick)

```bash
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --opentui-driver core \
  --io pty \
  --quick \
  --output-dir benchmarks/local-rezi-opentui-core-quick
```

### 4) Rezi vs OpenTUI Core vs Bubble Tea (quick)

```bash
# Bubble Tea runner currently requires Go >= 1.24
REZI_GO_BIN=/path/to/go \
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui-bubbletea \
  --opentui-driver core \
  --io pty \
  --quick \
  --output-dir benchmarks/local-rezi-opentui-bubbletea-core-quick
```

## Limits

- PTY benchmarks include framework render + terminal write path, not terminal emulator pixel paint.
- Absolute numbers are host-specific; compare within the same dataset and mode.
- Quick-mode single-replicate outputs are useful for trend checks, not confidence-grade claims.
