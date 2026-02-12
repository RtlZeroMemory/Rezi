# Issue Stub: Rezi-Native Backend Mode for Ink-Compat

- Linked capability: MCAP-005
- Scope: OUT-OF-SCOPE (current pass)
- Priority: P2
- Labels: `ink-compat`, `out-of-scope`, `runtime`, `priority:P2`, `needs-rfc`

## Problem

The current adapter intentionally delegates execution to upstream Ink runtime; a Rezi-native execution mode is not available.

## Acceptance Criteria

- Design and implement a backend selector for Ink-runtime vs Rezi-runtime execution.
- Preserve Tier-1 API compatibility (`render`, lifecycle, hooks/components) across modes.
- Add parity tests that compare both modes against locked Ink baseline outcomes.
- Document feature gaps and fallback behavior when mode-specific constraints apply.
- Validate non-TTY and cleanup invariants (IKINV-007/IKINV-008) in both modes.
