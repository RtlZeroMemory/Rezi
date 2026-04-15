# Rezi

Rezi is a code-first terminal UI framework for Node.js and Bun. It uses a declarative widget API, deterministic input routing, and native-backed rendering through the [Zireael](https://github.com/RtlZeroMemory/Zireael) C engine.

> **Status: pre-alpha**. Rezi is under active development. Public APIs, ABI details, and behavior may change between releases. It is not yet recommended for production workloads.

## Focus

- `ui.*` widget factories as the canonical API
- deterministic rendering and event routing
- native-backed layout and framebuffer diffing
- explicit focus, forms, routing, and theme control
- optional JSX support through `@rezi-ui/jsx`

## Architecture

| Layer | Purpose |
|---|---|
| `@rezi-ui/core` | Runtime-agnostic widget API, layout, routing, focus, forms, themes, testing hooks |
| `@rezi-ui/node` | Node.js/Bun backend, terminal I/O, scheduling, native engine integration |
| `@rezi-ui/native` | N-API binding to the Zireael engine |
| `@rezi-ui/jsx` | Optional JSX runtime over the core widget API |

## Getting Started

<div class="grid cards" markdown>

-   :material-download:{ .lg .middle } **Install**

    ---

    Install Rezi and set up your first project.

    [:octicons-arrow-right-24: Installation](getting-started/install.md)

-   :material-clock-fast:{ .lg .middle } **Quickstart**

    ---

    Build a minimal Rezi application.

    [:octicons-arrow-right-24: Quickstart](getting-started/quickstart.md)

-   :material-widgets:{ .lg .middle } **Widgets**

    ---

    Browse the widget catalog and stability tiers.

    [:octicons-arrow-right-24: Widget Catalog](widgets/index.md)

-   :material-movie-open:{ .lg .middle } **Templates**

    ---

    Review the public starter set: `minimal`, `cli-tool`, and `starship`.

    [:octicons-arrow-right-24: Create Rezi](getting-started/create-rezi.md)

-   :material-flask-outline:{ .lg .middle } **Examples**

    ---

    Review the curated public examples and the reference app split.

    [:octicons-arrow-right-24: Examples](getting-started/examples.md)

-   :material-chart-line:{ .lg .middle } **Benchmarks**

    ---

    Review the benchmark methodology and results.

    [:octicons-arrow-right-24: Benchmarks](benchmarks.md)

</div>

## Public Templates

- `minimal` - single-screen utility starter
- `cli-tool` - routed multi-screen workflow starter
- `starship` - advanced console starter with tabs, charts, overlays, and broad widget coverage

## Example Surfaces

- Curated public examples: `examples/hello-counter`, `examples/raw-draw-demo`, `examples/gallery`
- Internal/reference example: `examples/regression-dashboard`

## Core Concepts

### State-Driven Rendering

Rezi applications are state-driven. You define a `view` function that returns a widget tree based on application state:

```typescript
type State = { items: string[]; selected: number };

app.view((state) =>
  ui.column({ gap: 1 },
    state.items.map((item, i) =>
      ui.text(i === state.selected ? `> ${item}` : `  ${item}`, {
        key: String(i),
      })
    )
  )
);
```

### State Updates

Update state with `app.update()`. Updates are batched and coalesced for efficiency:

```typescript
app.update((prev) => ({ ...prev, selected: prev.selected + 1 }));
```
