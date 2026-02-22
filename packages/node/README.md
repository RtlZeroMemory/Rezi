# @rezi-ui/node

Node.js/Bun backend for Rezi. This package owns:

- configurable native engine execution mode (`auto` | `worker` | `inline`)
- frame scheduling and buffer pooling
- transfer of drawlists/events between core and the native addon

Recommended usage:

```ts
import { createNodeApp } from "@rezi-ui/node";
```

Use `createNodeApp({ initialState, config })` as the default path. It wires
`@rezi-ui/core` and `@rezi-ui/node` with matched cursor protocol, event caps,
and fps settings. `executionMode` defaults to `auto` (`fpsCap <= 30` -> inline,
otherwise worker); set `executionMode: "worker"` or `"inline"` to force a mode.

For development-time hot swapping, pass `hotReload` to `createNodeApp(...)`:
- `viewModule` for widget-view apps
- `routesModule` for route-managed apps

`app.hotReload` exposes the controller for optional manual `reloadNow()` calls.

`createNodeBackend()` is available when you need direct access to a backend
instance (benchmarks/custom runners). Most apps should use `createNodeApp()`.

Install:

```bash
npm i @rezi-ui/node
# or
bun add @rezi-ui/node
```

Docs: `https://rezitui.dev/docs`
