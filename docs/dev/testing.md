# Testing

Rezi uses the built-in `node:test` runner via a deterministic test discovery
script. The test suite currently contains **873+ tests** across multiple
categories.

## Running Tests

### Full Suite

```bash
npm test
```

This executes `node scripts/run-tests.mjs`, which deterministically discovers
and runs all test files. Discovery is based on sorted directory walks -- no shell
globs or non-deterministic ordering.

### Scoped Runs

Run only package tests (compiled `.test.js` files under `packages/*/dist/`):

```bash
npm run test:packages
```

Run only script tests (`.test.mjs` files under `scripts/__tests__/`):

```bash
npm run test:scripts
```

### Individual Test Files

Run a single test file directly with Node's test runner:

```bash
node --test packages/core/dist/runtime/__tests__/reconcile.keyed.test.js
```

Note that tests run against compiled output in `dist/`, so you must build first:

```bash
npm run build && node --test packages/core/dist/path/to/test.js
```

### Drawlist codegen guardrail

When changing drawlist command layout for v3/v4/v5, regenerate and verify writers:

```bash
npm run codegen
npm run codegen:check
```

`codegen:check` is enforced in CI and fails if
`packages/core/src/drawlist/writers.gen.ts` is out of sync with
`scripts/drawlist-spec.ts`.

### End-to-End Tests

```bash
npm run test:e2e

# Reduced profile (fewer scenarios, faster)
npm run test:e2e:reduced
```

## Test Categories

### Unit Tests

Standard unit tests for pure functions and isolated modules. These make up the
majority of the test suite and cover:

- Layout calculations
- Text measurement
- Theme resolution
- Keybinding matching
- State machine transitions
- Update queue ordering

### Golden Tests (ZRDL/ZREV Fixtures)

Golden tests compare binary output byte-for-byte against committed fixture
files. They are used where **byte-level stability** matters:

- **ZRDL fixtures** -- Drawlist output. The renderer produces a ZRDL binary
  drawlist for a given widget tree, and the test asserts it matches a committed
  `.zrdl` fixture file exactly.
- **ZREV fixtures** -- Event batch parsing. A committed `.zrev` binary is
  parsed, and the result is compared against expected structured output.

Golden tests catch unintentional changes to the binary protocol. When a
legitimate protocol change is made, the fixtures must be regenerated and
committed alongside the code change.

### Fuzz-Lite Tests (Property-Based)

Bounded property-based tests for binary parsers and encoders. These tests
generate random inputs within defined bounds and verify invariants:

- Parsers never throw (they return `ParseResult`).
- Round-trip encoding/decoding produces the original value.
- Out-of-bounds inputs produce structured error results, not crashes.

Fuzz-lite tests are fast (bounded iteration count) and run as part of the
normal test suite -- they do not require external fuzzing infrastructure.

### Integration Tests

End-to-end tests that exercise the full rendering pipeline from state through
view function to drawlist output. These tests use the `@rezi-ui/testkit`
headless backend to run without a real terminal.

Integration tests cover:

- Full app lifecycle (create, render, update, destroy)
- Widget interaction sequences (focus, input, navigation)
- Routing and navigation
- Resize and reflow behavior

### Hot State-Preserving Reload (HSR) Tests

When changing `app.replaceView(...)`, `app.replaceRoutes(...)`, `createNodeApp({ hotReload })`, or `createHotStateReload(...)`, include:

- successful runtime widget-view swap test (`replaceView` while `Running`)
- successful runtime route-table swap test (`replaceRoutes` while `Running` in route mode)
- preservation test for local widget state/focus/cursor with stable ids/keys
- failure-path test proving previous view/routes remain active after reload import errors
- mode guard tests (raw mode and incompatible API usage)

### Code Editor Syntax Tokenizer Tests

When changing `syntaxLanguage`, tokenizer exports, or code-editor token paint behavior, include:

- preset coverage for mainstream language tokenization (`typescript`, `javascript`, `json`, `go`, `rust`, `c`, `cpp`/`c++`, `csharp`/`c#`, `java`, `python`, `bash`)
- fallback coverage for unsupported languages (`plain`)
- custom-tokenizer override coverage (`tokenizeLine` and `tokenizeCodeEditorLineWithCustom(...)`)
- renderer integration coverage proving tokens and active cursor-cell highlighting render together safely

Quick scoped run:

```bash
node scripts/run-tests.mjs --filter "codeEditor.syntax"
```

### Manual HSR + GIF Workflow

Use the built-in demos under `scripts/hsr/`:

```bash
npm run hsr:demo:widget
npm run hsr:demo:router
```

Preferred widget-demo quit keys: `F10` / `Alt+Q` / `Ctrl+C` / `Ctrl+X`.

Live-edit these files while each demo is running:

- widget demo: `scripts/hsr/widget-view.mjs`
- router demo: `scripts/hsr/router-routes.mjs`

Widget demo shortcut:

- the in-app `self-edit-code` editor is focused on startup and shows the TypeScript snippet used for the title banner
- edit `SELF_EDIT_BANNER = "..."` and save with `F6` (fallback: `Ctrl+O`, then `Ctrl+S`; `Enter` works on the save button) to rewrite `widget-view.mjs` from inside the demo
- save/reload status appears in a modal overlay to avoid log noise in the capture surface
- the banner text in the header is sourced from `widget-view.mjs` `SELF_EDIT_BANNER`, so successful HSR swaps are visually obvious
- if your terminal uses XON/XOFF flow control, prefer `F6`/`Ctrl+O` because `Ctrl+S` may be swallowed by the terminal

One-command recording:

```bash
npm run hsr:record:widget
npm run hsr:record:router
```

`hsr:record:*` uses manual capture by default so you can type/edit freely during recording.

Use scripted mode for deterministic multi-scene showcase captures:

```bash
npm run hsr:record:widget:auto
node scripts/record-hsr-gif.mjs --mode widget --scripted
node scripts/record-hsr-gif.mjs --mode widget --scripted --scene-text "My custom headline"
```

The recorder writes an asciinema cast and attempts GIF conversion via `agg` (or
`asciinema gif` when available).

### High-level Widget Rendering Tests

For widget-level tests, prefer `createTestRenderer()` from `@rezi-ui/core` so
tests do not need manual `commitVNodeTree() -> layout() -> renderToDrawlist()`
setup:

```typescript
import { createTestRenderer, ui } from "@rezi-ui/core";

const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
const frame = renderer.render(
  ui.column({}, [
    ui.text("Hello"),
    ui.button({ id: "submit", label: "Submit" }),
  ]),
);

frame.findText("Hello");
frame.findById("submit");
frame.findAll("button");
```

`frame.toText()` returns a deterministic text snapshot of the rendered screen.

### Fluent Event Simulation

For integration tests that need input batches, use `TestEventBuilder` instead
of hand-encoding ZREV bytes:

```typescript
import { TestEventBuilder } from "@rezi-ui/core";

const events = new TestEventBuilder();
events.pressKey("Enter").type("hello@example.com").click(10, 5).resize(120, 40);

backend.pushBatch(events.buildBatch());
```

This keeps event sequences readable and protocol-safe.

### Text Snapshot Assertions

Use `matchesSnapshot(...)` from `@rezi-ui/testkit` to lock rendered text frames:

```typescript
import { matchesSnapshot } from "@rezi-ui/testkit";

matchesSnapshot(frame.toText(), "my-widget-default");
```

Snapshots are read from:

```
<test-directory>/__snapshots__/my-widget-default.txt
```

Set `UPDATE_SNAPSHOTS=1` when intentionally updating snapshot outputs.

### Stress Tests

Tests designed to exercise the system under extreme conditions:

- Deep widget trees (hundreds of nesting levels)
- Wide widget trees (thousands of siblings)
- Rapid state update sequences
- Large text content

Stress tests verify that the runtime does not crash, exceed memory bounds, or
exhibit non-linear performance degradation.

## Animation Regression Suites

Animation behavior has dedicated deterministic suites and should be run for any motion-related change:

- `node --test packages/core/src/widgets/__tests__/composition.animationHooks.test.ts`
- `node --test packages/core/src/app/__tests__/widgetRenderer.transition.test.ts`
- `node --test packages/core/src/runtime/__tests__/commit.fastReuse.regression.test.ts`

These suites cover hook retargeting/timer cleanup, `ui.box` transition property filters (`position`/`size`/`opacity`), and reconciliation fast-reuse correctness with transition props.

## Reconciliation Hardening Matrix

Reconciliation edge-cases are covered by dedicated runtime suites:

- `packages/core/src/runtime/__tests__/reconcile.keyed.test.ts`
- `packages/core/src/runtime/__tests__/reconcile.unkeyed.test.ts`
- `packages/core/src/runtime/__tests__/reconcile.mixed.test.ts`
- `packages/core/src/runtime/__tests__/reconcile.composite.test.ts`
- `packages/core/src/runtime/__tests__/reconcile.deep.test.ts`

These suites lock deterministic behavior for keyed reorder/insert/remove,
unkeyed grow/shrink, mixed keyed+unkeyed slots, `defineWidget` hook/state
persistence, and deep-tree reconciliation.

## Renderer Correctness Audit (Baseline Lock)

The renderer correctness audit maintains a baseline lock to track the known-good
state of renderer tests:

```yaml
timestamp_utc: 2026-02-18T11:07:15Z
head: a441bba78ddc99ece4eb76965ce36c0aec9225fe
branch: renderer-correctness-audit
node: v20.19.5
npm: 10.8.2
baseline_test_count: 2488
```

Audited areas and their dedicated test suites:

| Area       | Test file                                    | Tests |
|------------|----------------------------------------------|-------|
| Clip       | `renderer/__tests__/renderer.clip.test.ts`   | 18    |
| Border     | `renderer/__tests__/renderer.border.test.ts` | 45    |
| Text       | `renderer/__tests__/renderer.text.test.ts`   | 28    |
| Damage     | `renderer/__tests__/renderer.damage.test.ts` | 17    |
| Scrollbar  | `renderer/__tests__/renderer.scrollbar.test.ts` | 24 |
| **Total**  |                                              | **132** |

Notable bug fix captured by the audit: `overflow: "visible"` behavior for
`row`/`column`/`grid`/`box` containers was fixed to inherit the parent clip
instead of always creating a local content clip.

## Test Discovery

The `scripts/run-tests.mjs` script discovers test files deterministically:

1. **Script tests:** Recursively walks `scripts/__tests__/` for `.test.mjs`
   files.
2. **Package tests:** For each package in `packages/*/`, recursively walks
   `dist/` for files matching `**/__tests__/**/*.test.js`.
3. All discovered paths are sorted lexicographically.
4. The combined list is passed to `node --test` as explicit file arguments.

This avoids shell glob non-determinism and ensures consistent test ordering
across platforms.

## Adding New Tests

1. **Create the test file.** Place it in a `__tests__/` directory adjacent to
   the module being tested:

    ```
    packages/core/src/layout/__tests__/myModule.test.ts
    ```

2. **Use `node:test` APIs.** Import `describe`, `it`, and `assert` from
   `node:test` and `node:assert`:

    ```typescript
    import { describe, it } from "node:test";
    import assert from "node:assert/strict";

    describe("myModule", () => {
      it("should compute the correct value", () => {
        assert.strictEqual(myFunction(1, 2), 3);
      });
    });
    ```

3. **Build.** Run `npm run build` so the TypeScript test file is compiled to
   `dist/`.

4. **Run.** Execute the full suite or just your new file:

    ```bash
    npm test
    # or
    node --test packages/core/dist/layout/__tests__/myModule.test.js
    ```

## CI Integration

Tests run automatically on every push and pull request via the `ci.yml` GitHub
Actions workflow. The CI pipeline executes:

1. `guardrails` job: `bash scripts/guardrails.sh`.
2. Install dependencies (`npm ci` on Linux, `npm install` on non-Linux matrix jobs).
3. `npm run lint`.
4. `npm run typecheck`.
5. `npm run build`.
6. `npm run check:core-portability`.
7. `npm run check:unicode` (Linux only).
8. `npm run test`.
9. Native/e2e stages (`npm run build:native`, `npm run test:e2e*`, `npm run test:native:smoke`).

Test failures block pull request merges.

## Related

- [Perf Regressions](./perf-regressions.md)
- [Repro Replay](./repro-replay.md)
- [Build](build.md)
