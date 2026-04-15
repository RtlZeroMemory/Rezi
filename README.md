# Rezi

Rezi is a deterministic, native-backed TypeScript TUI framework for Node.js and Bun.

> **Status: pre-alpha**. Rezi is under active development. Public APIs, ABI details, and behavior may change between releases. It is not yet recommended for production workloads.

Rezi is built for terminal applications that need predictable rendering, explicit input routing, and a strong testing surface. The canonical API is `ui.*`; JSX support is available through `@rezi-ui/jsx`.

## Focus

- Deterministic rendering and input routing
- Native-backed layout and framebuffer diffing through Zireael
- Focus, forms, routing, themes, and testing primitives
- A small public template set for scaffolding and examples

## Performance

Rezi is built to stay fast on real terminal workloads. Benchmark methodology, results, and caveats are documented in [BENCHMARKS.md](BENCHMARKS.md) and [docs/benchmarks.md](docs/benchmarks.md).

## Quick Start

```bash
npm create rezi my-app
cd my-app
npm run start
```

Or with Bun:

```bash
bun create rezi my-app
cd my-app
bun run start
```

Public starter templates:

- `minimal` - single-screen utility starter
- `cli-tool` - routed multi-screen workflow starter
- `starship` - advanced console starter with tabs, charts, overlays, and broad widget coverage

See [docs/getting-started/create-rezi.md](docs/getting-started/create-rezi.md) for the public template guide.

## Example

```ts
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp<{ count: number }>({ initialState: { count: 0 } });

app.view((state) =>
  ui.page({
    p: 1,
    gap: 1,
    header: ui.header({ title: "Counter" }),
    body: ui.panel("Count", [
      ui.row({ gap: 1, items: "center" }, [
        ui.text(String(state.count), { variant: "heading" }),
        ui.spacer({ flex: 1 }),
        ui.button({
          id: "inc",
          label: "+1",
          intent: "primary",
          onPress: () => app.update((prev) => ({ count: prev.count + 1 })),
        }),
      ]),
    ]),
  })
);

app.keys({ q: () => app.stop() });
await app.start();
```

Install:

```bash
npm install @rezi-ui/core @rezi-ui/node
```

## Architecture

| Layer | Purpose |
|---|---|
| `@rezi-ui/core` | Runtime-agnostic widget API, layout, routing, focus, forms, themes, testing hooks |
| `@rezi-ui/node` | Node.js/Bun backend, terminal I/O, scheduling, native engine integration |
| `@rezi-ui/native` | N-API binding to the Zireael engine |
| `@rezi-ui/jsx` | Optional JSX runtime over the core widget API |

## Docs

- [Install](docs/getting-started/install.md)
- [Quickstart](docs/getting-started/quickstart.md)
- [Widget catalog](docs/widgets/index.md)
- [Examples](docs/getting-started/examples.md)
- [Benchmarks](docs/benchmarks.md)
