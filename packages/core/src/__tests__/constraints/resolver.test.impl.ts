import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { expr } from "../../constraints/expr.js";
import { buildConstraintGraph } from "../../constraints/graph.js";
import { parse } from "../../constraints/parser.js";
import {
  ConstraintResolutionCache,
  type EvaluationContext,
  type RefValues,
  evaluate,
  resolveConstraints,
} from "../../constraints/resolver.js";
import type { ExprNode } from "../../constraints/types.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { VNode } from "../../widgets/types.js";

function refValues(w: number, h: number, minW = w, minH = h): RefValues {
  return { w, h, min_w: minW, min_h: minH };
}

function runtimeNode(
  instanceId: number,
  props: Record<string, unknown> = {},
  children: readonly RuntimeInstance[] = [],
): RuntimeInstance {
  const vnode = {
    kind: "box",
    props,
    children: Object.freeze([]),
  } as unknown as VNode;
  return {
    instanceId,
    vnode,
    children: Object.freeze([...children]),
    dirty: false,
    selfDirty: false,
    renderPacketKey: 0,
    renderPacket: null,
  };
}

function boxWithId(
  instanceId: number,
  id: string,
  props: Record<string, unknown>,
  children: readonly RuntimeInstance[] = [],
): RuntimeInstance {
  return runtimeNode(instanceId, { id, ...props }, children);
}

function defaultContext(): EvaluationContext {
  return {
    viewport: refValues(120, 40),
    parent: refValues(80, 20),
    intrinsic: refValues(15, 5, 10, 3),
    resolveWidgetRef: () => 0,
    resolveAggregation: () => 0,
  };
}

describe("constraint resolver", () => {
  test("evaluates arithmetic, comparisons, and ternary deterministically", () => {
    assert.equal(evaluate(parse("1 + 2 * 3"), defaultContext()), 7);
    assert.equal(evaluate(parse("parent.w > 10"), defaultContext()), 1);
    assert.equal(
      evaluate(parse("viewport.w >= 100 ? parent.w * 0.3 : intrinsic.w"), defaultContext()),
      24,
    );
  });

  test("resolves viewport/parent/intrinsic/sibling references via graph order", () => {
    const sidebar = boxWithId(2, "sidebar", { width: expr("clamp(10, viewport.w * 0.2, 30)") });
    const content = boxWithId(3, "content", { width: expr("parent.w - #sidebar.w - intrinsic.w") });
    const root = runtimeNode(1, {}, [content, sidebar]);
    const built = buildConstraintGraph(root);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const resolved = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      intrinsicValues: new Map([[3, { w: 5, h: 2, min_w: 5, min_h: 2 }]]),
    });

    assert.equal(resolved.cacheHit, false);
    assert.equal(resolved.values.get(2)?.width, 24);
    assert.equal(resolved.values.get(3)?.width, 71);
  });

  test("evaluates steps() threshold pairs", () => {
    const node = boxWithId(10, "panel", {
      width: expr("steps(viewport.w, 80: 10, 120: 20, 160: 30)"),
    });
    const built = buildConstraintGraph(runtimeNode(9, {}, [node]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const at70 = resolveConstraints(built.value, {
      viewport: { w: 70, h: 40 },
      parent: { w: 100, h: 40 },
    });
    const at90 = resolveConstraints(built.value, {
      viewport: { w: 90, h: 40 },
      parent: { w: 100, h: 40 },
    });
    const at170 = resolveConstraints(built.value, {
      viewport: { w: 170, h: 40 },
      parent: { w: 100, h: 40 },
    });

    assert.equal(at70.values.get(10)?.width, 10);
    assert.equal(at90.values.get(10)?.width, 20);
    assert.equal(at170.values.get(10)?.width, 30);
  });

  test("treats display-hidden sibling metrics as zero", () => {
    const sidebar = boxWithId(41, "sidebar", {
      width: expr("20"),
      display: expr("0"),
    });
    const editor = boxWithId(42, "editor", {
      width: expr("parent.w - #sidebar.w"),
    });
    const built = buildConstraintGraph(runtimeNode(40, {}, [editor, sidebar]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const out = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 80, h: 40 },
    });

    assert.equal(out.values.get(41)?.display, 0);
    assert.equal(out.values.get(41)?.width, 20);
    assert.equal(out.values.get(42)?.width, 80);
  });

  test("computes max_sibling/sum_sibling aggregations", () => {
    const items = [boxWithId(11, "item", {}), boxWithId(12, "item", {}), boxWithId(13, "item", {})];
    const maxNode = boxWithId(21, "maxPanel", { width: expr("max_sibling(#item.min_w)") });
    const sumNode = boxWithId(22, "sumPanel", { width: expr("sum_sibling(#item.w)") });
    const root = runtimeNode(20, {}, [...items, maxNode, sumNode]);
    const built = buildConstraintGraph(root);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const baseValues = new Map<number, { width?: number; minWidth?: number }>([
      [11, { width: 4, minWidth: 5 }],
      [12, { width: 6, minWidth: 9 }],
      [13, { width: 8, minWidth: 7 }],
    ]);

    const out = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      baseValues,
    });

    assert.equal(out.values.get(21)?.width, 9);
    assert.equal(out.values.get(22)?.width, 18);
  });

  test("computes sum_sibling from same-frame constrained sibling values", () => {
    const itemA = boxWithId(51, "item", { width: expr("10") });
    const itemB = boxWithId(52, "item", { width: expr("20") });
    const sumNode = boxWithId(53, "sumPanel", { width: expr("sum_sibling(#item.w)") });
    const built = buildConstraintGraph(runtimeNode(50, {}, [itemA, itemB, sumNode]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const out = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
    });

    assert.equal(out.values.get(53)?.width, 30);
  });

  test("computes max_sibling from same-frame constrained sibling values", () => {
    const itemA = boxWithId(61, "item", { width: expr("12") });
    const itemB = boxWithId(62, "item", { width: expr("27") });
    const maxNode = boxWithId(63, "maxPanel", { width: expr("max_sibling(#item.w)") });
    const built = buildConstraintGraph(runtimeNode(60, {}, [itemA, itemB, maxNode]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const out = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
    });

    assert.equal(out.values.get(63)?.width, 27);
  });

  test("handles division-by-zero and non-finite values safely", () => {
    assert.equal(evaluate(parse("10 / 0"), defaultContext()), 0);

    const nanAst: ExprNode = { kind: "number", value: Number.NaN };
    const infAst: ExprNode = {
      kind: "binary",
      op: "*",
      left: { kind: "number", value: Number.POSITIVE_INFINITY },
      right: { kind: "number", value: 2 },
    };
    assert.equal(evaluate(nanAst, defaultContext()), 0);
    assert.equal(evaluate(infAst, defaultContext()), 0);
  });

  test("reuses cached resolution for identical inputs", () => {
    const node = boxWithId(31, "cacheNode", { width: expr("viewport.w + parent.w") });
    const built = buildConstraintGraph(runtimeNode(30, {}, [node]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const cache = new ConstraintResolutionCache();
    const first = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      cache,
    });
    const second = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      cache,
    });
    const third = resolveConstraints(built.value, {
      viewport: { w: 121, h: 40 },
      parent: { w: 100, h: 40 },
      cache,
    });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(second.values, first.values);
    assert.equal(third.cacheHit, false);
    assert.notEqual(third.values, second.values);
  });

  test("default cache key accounts for dynamic base/parent/intrinsic maps", () => {
    const node = boxWithId(71, "dynamicCacheNode", { width: expr("parent.w + intrinsic.w") });
    const built = buildConstraintGraph(runtimeNode(70, {}, [node]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const cache = new ConstraintResolutionCache();
    const first = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      parentValues: new Map([[71, { w: 80, h: 20, min_w: 80, min_h: 20 }]]),
      intrinsicValues: new Map([[71, { w: 1, h: 1, min_w: 1, min_h: 1 }]]),
      cache,
    });
    const second = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      parentValues: new Map([[71, { w: 80, h: 20, min_w: 80, min_h: 20 }]]),
      intrinsicValues: new Map([[71, { w: 9, h: 9, min_w: 9, min_h: 9 }]]),
      cache,
    });
    const secondAgain = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      parentValues: new Map([[71, { w: 80, h: 20, min_w: 80, min_h: 20 }]]),
      intrinsicValues: new Map([[71, { w: 9, h: 9, min_w: 9, min_h: 9 }]]),
      cache,
    });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, false);
    assert.equal(secondAgain.cacheHit, true);
    assert.equal(first.values.get(71)?.width, 81);
    assert.equal(second.values.get(71)?.width, 89);
  });

  test("supports explicit cacheKey for multi-key cache reuse", () => {
    const node = boxWithId(41, "cacheNode", { width: expr("viewport.w + parent.w + intrinsic.w") });
    const built = buildConstraintGraph(runtimeNode(40, {}, [node]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const cache = new ConstraintResolutionCache(4);
    const first = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      intrinsicValues: new Map([[41, { w: 1, h: 1, min_w: 1, min_h: 1 }]]),
      cache,
      cacheKey: "k1",
    });
    const second = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      intrinsicValues: new Map([[41, { w: 9, h: 9, min_w: 9, min_h: 9 }]]),
      cache,
      cacheKey: "k2",
    });
    const firstAgain = resolveConstraints(built.value, {
      viewport: { w: 120, h: 40 },
      parent: { w: 100, h: 40 },
      intrinsicValues: new Map([[41, { w: 1, h: 1, min_w: 1, min_h: 1 }]]),
      cache,
      cacheKey: "k1",
    });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, false);
    assert.equal(firstAgain.cacheHit, true);
    assert.equal(first.values.get(41)?.width, 221);
    assert.equal(second.values.get(41)?.width, 229);
    assert.equal(firstAgain.values.get(41)?.width, 221);
  });
});
