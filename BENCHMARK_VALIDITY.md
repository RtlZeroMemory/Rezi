# Benchmark Validity

This document records the assumptions behind `packages/bench` and the CI helper scripts that wrap it.

## Determinism

- Scenarios use fixed viewport dimensions and scripted inputs.
- Runs avoid network access.
- Result files are keyed by scenario, framework, and parameter set.
- The benchmark runner keeps terminal and scheduling settings explicit in the invocation.

## Measurement Model

- Per-frame metrics capture timing, CPU, memory, frame count, and byte volume.
- Per-run summaries aggregate the per-frame data into reproducible reports.
- Rezi scenarios report their own internal render metrics alongside the shared benchmark metrics.

## Validity Rules

- Keep the environment constant when comparing two runs.
- Compare only runs with the same scenario parameters and framework selection.
- Treat benchmark output as engineering data, not a publication-grade ranking.
- Prefer smaller focused runs when you only need regression detection.

## Known Limits

- Terminal emulator behavior still contributes noise in PTY mode.
- CPU scheduling, host load, and virtualization can shift absolute numbers.
- Cross-framework comparisons remain useful for direction, but not as absolute proof of superiority.
