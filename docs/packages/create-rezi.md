# create-rezi

`create-rezi` is the CLI package that scaffolds Rezi apps.

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

The CLI prompts for any missing values when run interactively.

## Public templates

Canonical public template names:

- `minimal`
- `cli-tool`
- `starship`

`minimal` is the smallest starter, `cli-tool` is the routed workflow starter, and `starship` covers the widest public widget surface.

Use a specific template:

```bash
npm create rezi my-app -- --template minimal
npm create rezi my-app -- --template cli-tool
npm create rezi my-app -- --template starship

# Bun
bun create rezi my-app -- --template minimal
bun create rezi my-app -- --template cli-tool
bun create rezi my-app -- --template starship
```

List templates and highlights:

```bash
npm create rezi -- --list-templates
# or
bun create rezi -- --list-templates
```

For the public template guide, see: [Getting Started -> Create Rezi](../getting-started/create-rezi.md).

Template dev workflow notes:

- The public templates run `tsx src/main.ts --hsr` for `npm run dev` / `bun run dev`.
- This enables in-process hot state-preserving reload through `@rezi-ui/node` `createNodeApp({ hotReload: ... })`.

## Options

- `--template, -t <name>`: Select a template (`minimal`, `cli-tool`, `starship`).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print the public template set and highlights.
- `--help, -h`: Show help.

## Template Smoke Check

Run deterministic template smoke checks (metadata consistency + build/typecheck + test scaffolding expectations):

```bash
npm run check:create-rezi-templates
```

Run the installed smoke path used in CI (scaffold temp project -> local package install -> build -> test):

```bash
npm run smoke:create-rezi-templates
```
