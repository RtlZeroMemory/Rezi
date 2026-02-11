/**
 * Per-phase profiler: measures time spent in each pipeline stage.
 * Usage: REZI_PERF=1 REZI_PERF_DETAIL=1 npx tsx src/profile-phases.ts
 */

import { type VNode, createApp, perfReset, perfSnapshot, ui } from "@rezi-ui/core";
import { BenchBackend } from "./backends.js";

const LIST_SIZE = 500;

function reziListTree(selected: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < LIST_SIZE; i++) {
    const isSelected = i === selected;
    rows.push(
      ui.row({ gap: 1 }, [
        ui.text(isSelected ? ">" : " ", { style: { bold: isSelected } }),
        ui.text(`${String(i).padStart(3, " ")}.`, { style: { dim: !isSelected } }),
        ui.text(`entry-${i}.log`, { style: { bold: isSelected, inverse: isSelected } }),
        ui.text(`${(i * 1024 + 512).toLocaleString()} B`, { style: { dim: true } }),
      ]),
    );
  }
  return ui.column({ p: 0 }, [
    ui.row({ gap: 2 }, [
      ui.text("Files", { style: { bold: true } }),
      ui.text(`${LIST_SIZE} items`),
      ui.text(`Selected: ${selected}`, { style: { dim: true } }),
    ]),
    ui.divider(),
    ...rows,
  ]);
}

async function main() {
  const backend = new BenchBackend(120, 540);
  type State = { selected: number };
  const app = createApp<State>({ backend, initialState: { selected: 0 } });
  app.view((state) => reziListTree(state.selected));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  // Warmup
  for (let i = 0; i < 20; i++) {
    const frameP = backend.waitForFrame();
    app.update((s) => ({ selected: (s.selected + 1) % LIST_SIZE }));
    await frameP;
  }

  // Reset perf counters after warmup
  perfReset();

  // Measured iterations
  const ITERS = 100;
  for (let i = 0; i < ITERS; i++) {
    const frameP = backend.waitForFrame();
    app.update((s) => ({ selected: (s.selected + 1) % LIST_SIZE }));
    await frameP;
  }

  const snap = perfSnapshot();
  console.log(`\n=== Per-phase profiling (${ITERS} iterations, content-update scenario) ===\n`);

  // Also measure the view function (VNode construction) time directly
  const viewTimes: number[] = [];
  for (let i = 0; i < 50; i++) {
    const sel = i % LIST_SIZE;
    const t0 = performance.now();
    reziListTree(sel);
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
