# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Demonstrates

- Multi-screen CLI workflow powered by first-party `createApp({ routes })` routing.
- Multi-file structure for maintainability (`types`, `theme`, `helpers`, `screens`, `main`).
- Streamed logs + settings forms + global route keybindings.
- Route shell pattern you can extend for additional screens.

## Screens

- `home`: status overview + quick actions.
- `logs`: streaming console and recent entry list.
- `settings`: environment/theme/operator controls.

## File Layout

- `src/types.ts`: route/state/action contracts.
- `src/theme.ts`: theme catalog and template identity constants.
- `src/helpers/`: log helpers, reducer, and keybinding resolver.
- `src/screens/`: one file per route + shared shell wrapper.
- `src/main.ts`: route wiring, runtime loop, keybindings, and shutdown.
- `src/__tests__/`: reducer, render, and keybinding examples.

## Controls

- `f1` / `alt+1` / `ctrl+1`: Home
- `f2` / `alt+2` / `ctrl+2`: Logs
- `f3` / `alt+3` / `ctrl+3`: Settings
- `p`: Pause/resume stream
- `h` or `?`: Toggle help modal
- `q` or `ctrl+c`: Quit

## Testing

```bash
npm run test
# or
bun run test
```

## Quickstart

```bash
# npm
npm install
npm run start

# bun
bun install
bun run start
```
