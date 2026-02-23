# JSX Internals

This document explains how `@rezi-ui/jsx` is wired and how to add new JSX components safely.

## Architecture

Flow:

1. TS/JSX compiler emits calls into `@rezi-ui/jsx/jsx-runtime`.
2. `createElement()` in `packages/jsx/src/createElement.ts` resolves:
   - intrinsic string tags (`"box"`, `"statusBar"`, etc.) via `intrinsicFactories`
   - function components by direct invocation
3. Intrinsic factories call component functions in `packages/jsx/src/components.ts`.
4. Component functions delegate to `ui.*()` factories from `@rezi-ui/core`.
5. Core `ui.*()` returns final VNodes consumed by commit/layout/render.

## Adding a New JSX Component

Checklist:

1. Add JSX prop types in `packages/jsx/src/types.ts`.
2. Add component implementation in `packages/jsx/src/components.ts`.
3. Add intrinsic type entry in `ReziIntrinsicElements` (`types.ts`).
4. Add intrinsic factory mapping in `packages/jsx/src/createElement.ts`.
5. Export component and type(s) from `packages/jsx/src/index.ts`.
6. Add/update tests in `packages/jsx/src/__tests__/`.
7. Update docs:
   - `docs/getting-started/jsx.md`
   - `docs/packages/jsx.md`
   - `packages/jsx/README.md`

## Children Normalization Rules

Implemented in `packages/jsx/src/children.ts`:

- Container children (`normalizeContainerChildren`):
  - flatten nested arrays
  - drop `null`, `undefined`, and booleans
  - wrap `string`/`number` as `ui.text(...)`
- Text children (`normalizeTextChildren`):
  - flatten nested arrays
  - drop `null`, `undefined`, and booleans
  - stringify and concatenate remaining values

## Key Handling Protocol

- JSX runtime `createElement(type, props, key)` injects/overrides `props.key` when a JSX key is present.
- Component-level helper `withOptionalKey()` forwards `key` into core prop objects.
- Components that use positional `ui.*()` signatures still preserve key by forwarding key in the secondary props object, or by applying key to the returned root VNode when no options object exists.

## Why Delegation to `ui.*()` Is Required

JSX components must call core `ui.*()` instead of constructing raw VNodes.

Reasons:

- Core applies behavioral transforms (`resolveButtonIntent`, `resolveBoxPreset`, etc.).
- Core can evolve (new defaults, normalization, metadata) without JSX drift.
- Delegation guarantees JSX and non-JSX APIs produce equivalent VNode trees.

## Testing Strategy

Required coverage for JSX changes:

1. Bugfix tests for known transform paths (`Button intent`, `Box preset`).
2. Composition helper tests for new composite APIs.
3. Parity tests that compare JSX output to equivalent `ui.*()` calls.
4. Full suite execution (`node scripts/run-tests.mjs`) before merge.

Parity tests are the guardrail that prevents JSX/API divergence over time.
