# AGENTS.md — Multi-Agent Workflow Guide for Rezi

This file guides AI agents (Claude Code, OpenAI Codex) on how to explore, modify, test, and verify changes in the Rezi codebase. Follow these protocols for reliable results.

## Project Overview

Rezi is a runtime-agnostic TypeScript TUI framework. Monorepo with `npm` workspaces (NOT pnpm).

**Packages:**

| Package | Path | Purpose |
|---------|------|---------|
| `@rezi-ui/core` | `packages/core/` | Runtime-agnostic core framework |
| `@rezi-ui/node` | `packages/node/` | Node.js backend (terminal I/O) |
| `@rezi-ui/jsx` | `packages/jsx/` | JSX transform layer |
| `@rezi-ui/native` | `packages/native/` | Native engine bindings |
| `@rezi-ui/testkit` | `packages/testkit/` | Test utilities |
| `create-rezi` | `packages/create-rezi/` | Project scaffolding CLI |
| `@rezi-ui/bench` | `packages/bench/` | Benchmark suite |

## Exploration Protocol

When investigating Rezi code, follow this order:

1. **Start with exports.** Read `packages/core/src/index.ts` to understand the full public API surface. This is the single source of truth for what the framework exposes.
2. **Widget API.** `packages/core/src/widgets/ui.ts` has all 60+ widget factory functions (`ui.text()`, `ui.box()`, `ui.column()`, etc.).
3. **Types.** `packages/core/src/widgets/types.ts` has all prop interfaces (`TextProps`, `BoxProps`, `ButtonProps`, etc.).
4. **Composition + hook APIs.** `packages/core/src/widgets/composition.ts` contains `defineWidget` hooks, including animation hooks (`useTransition`, `useSpring`, `useSequence`, `useStagger`).
5. **Templates are reference implementations.** Check `packages/create-rezi/templates/` for canonical app patterns. Five templates exist: `minimal`, `dashboard`, `cli-tool`, `stress-test`, `animation-lab`.
6. **Tests show expected behavior.** `packages/core/src/**/__tests__/` contains 240+ test files. Read tests before making assumptions about how a module works.

**Render pipeline (execution order):**

```
State -> view(state) -> VNode tree -> commitVNodeTree (reconciliation)
     -> layout -> metadata_collect -> renderToDrawlist
     -> builder.build() -> backend.requestFrame()
```

Key pipeline files:
- `packages/core/src/app/widgetRenderer.ts` — orchestrates full pipeline
- `packages/core/src/runtime/commit.ts` — VNode to RuntimeInstance tree
- `packages/core/src/runtime/reconcile.ts` — child matching (keyed/unkeyed)
- `packages/core/src/renderer/renderToDrawlist/renderTree.ts` — stack-based DFS renderer
- `packages/core/src/drawlist/builder_v1.ts` — ZRDL binary drawlist builder

## Modification Protocol

### Before changing code

1. Read the target file fully.
2. Check existing tests for the module (`__tests__/` directory adjacent to or near the file).
3. Understand where the target sits in the render pipeline.

### Safe modification zones

These areas tolerate changes well and have good test coverage:

- `packages/core/src/widgets/ui.ts` — adding new widget factory functions
- `packages/core/src/widgets/types.ts` — adding new prop types
- `packages/create-rezi/templates/` — template modifications
- `docs/` — documentation changes
- Test files (`**/__tests__/*.test.ts`)
- `packages/core/src/theme/` — theme definitions and presets
- `packages/core/src/ui/` — design system tokens, recipes, capabilities
- `packages/core/src/icons/` — icon registries
- `examples/gallery/` — widget gallery app

### Danger zones (require extra care)

Changes here affect all rendering and can introduce subtle regressions:

- `packages/core/src/runtime/commit.ts` — reconciliation logic
- `packages/core/src/runtime/reconcile.ts` — child matching, key algorithm
- `packages/core/src/app/createApp.ts` — app lifecycle, error handling
- `packages/core/src/layout/` — layout engine, constraint resolution
- `packages/core/src/renderer/` — drawlist generation
- `packages/core/src/drawlist/` — binary protocol builders
- `packages/core/src/binary/` — binary reader/writer

### Module boundary rules

These boundaries are strict. Violating them breaks the runtime-agnostic guarantee.

- `@rezi-ui/core` MUST NOT import from `@rezi-ui/node`, `@rezi-ui/jsx`, or `@rezi-ui/native`
- `@rezi-ui/node` imports from `@rezi-ui/core` only
- `@rezi-ui/jsx` imports from `@rezi-ui/core` only

### Drawlist writer codegen guardrail (MUST for ZRDL command changes)

The v3/v4/v5 command writer implementation is code-generated. Never hand-edit
`packages/core/src/drawlist/writers.gen.ts`.

When changing drawlist command layout/opcodes/field widths/offsets:

1. Update `scripts/drawlist-spec.ts` (single source of truth).
2. Regenerate writers: `npm run codegen`.
3. Verify sync guardrail: `npm run codegen:check`.
4. Update `packages/core/src/drawlist/__tests__/writers.gen.test.ts` if command bytes changed.
5. Update protocol docs (`docs/protocol/zrdl.md`, `docs/protocol/versioning.md`) in the same PR.

CI enforces this with `codegen:check`; stale generated writers are a hard failure.

## Testing Protocol

```bash
# Run all tests
node scripts/run-tests.mjs

# Run specific test file
node --test packages/core/src/widgets/__tests__/basicWidgets.test.ts

# Run tests matching pattern
node scripts/run-tests.mjs --filter "widget"
```

**Test locations:**

| Category | Path |
|----------|------|
| Unit tests | `packages/core/src/**/__tests__/*.test.ts` |
| Integration tests | `packages/core/src/__tests__/integration/` |
| Stress/fuzz tests | `packages/core/src/__tests__/stress/` |
| Template tests | `packages/create-rezi/templates/*/src/__tests__/` |

**After any code change:**

1. Run tests for the affected module first.
2. If changing runtime, layout, or renderer code, also run integration tests.
3. Run the full suite before committing.

## Verification Protocol (Two-Agent Verification)

When verifying documentation or code changes, split into two passes:

**Agent 1 — Accuracy Checker:**
- Verify all file paths referenced in docs actually exist on disk.
- Verify all function signatures match actual exports in `packages/core/src/index.ts`.
- Verify all prop types match actual type definitions in `packages/core/src/widgets/types.ts`.
- Verify code examples would compile and run with the current API.

**Agent 2 — Completeness Checker:**
- Check that no important exports are missing from docs.
- Check that no deprecated APIs are recommended.
- Check patterns match the template reference implementations in `packages/create-rezi/templates/`.
- Check guardrails and limits match actual constants in code (e.g., `MAX_UNDO_STACK`, `MAX_LOG_ENTRIES`).

## Building TUIs with Rezi

When creating demo apps or TUI implementations, follow the template structure:

```
src/
  main.ts              -- App bootstrap, keybindings, event loop
  types.ts             -- State and action types
  theme.ts             -- Theme selection
  helpers/
    state.ts           -- Initial state + reducer function
    keybindings.ts     -- Keybinding command resolver
  screens/
    *.ts               -- Pure view functions per screen
  __tests__/
    reducer.test.ts    -- State logic tests
    render.test.ts     -- Render output tests
    keybindings.test.ts -- Keybinding tests
```

**Required patterns:**

1. Define state type and action union in `types.ts`.
2. Create reducer in `helpers/state.ts`.
3. Create pure screen functions in `screens/` (each returns a `VNode`).
4. Wire keybindings via `app.keys()` in `main.ts`.
5. Use `createNodeBackend({ fpsCap: 30 })` for production apps.
6. For animated screens, prefer declarative hooks (`useTransition`, `useSpring`, `useSequence`, `useStagger`) and `ui.box` transition props over ad-hoc timers in view code.

**Widget usage hierarchy (prefer higher):**

1. `ui.*` factory functions — `text`, `box`, `column`, `row`, `button`, `input`, `select`, `table`, etc.
2. `defineWidget()` — for stateful reusable components with hooks.
3. `useTransition()/useSpring()/useSequence()/useStagger()`, `useTable()`, `useModalStack()`, `useForm()` — for complex interaction patterns.
4. `each()`, `show()`, `when()`, `maybe()`, `match()` — rendering control flow utilities.

## PR and Commit Protocol

- Run full test suite before commits: `node scripts/run-tests.mjs`
- Commit message format: `feat(scope):`, `fix(scope):`, `docs(scope):`, `refactor(scope):`, `test(scope):`
- Keep commits atomic — one logical change per commit.
- Update `CHANGELOG.md` for user-facing changes.
- Do not use `pnpm`. This project uses `npm` workspaces.

## Common Mistakes to Avoid

1. **Importing from internal paths** instead of package exports. Always import from `@rezi-ui/core`, not from `@rezi-ui/core/dist/widgets/ui.js`.
2. **Forgetting `id` prop on interactive widgets.** Buttons, inputs, checkboxes, selects, and other focusable widgets require a unique `id`. Omitting it causes a runtime crash.
3. **Calling hooks conditionally.** `defineWidget` hooks (`useTransition`, `useSpring`, `useSequence`, `useStagger`, `useAsync`, `useDebounce`, `usePrevious`, etc.) must be called in the same order every render. No conditional hook calls.
4. **Mutating state directly.** Always use `app.update()` with an updater function or new state object. Never mutate the state reference.
5. **Creating duplicate widget IDs.** Two widgets with the same `id` in the same render tree will cause a fatal error. Use `ctx.id()` for dynamic lists inside `defineWidget`.
6. **Using `pnpm`.** This project uses `npm` workspaces. Running `pnpm install` will break the workspace links.
7. **Skipping tests after pipeline changes.** Any change to commit, reconcile, layout, or renderer files requires running the full test suite. Subtle regressions are common.
8. **Breaking module boundaries.** Core must remain runtime-agnostic. Never add Node.js-specific imports (`Buffer`, `worker_threads`, `node:*`) to `@rezi-ui/core`.
9. **Misconfiguring box transitions.** `ui.box` transition defaults to animating `position`, `size`, and `opacity`; use explicit `properties` filters (or `[]` to disable) when behavior should be constrained.
10. **Editing generated drawlist writers by hand.** Update `scripts/drawlist-spec.ts` and run `npm run codegen` instead.
