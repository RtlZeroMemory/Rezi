# @rezi-ui/node

Node.js/Bun backend for Rezi. This package owns:

- worker-thread engine ownership (native engine is never called on the main thread)
- frame scheduling and buffer pooling
- transfer of drawlists/events between core and the native addon

Recommended usage:

```ts
import { createNodeApp } from "@rezi-ui/node";
```

Use `createNodeApp({ initialState, config })` as the default path. It wires
`@rezi-ui/core` and `@rezi-ui/node` with matched cursor protocol, event caps,
and fps settings.

Legacy `createNodeBackend() + createApp()` wiring is deprecated for standard
app construction.

Install:

```bash
npm i @rezi-ui/node
# or
bun add @rezi-ui/node
```

Docs: `https://rtlzeromemory.github.io/Rezi/`
