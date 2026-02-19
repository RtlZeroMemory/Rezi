# create-rezi

Scaffold a new Rezi terminal UI app.

## Usage

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

Currently available template:

- `dashboard` - EdgeOps-style operations console starter
  - Alias: `dash`

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template dash
```

List templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template, -t <name>`: Select a template (`dashboard` or alias `dash`).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

For template descriptions and highlights, see:
https://rtlzeromemory.github.io/Rezi/getting-started/create-rezi/
