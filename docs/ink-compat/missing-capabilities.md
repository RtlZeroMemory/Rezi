# Ink-Compat Missing Capabilities

## Summary

| Metric | Value |
|---|---:|
| Total missing capabilities | 3 |
| IN-SCOPE | 0 |
| OUT-OF-SCOPE | 3 |
| Priority P1 | 1 |
| Priority P2 | 1 |
| Priority P3 | 1 |

| Scope | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|
| IN-SCOPE | 0 | 0 | 0 | 0 |
| OUT-OF-SCOPE | 1 | 1 | 1 | 3 |

## Resolved in This Pass

- MCAP-001 resolved with deterministic focus parity tests in `packages/ink-compat/src/__tests__/focus.behavior.test.tsx` (IKINV-006).
- MCAP-002 resolved with expanded input normalization vectors in `packages/ink-compat/src/__tests__/input.normalization.test.tsx` (IKINV-005).
- MCAP-003 resolved with stream hook contract tests in `packages/ink-compat/src/__tests__/stream-hooks.contract.test.tsx` (IKINV-007/008).

## MCAP-004: `ink-testing-library` Compatibility Entrypoint

- Capability name: `@rezi-ui/ink-compat/testing` API parity surface for Ink-style component tests.
- Why it matters: consumers using Ink’s testing workflow expect a standard render harness (`lastFrame`, `stdin.write`, rerender/unmount helpers).
- Evidence (Ink permalink + Rezi location):
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#testing>
  - Rezi location: `packages/ink-compat/package.json:17`
- Current behavior: package exports only `.` and does not expose a compatibility testing entrypoint.
- Desired behavior: optional testing entrypoint with stable API for Ink-compatible tests.
- Implementation direction: add `./testing` export and wrapper utilities built on top of the existing adapter render harness.
- Tests to add: API contract tests for `lastFrame()`, stdin simulation, rerender ordering, and cleanup behavior.
- Priority: P1
- Scope: OUT-OF-SCOPE

## MCAP-005: Rezi-Native Backend Execution Mode

- Capability name: backend mode that executes Ink-compatible trees on Rezi core/C-engine runtime instead of upstream Ink renderer.
- Why it matters: enables direct use of Rezi runtime characteristics while preserving the Ink API contract.
- Evidence (Ink permalink + Rezi location):
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/render.ts>
  - Rezi location: `docs/ink-compat/architecture.md:17`
  - Rezi location: `docs/ink-compat/architecture.md:44`
- Current behavior: this pass intentionally delegates render execution to locked upstream Ink runtime.
- Desired behavior: optional Rezi-native execution path with validated parity for Tier-1/Tier-2 APIs.
- Implementation direction: add an alternate render backend adapter and run cross-backend parity tests against the locked baseline.
- Tests to add: matrix suite comparing frame/lifecycle/input behavior between Ink-runtime and Rezi-runtime modes.
- Priority: P2
- Scope: OUT-OF-SCOPE

## MCAP-006: Deep Edge Matrix for `Static` / `Transform` / Focus Interactions

- Capability name: exhaustive edge-case matrix for Tier-2 interactions and ordering semantics.
- Why it matters: current checks validate mainstream behavior; deep interaction paths remain under-specified for long-tail regressions.
- Evidence (Ink permalink + Rezi location):
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#static>
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#transform>
  - Rezi location: `docs/ink-compat/architecture.md:45`
  - Rezi location: `packages/ink-compat/src/__tests__/render.golden.test.tsx:158`
- Current behavior: golden tests cover baseline `Static` accumulation and `Transform` output, without deep cross-feature stress cases.
- Desired behavior: deterministic matrix for transform-dimension stability, static append ordering under rerender pressure, and focus interactions.
- Implementation direction: build scenario matrix fixtures with controlled rerender cadence and assert exact frame histories.
- Tests to add: deep matrix integration tests spanning static appends, transform chains, and focus movement.
- Priority: P3
- Scope: OUT-OF-SCOPE
