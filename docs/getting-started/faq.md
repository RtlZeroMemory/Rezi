# Frequently Asked Questions

## General

### What is Rezi?

Rezi is a code-first terminal UI framework for Node.js and Bun. It provides a declarative widget API for building rich terminal applications with features like automatic focus management, theming, and keyboard navigation.

### Is Rezi like React for the terminal?

No. While Rezi uses a declarative widget tree similar to React's component model, it has a fundamentally different architecture:

- No virtual DOM diffing — rendering goes through a binary drawlist protocol to a native C engine
- No React-style component lifecycle — the root `view` function is pure and stateless; stateful reusable widgets use `defineWidget` with hooks (`useState`, `useRef`, `useEffect`)
- Binary protocol boundary with the Zireael C engine for terminal I/O
- Deterministic rendering with no side effects in the view function

Rezi is designed specifically for terminal UIs, not as a React port.

### I'm using Ink. How do I migrate?

Use the [Ink to Rezi migration guide](../migration/ink-to-rezi.md) for a direct mental-model map and practical migration recipes.

### What platforms does Rezi support?

Rezi supports:

- **Linux**: x64, arm64 (glibc)
- **macOS**: x64 (Intel), arm64 (Apple Silicon)
- **Windows**: x64

Prebuilt native binaries are included for all supported platforms.

### What runtime versions are supported?

Rezi supports:

- Node.js 18+ (18.18+ recommended)
- Bun 1.3+

## Architecture

### Why does Rezi use a native C engine?

The Zireael C engine provides:

- Fast framebuffer diffing and terminal output
- Terminal capability detection
- Platform-specific optimizations
- A strict binary ABI boundary (drawlist in, events out)

This architecture enables high performance while keeping the TypeScript code portable.

### Does `@rezi-ui/core` work outside Node.js?

`@rezi-ui/core` is runtime-agnostic by design. It contains no Node.js-specific APIs (no `Buffer`, `worker_threads`, `fs`, etc.).

Node.js and Bun integration is provided by `@rezi-ui/node`. Additional backends for other runtimes (for example Deno) could be implemented using the same core package.

### What is the binary protocol?

Rezi uses two binary formats for communication with the native engine:

- **ZRDL** (Drawlist): Rendering commands sent from TypeScript to the engine
- **ZREV** (Event Batch): Input events sent from the engine to TypeScript

Both formats are versioned, little-endian, and 4-byte aligned. See the [Protocol documentation](../protocol/index.md) for details.

## Usage

### How do I update application state?

Use `app.update()` with either a new state object or an updater function:

```typescript
// Direct state
app.update({ count: 5 });

// Updater function (recommended for derived state)
app.update((prev) => ({ count: prev.count + 1 }));
```

Updates are batched and coalesced for efficiency.

### How do I handle keyboard input?

Use `app.keys()` to register keybindings:

```typescript
app.keys({
  "ctrl+s": () => save(),
  "ctrl+q": () => app.stop(),
  "j": () => moveDown(),
  "k": () => moveUp(),
});
```

For modal keybindings (like Vim modes), use `app.modes()`:

```typescript
app.modes({
  normal: {
    "i": () => app.setMode("insert"),
    "j": () => moveCursorDown(),
  },
  insert: {
    "escape": () => app.setMode("normal"),
  },
});
app.setMode("normal");
```

### How do I style widgets?

Use the `style` prop with RGB colors and text attributes:

```typescript
import { rgb } from "@rezi-ui/core";

ui.text("Error", {
  style: {
    fg: rgb(255, 100, 100),
    bold: true,
  },
});
```

Or use built-in themes:

```typescript
import { darkTheme, nordTheme } from "@rezi-ui/core";

app.setTheme(nordTheme);
```

### How do I show a modal dialog?

Use the `ui.layers()` and `ui.modal()` widgets:

```typescript
ui.layers([
  // Main content
  MainScreen(state),

  // Modal (conditionally rendered)
  state.showModal && ui.modal({
    id: "confirm",
    title: "Confirm Action",
    content: ui.text("Are you sure?"),
    actions: [
      ui.button({ id: "yes", label: "Yes", onPress: handleConfirm }),
      ui.button({ id: "no", label: "No", onPress: closeModal }),
    ],
    onClose: closeModal,
  }),
])
```

### How do I render a list efficiently?

For small lists, use `ui.column()` with mapped items:

```typescript
ui.column({}, items.map((item) => ui.text(item.name, { key: item.id })))
```

For large lists (hundreds or thousands of items), use `ui.virtualList()`:

```typescript
ui.virtualList({
  id: "items",
  items: largeList,
  itemHeight: 1,
  renderItem: (item, index, focused) =>
    ui.text(focused ? `> ${item.name}` : `  ${item.name}`),
})
```

## Debugging

### How do I debug rendering issues?

Enable the debug controller:

For normal apps, use `createNodeApp()`. `createNodeBackend()` is used here only
for advanced debug-controller wiring.

```typescript
import { createDebugController, categoriesToMask } from "@rezi-ui/core";
import { createNodeBackend } from "@rezi-ui/node";

const backend = createNodeBackend();
const debug = createDebugController({ backend: backend.debug });
await debug.enable({
  minSeverity: "info",
  categoryMask: categoriesToMask(["frame", "error"]),
});

// Pull recent records on demand:
const records = await debug.query({ maxRecords: 200 });
```

Use the debug panel widget:

```typescript
import { debugPanel } from "@rezi-ui/core";

ui.layers([
  MainContent(),
  debugPanel({ position: "bottom-right" }),
])
```

### My app is slow. How do I optimize it?

1. Use `virtualList` for long lists
2. Provide `key` props for dynamic lists to enable efficient reconciliation
3. Avoid creating new objects/functions in the view function
4. Check the debug controller for frame timing information

See the [Performance guide](../guide/performance.md) for detailed optimization strategies.

## Troubleshooting

### "Error: Cannot find module '@rezi-ui/native'"

This usually means the native addon failed to load. Check:

1. You have a supported platform (Linux/macOS/Windows x64 or arm64)
2. Node.js version is 18 or later (18.18+ recommended)
3. Try reinstalling: `npm install @rezi-ui/node`

### Colors don't display correctly

Your terminal may not support true color (24-bit RGB). Rezi requires a terminal with true color support.

Test your terminal:
```bash
printf "\x1b[38;2;255;100;0mTest\x1b[0m\n"
```

If this shows orange text, your terminal supports true color.

### Keybindings don't work

1. Ensure your keybindings are registered with `app.keys()` or `app.modes()`
2. Check if focus is on an input widget (inputs capture key events)
3. Verify the key syntax (e.g., `"ctrl+s"`, not `"Ctrl+S"`)

### Can I use React/JSX with Rezi?

Yes. Use `@rezi-ui/jsx`, the native JSX runtime that maps JSX elements directly to Rezi VNodes (no React required).

See the [JSX guide](jsx.md).

### How fast is Rezi compared to other terminal UI stacks?

It depends on the scenario and I/O mode. Rezi includes a benchmark suite that compares:

- Rezi (native)
- ratatui (Rust)
- blessed (Node.js)
- Ink

See the benchmark write-up for methodology, limitations, and the latest committed results: [benchmarks](../benchmarks.md).

### What is Zireael?

[Zireael](https://github.com/RtlZeroMemory/Zireael) is the C terminal rendering engine that powers Rezi. It handles all terminal I/O, framebuffer diffing, and rendering. Rezi communicates with Zireael via binary protocols (ZRDL drawlists and ZREV event batches).

## More Questions?

- Check the [documentation](../index.md)
- Open an issue on [GitHub](https://github.com/RtlZeroMemory/Rezi/issues)
