---
name: rezi-write-tests
description: Write tests for Rezi widgets, screens, or app logic using createTestRenderer and node:test.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(node scripts/run-tests.mjs*), Bash(node --test *)
argument-hint: "[file-or-widget-to-test]"
metadata:
  short-description: Write tests
---

## When to use

Use this skill when:

- Writing tests for Rezi widgets or components
- Testing app state logic (reducers)
- Testing keybinding resolvers
- Need snapshot-style output assertions

## Source of truth

- `packages/core/src/testing/` — test utilities (`createTestRenderer`, etc.)
- `packages/core/src/widgets/__tests__/` — existing widget tests (use as examples)
- `packages/core/src/widgets/__tests__/composition.animationHooks.test.ts` — animation hook test patterns
- `packages/core/src/app/__tests__/widgetRenderer.transition.test.ts` — `ui.box` transition expectations
- `scripts/run-tests.mjs` — test runner
- `packages/core/src/testing/snapshot.ts` — golden frame snapshot utilities (`captureSnapshot`, `serializeSnapshot`, `diffSnapshots`)
- `scripts/rezi-snap.mjs` — CLI for snapshot capture and verification

## Steps

1. **Create test file** in the appropriate `__tests__/` directory

2. **Use `createTestRenderer()`** for widget/render tests:
   ```typescript
   import { describe, it } from "node:test";
   import * as assert from "node:assert/strict";
   import { createTestRenderer, ui } from "@rezi-ui/core";

   describe("MyWidget", () => {
     it("renders correctly", () => {
       const r = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
       const result = r.render(ui.text("hello"));
       assert.ok(result.findText("hello"));
     });
   });
   ```

3. **Test state logic** by testing reducer functions directly:
   ```typescript
   it("increments count", () => {
     const state = reducer({ count: 0 }, { type: "increment" });
     assert.strictEqual(state.count, 1);
   });
   ```

4. **Use `result.toText()`** for snapshot-style assertions

5. **Use `result.findById()`** to locate specific nodes in the render tree

6. **Use golden frame snapshots** for visual regression:
   ```typescript
   import { captureSnapshot, serializeSnapshot, diffSnapshots, parseSnapshot } from "@rezi-ui/core";

   const snapshot = captureSnapshot("my-scene", myView(state), { viewport: { cols: 80, rows: 24 }, theme }, "dark");
   const text = serializeSnapshot(snapshot);
   // Compare with stored snapshot using diffSnapshots()
   ```

7. **Run snapshot CLI** for bulk capture/verify:
   ```bash
   node scripts/rezi-snap.mjs --update    # Capture new snapshots
   node scripts/rezi-snap.mjs --verify    # Verify against stored
   ```

8. **For animation features**, cover:
   - mount value
   - retarget while running
   - cleanup on unmount (no timer leak)
   - property filtering (`position` / `size` / `opacity`) for `ui.box` transitions

## Running tests

```bash
# Full suite
node scripts/run-tests.mjs

# Single file
node --test path/to/test.ts
```

## Verification

- All new tests pass
- No existing tests broken
- Tests are deterministic (bounded timers/explicit waits, no randomness)
- Golden snapshots match expected output (if applicable)
