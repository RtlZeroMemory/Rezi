# Worker model

Rezi supports three backend execution modes via `config.executionMode`:

- `auto` (default): inline when `fpsCap <= 30`, worker otherwise
- `worker`: run native engine/polling on a worker thread
- `inline`: run native engine inline on the main JS thread

High-level goals:

- worker offload when needed, inline fast path when appropriate
- deterministic backpressure when the app cannot keep up
- avoid unbounded queue growth

Related:

- [Node/Bun backend](node.md)
- [Native addon](native.md)
- [Event batches (ZREV)](../protocol/zrev.md)
