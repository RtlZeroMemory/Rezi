# Contributing

Rezi welcomes issues and pull requests. This page summarizes the local workflow; see the linked guides for details.

## Prerequisites

- Node.js 18+ (18.18+ recommended)
- npm (workspace root)
- Rust stable (only if you build `@rezi-ui/native`)
- Python 3 (docs build)

## Local setup

```bash
npm ci
npm run build
```

## Typical checks

```bash
npm run typecheck
npm run lint
npm test
npm run docs:build
```

## Hook/API changes

- For public hook changes, update `docs/guide/hooks-reference.md` and `docs/guide/composition.md` in the same PR.
- Add deterministic lifecycle tests (mount, dependency change, unmount cleanup, stale async result guards).
- If the hook depends on runtime capabilities, keep adapters in runtime packages (`@rezi-ui/node`, etc.), not in `@rezi-ui/core`.

## Where to look next

- [Repo layout](repo-layout.md)
- [Build](build.md)
- [Testing](testing.md)
- [Docs](docs.md)
- [Style guide](style-guide.md)
