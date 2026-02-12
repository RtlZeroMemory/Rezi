# Ink-Compat Invariants

## IKINV-001 Lifecycle Ordering
`render()` initializes exactly once per instance, `rerender()` updates in order, and `unmount()/exit()` finalize exactly once with deterministic `waitUntilExit()` behavior.

## IKINV-002 Atomic Failure (No Partial Mutation)
If a render/update path throws, the public instance remains in a coherent prior state; no partial lifecycle transitions are externally observable.

## IKINV-003 Style Precedence Determinism
Style resolution for `color`, `backgroundColor`, `bold`, `dim`, and `underline` must be deterministic and stable across rerenders.

## IKINV-004 Text Behavior Determinism
`Text`, `Newline`, and inline text composition produce deterministic output frames for identical trees and options.

## IKINV-005 Input Delivery Determinism
Normalized input callback payload (`input`, `key`) is deterministic for mapped mainstream keys: arrows, enter, escape, tab, backspace, ctrl/meta combinations including ctrl+c.

## IKINV-006 Focus Transition Determinism
Focus hook behavior (`useFocus`, `useFocusManager`) preserves deterministic next/previous/manual transitions and stable activation/deactivation effects.

## IKINV-007 Stream Target + Cleanup Correctness
Writes and lifecycle cleanup target configured `stdout/stderr/stdin`; cleanup/unmount must release listeners and avoid stream leakage.

## IKINV-008 Non-TTY Deterministic Fallback
When output/input streams are non-TTY, behavior remains deterministic with safe fallback semantics (no raw-mode assumptions, stable frame output behavior).

## IKINV-009 Exported API/Type Stability
Public exports and TypeScript surface for Tier-1/Tier-2 APIs remain stable and intentionally versioned.
