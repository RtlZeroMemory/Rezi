# Rezi AI Development Guide

## Project Overview

Rezi is a TypeScript terminal UI framework in an npm-workspaces monorepo.

Main packages:
- `@rezi-ui/core`: runtime-agnostic widget API, layout, routing, focus, forms, themes, testing
- `@rezi-ui/node`: Node.js and Bun terminal backend
- `@rezi-ui/native`: native Zireael binding
- `@rezi-ui/jsx`: JSX surface over `ui.*`
- `@rezi-ui/testkit`: testing utilities
- `create-rezi`: scaffolding CLI
- `@rezi-ui/bench`: benchmark suite

Current public templates:
- `minimal`
- `cli-tool`
- `starship`

Repository examples:
- `examples/hello-counter`
- `examples/raw-draw-demo`
- `examples/gallery`
- `examples/regression-dashboard` (validation surface for layout/render/input regressions)

## Canonical References

Read these before making behavior changes:
- `docs/dev/code-standards.md`
- `docs/dev/testing.md`
- `docs/design-system.md`
- `docs/styling/theme.md`

Use these as current-source references while editing:
- `packages/core/src/index.ts`
- `packages/core/src/widgets/ui.ts`
- `packages/core/src/widgets/types/`
- `packages/core/src/widgets/composition.ts`
- `packages/core/src/router/`
- `packages/create-rezi/templates/`

## Quick Commands

```bash
npm ci
npm run build
npm test
npm run test:packages
npm run test:scripts
npm run test:e2e
npm run check:create-rezi-templates
npm run build:native
npm run test:native:smoke
npm run docs:build
```

Useful focused commands:

```bash
node scripts/run-tests.mjs --filter "widget"
npx tsx examples/gallery/src/index.ts
REZI_PERF=1 REZI_PERF_DETAIL=1 node scripts/run-tests.mjs
```

## Project Map

```text
packages/core/src/
  app/                        # app runtime and render orchestration
  widgets/                    # widget factories, types, composition hooks
  router/                     # route registry, helpers, integration
  runtime/                    # commit, focus, widget metadata, input routing
  layout/                     # layout engine, validation, responsive helpers
  renderer/                   # drawlist rendering
  drawlist/                   # ZRDL builders and generated writers
  forms/                      # useForm and form helpers
  testing/                    # test renderer, snapshots, helpers
  theme/                      # ThemeDefinition, presets, validation

packages/node/src/
  backend/                    # inline and worker backends

packages/create-rezi/templates/
  minimal/
  cli-tool/
  starship/
```

## Layout Engine Baseline

Current behavior that docs, tests, and codegen should preserve:
- Intrinsic sizing uses `measureMinContent` / `measureMaxContent`.
- Stack layout supports `flex`, `flexShrink`, `flexBasis`, `alignSelf`, and wrap feedback.
- Text supports grapheme-safe wrapping and `textOverflow` (`clip`, `ellipsis`, `middle`, `start`).
- `box` supports synthetic inner-column layout, `gap`, and absolute children.
- Grid supports explicit placement and spans.
- Overlay widgets use constraint-driven sizing.
- Deterministic integer distribution is shared across split and grid sizing paths.
- Stability signatures are active for common widget kinds.

Current constraint surface:
- Layout constraints use fixed numbers, `full`, `auto`, `fluid(...)`, or `expr(...)`.
- Responsive maps are not part of the layout-constraint API.
- Spacing values still use spacing keys such as `"sm"` / `"md"` / `"lg"`.

## Theme and Design System

Current public theme contract:
- `ThemeDefinition` is the public theme shape.
- `ctx.useTheme()` returns `ColorTokens`.
- Built-in themes are `darkTheme`, `lightTheme`, `dimmedTheme`, `highContrastTheme`, `nordTheme`, and `draculaTheme`.

Recipe defaults:
- Core interactive widgets are recipe-styled by default under semantic themes.
- Manual style overrides merge on top of recipe output.

### Button Styling

Use `intent` for button semantics:

| Intent | Typical Use |
|--------|-------------|
| `"primary"` | main call to action |
| `"secondary"` | standard secondary action |
| `"danger"` | destructive action |
| `"success"` | positive confirmation |
| `"warning"` | cautionary action |
| `"link"` | low-chrome text action |

## Drawlist Codegen Protocol

When changing drawlist command bytes or field layout:

1. Update `scripts/drawlist-spec.ts`.
2. Run `npm run codegen`.
3. Run `npm run codegen:check`.
4. Update affected drawlist/protocol tests.
5. Update protocol docs:
   - `docs/protocol/zrdl.md`
   - `docs/protocol/versioning.md`

## Testing

Behavior changes must follow `docs/dev/testing.md`.

Practical defaults:
- Test expected behavior, not private implementation shape.
- Use the lowest fidelity that proves the contract.
- Add PTY evidence when terminal-visible behavior depends on the real backend path.
- Update docs in the same change when public behavior moves.

## Repo Guidance

- Import from package exports, not private paths.
- Keep `@rezi-ui/core` free of runtime-specific imports.
- Preserve JSX parity when changing core widget APIs.
- Do not hand-edit generated drawlist writers.
- Prefer semantic widgets and recipe-driven styling over manual status rendering.
- Prefer `ui.virtualList` for large collections.

## Skills

Project-level skills are mirrored for Claude and Codex.

| Skill | Claude Path | Codex Path |
|------|-------------|------------|
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

Keep these files aligned, including YAML frontmatter and path examples, when the repo structure or recommended workflows change.
