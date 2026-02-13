# Contributing

Thanks for contributing to Rezi.

Rezi is a **code-first terminal UI framework** for Node.js built on the Zireael C engine. The core design constraints (determinism, safety, and strict module boundaries) are deliberate; please read the docs before making behavior changes.

## Quickstart (dev)

Prerequisites:

- Node.js 18+ (18.18+ recommended)
- Rust (stable toolchain) for the native addon
- Git submodules enabled

Clone and bootstrap:

```bash
git clone https://github.com/RtlZeroMemory/Rezi.git
cd Rezi
git submodule update --init --recursive
npm ci
```

Common commands:

```bash
npm run fmt
npm run lint
npm run typecheck
npm run build
npm test
```

Native addon (host build + smoke):

```bash
npm run build:native
npm run test:native:smoke
```

## Repository layout

- `packages/core` — runtime-agnostic TypeScript core (no Node APIs)
- `packages/node` — Node.js backend (worker-thread ownership, IO, buffers)
- `packages/native` — Rust + N-API addon bundling the Zireael engine
- `packages/testkit` — test utilities and fixtures
- `packages/jsx` — JSX runtime
- `packages/bench` — benchmark harness (not published)
- `examples/*` — runnable examples
- `docs/` — GitHub Pages documentation site (MkDocs)

## Project constraints (read before changing)

- `packages/core` must not import `node:*`, use `Buffer`, or depend on Node runtime semantics.
- Binary parsing/building must follow the safety rules in the docs (bounded reads, alignment checks, deterministic failure).
- Public APIs should be documented and stable within a release line.

## Pull requests

PRs should include:

- A clear problem statement and intended behavior
- Tests for any behavior change (unit tests or golden fixtures where appropriate)
- Docs updates for user-facing changes (manual and/or API docs)

PRs may be rejected if they:

- Blur module boundaries (Node code in `core`)
- Add implicit behavior or non-determinism
- Expand unsafe binary surface area without tight validation

## Style and tooling

- Formatting and linting: Biome (`npm run fmt`, `npm run lint`)
- TypeScript: strict mode (`npm run typecheck`)
- Tests: `npm test` (keep tests deterministic and fast)
