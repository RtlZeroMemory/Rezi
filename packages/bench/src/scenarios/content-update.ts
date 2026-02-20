/**
 * Scenario: Content Update (Diff Efficiency)
 *
 * Tests the real-world pattern of partial content changes:
 * a large rendered screen where only a few cells change per frame.
 * This directly measures diff/patch efficiency — the most important
 * performance characteristic for interactive TUIs.
 *
 * Setup: Render a 500-row list (typical log viewer / file browser).
 * Each update changes only the selection highlight (1-2 rows move),
 * simulating arrow-key navigation through a list.
 *
 * This penalizes frameworks that re-render everything on every update
 * and rewards frameworks with efficient diffing (Rezi, terminal-kit).
 */

import { type VNode, ui } from "@rezi-ui/core";
import { BenchBackend, MeasuringStream, NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { benchAsync, benchSync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

const LIST_SIZE = 500;

// ── Rezi: list with movable selection ────────────────────────────────

function reziListTree(selected: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < LIST_SIZE; i++) {
    const isSelected = i === selected;
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(isSelected ? ">" : " ", {
          style: { bold: isSelected },
        }),
        ui.text(`${String(i).padStart(3, " ")}.`, { style: { dim: !isSelected } }),
        ui.text(`entry-${i}.log`, {
          style: { bold: isSelected, inverse: isSelected },
        }),
        ui.text(`${(i * 1024 + 512).toLocaleString()} B`, { style: { dim: true } }),
      ]),
    );
  }
  return ui.column({ p: 0 }, [
    ui.row({ gap: 2 }, [
      ui.text("Files", { style: { bold: true } }),
      ui.text(`${LIST_SIZE} items`),
      ui.text(`Selected: ${selected}`, { style: { dim: true } }),
    ]),
    ui.divider(),
    ...rows,
  ]);
}

// ── React: list with movable selection ───────────────────────────────

function reactListTree(
  React: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  selected: number,
): import("react").ReactNode {
  const h = React.createElement;
  const rows: import("react").ReactNode[] = [];
  for (let i = 0; i < LIST_SIZE; i++) {
    const isSelected = i === selected;
    rows.push(
      h(
        C.Box as string,
        { key: String(i), flexDirection: "row", gap: 1 },
        h(C.Text as string, { bold: isSelected }, isSelected ? ">" : " "),
        h(C.Text as string, { dimColor: !isSelected }, `${String(i).padStart(3, " ")}.`),
        h(C.Text as string, { bold: isSelected, inverse: isSelected }, `entry-${i}.log`),
        h(C.Text as string, { dimColor: true }, `${(i * 1024 + 512).toLocaleString()} B`),
      ),
    );
  }
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 0 },
    h(
      C.Box as string,
      { flexDirection: "row", gap: 2 },
      h(C.Text as string, { bold: true }, "Files"),
      h(C.Text as string, null, `${LIST_SIZE} items`),
      h(C.Text as string, { dimColor: true }, `Selected: ${selected}`),
    ),
    ...rows,
  );
}

// ── terminal-kit: list with movable selection ────────────────────────

function termkitListTree(
  buffer: { put: (opts: Record<string, unknown>, str: string) => void; fill: () => void },
  selected: number,
): void {
  buffer.fill();
  buffer.put({ x: 0, y: 0, attr: { bold: true } }, "Files");
  buffer.put({ x: 8, y: 0 }, `${LIST_SIZE} items`);
  buffer.put({ x: 22, y: 0, attr: { dim: true } }, `Selected: ${selected}`);

  for (let i = 0; i < LIST_SIZE; i++) {
    const y = 2 + i;
    const isSelected = i === selected;
    buffer.put({ x: 0, y, attr: { bold: isSelected } }, isSelected ? ">" : " ");
    buffer.put({ x: 2, y, attr: { dim: !isSelected } }, `${String(i).padStart(3, " ")}.`);
    buffer.put({ x: 8, y, attr: { bold: isSelected, inverse: isSelected } }, `entry-${i}.log`);
    buffer.put({ x: 25, y, attr: { dim: true } }, `${(i * 1024 + 512).toLocaleString()} B`);
  }
}

// ── Runners ─────────────────────────────────────────────────────────

async function runRezi(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  // Match the viewport height to other frameworks (540 rows for 500-item list)
  // so Rezi renders ALL rows, not just the visible 40.
  const backend = new BenchBackend(120, 540);

  type State = { selected: number };
  const app = createApp<State>({
    backend,
    initialState: { selected: 0 },
  });

  app.view((state) => reziListTree(state.selected));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const frameP = backend.waitForFrame();
      app.update((s) => ({ selected: (s.selected + 1) % LIST_SIZE }));
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const frameP = backend.waitForFrame();
        app.update((s) => ({ selected: (s.selected + 1) % LIST_SIZE }));
        await frameP;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = backend.frameCount - frameBase;
    metrics.bytesProduced = backend.totalFrameBytes - bytesBase;
    return metrics;
  } finally {
    await app.stop();
    app.dispose();
  }
}

async function runInkCompat(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = new BenchBackend(120, 540);

  let selected = 0;
  const initialFrame = backend.waitForFrame();
  const instance = InkCompat.render(
    reactListTree(React, InkCompat, selected) as React.ReactNode,
    { internal_backend: backend } as never,
  );
  await initialFrame;

  try {
    for (let i = 0; i < config.warmup; i++) {
      selected = (selected + 1) % LIST_SIZE;
      const frameP = backend.waitForFrame();
      instance.rerender(reactListTree(React, InkCompat, selected) as React.ReactNode);
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async () => {
        selected = (selected + 1) % LIST_SIZE;
        const frameP = backend.waitForFrame();
        instance.rerender(reactListTree(React, InkCompat, selected) as React.ReactNode);
        await frameP;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = backend.frameCount - frameBase;
    metrics.bytesProduced = backend.totalFrameBytes - bytesBase;
    return metrics;
  } finally {
    instance.unmount();
  }
}

async function runInk(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = new MeasuringStream();
  stdout.rows = 540;
  const stdin = new NullReadable();

  let selected = 0;
  const initialWrite = stdout.waitForWrite();
  const instance = Ink.render(reactListTree(React, Ink, selected) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initialWrite;

  try {
    for (let i = 0; i < config.warmup; i++) {
      selected = (selected + 1) % LIST_SIZE;
      const writeP = stdout.waitForWrite();
      instance.rerender(reactListTree(React, Ink, selected) as React.ReactNode);
      await writeP;
    }

    const writeBase = stdout.writeCount;
    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async () => {
        selected = (selected + 1) % LIST_SIZE;
        const writeP = stdout.waitForWrite();
        instance.rerender(reactListTree(React, Ink, selected) as React.ReactNode);
        await writeP;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = stdout.writeCount - writeBase;
    metrics.bytesProduced = stdout.totalBytes - bytesBase;
    return metrics;
  } finally {
    instance.unmount();
  }
}

async function runTermkit(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createTermkitContext } = await import("../termkit-backend.js");
  const ctx = createTermkitContext(120, 540);

  let selected = 0;

  // Initial full render
  termkitListTree(ctx.buffer, selected);
  ctx.buffer.draw({ delta: false });

  // Warmup with delta rendering
  for (let i = 0; i < config.warmup; i++) {
    selected = (selected + 1) % LIST_SIZE;
    termkitListTree(ctx.buffer, selected);
    ctx.buffer.draw({ delta: true });
  }

  ctx.resetBytes();
  const metrics = benchSync(
    () => {
      selected = (selected + 1) % LIST_SIZE;
      termkitListTree(ctx.buffer, selected);
      ctx.buffer.draw({ delta: true });
    },
    0,
    config.iterations,
  );

  metrics.bytesProduced = ctx.totalBytes;
  metrics.framesProduced = config.iterations;
  ctx.dispose();
  return metrics;
}

// ── blessed: list with movable selection ──────────────────────────────
// biome-ignore lint/suspicious/noExplicitAny: blessed has no types
type BlessedWidget = any;

/**
 * Build the initial blessed list tree, returning refs to mutable widgets.
 * On subsequent updates, only the changed rows' content/style are patched
 * (matching how Rezi/Ink diff only the changed parts of the tree).
 */
function buildInitialBlessedList(
  blessed: { text: (opts: Record<string, unknown>) => unknown },
  screen: { append: (el: unknown) => void },
  selected: number,
): {
  headerSel: BlessedWidget;
  markers: BlessedWidget[];
  indices: BlessedWidget[];
  names: BlessedWidget[];
} {
  // Header
  screen.append(
    blessed.text({ top: 0, left: 0, content: "Files", style: { bold: true }, tags: false }),
  );
  screen.append(blessed.text({ top: 0, left: 8, content: `${LIST_SIZE} items`, tags: false }));
  const headerSel = blessed.text({
    top: 0,
    left: 22,
    content: `Selected: ${selected}`,
    style: { fg: "grey" },
    tags: false,
  });
  screen.append(headerSel);

  // Item rows — keep references for in-place updates
  const markers: BlessedWidget[] = [];
  const indices: BlessedWidget[] = [];
  const names: BlessedWidget[] = [];
  for (let i = 0; i < LIST_SIZE; i++) {
    const y = 2 + i;
    const isSel = i === selected;
    const marker = blessed.text({
      top: y,
      left: 0,
      content: isSel ? ">" : " ",
      style: { bold: isSel },
      tags: false,
    });
    const idx = blessed.text({
      top: y,
      left: 2,
      content: `${String(i).padStart(3, " ")}.`,
      style: { fg: isSel ? "white" : "grey" },
      tags: false,
    });
    const name = blessed.text({
      top: y,
      left: 8,
      content: `entry-${i}.log`,
      style: { bold: isSel, inverse: isSel },
      tags: false,
    });
    const size = blessed.text({
      top: y,
      left: 25,
      content: `${(i * 1024 + 512).toLocaleString()} B`,
      style: { fg: "grey" },
      tags: false,
    });
    screen.append(marker);
    screen.append(idx);
    screen.append(name);
    screen.append(size);
    markers.push(marker);
    indices.push(idx);
    names.push(name);
  }
  return { headerSel, markers, indices, names };
}

/**
 * Update only the changed widgets when selection moves.
 * This is the fair approach: only patch the old and new selected rows,
 * matching the partial-update behavior measured by other frameworks.
 */
function updateBlessedSelection(
  refs: {
    headerSel: BlessedWidget;
    markers: BlessedWidget[];
    indices: BlessedWidget[];
    names: BlessedWidget[];
  },
  oldSel: number,
  newSel: number,
): void {
  // Update header
  refs.headerSel.setContent(`Selected: ${newSel}`);

  // Deselect old row
  refs.markers[oldSel].setContent(" ");
  refs.markers[oldSel].style.bold = false;
  refs.indices[oldSel].style.fg = "grey";
  refs.names[oldSel].style.bold = false;
  refs.names[oldSel].style.inverse = false;

  // Select new row
  refs.markers[newSel].setContent(">");
  refs.markers[newSel].style.bold = true;
  refs.indices[newSel].style.fg = "white";
  refs.names[newSel].style.bold = true;
  refs.names[newSel].style.inverse = true;
}

async function runBlessed(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createBlessedContext } = await import("../blessed-backend.js");
  const ctx = createBlessedContext(120, 540);

  let selected = 0;

  // Build the initial tree once (retained-mode: reuse widgets)
  const refs = buildInitialBlessedList(ctx.blessed, ctx.screen, selected);
  ctx.screen.render();
  ctx.flush();

  // Warmup — update in-place, matching how other frameworks diff
  for (let i = 0; i < config.warmup; i++) {
    const oldSel = selected;
    selected = (selected + 1) % LIST_SIZE;
    updateBlessedSelection(refs, oldSel, selected);
    ctx.screen.render();
    ctx.flush();
  }

  ctx.resetBytes();
  const metrics = benchSync(
    () => {
      const oldSel = selected;
      selected = (selected + 1) % LIST_SIZE;
      updateBlessedSelection(refs, oldSel, selected);
      ctx.screen.render();
      ctx.flush();
    },
    0,
    config.iterations,
  );

  metrics.bytesProduced = ctx.totalBytes;
  metrics.framesProduced = config.iterations;
  ctx.dispose();
  return metrics;
}

async function runRatatui(config: ScenarioConfig): Promise<BenchMetrics> {
  const { runRatatui: exec } = await import("../ratatui-runner.js");
  return exec("content-update", config);
}

async function runOpenTui(config: ScenarioConfig): Promise<BenchMetrics> {
  return runOpenTuiScenario("content-update", config, {});
}

export const contentUpdateScenario: Scenario = {
  name: "content-update",
  description: "Partial screen update: move selection in a 500-row list (measures diff efficiency)",
  defaultConfig: { warmup: 50, iterations: 500 },
  paramSets: [{}],
  frameworks: ["rezi-native", "ink", "opentui", "bubbletea", "terminal-kit", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig) {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config);
      case "ink":
        return runInk(config);
      case "opentui":
        return runOpenTui(config);
      case "terminal-kit":
        return runTermkit(config);
      case "blessed":
        return runBlessed(config);
      case "ratatui":
        return runRatatui(config);
      default:
        throw new Error(`content-update: unsupported framework "${framework}"`);
    }
  },
};
