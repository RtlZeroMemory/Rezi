/**
 * Terminal suite: Rerender (cross-framework)
 *
 * Goal: provide a comparable “small update” benchmark across:
 * - Rezi native
 * - Ink-on-Rezi
 * - Ink
 * - OpenTUI
 * - blessed
 * - ratatui (Rust)
 */

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
  box: (opts: unknown) => BlessedElement;
}>;

async function loadBlessed(): Promise<BlessedModule> {
  const mod = (await import("blessed")) as unknown as { default?: unknown };
  return (mod.default ?? mod) as BlessedModule;
}

async function runRezi(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createApp, ui } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { tick: number };
  const app = createApp<State>({ backend, initialState: { tick: 0 } });
  app.view((s) =>
    ui.column({ p: 1, gap: 1 }, [
      ui.text("terminal-rerender", { style: { bold: true } }),
      ui.text(`tick=${s.tick}`),
    ]),
  );

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

async function runInkCompat(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = await createBenchBackend();

  const h = React.createElement;
  const mk = (tick: number): React.ReactNode =>
    h(
      InkCompat.Box as unknown as string,
      { flexDirection: "column", paddingX: 1, gap: 1 },
      h(InkCompat.Text as unknown as string, { bold: true }, "terminal-rerender"),
      h(InkCompat.Text as unknown as string, null, `tick=${tick}`),
    );

  const initial = backend.waitForFrame();
  const instance = InkCompat.render(
    mk(0) as React.ReactNode,
    { internal_backend: backend } as never,
  );
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      instance.rerender(mk(i + 1) as React.ReactNode);
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = backend.waitForFrame();
        instance.rerender(mk(config.warmup + i + 1) as React.ReactNode);
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

async function runInk(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const h = React.createElement;
  const mk = (tick: number): React.ReactNode =>
    h(
      Ink.Box as unknown as string,
      { flexDirection: "column", paddingX: 1, gap: 1 },
      h(Ink.Text as unknown as string, { bold: true }, "terminal-rerender"),
      h(Ink.Text as unknown as string, null, `tick=${tick}`),
    );

  const initial = stdout.waitForWrite();
  const instance = Ink.render(mk(0) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = stdout.waitForWrite();
      instance.rerender(mk(i + 1) as React.ReactNode);
      await p;
    }

    const writeBase = stdout.writeCount;
    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = stdout.waitForWrite();
        instance.rerender(mk(config.warmup + i + 1) as React.ReactNode);
        await p;
      },
      0,
      config.iterations,
    );

    metrics.framesProduced = config.iterations;
    metrics.bytesProduced = stdout.totalBytes - bytesBase;
    // Ink can do multiple writes per rerender; keep framesProduced as iterations for comparability.
    void writeBase;
    return metrics;
  } finally {
    instance.unmount();
  }
}

async function runOpenTui(config: ScenarioConfig): Promise<BenchMetrics> {
  return runOpenTuiScenario("terminal-rerender", config, {});
}

async function runBlessed(config: ScenarioConfig): Promise<BenchMetrics> {
  const blessed = await loadBlessed();
  const output = createBlessedOutput();

  const screen = blessed.screen({
    smartCSR: true,
    output,
    input: process.stdin,
    // Avoid extra work not relevant to render cost.
    warnings: false,
    dockBorders: false,
  });

  const box = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    tags: false,
    content: "",
  });
  screen.append(box);

  const renderTick = async (tick: number): Promise<void> => {
    const renderP = new Promise<void>((resolve) => screen.once("render", () => resolve()));
    box.setContent(`terminal-rerender\n\ntick=${tick}\n`);
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

async function runRatatui(config: ScenarioConfig): Promise<BenchMetrics> {
  return runRatatuiScenario("terminal-rerender", config, {});
}

export const terminalRerenderScenario: Scenario = {
  name: "terminal-rerender",
  description: "Small update benchmark across terminal UI frameworks (includes PTY output path)",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [],
  frameworks: ["rezi-native", "ink", "opentui", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig): Promise<BenchMetrics> {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config);
      case "ink":
        return runInk(config);
      case "opentui":
        return runOpenTui(config);
      case "blessed":
        return runBlessed(config);
      case "ratatui":
        return runRatatui(config);
      default:
        throw new Error(`Unsupported framework for terminal-rerender: ${framework}`);
    }
  },
};
