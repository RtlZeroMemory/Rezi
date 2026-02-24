# create-rezi

`create-rezi` is the CLI package that scaffolds new Rezi apps.

## Usage

```bash
npm create rezi my-app
# or
bun create rezi my-app
```

Equivalent direct invocation:

```bash
npx create-rezi my-app
# or
bunx create-rezi my-app
```

The CLI prompts for any missing values (project name/template) when run interactively.

## Templates

Canonical template names:

- `dashboard` (alias: `dash`)
- `stress-test` (aliases: `stress`, `chaos`, `bench`)
- `cli-tool` (aliases: `cli`, `tool`, `multiscreen`)
- `animation-lab` (aliases: `animation`, `anim`, `lab`, `motion`)
- `minimal` (aliases: `mini`, `basic`, `utility`)
- `starship` (aliases: `ship`, `bridge`, `command`)

`animation-lab` is the canonical reference for Rezi's declarative motion APIs (`useTransition`, `useSpring`, `useSequence`, `useStagger`) plus `ui.box` transition props.

Use a specific template:

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template cli-tool
npm create rezi my-app -- --template animation-lab
npm create rezi my-app -- --template minimal
npm create rezi my-app -- --template starship

# Bun
bun create rezi my-app -- --template dashboard
bun create rezi my-app -- --template cli-tool
bun create rezi my-app -- --template animation-lab
bun create rezi my-app -- --template minimal
bun create rezi my-app -- --template starship
```

List templates and highlights:

```bash
npm create rezi -- --list-templates
# or
bun create rezi -- --list-templates
```

For full template descriptions and highlights, use: [Getting Started -> Create Rezi](../getting-started/create-rezi.md).

Template dev workflow notes:

- `minimal`, `dashboard`, `cli-tool`, and `starship` templates run `tsx src/main.ts --hsr` for `npm run dev` / `bun run dev`.
- This enables in-process hot state-preserving reload through `@rezi-ui/node` `createNodeApp({ hotReload: ... })`.

## Options

- `--template, -t <name>`: Select a template (`dashboard`, `stress-test`, `cli-tool`, `animation-lab`, `minimal`, `starship`, plus aliases).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

## Template Smoke Check

Run deterministic template smoke checks (metadata consistency + build/typecheck + test scaffolding expectations):

```bash
npm run check:create-rezi-templates
```
