# create-rezi

Scaffold a Rezi terminal UI app.

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

Available templates:

- `minimal` - Single-screen utility starter for focused tools
  - Aliases: `mini`, `basic`, `utility`
- `cli-tool` - Multi-screen CLI starter with route-based screens
  - Aliases: `cli`, `tool`, `multiscreen`
- `starship` - Advanced console template with routed decks, charts, forms, and overlays
  - Aliases: `ship`, `bridge`, `command`

```bash
npm create rezi my-app -- --template minimal
npm create rezi my-app -- --template cli-tool
npm create rezi my-app -- --template starship
```

List templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template, -t <name>`: Select a template (`minimal`, `cli-tool`, `starship`, plus aliases).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

## Template Conventions

Scaffolded templates now follow the same baseline structure:

- `src/types.ts`
- `src/theme.ts`
- `src/helpers/`
- `src/screens/`
- `src/main.ts`
- `src/__tests__/`

Template theming convention:

- `src/theme.ts` is the canonical source for theme catalogs and style helpers.
- Screens should derive visual styling from active theme tokens instead of hardcoded RGB/hex literals.
