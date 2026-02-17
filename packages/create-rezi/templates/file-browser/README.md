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

- `up` / `down` or `j` / `k`: Move file selection
- `enter`: Open directory or file
- `backspace`: Go to parent directory
- `h`: Toggle hidden files
- `ctrl+p`: Open command palette
- In palette: `tab` cycles sources, `>` switches to command mode, `enter` selects, `esc` closes
- `q`: Quit

## What This Template Demonstrates

- A command palette with async file search results and explicit request cancellation via `AbortController`.
- Mixed palette sources (files + commands) with typed payload routing to navigation/actions.
- Search telemetry (requests, completed, cancelled, last latency) surfaced in the UI for debugging async flows.

## Key Code Patterns

- Async search/cancellation pipeline in `src/main.ts` (`searchPaletteFiles`, `waitWithAbort`, `cancelActiveSearch`).
- Palette result handling and command routing in `src/main.ts` (`parsePaletteData`, `openPathFromPalette`, `applyPaletteAction`).
- Browser table + local navigation state updates in `src/main.ts` (`listEntriesAt`, `openEntry`, `ui.table`).
