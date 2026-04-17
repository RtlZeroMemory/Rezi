# AGENTS.md — Multi-Agent Workflow Guide for Rezi

This file defines how Claude Code and Codex should explore, modify, test, and verify changes in Rezi.
Use `CLAUDE.md` as the canonical API and design reference; this file focuses on workflow and execution discipline.

## Project Overview

Rezi is a runtime-agnostic TypeScript TUI framework in an npm-workspaces monorepo.

| Package | Path | Purpose |
|---------|------|---------|
| `@rezi-ui/core` | `packages/core/` | Runtime-agnostic framework APIs |
| `@rezi-ui/node` | `packages/node/` | Node.js terminal backend |
| `@rezi-ui/jsx` | `packages/jsx/` | JSX parity layer over `ui.*` |
| `@rezi-ui/native` | `packages/native/` | Native engine bindings |
| `@rezi-ui/testkit` | `packages/testkit/` | Testing utilities |
| `create-rezi` | `packages/create-rezi/` | Scaffolding CLI/templates |
| `@rezi-ui/bench` | `packages/bench/` | Benchmarks and profiling |

## Mandatory Code Standards

All code changes must comply with `docs/dev/code-standards.md`.
Treat it as a merge checklist for:
- TypeScript strictness
- runtime/layout/reconciliation invariants
- callback safety and async cancellation

## Mandatory Testing Policy

All behavior changes must follow `docs/dev/testing.md`.
Treat it as the canonical testing policy for:
- behavior-first test design
- contract evidence
- fidelity selection
- degraded-capability and failure-path coverage
- deciding whether an existing test should be kept, rewritten, promoted, or removed

## Exploration Protocol

### Before Writing Any Code

Run this checklist first:

1. Read this file fully.
2. Read `CLAUDE.md` sections relevant to the task.
3. Read `docs/dev/testing.md` before changing behavior or tests.
4. Read the target file and adjacent tests before changing behavior.

### Exploration Order

1. `packages/core/src/index.ts`: public export surface.
2. `packages/core/src/widgets/ui.ts`: canonical widget factory API.
3. `packages/core/src/widgets/types/`: prop contracts and callback signatures.
4. `packages/core/src/widgets/composition.ts`: composition API and hook context.
5. `packages/create-rezi/templates/`: reference implementations.
6. `packages/core/src/**/__tests__/`: expected behavior and edge cases.

### Render Pipeline

Event routing detail to preserve:

```text
key/mouse input -> router -> wheel router (nearest scroll target)
```

Key files for this path:
- `packages/core/src/runtime/router/key.ts`
- `packages/core/src/runtime/router/mouse.ts`
- `packages/core/src/runtime/router/wheel.ts`
- `packages/core/src/runtime/router/zones.ts`

## Agent Coordination Playbook

Use this when more than one agent is touching related scope.

### Task Slicing Rules

1. Assign each agent clear ownership by path/purpose.
2. Keep one agent as integration owner for final merge and test pass.
3. Split by independent concerns:
   - API/type changes
   - runtime behavior
   - JSX parity
   - docs and skills
4. Avoid overlapping edits to the same file unless intentional pair-review is required.

### Parallel Work Contract

- Each worker reports:
  - files changed
  - behavior changed
  - tests run
  - residual risks
- Integration owner resolves conflicts and runs final validation commands.
- If two workers changed the same semantic behavior differently, escalate before merge.

### Conflict Handling

When a conflict appears:

1. Preserve canonical API from `types.ts` and `ui.ts` first.
2. Reconcile docs/examples to match merged API.
3. Re-run affected unit tests immediately after resolution.
4. Run full suite before final commit.

## Risk Triage Matrix

| Change Type | Risk Level | Required Checks |
|-------------|------------|-----------------|
| Docs-only wording update | Low | lint/grep validation |
| Widget prop rename | Medium | compile + affected tests + docs parity |
| Runtime router/reconcile/layout changes | High | full test suite + integration coverage + PTY evidence |
| Drawlist protocol changes | High | codegen + protocol tests + docs sync |
| Theme/recipe behavior changes | Medium | visual snapshots + multi-theme PTY spot-check |

Escalation rules:

- High-risk changes need explicit evidence in commit or handoff notes.
- Medium-risk changes require at least one focused test pass and one integration assertion.
- Low-risk changes still require API consistency greps when docs include signatures/examples.

## Layout Engine Baseline (Current)

See `CLAUDE.md` § Layout Engine Baseline.

## Modification Protocol

### Before Changing Code

1. Read target file end-to-end.
2. Read neighboring tests and integration tests for the module.
3. Identify if the file is in a danger zone (below).
4. Confirm required sibling updates (JSX parity, docs, tests).

### Safe Modification Zones

- `packages/core/src/widgets/ui.ts`
- `packages/core/src/widgets/types/`
- `packages/core/src/widgets/protocol.ts`
- `packages/create-rezi/templates/`
- `docs/`
- test files (`**/__tests__/*.test.ts`)
- `packages/core/src/theme/`
- `packages/core/src/ui/`
- `packages/core/src/icons/`
- `examples/gallery/`

### Danger Zones (Extra Care Required)

- `packages/core/src/runtime/commit.ts`
- `packages/core/src/runtime/reconcile.ts`
- `packages/core/src/runtime/router/wheel.ts`
- `packages/core/src/app/createApp.ts`
- `packages/core/src/layout/`
- `packages/core/src/layout/dropdownGeometry.ts`
- `packages/core/src/renderer/`
- `packages/core/src/drawlist/`
- `packages/core/src/binary/`

### Module Boundary Rules

These boundaries are strict:
- `@rezi-ui/core` must not import from `@rezi-ui/node`, `@rezi-ui/jsx`, or `@rezi-ui/native`.
- `@rezi-ui/node` may import from `@rezi-ui/core`.
- `@rezi-ui/jsx` may import from `@rezi-ui/core`.

### Cross-Cutting Concern: JSX Parity

When a core widget API changes, update JSX in the same change set:
- `packages/jsx/src/components.ts`
- `packages/jsx/src/types.ts`
- `packages/jsx/src/createElement.ts`
- `packages/jsx/src/index.ts`
- `packages/jsx/src/__tests__/`
- `docs/getting-started/jsx.md`
- `docs/packages/jsx.md`
- `packages/jsx/README.md`

### Drawlist Codegen

See `CLAUDE.md` § Drawlist Codegen Protocol.

## Testing Protocol

Behavior changes must follow the canonical policy in `docs/dev/testing.md`.

Non-negotiable rules:
- tests must assert expected behavior, not current implementation shape
- choose the lowest fidelity that can prove the contract, but no lower
- use terminal-real PTY evidence when semantic or replay tests cannot prove terminal-visible behavior safely
- if a valid behavior-first test fails, keep the test and fix the implementation unless the contract is actually under-specified
- do not weaken a valid expectation just to keep the code unchanged

Quick commands:

```bash
# Full deterministic suite
npm test

# Package tests only
npm run test:packages

# Script tests only
npm run test:scripts

# End-to-end suites
npm run test:e2e
npm run test:e2e:reduced
```

Execution order:
1. Run the nearest credible test slice first.
2. If runtime, layout, renderer, backend, or terminal behavior changed, run the relevant integration or scenario coverage too.
3. If terminal-visible behavior changed, include PTY evidence when required by `docs/dev/testing.md`.
4. Run the full suite before final commit when the risk warrants it.

### Mandatory Live PTY Validation for UI Regressions

For rendering, layout, theme, capability, or terminal-integration regressions, include a live PTY pass and frame-audit evidence.

Canonical runbook:
- `docs/dev/live-pty-debugging.md`

Minimum checks:
1. Run target app/template in PTY with deterministic viewport.
2. Exercise relevant routes and key paths.
3. Capture `REZI_FRAME_AUDIT` logs.
4. Analyze logs with `node scripts/frame-audit-report.mjs ... --latest-pid`.
5. Include concrete evidence in your report.

## Verification Protocol (Two-Agent Verification)

### Agent 1 — Accuracy Checker

- Verify file paths in docs exist.
- Check signatures match exports in `packages/core/src/index.ts`.
- Validate prop/callback names match `packages/core/src/widgets/types.ts`.
- Ensure examples compile against current API shape.

### Agent 2 — Completeness Checker

- Check no critical exports are missing from docs.
- Verify canonical APIs are represented (no stale alternatives).
- Ensure guidance matches template patterns in `packages/create-rezi/templates/`.
- Validate constraints and limits referenced in docs match code constants.

## Building TUIs with Rezi

Use template structure from `create-rezi` and keep view functions pure.

Required structure:

```text
src/
  main.ts
  types.ts
  theme.ts
  helpers/
    state.ts
    keybindings.ts
  screens/
    *.ts
  __tests__/
    reducer.test.ts
    render.test.ts
    keybindings.test.ts
```

Implementation expectations:
- state and action types in `types.ts`
- reducer in `helpers/state.ts`
- screen functions in `screens/`
- keybindings wired via `app.keys()`
- use `createNodeApp({ config: { fpsCap: 30 } })` for production apps

## TUI Aesthetics Protocol

Use `CLAUDE.md` as source of truth for all design/layout guidance.

### Mandatory Structure

- Root view uses `ui.page()` or `ui.appShell()`.
- Root keeps at least `p: 1`.
- Major content sections are grouped in `ui.panel()` or `ui.card()`.
- Action rows use `ui.actions()`.
- Forms use `ui.form()` + `ui.field()` wrappers.

### Button Styling

See `CLAUDE.md` § Button Styling.

### Verification Checklist

Before finalizing a TUI feature:
- [ ] Root structure and spacing follow canonical page patterns.
- [ ] Semantic status widgets are used (badge/status/tag/callout).
- [ ] Button actions use intent-based semantics.
- [ ] No hardcoded RGB/hex styling in app widgets.
- [ ] Large collections use `ui.virtualList`.

## PR and Commit Protocol

- Run `node scripts/run-tests.mjs` before commit.
- Keep commits atomic (one logical change per commit).
- Use commit prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `perf`, `chore`.
- Update `CHANGELOG.md` for user-visible behavior changes.
- Use npm workspaces; do not switch to pnpm.

## Common Mistakes to Avoid

1. Importing from internal paths instead of package exports.
2. Missing `id` on interactive widgets.
3. Conditional hook execution.
4. In-place mutation of app state.
5. Duplicate widget IDs in one tree.
6. Skipping full-suite test pass after runtime/layout changes.
7. Breaking module boundaries (core importing runtime-specific modules).
8. Editing generated drawlist writer files directly.
9. Using non-semantic manual status rendering instead of semantic widgets.
10. Rendering large lists without virtualization.
