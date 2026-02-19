# create-rezi

`create-rezi` is the CLI package that scaffolds new Rezi apps.

## Usage

```bash
npm create rezi my-app
```

Equivalent direct invocation:

```bash
npx create-rezi my-app
```

The CLI prompts for any missing values (project name/template) when run interactively.

## Templates

Canonical template names:

- `dashboard`

Use a specific template:

```bash
npm create rezi my-app -- --template dashboard
```

List templates and highlights:

```bash
npm create rezi -- --list-templates
```

For template descriptions and highlights, use the canonical guide: [Getting Started → Create Rezi](../getting-started/create-rezi.md).

## Options

- `--template, -t <dashboard>`: Select a template.
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

## Template Smoke Check

Run deterministic template smoke checks (metadata consistency + build/typecheck expectations):

```bash
npm run check:create-rezi-templates
```
