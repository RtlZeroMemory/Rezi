# Examples

This page lists the example apps that ship in the repository.

- `examples/hello-counter`: Minimal state, view, and button flow using the Node backend.
- `examples/raw-draw-demo`: Low-level `draw()` rendering example.
- `examples/gallery`: Widget gallery and scene library for widget demos.
- `examples/regression-dashboard`: Validation app used to exercise layout, rendering, and interaction behavior.

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
