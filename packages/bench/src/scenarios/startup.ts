/**
 * Scenario: Startup Latency (Time to First Frame)
 *
 * Measures the cold-start cost from framework initialization to
 * the first visible frame. This is the most impactful UX metric:
 * the time a user waits after launching before seeing anything.
 *
 * Each iteration is a complete lifecycle:
 *   1. Create the framework instance
 *   2. Mount a medium-sized widget tree (50 items)
 *   3. Wait for the first frame / write
 *   4. Tear down
 *
 * This captures import cost, reconciler/engine init, first layout,
 * and first render — everything the user pays on app launch.
 */

import { BenchBackend, MeasuringStream, NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { computeStats, diffCpu, peakMemory, takeCpu, takeMemory, tryGc } from "../measure.js";
import type {
  BenchMetrics,
  Framework,
  MemorySnapshot,
  Scenario,
  ScenarioConfig,
} from "../types.js";
import {
  buildBlessedTree,
  buildReactTree,
  buildReziTree,
  buildTermkitTree,
} from "./treeBuilders.js";

const TREE_SIZE = 50;

async function runRezi(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");

  const samples: number[] = [];

  // Warmup
  for (let w = 0; w < config.warmup; w++) {
    const backend = new BenchBackend();
    const app = createApp({ backend, initialState: { seed: w } });
    app.view((state: { seed: number }) => buildReziTree(TREE_SIZE, state.seed));
    const p = backend.waitForFrame();
    await app.start();
    await p;
    await app.stop();
    app.dispose();
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();
  let totalBytes = 0;

  for (let i = 0; i < config.iterations; i++) {
    const backend = new BenchBackend();
    const app = createApp({ backend, initialState: { seed: i } });
    app.view((state: { seed: number }) => buildReziTree(TREE_SIZE, state.seed));

    const ts = performance.now();
    const p = backend.waitForFrame();
    await app.start();
    await p;
    samples.push(performance.now() - ts);

    totalBytes += backend.totalFrameBytes;
    await app.stop();
    app.dispose();

    if (i % 50 === 49) {
      memMax = peakMemory(memMax, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: totalBytes,
    ptyBytesObserved: null,
  };
}

async function runInkCompat(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");

  const samples: number[] = [];

  for (let w = 0; w < config.warmup; w++) {
    const backend = new BenchBackend();
    const p = backend.waitForFrame();
    const inst = InkCompat.render(
      buildReactTree(React, InkCompat, TREE_SIZE, w) as React.ReactNode,
      { internal_backend: backend } as never,
    );
    await p;
    inst.unmount();
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();
  let totalBytes = 0;

  for (let i = 0; i < config.iterations; i++) {
    const backend = new BenchBackend();
    const ts = performance.now();
    const p = backend.waitForFrame();
    const inst = InkCompat.render(
      buildReactTree(React, InkCompat, TREE_SIZE, i) as React.ReactNode,
      { internal_backend: backend } as never,
    );
    await p;
    samples.push(performance.now() - ts);

    totalBytes += backend.totalFrameBytes;
    inst.unmount();

    if (i % 50 === 49) {
      memMax = peakMemory(memMax, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: totalBytes,
    ptyBytesObserved: null,
  };
}

async function runInk(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");

  const samples: number[] = [];

  for (let w = 0; w < config.warmup; w++) {
    const stdout = new MeasuringStream();
    const stdin = new NullReadable();
    const p = stdout.waitForWrite();
    const inst = Ink.render(buildReactTree(React, Ink, TREE_SIZE, w) as React.ReactNode, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
      exitOnCtrlC: false,
    });
    await p;
    inst.unmount();
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();
  let totalBytes = 0;

  for (let i = 0; i < config.iterations; i++) {
    const stdout = new MeasuringStream();
    const stdin = new NullReadable();

    const ts = performance.now();
    const p = stdout.waitForWrite();
    const inst = Ink.render(buildReactTree(React, Ink, TREE_SIZE, i) as React.ReactNode, {
      stdout: stdout as unknown as NodeJS.WriteStream,
      stdin: stdin as unknown as NodeJS.ReadStream,
      patchConsole: false,
      exitOnCtrlC: false,
    });
    await p;
    samples.push(performance.now() - ts);

    totalBytes += stdout.totalBytes;
    inst.unmount();

    if (i % 50 === 49) {
      memMax = peakMemory(memMax, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: totalBytes,
    ptyBytesObserved: null,
  };
}

async function runTermkit(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createTermkitContext } = await import("../termkit-backend.js");

  const samples: number[] = [];

  // Warmup
  for (let w = 0; w < config.warmup; w++) {
    const ctx = createTermkitContext(120, 40);
    buildTermkitTree(ctx.buffer, TREE_SIZE, w);
    ctx.buffer.draw({ delta: false });
    ctx.dispose();
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();
  let totalBytes = 0;

  for (let i = 0; i < config.iterations; i++) {
    const ctx = createTermkitContext(120, 40);

    const ts = performance.now();
    buildTermkitTree(ctx.buffer, TREE_SIZE, i);
    ctx.buffer.draw({ delta: false });
    samples.push(performance.now() - ts);

    totalBytes += ctx.totalBytes;
    ctx.dispose();

    if (i % 50 === 49) {
      memMax = peakMemory(memMax, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: totalBytes,
    ptyBytesObserved: null,
  };
}

async function runBlessed(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createBlessedContext } = await import("../blessed-backend.js");

  const samples: number[] = [];

  for (let w = 0; w < config.warmup; w++) {
    const ctx = createBlessedContext(120, 60);
    buildBlessedTree(ctx.blessed, ctx.screen, TREE_SIZE, w);
    ctx.screen.render();
    ctx.flush();
    ctx.dispose();
  }

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();
  let totalBytes = 0;

  for (let i = 0; i < config.iterations; i++) {
    const ctx = createBlessedContext(120, 60);

    const ts = performance.now();
    buildBlessedTree(ctx.blessed, ctx.screen, TREE_SIZE, i);
    ctx.screen.render();
    ctx.flush();
    samples.push(performance.now() - ts);

    totalBytes += ctx.totalBytes;
    ctx.dispose();

    if (i % 50 === 49) {
      memMax = peakMemory(memMax, takeMemory());
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);

  return {
    timing: computeStats(samples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: null,
    heapUsedSlopeKbPerIter: null,
    memStable: null,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: totalBytes,
    ptyBytesObserved: null,
  };
}

async function runRatatui(config: ScenarioConfig): Promise<BenchMetrics> {
  const { runRatatui: exec } = await import("../ratatui-runner.js");
  return exec("startup", config);
}

async function runOpenTui(config: ScenarioConfig): Promise<BenchMetrics> {
  return runOpenTuiScenario("startup", config, {});
}

export const startupScenario: Scenario = {
  name: "startup",
  description: "Time to first frame: full lifecycle from create → first visible output",
  defaultConfig: { warmup: 10, iterations: 100 },
  paramSets: [{}],
  frameworks: [
    "rezi-native",
    "ink",
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
      case "ink":
        return runInk(config);
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
        throw new Error(`startup: unsupported framework "${framework}"`);
    }
  },
};
