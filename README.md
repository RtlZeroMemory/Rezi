<h1 align="center">Rezi</h1>

<p align="center">
  <strong>TypeScript TUI, Near-Native Performance.</strong><br/>
  High-level developer experience powered by a deterministic C rendering engine.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rezi-ui/core">
    <img src="https://img.shields.io/npm/v/@rezi-ui/core.svg" alt="npm version">
  </a>
  <a href="https://github.com/RtlZeroMemory/Rezi/actions/workflows/ci.yml">
    <img src="https://github.com/RtlZeroMemory/Rezi/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://rtlzeromemory.github.io/Rezi/">
    <img src="https://github.com/RtlZeroMemory/Rezi/actions/workflows/docs.yml/badge.svg" alt="docs">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://rtlzeromemory.github.io/Rezi/">Docs</a> ·
  <a href="https://rtlzeromemory.github.io/Rezi/getting-started/quickstart/">Quickstart</a> ·
  <a href="https://rtlzeromemory.github.io/Rezi/widgets/">Widgets</a> ·
  <a href="https://rtlzeromemory.github.io/Rezi/api/">API</a> ·
  <a href="BENCHMARKS.md">Benchmarks</a>
</p>

---

> **Status: Alpha** — under active development. APIs may change between releases.

---

## Showcase — EdgeOps Control Plane

A production-style terminal control console built entirely with Rezi.

![Rezi demo](Assets/REZICONSOLE3.gif)

---

## What is Rezi?

Rezi is a high-performance terminal UI framework for **TypeScript**.

You write declarative widget trees in TypeScript.  
Rezi computes layout and emits a compact binary drawlist (ZRDL).  
A native C engine — [Zireael](https://github.com/RtlZeroMemory/Zireael) — diffs framebuffers and writes only changed cells to the terminal.

The result:

- TypeScript ergonomics  
- Deterministic rendering  
- Near-native performance  
- No React runtime  
- No virtual DOM overhead  

---

## Why Rezi?

Most JavaScript terminal frameworks generate ANSI escape sequences in userland on every update. Rendering cost scales with tree size and update frequency.

Rezi moves the hot path out of JavaScript.

1. **Application code** builds a declarative widget tree.
2. **@rezi-ui/core** computes layout and encodes a compact binary drawlist.
3. **Zireael (C engine)** diffs framebuffer state and writes only changed cells.

Rendering remains ergonomic at the top and fast on real terminal workloads.

In the latest PTY-mode benchmark suite (120×40 viewport, `benchmarks/2026-02-19-terminal-v3`), Rezi is:
- **7.3×–59.1× faster than Ink**
- **1.4×–52.5× faster than OpenTUI**
- **1.9×–14.8× slower than native Rust (`ratatui`)** (expected for native baseline)

This run uses `7` replicates with first-replicate discard (`6` measured), framework-order shuffling, CPU pinning, and CI/range reporting in the generated markdown.

These benchmark numbers are a snapshot, not a final ceiling. Optimization work is ongoing during development, and we expect to keep improving performance while gradually narrowing the gap to pure native renderers.

| Scenario | Rezi | Ink | OpenTUI | Rezi vs Ink | Rezi vs OpenTUI |
|---|---:|---:|---:|---:|---:|
| `terminal-rerender` | 316 µs | 17.54 ms | 2.57 ms | 55.5× faster | 8.1× faster |
| `terminal-frame-fill` (1 dirty line) | 372 µs | 21.96 ms | 4.03 ms | 59.1× faster | 10.8× faster |
| `terminal-frame-fill` (40 dirty lines) | 679 µs | 22.08 ms | 3.92 ms | 32.5× faster | 5.8× faster |
| `terminal-screen-transition` | 749 µs | 22.14 ms | 4.56 ms | 29.6× faster | 6.1× faster |
| `terminal-fps-stream` | 3.40 ms | 24.96 ms | 4.66 ms | 7.3× faster | 1.4× faster |
| `terminal-input-latency` | 659 µs | 22.32 ms | 4.24 ms | 33.9× faster | 6.4× faster |
| `terminal-memory-soak` | 641 µs | 22.09 ms | 4.62 ms | 34.4× faster | 7.2× faster |
| `terminal-virtual-list` | 681 µs | 22.82 ms | 35.73 ms | 33.5× faster | 52.5× faster |
| `terminal-table` | 400 µs | 21.46 ms | 3.82 ms | 53.6× faster | 9.5× faster |

Native baseline reference (`ratatui`), reported separately to keep the React-in-terminal comparison focused:

| Scenario | Rezi | Ratatui | Rezi vs Ratatui |
|---|---:|---:|---:|
| `terminal-rerender` | 316 µs | 75 µs | 4.2× slower |
| `terminal-frame-fill` (1 dirty line) | 372 µs | 197 µs | 1.9× slower |
| `terminal-frame-fill` (40 dirty lines) | 679 µs | 213 µs | 3.2× slower |
| `terminal-screen-transition` | 749 µs | 282 µs | 2.7× slower |
| `terminal-fps-stream` | 3.40 ms | 231 µs | 14.8× slower |
| `terminal-input-latency` | 659 µs | 199 µs | 3.3× slower |
| `terminal-memory-soak` | 641 µs | 209 µs | 3.1× slower |
| `terminal-virtual-list` | 681 µs | 127 µs | 5.4× slower |
| `terminal-table` | 400 µs | 175 µs | 2.3× slower |

Full methodology and reproduction steps:  
👉 **[BENCHMARKS.md](BENCHMARKS.md)**

---

## Quick Start

Get running in under a minute:

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

Starter template: **EdgeOps control-plane dashboard**

---

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

Install:

```bash
npm install @rezi-ui/core @rezi-ui/node
```

---

### JSX (No React Runtime)

`@rezi-ui/jsx` maps JSX directly to Rezi VNodes.

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
      <Button
        id="inc"
        label="+1"
        onPress={() => app.update((prev) => ({ count: prev.count + 1 }))}
      />
    </Row>
  </Column>
));

app.keys({ q: () => app.stop() });
await app.start();
```

```bash
npm install @rezi-ui/jsx @rezi-ui/core @rezi-ui/node
```

---

## Features

**54 built-in widgets** — primitives (box, row, column, text, grid), form inputs (input, button, checkbox, select, slider), data display (table, virtual list, tree), navigation (tabs, accordion, breadcrumb, pagination), overlays (modal, dropdown, toast, command palette), advanced (code editor, diff viewer, file picker, logs console), and charts (gauge, sparkline, bar chart).

### Focus & Input
- Automatic tab navigation
- Focus traps for modals
- Global keybindings
- Vim-style and chord sequences
- Mouse support (click, scroll, drag)

### Theming
Six built-in themes:
`dark`, `light`, `dimmed`, `high-contrast`, `nord`, `dracula`

Switch at runtime:

```ts
app.setTheme("nord");
```

### Deterministic Rendering
- Same state + same events = same frames
- Versioned binary protocol
- Pinned Unicode version
- Strict update semantics

### Record & Replay
Capture input sessions as deterministic bundles for debugging and testing.

---

## Who is Rezi for?

Rezi is built for:

- Real-time dashboards
- Developer tooling
- Control planes
- Log viewers
- Terminal-first applications
- Teams who want TypeScript ergonomics without sacrificing performance

---

## Architecture

Rezi separates authoring from rendering:

```
Application Code (TypeScript)
        │
        ▼
@rezi-ui/core      Layout, widgets, protocol builders
        │ ZRDL drawlist
        ▼
@rezi-ui/node      Node.js/Bun backend
        │
        ▼
@rezi-ui/native    N-API binding
        │
        ▼
Zireael (C engine) Framebuffer diff, ANSI emission
        │
        ▼
Terminal
```

Data flows down as drawlists (ZRDL).  
Input events flow up as event batches (ZREV).  
Both are versioned binary formats validated at the boundary.

---

## Packages

| Package | Description |
|---|---|
| `@rezi-ui/core` | Runtime-agnostic widgets, layout, themes |
| `@rezi-ui/node` | Node.js/Bun backend |
| `@rezi-ui/native` | N-API binding to Zireael |
| `@rezi-ui/jsx` | JSX runtime (no React) |
| `@rezi-ui/testkit` | Testing utilities |
| `create-rezi` | Project scaffolding CLI |

---

## Requirements

- **Runtime**: Node.js 18+ (18.18+ recommended) or Bun 1.3+
- **Platforms**: Linux x64/arm64, macOS x64/arm64, Windows x64/arm64
- **Terminal**: 256-color or true-color support recommended

Prebuilt native binaries are published for all supported platforms above. The
package does not compile from source at install time; for unsupported targets,
build from a repository checkout with `npm run build:native`.

## Documentation

| Resource | Link |
|---|---|
| Docs home | [rtlzeromemory.github.io/Rezi](https://rtlzeromemory.github.io/Rezi/) |
| Getting started | [Install](https://rtlzeromemory.github.io/Rezi/getting-started/install/) · [Quickstart](https://rtlzeromemory.github.io/Rezi/getting-started/quickstart/) · [JSX](https://rtlzeromemory.github.io/Rezi/getting-started/jsx/) |
| Guides | [Concepts](https://rtlzeromemory.github.io/Rezi/guide/concepts/) · [Layout](https://rtlzeromemory.github.io/Rezi/guide/layout/) · [Input & Focus](https://rtlzeromemory.github.io/Rezi/guide/input-and-focus/) · [Styling](https://rtlzeromemory.github.io/Rezi/guide/styling/) |
| Widget catalog | [54 widgets](https://rtlzeromemory.github.io/Rezi/widgets/) |
| API reference | [TypeDoc](https://rtlzeromemory.github.io/Rezi/api/) |
| Architecture | [Overview](https://rtlzeromemory.github.io/Rezi/architecture/) · [Protocol](https://rtlzeromemory.github.io/Rezi/protocol/) |

## Contributing

```bash
git clone https://github.com/RtlZeroMemory/Rezi.git
cd Rezi
git submodule update --init --recursive
npm ci
npm run build
npm test
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

Apache-2.0
