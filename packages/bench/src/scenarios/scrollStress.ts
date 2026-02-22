/**
 * Scenario: Scroll Stress (non-virtualized)
 *
 * Renders a large list in full every frame and changes the active row each
 * iteration (simulates scroll position / cursor movement without virtualization).
 *
 * This is intentionally expensive and highlights worst-case behavior.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { createBenchBackend, createInkStdout } from "../io.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

function reziTree(items: number, active: number, tick: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < items; i++) {
    const isActive = i === active;
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(String(i).padStart(5, " "), { style: { dim: !isActive } }),
        ui.text(isActive ? "▶" : " ", { style: { bold: isActive } }),
        ui.text(`Item ${i}`, { style: { bold: isActive } }),
        ui.text(`v=${(tick + i * 17) % 1000}`, { style: { dim: !isActive } }),
      ]),
    );
  }
  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Scroll stress (non-virtualized)", { style: { bold: true } }),
    ui.text(`items=${items} active=${active} tick=${tick}`, { style: { dim: true } }),
    ...rows,
  ]);
}

function reactTree(
  ReactMod: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  items: number,
  active: number,
  tick: number,
): import("react").ReactNode {
  const h = ReactMod.createElement;
  const rows: import("react").ReactNode[] = [];
  for (let i = 0; i < items; i++) {
    const isActive = i === active;
    rows.push(
      h(
        C.Box as string,
        { key: String(i), flexDirection: "row", gap: 1 },
        h(C.Text as string, { dimColor: !isActive }, String(i).padStart(5, " ")),
        h(C.Text as string, { bold: isActive }, isActive ? "▶" : " "),
        h(C.Text as string, { bold: isActive }, `Item ${i}`),
        h(C.Text as string, { dimColor: !isActive }, `v=${(tick + i * 17) % 1000}`),
      ),
    );
  }
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, "Scroll stress (non-virtualized)"),
    h(C.Text as string, { dimColor: true }, `items=${items} active=${active} tick=${tick}`),
    ...rows,
  );
}

async function runRezi(config: ScenarioConfig, items: number): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { active: number; tick: number };
  const app = createApp<State>({ backend, initialState: { active: 0, tick: 0 } });
  app.view((s) => reziTree(items, s.active, s.tick));

  const initial = backend.waitForFrame();
  await app.start();
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      app.update((s) => ({ active: (s.active + 1) % items, tick: s.tick + 1 }));
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async () => {
        const p = backend.waitForFrame();
        app.update((s) => ({ active: (s.active + 1) % items, tick: s.tick + 1 }));
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

async function runInkCompat(config: ScenarioConfig, items: number): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = await createBenchBackend();

  const initial = backend.waitForFrame();
  const instance = InkCompat.render(
    reactTree(React, InkCompat, items, 0, 0) as React.ReactNode,
    {
      internal_backend: backend,
    } as never,
  );
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = backend.waitForFrame();
      instance.rerender(
        reactTree(React, InkCompat, items, (i + 1) % items, i + 1) as React.ReactNode,
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
          reactTree(React, InkCompat, items, tick % items, tick) as React.ReactNode,
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

async function runInk(config: ScenarioConfig, items: number): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const initial = stdout.waitForWrite();
  const instance = Ink.render(reactTree(React, Ink, items, 0, 0) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initial;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const p = stdout.waitForWrite();
      instance.rerender(reactTree(React, Ink, items, (i + 1) % items, i + 1) as React.ReactNode);
      await p;
    }

    const writeBase = stdout.writeCount;
    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const p = stdout.waitForWrite();
        const tick = config.warmup + i + 1;
        instance.rerender(reactTree(React, Ink, items, tick % items, tick) as React.ReactNode);
        await p;
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

async function runOpenTui(config: ScenarioConfig, items: number): Promise<BenchMetrics> {
  return runOpenTuiScenario("scroll-stress", config, { items });
}

export const scrollStressScenario: Scenario = {
  name: "scroll-stress",
  description: "Non-virtualized list: full list render with moving active row",
  defaultConfig: { warmup: 10, iterations: 50 },
  paramSets: [{ items: 2000 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea"],

  async run(framework: Framework, config: ScenarioConfig, params) {
    const { items } = params as { items: number };
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config, items);
      case "ink":
        return runInk(config, items);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTui(config, items);
      default:
        throw new Error(`scroll-stress: unsupported framework "${framework}"`);
    }
  },
};
