# Repository Layout

This page describes the top-level structure of the Rezi monorepo. The repository
uses **npm workspaces** to manage multiple packages from a single root.

## Directory Tree

```
Rezi/
  packages/
    core/           @rezi-ui/core
    node/           @rezi-ui/node
    native/         @rezi-ui/native
    jsx/            @rezi-ui/jsx
    testkit/        @rezi-ui/testkit
    create-rezi/    create-rezi CLI
    bench/          @rezi-ui/bench (benchmark suite)
  examples/
    hello-counter/
    raw-draw-demo/
  docs/
  scripts/
  vendor/
    zireael/
  .github/
    workflows/
  out/              (build output, gitignored)
```

## Root Configuration Files

| File                   | Purpose |
|------------------------|---------|
| `package.json`         | Workspace root. Defines workspace members, top-level scripts (`build`, `test`, `fmt`, `lint`, etc.), and shared dev dependencies (TypeScript, Biome, TypeDoc). |
| `tsconfig.base.json`   | Shared TypeScript compiler options. Strict mode, ES2022 target, ESNext modules. All package `tsconfig.json` files extend this. |
| `tsconfig.json`        | Project-references root for `tsc -b`. References `packages/create-rezi`, `packages/core`, `packages/node`, `packages/testkit`, `packages/jsx`, and `examples/*` (not every workspace package). |
| `biome.json`           | Biome v1.9.4 configuration. 2-space indentation, 100-character line width, double quotes, semicolons always. Ignore list: `.venv-docs/**`, `out/**`, `**/dist/**`, `**/node_modules/**`, `**/target/**`, `**/*.node`, `**/vendor/**`, `**/debug-traces/**`, `**/Screens/**`. |
| `typedoc.json`         | TypeDoc configuration for API reference generation. Output goes to `out/typedoc/`. |
| `requirements-docs.txt` | Python dependencies for MkDocs documentation builds. |
| `.gitmodules`          | Git submodule declarations (vendor/zireael). |

## packages/

Each package is an npm workspace member published independently to the npm
registry (except `bench`, which is private).

### core -- `@rezi-ui/core`

The runtime-agnostic TypeScript framework. Contains the complete widget system,
layout engine, reconciler, drawlist builder, event parser, theme system, and
keybinding manager. This package **must not** import any Node.js-specific APIs
(`Buffer`, `worker_threads`, `node:*` modules). Portability is enforced by
`scripts/check-core-portability.mjs`.

Key subdirectories:

- `src/app/` -- Application runtime (`createApp`, widget renderer, turn scheduler, state machine)
- `src/runtime/` -- VNode commit and reconciliation (`commit.ts`, `reconcile.ts`)
- `src/layout/` -- Flexbox-style layout engine, text measurement
- `src/renderer/` -- Stack-based DFS renderer, drawlist emission
- `src/drawlist/` -- ZRDL binary drawlist builders (v1/v2/v3) and generated command writers (`writers.gen.ts`)
- `src/protocol/` -- ZREV event batch parser
- `src/widgets/` -- Built-in widget definitions
- `src/theme/` -- Theme tokens, built-in themes
- `src/keybindings/` -- Keybinding manager
- `src/repro/` -- Repro bundle capture and replay

### node -- `@rezi-ui/node`

The Node.js / Bun backend. Provides `createNodeBackend()` and the convenience
`createNodeApp()` wrapper. Manages terminal raw mode, alternate screen, signal
handling, and the poll/submit loop against the native addon.

### native -- `@rezi-ui/native`

The N-API addon wrapping the Zireael C engine via napi-rs. Ships prebuilt
binaries for linux-x64, linux-arm64, darwin-x64, darwin-arm64, win32-x64, and win32-arm64.
See [Native addon](../backend/native.md) for details.

### jsx -- `@rezi-ui/jsx`

JSX runtime for Rezi. Provides `jsx`, `jsxs`, and `Fragment` exports so
applications can use JSX syntax to build widget trees. Consumed via
`tsconfig.json` JSX settings.

### testkit -- `@rezi-ui/testkit`

Test utilities for Rezi applications. Provides headless backends, mock event
sources, and assertion helpers for testing widget behavior without a real
terminal.

### create-rezi -- `create-rezi`

CLI scaffolding tool. Running `npm create rezi` generates a new Rezi project
from built-in templates with proper `package.json`, `tsconfig.json`, and example
code. Current templates: `dashboard`, `stress-test`, `cli-tool`, `animation-lab`, `minimal`.

### bench -- `@rezi-ui/bench` (private)

Benchmark suite for comparing Rezi's rendering pipeline against other TUI
frameworks. Includes profiling scripts for individual pipeline phases. Not
published to npm.

Key files:

- `src/profile-phases.ts` -- Phase-by-phase profiling (layout, render, build)
- `src/profile-construction.ts` -- VNode construction benchmarks
- `src/run.ts` -- Benchmark entry point (compiled to `dist/run.js`, run with `--expose-gc`)

## examples/

Runnable example applications that demonstrate Rezi usage.

### hello-counter

A minimal counter application. Demonstrates `createNodeApp`, state updates, and
basic widget composition.

### raw-draw-demo

Demonstrates the low-level draw API (`app.draw()`) for direct terminal drawing
without the widget system.

## docs/

The MkDocs Material documentation site source. Markdown files are organized to
mirror the site navigation. The site is built by `scripts/docs.sh` and deployed
via the `docs.yml` GitHub Actions workflow.

See [Docs](docs.md) for the documentation workflow.

## scripts/

Build, test, and CI automation scripts.

| Script                              | Purpose |
|-------------------------------------|---------|
| `run-tests.mjs`                    | Deterministic test runner. Discovers and runs all `node:test` test files. |
| `run-e2e.mjs`                      | End-to-end integration test runner. |
| `run-bench-ci.mjs`                | Runs benchmarks in CI with stable configuration. |
| `bench-ci-compare.mjs`            | Compares benchmark results across CI runs. |
| `drawlist-spec.ts`                | Source-of-truth command layout spec for drawlist writer codegen. |
| `generate-drawlist-writers.ts`    | Generates `packages/core/src/drawlist/writers.gen.ts` from `drawlist-spec.ts`. |
| `docs.sh`                          | Documentation build/serve with automatic venv management. |
| `guardrails.sh`                    | Repository hygiene checks for forbidden patterns (legacy scope/name, unresolved task markers, and synthetic-content markers). |
| `check-core-portability.mjs`      | Scans `@rezi-ui/core` for prohibited Node.js imports. |
| `check-unicode-sync.mjs`          | Verifies Unicode table versions are consistent. |
| `check-create-rezi-templates.mjs` | Validates scaffolding templates are up to date. |
| `verify-native-pack.mjs`          | Checks native package contents before npm publish. |
| `release-set-version.mjs`         | Updates version strings across all workspace packages. |

## vendor/zireael

The Zireael C rendering engine, pinned as a git submodule. This is the upstream
source used by `@rezi-ui/native` for compilation. The native package keeps its
own vendored snapshot at `packages/native/vendor/zireael` as the compile-time
source.

Initialize with:

```bash
git submodule update --init --recursive
```

## .github/workflows/

CI/CD workflows powered by GitHub Actions.

| Workflow        | File            | Purpose |
|-----------------|-----------------|---------|
| CI              | `ci.yml`        | Main CI pipeline. Runs linting, type-checking, builds, tests, portability checks, native build/smoke, and e2e suites on every push and pull request. |
| Docs            | `docs.yml`      | Builds and deploys the MkDocs documentation site to GitHub Pages. |
| Benchmarks      | `bench.yml`     | Runs the benchmark suite on CI and reports results. |
| Prebuild        | `prebuild.yml`  | Cross-compiles native addon binaries for all supported platform/architecture targets. |
| Release         | `release.yml`   | Publishes packages to npm and creates GitHub releases. |
| CodeQL          | `codeql.yml`    | GitHub CodeQL security analysis. |

## Build Output (gitignored)

| Directory        | Contents |
|------------------|----------|
| `packages/*/dist/` | Compiled TypeScript output (`.js`, `.d.ts`, `.map`) |
| `out/site/`      | Built MkDocs documentation site |
| `out/typedoc/`   | Generated TypeDoc API reference |
| `.venv-docs/`    | Python virtual environment for MkDocs |

## See Also

- [Build](build.md)
- [Style guide](style-guide.md)
- [Testing](testing.md)
