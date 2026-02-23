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

function columnNode(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "column",
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

function spacerNode(props: Record<string, unknown> = {}): VNode {
  return { kind: "spacer", props } as unknown as VNode;
}

function modalNode(content: VNode, props: Record<string, unknown> = {}): VNode {
  return {
    kind: "modal",
    props: { id: "overlay-modal", content, ...props },
  } as unknown as VNode;
}

function dropdownNode(props: Record<string, unknown> = {}): VNode {
  return {
    kind: "dropdown",
    props: {
      id: "overlay-dropdown",
      anchorId: "missing-anchor",
      items: Object.freeze([]),
      ...props,
    },
  } as unknown as VNode;
}

const NOOP_RESIZE = (): void => {};

function splitPaneNode(children: readonly VNode[], props: Record<string, unknown> = {}): VNode {
  return {
    kind: "splitPane",
    props: {
      id: "split-pane",
      direction: "horizontal",
      sizes: Object.freeze([50, 50]),
      onResize: NOOP_RESIZE,
      ...props,
    },
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
    dirty: false,
    selfDirty: false,
  };
}

function runSignatures(root: RuntimeInstance, prev: Map<InstanceId, number>): boolean {
  const next = new Map<InstanceId, number>();
  const stack: RuntimeInstance[] = [];
  return updateLayoutStabilitySignatures(root, prev, next, stack);
}

function expectSignatureChanged(base: RuntimeInstance, changed: RuntimeInstance): void {
  const prev = new Map<InstanceId, number>();
  assert.equal(runSignatures(base, prev), true);
  assert.equal(runSignatures(changed, prev), true);
}

function expectSignatureUnchanged(base: RuntimeInstance, changed: RuntimeInstance): void {
  const prev = new Map<InstanceId, number>();
  assert.equal(runSignatures(base, prev), true);
  assert.equal(runSignatures(changed, prev), false);
}

function sortedEntries(
  map: ReadonlyMap<InstanceId, number>,
): readonly (readonly [string, number])[] {
  return Object.freeze(
    [...map.entries()]
      .map(([instanceId, signature]) => [String(instanceId), signature] as const)
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}

describe("layout stability signatures", () => {
  const STACK_LAYOUT_PROP_CASES = Object.freeze([
    { name: "width", base: { width: 10 }, changed: { width: 11 } },
    { name: "height", base: { height: 4 }, changed: { height: 5 } },
    { name: "minWidth", base: { minWidth: 5 }, changed: { minWidth: 6 } },
    { name: "maxWidth", base: { maxWidth: 20 }, changed: { maxWidth: 21 } },
    { name: "minHeight", base: { minHeight: 2 }, changed: { minHeight: 3 } },
    { name: "maxHeight", base: { maxHeight: 8 }, changed: { maxHeight: 9 } },
    { name: "flex", base: { flex: 1 }, changed: { flex: 2 } },
    { name: "flexShrink", base: { flexShrink: 1 }, changed: { flexShrink: 2 } },
    { name: "flexBasis", base: { flexBasis: 6 }, changed: { flexBasis: 7 } },
    { name: "aspectRatio", base: { aspectRatio: 2 }, changed: { aspectRatio: 3 } },
    { name: "alignSelf", base: { alignSelf: "start" }, changed: { alignSelf: "end" } },
    { name: "position", base: { position: "static" }, changed: { position: "absolute" } },
    {
      name: "top (absolute)",
      base: { position: "absolute", top: 0 },
      changed: { position: "absolute", top: 1 },
    },
    {
      name: "right (absolute)",
      base: { position: "absolute", right: 0 },
      changed: { position: "absolute", right: 1 },
    },
    {
      name: "bottom (absolute)",
      base: { position: "absolute", bottom: 0 },
      changed: { position: "absolute", bottom: 1 },
    },
    {
      name: "left (absolute)",
      base: { position: "absolute", left: 0 },
      changed: { position: "absolute", left: 1 },
    },
    { name: "gridColumn", base: { gridColumn: 1 }, changed: { gridColumn: 2 } },
    { name: "gridRow", base: { gridRow: 1 }, changed: { gridRow: 2 } },
    { name: "colSpan", base: { colSpan: 1 }, changed: { colSpan: 2 } },
    { name: "rowSpan", base: { rowSpan: 1 }, changed: { rowSpan: 2 } },
    { name: "p", base: { p: 1 }, changed: { p: 2 } },
    { name: "px", base: { px: 1 }, changed: { px: 2 } },
    { name: "py", base: { py: 1 }, changed: { py: 2 } },
    { name: "pt", base: { pt: 1 }, changed: { pt: 2 } },
    { name: "pr", base: { pr: 1 }, changed: { pr: 2 } },
    { name: "pb", base: { pb: 1 }, changed: { pb: 2 } },
    { name: "pl", base: { pl: 1 }, changed: { pl: 2 } },
    { name: "m", base: { m: 1 }, changed: { m: 2 } },
    { name: "mx", base: { mx: 1 }, changed: { mx: 2 } },
    { name: "my", base: { my: 1 }, changed: { my: 2 } },
    { name: "mt (regression)", base: { mt: 1 }, changed: { mt: 2 } },
    { name: "mr (regression)", base: { mr: 1 }, changed: { mr: 2 } },
    { name: "mb (regression)", base: { mb: 1 }, changed: { mb: 2 } },
    { name: "ml (regression)", base: { ml: 1 }, changed: { ml: 2 } },
    { name: "gap", base: { gap: 1 }, changed: { gap: 2 } },
    { name: "align", base: { align: "start" }, changed: { align: "center" } },
    { name: "justify", base: { justify: "start" }, changed: { justify: "end" } },
  ] as const);

  const BOX_LAYOUT_PROP_CASES = Object.freeze([
    { name: "border", base: { border: "single" }, changed: { border: "double" } },
    { name: "gap", base: { gap: 1 }, changed: { gap: 2 } },
    { name: "flexShrink", base: { flexShrink: 1 }, changed: { flexShrink: 2 } },
    { name: "flexBasis", base: { flexBasis: 8 }, changed: { flexBasis: 9 } },
    { name: "alignSelf", base: { alignSelf: "start" }, changed: { alignSelf: "center" } },
    { name: "position", base: { position: "static" }, changed: { position: "absolute" } },
    {
      name: "top (absolute)",
      base: { position: "absolute", top: 0 },
      changed: { position: "absolute", top: 1 },
    },
    {
      name: "right (absolute)",
      base: { position: "absolute", right: 0 },
      changed: { position: "absolute", right: 1 },
    },
    {
      name: "bottom (absolute)",
      base: { position: "absolute", bottom: 0 },
      changed: { position: "absolute", bottom: 1 },
    },
    {
      name: "left (absolute)",
      base: { position: "absolute", left: 0 },
      changed: { position: "absolute", left: 1 },
    },
    { name: "gridColumn", base: { gridColumn: 1 }, changed: { gridColumn: 2 } },
    { name: "gridRow", base: { gridRow: 1 }, changed: { gridRow: 2 } },
    { name: "colSpan", base: { colSpan: 1 }, changed: { colSpan: 2 } },
    { name: "rowSpan", base: { rowSpan: 1 }, changed: { rowSpan: 2 } },
    {
      name: "borderTop (regression)",
      base: { borderTop: true },
      changed: { borderTop: false },
    },
    {
      name: "borderRight (regression)",
      base: { borderRight: true },
      changed: { borderRight: false },
    },
    {
      name: "borderBottom (regression)",
      base: { borderBottom: true },
      changed: { borderBottom: false },
    },
    {
      name: "borderLeft (regression)",
      base: { borderLeft: true },
      changed: { borderLeft: false },
    },
    { name: "mt (regression)", base: { mt: 1 }, changed: { mt: 2 } },
    { name: "mr (regression)", base: { mr: 1 }, changed: { mr: 2 } },
    { name: "mb (regression)", base: { mb: 1 }, changed: { mb: 2 } },
    { name: "ml (regression)", base: { ml: 1 }, changed: { ml: 2 } },
  ] as const);

  const STYLE_ONLY_CASES = Object.freeze([
    { name: "fg", base: { fg: "red" }, changed: { fg: "blue" } },
    { name: "bg", base: { bg: "black" }, changed: { bg: "white" } },
    { name: "bold", base: { bold: false }, changed: { bold: true } },
    { name: "dim", base: { dim: false }, changed: { dim: true } },
    { name: "italic", base: { italic: false }, changed: { italic: true } },
    { name: "underline", base: { underline: false }, changed: { underline: true } },
    { name: "inverse", base: { inverse: false }, changed: { inverse: true } },
  ] as const);

  test("second pass on unchanged tree reports no change", () => {
    const prev = new Map<InstanceId, number>();
    const root = runtimeNode(1, textNode("stable"));

    assert.equal(runSignatures(root, prev), true);
    assert.equal(runSignatures(root, prev), false);
  });

  test("determinism across separate computations", () => {
    const child = runtimeNode(2, textNode("child"));
    const root = runtimeNode(1, rowNode([child.vnode], { gap: 1, width: 12 }), [child]);

    const prevA = new Map<InstanceId, number>();
    const prevB = new Map<InstanceId, number>();
    assert.equal(runSignatures(root, prevA), true);
    assert.equal(runSignatures(root, prevB), true);
    assert.deepEqual(sortedEntries(prevA), sortedEntries(prevB));
    assert.equal(runSignatures(root, prevA), false);
    assert.equal(runSignatures(root, prevB), false);
  });

  test("empty tree is deterministic", () => {
    const prev = new Map<InstanceId, number>();
    const root = runtimeNode(1, rowNode([], { gap: 1 }));
    assert.equal(runSignatures(root, prev), true);
    assert.equal(runSignatures(root, prev), false);
  });

  test("single node tree is deterministic", () => {
    const prev = new Map<InstanceId, number>();
    const root = runtimeNode(1, buttonNode("Go", { px: 2 }));
    assert.equal(runSignatures(root, prev), true);
    assert.equal(runSignatures(root, prev), false);
  });

  for (const c of STACK_LAYOUT_PROP_CASES) {
    test(`row layout-relevant ${c.name} change is included`, () => {
      const child = runtimeNode(2, textNode("child"));
      const base = runtimeNode(1, rowNode([child.vnode], c.base), [child]);
      const changed = runtimeNode(1, rowNode([child.vnode], c.changed), [child]);
      expectSignatureChanged(base, changed);
    });
  }

  for (const c of BOX_LAYOUT_PROP_CASES) {
    test(`box layout-relevant ${c.name} change is included`, () => {
      const child = runtimeNode(2, textNode("child"));
      const base = runtimeNode(1, boxNode([child.vnode], c.base), [child]);
      const changed = runtimeNode(1, boxNode([child.vnode], c.changed), [child]);
      expectSignatureChanged(base, changed);
    });
  }

  for (const c of STYLE_ONLY_CASES) {
    test(`row style-only ${c.name} change is excluded`, () => {
      const child = runtimeNode(2, textNode("child"));
      const base = runtimeNode(1, rowNode([child.vnode], { gap: 1, style: c.base }), [child]);
      const styleOnly = runtimeNode(1, rowNode([child.vnode], { gap: 1, style: c.changed }), [
        child,
      ]);
      expectSignatureUnchanged(base, styleOnly);
    });
  }

  test("text content change is included", () => {
    const base = runtimeNode(1, textNode("a"));
    const changed = runtimeNode(1, textNode("aaaa"));
    expectSignatureChanged(base, changed);
  });

  test("text wrap prop change is included", () => {
    const base = runtimeNode(1, textNode("abcdefghij", { maxWidth: 4, wrap: false }));
    const changed = runtimeNode(1, textNode("abcdefghij", { maxWidth: 4, wrap: true }));
    expectSignatureChanged(base, changed);
  });

  test("wrapped text content change is included even when measured width is unchanged", () => {
    const base = runtimeNode(1, textNode("a\nb", { maxWidth: 4, wrap: true }));
    const changed = runtimeNode(1, textNode("ab", { maxWidth: 4, wrap: true }));
    expectSignatureChanged(base, changed);
  });

  test("text style-only change is excluded", () => {
    const base = runtimeNode(1, textNode("abc", { style: { fg: "red" } }));
    const styleOnly = runtimeNode(1, textNode("abc", { style: { fg: "blue" } }));
    expectSignatureUnchanged(base, styleOnly);
  });

  test("button label change is included", () => {
    const base = runtimeNode(1, buttonNode("Go", { id: "btn-a", px: 1 }));
    const changed = runtimeNode(1, buttonNode("Launch", { id: "btn-a", px: 1 }));
    expectSignatureChanged(base, changed);
  });

  test("button id-only change is excluded", () => {
    const base = runtimeNode(1, buttonNode("Go", { id: "btn-a", px: 2 }));
    const idOnly = runtimeNode(1, buttonNode("Go", { id: "btn-b", px: 2 }));
    expectSignatureUnchanged(base, idOnly);
  });

  test("adding a child is included", () => {
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(1, rowNode([childA.vnode], { gap: 0 }), [childA]);
    const withAddedChild = runtimeNode(1, rowNode([childA.vnode, childB.vnode], { gap: 0 }), [
      childA,
      childB,
    ]);
    expectSignatureChanged(base, withAddedChild);
  });

  test("removing a child is included", () => {
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(1, rowNode([childA.vnode, childB.vnode], { gap: 0 }), [
      childA,
      childB,
    ]);
    const withRemovedChild = runtimeNode(1, rowNode([childA.vnode], { gap: 0 }), [childA]);
    expectSignatureChanged(base, withRemovedChild);
  });

  test("reordering children is included", () => {
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
    expectSignatureChanged(base, reordered);
  });

  test("same child count but different child identity is included", () => {
    const childA = runtimeNode(2, textNode("same"));
    const childB = runtimeNode(3, textNode("same"));
    const base = runtimeNode(1, rowNode([childA.vnode], { gap: 0 }), [childA]);
    const differentIdentity = runtimeNode(1, rowNode([childB.vnode], { gap: 0 }), [childB]);
    expectSignatureChanged(base, differentIdentity);
  });

  test("changing child key (new child instance id) changes signature", () => {
    const keyedChildA = runtimeNode(2, textNode("stable", { key: "a" }));
    const keyedChildB = runtimeNode(3, textNode("stable", { key: "b" }));
    const base = runtimeNode(1, rowNode([keyedChildA.vnode], { gap: 1 }), [keyedChildA]);
    const keyChanged = runtimeNode(1, rowNode([keyedChildB.vnode], { gap: 1 }), [keyedChildB]);
    expectSignatureChanged(base, keyChanged);
  });

  test("mixed supported kinds remain stable when unchanged", () => {
    const button = runtimeNode(2, buttonNode("Go", { px: 2 }));
    const spacer = runtimeNode(3, spacerNode({ size: 1 }));
    const text = runtimeNode(5, textNode("inside"));
    const box = runtimeNode(4, boxNode([text.vnode], { border: "single", pad: 1 }), [text]);
    const root = runtimeNode(1, columnNode([button.vnode, spacer.vnode, box.vnode], { gap: 1 }), [
      button,
      spacer,
      box,
    ]);
    const prev = new Map<InstanceId, number>();
    assert.equal(runSignatures(root, prev), true);
    assert.equal(runSignatures(root, prev), false);
  });

  test("mixed supported kinds detect nested content changes", () => {
    const button = runtimeNode(2, buttonNode("Go", { px: 2 }));
    const textA = runtimeNode(5, textNode("inside"));
    const textB = runtimeNode(5, textNode("inside-changed"));
    const boxA = runtimeNode(4, boxNode([textA.vnode], { border: "single", pad: 1 }), [textA]);
    const boxB = runtimeNode(4, boxNode([textB.vnode], { border: "single", pad: 1 }), [textB]);
    const base = runtimeNode(1, columnNode([button.vnode, boxA.vnode], { gap: 1 }), [button, boxA]);
    const changed = runtimeNode(1, columnNode([button.vnode, boxB.vnode], { gap: 1 }), [
      button,
      boxB,
    ]);
    expectSignatureChanged(base, changed);
  });

  test("unsupported overlay kinds are excluded and conservatively force relayout", () => {
    const prev = new Map<InstanceId, number>();
    const supported = runtimeNode(1, textNode("ok"));
    assert.equal(runSignatures(supported, prev), true);
    assert.ok(prev.size > 0);

    const overlay = runtimeNode(1, dropdownNode());
    assert.equal(runSignatures(overlay, prev), true);
    assert.equal(prev.size, 0);
  });

  test("splitPane kind is covered and stable when unchanged", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));
    const split = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], { sizes: Object.freeze([50, 50]) }),
      [childA, childB],
    );
    assert.equal(runSignatures(split, prev), true);
    assert.ok(prev.size > 0);
    assert.equal(runSignatures(split, prev), false);
  });

  test("splitPane sizes array changes are covered by signatures", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], { sizes: Object.freeze([50, 50]) }),
      [childA, childB],
    );
    const changedSizes = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], { sizes: Object.freeze([60, 40]) }),
      [childA, childB],
    );

    assert.equal(runSignatures(base, prev), true);
    assert.ok(prev.size > 0);
    assert.equal(runSignatures(changedSizes, prev), true);
    assert.ok(prev.size > 0);
  });

  test("splitPane direction changes are covered by signatures", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], { direction: "horizontal" }),
      [childA, childB],
    );
    const changedDirection = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], { direction: "vertical" }),
      [childA, childB],
    );

    assert.equal(runSignatures(base, prev), true);
    assert.ok(prev.size > 0);
    assert.equal(runSignatures(changedDirection, prev), true);
    assert.ok(prev.size > 0);
  });

  test("splitPane collapsed state changes are covered when collapsible is enabled", () => {
    const prev = new Map<InstanceId, number>();
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));

    const base = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], {
        collapsible: true,
        collapsed: Object.freeze([]),
        minSizes: Object.freeze([0, 0]),
      }),
      [childA, childB],
    );
    const collapsedChanged = runtimeNode(
      1,
      splitPaneNode([childA.vnode, childB.vnode], {
        collapsible: true,
        collapsed: Object.freeze([0]),
        minSizes: Object.freeze([0, 0]),
      }),
      [childA, childB],
    );

    assert.equal(runSignatures(base, prev), true);
    assert.ok(prev.size > 0);
    assert.equal(runSignatures(collapsedChanged, prev), true);
    assert.ok(prev.size > 0);
  });

  test("unsupported child in otherwise supported tree forces relayout and clears maps", () => {
    const prev = new Map<InstanceId, number>();
    const supportedRoot = runtimeNode(1, rowNode([textNode("ok")], { gap: 1 }), [
      runtimeNode(2, textNode("ok")),
    ]);
    assert.equal(runSignatures(supportedRoot, prev), true);
    assert.ok(prev.size > 0);

    const supportedChild = runtimeNode(2, textNode("ok"));
    const unsupportedChild = runtimeNode(3, dropdownNode({ anchorId: "overlay-child" }));
    const mixed = runtimeNode(
      1,
      rowNode([supportedChild.vnode, unsupportedChild.vnode], { gap: 1 }),
      [supportedChild, unsupportedChild],
    );
    assert.equal(runSignatures(mixed, prev), true);
    assert.equal(prev.size, 0);
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
