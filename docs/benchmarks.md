# Benchmarks

Rezi includes a benchmark suite for checking render-path behavior across a fixed set of scenarios. The results are host-specific and directional. Use them as engineering data, not as a universal ranking.

The longer reference write-up and committed artifacts live in:

- [`BENCHMARKS.md`](https://github.com/RtlZeroMemory/Rezi/blob/main/BENCHMARKS.md)
- [`benchmarks/`](https://github.com/RtlZeroMemory/Rezi/tree/main/benchmarks)

## What the suite covers

- primitive workloads such as startup, rerender, content updates, layout stress, and virtualized lists
- terminal-level workloads that include PTY output
- full-application workloads with structured layouts and navigation

## Active comparison set

The maintained suite compares Rezi against a small set of other terminal UI runtimes and lower-level libraries:

- OpenTUI (React)
- OpenTUI (Core)
- Bubble Tea
- terminal-kit
- blessed
- Ratatui

These are not equivalent systems. Some are higher-level UI frameworks, some are lower-level terminal libraries, and some run on different runtimes or languages. Read the numbers with that context in mind.

## Current reading of the results

- Rezi is designed to stay competitive on structured terminal UI workloads where layout, routing, focus, and composition are part of the cost.
- Lower-level libraries can be faster on narrow buffer-write scenarios because they do less work per frame.
- Memory and throughput vary significantly by scenario, host, and runtime.

## Running the suite

Prerequisites:

```bash
npm ci
npm run build
npm run build:native
npx tsc -b packages/bench
```

Quick run:

```bash
node --expose-gc packages/bench/dist/run.js \
  --suite all --io pty --quick \
  --output-dir benchmarks/local-all
```

Rezi-only quick run:

```bash
node --expose-gc packages/bench/dist/run.js \
  --framework rezi-native --io pty --quick
```

## Interpretation rules

- compare runs only when the scenario, framework set, and host conditions match
- prefer repeated runs for decision-making
- treat committed benchmark files as snapshots, not promises

See [`BENCHMARKS.md`](https://github.com/RtlZeroMemory/Rezi/blob/main/BENCHMARKS.md) for the fuller methodology note and artifact references.
