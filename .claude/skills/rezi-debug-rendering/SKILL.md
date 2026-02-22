---
name: rezi-debug-rendering
description: Debug rendering and layout issues in Rezi apps. Use when UI looks wrong, has layout problems, or renders unexpectedly.
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash(REZI_PERF=1 *)
argument-hint: "[symptom-description]"
metadata:
  short-description: Debug rendering
---

## When to use

Use this skill when:

- UI does not look right or has layout problems
- Widgets overlap, disappear, or have wrong dimensions
- Unexpected re-renders or flicker
- Performance issues during rendering

## Source of truth

- `packages/core/src/app/widgetRenderer.ts` — full render pipeline
- `packages/core/src/app/__tests__/widgetRenderer.transition.test.ts` — transition behavior expectations
- `packages/core/src/runtime/commit.ts` — VNode → RuntimeInstance tree
- `packages/core/src/layout/` — layout engine
- `packages/core/src/renderer/renderToDrawlist/` — draw operations
- `packages/core/src/widgets/composition.ts` — animation hook implementations
- `packages/core/src/ui/` — design tokens, recipes, and capability tiers

## Debugging steps

1. **Enable profiling**:
   ```bash
   REZI_PERF=1 REZI_PERF_DETAIL=1 node your-app.js
   ```

2. **Check VNode tree structure** — ensure no missing children or null nodes

3. **Check widget IDs** — must be unique across the entire tree. Duplicate IDs cause unpredictable behavior

4. **Check nesting depth**:
   - Warning at 200 levels
   - Fatal at 500 levels
   - Flatten unnecessary wrapper nodes

5. **Check `key` props** on list items — missing keys cause full re-render and lost state

6. **Inspect with test renderer**:
   ```typescript
   const r = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
   const result = r.render(myView(state));
   console.log(result.toText());  // see actual output
   result.findById("my-widget");  // locate specific nodes
   ```

7. **Review layout props**: `width`, `height`, `flex`, `p`, `gap`, `align`

8. **If animation is involved**, verify:
   - `ui.box` uses `transition` with expected `properties` (`position`, `size`, `opacity`)
   - `properties: []` is not accidentally disabling tracks
   - `opacity` stays within `[0..1]`
   - animation hooks are not conditionally called

## Common causes

| Symptom | Likely cause |
|---------|-------------|
| Widget not visible | Missing from VNode tree, or zero width/height |
| Overlapping widgets | Wrong container type (use `column`/`row` not `box`) |
| Content truncated | Fixed width too small, missing `flex` |
| Flicker/full re-render | Missing `key` on list items |
| Transition not animating | `transition` missing, wrong `properties`, or no actual value delta |
| Opacity animation looks wrong | `opacity` outside `[0..1]` (clamped) or `properties` excludes `opacity` |
| Crash on deep tree | Nesting depth > 500 |
| DS styling not applied | `dsVariant` prop missing, or theme was not created from `ThemeDefinition` |
