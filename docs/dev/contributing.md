# Contributing

Rezi welcomes issues and pull requests. This page summarizes the local workflow; see the linked guides for details.

Before starting implementation, review the mandatory
[Code Standards](code-standards.md) checklist.

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
- For animation hook changes (`useTransition`, `useSpring`, `useSequence`, `useStagger`) or `ui.box` transition behavior, also update `docs/guide/animation.md` and `docs/widgets/box.md`.
- Add deterministic lifecycle tests (mount, dependency change, unmount cleanup, stale async result guards).
- If the hook depends on runtime capabilities, keep adapters in runtime packages (`@rezi-ui/node`, etc.), not in `@rezi-ui/core`.

For `ui.virtualList` behavior changes, also run focused suites before full tests:

```bash
node --test packages/core/src/widgets/__tests__/virtualList.contract.test.ts
node --test packages/core/src/layout/__tests__/layout.overflow-scroll.test.ts
node --test packages/core/src/app/__tests__/widgetRenderer.integration.test.ts
```

## HSR Change Checklist

If your change touches `app.view`, route integration, reconciliation identity, `createNodeApp({ hotReload })`, or `createHotStateReload`:

- add app runtime tests for `app.replaceView(...)` / `app.replaceRoutes(...)` behavior
- verify widget local state survives reload with stable ids/keys
- verify failure paths keep the previous working view/routes
- update user docs when API/limitations change
- manually run `npm run hsr:demo:widget` once and confirm in-app code-editor save (`self-edit-code` + F6/Ctrl+O or save button + Enter) triggers reload without process restart

If your change touches code-editor syntax behavior (`syntaxLanguage`, tokenizer exports, or renderer token painting):

- add/extend unit tests for built-in language presets and custom tokenizer override paths
- verify fallback behavior for unsupported language names (`plain`)
- update [widgets/code-editor](../widgets/code-editor.md) and [packages/core](../packages/core.md) API docs

## Where to look next

- [Repo layout](repo-layout.md)
- [Build](build.md)
- [Testing](testing.md)
- [Docs](docs.md)
- [Code Standards](code-standards.md)
- [Style guide](style-guide.md)
