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

## [0.1.0-alpha.13] - 2026-02-18

### Added

- TextStyle completeness for strikethrough, overline, and blink behavior (`#66`)
- Layout overflow/scroll support, dashboard grid layout, and wrap support for row/column stacks (`#72`, `#73`, `#74`)
- Missing navigation/core widgets and expanded forms capabilities (field arrays, wizard flow, disabled/readOnly controls) (`#82`, `#83`)

### Changed

- Broad hardening and correctness coverage across theme, keybindings, mouse routing, input editor, style merge cache behavior, partial rendering damage flags, renderer clipping/borders/text/damage, VNode factories, reconciliation, hooks, focus traversal/traps/layers, and widget/form invariants (`#67`, `#68`, `#69`, `#70`, `#75`, `#76`, `#77`, `#78`, `#79`, `#80`, `#81`, `#84`)
- Deterministic full-stack integration, resize/reflow, and stress/fuzz coverage expanded across reference apps and event pipelines (`#85`)

### Fixed

- Quadratic Ctrl+Left word movement in the input editor, now linear-time (`#71`)

### Merged Pull Requests

- [#66](https://github.com/RtlZeroMemory/Rezi/pull/66) TextStyle completeness: add strikethrough/overline/blink with merge+encoding hardening
- [#67](https://github.com/RtlZeroMemory/Rezi/pull/67) Harden theme system with validation, extension, scoped overrides, and contrast checks
- [#68](https://github.com/RtlZeroMemory/Rezi/pull/68) Harden keybinding parsing, modes/conflicts, and chord coverage
- [#69](https://github.com/RtlZeroMemory/Rezi/pull/69) Harden mouse input routing contracts with deterministic coverage
- [#70](https://github.com/RtlZeroMemory/Rezi/pull/70) Harden input editor: grapheme-safe selection, cursor boundaries, and paste
- [#71](https://github.com/RtlZeroMemory/Rezi/pull/71) Fix quadratic Ctrl+Left word movement in input editor
- [#72](https://github.com/RtlZeroMemory/Rezi/pull/72) feat(layout): add overflow and scroll support to layout and renderer
- [#73](https://github.com/RtlZeroMemory/Rezi/pull/73) Add grid layout kind for dashboard-style TUIs
- [#74](https://github.com/RtlZeroMemory/Rezi/pull/74) feat(layout): add wrap support for row/column stacks
- [#75](https://github.com/RtlZeroMemory/Rezi/pull/75) Style merge hardening: cache safety and deterministic coverage
- [#76](https://github.com/RtlZeroMemory/Rezi/pull/76) T2.3: Damage-based partial rendering via per-node dirty flags
- [#77](https://github.com/RtlZeroMemory/Rezi/pull/77) Renderer correctness audit: clip/border/text/damage/scrollbar
- [#78](https://github.com/RtlZeroMemory/Rezi/pull/78) Audit ui.* VNode factories and harden interactive prop validation
- [#79](https://github.com/RtlZeroMemory/Rezi/pull/79) Harden reconciliation coverage across keyed, unkeyed, mixed, composite and deep trees
- [#80](https://github.com/RtlZeroMemory/Rezi/pull/80) Hook system hardening: enforce invariants and expand hook edge-case coverage
- [#81](https://github.com/RtlZeroMemory/Rezi/pull/81) Focus system hardening: traversal, zones, traps, layers, and persistence
- [#82](https://github.com/RtlZeroMemory/Rezi/pull/82) feat(core): add missing navigation/core widgets
- [#83](https://github.com/RtlZeroMemory/Rezi/pull/83) feat(forms): add field arrays, wizard flow, and disabled/readOnly controls
- [#84](https://github.com/RtlZeroMemory/Rezi/pull/84) Harden widget and form invariants with deterministic test coverage
- [#85](https://github.com/RtlZeroMemory/Rezi/pull/85) test(core): add deterministic integration, resize/reflow, and stress-fuzz expansion

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
