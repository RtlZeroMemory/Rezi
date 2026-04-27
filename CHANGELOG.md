# Changelog

All notable changes to Rezi are documented in this file.

The format is based on Keep a Changelog and the project follows Semantic Versioning.

## [Unreleased]

## [0.1.0-alpha.71] - 2026-04-27

### Documentation

- **repo**: Fixed root README links to point at the current Rezi documentation paths.

### Merged Pull Requests

- [#404](https://github.com/RtlZeroMemory/Rezi/pull/404) Fix README documentation links

## [0.1.0-alpha.70] - 2026-04-26

### Bug Fixes

- **core/routing**: Isolated user callback failures across widget event routing so thrown app callbacks become deterministic dev warnings instead of destabilizing the render/input loop.
- **core/modals**: Fixed modal mouse hit testing so blank modal space no longer routes presses to background widgets while non-modal layers above a modal remain clickable.
- **node/backend**: Fixed unexpected worker exits so pending waiters reject with `ZRUI_BACKEND_ERROR`, including clean exits before waiter settlement and non-zero exits during shutdown.
- **node/tail**: Preserved UTF-8 characters split across internal read chunks and polling iterations by keeping decoder state across tail reads.

### CI / Tooling

- **repo**: Removed stale repository noise and restored Biome import ordering so quality gates stay green after the routing fixes.

### Merged Pull Requests

- [#394](https://github.com/RtlZeroMemory/Rezi/pull/394) repo hygiene cleanup
- [#395](https://github.com/RtlZeroMemory/Rezi/pull/395) repo hygiene follow-up
- [#399](https://github.com/RtlZeroMemory/Rezi/pull/399) Fix modal mouse isolation
- [#400](https://github.com/RtlZeroMemory/Rezi/pull/400) Fix widget callback isolation
- [#401](https://github.com/RtlZeroMemory/Rezi/pull/401) Fix worker exit waiter rejection
- [#402](https://github.com/RtlZeroMemory/Rezi/pull/402) Fix tail UTF-8 chunk decoding
- [#403](https://github.com/RtlZeroMemory/Rezi/pull/403) Fix route engine import ordering

## [0.1.0-alpha.69] - 2026-04-15

### Bug Fixes

- **create-rezi/cli**: Fixed Windows nested installs by switching `create-rezi` to the standard `cross-spawn` process launcher and by resolving npm installs through the active npm entrypoint instead of relying on Git Bash shell resolution.
- **create-rezi/minimal**: Replaced the invalid bare `+` keybinding in the minimal template with Windows-safe `=` / `shift+=` bindings while keeping `+` as an accepted command alias.

### Merged Pull Requests

- [#392](https://github.com/RtlZeroMemory/Rezi/pull/392) fix: isolate create-rezi nested installs on Windows
- [#393](https://github.com/RtlZeroMemory/Rezi/pull/393) fix create-rezi Windows install tests

## [0.1.0-alpha.68] - 2026-04-15

### CI / Tooling

- **release**: Follow-up release tag after the canceled `v0.1.0-alpha.67` run so the already-merged `create-rezi` Windows install fix and public 3-template scaffold contract are published to npm.

## [0.1.0-alpha.67] - 2026-04-15

### CI / Tooling

- **release**: Follow-up release tag after the failed `v0.1.0-alpha.66` publish gate; typed the `create-rezi` Windows install regression-test env shape explicitly so strict TypeScript and Biome agree on the same property access pattern during release preflight.

## [0.1.0-alpha.66] - 2026-04-15

### CI / Tooling

- **release**: Follow-up release tag after the failed `v0.1.0-alpha.65` publish gate; fixed strict TypeScript index-signature access in the `create-rezi` Windows install regression test so the release preflight can complete.

## [0.1.0-alpha.65] - 2026-04-15

### CI / Tooling

- **release**: Follow-up release tag after the failed `v0.1.0-alpha.64` publish gate; fixed the Biome formatting violation in the `create-rezi` Windows install regression test so the release pipeline can complete.

## [0.1.0-alpha.64] - 2026-04-15

### Breaking Changes

- **create-rezi/templates**: Reduced the public scaffold set to `minimal`, `cli-tool`, and `starship`. The previously exposed `dashboard`, `animation-lab`, and `stress-test` templates are no longer offered through the public CLI prompt and docs.
- **ink-compat**: Removed the `packages/ink-compat` compatibility package along with the related migration guides, debugging docs, and benchmark/comparison surface.

### Bug Fixes

- **create-rezi/cli**: Fixed nested `npm create rezi ...` installs on Windows by resolving the child install `cwd` absolutely and stripping leaked parent npm lifecycle/package metadata before spawning the inner package-manager install.

### Tests

- **node/testing**: Added the terminal-real harness MVP and follow-up stabilization work for PTY-backed terminal verification, including replay/scenario infrastructure and reduced-profile CI coverage.
- **core/testing**: Added semantic/reference scenario helpers and expanded behavior coverage across input, textarea, select, dropdown, link, modal/dialog focus, command palette routing, tool approval, app shell, indicator/info widgets, charts, accordion, breadcrumb, file-node cache contracts, and diff/log surfaces.
- **repo/testing**: Continued the behavior-suite rewrite and documented the testing policy used by the package and terminal verification lanes.

### Documentation

- Removed compatibility-oriented docs from the public navigation and repositioned the docs/README around the focused public template set (`minimal`, `cli-tool`, `starship`).
- Rewrote the root README and benchmark wording to be more grounded, more technical, and less comparison-driven.

### GitHub / Hygiene

- Fixed the security advisory contact link and removed the duplicate feature request issue template.

### Merged Pull Requests

- [#364](https://github.com/RtlZeroMemory/Rezi/pull/364) testing: add terminal-real harness MVP
- [#365](https://github.com/RtlZeroMemory/Rezi/pull/365) test: terminal-real harness follow-ups
- [#366](https://github.com/RtlZeroMemory/Rezi/pull/366) testing: rewrite wave-1 widget coverage
- [#367](https://github.com/RtlZeroMemory/Rezi/pull/367) testing: add failure injection and degraded capability coverage
- [#368](https://github.com/RtlZeroMemory/Rezi/pull/368) testing: align CI gates and suite cleanup
- [#369](https://github.com/RtlZeroMemory/Rezi/pull/369) testing: cover input and textarea focus behavior
- [#370](https://github.com/RtlZeroMemory/Rezi/pull/370) testing: cover modal and dialog focus behavior
- [#371](https://github.com/RtlZeroMemory/Rezi/pull/371) testing: cover select and dropdown behavior
- [#372](https://github.com/RtlZeroMemory/Rezi/pull/372) testing: cover code editor behavior
- [#373](https://github.com/RtlZeroMemory/Rezi/pull/373) testing: cover diff viewer and logs console behavior
- [#374](https://github.com/RtlZeroMemory/Rezi/pull/374) testing: cover link behavior
- [#375](https://github.com/RtlZeroMemory/Rezi/pull/375) testing: cover file node cache invalidation
- [#378](https://github.com/RtlZeroMemory/Rezi/pull/378) testing: cover select behavior
- [#379](https://github.com/RtlZeroMemory/Rezi/pull/379) testing: command palette routing contracts
- [#380](https://github.com/RtlZeroMemory/Rezi/pull/380) testing: cover accordion behavior
- [#382](https://github.com/RtlZeroMemory/Rezi/pull/382) testing: cover tool approval dialog surface
- [#383](https://github.com/RtlZeroMemory/Rezi/pull/383) testing: cover feedback widget behavior
- [#384](https://github.com/RtlZeroMemory/Rezi/pull/384) testing: cover indicator widget behavior
- [#385](https://github.com/RtlZeroMemory/Rezi/pull/385) testing: cover app shell behavior
- [#386](https://github.com/RtlZeroMemory/Rezi/pull/386) testing: cover chart widget behavior
- [#388](https://github.com/RtlZeroMemory/Rezi/pull/388) remove Ink-Compat and Ink benchmark support
- [#389](https://github.com/RtlZeroMemory/Rezi/pull/389) docs: publish testing policy and fix docs build
- [#391](https://github.com/RtlZeroMemory/Rezi/pull/391) docs: refresh README overview
- [#392](https://github.com/RtlZeroMemory/Rezi/pull/392) fix: isolate create-rezi nested installs on Windows

## [0.1.0-alpha.63] - 2026-04-14

### Tests

- **node/hsr**: Isolated temp-dir environment in `hotStateReload` leak regression so the Node 22 Ubuntu release lane no longer picks up unrelated `rezi-hsr-*` directories.

### CI / Tooling

- **release**: Follow-up release tag for the failed `v0.1.0-alpha.62` run (`node 22 / ubuntu-latest` test flake).

## [0.1.0-alpha.62] - 2026-04-14

### Features

- **core/keybindings**: Distinguish shifted and unshifted control-letter bindings from kitty CSI-u input so uppercase and lowercase shortcut mappings can stay independent.
- **native/vendor**: Bumped bundled Zireael engine to `v1.3.14`.

### Tests

- **core/keybindings**: Added regressions for split-batch shifted key/text pairing and uppercase-vs-lowercase binding resolution.
- **native/vendor**: Synced vendor sources and commit pin to upstream release commit `4668ccc1d17a7c0bdea193b86b02e8584068d89c`.

### Merged Pull Requests

- [#319](https://github.com/RtlZeroMemory/Rezi/pull/319) feat: distinguish shifted letter keybindings

## [0.1.0-alpha.61] - 2026-04-01

### Bug Fixes

- **core/widgets**: Fixed file-tree explorer context-menu targeting, file-picker multi-select parity across mouse and keyboard, checkbox toggle-on-release behavior, select contract/runtime alignment, radio-group disabled-option rendering, textarea cursor visibility for long unwrapped lines, focus-zone input-edit precedence, focus-trap containment behavior, button explicit design-system precedence over `intent`, field footer behavior/styling contracts, dropdown overflow/shortcut behavior, and accordion expanded-panel ordering under headers.
- **core/filePicker**: File picker filtering and hidden-file visibility are now applied consistently across rendering, keyboard routing, and mouse routing.
- **core/table**: Table flex-width allocation now consumes fractional remainder cells deterministically instead of leaving narrow layouts partially unused.
- **core/table**: Wheel scrolling now routes to table-owned scroll state so virtualized table bodies scroll consistently.
- **core/forms**: `useFieldArray` now recomputes array dirty state from the next value snapshot after append/remove/move and preserves scalar array-level errors when `validateOnChange` is disabled.
- **core/forms**: `useForm` now ignores late async validation results and submit rejections after `reset()` cancels a pending submit attempt, keeping reset state authoritative.
- **core/forms**: `useForm` wizard transitions now clear stale step errors when async revalidation succeeds after a field value changes, preventing false navigation blocks.
- **core/layout**: Layout and interactive prop validators now reject non-object prop bags instead of silently treating them as empty props.
- **core/layout**: Invalid-prop diagnostics now stay safe when rendering the received value would throw during stringification.
- **core/runtime**: `internal_onRender` and runtime breadcrumb render timing now use the always-on monotonic clock even when perf instrumentation is disabled.
- **node/backend**: Auto execution mode now falls back to inline for headless worker-ineligible runs, and worker environment checks reject empty `nativeShimModule` strings.

### Tests

- **core/widgets**: Added focus-announcer empty/clipped rendering coverage, command-palette shortcut contract coverage, and regression tests around checkbox, focus-trap, field, accordion, and dropdown behaviors.
- **core/filePicker**: Added routing, integration, and renderer regressions for filtered and hidden-file visibility contracts.
- **core/table**: Added interaction coverage for modifier-click selection and wheel scrolling, and tightened width-allocation regressions around fractional remainder consumption.
- **core/forms**: Added field-array regressions for structural dirty recomputation and scalar array-level error preservation across append/remove/move.
- **core/forms**: Added `useForm` regressions covering reset during pending submit rejection and reset during pending async-submit validation completion.
- **core/forms**: Added wizard regressions for `nextStep()` and `goToStep()` when async step errors become stale after field edits.
- **core/layout**: Added regressions covering non-object prop bags for stack/box layout validators and all top-level interactive validators.
- **core/layout**: Added a regression covering hostile invalid prop values that throw during diagnostic stringification.
- **core/runtime**: Added deterministic regressions for widget-mode breadcrumb render timing and draw-mode `internal_onRender` timing.
- **node/backend**: Added node backend regressions for auto-mode fallback selection and worker environment support checks.

### Documentation

- **docs/widgets**: Synced input, slider, command-palette, and related widget docs with the current public behavior and shortcut/focus contracts.

### CI / Tooling

- **repo/ci**: Added static analysis quality gates and removed dead repository noise to keep the merged fix train releaseable.

### Merged Pull Requests

- [#289](https://github.com/RtlZeroMemory/Rezi/pull/289) fix(core): clear stale wizard step errors
- [#290](https://github.com/RtlZeroMemory/Rezi/pull/290) fix(core): reject non-object layout prop bags
- [#291](https://github.com/RtlZeroMemory/Rezi/pull/291) fix(core): harden invalid prop diagnostics
- [#292](https://github.com/RtlZeroMemory/Rezi/pull/292) fix(core): use monotonic render metrics
- [#293](https://github.com/RtlZeroMemory/Rezi/pull/293) fix(node): fallback auto backend mode in headless runs
- [#294](https://github.com/RtlZeroMemory/Rezi/pull/294) chore(repo): remove dead code and repository noise
- [#295](https://github.com/RtlZeroMemory/Rezi/pull/295) chore(repo): add static analysis and CI quality gates
- [#296](https://github.com/RtlZeroMemory/Rezi/pull/296) fix(file-picker): align multi-select behavior across mouse and keyboard
- [#297](https://github.com/RtlZeroMemory/Rezi/pull/297) fix(table): consume fractional width remainder
- [#298](https://github.com/RtlZeroMemory/Rezi/pull/298) fix(command-palette): document and test item shortcut behavior
- [#299](https://github.com/RtlZeroMemory/Rezi/pull/299) fix(file-tree-explorer): align context menu contract with implementation
- [#300](https://github.com/RtlZeroMemory/Rezi/pull/300) test(virtual-list): cover estimate-mode measurement contracts
- [#301](https://github.com/RtlZeroMemory/Rezi/pull/301) docs(input): sync documented API with current props
- [#302](https://github.com/RtlZeroMemory/Rezi/pull/302) fix(focus-zone): preserve input editing inside active zones
- [#303](https://github.com/RtlZeroMemory/Rezi/pull/303) fix(checkbox): toggle on mouse release
- [#304](https://github.com/RtlZeroMemory/Rezi/pull/304) fix(select): align contract and runtime behavior
- [#305](https://github.com/RtlZeroMemory/Rezi/pull/305) fix(radio-group): render disabled options consistently
- [#306](https://github.com/RtlZeroMemory/Rezi/pull/306) fix(textarea): preserve cursor visibility for long unwrapped lines
- [#307](https://github.com/RtlZeroMemory/Rezi/pull/307) fix(focus-trap): align containment contract with implementation
- [#308](https://github.com/RtlZeroMemory/Rezi/pull/308) fix(button): honor explicit design-system props over intent
- [#309](https://github.com/RtlZeroMemory/Rezi/pull/309) docs(slider): align documented focus surface with current behavior
- [#310](https://github.com/RtlZeroMemory/Rezi/pull/310) fix(field): define footer behavior and styling contract
- [#311](https://github.com/RtlZeroMemory/Rezi/pull/311) test(focus-announcer): cover empty and clipped render behavior
- [#312](https://github.com/RtlZeroMemory/Rezi/pull/312) fix(accordion): render expanded panels under their headers
- [#313](https://github.com/RtlZeroMemory/Rezi/pull/313) fix(dropdown): align overflow and shortcut behavior with the public contract
## [0.1.0-alpha.60] - 2026-03-14

### Bug Fixes

- **core/renderer**: Corrected badge recipe rendering so badge text/background semantics are preserved during draw operations.
- **create-rezi/cli**: Fixed `npm create rezi` / `bun create rezi` no-op scaffolding by making CLI main-entry detection symlink-safe.

### Tests

- **core/renderer**: Tightened badge renderer regression coverage and stabilized pause/resume orchestration test timing.

### Merged Pull Requests

- [#271](https://github.com/RtlZeroMemory/Rezi/pull/271) fix(core): correctly render badge recipe background/text
- [#275](https://github.com/RtlZeroMemory/Rezi/pull/275) fix(create-rezi): make CLI main-entry detection symlink-safe

## [0.1.0-alpha.58] - 2026-03-06
### Breaking Changes

- **core/composition**: `WidgetContext.useViewport` is now required. Custom callers constructing widget contexts must provide `useViewport`, and `createWidgetContext(...)` now supplies it consistently.

### Bug Fixes

- **core/composition + hooks**: Composite widgets now use a layout-transparent default wrapper, animation hooks share a frame driver, transition/orchestration hooks stop relying on stringified config signatures, `useAnimatedValue` transition playback preserves progress across pause/resume, `useParallel` and `useChain` now read the latest callbacks without stale-closure behavior, `useStagger` restarts on same-length item replacement, and streaming hook reconnect delays clamp away tight-loop reconnects.
- **core/runtime + perf**: Hardened lifecycle start/stop/fatal edges, sync frame follow-up scheduling, focus/layer callback failure handling, focus container metadata/state publication, and perf ring-buffer rollover stats.
- **core/layout + constraints**: Constraint sibling aggregation is now same-parent scoped, hidden `display: false` layout widgets are removed from runtime interaction metadata even without an active constraint graph, deep parent-dependent chains settle fully in the first committed frame, box intrinsic sizing ignores absolute children, and unsupported absolute-position usage now emits deterministic dev warnings.
- **core/theme + renderer**: Removed the public legacy theme API, made semantic `ThemeDefinition` theming the only supported app/runtime path, completed scoped override inheritance for spacing, focus indicators, and color subtree inheritance, and extended semantic widget palettes into focus, chart, diff, logs, toast, and recipe-backed renderer defaults.

### Documentation

- **docs/guide**: Synced composition, animation, and hook reference docs with the current hook surface, easing presets, callback semantics, viewport availability, and stable parser examples for streaming hooks.
- **docs/lifecycle**: Corrected `onEvent(...)` examples, fatal payload fields, hot-reload state guarantees, and `run()` behavior when signal registration is unavailable.
- **docs/layout + constraints**: Aligned recipes and guides with actual support boundaries for spacing, absolute positioning, `display`, and same-parent sibling aggregation semantics.
- **docs/styling**: Rewrote theme/design-system guidance around semantic-only theming, scoped overrides, packed `Rgb24` style props, recipe-backed defaults, and advanced widget palette coverage.

### Merged Pull Requests

- [#263](https://github.com/RtlZeroMemory/Rezi/pull/263) fix(core): harden layout and constraint edge cases
- [#264](https://github.com/RtlZeroMemory/Rezi/pull/264) fix(core): harden composition and animation hooks
- [#265](https://github.com/RtlZeroMemory/Rezi/pull/265) fix(core): harden runtime lifecycle and layer routing
- [#266](https://github.com/RtlZeroMemory/Rezi/pull/266) feat: harden semantic theming and design system
- [#267](https://github.com/RtlZeroMemory/Rezi/pull/267) fix: harden routing, focus, keybindings, and forms
- [#268](https://github.com/RtlZeroMemory/Rezi/pull/268) fix(core): defer fatal handlers outside event dispatch

## [0.1.0-alpha.57] - 2026-03-06

### Documentation

- **docs/runtime + release**: Aligned install, worker/headless, protocol ABI, stability, and release documentation with current behavior and package layout.
- **docs/create-rezi**: Documented the installed template smoke path used by CI for scaffolded apps.

### CI / Tooling

- **create-rezi/templates**: Template package versions are now synced by the release versioning script and validated against the current `create-rezi` version.
- **create-rezi/templates**: Added installed scaffold smoke coverage that scaffolds temp apps, installs local packages, builds, and runs template tests in CI.
- **bench/ci**: Updated benchmark workflow/docs to use the maintained reduced CI benchmark profile and to retain comparison artifacts on failures.
- **ci/security**: Enabled CodeQL result uploads, standardized reproducible install lanes, and refreshed vulnerable dependency pins in the release tree.

### Merged Pull Requests

- [#258](https://github.com/RtlZeroMemory/Rezi/pull/258) docs: align runtime and release docs with current behavior
- [#259](https://github.com/RtlZeroMemory/Rezi/pull/259) bench: align workflow with maintained CI profile
- [#260](https://github.com/RtlZeroMemory/Rezi/pull/260) ci: add installed create-rezi smoke checks
- [#261](https://github.com/RtlZeroMemory/Rezi/pull/261) fix(create-rezi): pin and validate template package versions
- [#262](https://github.com/RtlZeroMemory/Rezi/pull/262) ci: tighten dependency and analysis hygiene

## [0.1.0-alpha.56] - 2026-03-06

### Bug Fixes

- **native/worker_threads**: Fixed addon teardown crashes by pinning the native module for process lifetime, tracking real owner thread identity, and hardening worker-thread loader/smoke coverage.
- **core/runtime**: Hardened app startup and shutdown resilience around sync `app.start()` failures, signal handler throws, top-level view errors, and default `Ctrl+C` handling.

### Refactors

- **core/runtime**: Split `createApp` orchestration into focused lifecycle, dirty-plan, focus-dispatch, signal, and top-level-error controllers with direct regression coverage.
- **node/backend**: Extracted shared config, debug, and marker helpers from inline and worker backends to reduce drift in transport/runtime reconciliation.
- **native/bridge**: Split the Rust native bridge into dedicated config, FFI, debug, registry, and tests modules, reducing monolithic boundary surface at the JS/native seam.

### Validation

- Added regression coverage for worker-thread loader exits, numeric config/debug parsing guards, and controller-level app resilience behavior.

### Merged Pull Requests

- [#254](https://github.com/RtlZeroMemory/Rezi/pull/254) Fix native worker-thread teardown crash
- [#255](https://github.com/RtlZeroMemory/Rezi/pull/255) refactor(native): split bridge modules and merge worker teardown fix
- [#256](https://github.com/RtlZeroMemory/Rezi/pull/256) refactor(core): split createApp orchestration controllers
- [#257](https://github.com/RtlZeroMemory/Rezi/pull/257) refactor(node): share backend helpers

## [0.1.0-alpha.55] - 2026-03-05

### Features

- **core/runtime**: Added `useReducer` to composite widget hooks, including stale-dispatch generation guards and runtime/unit coverage.
- **core/testing**: Added `findAll("textarea")` alias support in the test renderer for multiline input variants.

### Bug Fixes

- **core/renderer**: Unified shadow offset parsing across drawlist damage/overflow paths and centralized shared box-shadow config resolution to eliminate negative-offset divergence.
- **core/forms**: `useForm.handleSubmit` now exposes submission failures via callback/state (`onSubmitError`, `submitError`) with safer thrown-value formatting.
- **core/layout**: Added dev-mode warnings for unsupported child constraint props, including a `spacer` flex-only carveout.

### Refactors

- **core/layout**: Removed dead percent-sizing guard paths from stack layout planning.

### Documentation

- **docs/guide**: Added `testing.md` and `error-handling.md` entrypoint guides.
- **docs/widgets**: Clarified `textarea` behavior as a multiline `input` variant in widget documentation/index mapping.

### Tests

- Added baseline test coverage for `cursor`, `focus/styles`, and `perf` frame/counter modules.
- Added renderer regression coverage for negative shadow offsets and damage culling interaction.
- Added runtime/unit coverage for `useReducer` behavior and test-renderer `textarea` alias lookup.

### Merged Pull Requests

- [#246](https://github.com/RtlZeroMemory/Rezi/pull/246) fix(core): unify shadow offset parsing across renderer paths
- [#247](https://github.com/RtlZeroMemory/Rezi/pull/247) feat(core): expose useForm submit errors via callback and state
- [#248](https://github.com/RtlZeroMemory/Rezi/pull/248) refactor(core): remove dead percent guard paths from stack layout
- [#249](https://github.com/RtlZeroMemory/Rezi/pull/249) feat(core): warn in dev for unsupported child layout constraints
- [#250](https://github.com/RtlZeroMemory/Rezi/pull/250) docs(guide): add testing and error-handling entrypoint guides
- [#251](https://github.com/RtlZeroMemory/Rezi/pull/251) feat: add textarea kind alias support in test renderer
- [#252](https://github.com/RtlZeroMemory/Rezi/pull/252) test: add baseline coverage for focus cursor and perf modules
- [#253](https://github.com/RtlZeroMemory/Rezi/pull/253) feat: add useReducer hook for composite widgets

### Bug Fixes

- **core/design-system + templates**: Visual polish/theming pass landed across recipes and renderer paths (tiered borders/shadows, refined focus indicators, chip/tag/badge treatment, scrollbar separation, and template theming consistency), with follow-up regressions fixed for tag `primary` fallback tones and focused form intrinsic widths.
- **core/runtime**: Unhandled top-level `q`/`Q` and `Ctrl+C` inputs now stop the app by default, while preserving explicit keybinding handlers.
- **native/detect**: Startup terminal probing now exits after a short DA1 drain window instead of waiting the full 500ms budget when XTVERSION never responds, reducing first-render delay on VTE-like terminals.
- **core/constraints**: Constraint input signatures now include all required runtime dependencies, preventing stale cache reuse when unconstrained referenced widget geometry changes.
- **core/layout**: Constraint resolution now performs bounded in-frame settle passes for deeper parent-dependent chains, eliminating first-frame/resize layout jump artifacts in nested constraint trees.
- **core/layout**: Constraint and scroll override traversal now covers modal/layer slot children (`content`/`actions`) so display and geometry overrides apply consistently to overlay subtrees.
- **core/layout**: Runtime/layout shape checks now include stable child identity (`id`/`key`) and trigger cold relayout fallback on mismatch to avoid stale layout cache shape drift.
- **core/layout**: Fixed stack sizing reservation edge cases so downstream minimums are preserved more reliably in both legacy and advanced flex planning paths.
- **core/layout**: Box/stack now preserve original child ordering when absolute and flow children are interleaved.
- **core/layout**: `display: false` now preserves subtree shape with zero-sized rects, preventing runtime/layout structure divergence in hidden branches.
- **core/runtime**: `field` and `resizablePanel` runtime commit child-shape semantics now match their single-child layout semantics.

### Tests

- Added renderer/constraint integration tests for nested settle, deep parent-dependent chains, unconstrained-reference invalidation, and modal/layer display traversal.
- Added layout regression coverage for stack reservation boundaries, hidden-subtree shape preservation, interleaved absolute-child ordering, and stack `wrap` stability signatures.

### Merged Pull Requests

- [#242](https://github.com/RtlZeroMemory/Rezi/pull/242) feat(design): visual polish and theming upgrades

## [0.1.0-alpha.54] - 2026-03-05

### Performance

- **core/runtime**: Reduced routing commit overhead by skipping full routing rebuilds on non-routing commits, trimming routing GC snapshot work, and avoiding `Object.freeze` on transient routing arrays in hot paths.

### Bug Fixes

- **core/runtime**: Tightened local-state store contracts by requiring `keys()` on virtual-list/table/tree stores and removing optional `keys?.()` fallback usage in renderer GC loops.

### Merged Pull Requests

- [#245](https://github.com/RtlZeroMemory/Rezi/pull/245) perf(core): reduce routing commit overhead

## [0.1.0-alpha.50] - 2026-03-03

### Features

- **core/constraints**: Added helper-first constraint API (`visibilityConstraints`, `widthConstraints`, `heightConstraints`, `spaceConstraints`, `groupConstraints`, `conditionalConstraints`) and exported it from `@rezi-ui/core` and `@rezi-ui/jsx`.
- **core/constraints**: Added `expr("...")` source-string LRU caching to avoid repeated parse overhead for stable expressions.

### Developer Experience

- **constraints/diagnostics**: Improved invalid constraint graph error messages with helper-oriented hints.
- **create-rezi/templates**: Added policy checks to prevent legacy `%` / responsive-map layout constraints and to enforce helper-first constraints in templates.
- **tooling**: Added a conservative codemod script to migrate common `expr("...")` patterns to helper constraints.

### Documentation

- **docs/constraints**: Added comprehensive constraints docs (conceptual guide, API reference, DSL reference, cookbook, migration/styling/debug/perf guides, quickstart, decision tree, demo index).
- **docs/api-canonicalization**: Consolidated assistant-facing docs/skills around one canonical interactive widget calling convention (object form), intent-first button styling, and complete hook/callback references.
- **docs/constraints**: Removed temporary placeholder media links from the constraint demos guide to avoid broken asset imports in downstream docs deploys.

### Breaking Changes

- **interactive widgets**: Removed positional overloads for `ui.button`, `ui.input`, and `ui.link`; object-form props are now the only supported API.
- **layout helpers**: Removed stack aliases `ui.vstack`, `ui.hstack`, `ui.spacedVStack`, and `ui.spacedHStack`; use `ui.column` / `ui.row` instead.
- **callback normalization**: Renamed widget callbacks to canonical names across tree/file-picker/command-palette/toast and related widgets (`onToggle` -> `onChange`, `onActivate` -> `onPress`, `onQueryChange` -> `onChange`, `onDismiss` -> `onClose`, and related Tier 2 callback renames).

### Merged Pull Requests

- [#234](https://github.com/RtlZeroMemory/Rezi/pull/234) feat(constraints): helper-first constraints integration
- [#235](https://github.com/RtlZeroMemory/Rezi/pull/235) docs+core: canonicalize interactive widget API and consolidate agent docs

## [0.1.0-alpha.49] - 2026-02-28

### Features

- **bench/compat**: Added a fairness-focused compatibility benchmark harness with shared app scenarios, PTY replay, CPU profiling support, and final-screen equivalence verification.
- **bench/validity**: Added benchmark validity documentation and reporting workflow for reproducible comparisons.

### Performance

- **core/layout-renderer**: Reduced hot-path allocation churn in layout and render paths.
- **compat**: Reduced dashboard-grid tail latency and renderer overhead across translation and runtime hot paths.

### Bug Fixes

- **compat**: Fixed soft-wrap whitespace behavior and hardened ANSI transform rendering parity.
- **core/types**: Fixed strict index-signature access handling for text prop hashing.

### Documentation

- **compat/docs**: Expanded migration, architecture, and debugging documentation for compatibility work.
- **benchmarks**: Updated benchmark reports with latest 8-framework results and moved detailed compatibility bench command block into architecture docs.

### Merged Pull Requests

- [#228](https://github.com/RtlZeroMemory/Rezi/pull/228) refactor(core): reduce layout/render hot-path allocations
- [#229](https://github.com/RtlZeroMemory/Rezi/pull/229) benchmarks: update results to 2026-02-28 full run (all 8 frameworks)
- [#230](https://github.com/RtlZeroMemory/Rezi/pull/230) perf(compat): finalize benchmark harness, renderer fixes, and docs
- [#231](https://github.com/RtlZeroMemory/Rezi/pull/231) docs(compat): move benchmark block out of root README

## [0.1.0-alpha.48] - 2026-02-27

### Features

- **compat**: Improved compatibility fidelity, diagnostics, and documentation coverage.
- **drawlist/backend**: Added builder `buildInto(dst)` and backend zero-copy `beginFrame` SAB path.
- **renderer/perf**: Shipped packed-style pipeline, frame text arena, retained sub-display-lists, BLIT_RECT plumbing, and logs scrolling optimizations.
- **runtime/perf**: Added layout stability signatures and content-keyed render packets with additional hot-path optimizations.

### Bug Fixes

- **release/publish**: Fixed npm publish flow for the compatibility and shim packages.
- **native**: Fixed MSVC `ZR_ARRAYLEN` compatibility and bumped vendored Zireael revisions.
- **node/backend**: Prevented reclaiming READY SAB slots during `beginFrame`.
- **starship/template**: Fixed rendering regressions and added PTY debugging runbook coverage.
- **compat**: Fixed translation/layout hot paths and regression fallout from the optimization pass.

### Developer Experience

- **docs/dev**: Added code-standards enforcement references.
- **ci**: Optimized PR pipeline concurrency and fast-gate behavior.
- **renderer/refactor**: Replaced WeakMap theme propagation with stack-based propagation.
- **release**: Added release prep updates leading into alpha.40+ publishing flow.

### Merged Pull Requests

- [#201](https://github.com/RtlZeroMemory/Rezi/pull/201) docs(dev): add Rezi code standards and enforcement references
- [#202](https://github.com/RtlZeroMemory/Rezi/pull/202) chore(release): bump Zireael vendor and prepare alpha.40
- [#203](https://github.com/RtlZeroMemory/Rezi/pull/203) feat(compat): improve fidelity, diagnostics, and docs
- [#204](https://github.com/RtlZeroMemory/Rezi/pull/204) fix(release): publish compatibility and shim packages
- [#205](https://github.com/RtlZeroMemory/Rezi/pull/205) fix(native): make ZR_ARRAYLEN MSVC-compatible
- [#206](https://github.com/RtlZeroMemory/Rezi/pull/206) fix(release): publish compatibility package by path
- [#207](https://github.com/RtlZeroMemory/Rezi/pull/207) docs: add comprehensive compatibility guide and README feature callout
- [#208](https://github.com/RtlZeroMemory/Rezi/pull/208) chore(release): publish scoped shim packages
- [#210](https://github.com/RtlZeroMemory/Rezi/pull/210) fix(native): bump Zireael vendor to v1.3.9
- [#211](https://github.com/RtlZeroMemory/Rezi/pull/211) refactor(renderer): replace WeakMap theme propagation with stack
- [#212](https://github.com/RtlZeroMemory/Rezi/pull/212) feat(core): add drawlist builder buildInto(dst) for v2/v3
- [#213](https://github.com/RtlZeroMemory/Rezi/pull/213) feat: add backend beginFrame zero-copy SAB frame path
- [#214](https://github.com/RtlZeroMemory/Rezi/pull/214) fix(node): do not reclaim READY SAB slots in beginFrame
- [#215](https://github.com/RtlZeroMemory/Rezi/pull/215) ci: optimize PR pipeline — concurrency, fast gate, reduced matrix
- [#216](https://github.com/RtlZeroMemory/Rezi/pull/216) drawlist: make v1 the only protocol and persistent builder
- [#217](https://github.com/RtlZeroMemory/Rezi/pull/217) EPIC 6: packed style pipeline + Zireael vendor bump
- [#218](https://github.com/RtlZeroMemory/Rezi/pull/218) EPIC 8: frame text arena + slice-referenced text ops
- [#219](https://github.com/RtlZeroMemory/Rezi/pull/219) chore(native): bump vendored Zireael to v1.3.11
- [#220](https://github.com/RtlZeroMemory/Rezi/pull/220) EPIC 7: retained sub-display-lists via per-instance render packets
- [#221](https://github.com/RtlZeroMemory/Rezi/pull/221) EPIC 9B: plumb BLIT_RECT and optimize logs scroll rendering
- [#223](https://github.com/RtlZeroMemory/Rezi/pull/223) Fix post-refactor regressions and bump native vendor to Zireael #103
- [#225](https://github.com/RtlZeroMemory/Rezi/pull/225) Fix starship rendering regressions with clean diff and PTY debug runbook
- [#226](https://github.com/RtlZeroMemory/Rezi/pull/226) perf: layout stability signatures, content-keyed packets, hot-path fixes
- [#227](https://github.com/RtlZeroMemory/Rezi/pull/227) fix(compat): optimize translation and layout hot paths

## [0.1.0-alpha.40] - 2026-02-25

### Bug Fixes

- **native/vendor**: Bumped vendored Zireael engine to `v1.3.8-alpha.7` (`8d8b5f8`) and synchronized `packages/native/vendor` sources.
- **runtime/errors**: Hardened dev warning paths for swallowed callback exceptions, including safe thrown-value formatting in catch blocks.
- **runtime/ids**: Strengthened widget ID validation; whitespace-only interactive IDs are now rejected deterministically.
- **collections**: `each()` / `eachInline()` now detect duplicate keys at construction time with deterministic diagnostics.
- **forms**: Async form validation no longer applies canceled/stale rejection results and now preserves actionable wrapped error context.
- **router**: Hardened route guard error handling and param validation paths.
- **keybindings**: Added max chord length enforcement and duplicate keybinding warnings.

### Merged Pull Requests

- [#195](https://github.com/RtlZeroMemory/Rezi/pull/195) fix(core): dev-mode warnings for silently swallowed callback errors
- [#196](https://github.com/RtlZeroMemory/Rezi/pull/196) fix(core): harden widget ID validation and view function return checks
- [#197](https://github.com/RtlZeroMemory/Rezi/pull/197) fix(core): detect duplicate keys in each()/eachInline() at construction time
- [#198](https://github.com/RtlZeroMemory/Rezi/pull/198) fix(core): stop swallowing async form validation errors
- [#199](https://github.com/RtlZeroMemory/Rezi/pull/199) fix(core): harden router guard error handling and param validation
- [#200](https://github.com/RtlZeroMemory/Rezi/pull/200) fix(core): add max chord length and duplicate keybinding warnings

## [0.1.0-alpha.39] - 2026-02-24

### Bug Fixes

- **protocol**: Fixed ABI mouse-kind mapping drift between C engine and TypeScript.
- **widgets**: `link` now participates in hit-testing and is clickable via mouse.
- **runtime**: `useEffect` cleanup no longer runs during render phase.
- **widgets**: `dialog` action `intent` prop is respected in rendering.
- **focus**: Modal `initialFocus` and `returnFocusTo` props are now functional.
- **style**: `sanitizeTextStyle()` preserves `underlineStyle` and `underlineColor`.
- **layout**: `focusZone` and `focusTrap` no longer impose implicit column layout on children.
- **layout**: Stack rebalancing now prevents flex siblings with percent main-size constraints from collapsing to zero width in wide-row compositions.
- **create-rezi/starship**: command palette and modal text entry no longer get blocked by app-level keybindings; shell body now consistently applies active theme root styling across all decks.
- **create-rezi/starship**: synced template sources with the polished showcase app so scaffolding now includes restored animated bridge/engineering panels, responsive deck layouts, and global theme token application across all screens.

### Features

- **cursor/protocol**: Removed cursor v1/v2 toggle flags (`useV2Cursor`, `useDrawlistV2`); native cursor protocol is now the default runtime path and backend drawlist version `1` is rejected.
- **runtime**: Widget protocol registry centralizes widget capability detection.
- **events**: Extended `RoutedAction` union (`toggle`, `select`, `rowPress`, `change`, `activate`, `scroll`) now surfaces through `UiEvent`.
- **overlays**: Unified overlay system; dropdowns and toasts register in `LayerRegistry`.
- **input**: Generic wheel routing for `overflow: "scroll"` containers.
- **design-system**: Recipes wired into input, checkbox, select, table, progress, badge, and callout rendering paths.
- **shortcuts**: Dropdown and CommandPalette item `shortcut` labels are documented as hint/display metadata (and command-palette query matching input).
- **focus**: Unified DS focus indicators use `focus.ring` token color.

### Developer Experience

- **errors**: `ZRUI_DUPLICATE_ID` includes both widget kinds and a `ctx.id()` hint.
- **errors**: `ZRUI_DUPLICATE_KEY` includes duplicate key value + parent context.
- **errors**: `ZRUI_INVALID_PROPS` includes prop name, widget kind, and expected type.
- **errors**: `ZRUI_UPDATE_DURING_RENDER` includes event-handler guidance.
- **refactor**: Centralized ID codec replaces duplicated encode/decode logic in tabs/accordion/breadcrumb.
- **refactor**: Shared dropdown geometry helper removes duplication between renderer and routing.
- **docs**: Added a comprehensive "Using JSX" guide for `@rezi-ui/jsx`, including setup, parity mapping to `ui.*()`, and component reference coverage.

## [0.1.0-alpha.35] - 2026-02-23

### Added

- **layout**: Completed layout engine EPIC 0-8 and post-epic gaps with intrinsic sizing, flex shrink/basis planning, absolute positioning, grid placement/span controls, text wrap support, overlay sizing constraints, deterministic integer remainder distribution, and responsive `fluid(min,max)`.
- **design-system**: Added theme composition primitives: `ctx.useTheme()`, scoped overrides via `ui.themed(...)`, and JSX `<Themed>` parity.
- **design-system**: Added theme transition interpolation frames (`themeTransitionFrames`) and expanded recipe coverage for navigation and collection widgets.
- **animation**: Added `useAnimatedValue`, `useParallel`, and `useChain`; added exit transitions with deferred unmount lifecycle and render-time exit tracks; expanded container transitions to `box`, `row`, `column`, and `grid`.
- **animation**: Added `delay` and playback controls (`paused`, `reversed`, `rate`) to animation configs plus `interpolateRgb` / `interpolateRgbArray` color interpolation utilities.

### Changed

- **docs**: Expanded layout/theming/animation docs, hook references, widget docs, and internal assistant skills/guidance to reflect new APIs and behavior.
- **exports**: Updated core/JSX exports for new theme and animation APIs and corrected animation hook config documentation for `onComplete`.

### Fixed

- **animation**: Scoped exit-cancel matching and tightened grid exit-transition typing follow-ups.
- **ci/tooling**: Resolved CI/type/lint follow-ups introduced during theming and layout integration.

### Merged Pull Requests

- [#186](https://github.com/RtlZeroMemory/Rezi/pull/186) Layout engine hardening: EPIC 0-8 + gap completion
- [#188](https://github.com/RtlZeroMemory/Rezi/pull/188) feat(design-system): add theme hooks, scoped theming, and recipe coverage
- [#189](https://github.com/RtlZeroMemory/Rezi/pull/189) feat(animation): expand transitions, hooks, and exit animation lifecycle

## [0.1.0-alpha.30] - 2026-02-22

### Added

- **Incremental layout engine** (3-phase optimization):
  - Phase 1: measure cache reuse, leaf/container node reuse for unchanged subtrees
  - Phase 2: layout tree caching keyed by constraint tuple, skips re-layout when inputs unchanged
  - Phase 3: dirty-aware incremental layout via `dirtySet.ts`, skips clean subtrees entirely
- **Drawlist code generation**: `scripts/drawlist-spec.ts` as single source of truth for ZRDL v3 commands, auto-generates typed writer functions with CI guardrail (`codegen:check`)
- **Benchmark harness expansion**:
  - `opentui-core` as first-class framework (OpenTUI React and Core drivers in a single run)
  - Strict apples-to-apples scenarios: `terminal-strict-ui`, `terminal-strict-ui-navigation`
  - Full-app composition scenarios: `terminal-full-ui`, `terminal-full-ui-navigation`
  - CI perf regression guardrails via `scripts/run-bench-ci.mjs`
- Full benchmark results across 22 scenarios
- Benchmark documentation rewrite (`BENCHMARKS.md`, `README.md`, `docs/benchmarks.md`)

### Fixed

- PTY bytesProduced validation: frameworks writing directly to fd (OpenTUI) no longer rejected; falls back to PTY-observed byte count
- `--opentui-driver` CLI flag now correctly forwarded for the `opentui` framework entry

## [0.1.0-alpha.29] - 2026-02-22

### Added

- Scrollbar rendering for `codeEditor`, `diffViewer`, and `logsConsole` widgets via `scrollbarVariant` and `scrollbarStyle` props
- Five scrollbar glyph variants: minimal, classic, modern, dots, thin

### Fixed

- Mouse wheel direction was inverted in native xterm SGR parser (WHEEL_UP produced positive `wheelY`, now correctly negative)
- Wheel scroll routing now falls back to focused editor when hover target is a non-editor widget
- `logsConsole` scrollbar X coordinate off-by-one (was drawn one cell past right edge)

## [0.1.0-alpha.28] - 2026-02-22

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
- `@rezi-ui/bench` — benchmark suite for Rezi and terminal UI runtimes
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
- `create-rezi` animation template with declarative animation hooks, responsive reactor canvas scene, and scaffolded tests/docs
- `ui.virtualList(...)` estimate mode via `estimateItemHeight` with measured-height correction/cache and optional `measureItemHeight` override for variable-height rows

### Changed

- Documentation expanded with 90+ pages covering all features
- README updated with performance data, JSX support, Zireael engine reference
- ROADMAP updated to reflect current project state
- HSR demos and `create-rezi` templates now use `createNodeApp({ hotReload: ... })` instead of manual controller lifecycle wiring
- Input widgets now include local undo/redo history (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`) with 300ms typing-grouping
- Virtual-list routing and scroll math now consume measured-height caches when estimate mode is active, improving End/Page navigation and wheel behavior for variable-height content

### Fixed

- Benchmark harness: ZREV resize events, frame synchronization, and output deduplication
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

- `create-rezi` now ships a dedicated benchmark template with visual stress lanes and measured runtime diagnostics (`#101`).
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
- [#101](https://github.com/RtlZeroMemory/Rezi/pull/101) feat(create-rezi): add visual benchmark template
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
