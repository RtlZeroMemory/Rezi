# Rezi

Rezi is a TypeScript framework for building terminal user interfaces on Node.js and Bun. It provides a declarative widget API, deterministic input and rendering behavior, and a native-backed rendering pipeline through the native Zireael engine written in C. 

https://github.com/RtlZeroMemory/Zireael

> **Status: pre-alpha.** Rezi is under active development. Public APIs, native ABI details, and behavior may change between releases. It is not yet recommended for production workloads.

**Links:** [Website](https://rezitui.dev/) · [Docs](https://rezitui.dev/docs/) · [Quickstart](https://rezitui.dev/docs/getting-started/quickstart/) · [Widgets](https://rezitui.dev/docs/widgets/) · [Benchmarks](https://rezitui.dev/docs/benchmarks/)

## What Rezi Is For

Rezi is aimed at terminal applications that need more than line-oriented output: multi-panel layouts, routed screens, focusable controls, forms, tables, overlays, testing support, and predictable behavior under keyboard and mouse input.

The canonical authoring surface is `ui.*`. JSX is available through `@rezi-ui/jsx`, but the framework does not depend on React.

## What Rezi Includes

- Layout primitives for rows, columns, grids, panels, spacing, and layered screens
- Interactive widgets such as buttons, inputs, selects, checkboxes, radios, sliders, tabs, tables, virtual lists, trees, dialogs, dropdowns, and toasts
- Graphics and data-display widgets including canvas, charts, gauges, sparklines, heatmaps, and image support
- Application primitives for focus management, keybindings, routing, theming, and controlled state updates
- Testing utilities and deterministic rendering behavior intended to make TUI code easier to verify
- A native-backed rendering path through Zireael for layout, framebuffer diffing, and terminal output

## Example

```ts
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

type State = { count: number };

const app = createNodeApp<State>({ initialState: { count: 0 } });

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
          onPress: () => app.update((s) => ({ count: s.count + 1 })),
        }),
      ]),
    ]),
  }),
);

app.keys({ q: () => app.stop() });
await app.run();
```

Install:

```bash
npm install @rezi-ui/core @rezi-ui/node
```

## Quick Start

```bash
npm create rezi my-app
cd my-app
npm run start
```

With Bun:

```bash
bun create rezi my-app
cd my-app
bun run start
```

## Public Templates

- `minimal` - small single-screen starter
- `cli-tool` - routed multi-screen workflow starter
- `starship` - larger console-style starter showing tabs, charts, forms, and overlays

## Packages

| Package | Purpose |
|---|---|
| `@rezi-ui/core` | Widget API, layout, routing, focus, forms, themes, testing hooks |
| `@rezi-ui/node` | Node/Bun backend, terminal I/O, scheduling, native integration |
| `@rezi-ui/native` | N-API binding to the Zireael engine |
| `@rezi-ui/jsx` | Optional JSX runtime over the core API |
| `@rezi-ui/testkit` | Testing utilities |
| `create-rezi` | Project scaffolding CLI |

## Performance

Rezi is designed to stay fast on structured terminal workloads. Benchmark methodology, caveats, and committed result snapshots are documented in [BENCHMARKS.md](BENCHMARKS.md) and [docs/benchmarks.md](docs/benchmarks.md).

## Documentation

- [Install](docs/getting-started/install.md)
- [Quickstart](docs/getting-started/quickstart.md)
- [Create Rezi](docs/getting-started/create-rezi.md)
- [Widget Catalog](docs/widgets/index.md)
- [Examples](docs/getting-started/examples.md)
- [Architecture](docs/architecture/index.md)
- [Benchmarks](docs/benchmarks.md)
