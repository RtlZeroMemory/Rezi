# __APP_NAME__

Scaffolded with `npm create rezi` using the **__TEMPLATE_LABEL__** template.

## Quickstart

```bash
# npm
npm install
npm run start

# bun
bun install
bun run start
```

## Controls

- `tab`: Move focus between form widgets
- `esc`: Switch to command mode
- `i`: Return to insert mode
- `ctrl+s` or `z s`: Save draft
- `ctrl+r` or `z r`: Reset form
- `ctrl+enter` or `enter` (command mode): Submit form
- `g p`, `g w`, `g s`, `g r`: Jump to Profile, Workspace, Security, Review
- `?`: Toggle controls overlay
- `q`: Quit

## What It Demonstrates

- Multi-step form UX with validation, completion tracking, and review summary
- Mode-aware keybindings (`insert` + `command`) with real chord sequences
- Overlay composition using modal help plus toast notifications

## Key Code Patterns

- `src/main.ts`: `app.modes(...)` with parent mode inheritance and chord maps
- `src/main.ts`: `getValidationErrors(...)`, `completionPercent(...)`, and section-specific field rendering
- `src/main.ts`: `ui.layers(...)` composition with `ui.modal(...)`, `ui.toastContainer(...)`, and toast expiry sweep
