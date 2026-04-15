# Benchmarks

This document records the benchmark scenarios, assumptions, and committed result snapshots used for Rezi. The numbers are directional, version-specific, and host-specific.

## Purpose

The benchmark suite exists to answer practical engineering questions:

- does a change regress Rezi on representative workloads?
- how does Rezi behave on primitive, terminal, and structured-application scenarios?
- how do changes affect throughput, latency, and memory on the same host?

It is not intended to serve as a universal leaderboard.

## Active comparison set

The maintained suite currently compares Rezi against:

- OpenTUI (React)
- OpenTUI (Core)
- Bubble Tea
- terminal-kit
- blessed
- Ratatui

These systems differ in runtime, abstraction level, and language. Some are full UI frameworks, while others are lower-level terminal libraries. Absolute comparisons should be read with that context in mind.

## Scenario groups

### Primitive workloads

- `startup`
- `tree-construction`
- `rerender`
- `content-update`
- `layout-stress`
- `scroll-stress`
- `virtual-list`
- `tables`
- `memory-profile`

### Terminal-level workloads

- `terminal-rerender`
- `terminal-frame-fill`
- `terminal-screen-transition`
- `terminal-fps-stream`
- `terminal-input-latency`
- `terminal-memory-soak`
- `terminal-virtual-list`
- `terminal-table`

### Full-application workloads

- `terminal-full-ui`
- `terminal-full-ui-navigation`
- `terminal-strict-ui`
- `terminal-strict-ui-navigation`

## Interpretation

- Rezi is designed for structured terminal applications where layout, routing, focus, and composition are part of the rendering cost.
- Lower-level libraries may be faster on narrow output-only scenarios because they do less work per frame.
- Memory and latency should always be read per scenario, not as a single global ranking.

## Running the suite

Build prerequisites:

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench
```

Quick all-framework run:

```bash
node --expose-gc packages/bench/dist/run.js \
  --suite all --io pty --quick \
  --output-dir benchmarks/local-all
```

Rezi-only run:

```bash
node --expose-gc packages/bench/dist/run.js \
  --framework rezi-native --io pty --quick
```

Rigorous terminal run:

```bash
node --expose-gc packages/bench/dist/run.js \
  --suite terminal --io pty \
  --replicates 7 --discard-first-replicate \
  --shuffle-framework-order --shuffle-seed local-terminal-rigorous \
  --cpu-affinity 0-7 --env-check strict \
  --output-dir benchmarks/local-terminal
```

## Artifact directories

Committed artifacts live under [`benchmarks/`](benchmarks/). They are retained as snapshots of specific runs and should be interpreted alongside the host, runtime, and suite configuration used to produce them.

## Validity

See [BENCHMARK_VALIDITY.md](BENCHMARK_VALIDITY.md) for the current assumptions behind the benchmark runner and result interpretation.
