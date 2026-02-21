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
  <a href="https://rezitui.dev/docs">
    <img src="https://github.com/RtlZeroMemory/Rezi/actions/workflows/docs.yml/badge.svg" alt="docs">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://rezitui.dev">Website</a> ·
  <a href="https://rezitui.dev/docs">Docs</a> ·
  <a href="https://rezitui.dev/docs/getting-started/quickstart/">Quickstart</a> ·
  <a href="https://rezitui.dev/docs/widgets/">Widgets</a> ·
  <a href="https://rezitui.dev/docs/api/">API</a> ·
  <a href="BENCHMARKS.md">Benchmarks</a>
</p>

---

> **Status: Alpha** — under active development. APIs may change between releases.

---

## What Rezi Can Do

Rezi is a high-performance terminal UI framework for TypeScript. You write declarative widget trees — a native C engine handles layout diffing and rendering.

- **56 built-in widgets** — layout primitives, form controls, data tables, virtual lists, navigation, overlays, a code editor, diff viewer, and more
- **Canvas drawing** — sub-character resolution via braille (2×4), sextant (2×3), quadrant (2×2), and halfblock (1×2) blitters; draw lines, shapes, and gradients within a single terminal cell grid
- **Charts & visualization** — line charts, scatter plots, heatmaps, sparklines, bar charts, gauges, and mini charts — all rendered at sub-character resolution
- **Inline image rendering** — display PNG, JPEG, and raw RGBA buffers using Kitty, Sixel, or iTerm2 graphics protocols, with automatic blitter fallback
- **Terminal auto-detection** — identifies Kitty, WezTerm, iTerm2, Ghostty, Windows Terminal, and tmux; enables the best graphics protocol automatically, with env-var overrides for any capability
- **Performance-focused architecture** — binary drawlists + native C framebuffer diffing; benchmark details and caveats are documented in the Benchmarks section
- **JSX without React** — optional `@rezi-ui/jsx` maps JSX directly to Rezi VNodes with zero React runtime overhead
- **Deterministic rendering** — same state + same events = same frames; versioned binary protocol, pinned Unicode tables
- **Hot state-preserving reload** — swap widget views or route tables in-process during development without losing app state or focus context
- **Syntax tokenizer utilities** — shared lexical highlighters for TypeScript/JS/JSON/Go/Rust/C/C++/C#/Java/Python/Bash with custom-tokenizer hooks
- **6 built-in themes** — dark, light, dimmed, high-contrast, nord, dracula; switch at runtime with one call
- **Record & replay** — capture input sessions as deterministic bundles for debugging and automated testing

---

## Showcase

### EdgeOps Control Plane

A production-style terminal control console built entirely with Rezi.

![Rezi EdgeOps demo](Assets/REZICONSOLE3.gif)

### Visual Stress Test

![Rezi benchmark demo](Assets/REZIBENCHMARK.gif)

### Image Rendering

![Rezi benchmark demo](Assets/RENDERING.png)

---

## How It Works

You write declarative widget trees in TypeScript.
Rezi computes layout and emits a compact binary drawlist (ZRDL).
A native C engine — [Zireael](https://github.com/RtlZeroMemory/Zireael) — diffs framebuffers and writes only changed cells to the terminal.

Most JavaScript TUI frameworks generate ANSI escape sequences in userland on every frame. Rezi moves the hot path out of JavaScript — rendering stays ergonomic at the top and fast on real workloads.

---

## Benchmarks

Two different benchmark datasets are committed and should not be mixed:

1. **Rigorous terminal suite** (replicates + confidence reporting): `benchmarks/2026-02-19-terminal-v3`
2. **Quick driver/framework matchups** (single replicate, directional): `benchmarks/2026-02-20-*`

From the **rigorous** suite (`benchmarks/2026-02-19-terminal-v3`), Rezi is:
- **7.3×–59.1× faster than Ink**
- **1.4×–52.5× faster than OpenTUI React**
- **1.9×–14.8× slower than native Rust (`ratatui`)** (expected for native baseline)

That suite uses `7` replicates with first-replicate discard (`6` measured), framework-order shuffling, CPU pinning, and confidence-aware ratio reporting.

From the **quick** matchup snapshots (directional only):
- Rezi vs OpenTUI React (`benchmarks/2026-02-20-rezi-opentui-react-all-quick-v6`): Rezi faster in `21/21` scenarios (geomean ~`10.4×`)
- Rezi vs OpenTUI Core (`benchmarks/2026-02-20-rezi-opentui-core-all-quick-v4`): Rezi faster in `19/21` scenarios (geomean ~`2.6×`)
- OpenTUI Core vs OpenTUI React: Core faster in `21/21` scenarios (geomean ~`4.0×`)
- Rezi vs Bubble Tea (`benchmarks/2026-02-20-rezi-opentui-bubbletea-core-all-quick-v3`): Rezi faster in `20/21` scenarios (geomean ~`8.5×`); Bubble Tea wins `scroll-stress`

Representative rows below are from the **rigorous** suite (OpenTUI column here means **OpenTUI React**):

| Scenario | Rezi | Ink | OpenTUI (React) | Ratatui | Rezi vs Ink | Rezi vs OpenTUI (React) | Rezi vs Ratatui |
|---|---:|---:|---:|---:|---:|---:|---:|
| `terminal-frame-fill` (1 dirty line) | 372 µs | 21.96 ms | 4.03 ms | 197 µs | 59.1× faster | 10.8× faster | 1.9× slower |
| `terminal-fps-stream` | 3.40 ms | 24.96 ms | 4.66 ms | 231 µs | 7.3× faster | 1.4× faster | 14.8× slower |
| `terminal-virtual-list` | 681 µs | 22.82 ms | 35.73 ms | 127 µs | 33.5× faster | 52.5× faster | 5.4× slower |

Full benchmark artifacts (methodology, confidence bands, and raw result tables):
- `BENCHMARKS.md`
- `benchmarks/2026-02-19-terminal-v3/results.md`
- `benchmarks/2026-02-20-rezi-opentui-react-all-quick-v6/results.md`
- `benchmarks/2026-02-20-rezi-opentui-core-all-quick-v4/results.md`
- `benchmarks/2026-02-20-rezi-opentui-bubbletea-core-all-quick-v3/results.md`

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

Starter templates: **EdgeOps control-plane dashboard** and **Visual benchmark stress test**.

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

**56 built-in widgets** — primitives (box, row, column, text, grid), form inputs (input, button, checkbox, select, slider), data display (table, virtual list, tree), navigation (tabs, accordion, breadcrumb, pagination), overlays (modal, dropdown, toast, command palette), advanced (code editor with built-in/custom syntax tokenization, diff viewer, file picker, logs console), and visualization (canvas, image, line chart, scatter, heatmap, sparkline, bar chart, gauge, mini chart).

### Graphics & Visualization

| Widget | Description |
|---|---|
| `ui.canvas` | Programmable drawing surface with braille, sextant, quadrant, halfblock, or ASCII blitters |
| `ui.image` | Inline images via Kitty, Sixel, iTerm2, or blitter fallback |
| `ui.lineChart` | Multi-series line charts at sub-character resolution |
| `ui.scatter` | Scatter plots with configurable point styles |
| `ui.heatmap` | Heatmap grids with automatic color scaling |
| `ui.sparkline` | Inline sparklines (text mode or high-res canvas mode) |
| `ui.barChart` | Horizontal bar charts |
| `ui.gauge` | Progress and percentage gauges |
| `ui.miniChart` | Compact inline charts |

### Terminal Graphics Protocol Support

Rezi auto-detects your terminal emulator and enables the best available graphics protocol:

| Terminal | Graphics Protocol | Hyperlinks (OSC 8) |
|---|---|---|
| Kitty | Kitty graphics | Yes |
| WezTerm | Sixel | Yes |
| iTerm2 | iTerm2 inline images | Yes |
| Ghostty | Kitty graphics | Yes |
| Windows Terminal | — | Yes |

Canvas and chart widgets work in **any** terminal via Unicode blitters — no graphics protocol required. Image widgets fall back to blitter rendering when no protocol is available.

Override any capability with environment variables:
`REZI_TERMINAL_SUPPORTS_KITTY`, `REZI_TERMINAL_SUPPORTS_SIXEL`, `REZI_TERMINAL_SUPPORTS_ITERM2`, `REZI_TERMINAL_SUPPORTS_OSC8`

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
- **Graphics**: For inline images, a terminal supporting Kitty graphics, Sixel, or iTerm2 inline images. Canvas and chart widgets work in any terminal via Unicode blitters.

Prebuilt native binaries are published for all supported platforms above. The
package does not compile from source at install time; for unsupported targets,
build from a repository checkout with `npm run build:native`.

## Documentation

| Resource | Link |
|---|---|
| Website & Docs | [rezitui.dev](https://rezitui.dev) |
| Getting started | [Install](https://rezitui.dev/docs/getting-started/install/) · [Quickstart](https://rezitui.dev/docs/getting-started/quickstart/) · [JSX](https://rezitui.dev/docs/getting-started/jsx/) |
| Guides | [Concepts](https://rezitui.dev/docs/guide/concepts/) · [Layout](https://rezitui.dev/docs/guide/layout/) · [Input & Focus](https://rezitui.dev/docs/guide/input-and-focus/) · [Styling](https://rezitui.dev/docs/guide/styling/) |
| Widget catalog | [56 widgets](https://rezitui.dev/docs/widgets/) |
| API reference | [TypeDoc](https://rezitui.dev/docs/api/) |
| Architecture | [Overview](https://rezitui.dev/docs/architecture/) · [Protocol](https://rezitui.dev/docs/protocol/) |

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
