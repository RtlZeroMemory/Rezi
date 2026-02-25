# Code Standards

This document defines mandatory code standards for Rezi contributors and AI agents.
Treat this as a normative checklist for code review and PR readiness.

See also:
- [Style Guide](style-guide.md)
- [Contributing](contributing.md)

## Enforcement Levels

- `MUST`: required for merge.
- `SHOULD`: expected unless there is a clear, documented reason not to.

## 1) Baseline Checks (MUST)

For any code change:

```bash
npm run lint
npm run typecheck
```

For runtime/layout/renderer/reconcile changes, also run:

```bash
node scripts/run-tests.mjs
```

For drawlist protocol or command layout changes, also run:

```bash
npm run codegen
npm run codegen:check
```

## 2) TypeScript Standards

### Type safety

- `MUST` preserve strict typing (`strict`, `noImplicitAny`, `useUnknownInCatchVariables`).
- `MUST NOT` introduce `any` unless there is no safe alternative.
- `MUST` narrow `unknown` before property access.
- `MUST` prefer `import type { ... }` for type-only imports.

### Public API and domain modeling

- `MUST` model variants with discriminated unions (tagged unions), not class hierarchies.
- `MUST` keep exported API shapes explicit and stable.
- `SHOULD` use explicit return types on exported functions.

### Nullability and indexing

- `MUST` handle `undefined` from array/index lookups explicitly (`noUncheckedIndexedAccess`).
- `MUST NOT` use non-null assertion (`!`) unless the invariant is proven in the same scope.

### Immutability and determinism

- `SHOULD` prefer readonly shapes (`Readonly`, readonly arrays) for shared data.
- `MUST` avoid hidden mutation of shared objects in render/layout paths.

## 3) Rezi-Specific Architecture Standards

### Runtime boundaries

- `MUST NOT` import runtime-specific APIs into `@rezi-ui/core`.
- `MUST` keep module boundaries intact:
  - `core` -> no imports from `node`/`jsx`/`native`
  - `node`/`jsx` -> may import from `core`

### Widget and reconciliation rules

- `MUST` use stable `id` for interactive widgets.
- `MUST` use stable `key` values for list reconciliation.
- `MUST` keep hook invocation order stable (no conditional hooks).
- `MUST` preserve deterministic behavior for the same input state.

### API layering

- `SHOULD` prefer `ui.*` factories over raw vnode construction.
- `MUST` keep JSX parity when changing core widget APIs (`ui.ts`, JSX components/types/tests/docs together).

### Generated code and protocol

- `MUST NOT` hand-edit generated drawlist writers.
- `MUST` update source spec + regenerate writers + update protocol docs when command bytes/layout changes.

## 4) Error Handling Standards (Critical)

### Choose the right failure contract

- `MUST` use typed result unions for parse/validation-style flows where callers should recover.
- `MUST` throw for unrecoverable programmer/configuration errors.
- `MUST` keep error contracts consistent within each module.

### Catch blocks and thrown values

- `MUST` treat caught values as `unknown`.
- `MUST` use safe thrown-value formatting in logs/warnings.
- `MUST NOT` call `String(error)` directly in safety-critical catch blocks without a nested guard.

Recommended pattern:

```ts
function describeThrown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return String(value);
  } catch {
    return "[unstringifiable thrown value]";
  }
}
```

### Callback boundaries

- `MUST` isolate user callback failures so they do not destabilize routing/render loops.
- `MUST` keep callback wrappers deterministic and side-effect safe.
- `SHOULD` emit dev warnings (`warnDev`) instead of throwing for user callback exceptions in routing/event handlers.

### Async cancellation and stale results

- `MUST` guard async completion paths against cancellation/stale-token updates.
- `MUST` ensure canceled validations/effects cannot mutate state after cleanup/unmount.

### Error wrapping

- `SHOULD` preserve original errors via `cause` when wrapping.
- `MUST` keep wrapped messages actionable and specific.

## 5) Performance and Hot-Path Standards

- `MUST` avoid unnecessary allocations in per-frame render/layout paths.
- `SHOULD` use simple loops in hot paths instead of allocation-heavy array pipelines.
- `MUST` preserve existing deterministic ordering and stable signatures where applicable.

## 6) Documentation and Parity Standards

- `MUST` update docs in the same PR when changing public behavior.
- `MUST` update examples/templates when recommended patterns change.
- `MUST` keep `CLAUDE.md` and `AGENTS.md` aligned with these standards.

## 7) PR Checklist

Before merging, verify:

- [ ] `lint` and `typecheck` are green.
- [ ] Required tests for touched areas are green.
- [ ] Error paths and cancellation/stale guards are covered where relevant.
- [ ] Module boundaries and JSX parity are preserved.
- [ ] Public API/documentation updates are included.

