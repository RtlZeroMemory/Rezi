# Testing

Run the full test suite:

```bash
npm test
```

The repo uses:

- unit tests for pure modules
- golden tests for drawlists/layout/routing where byte-level stability matters
- fuzz-lite tests for binary parsers (bounded, never-throw)

Related CI gates:

- [Perf Regressions](./perf-regressions.md)
- [Repro Replay](./repro-replay.md)

## Renderer correctness audit (baseline lock)

Baseline lock fields template:

```yaml
timestamp_utc: <YYYY-MM-DDTHH:MM:SSZ>
head: <git-commit-sha>
branch: <git-branch>
node: <node -v>
npm: <npm -v>
baseline_test_count: <integer>
```

Current lock:

```yaml
timestamp_utc: 2026-02-18T11:07:15Z
head: a441bba78ddc99ece4eb76965ce36c0aec9225fe
branch: renderer-correctness-audit
node: v20.19.5
npm: 10.8.2
baseline_test_count: 2488
```

Audited areas:

- clip
- border
- text
- damage
- scrollbar

Bug-fix summary and rationale:

- `packages/core/src/renderer/renderToDrawlist/widgets/containers.ts`: fixed `overflow: "visible"` behavior for `row`/`column`/`grid`/`box` containers so they inherit the parent clip instead of always creating a local content clip. This prevents visible overflow from being incorrectly treated as hidden overflow.

New deterministic test suites inventory:

- `packages/core/src/renderer/__tests__/renderer.clip.test.ts` (18 tests)
- `packages/core/src/renderer/__tests__/renderer.border.test.ts` (45 tests)
- `packages/core/src/renderer/__tests__/renderer.text.test.ts` (28 tests)
- `packages/core/src/renderer/__tests__/renderer.damage.test.ts` (17 tests)
- `packages/core/src/renderer/__tests__/renderer.scrollbar.test.ts` (24 tests)

Total new deterministic tests in these suites: 132.
