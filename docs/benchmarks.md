# Benchmarks

Rezi includes a benchmark suite comparing terminal UI pipelines:

- **Rezi (native)**: `@rezi-ui/core` via `ui.*` VNodes
- **Ink**: `ink` (React + Yoga + ANSI output)
- **OpenTUI**: `@opentui/core` + `@opentui/react` (Bun runner integration)
- **blessed**: imperative Node terminal UI baseline
- **ratatui**: native Rust baseline

The authoritative benchmark write-up and the latest committed results live in the repository:

- `BENCHMARKS.md`
- `benchmarks/` (structured JSON + generated Markdown)
- Latest dataset: `benchmarks/2026-02-19-terminal-v3/`
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

OpenTUI rows are executed through `packages/bench/opentui-bench/run.ts`, which requires Bun:

```bash
bun --version
```

## Interpreting results

See `BENCHMARKS.md` for:

- Terminal scenario definitions (`terminal-rerender`, `frame-fill`, `screen-transition`, `fps-stream`, `input-latency`, `memory-soak`, `virtual-list`, `table`)
- Methodology notes (process isolation, replicates, CI bands, shuffle order, CPU affinity)
- CPU/wall/memory interpretation and precision limits
