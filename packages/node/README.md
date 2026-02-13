# @rezi-ui/node

Node.js/Bun backend for Rezi. This package owns:

- worker-thread engine ownership (native engine is never called on the main thread)
- frame scheduling and buffer pooling
- transfer of drawlists/events between core and the native addon

Typical usage:

```ts
import { createApp, ui } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";
```

Install:

```bash
npm i @rezi-ui/node
# or
bun add @rezi-ui/node
```

Docs: `https://rtlzeromemory.github.io/Rezi/`
