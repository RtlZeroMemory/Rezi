# Ink-Compat Audit Consensus

## Subsystem 1..11 Consensus Sets

| Subsystem | Confirmed issues | Rejected candidates | Consensus achieved |
|---|---|---|---|
| 1. Public API export surface | MCAP-004 (`testing` entrypoint missing). | “Tier-1 exports are missing” rejected via `packages/ink-compat/src/index.ts:1`. | YES |
| 2. Render lifecycle wrapper | No new open issue in this pass. | “`waitUntilExit` not wired” rejected via `packages/ink-compat/src/render.ts:258` and `packages/ink-compat/src/__tests__/lifecycle.behavior.test.tsx:21`. | YES |
| 3. Cleanup and clear semantics | Historical IKINV-008 cluster fixed; no current regression found. | “Non-TTY `clear()` still throws” rejected via `packages/ink-compat/src/render.ts:259` and `packages/ink-compat/src/__tests__/lifecycle.behavior.test.tsx:96`. | YES |
| 4. Text/style primitive behavior | No new open issue in this pass. | “Dim alias is ignored” rejected via `packages/ink-compat/src/components.tsx:28` and `packages/ink-compat/src/__tests__/render.golden.test.tsx:136`. | YES |
| 5. Input normalization semantics | MCAP-002 (extended vectors not yet covered). | “Ctrl+C normalization still mismatched” rejected via `packages/ink-compat/src/keyNormalization.ts:65` and `packages/ink-compat/src/__tests__/input.normalization.test.tsx:108`. | NO |
| 6. Stream hook contract | MCAP-003 (`useStdout`/`useStderr` parity probes missing). | “Unsupported raw mode should silently no-op” rejected; upstream-consistent throw validated in `packages/ink-compat/src/__tests__/non-tty-and-negative.test.tsx:61`. | NO |
| 7. Focus subsystem | MCAP-001 (deterministic focus parity suite missing). | “Focus hooks not exported” rejected via `packages/ink-compat/src/index.ts:14`. | NO |
| 8. Tier-2 `Static` / `Transform` behavior | MCAP-006 (deep edge matrix deferred). | “Static append baseline broken” rejected via `packages/ink-compat/src/__tests__/render.golden.test.tsx:171`. | YES |
| 9. Package scripts and workspace execution | Historical packaging gap fixed in this finalization pass (`build`/`test` scripts now defined). | “Workspace build/test cannot target package directly” rejected via `packages/ink-compat/package.json:16`. | YES |
| 10. Gap documentation and issue hygiene | Missing-capability ledger + out-of-scope issue stubs added in this pass. | “No documented defer path” rejected via `docs/ink-compat/missing-capabilities.md:1`. | YES |
| 11. Runtime backend strategy | MCAP-005 (Rezi-native execution mode deferred). | “Current pass already runs on Rezi native runtime” rejected via `docs/ink-compat/architecture.md:17`. | YES |

## Historical Fixed Clusters

### Cluster A: IKINV-005 (Input delivery determinism)

- Status: FIXED (historical cluster), with one remaining coverage-extension item (MCAP-002).
- Historical issues in the cluster:
  - Ctrl+C normalization mismatch and key event filtering behavior.
- Evidence:
  - Changelog entry for fixes: `CHANGELOG.md:26`.
  - Normalization logic + helper: `packages/ink-compat/src/keyNormalization.ts:32` and `packages/ink-compat/src/keyNormalization.ts:65`.
  - Deterministic coverage of mainstream key paths: `packages/ink-compat/src/__tests__/input.normalization.test.tsx:58`.
- Consensus note: the historical regression cluster is closed; only expanded-vector hardening remains open.

### Cluster B: IKINV-008 (Non-TTY deterministic fallback)

- Status: FIXED (historical cluster).
- Historical issues in the cluster:
  - Non-TTY `clear()` throw behavior and non-raw stdin path safety concerns.
- Evidence:
  - Clear guard for non-TTY outputs: `packages/ink-compat/src/render.ts:245`.
  - Deterministic clear and non-TTY behavior tests: `packages/ink-compat/src/__tests__/non-tty-and-negative.test.tsx:32` and `packages/ink-compat/src/__tests__/lifecycle.behavior.test.tsx:96`.
  - Non-raw-mode behavior probe: `packages/ink-compat/src/__tests__/non-tty-and-negative.test.tsx:44`.
  - Historical related fix note: `CHANGELOG.md:26`.
- Consensus note: cluster accepted as resolved for this pass.
