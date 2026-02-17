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
- `s`: Cycle sort key (`latency`, `errors`, `traffic`, `name`)
- `o`: Toggle sort direction
- `p` or `space`: Pause/resume live updates
- `enter`: Pin/unpin selected service
- `d`: Toggle debug counters panel
- `q`: Quit

## What This Template Demonstrates

- A live-updating operations dashboard using `ui.table` with stable row keys and immutable row patches to keep updates smooth.
- Production-style controls for filtering, sorting, pinning, and pausing metrics.
- An incident stream plus optional debug telemetry (update cadence and staleness) for observability workflows.

## Key Code Patterns

- Live update simulation and lifecycle cleanup in `src/main.ts` (`simulateTick`, interval setup/teardown).
- No-flicker table update pattern in `src/main.ts` (`ui.table` + `getRowKey` + immutable service updates).
- Interaction/state transitions in `src/main.ts` (`app.keys`, `moveSelection`, filter/sort helpers).
