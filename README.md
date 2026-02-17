<h1 align="center">Rezi</h1>

<p align="center">
  <strong>Terminal UI framework for TypeScript with a native rendering engine.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rezi-ui/core"><img src="https://img.shields.io/npm/v/@rezi-ui/core.svg" alt="npm version"></a>
  <a href="https://github.com/RtlZeroMemory/Rezi/actions/workflows/ci.yml"><img src="https://github.com/RtlZeroMemory/Rezi/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://rtlzeromemory.github.io/Rezi/"><img src="https://github.com/RtlZeroMemory/Rezi/actions/workflows/docs.yml/badge.svg" alt="docs"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="https://rtlzeromemory.github.io/Rezi/">Docs</a> ·
  <a href="https://rtlzeromemory.github.io/Rezi/getting-started/quickstart/">Quickstart</a> ·
  <a href="https://rtlzeromemory.github.io/Rezi/widgets/">Widgets</a> ·
  <a href="https://rtlzeromemory.github.io/Rezi/api/">API Reference</a> ·
  <a href="BENCHMARKS.md">Benchmarks</a>
</p>

> **Status: Alpha** — under active development. APIs may change between releases.

Rezi is a TypeScript terminal UI framework for Node.js and Bun. You write declarative widget trees in TypeScript; Rezi computes layout, emits binary drawlists, and delegates framebuffer diffing and terminal output to [Zireael](https://github.com/RtlZeroMemory/Zireael), a purpose-built C rendering engine.

The result: TypeScript ergonomics with rendering performance in the same class as native TUIs.

![Rezi overview](Assets/REZI_MAIN.png)

![Rezi core demo](Assets/REZICORE.gif)

---

## Quick Start

```bash
npm create rezi my-app
cd my-app
npm start
```

Or with Bun:

```bash
bun create rezi my-app
cd my-app
bun start
```

Four starter templates: `dashboard`, `form-app`, `file-browser`, `streaming-viewer`.

## Example

### `ui.*` API

```ts
import { ui } from "@rezi-ui/core";
import { createNodeApp } from "@rezi-ui/node";

const app = createNodeApp<{ count: number }>({
  initialState: { count: 0 },
});

app.view((s) =>
  ui.column({ p: 1, gap: 1 }, [
    ui.text("Counter", { style: { bold: true } }),
    ui.row({ gap: 2 }, [
      ui.text(`Count: ${s.count}`),
      ui.button("inc", "+1", {
        onPress: () => app.update((prev) => ({ count: prev.count + 1 })),
      }),
    ]),
  ]),
);

app.keys({ q: () => app.stop() });
await app.start();
```

```bash
npm install @rezi-ui/core @rezi-ui/node
```

### JSX (no React)

`@rezi-ui/jsx` maps JSX syntax directly to Rezi VNodes — no React runtime involved.

```tsx
/** @jsxImportSource @rezi-ui/jsx */
import { createNodeApp } from "@rezi-ui/node";
import { Column, Row, Text, Button } from "@rezi-ui/jsx";

const app = createNodeApp<{ count: number }>({
  initialState: { count: 0 },
});

app.view((s) => (
  <Column p={1} gap={1}>
    <Text style={{ bold: true }}>Counter</Text>
    <Row gap={2}>
      <Text>Count: {s.count}</Text>
      <Button id="inc" label="+1" onPress={() => app.update((prev) => ({ count: prev.count + 1 }))} />
    </Row>
  </Column>
));

app.keys({ q: () => app.stop() });
await app.start();
```

```bash
npm install @rezi-ui/jsx @rezi-ui/core @rezi-ui/node
```

## Why Rezi?

Most JavaScript terminal frameworks generate ANSI escape sequences in userland on every update. This works, but rendering cost scales with tree size and update frequency.

Rezi takes a different approach:

1. **Your code** builds a declarative widget tree in TypeScript.
2. **Rezi** computes layout and encodes a compact binary drawlist (ZRDL).
3. **Zireael** (native C engine) diffs framebuffer state and writes only changed cells to the terminal.

This keeps authoring ergonomic while moving the hot rendering path to native code. In our PTY-mode benchmark suite (`120x40` viewport), Rezi is ~2x–5x from a native Rust baseline (ratatui) and 30x–50x ahead of Ink:

| Scenario | ratatui (Rust) | Rezi | Ink |
|---|---:|---:|---:|
| `terminal-rerender` | 74 µs | 322 µs | 16.39 ms |
| `terminal-frame-fill` (1 dirty line) | 197 µs | 567 µs | 17.73 ms |
| `terminal-frame-fill` (40 dirty lines) | 211 µs | 610 µs | 17.66 ms |
| `terminal-virtual-list` | 126 µs | 584 µs | 18.88 ms |
| `terminal-table` | 178 µs | 493 µs | 17.44 ms |

Full methodology, caveats, and reproduction steps: **[BENCHMARKS.md](BENCHMARKS.md)**

## Features

**49 built-in widgets** — primitives (box, row, column, text), form inputs (input, button, checkbox, select, slider), data display (table, virtual list, tree), overlays (modal, dropdown, toast, command palette), advanced (code editor, diff viewer, file picker, logs console), and charts (gauge, sparkline, bar chart).

**Focus management** — automatic Tab/Shift+Tab navigation, focus zones, focus traps for modals, and mouse click-to-focus.

**Keybindings** — global shortcuts, modal modes (Vim-style `g g`, Emacs-style `C-x C-s`), and chord sequences.

**Theming** — six built-in themes (dark, light, dimmed, high-contrast, nord, dracula) with semantic color tokens. Switch at runtime with `app.setTheme()`.

**Mouse support** — click to focus, scroll wheel for lists and editors, drag to resize split panes. Detected automatically.

**Composition** — `defineWidget` provides stateful reusable components with hooks (`useState`, `useRef`, `useEffect`).

**Deterministic rendering** — same state + same events = same frames. Pinned Unicode version, versioned binary protocols, strict update semantics.

**Record & replay** — capture input sessions as deterministic bundles for testing and debugging.

## Architecture

```
  Application Code
        │
        ▼
  @rezi-ui/core          Runtime-agnostic: widgets, layout, themes,
        │                keybindings, forms, protocol builders
        │ ZRDL drawlist
        ▼
  @rezi-ui/node          Node.js/Bun backend: worker thread, event loop,
        │                SharedArrayBuffer transport
        ▼
  @rezi-ui/native        N-API addon (napi-rs) binding to Zireael
        │
        ▼
  Zireael (C engine)     Framebuffer diff, ANSI emission, terminal I/O
        │ ZREV events
        ▲
      Terminal
```

Data flows down as drawlists (ZRDL). Input events flow up as event batches (ZREV). Both are versioned, little-endian binary formats validated at the boundary.

## Packages

| Package | Description |
|---|---|
| [`@rezi-ui/core`](https://www.npmjs.com/package/@rezi-ui/core) | Widgets, layout, themes, keybindings, forms. Runtime-agnostic — no Node.js APIs. |
| [`@rezi-ui/node`](https://www.npmjs.com/package/@rezi-ui/node) | Node.js/Bun backend with worker and inline execution modes. |
| [`@rezi-ui/native`](https://www.npmjs.com/package/@rezi-ui/native) | N-API addon binding to the Zireael C rendering engine. |
| [`@rezi-ui/jsx`](https://www.npmjs.com/package/@rezi-ui/jsx) | JSX runtime mapping to Rezi VNodes. No React. |
| [`@rezi-ui/testkit`](https://www.npmjs.com/package/@rezi-ui/testkit) | Test utilities, fixtures, and golden test helpers. |
| [`create-rezi`](https://www.npmjs.com/package/create-rezi) | Project scaffolding CLI. |

## Requirements

- **Runtime**: Node.js 18+ (18.18+ recommended) or Bun 1.3+
- **Platforms**: Linux x64/arm64, macOS x64/arm64, Windows x64
- **Terminal**: 256-color or true-color support recommended

Prebuilt native binaries are published for all supported platforms. If a prebuilt binary is unavailable, the package falls back to compiling from source (requires a C toolchain).

## Documentation

| Resource | Link |
|---|---|
| Docs home | [rtlzeromemory.github.io/Rezi](https://rtlzeromemory.github.io/Rezi/) |
| Getting started | [Install](https://rtlzeromemory.github.io/Rezi/getting-started/install/) · [Quickstart](https://rtlzeromemory.github.io/Rezi/getting-started/quickstart/) · [JSX](https://rtlzeromemory.github.io/Rezi/getting-started/jsx/) |
| Guides | [Concepts](https://rtlzeromemory.github.io/Rezi/guide/concepts/) · [Layout](https://rtlzeromemory.github.io/Rezi/guide/layout/) · [Input & Focus](https://rtlzeromemory.github.io/Rezi/guide/input-and-focus/) · [Styling](https://rtlzeromemory.github.io/Rezi/guide/styling/) |
| Widget catalog | [49 widgets](https://rtlzeromemory.github.io/Rezi/widgets/) |
| API reference | [TypeDoc](https://rtlzeromemory.github.io/Rezi/api/) |
| Architecture | [Overview](https://rtlzeromemory.github.io/Rezi/architecture/) · [Protocol](https://rtlzeromemory.github.io/Rezi/protocol/) |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version:

```bash
git clone https://github.com/RtlZeroMemory/Rezi.git
cd Rezi && git submodule update --init --recursive
npm ci && npm run build && npm test
```

## License

[Apache-2.0](LICENSE)
