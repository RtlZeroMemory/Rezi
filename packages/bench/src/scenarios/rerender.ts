/**
 * Scenario: Re-render Throughput
 *
 * Measures the cost of updating state and producing a new frame.
 * Uses a counter app: each iteration increments the count and
 * re-renders the tree. The tree is small (fixed size) so this
 * isolates the per-update overhead.
 *
 * Also includes a "rapid burst" variant that fires N updates
 * without waiting for frames, measuring throughput under pressure.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { createBenchBackend } from "../io.js";
import { benchAsync, benchSync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

// ── Tree builders (small counter app) ───────────────────────────────

function reziCounterTree(count: number): VNode {
  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Counter Benchmark", { style: { bold: true } }),
    ui.row({ gap: 2 }, [ui.text(`Count: ${count}`), ui.text("[+1]"), ui.text("[-1]")]),
    ui.text(`Last updated: iteration ${count}`, { style: { dim: true } }),
  ]);
}

// ── Runners ─────────────────────────────────────────────────────────

async function runRezi(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { count: number };
  const app = createApp<State>({
    backend,
    initialState: { count: 0 },
  });

  app.view((state) => reziCounterTree(state.count));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const frameP = backend.waitForFrame();
      app.update((s) => ({ count: s.count + 1 }));
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const frameP = backend.waitForFrame();
        app.update((s) => ({ count: s.count + 1 }));
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

// ── blessed counter ──────────────────────────────────────────────────

function blessedCounterTree(
  blessed: { text: (opts: Record<string, unknown>) => unknown },
  screen: {
    append: (el: unknown) => void;
    children: unknown[];
    remove: (el: unknown) => void;
    render: () => void;
  },
  count: number,
): void {
  while (screen.children.length > 0) screen.remove(screen.children[0]);
  screen.append(
    blessed.text({
      top: 1,
      left: 1,
      content: "Counter Benchmark",
      style: { bold: true },
      tags: false,
    }),
  );
  screen.append(blessed.text({ top: 3, left: 1, content: `Count: ${count}`, tags: false }));
  screen.append(blessed.text({ top: 3, left: 12, content: "[+1]", tags: false }));
  screen.append(blessed.text({ top: 3, left: 18, content: "[-1]", tags: false }));
  screen.append(
    blessed.text({
      top: 5,
      left: 1,
      content: `Last updated: iteration ${count}`,
      style: { fg: "grey" },
      tags: false,
    }),
  );
}

// ── terminal-kit counter ─────────────────────────────────────────────

function termkitCounterTree(
  buffer: { put: (opts: Record<string, unknown>, str: string) => void; fill: () => void },
  count: number,
): void {
  buffer.fill();
  buffer.put({ x: 1, y: 1, attr: { bold: true } }, "Counter Benchmark");
  buffer.put({ x: 1, y: 3 }, `Count: ${count}`);
  buffer.put({ x: 12, y: 3 }, "[+1]");
  buffer.put({ x: 18, y: 3 }, "[-1]");
  buffer.put({ x: 1, y: 5, attr: { dim: true } }, `Last updated: iteration ${count}`);
}

async function runTermkit(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createTermkitContext } = await import("../termkit-backend.js");
  const ctx = createTermkitContext(120, 40);

  // Initial render
  termkitCounterTree(ctx.buffer, 0);
  ctx.buffer.draw({ delta: false });

  // Warmup — use delta rendering (only changes are output)
  for (let i = 0; i < config.warmup; i++) {
    termkitCounterTree(ctx.buffer, i + 1);
    ctx.buffer.draw({ delta: true });
  }

  ctx.resetBytes();
  const metrics = benchSync(
    (i) => {
      termkitCounterTree(ctx.buffer, config.warmup + i + 1);
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

async function runBlessed(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createBlessedContext } = await import("../blessed-backend.js");
  const ctx = createBlessedContext(120, 40);

  // Initial render
  blessedCounterTree(ctx.blessed, ctx.screen, 0);
  ctx.screen.render();
  ctx.flush();

  // Warmup
  for (let i = 0; i < config.warmup; i++) {
    blessedCounterTree(ctx.blessed, ctx.screen, i + 1);
    ctx.screen.render();
    ctx.flush();
  }

  ctx.resetBytes();
  const metrics = benchSync(
    (i) => {
      blessedCounterTree(ctx.blessed, ctx.screen, config.warmup + i + 1);
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
  return exec("rerender", config);
}

async function runOpenTui(config: ScenarioConfig): Promise<BenchMetrics> {
  return runOpenTuiScenario("rerender", config, {});
}

export const rerenderScenario: Scenario = {
  name: "rerender",
  description: "State update → new frame (small counter app, isolates per-update cost)",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [{}],
  frameworks: [
    "rezi-native",
    "opentui",
    "opentui-core",
    "bubbletea",
    "terminal-kit",
    "blessed",
    "ratatui",
  ],

  async run(framework: Framework, config: ScenarioConfig) {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config);
      case "opentui":
      case "opentui-core":
      case "bubbletea":
        return runOpenTui(config);
      case "terminal-kit":
        return runTermkit(config);
      case "blessed":
        return runBlessed(config);
      case "ratatui":
        return runRatatui(config);
      default:
        throw new Error(`rerender: unsupported framework "${framework}"`);
    }
  },
};
