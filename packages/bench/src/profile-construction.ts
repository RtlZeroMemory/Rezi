/**
 * Per-phase profiler for tree-construction at items=1000.
 * Usage: REZI_PERF=1 REZI_PERF_DETAIL=1 npx tsx src/profile-construction.ts
 */

import { createApp, perfReset, perfSnapshot } from "@rezi-ui/core";
import { BenchBackend } from "./backends.js";
import { buildReziTree } from "./scenarios/treeBuilders.js";

async function main() {
  const N = 1000;
  const backend = new BenchBackend(120, N + 5);
  type State = { seed: number };
  const app = createApp<State>({ backend, initialState: { seed: 0 } });
  app.view((state) => buildReziTree(N, state.seed));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  // Warmup
  for (let i = 0; i < 20; i++) {
    const frameP = backend.waitForFrame();
    app.update((s) => ({ seed: s.seed + 1 }));
    await frameP;
  }

  perfReset();

  const ITERS = 50;
  for (let i = 0; i < ITERS; i++) {
    const frameP = backend.waitForFrame();
    app.update((s) => ({ seed: s.seed + 1 }));
    await frameP;
  }

  const snap = perfSnapshot();
  console.log(`\n=== Per-phase profiling (${ITERS} iters, tree-construction items=${N}) ===\n`);

  // Direct view function timing
  const viewTimes: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    buildReziTree(N, i);
    const t1 = performance.now();
    viewTimes.push(t1 - t0);
  }
  const viewAvg = viewTimes.reduce((a, b) => a + b, 0) / viewTimes.length;
  console.log(`  VNode construction (direct):  ${(viewAvg * 1000).toFixed(0)}µs avg`);
  console.log("");

  for (const [phase, stats] of Object.entries(snap.phases)) {
    if (!stats || stats.count === 0) continue;
    console.log(
      `  ${phase.padEnd(22)} avg=${(stats.avg * 1000).toFixed(0).padStart(6)}µs  ` +
        `p95=${(stats.p95 * 1000).toFixed(0).padStart(6)}µs  ` +
        `p99=${(stats.p99 * 1000).toFixed(0).padStart(6)}µs  ` +
        `count=${String(stats.count).padStart(5)}`,
    );
  }

  await app.stop();
  app.dispose();
}

main().catch(console.error);
