import { assert, describe, test } from "@rezi-ui/testkit";
import { updateLayoutStabilitySignatures } from "../../app/widgetRenderer/submitFramePipeline.js";
import type { VNode } from "../../index.js";
import type { RuntimeInstance } from "../../runtime/commit.js";
import type { InstanceId } from "../../runtime/instance.js";

const NOOP = (): void => {};
const NOOP2 = (): void => {};

function textNode(text: string): VNode {
  return { kind: "text", text, props: {} } as unknown as VNode;
}

function focusZoneNode(id: string, children: readonly VNode[] = []): VNode {
  return {
    kind: "focusZone",
    props: { id },
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

function assertCoveredKind(
  base: RuntimeInstance,
  layoutChanged: RuntimeInstance,
  nonLayoutChanged: RuntimeInstance,
): void {
  const stableMap = new Map<InstanceId, number>();
  assert.equal(runSignatures(base, stableMap), true);
  assert.equal(runSignatures(base, stableMap), false);

  const changedMap = new Map<InstanceId, number>();
  assert.equal(runSignatures(base, changedMap), true);
  assert.equal(runSignatures(layoutChanged, changedMap), true);

  const styleMap = new Map<InstanceId, number>();
  assert.equal(runSignatures(base, styleMap), true);
  assert.equal(runSignatures(nonLayoutChanged, styleMap), false);
}

describe("layout stability signature coverage", () => {
  test("grid", () => {
    const childA = runtimeNode(2, textNode("A"));
    const childB = runtimeNode(3, textNode("B"));
    const children = [childA, childB] as const;
    const childVNodes = [childA.vnode, childB.vnode] as const;

    const base = runtimeNode(
      1,
      {
        kind: "grid",
        props: { columns: "1 1", rows: "1", gap: 0, rowGap: 0, columnGap: 0 },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    const layoutChanged = runtimeNode(
      1,
      {
        kind: "grid",
        props: { columns: "1 1", rows: "1", gap: 0, rowGap: 0, columnGap: 1 },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    const nonLayoutChanged = runtimeNode(
      1,
      {
        kind: "grid",
        props: {
          columns: "1 1",
          rows: "1",
          gap: 0,
          rowGap: 0,
          columnGap: 0,
          style: { fg: "red" },
        },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("table", () => {
    const base = runtimeNode(1, {
      kind: "table",
      props: {
        id: "tbl",
        columns: Object.freeze([{ key: "name", header: "Name", width: 12 }]),
        data: Object.freeze([{ name: "a" }, { name: "b" }]),
        getRowKey: (row: { name: string }) => row.name,
      },
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "table",
      props: {
        id: "tbl",
        columns: Object.freeze([{ key: "name", header: "Name", width: 14 }]),
        data: Object.freeze([{ name: "a" }, { name: "b" }]),
        getRowKey: (row: { name: string }) => row.name,
      },
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "table",
      props: {
        id: "tbl",
        columns: Object.freeze([{ key: "name", header: "Name", width: 12 }]),
        data: Object.freeze([{ name: "a" }, { name: "b" }]),
        getRowKey: (row: { name: string }) => row.name,
        selectionStyle: { bg: "blue" },
      },
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("tabs", () => {
    const tabs = Object.freeze([
      { key: "a", label: "A", content: textNode("A") },
      { key: "b", label: "B", content: textNode("B") },
    ]);
    const base = runtimeNode(1, {
      kind: "tabs",
      props: { id: "tabs", tabs, activeTab: "a", onChange: NOOP },
      children: Object.freeze([]),
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "tabs",
      props: { id: "tabs", tabs, activeTab: "b", onChange: NOOP },
      children: Object.freeze([]),
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "tabs",
      props: { id: "tabs", tabs, activeTab: "a", onChange: NOOP2, variant: "line" },
      children: Object.freeze([]),
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("tabs with focusZone descendants", () => {
    const tabs = Object.freeze([
      { key: "a", label: "A", content: textNode("A") },
      { key: "b", label: "B", content: textNode("B") },
    ]);
    const zoneLeaf = runtimeNode(3, textNode("content"));
    const zone = runtimeNode(2, focusZoneNode("tabs-focus-zone", [zoneLeaf.vnode]), [zoneLeaf]);
    const children = [zone] as const;
    const childVNodes = [zone.vnode] as const;

    const base = runtimeNode(
      1,
      {
        kind: "tabs",
        props: { id: "tabs-zone", tabs, activeTab: "a", onChange: NOOP },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    const layoutChanged = runtimeNode(
      1,
      {
        kind: "tabs",
        props: { id: "tabs-zone", tabs, activeTab: "b", onChange: NOOP },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    const nonLayoutChanged = runtimeNode(
      1,
      {
        kind: "tabs",
        props: { id: "tabs-zone", tabs, activeTab: "a", onChange: NOOP2, variant: "line" },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("accordion", () => {
    const items = Object.freeze([
      { key: "a", title: "A", content: textNode("A") },
      { key: "b", title: "B", content: textNode("B") },
    ]);
    const base = runtimeNode(1, {
      kind: "accordion",
      props: { id: "acc", items, expanded: Object.freeze([]), onChange: NOOP },
      children: Object.freeze([]),
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "accordion",
      props: { id: "acc", items, expanded: Object.freeze(["a"]), onChange: NOOP },
      children: Object.freeze([]),
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "accordion",
      props: { id: "acc", items, expanded: Object.freeze([]), onChange: NOOP2 },
      children: Object.freeze([]),
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("modal", () => {
    const content = textNode("body");
    const base = runtimeNode(1, {
      kind: "modal",
      props: { id: "m", content, width: 40, height: 10, minWidth: 20, minHeight: 8, maxWidth: 60 },
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "modal",
      props: { id: "m", content, width: 40, height: 10, minWidth: 21, minHeight: 8, maxWidth: 60 },
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "modal",
      props: {
        id: "m",
        content,
        width: 40,
        height: 10,
        minWidth: 20,
        minHeight: 8,
        maxWidth: 60,
        title: "Hello",
      },
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("virtualList", () => {
    const base = runtimeNode(1, {
      kind: "virtualList",
      props: {
        id: "vl",
        items: Object.freeze(["a", "b", "c"]),
        itemHeight: 1,
        renderItem: (item: string) => textNode(item),
        viewport: { w: 40, h: 10 },
      },
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "virtualList",
      props: {
        id: "vl",
        items: Object.freeze(["a", "b", "c", "d"]),
        itemHeight: 1,
        renderItem: (item: string) => textNode(item),
        viewport: { w: 40, h: 10 },
      },
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "virtualList",
      props: {
        id: "vl",
        items: Object.freeze(["a", "b", "c"]),
        itemHeight: 1,
        renderItem: (item: string) => textNode(item),
        viewport: { w: 40, h: 10 },
        onSelect: NOOP,
      },
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("splitPane", () => {
    const left = runtimeNode(2, textNode("L"));
    const right = runtimeNode(3, textNode("R"));
    const children = [left, right] as const;
    const childVNodes = [left.vnode, right.vnode] as const;

    const base = runtimeNode(
      1,
      {
        kind: "splitPane",
        props: {
          id: "sp",
          direction: "horizontal",
          sizes: Object.freeze([50, 50]),
          sizeMode: "percent",
          minSizes: Object.freeze([10, 10]),
          maxSizes: Object.freeze([90, 90]),
          collapsible: true,
          collapsed: Object.freeze([]),
          onResize: NOOP,
        },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    const layoutChanged = runtimeNode(
      1,
      {
        kind: "splitPane",
        props: {
          id: "sp",
          direction: "vertical",
          sizes: Object.freeze([50, 50]),
          sizeMode: "percent",
          minSizes: Object.freeze([10, 10]),
          maxSizes: Object.freeze([90, 90]),
          collapsible: true,
          collapsed: Object.freeze([0]),
          onResize: NOOP,
        },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    const nonLayoutChanged = runtimeNode(
      1,
      {
        kind: "splitPane",
        props: {
          id: "sp",
          direction: "horizontal",
          sizes: Object.freeze([50, 50]),
          sizeMode: "percent",
          minSizes: Object.freeze([10, 10]),
          maxSizes: Object.freeze([90, 90]),
          collapsible: true,
          collapsed: Object.freeze([]),
          onResize: NOOP2,
          accessibleLabel: "resizable panes",
        },
        children: childVNodes,
      } as unknown as VNode,
      children,
    );
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("breadcrumb", () => {
    const base = runtimeNode(1, {
      kind: "breadcrumb",
      props: {
        id: "crumb",
        items: Object.freeze([
          { label: "A", onPress: NOOP },
          { label: "B", onPress: NOOP },
        ]),
      },
      children: Object.freeze([]),
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "breadcrumb",
      props: {
        id: "crumb",
        items: Object.freeze([
          { label: "A", onPress: NOOP },
          { label: "B", onPress: NOOP },
          { label: "C", onPress: NOOP },
        ]),
      },
      children: Object.freeze([]),
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "breadcrumb",
      props: {
        id: "crumb",
        items: Object.freeze([
          { label: "A", onPress: NOOP2 },
          { label: "B", onPress: NOOP2 },
        ]),
      },
      children: Object.freeze([]),
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });

  test("pagination", () => {
    const base = runtimeNode(1, {
      kind: "pagination",
      props: { id: "pg", page: 1, totalPages: 10, onChange: NOOP },
      children: Object.freeze([]),
    } as unknown as VNode);
    const layoutChanged = runtimeNode(1, {
      kind: "pagination",
      props: { id: "pg", page: 1, totalPages: 12, onChange: NOOP },
      children: Object.freeze([]),
    } as unknown as VNode);
    const nonLayoutChanged = runtimeNode(1, {
      kind: "pagination",
      props: { id: "pg", page: 1, totalPages: 10, onChange: NOOP2 },
      children: Object.freeze([]),
    } as unknown as VNode);
    assertCoveredKind(base, layoutChanged, nonLayoutChanged);
  });
});
