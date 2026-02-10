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
import { BenchBackend, MeasuringStream, NullReadable } from "../backends.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";

// ── Tree builders (small counter app) ───────────────────────────────

function reziCounterTree(count: number): VNode {
  return ui.column({ p: 1, gap: 1 }, [
    ui.text("Counter Benchmark", { style: { bold: true } }),
    ui.row({ gap: 2 }, [
      ui.text(`Count: ${count}`),
      ui.button({ id: "inc", label: "+1" }),
      ui.button({ id: "dec", label: "-1" }),
    ]),
    ui.divider(),
    ui.text(`Last updated: iteration ${count}`, { style: { dim: true } }),
  ]);
}

function reactCounterTree(
  React: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  count: number,
): unknown {
  const h = React.createElement;
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1, gap: 1 },
    h(C.Text as string, { bold: true }, "Counter Benchmark"),
    h(
      C.Box as string,
      { flexDirection: "row", gap: 2 },
      h(C.Text as string, null, `Count: ${count}`),
      h(C.Text as string, null, "[+1]"),
      h(C.Text as string, null, "[-1]"),
    ),
    h(C.Text as string, { dimColor: true }, `Last updated: iteration ${count}`),
  );
}

// ── Runners ─────────────────────────────────────────────────────────

async function runRezi(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = new BenchBackend();

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

async function runInkCompat(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = new BenchBackend();

  const initialFrame = backend.waitForFrame();
  const instance = InkCompat.render(
    reactCounterTree(React, InkCompat, 0) as React.ReactNode,
    { internal_backend: backend } as never,
  );
  await initialFrame;

  try {
    // Warmup (excluded from measured stats).
    for (let i = 0; i < config.warmup; i++) {
      const frameP = backend.waitForFrame();
      instance.rerender(reactCounterTree(React, InkCompat, i + 1) as React.ReactNode);
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const frameP = backend.waitForFrame();
        instance.rerender(
          reactCounterTree(React, InkCompat, config.warmup + i + 1) as React.ReactNode,
        );
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
  const stdin = new NullReadable();

  const initialWrite = stdout.waitForWrite();
  const instance = Ink.render(reactCounterTree(React, Ink, 0) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initialWrite;

  try {
    // Warmup (excluded from measured stats).
    for (let i = 0; i < config.warmup; i++) {
      const writeP = stdout.waitForWrite();
      instance.rerender(reactCounterTree(React, Ink, i + 1) as React.ReactNode);
      await writeP;
    }

    const writeBase = stdout.writeCount;
    const bytesBase = stdout.totalBytes;

    // Seed offset: Ink deduplicates identical stdout output.
    const metrics = await benchAsync(
      async (i) => {
        const writeP = stdout.waitForWrite();
        instance.rerender(reactCounterTree(React, Ink, config.warmup + i + 1) as React.ReactNode);
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

export const rerenderScenario: Scenario = {
  name: "rerender",
  description: "State update → new frame (small counter app, isolates per-update cost)",
  defaultConfig: { warmup: 100, iterations: 1000 },
  paramSets: [{}],
  frameworks: ["rezi-native", "ink-compat", "ink"],

  async run(framework: Framework, config: ScenarioConfig) {
    tryGc();
    switch (framework) {
      case "rezi-native":
        return runRezi(config);
      case "ink-compat":
        return runInkCompat(config);
      case "ink":
        return runInk(config);
    }
  },
};
