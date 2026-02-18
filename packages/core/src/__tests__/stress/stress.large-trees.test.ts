/**
 * packages/core/src/__tests__/stress/stress.large-trees.test.ts
 *
 * Deterministic stress tests for large tree/list workloads.
 *
 * Requirements covered:
 * - 10k node tree layout/render thresholds (CI-stable, robust)
 * - 100k virtual list scroll behavior
 * - deep tree (depth 1000) no stack overflow
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import { WidgetRenderer } from "../../app/widgetRenderer.js";
import type { RuntimeBackend } from "../../backend.js";
import type { DrawlistBuildResult, DrawlistBuilderV1 } from "../../drawlist/index.js";
import type { DrawlistTextRunSegment } from "../../drawlist/types.js";
import type { ZrevEvent } from "../../events.js";
import type { VNode } from "../../index.js";
import { ui } from "../../index.js";
import { type LayoutTree, layout } from "../../layout/layout.js";
import { routeVirtualListWheel } from "../../runtime/router.js";
import { DEFAULT_TERMINAL_CAPS } from "../../terminalCaps.js";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { flattenTree } from "../../widgets/tree.js";
import { clampScrollTop, computeVisibleRange } from "../../widgets/virtualList.js";

type Rng = () => number;

type DeepDataNode = Readonly<{
  id: string;
  children?: readonly DeepDataNode[];
}>;

type VirtualScrollSummary = Readonly<{
  finalScrollTop: number;
  rangeHash: number;
  checkpoints: readonly number[];
}>;

const WARMUP_RUNS = 1;
const MEASURED_RUNS = 5;
const ABS_LAYOUT_10K_BUDGET_MS = 3200;
const ABS_RENDER_10K_BUDGET_MS = 5200;
const LAYOUT_RATIO_BUDGET = 15;
const RENDER_RATIO_BUDGET = 18;
const VLIST_ITEM_COUNT = 100_000;
const VLIST_ITEMS: readonly number[] = Object.freeze(
  Array.from({ length: VLIST_ITEM_COUNT }, (_, i) => i),
);

function nowMs(): number {
  const perf = (globalThis as { performance?: { now: () => number } }).performance;
  return perf ? perf.now() : Date.now();
}

class CountingBuilder implements DrawlistBuilderV1 {
  private opCount = 0;
  private lastBuiltCount = 0;

  getLastBuiltOpCount(): number {
    return this.lastBuiltCount;
  }

  clear(): void {
    this.opCount++;
  }

  clearTo(_cols: number, _rows: number): void {
    this.opCount++;
  }

  fillRect(_x: number, _y: number, _w: number, _h: number): void {
    this.opCount++;
  }

  drawText(_x: number, _y: number, _text: string): void {
    this.opCount++;
  }

  pushClip(_x: number, _y: number, _w: number, _h: number): void {
    this.opCount++;
  }

  popClip(): void {
    this.opCount++;
  }

  addBlob(_bytes: Uint8Array): number | null {
    return null;
  }

  addTextRunBlob(_segments: readonly DrawlistTextRunSegment[]): number | null {
    return null;
  }

  drawTextRun(_x: number, _y: number, _blobIndex: number): void {}

  build(): DrawlistBuildResult {
    this.lastBuiltCount = this.opCount;
    return { ok: true, bytes: new Uint8Array([this.opCount & 0xff]) };
  }

  reset(): void {
    this.opCount = 0;
  }
}

function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function withSeed<T>(seed: number, run: (rng: Rng) => T): T {
  try {
    return run(createRng(seed));
  } catch (error) {
    throw new Error(`[stress.large-trees] seed=${String(seed)} failed: ${describeError(error)}`);
  }
}

function hashString(value: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function mixHash(hash: number, value: number): number {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}

function createNoopBackend(): RuntimeBackend {
  return {
    start: async () => {},
    stop: async () => {},
    dispose: () => {},
    requestFrame: async () => {},
    pollEvents: async () =>
      new Promise((_) => {
        // submitFrame stress tests do not poll backend events.
      }),
    postUserEvent: () => {},
    getCaps: async () => DEFAULT_TERMINAL_CAPS,
  };
}

function noRenderHooks(): { enterRender: () => void; exitRender: () => void } {
  return { enterRender: () => {}, exitRender: () => {} };
}

function buildWideTextTree(leafCount: number): VNode {
  const children: VNode[] = [];
  for (let i = 0; i < leafCount; i++) {
    children.push(ui.text(`n${String(i)}`));
  }
  return ui.column({ p: 0, gap: 0 }, children);
}

function buildDeepColumn(depth: number): VNode {
  let node: VNode = ui.text("leaf");
  for (let i = 0; i < depth; i++) {
    node = ui.column({ p: 0, gap: 0 }, [node]);
  }
  return node;
}

function countVNodeNodes(root: VNode): number {
  const stack: VNode[] = [root];
  let count = 0;

  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    count++;
    const children = (cur as { children?: readonly VNode[] }).children;
    if (!children) continue;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child !== undefined) stack.push(child);
    }
  }

  return count;
}

function layoutChecksum(root: LayoutTree): number {
  let hash = 2166136261 >>> 0;
  const stack: LayoutTree[] = [root];

  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur) continue;
    hash = mixHash(hash, cur.rect.x);
    hash = mixHash(hash, cur.rect.y);
    hash = mixHash(hash, cur.rect.w);
    hash = mixHash(hash, cur.rect.h);
    hash = mixHash(hash, hashString(cur.vnode.kind));
    for (let i = cur.children.length - 1; i >= 0; i--) {
      const child = cur.children[i];
      if (child !== undefined) stack.push(child);
    }
  }

  return hash >>> 0;
}

function wheelEvent(timeMs: number, wheelY: number): ZrevEvent {
  return {
    kind: "mouse",
    timeMs,
    x: 0,
    y: 0,
    mouseKind: 5,
    mods: 0,
    buttons: 0,
    wheelX: 0,
    wheelY,
  };
}

function median(values: readonly number[]): number {
  assert.equal(values.length > 0, true, "median requires at least one sample");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (sorted.length % 2 === 0 && left !== undefined && right !== undefined) {
    return (left + right) / 2;
  }
  return right ?? 0;
}

function measureMedianMs(run: () => void): number {
  for (let i = 0; i < WARMUP_RUNS; i++) {
    run();
  }
  const samples: number[] = [];
  for (let i = 0; i < MEASURED_RUNS; i++) {
    const start = nowMs();
    run();
    samples.push(nowMs() - start);
  }
  return median(samples);
}

function expectLayoutOk(result: ReturnType<typeof layout>, context: string): LayoutTree {
  if (!result.ok) {
    throw new Error(`${context}: ${result.fatal.code}: ${result.fatal.detail}`);
  }
  return result.value;
}

function submitTreeAndCountOps(vnode: VNode): number {
  const builder = new CountingBuilder();
  const renderer = new WidgetRenderer<void>({
    backend: createNoopBackend(),
    builder,
    requestRender: () => {},
  });
  const submit = renderer.submitFrame(
    () => vnode,
    undefined,
    { cols: 120, rows: 60 },
    defaultTheme,
    noRenderHooks(),
  );
  if (!submit.ok) {
    assert.fail(`submitFrame failed: ${submit.code}: ${submit.detail}`);
  }
  const opCount = builder.getLastBuiltOpCount();
  assert.equal(opCount > 0, true, "expected drawlist ops to be emitted");
  return opCount;
}

function runVirtualListWheelSequence(seed: number, steps: number): VirtualScrollSummary {
  return withSeed(seed, (rng) => {
    const viewportHeight = 31;
    const overscan = 4;
    const totalHeight = VLIST_ITEM_COUNT;
    let scrollTop = 0;
    let rangeHash = 2166136261 >>> 0;
    const checkpoints: number[] = [];

    for (let i = 0; i < steps; i++) {
      const roll = nextInt(rng, 0, 99);
      const wheelY =
        roll < 80 ? nextInt(rng, -3, 3) : roll < 95 ? nextInt(rng, -8, 8) : nextInt(rng, -20, 20);

      const routed = routeVirtualListWheel(wheelEvent(i, wheelY), {
        scrollTop,
        totalHeight,
        viewportHeight,
      });
      if (routed.nextScrollTop !== undefined) {
        scrollTop = routed.nextScrollTop;
      }

      const range = computeVisibleRange(VLIST_ITEMS, 1, scrollTop, viewportHeight, overscan);
      const visibleCount = range.endIndex - range.startIndex;

      assert.equal(range.startIndex >= 0, true, `seed=${String(seed)} step=${String(i)} start>=0`);
      assert.equal(
        range.endIndex <= VLIST_ITEM_COUNT,
        true,
        `seed=${String(seed)} step=${String(i)} end<=count`,
      );
      assert.equal(
        range.endIndex >= range.startIndex,
        true,
        `seed=${String(seed)} step=${String(i)} non-negative window`,
      );
      assert.equal(
        visibleCount <= viewportHeight + overscan * 2 + 1,
        true,
        `seed=${String(seed)} step=${String(i)} oversized virtual window`,
      );

      rangeHash = mixHash(rangeHash, range.startIndex);
      rangeHash = mixHash(rangeHash, range.endIndex);
      rangeHash = mixHash(rangeHash, scrollTop);
      if (i % 128 === 0) checkpoints.push(scrollTop);
    }

    return Object.freeze({
      finalScrollTop: scrollTop,
      rangeHash,
      checkpoints: Object.freeze(checkpoints),
    });
  });
}

function buildDeepDataChain(depth: number): DeepDataNode {
  let node: DeepDataNode = Object.freeze({ id: `node-${String(depth)}` });
  for (let i = depth - 1; i >= 0; i--) {
    node = Object.freeze({
      id: `node-${String(i)}`,
      children: Object.freeze([node]),
    });
  }
  return node;
}

function buildDeepExpandedKeys(depth: number): readonly string[] {
  const expanded: string[] = [];
  for (let i = 0; i <= depth; i++) {
    expanded.push(`node-${String(i)}`);
  }
  return Object.freeze(expanded);
}

describe("stress large trees", () => {
  test("10k node layout median stays under adaptive CI-stable budget", () => {
    const baselineTree = buildWideTextTree(999); // 1k nodes including root
    const targetTree = buildWideTextTree(9999); // 10k nodes including root
    assert.equal(countVNodeNodes(baselineTree), 1000);
    assert.equal(countVNodeNodes(targetTree), 10000);

    const baselineMedianMs = measureMedianMs(() => {
      const result = layout(baselineTree, 0, 0, 120, 12000, "column");
      const tree = expectLayoutOk(result, "baseline layout failed");
      void layoutChecksum(tree);
    });

    const targetMedianMs = measureMedianMs(() => {
      const result = layout(targetTree, 0, 0, 120, 12000, "column");
      const tree = expectLayoutOk(result, "10k layout failed");
      void layoutChecksum(tree);
    });

    const adaptiveBudgetMs = Math.max(
      ABS_LAYOUT_10K_BUDGET_MS,
      baselineMedianMs * LAYOUT_RATIO_BUDGET,
    );

    assert.equal(
      targetMedianMs <= adaptiveBudgetMs,
      true,
      `10k layout median=${targetMedianMs.toFixed(2)}ms baseline=${baselineMedianMs.toFixed(
        2,
      )}ms budget=${adaptiveBudgetMs.toFixed(2)}ms`,
    );
  });

  test("10k node submitFrame median stays under adaptive CI-stable budget", () => {
    const baselineTree = buildWideTextTree(999); // 1k nodes including root
    const targetTree = buildWideTextTree(9999); // 10k nodes including root

    const baselineMedianMs = measureMedianMs(() => {
      void submitTreeAndCountOps(baselineTree);
    });

    const targetMedianMs = measureMedianMs(() => {
      void submitTreeAndCountOps(targetTree);
    });

    const adaptiveBudgetMs = Math.max(
      ABS_RENDER_10K_BUDGET_MS,
      baselineMedianMs * RENDER_RATIO_BUDGET,
    );

    assert.equal(
      targetMedianMs <= adaptiveBudgetMs,
      true,
      `10k submitFrame median=${targetMedianMs.toFixed(2)}ms baseline=${baselineMedianMs.toFixed(
        2,
      )}ms budget=${adaptiveBudgetMs.toFixed(2)}ms`,
    );
  });

  test("100k virtual list wheel sequence remains deterministic and bounded", () => {
    const seed = 0x5eeda11;
    const a = runVirtualListWheelSequence(seed, 1400);
    const b = runVirtualListWheelSequence(seed, 1400);

    assert.deepEqual(b, a, `seed=${String(seed)} wheel sequence should replay identically`);
    assert.equal(a.finalScrollTop >= 0, true);
    assert.equal(a.finalScrollTop <= VLIST_ITEM_COUNT - 31, true);
  });

  test("100k virtual list clamps extreme scroll inputs deterministically", () => {
    const seed = 0xa11ce5;
    withSeed(seed, (rng) => {
      const viewportHeight = 37;
      const overscan = 3;
      const totalHeight = VLIST_ITEM_COUNT;

      for (let i = 0; i < 700; i++) {
        const selector = nextInt(rng, 0, 5);
        const candidate =
          selector === 0
            ? nextInt(rng, -1_000_000, 1_000_000)
            : selector === 1
              ? nextInt(rng, -5000, 5000)
              : selector === 2
                ? nextInt(rng, 0, totalHeight + 5000)
                : selector === 3
                  ? (nextInt(rng, 0, 1) === 0 ? -1 : 1) * 1_000_000_000
                  : selector === 4
                    ? Number.MAX_SAFE_INTEGER
                    : Number.MIN_SAFE_INTEGER;

        const clamped = clampScrollTop(candidate, totalHeight, viewportHeight);
        const rangeFromCandidate = computeVisibleRange(
          VLIST_ITEMS,
          1,
          candidate,
          viewportHeight,
          overscan,
        );
        const rangeFromClamped = computeVisibleRange(
          VLIST_ITEMS,
          1,
          clamped,
          viewportHeight,
          overscan,
        );

        assert.equal(
          rangeFromCandidate.startIndex,
          rangeFromClamped.startIndex,
          `seed=${String(seed)} step=${String(i)} start mismatch`,
        );
        assert.equal(
          rangeFromCandidate.endIndex,
          rangeFromClamped.endIndex,
          `seed=${String(seed)} step=${String(i)} end mismatch`,
        );
      }
    });
  });

  test("deep tree depth 1000 flatten traversal completes without stack overflow", () => {
    const depth = 1000;
    const deepData = buildDeepDataChain(depth);
    const expanded = buildDeepExpandedKeys(depth);

    let flatLength = -1;
    try {
      const flat = flattenTree(
        deepData,
        (n) => n.id,
        (n) => n.children,
        (n) => (n.children?.length ?? 0) > 0,
        expanded,
      );
      flatLength = flat.length;
      assert.equal(flat[depth]?.depth, depth);
    } catch (error) {
      if (error instanceof RangeError) {
        assert.fail(`flattenTree stack overflow at depth ${String(depth)}: ${error.message}`);
      }
      throw error;
    }
    assert.equal(flatLength, depth + 1);
  });

  test("10k layout checksum is stable across repeated runs", () => {
    const tree10k = buildWideTextTree(9999);
    const checksums: number[] = [];

    for (let i = 0; i < 3; i++) {
      const result = layout(tree10k, 0, 0, 120, 12000, "column");
      const tree = expectLayoutOk(result, `layout failed on iteration ${String(i)}`);
      checksums.push(layoutChecksum(tree));
    }

    assert.equal(
      new Set(checksums).size,
      1,
      `checksums should match exactly: ${checksums.join(", ")}`,
    );
  });
});
