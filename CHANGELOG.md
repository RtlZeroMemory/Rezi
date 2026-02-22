# Changelog

All notable changes to Rezi are documented in this file.

The format is based on Keep a Changelog and the project follows Semantic Versioning.

## [Unreleased]

### Added

- **Design System**: cohesive token/recipe/capability-tier architecture for theme-aware widget styling
  - Design tokens module (`packages/core/src/ui/designTokens.ts`): typography roles, elevation levels, widget sizes, variants, tones, states, density
  - Capability tiers (`packages/core/src/ui/capabilities.ts`): A (256-color), B (truecolor), C (enhanced) detection with `rgbTo256()` palette mapping
  - Style recipes (`packages/core/src/ui/recipes.ts`): 13 pure-function recipes (button, input, surface, select, table, modal, badge, text, divider, checkbox, progress, callout, scrollbar) computing `TextStyle` from `ColorTokens`
  - `dsVariant`, `dsTone`, `dsSize` props on `ButtonProps` for opt-in recipe-based rendering
  - `dsSize`, `placeholder` props on `InputProps`
  - Recipe-based button rendering in drawlist renderer (automatic when `dsVariant` present, legacy path preserved)
  - Widget Gallery app (`examples/gallery/`) with 12 scenes, 6 themes, interactive + headless modes
  - Golden frame snapshot testing (`captureSnapshot`, `serializeSnapshot`, `parseSnapshot`, `diffSnapshots`) with `scripts/rezi-snap.mjs` CLI
  - Design system specification (`docs/design-system.md`) and widget authoring guide (`docs/guide/widget-authoring.md`)
  - All design system types and functions exported from `@rezi-ui/core`
- `ui.box()` `borderStyle` prop: decouples border/title appearance from child style inheritance, preventing style leaking into descendant widgets (code editors, file trees, etc.)
- `focusConfig` prop on 12 interactive widgets (`button`, `input`, `textarea`, `select`, `virtualList`, `table`, `commandPalette`, `filePicker`, `fileTreeExplorer`, `codeEditor`, `diffViewer`, `logsConsole`): allows per-widget control of focus indicator rendering; `{ indicator: "none" }` suppresses focus visuals
- `FileTreeExplorer` mouse click-to-node routing: left click selects a node (`onSelect`), double-click activates it (`onActivate`), following the same press/release model as `Table`

- `@rezi-ui/jsx` — native JSX runtime for Rezi widgets (no React required)
- `@rezi-ui/bench` — comprehensive benchmark suite (Rezi native vs Ink-on-Rezi vs Ink)
- Benchmark results and performance documentation
- Hot State-Preserving Reload (HSR): `App.replaceView(...)`/`App.replaceRoutes(...)` in core and `createHotStateReload(...)` in `@rezi-ui/node` for in-process widget view and route-table hot swapping during development
- `@rezi-ui/node` `createNodeApp(...)` now supports first-class `hotReload` wiring (auto lifecycle start/stop + `app.hotReload` controller) and route passthrough (`routes`, `initialRoute`)
- Code-editor syntax tokenizer utilities in `@rezi-ui/core`: `tokenizeCodeEditorLine(...)`, `tokenizeCodeEditorLineWithCustom(...)`, `normalizeCodeEditorTokens(...)`, language presets (`typescript`, `javascript`, `json`, `go`, `rust`, `c`, `cpp`/`c++`, `csharp`/`c#`, `java`, `python`, `bash`)
- Widget composition API (`defineWidget` with hooks)
- Page router route guards (`guard`) and nested route trees (`children`) with `context.outlet` rendering
- Composition utility hooks: `useDebounce`, `useAsync`, `usePrevious`
- Streaming data hooks: `useStream`, `useEventSource`, `useWebSocket`, `useInterval`, and `useTail` (with Node tail-source integration)
- `useForm` ergonomic helpers: `form.bind(field)` for spread-ready input props and `form.field(field, options)` for fully wired field+input rendering
- `ui.textarea(...)` multi-line text input widget with wrapping and line-aware editing
- OSC 52 clipboard copy/cut for Input/CodeEditor selections (`Ctrl+C`, `Ctrl+X`)
- Keybinding metadata/introspection: optional `description` in binding definitions, `app.getBindings(mode?)`, `app.pendingChord`, and `ui.keybindingHelp(...)` for auto-generated shortcut overlays
- Declarative animation hooks: `useTransition`, `useSpring`, `useSequence`, and `useStagger`
- `ui.box` transition API with property-scoped animation (`position`, `size`, `opacity`) plus surface `opacity`
- `create-rezi` `animation-lab` template with declarative animation hooks, responsive reactor canvas scene, and scaffolded tests/docs
- `ui.virtualList(...)` estimate mode via `estimateItemHeight` with measured-height correction/cache and optional `measureItemHeight` override for variable-height rows

### Changed

- Documentation expanded with 90+ pages covering all features
- README updated with performance data, JSX support, Zireael engine reference
- ROADMAP updated to reflect current project state
- HSR demos and `create-rezi` templates now use `createNodeApp({ hotReload: ... })` instead of manual controller lifecycle wiring
- Input widgets now include local undo/redo history (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`) with 300ms typing-grouping
- Virtual-list routing and scroll math now consume measured-height caches when estimate mode is active, improving End/Page navigation and wheel behavior for variable-height content

### Fixed

- Benchmark harness: ZREV resize events, frame synchronization, Ink output deduplication
- Benchmark accuracy: framesProduced/bytesProduced no longer inflated by initial render + warmup in async scenarios
- Memory-profile: sampling off-by-one (sampled at iteration 0/50/100 instead of 49/99/149)
- analyzeMemory() slope regression x-axis now uses iteration count instead of sample index
- MeasuringStream string byte accounting now respects encoding

### Removed

- Internal prototyping artifacts and debug traces from repository

## [0.1.0-alpha.22] - 2026-02-21

### Added

- `create-rezi` adds scaffold safety metadata and stress guardrails so generated dashboards start with safer defaults (`#113`).

### Changed

- Theme extension adds diagnostic token resolution and immutable merge behavior for safer composition (`#109`).
- Widget collection helpers tighten keying/stack guardrails for more reliable dynamic layout updates (`#111`).
- README was restructured to a features-first layout with cleaner graphics and benchmark framing (`#107`, `#108`).

### Fixed

- Core prop normalization now rejects negative fractional values in non-negative fields instead of silently coercing them to `0` (`#110`).
- Node runtime now enforces explicit safe upper bounds for `fpsCap` and event payload size (`#112`).

### Merged Pull Requests

- [#107](https://github.com/RtlZeroMemory/Rezi/pull/107) Restructure README with features-first layout and graphics documentation
- [#108](https://github.com/RtlZeroMemory/Rezi/pull/108) Readme update
- [#109](https://github.com/RtlZeroMemory/Rezi/pull/109) theme: add diagnostic token resolution and immutable extension
- [#110](https://github.com/RtlZeroMemory/Rezi/pull/110) core: add AI-safe prop/style normalization guardrails
- [#111](https://github.com/RtlZeroMemory/Rezi/pull/111) widgets: add safer collection/stack guardrails
- [#112](https://github.com/RtlZeroMemory/Rezi/pull/112) runtime: enforce safe caps for fps and event payload size
- [#113](https://github.com/RtlZeroMemory/Rezi/pull/113) create-rezi: add scaffold safety metadata and stress guardrails

## [0.1.0-alpha.17] - 2026-02-19

### Added

- `create-rezi` now ships a dedicated `stress-test` benchmark template with visual stress lanes and measured runtime diagnostics (`#101`).
- `@rezi-ui/bench` now includes OpenTUI framework coverage and expanded terminal benchmark scenarios (`#99`).

### Changed

- Documentation was overhauled and aligned with current runtime/create-rezi behavior, including Bun-first invocation coverage (`#96`, `#97`).
- `@rezi-ui/jsx` reached broad API parity with expanded docs/tests (`#98`).
- Benchmark reporting in README/docs was refreshed with representative scenarios and ratatui-native baseline data (`#100`, `#102`).

### Merged Pull Requests

- [#96](https://github.com/RtlZeroMemory/Rezi/pull/96) docs: merge comprehensive overhaul and align with alpha.16 behavior
- [#97](https://github.com/RtlZeroMemory/Rezi/pull/97) docs: make Bun first-class in docs and create-rezi
- [#98](https://github.com/RtlZeroMemory/Rezi/pull/98) feat(jsx): complete core API parity and docs coverage
- [#99](https://github.com/RtlZeroMemory/Rezi/pull/99) bench: revamp terminal benchmarks, add OpenTUI coverage, refresh README data
- [#100](https://github.com/RtlZeroMemory/Rezi/pull/100) docs(readme): add ratatui native baseline table
- [#101](https://github.com/RtlZeroMemory/Rezi/pull/101) feat(create-rezi): add visual benchmark stress-test template
- [#102](https://github.com/RtlZeroMemory/Rezi/pull/102) docs(readme): condense benchmark table to representative scenarios

## [0.1.0-alpha.16] - 2026-02-19

### Added

- `create-rezi` now ships a flagship dashboard template as the canonical starter, with updated scaffolding/docs and retired legacy starter templates (`#95`).
- Core regression coverage for spinner tick throttling and single-selection table focus rendering (`#94`).

### Changed

- Native engine vendor updated to Zireael `v1.3.8-alpha.4` (`#93`).
- Dashboard template polish and stability pass (layout hierarchy, stable animation cadence, help modal behavior, keyboard/mouse flow) (`#95`).

### Fixed

- Unicode/emoji width handling hardened with presentation-aware grapheme width rules (`#92`).
- Widget-mode animation repaints are throttled to prevent tick-driven render storms and input lag (`#94`).
- Table single-selection focus styling now keeps only the selected row visually active (`#94`).

### Merged Pull Requests

- [#92](https://github.com/RtlZeroMemory/Rezi/pull/92) fix(unicode): use presentation-aware grapheme width rules
- [#93](https://github.com/RtlZeroMemory/Rezi/pull/93) native: bump vendored zireael to v1.3.8-alpha.4
- [#94](https://github.com/RtlZeroMemory/Rezi/pull/94) core: stabilize animation tick cadence and single-select table focus
- [#95](https://github.com/RtlZeroMemory/Rezi/pull/95) create-rezi: flagship polished dashboard template + dashboard-only scaffolding

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
