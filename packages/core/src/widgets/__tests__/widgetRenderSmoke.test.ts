import { assert, describe, test } from "@rezi-ui/testkit";
import { type VNode, createDrawlistBuilderV1 } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { ui } from "../ui.js";

type TreeNode = Readonly<{ id: string; children: readonly TreeNode[] }>;

function renderBytes(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 100, rows: 40 },
): Uint8Array {
  const allocator = createInstanceIdAllocator(1);
  const committed = commitVNodeTree(null, vnode, { allocator });
  assert.equal(committed.ok, true, "commit should succeed");
  if (!committed.ok) return new Uint8Array();

  const layoutRes = layout(
    committed.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return new Uint8Array();

  const builder = createDrawlistBuilderV1();
  renderToDrawlist({
    tree: committed.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
  });
  const built = builder.build();
  assert.equal(built.ok, true, "drawlist should build");
  if (!built.ok) return new Uint8Array();
  return built.bytes;
}

describe("widget render smoke", () => {
  const noop = (..._args: readonly unknown[]) => undefined;

  const fileData = {
    name: "root",
    path: "/",
    type: "directory",
    children: [{ name: "readme.md", path: "/readme.md", type: "file" }],
  } as const;

  const diff = {
    oldPath: "a.txt",
    newPath: "a.txt",
    status: "modified",
    hunks: [
      {
        oldStart: 1,
        oldCount: 1,
        newStart: 1,
        newCount: 1,
        lines: [{ type: "context", content: "line" }],
      },
    ],
  } as const;

  const treeData: TreeNode = {
    id: "root",
    children: [{ id: "child", children: [] }],
  };

  const allWidgets: readonly Readonly<{ name: string; vnode: VNode }>[] = [
    { name: "text", vnode: ui.text("hello") },
    { name: "box", vnode: ui.box({}, [ui.text("inside")]) },
    { name: "row", vnode: ui.row({ gap: 1 }, [ui.text("a"), ui.text("b")]) },
    { name: "column", vnode: ui.column({ gap: 1 }, [ui.text("a"), ui.text("b")]) },
    { name: "spacer", vnode: ui.spacer({ size: 1 }) },
    { name: "divider", vnode: ui.divider({ label: "div" }) },
    { name: "icon", vnode: ui.icon("status.check") },
    { name: "spinner", vnode: ui.spinner({ label: "loading" }) },
    { name: "progress", vnode: ui.progress(0.5, { showPercent: true }) },
    { name: "skeleton", vnode: ui.skeleton(8, { height: 2 }) },
    { name: "richText", vnode: ui.richText([{ text: "rich", style: { bold: true } }]) },
    { name: "kbd", vnode: ui.kbd(["Ctrl", "K"]) },
    { name: "badge", vnode: ui.badge("new") },
    { name: "status", vnode: ui.status("online", { label: "ok" }) },
    { name: "tag", vnode: ui.tag("v1", { removable: true }) },
    { name: "gauge", vnode: ui.gauge(0.7, { label: "cpu" }) },
    { name: "empty", vnode: ui.empty("No data", { description: "nothing here" }) },
    { name: "errorDisplay", vnode: ui.errorDisplay("failed") },
    { name: "callout", vnode: ui.callout("watch out", { variant: "warning" }) },
    { name: "sparkline", vnode: ui.sparkline([1, 2, 3, 2, 1]) },
    {
      name: "barChart",
      vnode: ui.barChart([
        { label: "A", value: 1 },
        { label: "B", value: 2 },
      ]),
    },
    {
      name: "miniChart",
      vnode: ui.miniChart([
        { label: "CPU", value: 55, max: 100 },
        { label: "MEM", value: 72, max: 100 },
      ]),
    },
    { name: "button", vnode: ui.button("ok", "OK") },
    { name: "input", vnode: ui.input("name", "value") },
    { name: "slider", vnode: ui.slider({ id: "volume", value: 50, min: 0, max: 100, step: 5 }) },
    {
      name: "focusZone",
      vnode: ui.focusZone({ id: "zone", navigation: "linear" }, [ui.button("z1", "One")]),
    },
    {
      name: "focusTrap",
      vnode: ui.focusTrap({ id: "trap", active: true }, [ui.button("t1", "One")]),
    },
    {
      name: "virtualList",
      vnode: ui.virtualList({
        id: "vl",
        items: [1, 2, 3],
        itemHeight: 1,
        renderItem: (item) => ui.text(String(item)),
      }),
    },
    { name: "layers", vnode: ui.layers([ui.text("base"), ui.text("overlay")]) },
    {
      name: "modal",
      vnode: ui.modal({
        id: "modal",
        title: "Confirm",
        content: ui.text("Continue?"),
        actions: [ui.button("yes", "Yes")],
      }),
    },
    {
      name: "dropdown",
      vnode: ui.dropdown({
        id: "dd",
        anchorId: "missing-anchor",
        items: [{ id: "one", label: "One" }],
      }),
    },
    {
      name: "layer",
      vnode: ui.layer({ id: "layer", content: ui.text("content"), modal: true }),
    },
    {
      name: "table",
      vnode: ui.table({
        id: "tbl",
        columns: [{ key: "name", header: "Name" }],
        data: [{ name: "Alpha" }],
        getRowKey: (row) => row.name,
      }),
    },
    {
      name: "tree",
      vnode: ui.tree({
        id: "tree",
        data: treeData,
        getKey: (node) => node.id,
        getChildren: (node) => node.children,
        expanded: ["root"],
        onToggle: noop,
        renderNode: (node) => ui.text(node.id),
      }),
    },
    {
      name: "field",
      vnode: ui.field({ label: "Name", required: true, children: ui.input("field", "") }),
    },
    {
      name: "select",
      vnode: ui.select({
        id: "sel",
        value: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
    },
    { name: "checkbox", vnode: ui.checkbox({ id: "chk", checked: true, label: "Check" }) },
    {
      name: "radioGroup",
      vnode: ui.radioGroup({
        id: "rg",
        value: "a",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
    },
    {
      name: "commandPalette",
      vnode: ui.commandPalette({
        id: "cp",
        open: true,
        query: "",
        sources: [
          {
            id: "cmd",
            name: "Commands",
            getItems: () => [{ id: "x", label: "Run", sourceId: "cmd" }],
          },
        ],
        selectedIndex: 0,
        onQueryChange: noop,
        onSelect: noop,
        onClose: noop,
      }),
    },
    {
      name: "filePicker",
      vnode: ui.filePicker({
        id: "picker",
        rootPath: "/",
        data: fileData,
        expandedPaths: ["/"],
        onSelect: noop,
        onToggle: noop,
        onOpen: noop,
      }),
    },
    {
      name: "fileTreeExplorer",
      vnode: ui.fileTreeExplorer({
        id: "explorer",
        data: fileData,
        expanded: ["/"],
        onToggle: noop,
        onSelect: noop,
        onActivate: noop,
      }),
    },
    {
      name: "splitPane",
      vnode: ui.splitPane(
        {
          id: "split",
          direction: "horizontal",
          sizes: [50, 50],
          onResize: noop,
        },
        [ui.text("L"), ui.text("R")],
      ),
    },
    {
      name: "panelGroup",
      vnode: ui.panelGroup({ id: "pg", direction: "horizontal" }, [
        ui.resizablePanel({}, [ui.text("one")]),
        ui.resizablePanel({}, [ui.text("two")]),
      ]),
    },
    {
      name: "resizablePanel",
      vnode: ui.resizablePanel({ defaultSize: 50 }, [ui.text("panel")]),
    },
    {
      name: "codeEditor",
      vnode: ui.codeEditor({
        id: "editor",
        lines: ["const x = 1;"],
        cursor: { line: 0, column: 0 },
        selection: null,
        scrollTop: 0,
        scrollLeft: 0,
        onChange: noop,
        onSelectionChange: noop,
        onScroll: noop,
      }),
    },
    {
      name: "diffViewer",
      vnode: ui.diffViewer({
        id: "diff",
        diff,
        mode: "unified",
        scrollTop: 0,
        onScroll: noop,
      }),
    },
    {
      name: "toolApprovalDialog",
      vnode: ui.toolApprovalDialog({
        id: "approval",
        open: true,
        request: { toolId: "shell", toolName: "Shell", riskLevel: "low" },
        onAllow: noop,
        onDeny: noop,
        onClose: noop,
      }),
    },
    {
      name: "logsConsole",
      vnode: ui.logsConsole({
        id: "logs",
        entries: [
          {
            id: "entry-1",
            timestamp: 0,
            level: "info",
            source: "app",
            message: "Started",
          },
        ],
        scrollTop: 0,
        onScroll: noop,
      }),
    },
    {
      name: "toastContainer",
      vnode: ui.toastContainer({
        toasts: [{ id: "t1", message: "Saved", type: "success" }],
        onDismiss: noop,
      }),
    },
  ];

  for (const item of allWidgets) {
    test(`renders ${item.name} without crashing`, () => {
      const bytes = renderBytes(item.vnode);
      assert.equal(bytes.byteLength > 0, true);
    });
  }
});
