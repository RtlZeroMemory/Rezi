# Node backend

The Node backend owns:

- native engine execution mode (`auto` | `worker` | `inline`)
- frame scheduling and buffer pooling
- transfer of drawlists to the engine and event batches back to core

Most apps should construct the app via:

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

`createNodeApp` is the recommended path because it keeps core/backend config
knobs aligned:

- `useV2Cursor` and drawlist v2 are paired automatically.
- `maxEventBytes` is applied to both app parsing and backend transport buffers.
- `fpsCap` is the single scheduling knob.
- `executionMode: "auto"` resolves to inline when `fpsCap <= 30`, worker otherwise.

Execution mode details:

- `auto` (default): select inline for low-fps workloads (`fpsCap <= 30`), worker otherwise.
- `worker`: force worker-thread engine execution.
- `inline`: run the engine inline on the Node main thread.

Emoji width policy:

- `emojiWidthPolicy` keeps core text measurement and native rendering aligned.
- Allowed values:
  - `"auto"` (default): resolve from native overrides/env, optional probe, then fallback to `"wide"`.
  - `"wide"`: emoji clusters occupy at least 2 cells.
  - `"narrow"`: emoji clusters occupy at least 1 cell.
- Native overrides (`nativeConfig.widthPolicy` / `width_policy`) must match explicit policy values.
- Optional terminal probe is disabled by default and only runs when
  `ZRUI_EMOJI_WIDTH_PROBE=1` (opt-in to avoid startup input races).

Legacy path deprecation:

- `createNodeBackend()` + `createApp()` manual pairing is deprecated for normal
  app setup.
- Use `createNodeApp()` so related runtime knobs cannot drift.
- If you still compose manually, Rezi throws deterministic `ZRUI_INVALID_PROPS`
  errors when cursor/event/fps settings conflict.

Next: [Worker model](worker-model.md).
