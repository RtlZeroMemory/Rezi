# __APP_NAME__

Scaffolded with `create-rezi` using the **__TEMPLATE_LABEL__** template.

## What This Template Demonstrates

- A first-party multi-screen app powered by `createApp({ routes, initialRoute })`.
- Screen navigation via router API (`navigate`, `replace`, `back`) and global keybindings.
- Route-aware helpers (`ui.routerTabs`, `ui.routerBreadcrumb`) wired to live router state.
- Focus restoration when returning to a previous screen with `back()`.
- A parameterized detail route (`detail` with `id` param) for drill-down flows.

## Screens

- `home`: Status summary and quick actions.
- `logs`: Streaming logs console + entry list.
- `settings`: Form controls (`input`, `checkbox`, `select`, `slider`).
- `detail`: Parameterized log detail screen (opened from Logs entries).

## Controls

- `ctrl+1`: Home
- `ctrl+2`: Logs
- `ctrl+3`: Settings
- `q` or `ctrl+c`: Quit

From the Logs screen:

- Activate a log entry to open the `detail` route.
- Use `back()` from Detail to restore the previous Logs focus state.

## Quickstart

```bash
# npm
npm install
npm run start

# bun
bun install
bun run start
```
