# Examples

This page lists the source examples that ship in the repository.

## Example apps

- `examples/hello-counter`: Minimal state, view, and button flow using the Node backend.
- `examples/raw-draw-demo`: Low-level `draw()` rendering example.
- `examples/gallery`: Widget gallery and scene library for widget demos.

## Validation surface

- `examples/regression-dashboard`: Dashboard used to exercise layout, rendering, focus, and interaction behavior after framework changes. It is not intended as a first Rezi example; start with `npm create rezi`, `examples/hello-counter`, or `examples/gallery` when learning the framework.

## Run from source

Clone and build the workspace:

```bash
git clone https://github.com/RtlZeroMemory/Rezi.git
cd Rezi
git submodule update --init --recursive
npm ci
npm run build
npm run build:native
```

Run the examples:

```bash
node examples/hello-counter/dist/index.js
node examples/raw-draw-demo/dist/index.js
node examples/gallery/dist/index.js
```

## Related guides

- [Create Rezi](create-rezi.md) - Public starter templates
- [Quickstart](quickstart.md) - Build your first app
- [Widget Catalog](../widgets/index.md) - Browse available widgets
- [Keybindings](../guide/input-and-focus.md) - Advanced input handling
