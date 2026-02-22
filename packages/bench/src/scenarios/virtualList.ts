/**
 * Scenario: Large List Virtualization
 *
 * Keeps a large logical dataset (N items) but only renders a viewport window
 * (V items). Each iteration moves the window by 1.
 *
 * This is a best-case for list-heavy UIs where virtualization is used.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { createBenchBackend, createInkStdout } from "../io.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

function reziTree(totalItems: number, viewport: number, offset: number, tick: number): VNode {
  const rows: VNode[] = [];
  const start = offset;
  const end = Math.min(totalItems, offset + viewport);
  for (let i = start; i < end; i++) {
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(String(i).padStart(6, " ")),
        ui.text("•", { style: { dim: true } }),
        ui.text(`Item ${i}`),
        ui.text(`v=${(tick + i * 97) % 1000}`, { style: { dim: true } }),
      ]),
    );
  }
  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Virtual list", { style: { bold: true } }),
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
  const start = offset;
  const end = Math.min(totalItems, offset + viewport);
  for (let i = start; i < end; i++) {
    rows.push(
      h(
        C.Box as string,
        { key: String(i), flexDirection: "row", gap: 1 },
        h(C.Text as string, null, String(i).padStart(6, " ")),
        h(C.Text as string, { dimColor: true }, "•"),
        h(C.Text as string, null, `Item ${i}`),
        h(C.Text as string, { dimColor: true }, `v=${(tick + i * 97) % 1000}`),
      ),
    );
  }
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, "Virtual list"),
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
    {
      internal_backend: backend,
    } as never,
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

    const writeBase = stdout.writeCount;
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

    metrics.framesProduced = stdout.writeCount - writeBase;
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
  return runOpenTuiScenario("virtual-list", config, { items: totalItems, viewport });
}

export const virtualListScenario: Scenario = {
  name: "virtual-list",
  description: "Large logical list with virtualization window (viewport only)",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [{ items: 100_000, viewport: 40 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea"],

  async run(framework: Framework, config: ScenarioConfig, params) {
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
      default:
        throw new Error(`virtual-list: unsupported framework "${framework}"`);
    }
  },
};
