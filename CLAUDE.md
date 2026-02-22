# Rezi AI Development Guide

## Project Overview

Rezi is a high-performance TypeScript TUI framework with a native C rendering engine (Zireael).
Monorepo with npm workspaces (NOT pnpm).
Packages: `@rezi-ui/core` (runtime-agnostic framework), `@rezi-ui/node` (Node.js backend), `@rezi-ui/jsx` (JSX transform), `create-rezi` (scaffolding CLI).

## Quick Commands

```bash
npm install                          # Install all workspaces
node scripts/run-tests.mjs           # Run all tests (~900+ tests, node:test)
npx tsx packages/bench/src/...       # Run benchmarks (bypasses tsc)
REZI_PERF=1 REZI_PERF_DETAIL=1      # Enable profiling (env vars, prefix any command)
```

## Project Map

```
packages/core/src/
  app/
    createApp.ts              # createApp() factory, App interface, app.run()/app.stop()
    widgetRenderer.ts         # Render orchestrator, full frame pipeline
  widgets/
    ui.ts                     # ui.* factory functions (60+ widgets) — THE recommended API
    types.ts                  # All widget prop types (VNode discriminated union)
    composition.ts            # defineWidget(), WidgetContext, hooks
    conditionals.ts           # show(), when(), match(), maybe()
    collections.ts            # each(), eachInline() — keyed list rendering
    useTable.ts               # useTable() hook for table state
    useModalStack.ts          # useModalStack() hook for modal state
  runtime/
    commit.ts                 # VNode -> RuntimeInstance reconciliation
    reconcile.ts              # Child matching (keyed/unkeyed diffing)
    instances.ts              # Hook state registry (useState, useEffect, etc.)
    focus.ts                  # Focus traversal and management
  layout/
    layout.ts                 # Public facade (re-exports from engine/)
    engine/layoutEngine.ts    # Constraint-based layout algorithm
    kinds/                    # Per-widget layout implementations (stack, box, grid, leaf, etc.)
  renderer/
    renderToDrawlist.ts       # Public entry for drawlist rendering
    renderToDrawlist/
      renderTree.ts           # Stack-based DFS renderer
  drawlist/
    builder_v1.ts             # ZRDL binary drawlist builder (v1)
    builder_v2.ts             # Drawlist builder v2 (cursor protocol)
    builder_v3.ts             # Drawlist builder v3
  keybindings/
    manager.ts                # Modal keybinding system
    parser.ts                 # Key sequence parsing
  router/
    router.ts                 # Page routing with guards + nested outlets
    helpers.ts                # routerBreadcrumb(), routerTabs()
  forms/
    useForm.ts                # Form management hook
    validation.ts             # Form field validation
    bind.ts                   # Two-way binding helpers
  testing/
    renderer.ts               # createTestRenderer() — full pipeline test helper
    events.ts                 # TestEventBuilder, encodeZrevBatchV1
    snapshot.ts               # Golden frame snapshot system (captureSnapshot, diffSnapshots)
  ui/
    capabilities.ts           # Capability tier detection (A/B/C)
    designTokens.ts           # Typography, elevation, size, variant, tone tokens
    recipes.ts                # Style recipes for all widget families
    index.ts                  # Design system public exports
  __tests__/
    integration/              # Integration test suites (dashboard, form-editor, etc.)
    stress/                   # Fuzzing and stress tests (large trees, rapid events)

packages/node/src/
  backend/
    nodeBackend.ts            # Node.js backend factory (async, worker-based)
    nodeBackendInline.ts      # Inline (sync) backend for simple apps

packages/create-rezi/templates/
  minimal/                    # Bare-minimum counter app
  cli-tool/                   # Multi-screen app with routing
  dashboard/                  # Real-time dashboard with charts
  stress-test/                # Stress/performance testing template
  animation-lab/              # Declarative animation + responsive reactor lab
  (each template follows: main.ts, types.ts, theme.ts, helpers/, screens/)
```

## Architecture — Render Pipeline

```
State -> view(state) -> VNode tree -> commitVNodeTree -> layout -> metadata_collect (when tree/routing/focus changes; otherwise reused) -> renderToDrawlist -> builder.build() -> backend.requestFrame()
```

1. **State**: Application state managed via `app.update()` or `useReducer` pattern.
2. **view(state)**: Pure function returns a VNode tree describing the UI.
3. **VNode tree**: Declarative widget descriptions (discriminated union by `kind`).
4. **commitVNodeTree**: Reconciles new VNodes against previous RuntimeInstance tree (keyed/unkeyed diffing).
5. **layout**: Constraint-based engine computes absolute position/size for every widget.
6. **metadata_collect**: Gathers focus targets, hit-test regions, and accessibility info when needed; layout-only passes can reuse prior metadata.
7. **renderToDrawlist**: Stack-based DFS walks the layout tree, emitting draw operations.
8. **builder.build()**: Serializes draw operations into ZRDL binary format.
9. **backend.requestFrame()**: Sends binary drawlist to the native Zireael renderer.

## Design System

Rezi includes a cohesive design system with tokens, recipes, and capability tiers.
See [docs/design-system.md](docs/design-system.md) for the full specification.

### Key Concepts

- **Tokens**: Semantic color slots (`bg.base`, `fg.primary`, `accent.primary`, etc.) defined per theme
- **Recipes**: `recipe.button()`, `recipe.input()`, etc. — compute styles from tokens
- **Capability Tiers**: A (256-color), B (truecolor), C (enhanced/images)
- **DS Props**: `dsVariant`, `dsTone`, `dsSize` on interactive widgets for recipe-based styling
- **Snapshot Testing**: `captureSnapshot()` + `rezi-snap` CLI for visual regression

### Design System Buttons

```typescript
// Design-system-styled button
ui.button({ id: "save", label: "Save", dsVariant: "solid", dsTone: "primary", dsSize: "md" })
ui.button({ id: "cancel", label: "Cancel", dsVariant: "ghost" })
ui.button({ id: "delete", label: "Delete", dsVariant: "outline", dsTone: "danger" })
```

### Widget Gallery

```bash
npx tsx examples/gallery/src/index.ts          # Interactive
npx tsx examples/gallery/src/index.ts --headless  # Headless CI
node scripts/rezi-snap.mjs --update            # Update snapshots
node scripts/rezi-snap.mjs --verify            # Verify snapshots
```

## API Layers (safest to lowest-level)

### Layer 1 — Widget API (ALWAYS prefer this)

```typescript
import { ui, createApp } from "@rezi-ui/core";

const view = (state: AppState) =>
  ui.column({ gap: 1 }, [
    ui.text(`Count: ${state.count}`),
    ui.button({ id: "inc", label: "+1", onPress: () => app.update(s => ({ ...s, count: s.count + 1 })) }),
  ]);
```

### Layer 2 — Composition API (for reusable widgets)

```typescript
import { defineWidget } from "@rezi-ui/core";

const Counter = defineWidget<{ initial: number; key?: string }>((props, ctx) => {
  const [count, setCount] = ctx.useState(props.initial);
  return ui.column({ gap: 1 }, [
    ui.text(`Count: ${count}`),
    ui.button({ id: ctx.id("inc"), label: "+1", onPress: () => setCount(c => c + 1) }),
  ]);
});
```

Available hooks: `ctx.useState()`, `ctx.useEffect()`, `ctx.useRef()`, `ctx.useMemo()`, `ctx.useCallback()`, `ctx.useAppState()`, `ctx.useViewport()`, `ctx.id()`.
Animation utility hooks: `useTransition()`, `useSpring()`, `useSequence()`, `useStagger()`.

### Layer 3 — Domain Hooks (for complex state and motion)

```typescript
import { useTransition, useSpring, useSequence, useStagger, useTable, useModalStack, useForm } from "@rezi-ui/core";
```

### Layer 4 — Raw VNodes (avoid unless necessary)

```typescript
const node: VNode = { kind: "text", text: "hello", props: {} };
```

## Conditional and List Rendering

```typescript
import { show, when, match, maybe } from "@rezi-ui/core";
import { each, eachInline } from "@rezi-ui/core";

// Conditional
show(isVisible, ui.text("shown"));
when(loading, () => ui.spinner({}), () => ui.text("done"));
maybe(user, u => ui.text(u.name));

// Lists (always provide key function)
each(items, (item) => ui.text(item.name), { key: (item) => item.id });
```

## Code Standards and Guardrails

- All interactive widgets MUST have a unique `id` prop.
- Hooks must be called in consistent order (no conditional hooks, no hooks in loops).
- `ui.box` transition properties default to animating `position`, `size`, and `opacity`; constrain with explicit `properties` when needed.
- Use `key` prop for list items to enable stable reconciliation.
- State updates during render are forbidden (throws `ZRUI_UPDATE_DURING_RENDER`).
- Duplicate interactive widget IDs are fatal (throws `ZRUI_DUPLICATE_ID`).
- Max nesting depth: 500 (warn at 200). Max composite render depth: 100.
- Prefer `useReducer` pattern (reducer + dispatch) over raw `app.update()`.
- Import from package exports only (`@rezi-ui/core`, `@rezi-ui/node`), never from internal paths.

## Patterns

### DO

- Use `ui.*` functions for all widget construction.
- Use `each()` / `eachInline()` for list rendering with keys.
- Use `show()` / `when()` / `maybe()` / `match()` for conditional rendering.
- Use `defineWidget()` for reusable stateful components.
- Use `useTransition()` / `useSpring()` / `useSequence()` / `useStagger()` for declarative numeric motion.
- Use `useTable()` for table state, `useModalStack()` for modal state.
- Follow template structure: separate `screens/`, `helpers/state.ts`, `helpers/keybindings.ts`, `theme.ts`, `types.ts` (see `animation-lab` for motion-heavy screens).
- Test with `createTestRenderer()` from the testing module.

### DON'T

- Don't construct raw VNode objects `{ kind: ..., props: ... }`.
- Don't call hooks conditionally or in loops.
- Don't use `app.update()` inside view functions.
- Don't duplicate widget IDs across the tree.
- Don't exceed 500 nesting depth.
- Don't import from internal paths (use package exports only).

## Testing

```typescript
import { createTestRenderer } from "@rezi-ui/core";

const renderer = createTestRenderer({ viewport: { cols: 80, rows: 24 } });
const result = renderer.render(myView(state));

// Query the rendered tree
result.findById("my-button");      // Find node by widget ID
result.findText("Hello");          // Find node containing text
result.findAll("button");          // Find all nodes of a kind
result.toText();                   // Render to plain text for snapshots
```

Test runner: `node:test`. Run all tests with `node scripts/run-tests.mjs`.

## Skills (Repeatable Recipes)

Project-level skills for both Claude Code and Codex:

| Skill | Claude Code | Codex |
|-------|-------------|-------|
| Add Widget | `.claude/skills/rezi-add-widget/` | `.codex/skills/rezi-add-widget/` |
| Create Screen | `.claude/skills/rezi-create-screen/` | `.codex/skills/rezi-create-screen/` |
| Keybindings | `.claude/skills/rezi-keybindings/` | `.codex/skills/rezi-keybindings/` |
| Data Table | `.claude/skills/rezi-data-table/` | `.codex/skills/rezi-data-table/` |
| Modal Dialogs | `.claude/skills/rezi-modal-dialogs/` | `.codex/skills/rezi-modal-dialogs/` |
| Forms | `.claude/skills/rezi-forms/` | `.codex/skills/rezi-forms/` |
| Write Tests | `.claude/skills/rezi-write-tests/` | `.codex/skills/rezi-write-tests/` |
| Debug Rendering | `.claude/skills/rezi-debug-rendering/` | `.codex/skills/rezi-debug-rendering/` |
| Perf Profiling | `.claude/skills/rezi-perf-profiling/` | `.codex/skills/rezi-perf-profiling/` |
| Routing | `.claude/skills/rezi-routing/` | `.codex/skills/rezi-routing/` |

Claude Code: invoke via `/rezi-add-widget`, `/rezi-write-tests`, etc.
Codex: invoke via `$rezi-add-widget` or implicitly via description matching.

## Performance Notes

- Layout stability signatures (FNV-1a hash) auto-skip relayout for unchanged subtrees.
- Builder `validateParams` defaults to false in production (fast path).
- Leaf node reuse eliminates allocation for unchanged text/spacer/divider nodes.
- Container reuse skips reconciliation when children are structurally identical.
- Use `ctx.useMemo()` for expensive computations in widget render functions.
- Profile with `REZI_PERF=1 REZI_PERF_DETAIL=1` environment variables.
- Benchmark scripts: `packages/bench/src/profile-phases.ts`, `profile-construction.ts`.
