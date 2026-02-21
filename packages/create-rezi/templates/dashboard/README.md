# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Demonstrates

- Multi-file dashboard architecture from day one (`types`, `theme`, `helpers`, `screens`, `main`).
- Deterministic telemetry updates with a reducer-based state transition model.
- Operator dashboard patterns: fleet summary, filtered list, service inspector, and help modal.
- Theme cycling and keyboard-driven controls designed for fast operational workflows.

## File Layout

- `src/types.ts`: state/action/service model.
- `src/theme.ts`: template identity + theme catalog.
- `src/helpers/`: formatters, reducer logic, and keybinding resolver.
- `src/screens/overview.ts`: dashboard UI composition.
- `src/main.ts`: app init, keybindings, telemetry loop, shutdown handling.
- `src/__tests__/`: reducer, widget render, and keybinding tests.

## Controls

- `up` / `down` or `j` / `k`: Move selection
- `f`: Cycle fleet filter (`all`, `warning`, `down`, `healthy`)
- `t`: Cycle theme preset
- `p` or `space`: Pause/resume telemetry stream
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
