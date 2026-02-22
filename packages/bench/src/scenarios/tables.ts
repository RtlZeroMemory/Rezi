/**
 * Scenario: Tables (update cost)
 *
 * Renders a fixed-size table (rows × cols). Each iteration updates one cell's
 * contents, changing its width periodically to trigger layout work.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { createBenchBackend, createInkStdout } from "../io.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

function cellValue(r: number, c: number, tick: number): string {
  const v = (tick + r * 131 + c * 17) % 10_000;
  const wide = (tick + r + c) % 13 === 0;
  return wide ? `val=${String(v).padStart(4, "0")} (row=${r})` : String(v);
}

function reziTree(rows: number, cols: number, tick: number): VNode {
  const headerCells: VNode[] = [];
  for (let c = 0; c < cols; c++) {
    headerCells.push(ui.text(`Col ${c}`, { style: { bold: true } }));
  }

  const body: VNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: VNode[] = [];
    for (let c = 0; c < cols; c++) {
      cells.push(ui.text(cellValue(r, c, tick), { style: { dim: (r + c) % 2 === 0 } }));
    }
    body.push(
      ui.row({ gap: 2 }, [ui.text(String(r).padStart(4, " "), { style: { dim: true } }), ...cells]),
    );
  }

  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Table update", { style: { bold: true } }),
    ui.text(`rows=${rows} cols=${cols} tick=${tick}`, { style: { dim: true } }),
    ui.row({ gap: 2 }, [ui.text("row", { style: { bold: true } }), ...headerCells]),
    ui.divider(),
    ...body,
  ]);
}

function reactTree(
  ReactMod: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  rows: number,
  cols: number,
  tick: number,
): import("react").ReactNode {
  const h = ReactMod.createElement;

  const headerCells: import("react").ReactNode[] = [];
  for (let c = 0; c < cols; c++) {
    headerCells.push(h(C.Text as string, { key: `h:${c}`, bold: true }, `Col ${c}`));
  }

  const body: import("react").ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: import("react").ReactNode[] = [];
    for (let c = 0; c < cols; c++) {
      cells.push(
        h(
          C.Text as string,
          { key: `c:${r}:${c}`, dimColor: (r + c) % 2 === 0 },
          cellValue(r, c, tick),
        ),
      );
    }
    body.push(
      h(
        C.Box as string,
        { key: `r:${r}`, flexDirection: "row", gap: 2 },
        h(C.Text as string, { dimColor: true }, String(r).padStart(4, " ")),
        ...cells,
      ),
    );
  }

  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, "Table update"),
    h(C.Text as string, { dimColor: true }, `rows=${rows} cols=${cols} tick=${tick}`),
    h(
      C.Box as string,
      { flexDirection: "row", gap: 2 },
      h(C.Text as string, { bold: true }, "row"),
      ...headerCells,
    ),
    ...body,
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
      app.update((s) => ({ tick: s.tick + 1 }));
      await p;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async () => {
        const p = backend.waitForFrame();
        app.update((s) => ({ tick: s.tick + 1 }));
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

    const writeBase = stdout.writeCount;
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

    metrics.framesProduced = stdout.writeCount - writeBase;
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
  return runOpenTuiScenario("tables", config, { rows, cols });
}

export const tableScenario: Scenario = {
  name: "tables",
  description: "Fixed-size table; updates a single changing cell per iteration",
  defaultConfig: { warmup: 50, iterations: 300 },
  paramSets: [{ rows: 100, cols: 8 }],
  frameworks: ["rezi-native", "ink", "opentui", "opentui-core", "bubbletea"],

  async run(framework: Framework, config: ScenarioConfig, params) {
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
      default:
        throw new Error(`tables: unsupported framework "${framework}"`);
    }
  },
};
