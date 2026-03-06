# Testing

This guide is the entry point for testing Rezi apps and framework changes.

## Quick start

Run the deterministic suite:

```bash
npm test
```

Run package tests only:

```bash
npm run test:packages
```

Run script tests only:

```bash
npm run test:scripts
```

Filter to a subset:

```bash
node scripts/run-tests.mjs --filter "layout"
```

`--filter` matches a literal substring in the discovered relative test file
paths.

## What to test

- Unit behavior for pure helpers and validators.
- Integration behavior for rendering, routing, and event flow.
- Regression coverage for bugs (repro test first, then fix).
- Snapshot/visual stability for renderer-facing changes.
- Responsive behavior validation across multiple viewport sizes (`**/*.test.{ts,tsx,js,jsx}`).

## Renderer and widget tests

For high-level widget assertions, prefer `createTestRenderer()` so tests can use:

- `findById(...)`
- `findAll(...)`
- `findText(...)`
- `toText()`

## Snapshot workflow

Use the snapshot CLI:

```bash
node scripts/rezi-snap.mjs --verify
node scripts/rezi-snap.mjs --update
```

## UI regression validation

For layout/theme/render regressions, include a live PTY run with frame-audit evidence:

- [Live PTY UI Testing and Frame Audit Runbook](../dev/live-pty-debugging.md)

## Related

- [Hooks Reference](hooks-reference.md)
- [Debugging](debugging.md)
- [Dev Testing Deep Dive](../dev/testing.md)
- [Testkit Package](../packages/testkit.md)
