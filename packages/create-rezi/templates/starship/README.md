# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## Concept

`__APP_NAME__` is a multi-deck starship operations console. It demonstrates routed application architecture, deterministic telemetry simulation, rich widgets, layered overlays, and declarative animation hooks in a cohesive, production-like TUI.

## Decks

- `bridge`: Command overview with animated schematic, gauges, sparkline/line chart telemetry, and system health lanes.
- `engineering`: Split-pane reactor/diagnostics deck with tree navigation, accordion diagnostics, heatmap, and animated subsystem bring-up.
- `crew`: Manifest deck with searchable/sortable table, master-detail, assignment editor form, and pagination.
- `comms`: Channel tabs, logs console, rich text inspection, emergency callouts, and modal hail composer.
- `cargo`: High-volume cargo analytics with bar/scatter charts, virtualized manifest, sorting/filter controls, and priority editor.
- `settings`: Full settings form, validation callouts, theme preview, keybinding reference, and reset confirmation dialog.

## Keybindings

### Global

| Key | Command |
|---|---|
| `q`, `ctrl+c` | Quit |
| `1-6` | Navigate decks (`bridge` → `settings`) |
| `tab`, `shift+tab` | Next/previous deck |
| `t` | Cycle theme |
| `ctrl+p` | Toggle command palette |
| `?` | Toggle help modal |
| `space` | Pause/resume simulation |
| `g`, `y`, `r` | Set alert level (green/yellow/red) |

### Bridge

| Key | Command |
|---|---|
| `a` | Toggle autopilot |
| `r` | Toggle red alert |
| `s` | Scan |

### Engineering

| Key | Command |
|---|---|
| `b` | Toggle boost |
| `d` | Toggle diagnostics |

### Crew

| Key | Command |
|---|---|
| `n` | New assignment |
| `e` | Edit selected crew member |
| `/` | Focus/search crew workflow |

### Comms

| Key | Command |
|---|---|
| `h` | Open hail dialog |
| `enter` | Acknowledge next unacked message |
| `n`, `p` | Next/previous channel |
| `/` | Search messages |

### Cargo / Settings

| Key | Command |
|---|---|
| `n`, `c`, `q`, `p` (Cargo) | Sort by name/category/quantity/priority |
| `ctrl+r` (Settings) | Open reset confirmation |
| `ctrl+s` (Settings) | Save snapshot |

## Feature Showcase

- **Routing + shell:** `createNodeApp({ routes })`, `routerBreadcrumb()`, `routerTabs()`, route-aware key command dispatch.
- **Layouts:** `ui.appShell`, `ui.page`, `ui.panel`, `ui.card`, `ui.grid`, `ui.masterDetail`, `ui.splitPane`, `ui.center`.
- **Data + forms:** `ui.table`, `ui.tree`, `ui.virtualList`, `ui.form`, `ui.field`, `ui.actions`, `ui.select`, `ui.radioGroup`, `ui.slider`.
- **Visualization:** `ui.canvas` (braille), `ui.gauge`, `ui.progress`, `ui.sparkline`, `ui.lineChart`, `ui.barChart`, `ui.scatter`, `ui.heatmap`.
- **Overlays:** `ui.layers`, `ui.layer`, `ui.modal`, `ui.dialog`, `ui.toastContainer`, `ui.commandPalette`.
- **Composition hooks:** `defineWidget`, `useTransition`, `useSpring`, `useSequence`, `useStagger`, `useInterval`, `useAsync`.
- **Render helpers:** `show`, `when`, `match`, `maybe`, `each`, `eachInline`.

## File Layout

- `src/types.ts`: readonly state, domain entities, actions.
- `src/theme.ts`: starship theme catalog and display styles.
- `src/helpers/simulation.ts`: deterministic seed generators + toast events.
- `src/helpers/formatters.ts`: UI format and badge helpers.
- `src/helpers/state.ts`: reducer, selectors, simulation evolution.
- `src/helpers/keybindings.ts`: route-aware key resolution.
- `src/screens/`: shared shell + six route screens.
- `src/main.ts`: app bootstrap, routing, keybindings, timers, lifecycle.
- `src/__tests__/`: reducer, keybinding, and render coverage.

## Quickstart

```bash
npm install
npm run start
```

## Dev (HSR)

```bash
npm run dev
```

## Tests

```bash
npm test
```
