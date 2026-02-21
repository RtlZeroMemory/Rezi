/**
 * packages/core/src/layout/__tests__/layout.perf.test.ts — Layout performance benchmarks.
 *
 * These tests verify that layout operations complete within acceptable time budgets
 * to maintain 60fps (16ms frame budget) rendering performance.
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { layout } from "../layout.js";

/* ========== Tree Builders ========== */

/**
 * Build a deep column tree with n text widgets.
 * Structure: column -> column -> column -> ... -> text (depth = n)
 */
function buildDeepTree(depth: number): VNode {
  if (depth <= 1) {
    return { kind: "text", text: "leaf", props: {} };
  }
  return {
    kind: "column",
    props: {},
    children: Object.freeze([buildDeepTree(depth - 1)]),
  };
}

/**
 * Build a wide tree with n children at the root level.
 * Structure: column -> [text, text, text, ...] (width = n)
 */
function buildWideTree(width: number): VNode {
  const children: VNode[] = [];
  for (let i = 0; i < width; i++) {
    children.push({ kind: "text", text: `item-${i}`, props: {} });
  }
  return {
    kind: "column",
    props: {},
    children: Object.freeze(children),
  };
}

/**
 * Build a balanced tree with specified depth and branching factor.
 * Total nodes = branching^depth approximately.
 */
function buildBalancedTree(depth: number, branching: number): VNode {
  if (depth <= 1) {
    return { kind: "text", text: "leaf", props: {} };
  }
  const children: VNode[] = [];
  for (let i = 0; i < branching; i++) {
    children.push(buildBalancedTree(depth - 1, branching));
  }
  return {
    kind: "column",
    props: {},
    children: Object.freeze(children),
  };
}

/**
 * Build a realistic UI tree with mixed widget types.
 * Simulates a typical app with rows, columns, text, buttons, and inputs.
 */
function buildRealisticTree(itemCount: number): VNode {
  const rows: VNode[] = [];
  for (let i = 0; i < itemCount; i++) {
    rows.push({
      kind: "row",
      props: { gap: 1 },
      children: Object.freeze([
        { kind: "text", text: `Row ${i}`, props: {} },
        { kind: "button", props: { id: `btn-${i}`, label: "Click" } },
        { kind: "input", props: { id: `input-${i}`, value: "" } },
      ]),
    });
  }
  return {
    kind: "column",
    props: { pad: 1, gap: 1 },
    children: Object.freeze(rows),
  };
}

/* ========== Performance Tests ========== */

describe("layout performance", () => {
  const VIEWPORT = { x: 0, y: 0, w: 120, h: 40 };
  const IS_WINDOWS = process.platform === "win32";
  const IS_MACOS = process.platform === "darwin";
  const env = process.env as NodeJS.ProcessEnv & { CI?: string };
  const IS_CI = env.CI === "true";
  const FRAME_BUDGET_MS = IS_WINDOWS ? 120 : 16; // Keep 16ms target off Windows.
  const REALISTIC_FRAME_BUDGET_MS = IS_WINDOWS ? 120 : IS_CI ? 20 : 16; // CI runner variance.
  const WARMUP_RUNS = 2;

  test("layout 100 deep widgets under 16ms", () => {
    // Note: Deep trees are limited by JS call stack. 100 is realistic for nested UI.
    const tree = buildDeepTree(100);
    const iterations = 5;
    let totalMs = 0;

    for (let i = 0; i < WARMUP_RUNS; i++) {
      layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
    }

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
      const elapsed = performance.now() - start;
      totalMs += elapsed;
      assert.ok(result.ok, "Layout should succeed");
    }

    const avgMs = totalMs / iterations;
    assert.ok(
      avgMs < FRAME_BUDGET_MS,
      `Deep tree layout averaged ${avgMs.toFixed(2)}ms, expected <${FRAME_BUDGET_MS}ms`,
    );
  });

  test("layout 1000 wide widgets under 16ms", () => {
    const tree = buildWideTree(1000);
    const iterations = 5;
    let totalMs = 0;

    for (let i = 0; i < WARMUP_RUNS; i++) {
      layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
    }

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
      const elapsed = performance.now() - start;
      totalMs += elapsed;
      assert.ok(result.ok, "Layout should succeed");
    }

    const avgMs = totalMs / iterations;
    assert.ok(
      avgMs < FRAME_BUDGET_MS,
      `Wide tree layout averaged ${avgMs.toFixed(2)}ms, expected <${FRAME_BUDGET_MS}ms`,
    );
  });

  test("layout balanced tree (1000+ nodes) under 16ms", () => {
    // 4^5 = 1024 nodes
    const tree = buildBalancedTree(5, 4);
    const iterations = 5;
    let totalMs = 0;

    for (let i = 0; i < WARMUP_RUNS; i++) {
      layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
    }

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
      const elapsed = performance.now() - start;
      totalMs += elapsed;
      assert.ok(result.ok, "Layout should succeed");
    }

    const avgMs = totalMs / iterations;
    assert.ok(
      avgMs < FRAME_BUDGET_MS,
      `Balanced tree layout averaged ${avgMs.toFixed(2)}ms, expected <${FRAME_BUDGET_MS}ms`,
    );
  });

  test("layout realistic UI (300 rows with mixed widgets) under 16ms", () => {
    // 300 rows * 3 widgets per row = 900 leaf widgets + 300 row containers + 1 root = 1201 nodes
    const tree = buildRealisticTree(300);
    const iterations = 5;
    let totalMs = 0;

    for (let i = 0; i < WARMUP_RUNS; i++) {
      layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
    }

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const result = layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
      const elapsed = performance.now() - start;
      totalMs += elapsed;
      assert.ok(result.ok, "Layout should succeed");
    }

    const avgMs = totalMs / iterations;
    assert.ok(
      avgMs < REALISTIC_FRAME_BUDGET_MS,
      `Realistic UI layout averaged ${avgMs.toFixed(2)}ms, expected <${REALISTIC_FRAME_BUDGET_MS}ms`,
    );
  });

  test("repeated layout of same tree is consistent", () => {
    const tree = buildWideTree(500);
    const results: number[] = [];

    for (let i = 0; i < WARMUP_RUNS; i++) {
      layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
    }

    for (let i = 0; i < 10; i++) {
      const start = performance.now();
      layout(tree, VIEWPORT.x, VIEWPORT.y, VIEWPORT.w, VIEWPORT.h, "column");
      results.push(performance.now() - start);
    }

    // Check variance is reasonable (no random spikes)
    const avg = results.reduce((a, b) => a + b, 0) / results.length;
    const maxDeviation = Math.max(...results.map((r) => Math.abs(r - avg)));
    const deviationRatio = maxDeviation / avg;
    const maxDeviationRatio = IS_WINDOWS ? 4.0 : IS_CI && IS_MACOS ? 6.0 : 1.0;
    const maxDeviationMs = IS_WINDOWS ? 20 : IS_CI && IS_MACOS ? 15 : 5;

    // CI macOS runners can show large one-off scheduler jitter under load.
    assert.ok(
      deviationRatio < maxDeviationRatio || maxDeviation < maxDeviationMs,
      `Layout time variance too high: avg=${avg.toFixed(2)}ms, maxDev=${maxDeviation.toFixed(2)}ms`,
    );
  });
});
