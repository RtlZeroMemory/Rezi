# Worker model

Rezi supports three backend execution modes via `config.executionMode`:

- `auto` (default): inline when `fpsCap <= 30`; otherwise prefer worker and fall back to inline when no TTY or `nativeShimModule` is available
- `worker`: run native engine/polling on a worker thread
- `inline`: run native engine inline on the main JS thread

Notes:

- Worker mode with the real native addon requires an interactive TTY.
- Headless tests can use `nativeShimModule` or `@rezi-ui/testkit` /
  `createTestRenderer()` instead of the real native backend.

High-level goals:

- worker offload when needed, inline fast path when appropriate
- deterministic backpressure when the app cannot keep up
- avoid unbounded queue growth

Related:

- [Node/Bun backend](node.md)
- [Native addon](native.md)
- [Event batches (ZREV)](../protocol/zrev.md)
