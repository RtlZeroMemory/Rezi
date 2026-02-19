# create-rezi

Scaffold a new Rezi terminal UI app.

## Usage

```bash
npm create rezi my-app
cd my-app
npm run start

# Bun
bun create rezi my-app
cd my-app
bun run start
```

## Templates

Currently available templates:

- `dashboard` - EdgeOps-style operations console starter
  - Alias: `dash`
- `stress-test` - Visual benchmark matrix starter
  - Aliases: `stress`, `chaos`, `bench`
- `cli-tool` - Multi-screen CLI workflow starter with page router
  - Aliases: `cli`, `tool`, `multiscreen`

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template stress-test
npm create rezi my-app -- --template cli-tool
```

List templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template, -t <name>`: Select a template (`dashboard`, `stress-test`, or `cli-tool`, plus aliases).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

For template descriptions and highlights, see:
https://rtlzeromemory.github.io/Rezi/getting-started/create-rezi/
