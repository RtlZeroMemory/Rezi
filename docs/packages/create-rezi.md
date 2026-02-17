# create-rezi

Scaffold a new Rezi terminal UI app in seconds.

## Quickstart

```bash
npm create rezi my-app
cd my-app
npm run start

# or bun
# npm create rezi my-app -- --pm bun
# cd my-app
# bun run start
```

## Templates

- `dashboard`: Live ops dashboard with deterministic table updates.
  Highlights: live-updating table with stable row keys, filter/sort/pin controls + incident telemetry.
- `form-app`: Multi-step form with validation and command modes.
  Highlights: insert/command key modes with chords, modal help and toast notifications.
- `file-browser`: Explorer with async command palette search.
  Highlights: async palette results with cancellation, table browser with details and preview.
- `streaming-viewer`: High-volume stream monitor with virtualized index.
  Highlights: virtual list over 15k streams, live ingest feed with follow/pause controls.

Choose a template interactively or pass a canonical template name:

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template form-app
npm create rezi my-app -- --template file-browser
npm create rezi my-app -- --template streaming-viewer
```

List templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template <dashboard|form-app|file-browser|streaming-viewer>`: Select a template.
- `--no-install`: Skip dependency installation.
- `--pm <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates`: Print available templates and highlights.
- `--help`: Show help.

## Template Smoke Check

Run deterministic template smoke checks (metadata consistency + build/typecheck expectations):

```bash
npm run check:create-rezi-templates
```
