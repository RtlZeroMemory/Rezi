# Create Rezi

`create-rezi` is the fastest way to scaffold a ready-to-run Rezi app.

```bash
npm create rezi my-app
cd my-app
npm run start
```

If you prefer Bun:

```bash
npm create rezi my-app -- --pm bun
cd my-app
bun run start
```

## Templates (Canonical Overview)

If `--template` is omitted, the CLI prompts you to choose (default: `dashboard`).

- `dashboard`: Live ops dashboard with deterministic table updates.
  Highlights: live-updating table with stable row keys, filter/sort/pin controls + incident telemetry.
- `stress-test`: Visual benchmark matrix with deterministic simulation + real runtime diagnostics.
  Highlights: three visual stress lanes (geometry/text/matrix), phase escalation, measured CPU/RSS/lag/sink I/O.
- `form-app`: Multi-step form with validation and command modes.
  Highlights: insert/command key modes with chords, modal help and toast notifications.
- `file-browser`: Explorer with async command palette search.
  Highlights: async palette results with cancellation, table browser with details and preview.
- `streaming-viewer`: High-volume stream monitor with virtualized index.
  Highlights: virtual list over 15k streams, live ingest feed with follow/pause controls.

Choose directly with `--template`:

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template stress-test
```

Inspect all templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template, -t <dashboard|stress-test|form-app|file-browser|streaming-viewer>`: Select a template.
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

For package-level CLI reference (invocation forms and options), see [packages/create-rezi](../packages/create-rezi.md).

## Next Steps

- [Quickstart](quickstart.md) for manual setup.
- [Examples](examples.md) for runnable repository examples.
