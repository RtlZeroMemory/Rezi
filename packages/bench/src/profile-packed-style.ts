/**
 * Packed-style profiler: validates packed style merge counters and render timing.
 *
 * Usage:
 *   REZI_PERF=1 REZI_PERF_DETAIL=1 npx tsx src/profile-packed-style.ts
 */

import {
  type TextStyle,
  type VNode,
  createApp,
  perfReset,
  perfSnapshot,
  rgb,
  ui,
} from "@rezi-ui/core";
import { BenchBackend } from "./backends.js";

const ROWS = 1200;
const WARMUP_ITERS = 20;
const MEASURE_ITERS = 80;

function makeRowStyle(index: number, tick: number): TextStyle {
  return {
    ...((index & 1) === 0 ? { bold: true } : { dim: true }),
    ...(index % 3 === 0
      ? {
          fg: rgb(
            (index * 13 + tick * 7) & 0xff,
            (index * 17 + tick * 5) & 0xff,
            (index * 19 + tick * 3) & 0xff,
          ),
        }
      : {}),
    ...(index % 5 === 0
      ? {
          bg: rgb(
            (index * 11 + tick * 2) & 0xff,
            (index * 7 + tick * 13) & 0xff,
            (index * 3 + tick * 29) & 0xff,
          ),
        }
      : {}),
    ...(index % 7 === 0 ? { underline: true } : {}),
    ...(index % 11 === 0 ? { inverse: true } : {}),
  };
}

function packedStyleTree(tick: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < ROWS; i++) {
    rows.push(
      ui.text(`row-${String(i).padStart(4, "0")} tick=${tick}`, { style: makeRowStyle(i, tick) }),
    );
  }
  return ui.column({ p: 0, gap: 0 }, rows);
}

async function main() {
  const backend = new BenchBackend(160, ROWS + 8);
  type State = { tick: number };
  const app = createApp<State>({ backend, initialState: { tick: 0 } });
  app.view((state) => packedStyleTree(state.tick));

  const initialFrame = backend.waitForFrame();
  await app.start();
  await initialFrame;

  for (let i = 0; i < WARMUP_ITERS; i++) {
    const frameP = backend.waitForFrame();
    app.update((s) => ({ tick: s.tick + 1 }));
    await frameP;
  }

  perfReset();

  for (let i = 0; i < MEASURE_ITERS; i++) {
    const frameP = backend.waitForFrame();
    app.update((s) => ({ tick: s.tick + 1 }));
    await frameP;
  }

  const snap = perfSnapshot();
  const counters = snap.counters;
  const merges = counters.style_merges_performed ?? 0;
  const styleObjects = counters.style_objects_created ?? 0;
  const packRgbCalls = counters.packRgb_calls ?? 0;
  const renderAvgUs = ((snap.phases.render?.avg ?? 0) * 1000).toFixed(0);
  const drawlistAvgUs = ((snap.phases.drawlist_build?.avg ?? 0) * 1000).toFixed(0);
  const reusePct = merges > 0 ? (((merges - styleObjects) / merges) * 100).toFixed(2) : "0.00";

  console.log("\n=== Packed style profile ===\n");
  console.log(`iters: ${String(MEASURE_ITERS)}`);
  console.log(`style_merges_performed: ${String(merges)}`);
  console.log(`style_objects_created:   ${String(styleObjects)}`);
  console.log(`packRgb_calls:           ${String(packRgbCalls)}`);
  console.log(`style object reuse:      ${reusePct}%`);
  console.log(`render avg:              ${renderAvgUs}µs`);
  console.log(`drawlist_build avg:      ${drawlistAvgUs}µs`);

  await app.stop();
  app.dispose();
}

main().catch(console.error);
