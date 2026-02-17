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

- `tab`: Focus the virtual list
- `up` / `down`, `pageup` / `pagedown`, `home` / `end`: Fast-scroll the 15k stream index
- `enter`: Pin selected stream into the detail panel and feed
- `space`: Pause or resume ingest simulation
- `f`: Toggle follow mode (pinned stream vs global sampling)
- `ctrl+l`: Reset the live feed panel
- `q`: Quit

## What It Demonstrates

- Production-scale virtualization with `ui.virtualList` over 15,360 streams
- Fast keyboard navigation and scroll telemetry (`scrollTop`, visible range)
- Live ingest context that updates independently from list rendering

## Key Code Patterns

- `src/main.ts`: `ui.virtualList` setup (`id: "streams-vlist"`) with `overscan`, `onScroll`, and `onSelect`
- `src/main.ts`: `streamSnapshot(...)` for deterministic large-data rendering without prebuilding 15k objects
- `src/main.ts`: Interval-driven live feed updates and follow/pause control wiring
