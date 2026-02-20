# Benchmarks

Rezi includes a benchmark suite comparing terminal UI pipelines:

- **Rezi (native)**: `@rezi-ui/core` via `ui.*` VNodes
- **Ink**: `ink` (React + Yoga + ANSI output)
- **OpenTUI**: `@opentui/core` + `@opentui/react` (Bun runner integration)
- **Bubble Tea**: `github.com/charmbracelet/bubbletea` (Go runner integration)
- **blessed**: imperative Node terminal UI baseline
- **ratatui**: native Rust baseline

The authoritative benchmark write-up and the latest committed results live in the repository:

- `BENCHMARKS.md`
- `benchmarks/` (structured JSON + generated Markdown)
- Latest rigorous terminal-suite dataset: `benchmarks/2026-02-19-terminal-v3/`
- Latest OpenTUI React matchup dataset: `benchmarks/2026-02-20-rezi-opentui-react-all-quick-v6/`
- Latest OpenTUI Core matchup dataset: `benchmarks/2026-02-20-rezi-opentui-core-all-quick-v4/`
- Latest Bubble Tea matchup dataset: `benchmarks/2026-02-20-rezi-opentui-bubbletea-core-all-quick-v3/`
- GitHub: https://github.com/RtlZeroMemory/Rezi/blob/main/BENCHMARKS.md

## Running benchmarks

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench

node --expose-gc packages/bench/dist/run.js --output-dir benchmarks/local
```

For a faster smoke run:

```bash
node --expose-gc packages/bench/dist/run.js --quick --output-dir benchmarks/local-quick
```

Rezi vs OpenTUI across the full scenario set:

```bash
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --io pty \
  --output-dir benchmarks/local-rezi-opentui
```

Rezi vs OpenTUI core-imperative (no React adapter):

```bash
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui \
  --opentui-driver core \
  --io pty \
  --output-dir benchmarks/local-rezi-opentui-core
```

Rezi vs OpenTUI vs Bubble Tea (same scenario set, PTY mode):

```bash
REZI_GO_BIN=/path/to/go \
node --expose-gc packages/bench/dist/run.js \
  --matchup rezi-opentui-bubbletea \
  --opentui-driver core \
  --io pty \
  --output-dir benchmarks/local-rezi-opentui-bubbletea
```

Optional PTY mode (real TTY path; requires `node-pty`):

```bash
npm i -w @rezi-ui/bench -D node-pty
node --expose-gc packages/bench/dist/run.js --io pty --quick --output-dir benchmarks/local-pty-quick
```

Terminal competitor suite (PTY mode):

```bash
cd benchmarks/native/ratatui-bench
cargo build --release
cd -

node --expose-gc packages/bench/dist/run.js \
  --suite terminal \
  --io pty \
  --replicates 7 \
  --discard-first-replicate \
  --shuffle-framework-order \
  --shuffle-seed local-terminal-v3 \
  --cpu-affinity 0-7 \
  --env-check warn \
  --output-dir benchmarks/local-terminal-v3
```

OpenTUI rows are executed through `packages/bench/opentui-bench/run.ts`, which requires Bun.
Default driver is `react`; use `--opentui-driver core` for imperative-core mode.

```bash
bun --version
```

Bubble Tea rows are executed through `packages/bench/bubbletea-bench/main.go`, which requires Go:

```bash
go version
```

Recommended: Go `>= 1.24`.

## Interpreting results

See `BENCHMARKS.md` for:

- Terminal scenario definitions (`terminal-rerender`, `frame-fill`, `screen-transition`, `fps-stream`, `input-latency`, `memory-soak`, `virtual-list`, `table`)
- Methodology notes (process isolation, replicates, CI bands, shuffle order, CPU affinity)
- CPU/wall/memory interpretation and precision limits
