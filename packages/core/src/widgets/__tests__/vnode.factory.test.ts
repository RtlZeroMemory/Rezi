import { assert, describe, test } from "@rezi-ui/testkit";
import type { CommandItem, FileNode, ToolRequest, VNode } from "../types.js";
import { ui } from "../ui.js";

const noop = () => undefined;

const commandItems: readonly CommandItem[] = [];
const fileNode: FileNode = { name: "README.md", path: "/README.md", type: "file" };
const diffData = {
  oldPath: "a.txt",
  newPath: "b.txt",
  hunks: [],
  status: "modified" as const,
};
const toolRequest: ToolRequest = { toolId: "shell", toolName: "Shell", riskLevel: "low" };

function typecheckRequiredProps(): void {
  // @ts-expect-error button requires id
  ui.button({ label: "Save" });
  // @ts-expect-error button requires label
  ui.button({ id: "save" });
  // @ts-expect-error input requires id
  ui.input({ value: "" });
  // @ts-expect-error input requires value
  ui.input({ id: "name" });
  // @ts-expect-error select requires id/value/options
  ui.select({ id: "country", value: "" });
  // @ts-expect-error slider requires value
  ui.slider({ id: "volume" });
  // @ts-expect-error checkbox requires checked
  ui.checkbox({ id: "remember" });
  // @ts-expect-error radioGroup requires options
  ui.radioGroup({ id: "plan", value: "free" });
}
void typecheckRequiredProps;

type FactoryCase = Readonly<{
  name: string;
  expectedKind: VNode["kind"];
  build: () => VNode;
  optionalAbsent?: string;
}>;

const factoryCases: readonly FactoryCase[] = [
  {
    name: "text",
    expectedKind: "text",
    build: () => ui.text("hello"),
    optionalAbsent: "style",
  },
  {
    name: "box",
    expectedKind: "box",
    build: () => ui.box({}, []),
    optionalAbsent: "title",
  },
  {
    name: "row",
    expectedKind: "row",
    build: () => ui.row({}, []),
    optionalAbsent: "wrap",
  },
  {
    name: "column",
    expectedKind: "column",
    build: () => ui.column({}, []),
    optionalAbsent: "wrap",
  },
  {
    name: "grid",
    expectedKind: "grid",
    build: () => ui.grid({ columns: 2 }),
    optionalAbsent: "rows",
  },
  {
    name: "vstack",
    expectedKind: "column",
    build: () => ui.vstack([ui.text("a")]),
    optionalAbsent: "key",
  },
  {
    name: "hstack",
    expectedKind: "row",
    build: () => ui.hstack([ui.text("a")]),
    optionalAbsent: "key",
  },
  {
    name: "spacer",
    expectedKind: "spacer",
    build: () => ui.spacer(),
    optionalAbsent: "size",
  },
  {
    name: "divider",
    expectedKind: "divider",
    build: () => ui.divider(),
    optionalAbsent: "char",
  },
  {
    name: "icon",
    expectedKind: "icon",
    build: () => ui.icon("status.check"),
    optionalAbsent: "style",
  },
  {
    name: "spinner",
    expectedKind: "spinner",
    build: () => ui.spinner(),
    optionalAbsent: "label",
  },
  {
    name: "progress",
    expectedKind: "progress",
    build: () => ui.progress(0.5),
    optionalAbsent: "width",
  },
  {
    name: "skeleton",
    expectedKind: "skeleton",
    build: () => ui.skeleton(4),
    optionalAbsent: "height",
  },
  {
    name: "richText",
    expectedKind: "richText",
    build: () => ui.richText([{ text: "x" }]),
    optionalAbsent: "key",
  },
  {
    name: "kbd",
    expectedKind: "kbd",
    build: () => ui.kbd("Ctrl+S"),
    optionalAbsent: "separator",
  },
  {
    name: "badge",
    expectedKind: "badge",
    build: () => ui.badge("new"),
    optionalAbsent: "variant",
  },
  {
    name: "status",
    expectedKind: "status",
    build: () => ui.status("online"),
    optionalAbsent: "label",
  },
  {
    name: "tag",
    expectedKind: "tag",
    build: () => ui.tag("api"),
    optionalAbsent: "variant",
  },
  {
    name: "gauge",
    expectedKind: "gauge",
    build: () => ui.gauge(0.25),
    optionalAbsent: "label",
  },
  {
    name: "empty",
    expectedKind: "empty",
    build: () => ui.empty("No data"),
    optionalAbsent: "description",
  },
  {
    name: "errorDisplay",
    expectedKind: "errorDisplay",
    build: () => ui.errorDisplay("Failed"),
    optionalAbsent: "title",
  },
  {
    name: "callout",
    expectedKind: "callout",
    build: () => ui.callout("Saved"),
    optionalAbsent: "title",
  },
  {
    name: "link",
    expectedKind: "link",
    build: () => ui.link("https://example.com", "Example"),
    optionalAbsent: "style",
  },
  {
    name: "canvas",
    expectedKind: "canvas",
    build: () => ui.canvas({ width: 10, height: 4, draw: () => undefined }),
    optionalAbsent: "blitter",
  },
  {
    name: "image",
    expectedKind: "image",
    build: () => ui.image({ src: new Uint8Array([0, 0, 0, 0]), width: 4, height: 2 }),
    optionalAbsent: "fit",
  },
  {
    name: "lineChart",
    expectedKind: "lineChart",
    build: () =>
      ui.lineChart({ width: 20, height: 6, series: [{ data: [1, 2, 3], color: "#fff" }] }),
    optionalAbsent: "axes",
  },
  {
    name: "scatter",
    expectedKind: "scatter",
    build: () => ui.scatter({ width: 20, height: 6, points: [{ x: 1, y: 2 }] }),
    optionalAbsent: "color",
  },
  {
    name: "heatmap",
    expectedKind: "heatmap",
    build: () =>
      ui.heatmap({
        width: 10,
        height: 4,
        data: [
          [1, 2],
          [3, 4],
        ],
      }),
    optionalAbsent: "colorScale",
  },
  {
    name: "sparkline",
    expectedKind: "sparkline",
    build: () => ui.sparkline([1, 2, 3]),
    optionalAbsent: "width",
  },
  {
    name: "barChart",
    expectedKind: "barChart",
    build: () => ui.barChart([{ label: "A", value: 1 }]),
    optionalAbsent: "orientation",
  },
  {
    name: "miniChart",
    expectedKind: "miniChart",
    build: () => ui.miniChart([{ label: "A", value: 1 }]),
    optionalAbsent: "variant",
  },
  {
    name: "button",
    expectedKind: "button",
    build: () => ui.button("save", "Save"),
    optionalAbsent: "disabled",
  },
  {
    name: "input",
    expectedKind: "input",
    build: () => ui.input("query", ""),
    optionalAbsent: "disabled",
  },
  {
    name: "focusZone",
    expectedKind: "focusZone",
    build: () => ui.focusZone({ id: "zone" }, []),
    optionalAbsent: "navigation",
  },
  {
    name: "focusTrap",
    expectedKind: "focusTrap",
    build: () => ui.focusTrap({ id: "trap", active: true }, []),
    optionalAbsent: "initialFocus",
  },
  {
    name: "virtualList",
    expectedKind: "virtualList",
    build: () =>
      ui.virtualList({
        id: "list",
        items: [1, 2],
        itemHeight: 1,
        renderItem: (item) => ui.text(String(item)),
      }),
    optionalAbsent: "overscan",
  },
  {
    name: "layers",
    expectedKind: "layers",
    build: () => ui.layers([ui.text("base")]),
    optionalAbsent: "key",
  },
  {
    name: "modal",
    expectedKind: "modal",
    build: () => ui.modal({ id: "m", content: ui.text("modal") }),
    optionalAbsent: "title",
  },
  {
    name: "dropdown",
    expectedKind: "dropdown",
    build: () => ui.dropdown({ id: "d", anchorId: "btn", items: [{ id: "open", label: "Open" }] }),
    optionalAbsent: "position",
  },
  {
    name: "layer",
    expectedKind: "layer",
    build: () => ui.layer({ id: "layer", content: ui.text("overlay") }),
    optionalAbsent: "zIndex",
  },
  {
    name: "table",
    expectedKind: "table",
    build: () =>
      ui.table({
        id: "table",
        columns: [{ key: "name", header: "Name" }],
        data: [{ id: "r1", name: "alpha" }],
        getRowKey: (row) => row.id,
      }),
    optionalAbsent: "rowHeight",
  },
  {
    name: "tree",
    expectedKind: "tree",
    build: () =>
      ui.tree({
        id: "tree",
        data: { id: "root" },
        getKey: (node: { id: string }) => node.id,
        expanded: [],
        onToggle: noop,
        renderNode: (node: { id: string }) => ui.text(node.id),
      }),
    optionalAbsent: "selected",
  },
  {
    name: "field",
    expectedKind: "field",
    build: () => ui.field({ label: "Name", children: ui.input("name", "") }),
    optionalAbsent: "error",
  },
  {
    name: "select",
    expectedKind: "select",
    build: () =>
      ui.select({
        id: "country",
        value: "",
        options: [{ value: "us", label: "United States" }],
      }),
    optionalAbsent: "disabled",
  },
  {
    name: "slider",
    expectedKind: "slider",
    build: () => ui.slider({ id: "volume", value: 50 }),
    optionalAbsent: "min",
  },
  {
    name: "checkbox",
    expectedKind: "checkbox",
    build: () => ui.checkbox({ id: "remember", checked: true }),
    optionalAbsent: "label",
  },
  {
    name: "radioGroup",
    expectedKind: "radioGroup",
    build: () =>
      ui.radioGroup({
        id: "plan",
        value: "free",
        options: [{ value: "free", label: "Free" }],
      }),
    optionalAbsent: "direction",
  },
  {
    name: "commandPalette",
    expectedKind: "commandPalette",
    build: () =>
      ui.commandPalette({
        id: "cp",
        open: true,
        query: "",
        sources: [{ id: "core", name: "Core", getItems: () => commandItems }],
        selectedIndex: 0,
        onQueryChange: noop,
        onSelect: noop,
        onClose: noop,
      }),
    optionalAbsent: "loading",
  },
  {
    name: "filePicker",
    expectedKind: "filePicker",
    build: () =>
      ui.filePicker({
        id: "picker",
        rootPath: "/",
        data: fileNode,
        expandedPaths: [],
        onSelect: noop,
        onToggle: noop,
        onOpen: noop,
      }),
    optionalAbsent: "selectedPath",
  },
  {
    name: "fileTreeExplorer",
    expectedKind: "fileTreeExplorer",
    build: () =>
      ui.fileTreeExplorer({
        id: "explorer",
        data: fileNode,
        expanded: [],
        onToggle: noop,
        onSelect: noop,
        onActivate: noop,
      }),
    optionalAbsent: "selected",
  },
  {
    name: "splitPane",
    expectedKind: "splitPane",
    build: () =>
      ui.splitPane({ id: "split", direction: "horizontal", sizes: [50, 50], onResize: noop }, [
        ui.text("left"),
        ui.text("right"),
      ]),
    optionalAbsent: "sizeMode",
  },
  {
    name: "panelGroup",
    expectedKind: "panelGroup",
    build: () => ui.panelGroup({ id: "group", direction: "horizontal" }, []),
    optionalAbsent: "key",
  },
  {
    name: "resizablePanel",
    expectedKind: "resizablePanel",
    build: () => ui.resizablePanel({}, []),
    optionalAbsent: "defaultSize",
  },
  {
    name: "codeEditor",
    expectedKind: "codeEditor",
    build: () =>
      ui.codeEditor({
        id: "editor",
        lines: ["hello"],
        cursor: { line: 0, column: 0 },
        selection: null,
        scrollTop: 0,
        scrollLeft: 0,
        onChange: noop,
        onSelectionChange: noop,
        onScroll: noop,
      }),
    optionalAbsent: "tabSize",
  },
  {
    name: "diffViewer",
    expectedKind: "diffViewer",
    build: () =>
      ui.diffViewer({
        id: "diff",
        diff: diffData,
        mode: "unified",
        scrollTop: 0,
        onScroll: noop,
      }),
    optionalAbsent: "lineNumbers",
  },
  {
    name: "toolApprovalDialog",
    expectedKind: "toolApprovalDialog",
    build: () =>
      ui.toolApprovalDialog({
        id: "approval",
        request: toolRequest,
        open: true,
        onAllow: noop,
        onDeny: noop,
        onClose: noop,
      }),
    optionalAbsent: "focusedAction",
  },
  {
    name: "logsConsole",
    expectedKind: "logsConsole",
    build: () =>
      ui.logsConsole({
        id: "logs",
        entries: [],
        scrollTop: 0,
        onScroll: noop,
      }),
    optionalAbsent: "autoScroll",
  },
  {
    name: "toastContainer",
    expectedKind: "toastContainer",
    build: () =>
      ui.toastContainer({
        toasts: [],
        onDismiss: noop,
      }),
    optionalAbsent: "position",
  },
];

type KeyCase = Readonly<{
  name: string;
  build: (key: string) => VNode;
}>;

const keyCases: readonly KeyCase[] = [
  { name: "text", build: (key) => ui.text("x", { key }) },
  { name: "box", build: (key) => ui.box({ key }, []) },
  { name: "row", build: (key) => ui.row({ key }, []) },
  { name: "column", build: (key) => ui.column({ key }, []) },
  { name: "vstack", build: (key) => ui.vstack({ key, gap: 2 }, []) },
  { name: "hstack", build: (key) => ui.hstack({ key, gap: 2 }, []) },
  { name: "spacer", build: (key) => ui.spacer({ key }) },
  { name: "divider", build: (key) => ui.divider({ key }) },
  { name: "icon", build: (key) => ui.icon("status.check", { key }) },
  { name: "spinner", build: (key) => ui.spinner({ key }) },
  { name: "progress", build: (key) => ui.progress(0.5, { key }) },
  { name: "skeleton", build: (key) => ui.skeleton(4, { key }) },
  { name: "richText", build: (key) => ui.richText([{ text: "x" }], { key }) },
  { name: "kbd", build: (key) => ui.kbd("Ctrl+S", { key }) },
  { name: "badge", build: (key) => ui.badge("new", { key }) },
  { name: "status", build: (key) => ui.status("online", { key }) },
  { name: "tag", build: (key) => ui.tag("api", { key }) },
  { name: "gauge", build: (key) => ui.gauge(0.2, { key }) },
  { name: "empty", build: (key) => ui.empty("No data", { key }) },
  { name: "errorDisplay", build: (key) => ui.errorDisplay("Failed", { key }) },
  { name: "callout", build: (key) => ui.callout("Saved", { key }) },
  { name: "sparkline", build: (key) => ui.sparkline([1, 2], { key }) },
  { name: "barChart", build: (key) => ui.barChart([{ label: "A", value: 1 }], { key }) },
  { name: "miniChart", build: (key) => ui.miniChart([{ label: "A", value: 1 }], { key }) },
  {
    name: "button shorthand",
    build: (key) => ui.button("save", "Save", { key }),
  },
  {
    name: "button object",
    build: (key) => ui.button({ id: "save", label: "Save", key }),
  },
  {
    name: "input shorthand",
    build: (key) => ui.input("query", "", { key }),
  },
  {
    name: "input object",
    build: (key) => ui.input({ id: "query", value: "", key }),
  },
  { name: "focusZone", build: (key) => ui.focusZone({ id: "zone", key }, []) },
  { name: "focusTrap", build: (key) => ui.focusTrap({ id: "trap", active: true, key }, []) },
  {
    name: "virtualList",
    build: (key) =>
      ui.virtualList({
        id: "list",
        key,
        items: [1],
        itemHeight: 1,
        renderItem: (item) => ui.text(String(item)),
      }),
  },
  { name: "layers", build: (key) => ui.layers({ key }, [ui.text("base")]) },
  { name: "modal", build: (key) => ui.modal({ id: "m", key, content: ui.text("x") }) },
  {
    name: "dropdown",
    build: (key) =>
      ui.dropdown({ id: "d", key, anchorId: "anchor", items: [{ id: "a", label: "A" }] }),
  },
  { name: "layer", build: (key) => ui.layer({ id: "layer", key, content: ui.text("x") }) },
  {
    name: "table",
    build: (key) =>
      ui.table({
        id: "table",
        key,
        columns: [{ key: "name", header: "Name" }],
        data: [{ id: "r1", name: "alpha" }],
        getRowKey: (row) => row.id,
      }),
  },
  {
    name: "tree",
    build: (key) =>
      ui.tree({
        id: "tree",
        key,
        data: { id: "root" },
        getKey: (node: { id: string }) => node.id,
        expanded: [],
        onToggle: noop,
        renderNode: (node: { id: string }) => ui.text(node.id),
      }),
  },
  {
    name: "field",
    build: (key) => ui.field({ key, label: "Name", children: ui.input("name", "") }),
  },
  {
    name: "select",
    build: (key) =>
      ui.select({
        id: "country",
        key,
        value: "us",
        options: [{ value: "us", label: "United States" }],
      }),
  },
  { name: "slider", build: (key) => ui.slider({ id: "volume", key, value: 5 }) },
  { name: "checkbox", build: (key) => ui.checkbox({ id: "remember", key, checked: true }) },
  {
    name: "radioGroup",
    build: (key) =>
      ui.radioGroup({
        id: "plan",
        key,
        value: "free",
        options: [{ value: "free", label: "Free" }],
      }),
  },
  {
    name: "commandPalette",
    build: (key) =>
      ui.commandPalette({
        id: "cp",
        key,
        open: true,
        query: "",
        sources: [{ id: "core", name: "Core", getItems: () => commandItems }],
        selectedIndex: 0,
        onQueryChange: noop,
        onSelect: noop,
        onClose: noop,
      }),
  },
  {
    name: "filePicker",
    build: (key) =>
      ui.filePicker({
        id: "picker",
        key,
        rootPath: "/",
        data: fileNode,
        expandedPaths: [],
        onSelect: noop,
        onToggle: noop,
        onOpen: noop,
      }),
  },
  {
    name: "fileTreeExplorer",
    build: (key) =>
      ui.fileTreeExplorer({
        id: "explorer",
        key,
        data: fileNode,
        expanded: [],
        onToggle: noop,
        onSelect: noop,
        onActivate: noop,
      }),
  },
  {
    name: "splitPane",
    build: (key) =>
      ui.splitPane(
        { id: "split", key, direction: "horizontal", sizes: [50, 50], onResize: noop },
        [],
      ),
  },
  {
    name: "panelGroup",
    build: (key) => ui.panelGroup({ id: "group", key, direction: "horizontal" }, []),
  },
  {
    name: "resizablePanel",
    build: (key) => ui.resizablePanel({ key }, []),
  },
  {
    name: "codeEditor",
    build: (key) =>
      ui.codeEditor({
        id: "editor",
        key,
        lines: ["x"],
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
    build: (key) =>
      ui.diffViewer({
        id: "diff",
        key,
        diff: diffData,
        mode: "unified",
        scrollTop: 0,
        onScroll: noop,
      }),
  },
  {
    name: "toolApprovalDialog",
    build: (key) =>
      ui.toolApprovalDialog({
        id: "approval",
        key,
        request: toolRequest,
        open: true,
        onAllow: noop,
        onDeny: noop,
        onClose: noop,
      }),
  },
  {
    name: "logsConsole",
    build: (key) => ui.logsConsole({ id: "logs", key, entries: [], scrollTop: 0, onScroll: noop }),
  },
  {
    name: "toastContainer",
    build: (key) => ui.toastContainer({ key, toasts: [], onDismiss: noop }),
  },
];

describe("vnode factory exhaustive", () => {
  for (const c of factoryCases) {
    test(`${c.name} returns ${c.expectedKind}`, () => {
      const vnode: VNode = c.build();
      assert.equal(vnode.kind, c.expectedKind);
      if (c.optionalAbsent !== undefined) {
        assert.equal(c.optionalAbsent in vnode.props, false);
      }
    });
  }
});

describe("vnode factory key forwarding", () => {
  for (const c of keyCases) {
    test(`${c.name} forwards key`, () => {
      const key = `k-${c.name.replace(/\s+/g, "-")}`;
      const vnode = c.build(key) as { props: { key?: string } };
      assert.equal(vnode.props.key, key);
    });
  }
});
