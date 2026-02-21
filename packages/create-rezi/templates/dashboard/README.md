# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Demonstrates

- Multi-file dashboard architecture from day one (`types`, `theme`, `helpers`, `screens`, `main`).
- Deterministic telemetry updates via `useStream(...)` + async iterable ingestion.
- Operator dashboard patterns: fleet summary, filtered list, service inspector, and help modal.
- Theme cycling and keyboard-driven controls designed for fast operational workflows.

## File Layout

- `src/types.ts`: state/action/service model.
- `src/theme.ts`: template identity + theme catalog.
- `src/helpers/`: formatters, reducer logic, telemetry stream, and keybinding resolver.
- `src/screens/overview.ts`: dashboard UI composition.
- `src/main.ts`: app init, keybindings, stream-driven telemetry, shutdown handling.
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

## Dev Loop (HSR)

```bash
# npm
npm run dev

# bun
bun run dev
```

`npm run dev` / `bun run dev` starts the app with `--hsr` so view edits hot-swap via
`app.replaceView(...)` while preserving app state, focus, and form/input context.
