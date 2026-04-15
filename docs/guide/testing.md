# Testing

This guide is the entry point for testing Rezi apps.

If you are changing the Rezi framework itself, use the canonical developer
policy instead:
- [Developer Testing Policy](../dev/testing.md)

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

## What to test in an app

Focus on user-visible behavior:
- state changes and action flow
- rendering and layout behavior
- focus and keyboard interaction
- mouse, wheel, and paste behavior when your app supports them
- resize and reflow behavior
- bug regressions

## Choosing the right test level

Use the lowest level that proves the behavior.

- Unit tests for pure helpers and reducers.
- Semantic rendering or scenario tests for app behavior that does not require a real terminal.
- PTY validation for terminal-visible behavior, terminal capability behavior, or terminal input recovery that headless tests cannot prove safely.

`createTestRenderer()` is useful for semantic rendering assertions, but it is
not the final oracle for terminal-real behavior.

## Snapshots

Use snapshots only when the snapshot encodes a clear contract.
Do not use snapshots as a substitute for deciding what behavior the app should
have.

Snapshot CLI:

```bash
node scripts/rezi-snap.mjs --verify
node scripts/rezi-snap.mjs --update
```

## UI regression validation

For layout, theme, rendering, or capability-sensitive regressions, include a
live PTY run with frame-audit evidence:
- [Live PTY UI Testing and Frame Audit Runbook](../dev/live-pty-debugging.md)

## Related

- [Developer Testing Policy](../dev/testing.md)
- [Hooks Reference](hooks-reference.md)
- [Debugging](debugging.md)
- [Testkit Package](../packages/testkit.md)
