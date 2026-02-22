/**
 * Terminal suite: Virtual list (cross-framework)
 *
 * Large logical dataset, small viewport window. This is the most comparable
 * list-heavy workload across terminal frameworks because it matches the
 * terminal's visible area.
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

function reziTree(totalItems: number, viewport: number, offset: number, tick: number): VNode {
  const rows: VNode[] = [];
  const end = Math.min(totalItems, offset + viewport);
  for (let i = offset; i < end; i++) {
    const active = i === offset + (tick % viewport);
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(String(i).padStart(6, " ")),
        ui.text("•", { style: { dim: true } }),
        ui.text(`Item ${i}`),
        ui.text(`v=${(tick + i * 97) % 1000}`, { style: { dim: true } }),
        active ? ui.text(" <") : ui.text(""),
      ]),
    );
  }
  return ui.column({ p: 1, gap: 1 }, [
    ui.text("terminal-virtual-list", { style: { bold: true } }),
    ui.text(`total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`, {
      style: { dim: true },
    }),
    ...rows,
  ]);
}

function reactTree(
  ReactMod: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  totalItems: number,
  viewport: number,
  offset: number,
  tick: number,
): import("react").ReactNode {
  const h = ReactMod.createElement;
  const rows: import("react").ReactNode[] = [];
  const end = Math.min(totalItems, offset + viewport);
  for (let i = offset; i < end; i++) {
    const active = i === offset + (tick % viewport);
    rows.push(
      h(
        C.Box as string,
        { key: String(i), flexDirection: "row", gap: 1 },
        h(C.Text as string, null, String(i).padStart(6, " ")),
        h(C.Text as string, { dimColor: true }, "•"),
        h(C.Text as string, null, `Item ${i}`),
        h(C.Text as string, { dimColor: true }, `v=${(tick + i * 97) % 1000}`),
        h(C.Text as string, null, active ? " <" : ""),
      ),
    );
  }
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, "terminal-virtual-list"),
    h(
      C.Text as string,
      { dimColor: true },
      `total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`,
    ),
    ...rows,
  );
}

async function runRezi(
  config: ScenarioConfig,
  totalItems: number,
  viewport: number,
): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { offset: number; tick: number };
  const app = createApp<State>({ backend, initialState: { offset: 0, tick: 0 } });
  app.view((s) => reziTree(totalItems, viewport, s.offset, s.tick));

  const initial = backend.waitForFrame();
  await app.start();
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      app.update((s) => ({ offset: (s.offset + 1) % (totalItems - viewport), tick: s.tick + 1 }));
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async () => {
        const p = backend.waitForFrame();
        app.update((s) => ({ offset: (s.offset + 1) % (totalItems - viewport), tick: s.tick + 1 }));
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
  totalItems: number,
  viewport: number,
): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = await createBenchBackend();

  const initial = backend.waitForFrame();
  const instance = InkCompat.render(
    reactTree(React, InkCompat, totalItems, viewport, 0, 0) as React.ReactNode,
    { internal_backend: backend } as never,
  );
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      instance.rerender(
        reactTree(
          React,
          InkCompat,
          totalItems,
          viewport,
          (i + 1) % (totalItems - viewport),
          i + 1,
        ) as React.ReactNode,
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
          reactTree(
            React,
            InkCompat,
            totalItems,
            viewport,
            tick % (totalItems - viewport),
            tick,
          ) as React.ReactNode,
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
  totalItems: number,
  viewport: number,
): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const initial = stdout.waitForWrite();
  const instance = Ink.render(
    reactTree(React, Ink, totalItems, viewport, 0, 0) as React.ReactNode,
    {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = stdout.waitForWrite();
      instance.rerender(
        reactTree(
          React,
          Ink,
          totalItems,
          viewport,
          (i + 1) % (totalItems - viewport),
          i + 1,
        ) as React.ReactNode,
      );
      await p;
    }

    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = stdout.waitForWrite();
        const tick = config.warmup + i + 1;
        instance.rerender(
          reactTree(
            React,
            Ink,
            totalItems,
            viewport,
            tick % (totalItems - viewport),
            tick,
          ) as React.ReactNode,
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
  totalItems: number,
  viewport: number,
): Promise<BenchMetrics> {
  return runOpenTuiScenario("terminal-virtual-list", config, { items: totalItems, viewport });
}

async function runBlessed(
  config: ScenarioConfig,
  totalItems: number,
  viewport: number,
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

  // Pre-create lines to avoid reallocating widget objects per frame.
  const header0 = blessed.text({
    top: 0,
    left: 1,
    content: "terminal-virtual-list",
    style: { bold: true },
  });
  const header1 = blessed.text({ top: 1, left: 1, content: "" });
  screen.append(header0);
  screen.append(header1);

  const lines: BlessedElement[] = [];
  for (let r = 0; r < viewport; r++) {
    const t = blessed.text({ top: 3 + r, left: 1, content: "" });
    lines.push(t);
    screen.append(t);
  }

  const renderTick = async (offset: number, tick: number): Promise<void> => {
    const renderP = new Promise<void>((resolve) => screen.once("render", () => resolve()));
    header1.setContent(`total=${totalItems} viewport=${viewport} offset=${offset} tick=${tick}`);

    const active = tick % viewport;
    for (let r = 0; r < viewport; r++) {
      const i = offset + r;
      lines[r]?.setContent(
        `${String(i).padStart(6, " ")} • Item ${i} v=${(tick + i * 97) % 1000}${r === active ? " <" : ""}`,
      );
      // Blessed style mutations are expensive; keep it to content only.
    }

    screen.render();
    await renderP;
  };

  try {
    await renderTick(0, 0);

    for (let i = 0; i < config.warmup; i++) {
      const tick = i + 1;
      await renderTick(tick % (totalItems - viewport), tick);
    }

    const bytesBase = output.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const tick = config.warmup + i + 1;
        await renderTick(tick % (totalItems - viewport), tick);
      },
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
  totalItems: number,
  viewport: number,
): Promise<BenchMetrics> {
  return runRatatuiScenario("terminal-virtual-list", config, { items: totalItems, viewport });
}

export const terminalVirtualListScenario: Scenario = {
  name: "terminal-virtual-list",
  description: "Virtual list (viewport-only) across terminal UI frameworks",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [{ items: 100_000, viewport: 40 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea", "blessed", "ratatui"],

  async run(framework: Framework, config: ScenarioConfig, params): Promise<BenchMetrics> {
    const { items, viewport } = params as { items: number; viewport: number };
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config, items, viewport);
      case "ink":
        return runInk(config, items, viewport);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTui(config, items, viewport);
      case "blessed":
        return runBlessed(config, items, viewport);
      case "ratatui":
        return runRatatui(config, items, viewport);
      default:
        throw new Error(`Unsupported framework for terminal-virtual-list: ${framework}`);
    }
  },
};
