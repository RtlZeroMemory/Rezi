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

For `ui.virtualList` behavior changes, also run focused suites before full tests:

```bash
node --test packages/core/src/widgets/__tests__/virtualList.contract.test.ts
node --test packages/core/src/layout/__tests__/layout.overflow-scroll.test.ts
node --test packages/core/src/app/__tests__/widgetRenderer.integration.test.ts
```

## Where to look next

- [Repo layout](repo-layout.md)
- [Build](build.md)
- [Testing](testing.md)
- [Docs](docs.md)
- [Style guide](style-guide.md)
