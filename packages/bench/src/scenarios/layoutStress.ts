/**
 * Scenario: Layout Stress
 *
 * Renders a moderately large flex-style layout (nested rows/columns) and
 * perturbs text widths each iteration to force re-layout.
 *
 * Goal: measure layout + diff + frame emission cost, not terminal I/O.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { createBenchBackend } from "../io.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

function reziTree(rows: number, cols: number, tick: number): VNode {
  const grid: VNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: VNode[] = [];
    for (let c = 0; c < cols; c++) {
      const v = (tick + r * 31 + c * 17) % 1000;
      const wide = (tick + r + c) % 7 === 0;
      const value = wide ? `value=${v} (${String(v).padStart(4, "0")})` : `v=${v}`;
      cells.push(
        ui.box({ flex: 1, p: 0 }, [
          ui.column({ gap: 0 }, [
            ui.text(`C${c}`, { style: { dim: true } }),
            ui.text(value, { style: { bold: c === 0 } }),
          ]),
        ]),
      );
    }
    grid.push(ui.row({ gap: 1 }, cells));
  }

  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Layout stress", { style: { bold: true } }),
    ui.text(`tick=${tick}`, { style: { dim: true } }),
    ...grid,
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
  const grid: import("react").ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: import("react").ReactNode[] = [];
    for (let c = 0; c < cols; c++) {
      const v = (tick + r * 31 + c * 17) % 1000;
      const wide = (tick + r + c) % 7 === 0;
      const value = wide ? `value=${v} (${String(v).padStart(4, "0")})` : `v=${v}`;
      cells.push(
        h(
          C.Box as string,
          { key: `c:${r}:${c}`, flexGrow: 1, flexDirection: "column" },
          h(C.Text as string, { dimColor: true }, `C${c}`),
          h(C.Text as string, { bold: c === 0 }, value),
        ),
      );
    }
    grid.push(h(C.Box as string, { key: `r:${r}`, flexDirection: "row", gap: 1 }, ...cells));
  }
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, "Layout stress"),
    h(C.Text as string, { dimColor: true }, `tick=${tick}`),
    ...grid,
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

async function runOpenTui(
  config: ScenarioConfig,
  rows: number,
  cols: number,
): Promise<BenchMetrics> {
  return runOpenTuiScenario("layout-stress", config, { rows, cols });
}

export const layoutStressScenario: Scenario = {
  name: "layout-stress",
  description: "Nested flex layout with changing text widths (forces re-layout)",
  defaultConfig: { warmup: 50, iterations: 300 },
  paramSets: [{ rows: 40, cols: 4 }],
  frameworks: ["rezi-native", "opentui", "opentui-core", "bubbletea"],

  async run(framework: Framework, config: ScenarioConfig, params) {
    const { rows, cols } = params as { rows: number; cols: number };
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config, rows, cols);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTui(config, rows, cols);
      default:
        throw new Error(`layout-stress: unsupported framework "${framework}"`);
    }
  },
};
