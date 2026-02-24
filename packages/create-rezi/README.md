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
- `cli-tool` - Multi-screen CLI workflow starter with route-based screens
  - Aliases: `cli`, `tool`, `multiscreen`
- `animation-lab` - Declarative animation playground with responsive reactor visuals
  - Aliases: `animation`, `anim`, `lab`, `motion`
- `minimal` - Single-screen utility starter for small tools
  - Aliases: `mini`, `basic`, `utility`
- `starship` - Starship command console starter with routed multi-deck operations
  - Aliases: `ship`, `bridge`, `command`

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template stress-test
npm create rezi my-app -- --template cli-tool
npm create rezi my-app -- --template animation-lab
npm create rezi my-app -- --template minimal
npm create rezi my-app -- --template starship
```

List templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
```

## Options

- `--template, -t <name>`: Select a template (`dashboard`, `stress-test`, `cli-tool`, `animation-lab`, `minimal`, `starship`, plus aliases).
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

For template descriptions and highlights, see:
https://rezitui.dev/docs/getting-started/create-rezi/
