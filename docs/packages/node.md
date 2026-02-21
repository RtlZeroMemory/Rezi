# `@rezi-ui/node`

Node/Bun backend package:

- configurable engine execution mode (`auto` | `worker` | `inline`)
- transfer of drawlists/events between core and native
- buffer pooling and scheduling

## Install

```bash
npm i @rezi-ui/node
# or
bun add @rezi-ui/node
```

## What you get

- A backend implementation that satisfies the `@rezi-ui/core` runtime backend interface
- Worker and inline execution paths for the native engine
- A stable message protocol for worker mode
- Integration with `@rezi-ui/native` (prebuilt binaries when available)

## Execution mode

Set `config.executionMode` on `createNodeApp(...)`:

- `auto` (default): inline when `fpsCap <= 30`, worker otherwise
- `worker`: always run the engine on a worker thread
- `inline`: run the engine inline on the main JS thread

## Creating an app (recommended)

```ts
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
  initialState: { count: 0 },
  config: {
    executionMode: "auto",
    fpsCap: 60,
    maxEventBytes: 1 << 20,
    useV2Cursor: false,
  },
});
```

`createNodeApp` is the default path because it keeps core/backend config in
lockstep:

- `useV2Cursor` <-> drawlist v2
- app/backend `maxEventBytes`
- app/backend `fpsCap`

## Hot State-Preserving Reload (HSR)

`@rezi-ui/node` ships `createHotStateReload(...)` for development-time widget-view
or route-table swaps.

```ts
import { ui } from "@rezi-ui/core";
import { createHotStateReload, createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({ initialState: { count: 0 } });
app.view((state) => ui.text(`count=${String(state.count)}`));

const hsr = createHotStateReload({
  app,
  viewModule: new URL("./screens/main-screen.ts", import.meta.url),
  moduleRoot: new URL("./src", import.meta.url),
});

await hsr.start();
await app.start();
```

Route-managed apps use `routesModule` + `app.replaceRoutes(...)`:

```ts
const hsr = createHotStateReload({
  app,
  routesModule: new URL("./screens/index.ts", import.meta.url),
  moduleRoot: new URL("./src", import.meta.url),
  resolveRoutes: (moduleNs) => {
    const routes = (moduleNs as { routes?: unknown }).routes;
    if (!Array.isArray(routes)) {
      throw new Error("Expected `routes` array export");
    }
    return routes;
  },
});
```

What this does:

- watches source paths for changes
- re-imports the target module from a fresh module snapshot
- calls either `app.replaceView(...)` or `app.replaceRoutes(...)` without restarting the process

What stays intact across reload:

- app state (`app.update`)
- focused widget (when the same `id` still exists)
- local widget hook state (`defineWidget`) when keys/ids remain stable

Current scope:

- widget-mode apps (`app.view`/`app.replaceView`)
- route-managed apps (`createApp({ routes, initialRoute })` + `app.replaceRoutes`)
- not raw draw mode

## `NO_COLOR` behavior

`createNodeApp(...)` checks `process.env.NO_COLOR` at app construction time.
When present, Rezi forces a monochrome theme and exposes:

```ts
const app = createNodeApp({ initialState: {} });
app.isNoColor; // boolean
```

This supports CI and accessibility tooling that relies on the
[no-color.org](https://no-color.org/) convention.

## Deprecated legacy path

Manual `createNodeBackend()` + `createApp()` (`@rezi-ui/core`) wiring is
deprecated for standard Node/Bun app construction. Prefer `createNodeApp()` from
`@rezi-ui/node` so app/core and backend settings stay aligned automatically.

## Native engine config passthrough

`createNodeApp({ config: { nativeConfig } })` forwards `nativeConfig` to the
native layer’s engine creation config.

Keys are forwarded as-is. If you want a close match to the engine’s public C structs, use `snake_case` field names:

```ts
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
  initialState: { count: 0 },
  config: {
    fpsCap: 60,
    nativeConfig: {
      target_fps: 60, // must match fpsCap when provided
      limits: {
        dl_max_total_bytes: 16 << 20,
      },
    },
  },
});
```

See:

- [Node/Bun backend](../backend/node.md)
- [Worker model](../backend/worker-model.md)
- [Engine config](../backend/engine-config.md)
