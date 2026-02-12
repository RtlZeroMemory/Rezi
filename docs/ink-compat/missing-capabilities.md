# Ink-Compat Missing Capabilities

## Summary

| Metric | Value |
|---|---:|
| Total missing capabilities | 6 |
| IN-SCOPE | 3 |
| OUT-OF-SCOPE | 3 |
| Priority P1 | 3 |
| Priority P2 | 2 |
| Priority P3 | 1 |

| Scope | P1 | P2 | P3 | Total |
|---|---:|---:|---:|---:|
| IN-SCOPE | 2 | 1 | 0 | 3 |
| OUT-OF-SCOPE | 1 | 1 | 1 | 3 |

## MCAP-001: Deterministic Focus Hook Parity Suite

- Capability name: deterministic parity coverage for `useFocus` / `useFocusManager` behaviors.
- Why it matters: IKINV-006 requires stable tab order, manual focus transitions, and focus enable/disable behavior.
- Evidence (Ink permalink + Rezi location):
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usefocusoptions>
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usefocusmanager>
  - Rezi location: `packages/ink-compat/src/index.ts:14`
  - Rezi location: `docs/ink-compat/parity-matrix.md:20`
- Current behavior: focus hooks are exported and delegated directly to Ink, but there are no adapter-level deterministic focus tests in `packages/ink-compat/src/__tests__/`.
- Desired behavior: focused-state transitions are locked by deterministic tests for `focusNext`, `focusPrevious`, `focus(id)`, and enable/disable flows.
- Implementation direction: add focus probe fixtures with multiple focusable nodes, drive tab/input transitions, assert exact focused-id progression.
- Tests to add: `focus.behavior.test.tsx` with tab-cycle, manual focus, and disabled-focus cases.
- Priority: P1
- Scope: IN-SCOPE

## MCAP-002: Extended Input Normalization Vectors

- Capability name: coverage for non-mainstream key vectors in normalized `useInput` payloads.
- Why it matters: IKINV-005 depends on deterministic key payloads beyond the currently-tested arrow/enter/escape/tab/backspace/Ctrl+C set.
- Evidence (Ink permalink + Rezi location):
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#useinputinputhandler-options>
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/src/hooks/use-input.ts>
  - Rezi location: `packages/ink-compat/src/keyNormalization.ts:39`
  - Rezi location: `packages/ink-compat/src/__tests__/input.normalization.test.tsx:58`
- Current behavior: normalization includes fields such as `pageUp`, `pageDown`, `home`, `end`, `meta`, `super`, `hyper`, `capsLock`, `numLock`, but deterministic tests cover only a subset.
- Desired behavior: deterministic regression coverage for additional key sequences/flags and malformed payload coercion paths.
- Implementation direction: extend the stdin-sequence harness and add targeted synthetic key-object tests for less-common flags.
- Tests to add: cases for `pageUp/pageDown/home/end/meta` plus malformed mixed-type key objects.
- Priority: P1
- Scope: IN-SCOPE

## MCAP-003: Stream Hook Contract Coverage (`useStdout` / `useStderr`)

- Capability name: deterministic verification of stream hook contracts for stdout/stderr surfaces.
- Why it matters: IKINV-007/008 includes stream-target correctness and cleanup safety; current tests heavily target `useStdin` behavior.
- Evidence (Ink permalink + Rezi location):
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestdout>
  - Ink permalink: <https://github.com/vadimdemedes/ink/blob/135cb23ae3b7ca94918b1cd913682f6356f12c5c/readme.md#usestderr>
  - Rezi location: `packages/ink-compat/src/index.ts:14`
  - Rezi location: `packages/ink-compat/src/__tests__/non-tty-and-negative.test.tsx:44`
- Current behavior: stream hooks are pass-through exports; adapter tests verify `useStdin` non-TTY/raw-mode paths but do not explicitly lock `useStdout`/`useStderr` write and stream-identity behavior.
- Desired behavior: deterministic parity tests confirm hook-returned streams and writes route to configured stdout/stderr consistently.
- Implementation direction: add test probes that call `useStdout().write` and `useStderr().write` against memory streams in both TTY and non-TTY modes.
- Tests to add: stdout/stderr write routing, configured stream identity, and cleanup/unmount safety checks.
- Priority: P2
- Scope: IN-SCOPE

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
