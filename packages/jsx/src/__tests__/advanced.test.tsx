/** @jsxImportSource @rezi-ui/jsx */

import {
  type CommandItem,
  type CursorPosition,
  type DiffData,
  type EditorSelection,
  type FileNode,
  type NodeState,
  ui,
} from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import {
  CodeEditor,
  CommandPalette,
  DiffViewer,
  FilePicker,
  FileTreeExplorer,
  LogsConsole,
  PanelGroup,
  ResizablePanel,
  SplitPane,
  Table,
  ToastContainer,
  ToolApprovalDialog,
  Tree,
  VirtualList,
} from "../index.js";

describe("advanced widgets", () => {
  test("Table, Tree, VirtualList map to matching VNodes", () => {
    const getRowKey = (row: { name: string }) => row.name;
    const table = (
      <Table
        id="files"
        columns={[{ key: "name", header: "Name" }]}
        data={[{ name: "a.txt" }]}
        getRowKey={getRowKey}
      />
    );
    assert.deepEqual(
      table,
      ui.table({
        id: "files",
        columns: [{ key: "name", header: "Name" }],
        data: [{ name: "a.txt" }],
        getRowKey,
      }),
    );

    const renderNode = (node: { id: string }, _depth: number, _state: NodeState) =>
      ui.text(node.id);
    const getKey = (node: { id: string }) => node.id;
    const onToggle = () => {};
    const tree = (
      <Tree
        id="tree"
        data={[{ id: "root" }]}
        getKey={getKey}
        expanded={[]}
        onToggle={onToggle}
        renderNode={renderNode}
      />
    );
    assert.deepEqual(
      tree,
      ui.tree({
        id: "tree",
        data: [{ id: "root" }],
        getKey,
        expanded: [],
        onToggle,
        renderNode,
      }),
    );

    const renderItem = (item: string) => ui.text(item);
    const renderVirtualItem = (item: string) => renderItem(item);
    const list = (
      <VirtualList id="list" items={["a", "b"]} itemHeight={1} renderItem={renderVirtualItem} />
    );
    assert.deepEqual(
      list,
      ui.virtualList({
        id: "list",
        items: ["a", "b"],
        itemHeight: 1,
        renderItem: renderVirtualItem,
      }),
    );
  });

  test("SplitPane, PanelGroup, ResizablePanel map to matching VNodes", () => {
    const onResize = () => {};
    const split = (
      <SplitPane id="split" direction="horizontal" sizes={[50, 50]} onResize={onResize}>
        <ResizablePanel defaultSize={30}>
          <ResizablePanel defaultSize={100} />
        </ResizablePanel>
      </SplitPane>
    );

    assert.deepEqual(
      split,
      ui.splitPane({ id: "split", direction: "horizontal", sizes: [50, 50], onResize }, [
        ui.resizablePanel({ defaultSize: 30 }, [ui.resizablePanel({ defaultSize: 100 }, [])]),
      ]),
    );

    const panels = (
      <PanelGroup id="pg" direction="vertical">
        <ResizablePanel defaultSize={40} />
        <ResizablePanel defaultSize={60} />
      </PanelGroup>
    );
    assert.deepEqual(
      panels,
      ui.panelGroup({ id: "pg", direction: "vertical" }, [
        ui.resizablePanel({ defaultSize: 40 }, []),
        ui.resizablePanel({ defaultSize: 60 }, []),
      ]),
    );
  });

  test("SplitPane normalizes primitive children in nested panels", () => {
    const onResize = () => {};
    const vnode = (
      <SplitPane id="split-primitive" direction="horizontal" sizes={[100]} onResize={onResize}>
        <ResizablePanel defaultSize={100}>{1}</ResizablePanel>
      </SplitPane>
    );

    assert.deepEqual(
      vnode,
      ui.splitPane({ id: "split-primitive", direction: "horizontal", sizes: [100], onResize }, [
        ui.resizablePanel({ defaultSize: 100 }, [ui.text("1")]),
      ]),
    );
  });

  test("editor and diff widgets map to matching VNodes", () => {
    const cursor: CursorPosition = { line: 0, column: 0 };
    const selection: EditorSelection | null = null;
    const onEditorChange = () => {};
    const onSelectionChange = () => {};
    const onEditorScroll = () => {};

    const editor = (
      <CodeEditor
        id="editor"
        lines={["hello"]}
        cursor={cursor}
        selection={selection}
        scrollTop={0}
        scrollLeft={0}
        onChange={onEditorChange}
        onSelectionChange={onSelectionChange}
        onScroll={onEditorScroll}
      />
    );

    assert.deepEqual(
      editor,
      ui.codeEditor({
        id: "editor",
        lines: ["hello"],
        cursor,
        selection,
        scrollTop: 0,
        scrollLeft: 0,
        onChange: onEditorChange,
        onSelectionChange,
        onScroll: onEditorScroll,
      }),
    );

    const diff: DiffData = {
      oldPath: "a.txt",
      newPath: "a.txt",
      status: "modified",
      hunks: [{ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1, lines: [] }],
    };

    const onDiffScroll = () => {};
    const viewer = (
      <DiffViewer id="diff" diff={diff} mode="unified" scrollTop={0} onScroll={onDiffScroll} />
    );
    assert.deepEqual(
      viewer,
      ui.diffViewer({ id: "diff", diff, mode: "unified", scrollTop: 0, onScroll: onDiffScroll }),
    );
  });

  test("tooling widgets map to matching VNodes", () => {
    const cmdSources = [
      {
        id: "cmds",
        name: "Commands",
        getItems: async (_query: string): Promise<readonly CommandItem[]> => [],
      },
    ] as const;
    const onQueryChange = () => {};
    const onCommandSelect = () => {};
    const onPaletteClose = () => {};

    const palette = (
      <CommandPalette
        id="cmd"
        open
        query=""
        sources={cmdSources}
        selectedIndex={0}
        width={72}
        maxVisible={8}
        onQueryChange={onQueryChange}
        onSelect={onCommandSelect}
        onClose={onPaletteClose}
      />
    );
    assert.deepEqual(
      palette,
      ui.commandPalette({
        id: "cmd",
        open: true,
        query: "",
        sources: cmdSources,
        selectedIndex: 0,
        width: 72,
        maxVisible: 8,
        onQueryChange,
        onSelect: onCommandSelect,
        onClose: onPaletteClose,
      }),
    );

    const rootNode: FileNode = { name: "src", path: "/src", type: "directory", children: [] };
    const onPickerSelect = () => {};
    const onPickerToggle = () => {};
    const onPickerOpen = () => {};
    const picker = (
      <FilePicker
        id="picker"
        rootPath="/"
        data={rootNode}
        expandedPaths={[]}
        onSelect={onPickerSelect}
        onToggle={onPickerToggle}
        onOpen={onPickerOpen}
      />
    );
    assert.deepEqual(
      picker,
      ui.filePicker({
        id: "picker",
        rootPath: "/",
        data: rootNode,
        expandedPaths: [],
        onSelect: onPickerSelect,
        onToggle: onPickerToggle,
        onOpen: onPickerOpen,
      }),
    );

    const onExplorerToggle = () => {};
    const onExplorerSelect = () => {};
    const onExplorerActivate = () => {};
    const explorer = (
      <FileTreeExplorer
        id="explorer"
        data={rootNode}
        expanded={[]}
        onToggle={onExplorerToggle}
        onSelect={onExplorerSelect}
        onActivate={onExplorerActivate}
      />
    );
    assert.deepEqual(
      explorer,
      ui.fileTreeExplorer({
        id: "explorer",
        data: rootNode,
        expanded: [],
        onToggle: onExplorerToggle,
        onSelect: onExplorerSelect,
        onActivate: onExplorerActivate,
      }),
    );

    const onAllow = () => {};
    const onDeny = () => {};
    const onApprovalClose = () => {};
    const approval = (
      <ToolApprovalDialog
        id="approval"
        open
        request={{ toolId: "run", toolName: "run", riskLevel: "low" }}
        width={54}
        height={16}
        onAllow={onAllow}
        onDeny={onDeny}
        onClose={onApprovalClose}
      />
    );
    assert.deepEqual(
      approval,
      ui.toolApprovalDialog({
        id: "approval",
        open: true,
        request: { toolId: "run", toolName: "run", riskLevel: "low" },
        width: 54,
        height: 16,
        onAllow,
        onDeny,
        onClose: onApprovalClose,
      }),
    );

    const onLogsScroll = () => {};
    const logs = <LogsConsole id="logs" entries={[]} scrollTop={0} onScroll={onLogsScroll} />;
    assert.deepEqual(
      logs,
      ui.logsConsole({ id: "logs", entries: [], scrollTop: 0, onScroll: onLogsScroll }),
    );

    const onDismiss = () => {};
    const toasts = (
      <ToastContainer
        toasts={[{ id: "1", message: "Saved", type: "success" }]}
        width={48}
        maxVisible={3}
        onDismiss={onDismiss}
      />
    );
    assert.deepEqual(
      toasts,
      ui.toastContainer({
        toasts: [{ id: "1", message: "Saved", type: "success" }],
        width: 48,
        maxVisible: 3,
        onDismiss,
      }),
    );
  });
});
