# Issue Stub: Deep Tier-2 Edge Matrix (`Static` / `Transform` / Focus)

- Linked capability: MCAP-006
- Scope: OUT-OF-SCOPE (current pass)
- Priority: P3
- Labels: `ink-compat`, `out-of-scope`, `tier2`, `priority:P3`, `tests`

## Problem

Current Tier-2 coverage validates mainstream behavior but does not include deep interaction matrices for `Static`, `Transform`, and focus transitions under stress.

## Acceptance Criteria

- Add deterministic integration scenarios covering static append order under repeated rerenders.
- Add transform-chain scenarios that assert frame dimension stability.
- Add mixed scenarios combining focus movement with static/transform updates.
- Record expected frame histories and enforce them in regression tests.
- Publish coverage summary and unresolved edge cases in `docs/ink-compat/`.
