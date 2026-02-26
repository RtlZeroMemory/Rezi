import { assert, describe, test } from "@rezi-ui/testkit";
import { each, eachInline } from "../collections.js";
import { ui } from "../ui.js";

type TreeNode = Readonly<{ id: string; children: readonly TreeNode[] }>;

describe("collections", () => {
  test("each injects key into child props", () => {
    const v = each([1, 2], (n) => ui.text(String(n)), { key: (n) => `k${String(n)}` });

    assert.equal(v.kind, "column");
    assert.equal(v.children.length, 2);
    const t0 = v.children[0] as { kind: "text"; props: { key?: string } };
    const t1 = v.children[1] as { kind: "text"; props: { key?: string } };
    assert.equal(t0.props.key, "k1");
    assert.equal(t1.props.key, "k2");
  });

  test("each returns empty node when items is empty and empty provided", () => {
    const v = each([], () => ui.text("x"), { key: () => "k", empty: () => ui.text("empty") });
    assert.equal(v.kind, "text");
    assert.equal((v as { text: string }).text, "empty");
  });

  test("each supports row container to avoid implicit column wrapper", () => {
    const v = each([1, 2], (n) => ui.text(String(n)), {
      key: (n) => `k${String(n)}`,
      container: "row",
    });

    assert.equal(v.kind, "row");
    assert.equal(v.children.length, 2);
  });

  test("eachInline returns keyed children without wrapper", () => {
    const children = eachInline([1, 2], (n) => ui.text(String(n)), {
      key: (n) => `k${String(n)}`,
    });

    assert.equal(children.length, 2);
    const t0 = children[0] as { kind: "text"; props: { key?: string } };
    const t1 = children[1] as { kind: "text"; props: { key?: string } };
    assert.equal(t0.props.key, "k1");
    assert.equal(t1.props.key, "k2");
  });

  test("eachInline injects keys for widget kinds without explicit key in helper switch", () => {
    const children = eachInline(["search", "close"], (icon) => ui.icon(icon), {
      key: (icon) => `icon:${icon}`,
    });
    assert.equal(children.length, 2);
    const i0 = children[0] as { kind: "icon"; props: { key?: string } };
    const i1 = children[1] as { kind: "icon"; props: { key?: string } };
    assert.equal(i0.props.key, "icon:search");
    assert.equal(i1.props.key, "icon:close");
  });

  test("ui.virtualList creates virtualList VNode", () => {
    const items = ["a", "b", "c"] as const;
    const vnode = ui.virtualList({
      id: "vlist",
      items,
      itemHeight: 1,
      overscan: 2,
      renderItem: (item) => ui.text(item),
      onScroll: () => undefined,
      onSelect: () => undefined,
      keyboardNavigation: true,
      wrapAround: false,
    });

    assert.equal(vnode.kind, "virtualList");
    assert.equal(vnode.props.id, "vlist");
    assert.equal(vnode.props.items.length, 3);
    assert.equal(vnode.props.overscan, 2);
  });

  test("ui.table creates table VNode and preserves optional props", () => {
    const vnode = ui.table({
      id: "table",
      columns: [{ key: "name", header: "Name", sortable: true, overflow: "middle" }],
      data: [{ name: "A" }],
      getRowKey: (row) => row.name,
      rowHeight: 1,
      headerHeight: 1,
      selection: [],
      selectionMode: "multi",
      sortColumn: "name",
      sortDirection: "asc",
      virtualized: true,
      overscan: 5,
      stripedRows: true,
      stripeStyle: { odd: ((1 << 16) | (2 << 8) | 3), even: ((4 << 16) | (5 << 8) | 6) },
      showHeader: true,
      border: "single",
      borderStyle: { variant: "double", color: ((7 << 16) | (8 << 8) | 9) },
      onSelectionChange: () => undefined,
      onSort: () => undefined,
      onRowPress: () => undefined,
      onRowDoublePress: () => undefined,
    });

    assert.equal(vnode.kind, "table");
    assert.equal(vnode.props.id, "table");
    assert.equal(vnode.props.columns.length, 1);
    assert.equal(vnode.props.data.length, 1);
    assert.equal(vnode.props.selectionMode, "multi");
    assert.equal(vnode.props.border, "single");
    assert.equal(vnode.props.columns[0]?.overflow, "middle");
    assert.deepEqual(vnode.props.stripeStyle, {
      odd: ((1 << 16) | (2 << 8) | 3),
      even: ((4 << 16) | (5 << 8) | 6),
    });
    assert.deepEqual(vnode.props.borderStyle, { variant: "double", color: ((7 << 16) | (8 << 8) | 9) });
  });

  test("ui.tree creates tree VNode with optional tree features", () => {
    const data: TreeNode = { id: "root", children: [] };
    const vnode = ui.tree({
      id: "tree",
      data,
      getKey: (node) => node.id,
      getChildren: (node) => node.children,
      hasChildren: () => true,
      expanded: ["root"],
      selected: "root",
      onToggle: () => undefined,
      onSelect: () => undefined,
      onActivate: () => undefined,
      renderNode: (node) => ui.text(node.id),
      loadChildren: async () => [],
      indentSize: 3,
      showLines: true,
    });

    assert.equal(vnode.kind, "tree");
    assert.equal(vnode.props.id, "tree");
    assert.equal(vnode.props.expanded.length, 1);
    assert.equal(vnode.props.selected, "root");
    assert.equal(vnode.props.indentSize, 3);
  });
});
