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

- `dashboard`: Product-grade EdgeOps console with deterministic live updates.
  Highlights: fleet services table, service inspector, active events feed, and escalation runbook.
  Alias: `dash` (also accepted in interactive prompt).

Choose directly with `--template`:

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template dash
```

Inspect all templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template, -t <name>`: Select a template (`dashboard` or alias `dash`).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

For package-level CLI reference (invocation forms and options), see [packages/create-rezi](../packages/create-rezi.md).

## Next Steps

- [Quickstart](quickstart.md) for manual setup.
- [Examples](examples.md) for runnable repository examples.
