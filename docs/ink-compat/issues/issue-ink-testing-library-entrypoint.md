# Issue Stub: Add `@rezi-ui/ink-compat/testing` Entrypoint

- Linked capability: MCAP-004
- Scope: OUT-OF-SCOPE (current pass)
- Priority: P1
- Labels: `ink-compat`, `out-of-scope`, `testing`, `priority:P1`, `needs-design`

## Problem

Ink’s testing workflow expects a compatibility render harness, but `@rezi-ui/ink-compat` currently exports only `.` and has no `./testing` surface.

## Acceptance Criteria

- Add package export `./testing` with stable TypeScript types.
- Provide `render()` helper with `lastFrame`, `stdin.write`, `rerender`, `unmount`, `cleanup` semantics.
- Document behavior and constraints under `docs/ink-compat/`.
- Add deterministic contract tests for the testing API surface.
- Verify compatibility against mainstream `ink-testing-library` usage patterns.
