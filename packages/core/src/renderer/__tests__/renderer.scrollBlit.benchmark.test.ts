import { assert, describe, test } from "@rezi-ui/testkit";
import type { Viewport, WidgetRenderPlan } from "../../app/widgetRenderer.js";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { BackendEventBatch } from "../../backend.js";
import { ZREV_MAGIC, ZR_EVENT_BATCH_VERSION_V1 } from "../../abi.js";
import type { VNode } from "../../index.js";
import { ui } from "../../index.js";
import { DEFAULT_TERMINAL_CAPS, type TerminalCaps } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";

const OP_BLIT_RECT = 14;
const HEADER_SIZE = 64;
const FULL_PLAN: WidgetRenderPlan = Object.freeze({
  commit: true,
  layout: true,
  checkLayoutStability: true,
});
const PARTIAL_PLAN: WidgetRenderPlan = Object.freeze({
  commit: true,
  layout: false,
  checkLayoutStability: false,
});
const NOOP_SCROLL = (_next: number) => {};

type BenchCounters = Readonly<{
  bytesPerFrame: number;
  opsPerFrame: number;
  timePerFrameMs: number;
  totalBlitOps: number;
}>;

class CountingBackend implements RuntimeBackend {
  private readonly frameBytes: number[] = [];
  private readonly frameOps: number[] = [];
  private readonly frameBlitOps: number[] = [];

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  dispose(): void {}

  postUserEvent(_tag: number, _payload: Uint8Array): void {}

  async getCaps(): Promise<TerminalCaps> {
    return DEFAULT_TERMINAL_CAPS;
  }

  async requestFrame(drawlist: Uint8Array): Promise<void> {
    const parsed = parseDrawlistStats(drawlist);
    this.frameBytes.push(drawlist.byteLength);
    this.frameOps.push(parsed.cmdCount);
    this.frameBlitOps.push(parsed.blitCount);
  }

  pollEvents(): Promise<BackendEventBatch> {
    return Promise.resolve(emptyEventBatch());
  }

  clear(): void {
    this.frameBytes.length = 0;
    this.frameOps.length = 0;
    this.frameBlitOps.length = 0;
  }

  counters(): BenchCounters {
    return Object.freeze({
      bytesPerFrame: average(this.frameBytes),
      opsPerFrame: average(this.frameOps),
      timePerFrameMs: 0,
      totalBlitOps: this.frameBlitOps.reduce((sum, value) => sum + value, 0),
    });
  }
}

function parseDrawlistStats(drawlist: Uint8Array): Readonly<{ cmdCount: number; blitCount: number }> {
  if (drawlist.byteLength < HEADER_SIZE) {
    return Object.freeze({ cmdCount: 0, blitCount: 0 });
  }

  const dv = new DataView(drawlist.buffer, drawlist.byteOffset, drawlist.byteLength);
  const cmdOffset = dv.getUint32(16, true);
  const cmdBytes = dv.getUint32(20, true);
  const cmdCount = dv.getUint32(24, true);
  if (cmdOffset >= drawlist.byteLength || cmdBytes === 0 || cmdOffset + cmdBytes > drawlist.byteLength) {
    return Object.freeze({ cmdCount, blitCount: 0 });
  }

  let blitCount = 0;
  let off = cmdOffset;
  const end = cmdOffset + cmdBytes;
  while (off + 8 <= end) {
    const opcode = dv.getUint16(off + 0, true);
    const size = dv.getUint32(off + 4, true);
    if (size < 8 || off + size > end) break;
    if (opcode === OP_BLIT_RECT) blitCount++;
    off += size;
  }
  return Object.freeze({ cmdCount, blitCount });
}

function emptyEventBatch(): BackendEventBatch {
  const bytes = new Uint8Array(24);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, ZREV_MAGIC, true);
  dv.setUint32(4, ZR_EVENT_BATCH_VERSION_V1, true);
  dv.setUint32(8, 24, true);
  dv.setUint32(12, 0, true);
  dv.setUint32(16, 0, true);
  dv.setUint32(20, 0, true);
  return { bytes, droppedBatches: 0, release() {} };
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function buildLogsEntries(count: number): readonly {
  id: string;
  timestamp: number;
  level: "info";
  source: string;
  message: string;
}[] {
  const out = new Array<{
    id: string;
    timestamp: number;
    level: "info";
    source: string;
    message: string;
  }>(count);
  for (let i = 0; i < count; i++) {
    out[i] = {
      id: `log-${String(i)}`,
      timestamp: i * 1000,
      level: "info",
      source: "bench",
      message: `entry ${String(i).padStart(5, "0")} lorem ipsum dolor sit amet`,
    };
  }
  return Object.freeze(out);
}

function logsView(
  entries: readonly {
    id: string;
    timestamp: number;
    level: "info";
    source: string;
    message: string;
  }[],
  scrollTop: number,
): VNode {
  return ui.logsConsole({
    id: "logs",
    entries,
    scrollTop,
    onScroll: NOOP_SCROLL,
  });
}

function runLogsScrollBench(
  entries: readonly {
    id: string;
    timestamp: number;
    level: "info";
    source: string;
    message: string;
  }[],
  viewport: Viewport,
  updates: readonly number[],
  mode: "full" | "partial",
): BenchCounters {
  const backend = new CountingBackend();
  const renderer = new WidgetRenderer<{ scrollTop: number }>({
    backend,
  });
  const view = (snapshot: Readonly<{ scrollTop: number }>) => logsView(entries, snapshot.scrollTop);

  const initialScrollTop = updates.length > 0 ? Math.max(0, (updates[0] ?? 0) - 1) : 0;
  const bootstrap = renderer.submitFrame(
    view,
    Object.freeze({ scrollTop: initialScrollTop }),
    viewport,
    defaultTheme,
    noRenderHooks(),
    FULL_PLAN,
  );
  assert.equal(bootstrap.ok, true);

  backend.clear();
  const times: number[] = [];
  for (const nextScrollTop of updates) {
    const plan = mode === "full" ? FULL_PLAN : PARTIAL_PLAN;
    const t0 = performance.now();
    const submitted = renderer.submitFrame(
      view,
      Object.freeze({ scrollTop: nextScrollTop }),
      viewport,
      defaultTheme,
      noRenderHooks(),
      plan,
    );
    const t1 = performance.now();
    assert.equal(submitted.ok, true);
    times.push(t1 - t0);
  }

  const counters = backend.counters();
  return Object.freeze({
    bytesPerFrame: counters.bytesPerFrame,
    opsPerFrame: counters.opsPerFrame,
    timePerFrameMs: average(times),
    totalBlitOps: counters.totalBlitOps,
  });
}

describe("renderer scroll blit benchmark harness", () => {
  const viewport: Viewport = Object.freeze({ cols: 120, rows: 40 });
  const entries = buildLogsEntries(2400);

  test("collects bytes/frame, ops/frame, and time/frame with lower costs under partial blit", () => {
    const scenarios = Object.freeze([
      Object.freeze({
        name: "one-row",
        updates: Array.from({ length: 80 }, (_, i) => 40 + i),
      }),
      Object.freeze({
        name: "multi-row",
        updates: Array.from({ length: 40 }, (_, i) => 60 + i * 3),
      }),
      Object.freeze({
        name: "alternating",
        updates: [120, 118, 121, 117, 122, 116, 123, 115, 124, 114],
      }),
    ]);

    for (const scenario of scenarios) {
      const full = runLogsScrollBench(entries, viewport, scenario.updates, "full");
      const partial = runLogsScrollBench(entries, viewport, scenario.updates, "partial");

      assert.equal(partial.bytesPerFrame < full.bytesPerFrame, true, `${scenario.name}: bytes/frame`);
      assert.equal(partial.opsPerFrame < full.opsPerFrame, true, `${scenario.name}: ops/frame`);
      assert.equal(partial.totalBlitOps > 0, true, `${scenario.name}: expected blit ops`);
      assert.equal(
        partial.timePerFrameMs < full.timePerFrameMs,
        true,
        `${scenario.name}: time/frame`,
      );
    }
  });
});
