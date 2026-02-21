import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import {
  type TableStateStore,
  type TreeStateStore,
  type VirtualListStateStore,
  createTableStateStore,
  createTreeStateStore,
  createVirtualListStateStore,
} from "../../runtime/localState.js";
import { ui } from "../../widgets/ui.js";
import { layout } from "../layout.js";
import type { LayoutTree } from "../layout.js";

type OverflowMeta = Readonly<{
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}>;

const noop = (..._args: readonly unknown[]) => undefined;

function textNode(text: string): VNode {
  return { kind: "text", text, props: {} };
}

function mustLayout(vnode: VNode, maxW: number, maxH: number, axis: "row" | "column" = "column") {
  const res = layout(vnode, 0, 0, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function requireMeta(node: LayoutTree): OverflowMeta {
  assert.ok(node.meta !== undefined, "expected overflow metadata");
  return node.meta as OverflowMeta;
}

function renderAndGetLayoutTree(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }>,
  stores?: Readonly<{
    virtualListStore?: VirtualListStateStore;
    tableStore?: TableStateStore;
    treeStore?: TreeStateStore;
  }>,
): LayoutTree {
  const allocator = createInstanceIdAllocator(1);
  const committed = commitVNodeTree(null, vnode, { allocator });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) {
    assert.fail("commit failed");
  }

  const laidOut = layout(committed.value.root.vnode, 0, 0, viewport.cols, viewport.rows, "column");
  assert.equal(laidOut.ok, true, "layout should succeed");
  if (!laidOut.ok) {
    assert.fail("layout failed");
  }

  const builder = createDrawlistBuilderV1();
  renderToDrawlist({
    tree: committed.value.root,
    layout: laidOut.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
    virtualListStore: stores?.virtualListStore,
    tableStore: stores?.tableStore,
    treeStore: stores?.treeStore,
  });
  const built = builder.build();
  assert.equal(built.ok, true, "drawlist should build");
  if (!built.ok) {
    assert.fail("drawlist build failed");
  }
  return laidOut.value;
}

function wideChildBox(): VNode {
  return {
    kind: "box",
    props: { border: "none", mr: -4 },
    children: Object.freeze([textNode("123456789")]),
  };
}

function tallChildBox(): VNode {
  return {
    kind: "box",
    props: { border: "none", mb: -1 },
    children: Object.freeze([textNode("a"), textNode("b"), textNode("c"), textNode("d")]),
  };
}

function wideTallChildBox(): VNode {
  return {
    kind: "box",
    props: { border: "none", mr: -4, mb: -1 },
    children: Object.freeze([
      textNode("123456789"),
      textNode("line2"),
      textNode("line3"),
      textNode("line4"),
    ]),
  };
}

type TreeNode = Readonly<{ id: string; children: readonly TreeNode[] }>;

function flatTree(count: number): readonly TreeNode[] {
  const out: TreeNode[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Object.freeze({ id: `node-${String(i)}`, children: Object.freeze([]) }));
  }
  return Object.freeze(out);
}

describe("overflow scroll metadata (row/column/box)", () => {
  test("row clamps scrollX to max and shifts children", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 5, overflow: "scroll", scrollX: 99 },
      children: Object.freeze([wideChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 2);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 4,
      scrollY: 0,
      contentWidth: 9,
      contentHeight: 1,
      viewportWidth: 5,
      viewportHeight: 1,
    });
    assert.deepEqual(tree.children[0]?.rect, { x: -4, y: 0, w: 9, h: 1 });
  });

  test("row preserves in-range scrollX", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 5, overflow: "scroll", scrollX: 2 },
      children: Object.freeze([wideChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 2);
    assert.equal(requireMeta(tree).scrollX, 2);
    assert.equal(tree.children[0]?.rect.x, -2);
  });

  test("row clamps scrollX to zero when content fits", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 5, overflow: "scroll", scrollX: 99 },
      children: Object.freeze([textNode("fit")]),
    };
    const tree = mustLayout(vnode, 5, 2);
    assert.equal(requireMeta(tree).scrollX, 0);
    assert.equal(tree.children[0]?.rect.x, 0);
  });

  test("row clamps scrollY to max and shifts children", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 5, height: 3, overflow: "scroll", scrollY: 99 },
      children: Object.freeze([tallChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.equal(requireMeta(tree).scrollY, 1);
    assert.equal(tree.children[0]?.rect.y, -1);
  });

  test("row clamps scrollY to zero when content fits", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 5, height: 3, overflow: "scroll", scrollY: 99 },
      children: Object.freeze([textNode("x")]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.equal(requireMeta(tree).scrollY, 0);
    assert.equal(tree.children[0]?.rect.y, 0);
  });

  test("row clamps both axes for oversized content", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 5, height: 3, overflow: "scroll", scrollX: 99, scrollY: 99 },
      children: Object.freeze([wideTallChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 4,
      scrollY: 1,
      contentWidth: 9,
      contentHeight: 4,
      viewportWidth: 5,
      viewportHeight: 3,
    });
    assert.deepEqual(tree.children[0]?.rect, { x: -4, y: -1, w: 9, h: 4 });
  });

  test("row viewport metadata respects uniform padding", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 7, height: 4, p: 1, overflow: "scroll", scrollX: 99 },
      children: Object.freeze([wideChildBox()]),
    };
    const tree = mustLayout(vnode, 7, 4);
    assert.equal(requireMeta(tree).viewportWidth, 5);
    assert.equal(requireMeta(tree).viewportHeight, 2);
  });

  test("row viewport metadata respects directional padding", () => {
    const vnode: VNode = {
      kind: "row",
      props: { width: 8, height: 5, pl: 2, pr: 1, pt: 1, pb: 1, overflow: "scroll", scrollX: 99 },
      children: Object.freeze([wideChildBox()]),
    };
    const tree = mustLayout(vnode, 8, 5);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 4,
      scrollY: 0,
      contentWidth: 9,
      contentHeight: 1,
      viewportWidth: 5,
      viewportHeight: 3,
    });
  });

  test("column clamps scrollY to max and shifts children", () => {
    const vnode: VNode = {
      kind: "column",
      props: { height: 3, overflow: "scroll", scrollY: 99 },
      children: Object.freeze([tallChildBox()]),
    };
    const tree = mustLayout(vnode, 6, 3);
    assert.equal(requireMeta(tree).scrollY, 1);
    assert.equal(tree.children[0]?.rect.y, -1);
  });

  test("column preserves in-range scrollY", () => {
    const vnode: VNode = {
      kind: "column",
      props: { height: 3, overflow: "scroll", scrollY: 1 },
      children: Object.freeze([tallChildBox()]),
    };
    const tree = mustLayout(vnode, 6, 3);
    assert.equal(requireMeta(tree).scrollY, 1);
    assert.equal(tree.children[0]?.rect.y, -1);
  });

  test("column clamps scrollY to zero when content fits", () => {
    const vnode: VNode = {
      kind: "column",
      props: { height: 3, overflow: "scroll", scrollY: 99 },
      children: Object.freeze([textNode("x")]),
    };
    const tree = mustLayout(vnode, 6, 3);
    assert.equal(requireMeta(tree).scrollY, 0);
  });

  test("column clamps scrollX to max and shifts children", () => {
    const vnode: VNode = {
      kind: "column",
      props: { width: 5, overflow: "scroll", scrollX: 99 },
      children: Object.freeze([wideChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.equal(requireMeta(tree).scrollX, 4);
    assert.equal(tree.children[0]?.rect.x, -4);
  });

  test("column clamps both axes for oversized content", () => {
    const vnode: VNode = {
      kind: "column",
      props: { width: 5, height: 3, overflow: "scroll", scrollX: 99, scrollY: 99 },
      children: Object.freeze([wideTallChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 4,
      scrollY: 1,
      contentWidth: 9,
      contentHeight: 4,
      viewportWidth: 5,
      viewportHeight: 3,
    });
  });

  test("column viewport metadata respects padding", () => {
    const vnode: VNode = {
      kind: "column",
      props: { width: 8, height: 6, p: 1, overflow: "scroll", scrollX: 99, scrollY: 99 },
      children: Object.freeze([wideTallChildBox()]),
    };
    const tree = mustLayout(vnode, 8, 6);
    assert.equal(requireMeta(tree).viewportWidth, 6);
    assert.equal(requireMeta(tree).viewportHeight, 4);
  });

  test("box clamps both axes and shifts children", () => {
    const vnode: VNode = {
      kind: "box",
      props: { border: "none", width: 5, height: 3, overflow: "scroll", scrollX: 99, scrollY: 99 },
      children: Object.freeze([wideTallChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 4,
      scrollY: 1,
      contentWidth: 9,
      contentHeight: 4,
      viewportWidth: 5,
      viewportHeight: 3,
    });
    assert.deepEqual(tree.children[0]?.rect, { x: -4, y: -1, w: 9, h: 4 });
  });

  test("box preserves in-range scroll values", () => {
    const vnode: VNode = {
      kind: "box",
      props: { border: "none", width: 5, height: 3, overflow: "scroll", scrollX: 1, scrollY: 1 },
      children: Object.freeze([wideTallChildBox()]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.equal(requireMeta(tree).scrollX, 1);
    assert.equal(requireMeta(tree).scrollY, 1);
    assert.equal(tree.children[0]?.rect.x, -1);
    assert.equal(tree.children[0]?.rect.y, -1);
  });

  test("box clamps scroll to zero when content fits", () => {
    const vnode: VNode = {
      kind: "box",
      props: { border: "none", width: 5, height: 3, overflow: "scroll", scrollX: 99, scrollY: 99 },
      children: Object.freeze([textNode("fit")]),
    };
    const tree = mustLayout(vnode, 5, 3);
    assert.equal(requireMeta(tree).scrollX, 0);
    assert.equal(requireMeta(tree).scrollY, 0);
  });

  test("box viewport metadata respects border and padding", () => {
    const vnode: VNode = {
      kind: "box",
      props: {
        border: "single",
        width: 8,
        height: 6,
        p: 1,
        overflow: "scroll",
        scrollX: 99,
        scrollY: 99,
      },
      children: Object.freeze([wideTallChildBox()]),
    };
    const tree = mustLayout(vnode, 8, 6);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 4,
      scrollY: 1,
      contentWidth: 8,
      contentHeight: 3,
      viewportWidth: 4,
      viewportHeight: 2,
    });
  });
});

describe("collection scroll metadata wiring", () => {
  test("virtualList layout baseline metadata matches viewport rect", () => {
    const vnode = ui.virtualList({
      id: "vl-base",
      items: Object.freeze(["a", "b"]),
      itemHeight: 1,
      renderItem: (item) => ui.text(String(item)),
    });
    const tree = mustLayout(vnode, 12, 5);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 12,
      contentHeight: 5,
      viewportWidth: 12,
      viewportHeight: 5,
    });
  });

  test("virtualList render wiring clamps stale scrollTop and patches content height", () => {
    const virtualListStore = createVirtualListStateStore();
    virtualListStore.set("vl-wired", { scrollTop: 99 });

    const vnode = ui.virtualList({
      id: "vl-wired",
      items: Object.freeze(Array.from({ length: 10 }, (_, i) => `item-${String(i)}`)),
      itemHeight: 1,
      renderItem: (item) => ui.text(String(item)),
    });
    const tree = renderAndGetLayoutTree(vnode, { cols: 12, rows: 5 }, { virtualListStore });
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 5,
      contentWidth: 12,
      contentHeight: 10,
      viewportWidth: 12,
      viewportHeight: 5,
    });
  });

  test("virtualList estimateItemHeight mode patches metadata from measured heights", () => {
    const vnode = ui.virtualList({
      id: "vl-est",
      items: Object.freeze(["a", "b", "c", "d"]),
      estimateItemHeight: 1,
      renderItem: (item) => ui.column({}, [ui.text(String(item)), ui.text(`${String(item)}-2`)]),
    });
    const tree = renderAndGetLayoutTree(vnode, { cols: 12, rows: 3 });
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 12,
      contentHeight: 10,
      viewportWidth: 12,
      viewportHeight: 3,
    });
  });

  test("table layout baseline metadata matches viewport rect", () => {
    const vnode = ui.table({
      id: "tbl-base",
      columns: [{ key: "name", header: "Name", width: 8 }],
      data: Object.freeze([{ name: "r0" }]),
      getRowKey: (row) => row.name,
      border: "none",
    });
    const tree = mustLayout(vnode, 14, 6);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 14,
      contentHeight: 6,
      viewportWidth: 14,
      viewportHeight: 6,
    });
  });

  test("table render wiring clamps stale scrollTop with border/header viewport", () => {
    const tableStore = createTableStateStore();
    tableStore.set("tbl-wired", { scrollTop: 99 });
    const data = Object.freeze(Array.from({ length: 8 }, (_, i) => ({ name: `row-${String(i)}` })));
    const vnode = ui.table({
      id: "tbl-wired",
      columns: [{ key: "name", header: "Name", width: 8 }],
      data,
      getRowKey: (row) => row.name,
      border: "single",
    });
    const tree = renderAndGetLayoutTree(vnode, { cols: 12, rows: 6 }, { tableStore });
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 5,
      contentWidth: 10,
      contentHeight: 8,
      viewportWidth: 10,
      viewportHeight: 3,
    });
  });

  test("table render wiring uses full inner height when header is hidden", () => {
    const tableStore = createTableStateStore();
    tableStore.set("tbl-no-header", { scrollTop: 99 });
    const data = Object.freeze(Array.from({ length: 8 }, (_, i) => ({ name: `row-${String(i)}` })));
    const vnode = ui.table({
      id: "tbl-no-header",
      columns: [{ key: "name", header: "Name", width: 8 }],
      data,
      getRowKey: (row) => row.name,
      border: "single",
      showHeader: false,
    });
    const tree = renderAndGetLayoutTree(vnode, { cols: 12, rows: 6 }, { tableStore });
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 4,
      contentWidth: 10,
      contentHeight: 8,
      viewportWidth: 10,
      viewportHeight: 4,
    });
  });

  test("tree layout baseline metadata matches viewport rect", () => {
    const vnode = ui.tree<TreeNode>({
      id: "tree-base",
      data: flatTree(2),
      getKey: (node) => node.id,
      getChildren: (node) => node.children,
      expanded: Object.freeze([]),
      onToggle: noop,
      renderNode: (node) => ui.text(node.id),
    });
    const tree = mustLayout(vnode, 10, 4);
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 0,
      contentWidth: 10,
      contentHeight: 4,
      viewportWidth: 10,
      viewportHeight: 4,
    });
  });

  test("tree render wiring clamps stale scrollTop and patches content height", () => {
    const treeStore = createTreeStateStore();
    treeStore.set("tree-wired", { scrollTop: 99 });
    const vnode = ui.tree<TreeNode>({
      id: "tree-wired",
      data: flatTree(8),
      getKey: (node) => node.id,
      getChildren: (node) => node.children,
      expanded: Object.freeze([]),
      onToggle: noop,
      renderNode: (node) => ui.text(node.id),
    });
    const tree = renderAndGetLayoutTree(vnode, { cols: 10, rows: 4 }, { treeStore });
    assert.deepEqual(requireMeta(tree), {
      scrollX: 0,
      scrollY: 4,
      contentWidth: 10,
      contentHeight: 8,
      viewportWidth: 10,
      viewportHeight: 4,
    });
  });

  test("tree render wiring truncates fractional scrollTop to deterministic integer", () => {
    const treeStore = createTreeStateStore();
    treeStore.set("tree-fractional", { scrollTop: 2.9 });
    const vnode = ui.tree<TreeNode>({
      id: "tree-fractional",
      data: flatTree(8),
      getKey: (node) => node.id,
      getChildren: (node) => node.children,
      expanded: Object.freeze([]),
      onToggle: noop,
      renderNode: (node) => ui.text(node.id),
    });
    const tree = renderAndGetLayoutTree(vnode, { cols: 10, rows: 4 }, { treeStore });
    assert.equal(requireMeta(tree).scrollY, 2);
  });
});
