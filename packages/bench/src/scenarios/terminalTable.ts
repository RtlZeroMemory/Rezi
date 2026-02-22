/**
 * Terminal suite: Table update (cross-framework)
 *
 * Render a viewport-sized table (fits 120×40) and update a single cell each iteration.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { createBlessedOutput } from "../frameworks/blessed.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { runRatatuiScenario } from "../frameworks/ratatui.js";
import { createBenchBackend, createInkStdout } from "../io.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

type BlessedElement = Readonly<{ setContent: (s: string) => void }>;
type BlessedScreen = Readonly<{
  append: (el: unknown) => void;
  once: (event: "render", cb: () => void) => void;
  render: () => void;
  destroy: () => void;
}>;
type BlessedModule = Readonly<{
  screen: (opts: unknown) => BlessedScreen;
  text: (opts: unknown) => BlessedElement;
}>;

async function loadBlessed(): Promise<BlessedModule> {
  const mod = (await import("blessed")) as unknown as { default?: unknown };
  return (mod.default ?? mod) as BlessedModule;
}

function cellValue(row: number, col: number, tick: number, hotRow: number, hotCol: number): string {
  if (row === hotRow && col === hotCol) return `v=${tick}`;
  return `r${row}c${col}`;
}

function tableLines(rows: number, cols: number, tick: number): string[] {
  const hotRow = tick % rows;
  const hotCol = tick % cols;
  const lines: string[] = [];
  const header = Array.from({ length: cols }, (_, c) => `C${c}`.padEnd(10, " ")).join("");
  lines.push(header);
  lines.push("-".repeat(Math.min(120, header.length)));
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) {
      line += cellValue(r, c, tick, hotRow, hotCol).padEnd(10, " ");
    }
    lines.push(line.slice(0, 120));
  }
  return lines;
}

function reziTree(rows: number, cols: number, tick: number): VNode {
  const lines = tableLines(rows, cols, tick);
  const nodes: VNode[] = [];
  for (const ln of lines) nodes.push(ui.text(ln));
  return ui.column({ p: 0 }, nodes);
}

function reactTree(
  ReactMod: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  rows: number,
  cols: number,
  tick: number,
): import("react").ReactNode {
  const h = ReactMod.createElement;
  const lines = tableLines(rows, cols, tick);
  return h(
    C.Box as string,
    { flexDirection: "column" },
    ...lines.map((ln, i) => h(C.Text as string, { key: String(i) }, ln)),
  );
}

async function runRezi(config: ScenarioConfig, rows: number, cols: number): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { tick: number };
  const app = createApp<State>({ backend, initialState: { tick: 0 } });
  app.view((s) => reziTree(rows, cols, s.tick));

  const initial = backend.waitForFrame();
  await app.start();
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      app.update((st) => ({ tick: st.tick + 1 }));
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async () => {
        const p = backend.waitForFrame();
        app.update((st) => ({ tick: st.tick + 1 }));
        await p;
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

async function runInkCompat(
  config: ScenarioConfig,
  rows: number,
  cols: number,
): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = await createBenchBackend();

  const initial = backend.waitForFrame();
  const instance = InkCompat.render(
    reactTree(React, InkCompat, rows, cols, 0) as React.ReactNode,
    {
      internal_backend: backend,
    } as never,
  );
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      instance.rerender(reactTree(React, InkCompat, rows, cols, i + 1) as React.ReactNode);
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = backend.waitForFrame();
        instance.rerender(
          reactTree(React, InkCompat, rows, cols, config.warmup + i + 1) as React.ReactNode,
        );
        await p;
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

async function runInk(config: ScenarioConfig, rows: number, cols: number): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const initial = stdout.waitForWrite();
  const instance = Ink.render(reactTree(React, Ink, rows, cols, 0) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = stdout.waitForWrite();
      instance.rerender(reactTree(React, Ink, rows, cols, i + 1) as React.ReactNode);
      await p;
    }

    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = stdout.waitForWrite();
        instance.rerender(
          reactTree(React, Ink, rows, cols, config.warmup + i + 1) as React.ReactNode,
        );
        await p;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = config.iterations;
    metrics.bytesProduced = stdout.totalBytes - bytesBase;
    return metrics;
  } finally {
    instance.unmount();
  }
}

async function runOpenTui(
  config: ScenarioConfig,
  rows: number,
  cols: number,
): Promise<BenchMetrics> {
  return runOpenTuiScenario("terminal-table", config, { rows, cols });
}

async function runBlessed(
  config: ScenarioConfig,
  rows: number,
  cols: number,
): Promise<BenchMetrics> {
  const blessed = await loadBlessed();
  const output = createBlessedOutput();

  const screen = blessed.screen({
    smartCSR: true,
    output,
    input: process.stdin,
    warnings: false,
    dockBorders: false,
  });

  const lineNodes: BlessedElement[] = [];
  const initialLines = tableLines(rows, cols, 0);
  for (let i = 0; i < initialLines.length; i++) {
    const t = blessed.text({ top: i, left: 0, content: initialLines[i] });
    lineNodes.push(t);
    screen.append(t);
  }

  const renderTick = async (tick: number): Promise<void> => {
    const renderP = new Promise<void>((resolve) => screen.once("render", () => resolve()));
    const lines = tableLines(rows, cols, tick);
    for (const [i, ln] of lines.entries()) lineNodes[i]?.setContent(ln);
    screen.render();
    await renderP;
  };

  try {
    await renderTick(0);
    for (let i = 0; i < config.warmup; i++) await renderTick(i + 1);

    const bytesBase = output.totalBytes;
    const metrics = await benchAsync(
      async (i) => renderTick(config.warmup + i + 1),
      0,
      config.iterations,
    );
    metrics.framesProduced = config.iterations;
    metrics.bytesProduced = output.totalBytes - bytesBase;
    return metrics;
  } finally {
    try {
      screen.destroy();
    } catch {
      // ignore
    }
  }
}

async function runRatatui(
  config: ScenarioConfig,
  rows: number,
  cols: number,
): Promise<BenchMetrics> {
  return runRatatuiScenario("terminal-table", config, { rows, cols });
}

export const terminalTableScenario: Scenario = {
  name: "terminal-table",
  description: "Viewport-sized table update (single cell change) across terminal UI frameworks",
  defaultConfig: { warmup: 50, iterations: 500 },
  paramSets: [{ rows: 40, cols: 8 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    const { rows, cols } = params as { rows: number; cols: number };
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config, rows, cols);
      case "ink":
        return runInk(config, rows, cols);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTui(config, rows, cols);
      case "blessed":
        return runBlessed(config, rows, cols);
      case "ratatui":
        return runRatatui(config, rows, cols);
      default:
        throw new Error(`Unsupported framework for terminal-table: ${framework}`);
    }
  },
};
