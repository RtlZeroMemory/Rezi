# Changelog

All notable changes to Rezi are documented in this file.

The format is based on Keep a Changelog and the project follows Semantic Versioning.

## [Unreleased]

### Added

- `@rezi-ui/jsx` — native JSX runtime for Rezi widgets (no React required)
- `@rezi-ui/bench` — comprehensive benchmark suite (Rezi native vs Ink-on-Rezi vs Ink)
- Benchmark results and performance documentation
- Widget composition API (`defineWidget` with hooks)

### Changed

- Documentation expanded with 90+ pages covering all features
- README updated with performance data, JSX support, Zireael engine reference
- ROADMAP updated to reflect current project state

### Fixed

- Benchmark harness: ZREV resize events, frame synchronization, Ink output deduplication
- Benchmark accuracy: framesProduced/bytesProduced no longer inflated by initial render + warmup in async scenarios
- Memory-profile: sampling off-by-one (sampled at iteration 0/50/100 instead of 49/99/149)
- analyzeMemory() slope regression x-axis now uses iteration count instead of sample index
- MeasuringStream string byte accounting now respects encoding

### Removed

- Internal prototyping artifacts and debug traces from repository

## [0.1.0-alpha.0] - 2026-02-09

### Added

- Initial public package set:
  - `@rezi-ui/core`
  - `@rezi-ui/node`
  - `@rezi-ui/native`
  - `@rezi-ui/testkit`
- Declarative widget API with broad built-in widget coverage (layout, inputs, overlays, data display, charts, and advanced widgets).
- Deterministic app runtime with strict update/commit semantics and render coalescing.
- Worker-thread Node backend architecture (native engine ownership isolated from the main thread).
- Binary protocol boundary:
  - ZRDL drawlists for rendering
  - ZREV event batches for input/events
- Native rendering engine integration via `napi-rs` with platform prebuild support.
- Debug and performance instrumentation surfaces for runtime analysis.
- Cross-engine benchmark harness and reporting tools.
- MkDocs documentation site with getting-started guides, widget catalog, protocol docs, backend docs, and development references.

### Changed

- Frame acknowledgment and backpressure behavior improved to reduce throughput loss under heavy frame traffic.
- Benchmark harness reliability improved with marker-based latency acknowledgment and stronger run-quality handling.

### Fixed

- Worker/backend frame settlement edge cases in latest-wins paths.
- Latency benchmark sampling and invalid-run handling robustness.
