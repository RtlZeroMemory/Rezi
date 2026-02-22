/**
 * Scenario: Memory Profile & Stability
 *
 * Runs a sustained workload (many iterations) and samples memory
 * periodically to detect:
 *   - Baseline memory footprint
 *   - Memory growth rate (leak detection)
 *   - GC pressure (heap churn)
 *   - Peak memory usage
 *
 * Also measures CPU time for the sustained workload.
 */

import { type VNode, ui } from "@rezi-ui/core";
import { NullReadable } from "../backends.js";
import { runOpenTuiScenario } from "../frameworks/opentui.js";
import { createBenchBackend, createInkStdout } from "../io.js";
import { computeStats, diffCpu, peakMemory, takeCpu, takeMemory, tryGc } from "../measure.js";
import type {
  BenchMetrics,
  Framework,
  MemorySnapshot,
  NodeMemorySnapshot,
  Scenario,
  ScenarioConfig,
} from "../types.js";

const SAMPLE_INTERVAL = 50; // sample memory every N iterations

// ── Tree builders ───────────────────────────────────────────────────

function reziTree(i: number): VNode {
  return ui.column({ p: 1 }, [
    ui.text(`Iteration ${i}`, { style: { bold: true } }),
    ui.row({ gap: 1 }, [ui.progress((i % 100) / 100, { width: 20 }), ui.text(`${i % 100}%`)]),
    ui.divider(),
    ...Array.from({ length: 20 }, (_, j) =>
      ui.text(`  Line ${j}: value=${i * 20 + j}`, { style: { dim: j % 2 === 0 } }),
    ),
  ]);
}

function reactTree(
  React: { createElement: typeof import("react").createElement },
  C: { Box: unknown; Text: unknown },
  i: number,
): unknown {
  const h = React.createElement;
  return h(
    C.Box as string,
    { flexDirection: "column", paddingX: 1 },
    h(C.Text as string, { bold: true }, `Iteration ${i}`),
    h(
      C.Box as string,
      { flexDirection: "row", gap: 1 },
      h(
        C.Text as string,
        null,
        `[${"#".repeat(Math.floor((i % 100) / 5))}${".".repeat(20 - Math.floor((i % 100) / 5))}]`,
      ),
      h(C.Text as string, null, `${i % 100}%`),
    ),
    ...Array.from({ length: 20 }, (_, j) =>
      h(
        C.Text as string,
        { key: String(j), dimColor: j % 2 === 0 },
        `  Line ${j}: value=${i * 20 + j}`,
      ),
    ),
  );
}

// ── Core measurement loop ───────────────────────────────────────────

interface MemoryProfile {
  samples: NodeMemorySnapshot[];
  growthRateKbPerIter: number;
  heapUsedGrowthRateKbPerIter: number;
  stable: boolean;
}

function analyzeMemory(samples: NodeMemorySnapshot[]): MemoryProfile {
  if (samples.length < 3) {
    return { samples, growthRateKbPerIter: 0, heapUsedGrowthRateKbPerIter: 0, stable: true };
  }
  // Linear regression on RSS/heapUsed to detect growth (slope in KB / iteration).
  const n = samples.length;
  let sumX = 0;
  let sumY = 0;
  let sumYHeap = 0;
  let sumXY = 0;
  let sumXYHeap = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 1) * SAMPLE_INTERVAL;
    const sample = samples[i];
    if (!sample) {
      continue;
    }
    const y = sample.rssKb;
    const yHeap = sample.heapUsedKb;
    sumX += x;
    sumY += y;
    sumYHeap += yHeap;
    sumXY += x * y;
    sumXYHeap += x * yHeap;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  const slopeRss = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const slopeHeap = denom === 0 ? 0 : (n * sumXYHeap - sumX * sumYHeap) / denom;
  // Stable if RSS grows < 1KB per sample interval
  return {
    samples,
    growthRateKbPerIter: slopeRss,
    heapUsedGrowthRateKbPerIter: slopeHeap,
    stable: Math.abs(slopeRss) < 1 / SAMPLE_INTERVAL,
  };
}

// ── Runners ─────────────────────────────────────────────────────────

async function runRezi(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createApp } = await import("@rezi-ui/core");
  const backend = await createBenchBackend();

  type State = { iteration: number };
  const app = createApp<State>({
    backend,
    initialState: { iteration: 0 },
  });

  app.view((state) => reziTree(state.iteration));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  const memorySamples: NodeMemorySnapshot[] = [];
  const timingSamples: number[] = [];

  try {
    // Warmup
    for (let i = 0; i < config.warmup; i++) {
      const frameP = backend.waitForFrame();
      app.update((s) => ({ iteration: s.iteration + 1 }));
      await frameP;
    }

    const frameBase = backend.frameCount;
    const bytesBase = backend.totalFrameBytes;

    tryGc();
    const memBefore = takeMemory();
    const cpuBefore = takeCpu();
    let memMax: MemorySnapshot = memBefore;
    const t0 = performance.now();

    for (let i = 0; i < config.iterations; i++) {
      const ts = performance.now();
      const frameP = backend.waitForFrame();
      app.update((s) => ({ iteration: s.iteration + 1 }));
      await frameP;
      timingSamples.push(performance.now() - ts);

      if (i % SAMPLE_INTERVAL === SAMPLE_INTERVAL - 1) {
        const snap = takeMemory();
        memorySamples.push(snap);
        memMax = peakMemory(memMax, snap);
      }
    }

    const totalWallMs = performance.now() - t0;
    const cpuAfter = takeCpu();
    const memAfter = takeMemory();
    memMax = peakMemory(memMax, memAfter);

    const prof = analyzeMemory(memorySamples);

    return {
      timing: computeStats(timingSamples),
      memBefore,
      memAfter,
      memPeak: memMax,
      rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
      heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
      rssSlopeKbPerIter: prof.growthRateKbPerIter,
      heapUsedSlopeKbPerIter: prof.heapUsedGrowthRateKbPerIter,
      memStable: prof.stable,
      cpu: diffCpu(cpuBefore, cpuAfter),
      iterations: config.iterations,
      totalWallMs,
      opsPerSec: config.iterations / (totalWallMs / 1000),
      framesProduced: backend.frameCount - frameBase,
      bytesProduced: backend.totalFrameBytes - bytesBase,
      ptyBytesObserved: null,
    };
  } finally {
    await app.stop();
    app.dispose();
  }
}

async function runInkCompat(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const InkCompat = await import("@rezi-ui/ink-compat");
  const backend = await createBenchBackend();

  const initialFrame = backend.waitForFrame();
  const instance = InkCompat.render(
    reactTree(React, InkCompat, 0) as React.ReactNode,
    { internal_backend: backend } as never,
  );
  await initialFrame;

  const memorySamples: NodeMemorySnapshot[] = [];
  const timingSamples: number[] = [];

  // Warmup — offset by 1 to differ from initial render (i=0)
  for (let i = 0; i < config.warmup; i++) {
    const p = backend.waitForFrame();
    instance.rerender(reactTree(React, InkCompat, i + 1) as React.ReactNode);
    await p;
  }

  const frameBase = backend.frameCount;
  const bytesBase = backend.totalFrameBytes;

  try {
    tryGc();
    const memBefore = takeMemory();
    const cpuBefore = takeCpu();
    let memMax: MemorySnapshot = memBefore;
    const t0 = performance.now();

    for (let i = 0; i < config.iterations; i++) {
      const ts = performance.now();
      const p = backend.waitForFrame();
      instance.rerender(reactTree(React, InkCompat, config.warmup + i + 1) as React.ReactNode);
      await p;
      timingSamples.push(performance.now() - ts);

      if (i % SAMPLE_INTERVAL === SAMPLE_INTERVAL - 1) {
        const snap = takeMemory();
        memorySamples.push(snap);
        memMax = peakMemory(memMax, snap);
      }
    }

    const totalWallMs = performance.now() - t0;
    const cpuAfter = takeCpu();
    const memAfter = takeMemory();
    memMax = peakMemory(memMax, memAfter);
    const prof = analyzeMemory(memorySamples);

    return {
      timing: computeStats(timingSamples),
      memBefore,
      memAfter,
      memPeak: memMax,
      rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
      heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
      rssSlopeKbPerIter: prof.growthRateKbPerIter,
      heapUsedSlopeKbPerIter: prof.heapUsedGrowthRateKbPerIter,
      memStable: prof.stable,
      cpu: diffCpu(cpuBefore, cpuAfter),
      iterations: config.iterations,
      totalWallMs,
      opsPerSec: config.iterations / (totalWallMs / 1000),
      framesProduced: backend.frameCount - frameBase,
      bytesProduced: backend.totalFrameBytes - bytesBase,
      ptyBytesObserved: null,
    };
  } finally {
    instance.unmount();
  }
}

async function runInk(config: ScenarioConfig): Promise<BenchMetrics> {
  const React = await import("react");
  const Ink = await import("ink");
  const stdout = createInkStdout();
  const stdin = new NullReadable();

  const initialWrite = stdout.waitForWrite();
  const instance = Ink.render(reactTree(React, Ink, 0) as React.ReactNode, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  await initialWrite;

  const memorySamples: NodeMemorySnapshot[] = [];
  const timingSamples: number[] = [];

  // Warmup — offset by 1 to differ from initial render (Ink deduplicates identical output)
  for (let i = 0; i < config.warmup; i++) {
    const p = stdout.waitForWrite();
    instance.rerender(reactTree(React, Ink, i + 1) as React.ReactNode);
    await p;
  }

  const writeBase = stdout.writeCount;
  const bytesBase = stdout.totalBytes;

  try {
    tryGc();
    const memBefore = takeMemory();
    const cpuBefore = takeCpu();
    let memMax: MemorySnapshot = memBefore;
    const t0 = performance.now();

    for (let i = 0; i < config.iterations; i++) {
      const ts = performance.now();
      const p = stdout.waitForWrite();
      instance.rerender(reactTree(React, Ink, config.warmup + i + 1) as React.ReactNode);
      await p;
      timingSamples.push(performance.now() - ts);

      if (i % SAMPLE_INTERVAL === SAMPLE_INTERVAL - 1) {
        const snap = takeMemory();
        memorySamples.push(snap);
        memMax = peakMemory(memMax, snap);
      }
    }

    const totalWallMs = performance.now() - t0;
    const cpuAfter = takeCpu();
    const memAfter = takeMemory();
    memMax = peakMemory(memMax, memAfter);
    const prof = analyzeMemory(memorySamples);

    return {
      timing: computeStats(timingSamples),
      memBefore,
      memAfter,
      memPeak: memMax,
      rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
      heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
      rssSlopeKbPerIter: prof.growthRateKbPerIter,
      heapUsedSlopeKbPerIter: prof.heapUsedGrowthRateKbPerIter,
      memStable: prof.stable,
      cpu: diffCpu(cpuBefore, cpuAfter),
      iterations: config.iterations,
      totalWallMs,
      opsPerSec: config.iterations / (totalWallMs / 1000),
      framesProduced: stdout.writeCount - writeBase,
      bytesProduced: stdout.totalBytes - bytesBase,
      ptyBytesObserved: null,
    };
  } finally {
    instance.unmount();
  }
}

// ── terminal-kit tree builder ─────────────────────────────────────────

function termkitMemTree(
  buffer: { put: (opts: Record<string, unknown>, str: string) => void; fill: () => void },
  i: number,
): void {
  buffer.fill();
  buffer.put({ x: 1, y: 0, attr: { bold: true } }, `Iteration ${i}`);
  const pct = i % 100;
  const filled = Math.floor(pct / 5);
  const bar = `[${"#".repeat(filled)}${".".repeat(20 - filled)}] ${pct}%`;
  buffer.put({ x: 1, y: 1 }, bar);
  for (let j = 0; j < 20; j++) {
    buffer.put({ x: 1, y: 3 + j, attr: { dim: j % 2 === 0 } }, `  Line ${j}: value=${i * 20 + j}`);
  }
}

async function runTermkit(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createTermkitContext } = await import("../termkit-backend.js");
  const ctx = createTermkitContext(120, 40);

  // Initial render
  termkitMemTree(ctx.buffer, 0);
  ctx.buffer.draw({ delta: false });

  const memorySamples: NodeMemorySnapshot[] = [];
  const timingSamples: number[] = [];

  // Warmup
  for (let i = 0; i < config.warmup; i++) {
    termkitMemTree(ctx.buffer, i + 1);
    ctx.buffer.draw({ delta: true });
  }

  ctx.resetBytes();

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();

  for (let i = 0; i < config.iterations; i++) {
    const ts = performance.now();
    termkitMemTree(ctx.buffer, config.warmup + i + 1);
    ctx.buffer.draw({ delta: true });
    timingSamples.push(performance.now() - ts);

    if (i % SAMPLE_INTERVAL === SAMPLE_INTERVAL - 1) {
      const snap = takeMemory();
      memorySamples.push(snap);
      memMax = peakMemory(memMax, snap);
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);
  const prof = analyzeMemory(memorySamples);

  const result: BenchMetrics = {
    timing: computeStats(timingSamples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: prof.growthRateKbPerIter,
    heapUsedSlopeKbPerIter: prof.heapUsedGrowthRateKbPerIter,
    memStable: prof.stable,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: ctx.totalBytes,
    ptyBytesObserved: null,
  };

  ctx.dispose();
  return result;
}

// ── blessed memory tree ───────────────────────────────────────────────

function blessedMemTree(
  blessed: { text: (opts: Record<string, unknown>) => unknown },
  screen: {
    append: (el: unknown) => void;
    children: unknown[];
    remove: (el: unknown) => void;
  },
  i: number,
): void {
  while (screen.children.length > 0) screen.remove(screen.children[0]);
  screen.append(
    blessed.text({
      top: 0,
      left: 1,
      content: `Iteration ${i}`,
      style: { bold: true },
      tags: false,
    }),
  );
  const pct = i % 100;
  const filled = Math.floor(pct / 5);
  const bar = `[${"#".repeat(filled)}${".".repeat(20 - filled)}] ${pct}%`;
  screen.append(blessed.text({ top: 1, left: 1, content: bar, tags: false }));
  for (let j = 0; j < 20; j++) {
    screen.append(
      blessed.text({
        top: 3 + j,
        left: 1,
        content: `  Line ${j}: value=${i * 20 + j}`,
        style: { fg: j % 2 === 0 ? "grey" : "white" },
        tags: false,
      }),
    );
  }
}

async function runBlessed(config: ScenarioConfig): Promise<BenchMetrics> {
  const { createBlessedContext } = await import("../blessed-backend.js");
  const ctx = createBlessedContext(120, 40);

  blessedMemTree(ctx.blessed, ctx.screen, 0);
  ctx.screen.render();
  ctx.flush();

  const memorySamples: NodeMemorySnapshot[] = [];
  const timingSamples: number[] = [];

  // Warmup
  for (let i = 0; i < config.warmup; i++) {
    blessedMemTree(ctx.blessed, ctx.screen, i + 1);
    ctx.screen.render();
    ctx.flush();
  }

  ctx.resetBytes();

  tryGc();
  const memBefore = takeMemory();
  const cpuBefore = takeCpu();
  let memMax: MemorySnapshot = memBefore;
  const t0 = performance.now();

  for (let i = 0; i < config.iterations; i++) {
    const ts = performance.now();
    blessedMemTree(ctx.blessed, ctx.screen, config.warmup + i + 1);
    ctx.screen.render();
    ctx.flush();
    timingSamples.push(performance.now() - ts);

    if (i % SAMPLE_INTERVAL === SAMPLE_INTERVAL - 1) {
      const snap = takeMemory();
      memorySamples.push(snap);
      memMax = peakMemory(memMax, snap);
    }
  }

  const totalWallMs = performance.now() - t0;
  const cpuAfter = takeCpu();
  const memAfter = takeMemory();
  memMax = peakMemory(memMax, memAfter);
  const prof = analyzeMemory(memorySamples);

  const result: BenchMetrics = {
    timing: computeStats(timingSamples),
    memBefore,
    memAfter,
    memPeak: memMax,
    rssGrowthKb: memAfter.rssKb - memBefore.rssKb,
    heapUsedGrowthKb: memAfter.heapUsedKb - memBefore.heapUsedKb,
    rssSlopeKbPerIter: prof.growthRateKbPerIter,
    heapUsedSlopeKbPerIter: prof.heapUsedGrowthRateKbPerIter,
    memStable: prof.stable,
    cpu: diffCpu(cpuBefore, cpuAfter),
    iterations: config.iterations,
    totalWallMs,
    opsPerSec: config.iterations / (totalWallMs / 1000),
    framesProduced: config.iterations,
    bytesProduced: ctx.totalBytes,
    ptyBytesObserved: null,
  };

  ctx.dispose();
  return result;
}

async function runRatatui(config: ScenarioConfig): Promise<BenchMetrics> {
  const { runRatatui: exec } = await import("../ratatui-runner.js");
  return exec("memory-profile", config);
}

async function runOpenTui(config: ScenarioConfig): Promise<BenchMetrics> {
  return runOpenTuiScenario("memory-profile", config, {});
}

export const memoryScenario: Scenario = {
  name: "memory-profile",
  description: "Sustained workload measuring memory footprint, growth, CPU usage, and stability",
  defaultConfig: { warmup: 50, iterations: 2000 },
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

  async run(framework, config) {
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
        throw new Error(`memory-profile: unsupported framework "${framework}"`);
    }
  },
};
