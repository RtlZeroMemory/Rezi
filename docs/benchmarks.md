# Benchmarks

Rezi includes a benchmark suite comparing terminal UI pipelines:

- **Rezi (native)**: `@rezi-ui/core` via `ui.*` VNodes
- **Ink**: `ink` (React + Yoga + ANSI output)
- **OpenTUI (React)**: `@opentui/react` on `@opentui/core` (Bun runner)
- **OpenTUI (Core)**: `@opentui/core` imperative API (Bun runner)
- **Bubble Tea**: `github.com/charmbracelet/bubbletea` (Go runner)
- **terminal-kit**: low-level terminal buffer library
- **blessed**: imperative Node terminal UI
- **Ratatui**: native Rust terminal renderer

The authoritative benchmark write-up and the latest committed results live in the repository:

- `BENCHMARKS.md`
- `benchmarks/` (structured JSON + generated Markdown)

## Running benchmarks

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench
```

### Full cross-framework suite (PTY mode)

```bash
# Build Ratatui bench binary
cd benchmarks/native/ratatui-bench && cargo build --release && cd -

node --expose-gc packages/bench/dist/run.js \
  --suite all \
  --io pty \
  --output-dir benchmarks/local-all
```

### Quick smoke run (Rezi + Ink, stub I/O)

```bash
node --expose-gc packages/bench/dist/run.js --quick --output-dir benchmarks/local-quick
```

### Rezi vs OpenTUI

```bash
# React driver
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --io pty \
  --output-dir benchmarks/local-rezi-opentui

# Core driver
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --opentui-driver core \
  --io pty \
  --output-dir benchmarks/local-rezi-opentui-core
```

### Rezi vs OpenTUI vs Bubble Tea

```bash
REZI_GO_BIN=/path/to/go \
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui-bubbletea \
  --opentui-driver core \
  --io pty \
  --output-dir benchmarks/local-rezi-opentui-bubbletea
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

### Requirements

- `node-pty` for PTY mode: `npm i -w @rezi-ui/bench -D node-pty`
- Bun for OpenTUI scenarios: `bun --version`
- Go >= 1.24 for Bubble Tea scenarios: `go version`
- Rust toolchain for Ratatui scenarios

OpenTUI rows are executed through `packages/bench/opentui-bench/run.ts` (requires Bun).
Bubble Tea rows are executed through `packages/bench/bubbletea-bench/main.go` (requires Go).

## Interpreting results

See `BENCHMARKS.md` for:

- Scenario definitions (primitive, terminal-level, full-app, strict panel composition)
- Runtime and toolchain caveats (Node vs Bun vs Go vs Rust)
- Byte metric interpretation (`bytesProduced` vs `ptyBytesObserved`)
- Memory comparison across frameworks
- Environment jitter notes (WSL/virtualized hosts)
