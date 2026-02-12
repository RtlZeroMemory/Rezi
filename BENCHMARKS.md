# Benchmarks

This repository keeps benchmark data focused on production-relevant comparisons for the current runtime surface.

## Scope

Active benchmark comparisons:
- **Rezi** (TypeScript + native C terminal engine)
- **ratatui** (Rust)
- **blessed** (Node.js)
- **Ink** (Node.js)

The previous in-repo Ink compatibility prototype benchmark track has been removed from this document while that layer is being redesigned.

## Benchmark suites

### Terminal suite (primary)

The primary dataset is the terminal competitor suite in PTY mode.

Artifacts:
- `benchmarks/2026-02-11-terminal/results.json`
- `benchmarks/2026-02-11-terminal/results.md`

What it measures:
- End-to-end frame delivery through PTY-backed terminal paths for each framework.
- Viewport-sized workloads implemented with equivalent visual outcomes.

What it does not measure:
- Terminal emulator pixel paint time.
- Full app logic/IO outside rendering loops.

### Full and PTY historical datasets

Additional datasets exist under:
- `benchmarks/2026-02-11-full/`
- `benchmarks/2026-02-11-pty/`

These are retained as historical artifacts. This document intentionally centers terminal-suite positioning.

## Reproducing terminal suite

Build the Rust comparison binary:

```bash
cd benchmarks/native/ratatui-bench
cargo build --release
```

Run terminal benchmarks:

```bash
npm ci
npm run build
npm run bench -- --suite terminal --io pty --output-dir benchmarks/local-terminal
```

Optional override for ratatui binary path:

```bash
REZI_RATATUI_BENCH_BIN=/path/to/ratatui-bench npm run bench -- --suite terminal --io pty
```

## Results summary (2026-02-11 terminal suite)

Selected means from `benchmarks/2026-02-11-terminal/results.json`:

| Scenario | ratatui (Rust) | blessed (Node) | Rezi | Ink |
|---|---:|---:|---:|---:|
| `terminal-rerender` | 74µs | 126µs | 322µs | 16.39ms |
| `terminal-frame-fill` (`dirtyLines=1`) | 197µs | 137µs | 567µs | 17.73ms |
| `terminal-frame-fill` (`dirtyLines=40`) | 211µs | 256µs | 610µs | 17.66ms |
| `terminal-virtual-list` | 126µs | 218µs | 584µs | 18.88ms |
| `terminal-table` | 178µs | 188µs | 493µs | 17.44ms |

## Interpretation

- Rezi is generally in a low single-digit multiplier range vs native Rust on these workloads.
- Rezi is consistently much closer to native TUI behavior than high-level JS ANSI pipelines.
- Relative gaps vary by workload shape (rerender, frame fill, list virtualization, table updates).

This is the expected design target: TypeScript ergonomics with native-engine rendering characteristics.

## Methodology notes

- Fixed viewport for this run: `120x40`.
- PTY mode adds realistic write-path overhead and is noisier than pure in-memory benchmarking.
- `ratatui` reports RSS; V8 heap metrics do not apply.
- Comparisons are most meaningful within the same dataset/run header and host environment.

## Limitations

- Microbenchmarks are sensitive to host load, scheduler behavior, VM/WSL effects, and Node/toolchain versions.
- Absolute timings should be treated as environment-specific; cross-run trend direction is usually more stable than exact values.
- Real applications may be bottlenecked by network, storage, parsing, or business logic not represented here.
