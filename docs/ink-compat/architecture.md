# Ink-Compat Architecture (Fresh Start)

## Scope
`@rezi-ui/ink-compat` is rebuilt from scratch as a compatibility adapter that prioritizes mainstream Ink behavior first (Tier-1 contract), with deterministic behavior gates.

Design principle for this pass: keep runtime behavior aligned with locked Ink baseline by delegating core rendering/hook semantics to locked Ink APIs, then layer strict invariants/tests around the adapter surface.

- Locked baseline: `ink@6.7.0`, commit `135cb23ae3b7ca94918b1cd913682f6356f12c5c`
- No reuse of prior `ink-compat` implementation
- No C engine/runtime changes

## Adapter Boundaries
1. Public API boundary (`@rezi-ui/ink-compat`):
- Exposes Ink-compatible `render` lifecycle API and mainstream component/hook exports.
- Adds deterministic key normalization wrapper for Tier-1 key contract.

2. Execution boundary (upstream Ink runtime):
- Rendering, reconciliation, stream integration, focus handling, and hook internals are delegated to locked Ink runtime.
- This gives immediate mainstream parity for Tier-1 primitives.

3. Validation boundary (tests/docs):
- Deterministic parity tests enforce IKINV contracts.
- Missing capabilities are explicitly documented and prioritized.

## Data Flow
1. App calls `render(tree, options)` on `@rezi-ui/ink-compat`.
2. Adapter normalizes options and forwards to locked Ink `render`.
3. Ink runtime manages stream IO + lifecycle.
4. Adapter returns normalized instance (`rerender/unmount/waitUntilExit/clear/cleanup`).

Input flow:
1. Ink stream input triggers `useInput` callback.
2. Adapter `useInput` wrapper normalizes mainstream key aliases/flags.
3. App receives deterministic `input,key` payload.

## Lifecycle Mapping
- `render`: create/attach Ink instance and return wrapped instance handle (IKINV-001, IKINV-009).
- `rerender`: forward to Ink rerender path (IKINV-001, IKINV-002).
- `unmount`/`waitUntilExit`: forward and preserve deterministic shutdown semantics (IKINV-001, IKINV-007).
- `clear`: forward with deterministic no-throw contract in non-TTY mode (IKINV-008).
- `cleanup`: deterministic wrapper cleanup that is safe and idempotent (IKINV-007).

## Unsupported/Deferred Areas
- Rezi-native rendering backend parity (out-of-scope in this pass; mainstream compatibility-first delivery).
- Deep transform/static/focus edge semantics beyond baseline behavior probes.
- Ink features outside Tier-1/Tier-2 contract when they require ABI/runtime expansion.

## Baseline Evidence
- API + lifecycle: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/render.ts>
- Components docs: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#components>
- Hooks docs: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#hooks>
- useInput key model: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/hooks/use-input.ts>
