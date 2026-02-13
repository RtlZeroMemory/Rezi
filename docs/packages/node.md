# `@rezi-ui/node`

Node/Bun backend package:

- worker-thread engine ownership
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
- A worker-thread model where the engine runs off the main thread
- A stable message protocol between main thread and worker
- Integration with `@rezi-ui/native` (prebuilt binaries when available)

## Creating an app (recommended)

```ts
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp({
  initialState: { count: 0 },
  config: {
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

## Deprecated legacy path

Manual `createNodeBackend()` + `createApp()` wiring is deprecated for standard
Node/Bun app construction. Prefer `createNodeApp()` so app/core and backend
settings stay aligned automatically.

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

- [Node backend](../backend/node.md)
- [Worker model](../backend/worker-model.md)
- [Engine config](../backend/engine-config.md)
