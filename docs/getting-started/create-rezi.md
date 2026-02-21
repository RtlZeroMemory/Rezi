# Create Rezi

`create-rezi` is the fastest way to scaffold a ready-to-run Rezi app.

```bash
npm create rezi my-app
cd my-app
npm run start
```

If you prefer Bun:

```bash
bun create rezi my-app
cd my-app
bun run start
```

## Templates (Canonical Overview)

If `--template` is omitted, the CLI prompts you to choose (default: `dashboard`).

- `dashboard`: Live ops dashboard with deterministic table updates.
  Highlights: live-updating table with stable row keys, filter/sort/pin controls + incident telemetry.
- `stress-test`: Visual benchmark matrix with deterministic simulation + real runtime diagnostics.
  Highlights: three visual stress lanes (geometry/text/matrix), phase escalation, measured CPU/RSS/lag/sink I/O.
  Aliases: `stress`, `chaos`, `bench`.
- `cli-tool`: Multi-screen product workflow app with first-party page routing.
  Highlights: home/logs/settings/detail routes, breadcrumb+tabs helpers wired to live router state.
  Aliases: `cli`, `tool`, `multiscreen`.

Choose directly with `--template`:

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template stress-test
npm create rezi my-app -- --template cli-tool
bun create rezi my-app -- --template dashboard
bun create rezi my-app -- --template stress-test
bun create rezi my-app -- --template cli-tool
```

Inspect all templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
# or
bun create rezi -- --list-templates
```

## Options

- `--template, -t <name>`:
  Select a template (`dashboard`, `stress-test`, `cli-tool`; aliases: `dash`, `stress`, `chaos`, `bench`, `cli`, `tool`, `multiscreen`).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

When `stress-test` is selected, the CLI asks for explicit confirmation because
the generated app intentionally drives higher CPU/IO pressure.

For package-level CLI reference (invocation forms and options), see [packages/create-rezi](../packages/create-rezi.md).

## Next Steps

- [Quickstart](quickstart.md) for manual setup.
- [Examples](examples.md) for runnable repository examples.
