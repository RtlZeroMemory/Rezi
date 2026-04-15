# Testing Policy

This document is the canonical testing policy for Rezi framework changes.

Use it when you:
- add or change widget behavior
- change routing, focus, layout, rendering, or terminal integration
- rewrite or remove existing tests
- review whether a test actually proves the behavior it claims to prove

This document is normative.
`AGENTS.md`, `CONTRIBUTING.md`, and other testing entry points summarize it or
link back here.

## Core Rule

Tests in Rezi must assert expected behavior, not current implementation shape.

A test is only useful if it makes a clear claim about what Rezi should do.
A test is weak if it only freezes what the current code happens to do.

Examples of good claims:
- an input gains focus when clicked
- a modal blocks background interaction and restores focus on close
- a virtual list keeps the visible viewport stable across resizes
- a parser rejects malformed input with a structured error

Examples of weak claims:
- a cache object keeps the same identity
- hook cell order stayed the same
- a private method was called in the same sequence
- a snapshot still matches even though the intended behavior is unclear

## Testing Principles

Every new or rewritten test should follow these rules.

### Behavior-first

State the behavior under test in terms of an observable outcome.

Good:
- selected item moves to the next enabled option
- blur happens when focus leaves the widget
- terminal-visible output changes after a theme switch

Weak:
- internal focus bookkeeping matches the current implementation
- a private structure contains the same fields in the same order

### Deterministic and Reviewable

Tests must be deterministic enough for review and CI.
Avoid timing-dependent assertions, environment-dependent randomness, and opaque
large snapshots that reviewers cannot evaluate.

### Honest About Specification Gaps

If a behavior is under-specified, do not invent a strict oracle just to make a
coverage claim.
Leave the gap explicit and tighten the contract first.

### Fix Valid Failures, Do Not Weaken Them

If a behavior-first test is valid and fails, the default response is to fix the
implementation.
Do not weaken the expectation to keep the code unchanged.

Valid failing tests may expose one of these cases:
- product bug
- under-specified contract
- incorrect test oracle
- harness defect
- environment limitation

The test should only be relaxed when the expected behavior was not actually
supported by repo evidence.

## Contract Evidence

A behavior expectation must be backed by concrete repo evidence.

Strong evidence:
- public API and types
- canonical docs
- examples or templates when they are clearly intentional and stable
- existing stable contract tests
- issue or PR intent when it is specific enough to define behavior

Evidence that is not strong enough by itself:
- incidental current behavior
- implementation structure
- convenience snapshots with unclear intent
- a helper returning a certain shape because that is how it happens to work now

When writing or reviewing a test, ask:
- what behavior is promised?
- where is that promise stated or implied strongly enough to rely on it?
- what observable outcome proves that promise?

## Fidelity Ladder

Use the lowest fidelity that can prove the contract, but no lower.

### 1. Unit or Lower-level Contract Tests

Use these for:
- pure helpers
- parsers and encoders
- invariant checks
- binary protocol contracts
- lower-level state machines where the lower-level contract itself matters

These tests should protect the real lower-level contract, not private incidental
structure.

### 2. Semantic Scenario Tests

Use semantic tests when the behavior is best proven at the app or widget level,
but a real terminal is not required.

Good targets:
- focus movement
- action dispatch
- selection changes
- route transitions
- modal blocking at the semantic layer
- resize and interaction rules where text-mode semantic output is sufficient

Important:
- semantic helpers are not the final truth for terminal-visible behavior
- `createTestRenderer()` is a semantic convenience helper, not the final oracle
  for terminal correctness

### 3. Replay Scenario Tests

Use replay tests when the scenario model and event flow matter but a PTY is not
required.

Good targets:
- deterministic event replays
- scenario-level contract evaluation
- event ordering behavior that is stronger than a pure unit test but does not
  require terminal-real evidence

### 4. Terminal-real PTY Tests

Use PTY tests when the contract depends on actual terminal behavior and a
headless semantic assertion is not enough.

Good targets:
- terminal-visible rendering or damage behavior
- overlay, focus, and input interactions that depend on terminal integration
- capability-dependent behavior
- terminal byte-stream recovery behavior
- worker/native/backend integration where the visible outcome matters

## When PTY Coverage Is Mandatory

PTY or equivalent terminal-real validation is required when the behavior depends
on the real terminal path in a way that semantic or replay testing cannot prove
safely.

This includes cases such as:
- terminal-visible rendering and redraw behavior
- focus, overlay, or cursor interactions whose correctness depends on the real
  backend path
- capability-driven behavior such as mouse, focus events, bracketed paste, or
  clipboard support
- malformed or partial terminal input where byte-stream recovery matters
- worker/native/backend behavior where the user-visible result is the contract

For UI regressions and terminal integration work, use the live PTY runbook:
- [Live PTY UI Testing and Frame Audit Runbook](live-pty-debugging.md)

## Failure and Degraded-capability Coverage

Where the contract is affected by missing terminal capabilities or by failure
paths, tests must cover those paths explicitly.

Examples:
- `supportsMouse = false`
- `supportsFocusEvents = false`
- bracketed paste boundaries and incomplete paste recovery
- malformed or incomplete escape sequences
- resize storms
- backend or native failure paths when the contract depends on safe recovery or
  structured failure handling

Do not add speculative failure assertions when the user-visible fallback is not
actually specified.
If the fallback is under-specified, document the gap and avoid over-claiming.

## Acceptable and Unacceptable Oracles

### Usually acceptable

These generally prove real behavior:
- visible text or screen regions
- selected value or selected item state
- focus transitions
- callback or action outcomes
- route transitions
- modal blocking and focus restoration
- scroll behavior and visible viewport changes
- structured failure results
- byte-level protocol output, but only when the protocol itself is the contract

### Usually unacceptable unless they protect a justified lower-level contract

These are weak by default:
- cache identity
- hook cell order
- slot bookkeeping
- private method call order
- incidental object shape
- snapshots that freeze current behavior without a declared contract

A weak oracle is acceptable only when you can explain the actual lower-level
contract it protects.

## Existing Test Migration Rules

When you touch existing coverage, classify the tests honestly.

### Keep

Keep a test when it still protects a meaningful contract at the right level.

### Rewrite

Rewrite a test when the behavior matters but the current oracle is too tied to
implementation details.

### Promote

Promote a test to a higher fidelity when the current layer is too weak to prove
the user-visible contract.

Examples:
- semantic-only coverage that should move to PTY
- lower-level contract coverage that needs an app-level behavior assertion too

### Remove or Merge

Remove or merge a test only when:
- it is redundant or invalid
- stronger coverage now exists
- it no longer protects a distinct lower-level contract

Do not keep weak tests just because they already exist.
Do not remove lower-level tests that still protect a real lower-level contract.

## New Test Requirements

Every new or rewritten behavioral test should make these points clear in the
code or surrounding review context:
- the behavior under test
- the contract source
- the chosen fidelity
- degraded-capability or failure-path expectations when relevant

This does not require boilerplate comments on every test.
It does require that the behavior and its basis are obvious to reviewers.

## Bug-regression Tests

A regression test must pin the intended behavior.

Do this:
- write the behavior that should hold
- keep the regression scope narrow and reviewable
- fix the implementation if the expectation is valid

Do not do this:
- snapshot the bug as the new baseline
- replace a clear behavioral expectation with a weaker incidental assertion
- write a regression test that only proves the bug still exists

## Scope Honesty

Do not claim a widget family or subsystem is fully covered unless the coverage
can be defended against the contract and the relevant state transitions.

If behavior is under-specified, say so.
If a harness cannot currently prove the behavior correctly, say so.
If a broader redesign is required, say so.

Rezi values honest boundaries over inflated coverage claims.

## Practical Repo Guidance

### Running tests

Full deterministic suite:

```bash
npm test
```

Package tests only:

```bash
npm run test:packages
```

Script tests only:

```bash
npm run test:scripts
```

End-to-end tests:

```bash
npm run test:e2e
npm run test:e2e:reduced
```

Individual compiled test file:

```bash
npm run build && node --test packages/core/dist/path/to/test.js
```

### Common helpers and where they fit

`createTestRenderer()`
: Use for semantic rendering and layout assertions. Do not treat it as the
  final oracle for terminal-real behavior.

`TestEventBuilder`
: Use to build readable deterministic event sequences instead of hand-encoding
  batches.

`matchesSnapshot(...)`
: Use for stable text snapshots when the snapshot encodes a declared contract.
  Do not use snapshots as a substitute for identifying the behavior under test.

Shared scenario runners in `@rezi-ui/core/testing` and `@rezi-ui/node/testing`
: Use these when scenario-level semantic, replay, or PTY execution is the right
  fidelity for the contract.

### Drawlist codegen guardrail

When changing drawlist command layout for v1, regenerate and verify writers:

```bash
npm run codegen
npm run codegen:check
```

`codegen:check` fails if generated writers are out of sync with the drawlist
spec.

## Review Checklist

When reviewing a test change, check these questions first:
- what behavior is being asserted?
- what repo evidence supports that expectation?
- is the chosen fidelity strong enough?
- should degraded-capability or failure behavior also be covered?
- is the oracle observable, or is it implementation-shaped?
- if an old test remains, what contract does it still protect?

## Related Documents

- [Live PTY UI Testing and Frame Audit Runbook](live-pty-debugging.md)
- [Guide: Testing Rezi Apps](../guide/testing.md)
- [Contributing](contributing.md)
- [Agent Workflow Guide](https://github.com/RtlZeroMemory/Rezi/blob/main/AGENTS.md)
