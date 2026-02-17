import { assert, describe, test } from "@rezi-ui/testkit";
import { updateLayoutStabilitySignatures } from "../../app/widgetRenderer/submitFramePipeline.js";
import type { VNode } from "../../index.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";

function textNode(text: string, props: Record<string, unknown> = {}): VNode {
  return { kind: "text", text, props } as unknown as VNode;
}

function buttonNode(label: string, props: Record<string, unknown> = {}): VNode {
  return { kind: "button", props: { label, ...props } } as unknown as VNode;
}

function rowNode(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "row",
    props,
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function boxNode(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "box",
    props,
    children: Object.freeze([...children]),
  } as unknown as VNode;
}

function runtimeNode(
  instanceId: InstanceId,
  vnode: VNode,
  children: readonly RuntimeInstance[] = [],
): RuntimeInstance {
  return {
    instanceId,
    vnode,
    children: Object.freeze([...children]),
  };
}

function runSignatures(root: RuntimeInstance, prev: Map<InstanceId, number>): boolean {
  const next = new Map<InstanceId, number>();
  const stack: RuntimeInstance[] = [];
  return updateLayoutStabilitySignatures(root, prev, next, stack);
}

describe("layout stability signatures", () => {
  test("second pass on unchanged tree reports no change", () => {
    const prev = new Map<InstanceId, number>();
    const root = runtimeNode(1, textNode("stable"));

    assert.equal(runSignatures(root, prev), true);
    assert.equal(runSignatures(root, prev), false);
  });

  test("row layout-relevant prop change is included", () => {
    const prev = new Map<InstanceId, number>();
    const child = runtimeNode(2, textNode("child"));
    const base = runtimeNode(1, rowNode([child.vnode], { gap: 1 }), [child]);
    const changed = runtimeNode(1, rowNode([child.vnode], { gap: 2 }), [child]);

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(changed, prev), true);
  });

  test("row style-only prop change is excluded", () => {
    const prev = new Map<InstanceId, number>();
    const child = runtimeNode(2, textNode("child"));
    const base = runtimeNode(1, rowNode([child.vnode], { gap: 1, style: { fg: "red" } }), [child]);
    const styleOnly = runtimeNode(1, rowNode([child.vnode], { gap: 1, style: { fg: "blue" } }), [
      child,
    ]);

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(styleOnly, prev), false);
  });

  test("box layout-relevant prop change is included", () => {
    const prev = new Map<InstanceId, number>();
    const child = runtimeNode(2, textNode("child"));
    const base = runtimeNode(1, boxNode([child.vnode], { border: "single", pad: 1 }), [child]);
    const changed = runtimeNode(1, boxNode([child.vnode], { border: "single", pad: 2 }), [child]);

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(changed, prev), true);
  });

  test("box style-only prop change is excluded", () => {
    const prev = new Map<InstanceId, number>();
    const child = runtimeNode(2, textNode("child"));
    const base = runtimeNode(
      1,
      boxNode([child.vnode], { border: "single", pad: 1, style: { fg: "red" } }),
      [child],
    );
    const styleOnly = runtimeNode(
      1,
      boxNode([child.vnode], { border: "single", pad: 1, style: { fg: "green" } }),
      [child],
    );

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(styleOnly, prev), false);
  });

  test("text content change is included", () => {
    const prev = new Map<InstanceId, number>();
    const base = runtimeNode(1, textNode("a"));
    const changed = runtimeNode(1, textNode("aaaa"));

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(changed, prev), true);
  });

  test("text style-only change is excluded", () => {
    const prev = new Map<InstanceId, number>();
    const base = runtimeNode(1, textNode("abc", { style: { fg: "red" } }));
    const styleOnly = runtimeNode(1, textNode("abc", { style: { fg: "blue" } }));

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(styleOnly, prev), false);
  });

  test("button label change is included", () => {
    const prev = new Map<InstanceId, number>();
    const base = runtimeNode(1, buttonNode("Go", { id: "btn-a", px: 1 }));
    const changed = runtimeNode(1, buttonNode("Launch", { id: "btn-a", px: 1 }));

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(changed, prev), true);
  });

  test("button id-only change is excluded", () => {
    const prev = new Map<InstanceId, number>();
    const base = runtimeNode(1, buttonNode("Go", { id: "btn-a", px: 2 }));
    const idOnly = runtimeNode(1, buttonNode("Go", { id: "btn-b", px: 2 }));

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(idOnly, prev), false);
  });

  test("adding a child is included", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(1, rowNode([childA.vnode], { gap: 0 }), [childA]);
    const withAddedChild = runtimeNode(1, rowNode([childA.vnode, childB.vnode], { gap: 0 }), [
      childA,
      childB,
    ]);

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(withAddedChild, prev), true);
  });

  test("removing a child is included", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(1, rowNode([childA.vnode, childB.vnode], { gap: 0 }), [
      childA,
      childB,
    ]);
    const withRemovedChild = runtimeNode(1, rowNode([childA.vnode], { gap: 0 }), [childA]);

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(withRemovedChild, prev), true);
  });

  test("reordering children is included", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(1, rowNode([childA.vnode, childB.vnode], { gap: 0 }), [
      childA,
      childB,
    ]);
    const reordered = runtimeNode(1, rowNode([childB.vnode, childA.vnode], { gap: 0 }), [
      childB,
      childA,
    ]);

    assert.equal(runSignatures(base, prev), true);
    assert.equal(runSignatures(reordered, prev), true);
  });

  test("unsupported kinds conservatively force relayout and clear maps", () => {
    const prev = new Map<InstanceId, number>();
    const supported = runtimeNode(1, textNode("ok"));
    assert.equal(runSignatures(supported, prev), true);
    assert.ok(prev.size > 0);

    const unsupported = runtimeNode(1, {
      kind: "select",
      props: { id: "s", value: "", options: Object.freeze([]) },
    } as unknown as VNode);

    assert.equal(runSignatures(unsupported, prev), true);
    assert.equal(prev.size, 0);
  });
});
