# Contributing

Thanks for contributing to Rezi.

Rezi is a code-first terminal UI framework for Node.js built on the Zireael C
engine. The core design constraints are deliberate: deterministic behavior,
strict module boundaries, and safe binary handling.

Before changing behavior, read:
- [Canonical testing policy](docs/dev/testing.md)
- [Code standards](docs/dev/code-standards.md)

## Quickstart

Prerequisites:
- Node.js 18+ (18.18+ recommended)
- Rust stable toolchain for the native addon
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

Native addon:

```bash
npm run build:native
npm run test:native:smoke
```

## Repository layout

- `packages/core` - runtime-agnostic TypeScript core
- `packages/node` - Node.js backend
- `packages/native` - Rust + N-API addon
- `packages/testkit` - test utilities and fixtures
- `packages/jsx` - JSX runtime
- `packages/bench` - benchmark harness
- `examples/*` - runnable examples
- `docs/` - documentation site

## Project constraints

- `packages/core` must not import `node:*`, use `Buffer`, or depend on Node runtime semantics.
- Binary parsing and building must remain bounded, deterministic, and explicit about failure.
- Public APIs should remain documented and stable within a release line.
- Streaming hooks in `packages/core` must use runtime adapters or factories for environment-specific sources and include cleanup plus stale-update guards.
- Animation hooks and transition behavior must remain deterministic and be documented when user-visible behavior changes.

## Testing requirements

Behavior changes must follow the canonical testing policy in [docs/dev/testing.md](docs/dev/testing.md).

Short version:
- tests must assert expected behavior, not current implementation shape
- choose the lowest fidelity that can prove the contract, but no lower
- use terminal-real PTY evidence when terminal-visible behavior cannot be proven safely by semantic or replay tests
- cover degraded-capability and failure paths when the contract depends on them
- do not weaken a valid failing test to preserve current behavior; fix the implementation or make the contract gap explicit

## Pull requests

PRs should include:
- a clear problem statement and intended behavior
- tests for the behavior change at the right fidelity
- contract source and degraded or failure-path coverage when relevant
- docs updates for user-facing changes

PRs may be rejected if they:
- blur module boundaries
- add implicit behavior or non-determinism
- expand unsafe binary surface area without tight validation
- rely on implementation-shaped tests instead of behavioral coverage

## Style and tooling

- Formatting and linting: Biome (`npm run fmt`, `npm run lint`)
- TypeScript: strict mode (`npm run typecheck`)
- Tests: `npm test`
- Hook changes: update `docs/guide/hooks-reference.md` and include race or cleanup tests
- Animation changes: update `docs/guide/animation.md` and `docs/widgets/box.md`, and add transition or hook tests

## Interaction guidelines

- Interactive widgets with an `id` should be keyboard reachable via `Tab` unless there is a deliberate opt-out (`focusable: false`).
- For complex table flows, prefer `useTable(...)` over manually wiring selection or sort state.
- For stacked modal flows, prefer `useModalStack(...)` so push/pop behavior and focus restoration stay deterministic.
- In composite widgets, use `ctx.useMemo(...)` and `ctx.useCallback(...)` when dependency-driven memoization is needed.
- For hot state-preserving reload workflows, keep widget ids and keys stable so local state and focus survive edits.
- For code-editor syntax changes, keep tokenization deterministic and line-based, then add or adjust `codeEditor.syntax` coverage.

## Widget and design-system guardrails

- New widget kinds must be registered in `packages/core/src/widgets/protocol.ts`. Do not add new hardcoded kind lists elsewhere in the runtime or layout path.
- When adding interactive widgets, wire the matching recipe function and validate both legacy `Theme` and `ThemeDefinition` paths.
- Recipe output should provide the default style, and manual widget `style` overrides should merge on top.
