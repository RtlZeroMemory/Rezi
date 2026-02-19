# __APP_NAME__

Scaffolded with `npm create rezi` using the **__TEMPLATE_LABEL__** template.

## Quickstart

```bash
# npm
npm install
npm run start

# bun
bun install
bun run start
```

## Controls

- `up` / `down` or `j` / `k`: Move service selection
- `f`: Cycle health filter (`all`, `warning`, `down`, `healthy`)
- `s`: Cycle sort field (`service`, `latency`, `errors`, `traffic`)
- `o`: Toggle sort direction
- `p` or `space`: Pause/resume live updates
- `enter`: Pin/unpin selected service
- `d`: Toggle debug counters panel
- `h`: Open command help modal
- `q`: Quit

## What This Template Demonstrates

- A production-style EdgeOps control-plane dashboard with deterministic live telemetry.
- Stable table + inspector + active events workflow using high-level Rezi widgets only.
- Escalation-oriented UX: critical banner, service inspector guidance, and runbook panel.

## Key Code Patterns

- Bounded live update loop and lifecycle cleanup in `src/main.ts` (`simulateTick`, interval setup/teardown).
- Stable diffing patterns in `src/main.ts` (`ui.table` + `getRowKey` + immutable service updates + fixed-width labels).
- Interaction and command model in `src/main.ts` (`app.keys`, selection/filter/sort helpers, modal help).
