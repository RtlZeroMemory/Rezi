/**
 * Terminal suite: Frame fill (cross-framework)
 *
 * Renders a full 120x40 “frame” worth of text with a controllable amount of change
 * per update (dirtyLines). Intended to be comparable across Node and native TUIs.
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

function padTo(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function makeLineContent(row: number, tick: number, cols: number): string {
  // Deterministic, different each tick.
  const v = (tick * 1103515245 + row * 12345) >>> 0;
  return padTo(`row=${row.toString().padStart(2, "0")} tick=${tick} v=${v.toString(16)}`, cols);
}

function makeStaticLine(row: number, cols: number): string {
  return padTo(`row=${row.toString().padStart(2, "0")} static`, cols);
}

function reziTree(rows: number, cols: number, dirtyLines: number, tick: number): VNode {
  const lines: VNode[] = [];
  for (let r = 0; r < rows; r++) {
    const content = r < dirtyLines ? makeLineContent(r, tick, cols) : makeStaticLine(r, cols);
    lines.push(ui.text(content));
  }
  return ui.column({ p: 0 }, lines);
}

function reactTree(
  ReactMod: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  rows: number,
  cols: number,
  dirtyLines: number,
  tick: number,
): import("react").ReactNode {
  const h = ReactMod.createElement;
  const lines: import("react").ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const content = r < dirtyLines ? makeLineContent(r, tick, cols) : makeStaticLine(r, cols);
    lines.push(h(C.Text as string, { key: String(r) }, content));
  }
  return h(C.Box as string, { flexDirection: "column" }, ...lines);
}

async function runRezi(
  config: ScenarioConfig,
  rows: number,
  cols: number,
  dirtyLines: number,
): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { tick: number };
  const app = createApp<State>({ backend, initialState: { tick: 0 } });
  app.view((s) => reziTree(rows, cols, dirtyLines, s.tick));

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
  dirtyLines: number,
): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = await createBenchBackend();

  const initial = backend.waitForFrame();
  const instance = InkCompat.render(
    reactTree(React, InkCompat, rows, cols, dirtyLines, 0) as React.ReactNode,
    { internal_backend: backend } as never,
  );
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      instance.rerender(
        reactTree(React, InkCompat, rows, cols, dirtyLines, i + 1) as React.ReactNode,
      );
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = backend.waitForFrame();
        const tick = config.warmup + i + 1;
        instance.rerender(
          reactTree(React, InkCompat, rows, cols, dirtyLines, tick) as React.ReactNode,
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

async function runInk(
  config: ScenarioConfig,
  rows: number,
  cols: number,
  dirtyLines: number,
): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const initial = stdout.waitForWrite();
  const instance = Ink.render(reactTree(React, Ink, rows, cols, dirtyLines, 0) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = stdout.waitForWrite();
      instance.rerender(reactTree(React, Ink, rows, cols, dirtyLines, i + 1) as React.ReactNode);
      await p;
    }

    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = stdout.waitForWrite();
        const tick = config.warmup + i + 1;
        instance.rerender(reactTree(React, Ink, rows, cols, dirtyLines, tick) as React.ReactNode);
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
  dirtyLines: number,
): Promise<BenchMetrics> {
  return runOpenTuiScenario("terminal-frame-fill", config, { rows, cols, dirtyLines });
}

async function runBlessed(
  config: ScenarioConfig,
  rows: number,
  cols: number,
  dirtyLines: number,
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

  const lines: BlessedElement[] = [];
  for (let r = 0; r < rows; r++) {
    const t = blessed.text({ top: r, left: 0, content: makeStaticLine(r, cols) });
    lines.push(t);
    screen.append(t);
  }

  const renderTick = async (tick: number): Promise<void> => {
    const renderP = new Promise<void>((resolve) => screen.once("render", () => resolve()));
    for (let r = 0; r < rows; r++) {
      if (r < dirtyLines) {
        lines[r]?.setContent(makeLineContent(r, tick, cols));
      }
    }
    screen.render();
    await renderP;
    await new Promise<void>((resolve) => process.nextTick(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
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
  dirtyLines: number,
): Promise<BenchMetrics> {
  return runRatatuiScenario("terminal-frame-fill", config, { rows, cols, dirtyLines });
}

export const terminalFrameFillScenario: Scenario = {
  name: "terminal-frame-fill",
  description: "Render a full 120×40 frame with configurable dirty region (cross-framework)",
  defaultConfig: { warmup: 50, iterations: 500 },
  paramSets: [
    { rows: 40, cols: 120, dirtyLines: 1 },
    { rows: 40, cols: 120, dirtyLines: 40 },
  ],
  frameworks: ["rezi-native", "ink", "opentui", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    const { rows, cols, dirtyLines } = params as { rows: number; cols: number; dirtyLines: number };
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config, rows, cols, dirtyLines);
      case "ink":
        return runInk(config, rows, cols, dirtyLines);
      case "opentui":
        return runOpenTui(config, rows, cols, dirtyLines);
      case "blessed":
        return runBlessed(config, rows, cols, dirtyLines);
      case "ratatui":
        return runRatatui(config, rows, cols, dirtyLines);
      default:
        throw new Error(`Unsupported framework for terminal-frame-fill: ${framework}`);
    }
  },
};
