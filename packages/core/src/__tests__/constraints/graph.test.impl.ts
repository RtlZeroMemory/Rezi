import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { expr } from "../../constraints/expr.js";
import { buildConstraintGraph } from "../../constraints/graph.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { VNode } from "../../widgets/types.js";

function runtimeNode(
  instanceId: InstanceId,
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

describe("constraint graph", () => {
  test("builds linear dependency chain and topological order", () => {
    const c = boxWithId(3, "c", { width: expr("10") });
    const b = boxWithId(2, "b", { width: expr("#c.w + 1") });
    const a = boxWithId(1, "a", { width: expr("#b.w + 1") });
    const root = runtimeNode(100, {}, [a, b, c]);

    const built = buildConstraintGraph(root);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const labels = built.value.order.map(
      (node) => `${node.widgetId ?? node.instanceId}:${node.prop}`,
    );
    assert.deepEqual(labels, ["c:width", "b:width", "a:width"]);
  });

  test("handles diamond dependencies", () => {
    const d = boxWithId(4, "d", { width: expr("4") });
    const b = boxWithId(2, "b", { width: expr("#d.w + 1") });
    const c = boxWithId(3, "c", { width: expr("#d.w + 2") });
    const a = boxWithId(1, "a", { width: expr("#b.w + #c.w") });
    const root = runtimeNode(200, {}, [a, b, c, d]);

    const built = buildConstraintGraph(root);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const order = built.value.order.map((node) => node.widgetId);
    const idx = new Map<string, number>();
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      if (id !== null && id !== undefined) idx.set(id, i);
    }
    assert.ok((idx.get("d") ?? 99) < (idx.get("b") ?? -1));
    assert.ok((idx.get("d") ?? 99) < (idx.get("c") ?? -1));
    assert.ok((idx.get("b") ?? 99) < (idx.get("a") ?? -1));
    assert.ok((idx.get("c") ?? 99) < (idx.get("a") ?? -1));
  });

  test("detects direct cycles with path reporting", () => {
    const a = boxWithId(1, "a", { width: expr("#b.w") });
    const b = boxWithId(2, "b", { width: expr("#a.w") });
    const root = runtimeNode(300, {}, [a, b]);

    const built = buildConstraintGraph(root);
    assert.equal(built.ok, false);
    if (built.ok) return;
    if (built.fatal.code !== "ZRUI_CIRCULAR_CONSTRAINT") {
      throw new Error("expected circular constraint error");
    }
    assert.equal(built.fatal.code, "ZRUI_CIRCULAR_CONSTRAINT");
    assert.ok(built.fatal.cycle.length >= 2);
    assert.equal(built.fatal.cycle[0], "#a.width");
    assert.equal(built.fatal.cycle[built.fatal.cycle.length - 1], "#a.width");
  });

  test("detects self-cycle", () => {
    const a = boxWithId(1, "a", { width: expr("#a.w + 1") });
    const root = runtimeNode(301, {}, [a]);
    const built = buildConstraintGraph(root);
    assert.equal(built.ok, false);
    if (built.ok) return;
    if (built.fatal.code !== "ZRUI_CIRCULAR_CONSTRAINT") {
      throw new Error("expected circular constraint error");
    }
    assert.equal(built.fatal.code, "ZRUI_CIRCULAR_CONSTRAINT");
    assert.equal(built.fatal.cycle[0], "#a.width");
  });

  test("returns empty graph for trees without constraint expressions", () => {
    const root = runtimeNode(400, {}, [
      boxWithId(1, "a", { width: 10 }),
      boxWithId(2, "b", { height: 5 }),
    ]);
    const built = buildConstraintGraph(root);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    assert.equal(built.value.nodes.length, 0);
    assert.equal(built.value.order.length, 0);
    assert.equal(built.value.requiresCommitRelayout, false);
    assert.equal(built.value.intrinsicRuntimeInstanceIds.size, 0);
  });

  test("creates aggregation dependencies for shared IDs", () => {
    const items: RuntimeInstance[] = [];
    for (let i = 0; i < 5; i++) {
      items.push(boxWithId(10 + i, "item", { minWidth: expr(String(10 + i)) }));
    }
    const panel = boxWithId(99, "panel", { width: expr("max_sibling(#item.min_w)") });
    const root = runtimeNode(500, {}, [...items, panel]);

    const built = buildConstraintGraph(root);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const panelNode = built.value.nodes.find(
      (node) => node.widgetId === "panel" && node.prop === "width",
    );
    assert.ok(panelNode !== undefined);
    if (panelNode === undefined) return;

    const deps = built.value.edges.get(panelNode.key) ?? [];
    assert.equal(deps.length, 5);
    const targetKeys = built.value.nodes
      .filter((node) => node.widgetId === "item" && node.prop === "minWidth")
      .map((node) => node.key)
      .sort();
    assert.deepEqual([...deps].sort(), targetKeys);
  });

  test("adds display dependency for sibling metric lookups", () => {
    const sidebar = boxWithId(1, "sidebar", {
      width: expr("20"),
      display: expr("0"),
    });
    const editor = boxWithId(2, "editor", {
      width: expr("parent.w - #sidebar.w"),
    });
    const built = buildConstraintGraph(runtimeNode(700, {}, [editor, sidebar]));
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const order = built.value.order.map(
      (node) => `${node.widgetId ?? node.instanceId}:${node.prop}`,
    );
    const sidebarDisplayIndex = order.indexOf("sidebar:display");
    const editorWidthIndex = order.indexOf("editor:width");
    assert.ok(sidebarDisplayIndex >= 0);
    assert.ok(editorWidthIndex >= 0);
    assert.ok(sidebarDisplayIndex < editorWidthIndex);
    assert.equal(built.value.requiresCommitRelayout, true);
  });

  test("marks commit relayout requirements only for layout-sensitive graphs", () => {
    const safe = buildConstraintGraph(
      runtimeNode(710, {}, [
        boxWithId(1, "left", { width: expr("20") }),
        boxWithId(2, "right", { width: expr("parent.w - #left.w") }),
      ]),
    );
    assert.equal(safe.ok, true);
    if (safe.ok) {
      assert.equal(safe.value.requiresCommitRelayout, false);
      assert.equal(safe.value.intrinsicRuntimeInstanceIds.size, 0);
    }

    const intrinsic = buildConstraintGraph(
      runtimeNode(711, {}, [boxWithId(1, "a", { width: expr("intrinsic.w + 2") })]),
    );
    assert.equal(intrinsic.ok, true);
    if (intrinsic.ok) {
      assert.equal(intrinsic.value.requiresCommitRelayout, true);
      assert.equal(intrinsic.value.intrinsicRuntimeInstanceIds.has(1), true);
    }

    const unconstrainedRef = buildConstraintGraph(
      runtimeNode(712, {}, [
        boxWithId(1, "source", { width: 10 }),
        boxWithId(2, "target", { width: expr("#source.w + 1") }),
      ]),
    );
    assert.equal(unconstrainedRef.ok, true);
    if (unconstrainedRef.ok) {
      assert.equal(unconstrainedRef.value.requiresCommitRelayout, true);
      assert.equal(unconstrainedRef.value.intrinsicRuntimeInstanceIds.has(1), true);
    }
  });

  test("reports invalid unknown and ambiguous direct references", () => {
    const missing = buildConstraintGraph(
      runtimeNode(600, {}, [boxWithId(1, "a", { width: expr("#missing.w") })]),
    );
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.equal(missing.fatal.code, "ZRUI_INVALID_CONSTRAINT");

    const dupA = boxWithId(1, "dup", { width: expr("10") });
    const dupB = boxWithId(2, "dup", { width: expr("12") });
    const consumer = boxWithId(3, "consumer", { width: expr("#dup.w + 1") });
    const ambiguous = buildConstraintGraph(runtimeNode(601, {}, [dupA, dupB, consumer]));
    assert.equal(ambiguous.ok, false);
    if (!ambiguous.ok) assert.equal(ambiguous.fatal.code, "ZRUI_INVALID_CONSTRAINT");
  });

  test("produces stable fingerprint and deterministic node ordering", () => {
    const buildTree = (leafExpr: string): RuntimeInstance =>
      runtimeNode(700, {}, [
        boxWithId(1, "a", {
          width: expr("1"),
          height: expr("2"),
          minWidth: expr("3"),
          maxWidth: expr("4"),
          minHeight: expr("5"),
          maxHeight: expr("6"),
          flexBasis: expr(leafExpr),
        }),
      ]);

    const graphA = buildConstraintGraph(buildTree("7"));
    const graphB = buildConstraintGraph(buildTree("7"));
    const graphC = buildConstraintGraph(buildTree("8"));

    assert.equal(graphA.ok, true);
    assert.equal(graphB.ok, true);
    assert.equal(graphC.ok, true);
    if (!graphA.ok || !graphB.ok || !graphC.ok) return;

    assert.equal(graphA.value.fingerprint, graphB.value.fingerprint);
    assert.notEqual(graphA.value.fingerprint, graphC.value.fingerprint);

    const props = graphA.value.nodes
      .filter((node) => node.instanceId === 1)
      .map((node) => node.prop);
    assert.deepEqual(props, [
      "width",
      "height",
      "minWidth",
      "maxWidth",
      "minHeight",
      "maxHeight",
      "flexBasis",
    ]);
  });
});
