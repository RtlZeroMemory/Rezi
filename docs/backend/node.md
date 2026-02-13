# Node backend

The Node backend owns:

- worker-thread engine ownership (native engine is never called on the main thread)
- frame scheduling and buffer pooling
- transfer of drawlists to the engine and event batches back to core

Most apps should construct the app via:

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

`createNodeApp` is the recommended path because it keeps core/backend config
knobs aligned:

- `useV2Cursor` and drawlist v2 are paired automatically.
- `maxEventBytes` is applied to both app parsing and backend worker buffers.
- `fpsCap` is the single scheduling knob.

Legacy path deprecation:

- `createNodeBackend()` + `createApp()` manual pairing is deprecated for normal
  app setup.
- Use `createNodeApp()` so related runtime knobs cannot drift.
- If you still compose manually, Rezi throws deterministic `ZRUI_INVALID_PROPS`
  errors when cursor/event/fps settings conflict.

Next: [Worker model](worker-model.md).
