/**
 * Scenario: Tree Construction + Scaling
 *
 * Measures the time to construct a complete widget tree from scratch.
 *
 * - Rezi native: createApp → state update → view rebuild → diff → drawlist → requestFrame.
 * - ink-compat: React reconciler → VNode pipeline (via renderToVNode-style approach).
 * - Ink: React reconciler → Yoga layout → ANSI output (via render + MeasuringStream).
 *
 * Parameterized by tree size: 10, 100, 500, 1000, 5000 items.
 */

import { BenchBackend, MeasuringStream, NullReadable } from "../backends.js";
import { benchAsync, tryGc } from "../measure.js";
import type { BenchMetrics, Framework, Scenario, ScenarioConfig } from "../types.js";
import { buildReactTree, buildReziTree } from "./treeBuilders.js";

async function runRezi(config: ScenarioConfig, n: number): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = new BenchBackend();

  type State = { seed: number };
  const app = createApp<State>({
    backend,
    initialState: { seed: 0 },
  });

  app.view((state) => buildReziTree(n, state.seed));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  try {
    for (let i = 0; i < config.warmup; i++) {
      const frameP = backend.waitForFrame();
      app.update((s) => ({ seed: s.seed + 1 }));
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    const metrics = await benchAsync(
      async (i) => {
        const frameP = backend.waitForFrame();
        app.update((s) => ({ seed: s.seed + 1 }));
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

async function runInkCompat(config: ScenarioConfig, n: number): Promise<BenchMetrics> {
  let React: typeof import("react");
  let InkCompat: typeof import("@rezi-ui/ink-compat");
  try {
    React = await import("react");
    InkCompat = await import("@rezi-ui/ink-compat");
  } catch {
    throw new Error("@rezi-ui/ink-compat or react not available");
  }

  const backend = new BenchBackend();

  // Set up the frame waiter BEFORE render() — the initial frame may be
  // produced in microtasks before we get a chance to await.
  const initialFrame = backend.waitForFrame();
  const tree = buildReactTree(React, InkCompat, n) as React.ReactNode;
  const instance = InkCompat.render(tree, { internal_backend: backend } as never);
  await initialFrame;

  try {
    // Warmup (excluded from measured stats).
    for (let i = 0; i < config.warmup; i++) {
      const frameP = backend.waitForFrame();
      instance.rerender(buildReactTree(React, InkCompat, n, i + 1) as React.ReactNode);
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    // Now benchmark rerenders (construction + reconciliation + VNode conversion).
    // Seed starts after warmup so each frame remains visually distinct for Ink-style dedupe.
    const metrics = await benchAsync(
      async (i) => {
        const frameP = backend.waitForFrame();
        instance.rerender(
          buildReactTree(React, InkCompat, n, config.warmup + i + 1) as React.ReactNode,
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

async function runInk(config: ScenarioConfig, n: number): Promise<BenchMetrics> {
  let React: typeof import("react");
  let Ink: typeof import("ink");
  try {
    React = await import("react");
    Ink = await import("ink");
  } catch {
    throw new Error("ink or react not available — install: npm i ink react");
  }

  const stdout = new MeasuringStream();
  const stdin = new NullReadable();

  const tree = buildReactTree(React, Ink, n) as React.ReactNode;
  const initialWrite = stdout.waitForWrite();
  const instance = Ink.render(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initialWrite;

  try {
    // Warmup (excluded from measured stats).
    // Seed starts at 1 — Ink deduplicates identical output, so each frame must differ.
    for (let i = 0; i < config.warmup; i++) {
      const writeP = stdout.waitForWrite();
      instance.rerender(buildReactTree(React, Ink, n, i + 1) as React.ReactNode);
      await writeP;
    }

    const writeBase = stdout.writeCount;
    const bytesBase = stdout.totalBytes;

    const metrics = await benchAsync(
      async (i) => {
        const writeP = stdout.waitForWrite();
        instance.rerender(buildReactTree(React, Ink, n, config.warmup + i + 1) as React.ReactNode);
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

export const constructionScenario: Scenario = {
  name: "tree-construction",
  description: "Build a widget tree from scratch (parameterized by item count)",
  defaultConfig: { warmup: 50, iterations: 500 },
  paramSets: [{ items: 10 }, { items: 100 }, { items: 500 }, { items: 1000 }],
  frameworks: ["rezi-native", "ink-compat", "ink"],

  async run(framework: Framework, config: ScenarioConfig, params) {
    const { items: n } = params as { items: number };
    tryGc();

    switch (framework) {
      case "rezi-native":
        return runRezi(config, n);
      case "ink-compat":
        return runInkCompat(config, n);
      case "ink":
        return runInk(config, n);
    }
  },
};
