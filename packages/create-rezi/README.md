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

Choose a template interactively, or pass `--template` with a canonical name.

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

- `--template <dashboard|form-app|file-browser|streaming-viewer>`: Choose a template.
- `--no-install`: Skip dependency installation.
- `--pm <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates`: Print available templates and highlights.
- `--help`: Show help.
