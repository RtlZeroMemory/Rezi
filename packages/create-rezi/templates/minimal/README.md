# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Demonstrates

- A single-screen TUI with no routing overhead.
- Minimal state + reducer flow with just a few actions.
- Keybindings for quit/help/theme/counter updates.
- Signal-safe startup and shutdown pattern.
- Built-in error display pattern for small utility tools.

## File Layout

- `src/types.ts`: state and action types.
- `src/theme.ts`: theme catalog + template identity constants.
- `src/helpers/`: reducer + keybinding helpers.
- `src/screens/`: single screen renderer.
- `src/main.ts`: app bootstrapping, keybindings, lifecycle.
- `src/__tests__/`: reducer, render, and keybinding examples.

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

- `q` or `ctrl+c`: Quit
- `?` or `h`: Toggle help
- `+` / `-`: Increment/decrement counter
- `t`: Cycle theme
- `e`: Trigger example error message
