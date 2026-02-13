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

## Creating a backend

```ts
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend({
  fpsCap: 60,
});
```

Pass the backend into `createApp` from `@rezi-ui/core`. This backend is supported in Node.js and Bun runtimes.

## Native engine config passthrough

`createNodeBackend` accepts `nativeConfig`, a JSON-ish object forwarded to the native layer’s engine creation config.

Keys are forwarded as-is. If you want a close match to the engine’s public C structs, use `snake_case` field names:

```ts
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend({
  nativeConfig: {
    target_fps: 60,
    limits: {
      dl_max_total_bytes: 16 << 20,
    },
  },
});
```

See:

- [Node backend](../backend/node.md)
- [Worker model](../backend/worker-model.md)
- [Engine config](../backend/engine-config.md)
