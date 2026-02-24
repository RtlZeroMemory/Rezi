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

- `dashboard`: Live ops dashboard with deterministic telemetry updates.
  Highlights: reducer-driven updates, fleet filter/selection workflow, inspector panel, and help overlay.
- `stress-test`: Visual benchmark matrix with deterministic simulation + real runtime diagnostics.
  Highlights: geometry/text/matrix stress lanes, phase escalation, measured CPU/RSS/lag/sink I/O.
  Aliases: `stress`, `chaos`, `bench`.
- `cli-tool`: Multi-screen product workflow app with first-party page routing.
  Highlights: home/logs/settings routes, shared route shell, logs console, and global route keybindings.
  Aliases: `cli`, `tool`, `multiscreen`.
- `animation-lab`: Declarative animation starter with responsive reactor visuals.
  Highlights: transition/spring/sequence/stagger hooks, canvas + chart composition, and live resize adaptation.
  Aliases: `animation`, `anim`, `lab`, `motion`.
- `minimal`: Single-screen utility starter for focused tooling.
  Highlights: lean reducer flow, keybindings (`q`, `?`, `+/-`, `t`), theme cycling, and signal-safe shutdown pattern.
  Aliases: `mini`, `basic`, `utility`.
- `starship`: Multi-deck command console integration showcase.
  Highlights: routed six-screen bridge, live telemetry/charts, crew and cargo operations, overlays, and theme cycling.
  Aliases: `ship`, `bridge`, `command`.

Choose directly with `--template`:

```bash
npm create rezi my-app -- --template dashboard
npm create rezi my-app -- --template stress-test
npm create rezi my-app -- --template cli-tool
npm create rezi my-app -- --template animation-lab
npm create rezi my-app -- --template minimal
npm create rezi my-app -- --template starship
bun create rezi my-app -- --template dashboard
bun create rezi my-app -- --template stress-test
bun create rezi my-app -- --template cli-tool
bun create rezi my-app -- --template animation-lab
bun create rezi my-app -- --template minimal
bun create rezi my-app -- --template starship
```

Inspect all templates and highlights from the CLI:

```bash
npm create rezi -- --list-templates
# or
bun create rezi -- --list-templates
```

## Options

- `--template, -t <name>`:
  Select a template (`dashboard`, `stress-test`, `cli-tool`, `animation-lab`, `minimal`, `starship`; aliases: `dash`, `stress`, `chaos`, `bench`, `cli`, `tool`, `multiscreen`, `animation`, `anim`, `lab`, `motion`, `mini`, `basic`, `utility`, `ship`, `bridge`, `command`).
- `--no-install, --skip-install`: Skip dependency installation.
- `--pm, --package-manager <npm|pnpm|yarn|bun>`: Choose a package manager.
- `--list-templates, --templates`: Print available templates and highlights.
- `--help, -h`: Show help.

When `stress-test` is selected, the CLI asks for explicit confirmation because
that template intentionally drives higher CPU/IO pressure.

## Scaffold Layout + Tests

Templates now demonstrate a shared starter architecture:

- `src/types.ts`
- `src/theme.ts`
- `src/helpers/`
- `src/screens/`
- `src/main.ts`
- `src/__tests__/`

Each template includes example tests for reducer logic, widget rendering, and keybinding mapping.

## Dev Loop (HSR)

`minimal`, `dashboard`, `cli-tool`, and `starship` templates ship with hot state-preserving reload enabled in
`npm run dev` / `bun run dev`:

- dev script runs `tsx src/main.ts --hsr`
- source changes hot-swap through `createNodeApp({ hotReload: ... })` via:
  - `app.replaceView(...)` in widget-view templates (`minimal`, `dashboard`)
  - `app.replaceRoutes(...)` in route-managed templates (`cli-tool`, `starship`)
- app state, focus, and stable widget local state are preserved across edits

For package-level CLI reference (invocation forms and options), see [packages/create-rezi](../packages/create-rezi.md).

## Next Steps

- [Quickstart](quickstart.md) for manual setup.
- [Examples](examples.md) for runnable repository examples.
- [Animation Guide](../guide/animation.md) for transition/spring/sequence/stagger usage patterns.
