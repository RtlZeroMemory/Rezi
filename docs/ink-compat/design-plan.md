# Ink-Compat Design Plan (Mainstream-First)

## Strategy
Implement a thin compatibility adapter on locked Ink baseline, then harden with deterministic tests and invariants. This delivers a usable Tier-1 result quickly without reintroducing legacy code.

## Work Plan
1. Package scaffold
- Create `packages/ink-compat` workspace package from scratch.
- Define exports/types for Tier-1 (+ Tier-2 where feasible).
- Invariants: IKINV-009.

2. Render lifecycle adapter
- Implement `render()` wrapper returning `rerender/unmount/waitUntilExit/clear/cleanup`.
- Preserve deterministic behavior and idempotent cleanup.
- Invariants: IKINV-001, IKINV-002, IKINV-007, IKINV-008.

3. Component/hook surface
- Export Box/Text/Newline/Spacer and mainstream hooks.
- Include Tier-2 exports (`Static`, `Transform`, `useFocus`, `useFocusManager`) if pass-through is stable.
- Invariants: IKINV-003, IKINV-004, IKINV-005, IKINV-006, IKINV-009.

4. Stream-hook contract (explicit)
- Export and verify `useStdin`, `useStdout`, and `useStderr` behavior against locked baseline.
- Add deterministic cleanup checks for stream/listener/raw-mode safety.
- Invariants: IKINV-007, IKINV-008, IKINV-009.

5. Input normalization
- Wrap `useInput` and normalize mainstream keys (`arrows`, `return`, `escape`, `tab`, `backspace`, `ctrl+c`, `meta`).
- Invariants: IKINV-005.

6. Deterministic parity harness
- Add >=30 deterministic scenarios across Tier-1.
- Include golden output, lifecycle, input normalization, non-TTY, and negative tests.
- Invariants: IKINV-001..IKINV-009.

7. Gap documentation
- Publish missing/deferred capabilities with evidence + implementation direction.
- Invariants tracked per item.

## Defer Rules
- Tier-2: implement if no ABI/runtime expansion needed.
- Tier-3: defer by default; document with issue stubs and acceptance criteria.
