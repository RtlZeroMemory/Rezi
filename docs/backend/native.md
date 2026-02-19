# Native addon

`@rezi-ui/native` hosts the Zireael C engine behind Node-API (via `napi-rs`).

Responsibilities:

- enforce thread-safety invariants at the boundary
- expose a minimal surface for engine create/destroy and poll/submit
- ship prebuilt binaries for supported platforms

See also:

- [Node/Bun backend](node.md)
- [Worker model](worker-model.md)
- [Protocol overview](../protocol/index.md)
