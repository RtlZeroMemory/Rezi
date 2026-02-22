---
name: rezi-add-widget
description: Add a new widget type to the Rezi framework. Use when creating new ui.* factory functions with layout, rendering, and tests.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(node scripts/run-tests.mjs*)
argument-hint: "[widget-name]"
metadata:
  short-description: Add new widget
---

## Response Format (IMPORTANT)

1. **Confirm the widget name, behavior, and props** before writing code
2. **Follow the steps below in order** — each step depends on the previous
3. **Run tests after implementation** to verify correctness
4. **Keep total response concise** — show key code, not boilerplate

## When to use

Use this skill when:

- Adding a new widget type to `@rezi-ui/core`
- Creating a new `ui.*` factory function
- User asks for a new visual element not covered by existing widgets

## Source of truth

- `packages/core/src/widgets/types.ts` — all widget prop types and VNode union
- `packages/core/src/widgets/ui.ts` — all `ui.*` factory functions
- `packages/core/src/layout/kinds/` — layout handlers by category
- `packages/core/src/renderer/renderToDrawlist/widgets/` — render handlers by category
- `packages/core/src/index.ts` — public exports
- `packages/core/src/ui/` — design tokens, recipes, and capabilities
- `docs/guide/widget-authoring.md` — widget authoring guide with design system integration

## Steps

1. **Add props type** to `packages/core/src/widgets/types.ts`:
   - Use the `Readonly<{...}>` pattern
   - Include `key?: string` if the widget can appear in lists

2. **Add VNode kind** to the `VNode` discriminated union in `types.ts`

3. **Add factory function** to `packages/core/src/widgets/ui.ts`:
   - Add JSDoc with `@example` tag
   - Return a VNode with the correct kind

4. **Add layout handler** in `packages/core/src/layout/kinds/`:
   - `leaf.ts` for non-container widgets
   - `box.ts` / `stack.ts` for containers
   - `collections.ts` for data widgets
   - `overlays.ts` for layered widgets

5. **Add render handler** in `packages/core/src/renderer/renderToDrawlist/widgets/`:
   - `basic.ts`, `containers.ts`, `collections.ts`, `editors.ts`, `overlays.ts`, `navigation.ts`, or `files.ts`

6. **Add design system support** (if the widget is interactive):
   - Add `dsVariant`, `dsTone`, `dsSize` to the widget's props type
   - Add recipe-based rendering in the render handler (check for `dsVariant` presence)
   - See `docs/guide/widget-authoring.md` for the full pattern

7. **Export** both props type and factory from `packages/core/src/index.ts`

8. **Add JSX wrapper** (if needed) in `packages/jsx/src/components.ts`

9. **Write tests** in `packages/core/src/widgets/__tests__/`

10. **Add docs** in `docs/widgets/{widget-name}.md`

## Verification

```bash
node scripts/run-tests.mjs
```

- Widget + props exported from `packages/core/src/index.ts`
- Renders correctly via `createTestRenderer`
- Layout produces expected dimensions
- Widget supports `ds*` props for design-system-based styling (if interactive)
- Widget renders correctly with at least 2 themes
