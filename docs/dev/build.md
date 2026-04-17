# Build

This page covers how to build Rezi from source, including the TypeScript
packages, native addon, and documentation site.

## Prerequisites

| Requirement   | Version  | Notes |
|---------------|----------|-------|
| Node.js       | 18+      | LTS recommended |
| npm           | 10+      | Ships with Node.js 18+ |
| Git           | 2.x      | Submodule support required |
| TypeScript    | 5.6.3    | Installed as a dev dependency |

For the native addon (optional):

| Requirement   | Notes |
|---------------|-------|
| Rust toolchain | For napi-rs compilation |
| C compiler    | gcc, clang, or MSVC for the Zireael engine |

For documentation (optional):

| Requirement   | Notes |
|---------------|-------|
| Python 3.8+   | For MkDocs |

## Initial Setup

Clone the repository and initialize submodules:

```bash
git clone https://github.com/RtlZeroMemory/Rezi.git
cd Rezi
git submodule update --init --recursive
```

The `vendor/zireael` submodule tracks the upstream Zireael source and commit
pin metadata. Native addon builds compile from the package-local snapshot at
`packages/native/vendor/zireael`; submodule checkout is required when syncing
or auditing vendored engine updates, but not for TypeScript-only development.

Install all dependencies:

```bash
npm ci
```

This installs dependencies for all workspace packages (`packages/*` and
`examples/*`) in a single operation. Rezi uses **npm workspaces** (not pnpm or
yarn).

## TypeScript Build

Build the TypeScript projects referenced by the root `tsconfig.json`:

```bash
npm run build
```

This runs `tsc -b` (TypeScript project build mode) across the root project
references: `packages/create-rezi`, `packages/core`, `packages/node`,
`packages/testkit`, `packages/jsx`, and the current example apps
(`examples/gallery`, `examples/hello-counter`, `examples/raw-draw-demo`, and
`examples/regression-dashboard`). Packages like `@rezi-ui/native` and
`@rezi-ui/bench` are built separately.

TypeScript build mode is incremental, so subsequent builds after the first are
fast -- only changed files and their dependents are recompiled.

The build output lands in `dist/` directories within each package:

```
packages/core/dist/
packages/node/dist/
packages/jsx/dist/
packages/testkit/dist/
packages/create-rezi/dist/
examples/gallery/dist/
examples/hello-counter/dist/
examples/raw-draw-demo/dist/
examples/regression-dashboard/dist/
```

### Incremental Rebuilds

For iterative development, run the same command:

```bash
npm run build
```

TypeScript's incremental build mode (`tsc -b`) uses `.tsbuildinfo` files to skip
unchanged projects. A full rebuild from scratch takes several seconds; incremental
rebuilds typically complete in under a second.

### Type Checking in CI

To run the TypeScript build with machine-readable error output (useful in CI):

```bash
npm run typecheck
```

This runs `tsc -b --pretty false` for the same root project references with
colorized output disabled for easier log parsing. It produces the same `.js`
and `.d.ts` output as `npm run build`.

For the full CI project graph, including `packages/bench`, run:

```bash
npm run typecheck:ci
```

`typecheck:ci` uses `tsconfig.ci.json`, which extends the root graph with the
benchmark package for release/CI parity checks.

## Benchmark Package Build

The benchmark runner is compiled outside the root `tsc -b` graph. Build it
explicitly with:

```bash
npm run bench:build
```

This runs the `@rezi-ui/bench` project-reference graph and writes the runner to
`packages/bench/dist/`.

The root benchmark entry points (`npm run bench`, `npm run bench:rezi`,
`npm run bench:ci`, `npm run bench:terminal:rigorous`, and
`npm run bench:all:rigorous`) invoke this automatically via `pre*` scripts, so
they work from a clean checkout after `npm ci` without a separate manual
`npx tsc -b packages/bench`.

## Native Addon Build

The native addon (`@rezi-ui/native`) wraps the Zireael C engine via napi-rs.
Most users do not need to build it -- prebuilt binaries are published for
common platforms (see [Native addon](../backend/native.md)).

To build from source:

```bash
npm run build:native
```

This is a shorthand for:

```bash
npm -w @rezi-ui/native run build:native
```

The build compiles both the Rust napi-rs glue and the vendored C engine source.
The resulting `.node` binary is placed in `packages/native/`.

After building, run the smoke test to verify:

```bash
npm run test:native:smoke
```

## Documentation Build

Rezi's documentation is built with [MkDocs Material](https://squidfunnel.com/mkdocs-material/).
A helper script handles Python virtual environment setup automatically.

### Local Development Server

```bash
bash scripts/docs.sh serve
```

This command:

1. Creates a Python virtual environment at `.venv-docs/` (if it does not exist).
2. Installs dependencies from `requirements-docs.txt`.
3. Generates TypeDoc API reference output.
4. Starts the MkDocs development server with live reload.

### Production Build

```bash
bash scripts/docs.sh build
```

Builds the static site into `out/site/` with `--strict` mode enabled (all
warnings become errors). The TypeDoc API reference is staged into the site
at `api/reference/`.

### Requirements

The Python dependencies are pinned in `requirements-docs.txt`:

```
mkdocs>=1.6,<1.7
mkdocs-material>=9.5,<10
pymdown-extensions>=10.8,<11
```

## Formatting and Linting

Rezi uses [Biome](https://biomejs.dev/) (v1.9.4) for formatting and linting:

```bash
# Format all files in-place
npm run fmt

# Check for lint issues
npm run lint
```

See the [Style guide](style-guide.md) for details on coding conventions.

## Common Build Issues

### Missing submodules

If you see errors about missing vendor files:

```bash
git submodule update --init --recursive
```

### Stale incremental build

If TypeScript reports errors that do not match the source, delete build caches:

```bash
rm -rf packages/*/dist examples/*/dist packages/*/tsconfig.tsbuildinfo examples/*/tsconfig.tsbuildinfo
npm run build
```

### Native build fails with missing C compiler

The native addon build requires a working C toolchain. On Linux:

```bash
sudo apt-get install build-essential
```

On macOS, install Xcode Command Line Tools:

```bash
xcode-select --install
```

### Python/MkDocs not found

The docs build requires Python 3. If `python3` is not on your `PATH`, set the
`PYTHON` environment variable:

```bash
PYTHON=/usr/bin/python3.11 bash scripts/docs.sh serve
```

## CI Scripts

The repository includes several CI-oriented scripts in `scripts/`:

| Script                            | Purpose |
|-----------------------------------|---------|
| `run-tests.mjs`                  | Deterministic test runner |
| `run-e2e.mjs`                    | End-to-end test runner |
| `run-bench-ci.mjs`              | CI benchmark runner |
| `bench-ci-compare.mjs`          | Benchmark comparison across runs |
| `check-core-portability.mjs`    | Verify `@rezi-ui/core` has no Node-specific imports |
| `check-unicode-sync.mjs`        | Verify Unicode table versions match |
| `check-create-rezi-templates.mjs` | Validate `create-rezi` scaffolding templates; `--install-smoke` also scaffolds, installs, builds, and tests temp apps |
| `verify-native-pack.mjs`        | Verify native package contents before publish |
| `release-set-version.mjs`       | Set version across all workspace packages |
| `guardrails.sh`                  | Pre-commit guardrail checks |
| `docs.sh`                       | Documentation build/serve helper |

## See Also

- [Install](../getting-started/install.md)
- [Repo layout](repo-layout.md)
- [Testing](testing.md)
