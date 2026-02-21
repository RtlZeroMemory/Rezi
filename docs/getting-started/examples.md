# Examples

This page lists the runnable example apps that currently live in this repository.

## Runnable Repository Examples

- `examples/hello-counter`: Minimal state/view/button flow using the node backend.
- `examples/raw-draw-demo`: Low-level `draw()` rendering example.

## Run from Source

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
```

## Looking for Larger App Examples?

Use `create-rezi` templates (`dashboard`, `stress-test`, `cli-tool`, `minimal`) for full starter apps:

- [Create Rezi (canonical template overview)](create-rezi.md)
- [create-rezi package reference](../packages/create-rezi.md)

## Notes

- The runnable examples in `examples/` are the two apps listed above.
- Other docs may include inline snippets for concepts; those snippets are instructional, not tracked as standalone example packages.

## Next Steps

- [Quickstart](quickstart.md) - Build your first app
- [Widget Catalog](../widgets/index.md) - Browse available widgets
- [Keybindings](../guide/input-and-focus.md) - Advanced input handling
