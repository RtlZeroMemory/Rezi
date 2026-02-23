/** @jsxImportSource @rezi-ui/jsx */

import type {
  NodeState,
  RegisteredBinding,
  RouteDefinition,
  RouterApi,
  VNode,
} from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import {
  Accordion,
  Actions,
  AppShell,
  Badge,
  BarChart,
  Box,
  Breadcrumb,
  Button,
  Callout,
  Canvas,
  Card,
  Center,
  Checkbox,
  CodeEditor,
  Column,
  CommandPalette,
  Dialog,
  DiffViewer,
  Divider,
  Dropdown,
  Empty,
  ErrorBoundary,
  ErrorDisplay,
  Field,
  FilePicker,
  FileTreeExplorer,
  FocusAnnouncer,
  FocusTrap,
  FocusZone,
  Form,
  Fragment,
  Gauge,
  Grid,
  HStack,
  Header,
  Heatmap,
  Icon,
  Image,
  Input,
  Kbd,
  KeybindingHelp,
  Layer,
  Layers,
  LineChart,
  Link,
  LogsConsole,
  MasterDetail,
  MiniChart,
  Modal,
  Page,
  Pagination,
  Panel,
  PanelGroup,
  Progress,
  RadioGroup,
  ResizablePanel,
  RichText,
  RouterBreadcrumb,
  RouterTabs,
  Row,
  Scatter,
  Select,
  Sidebar,
  Skeleton,
  Slider,
  SpacedHStack,
  SpacedVStack,
  Spacer,
  Sparkline,
  Spinner,
  SplitPane,
  Status,
  StatusBar,
  Table,
  Tabs,
  Tag,
  Text,
  Textarea,
  ToastContainer,
  ToolApprovalDialog,
  Toolbar,
  Tree,
  VStack,
  VirtualList,
} from "../index.js";

function replaceFunctions(value: unknown): unknown {
  if (typeof value === "function") {
    return "[function]";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceFunctions(entry));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = replaceFunctions(v);
    }
    return out;
  }
  return value;
}

describe("jsx-ui parity", () => {
  test("layout and composition components match ui.*", () => {
    assert.deepEqual(
      <Box border="rounded" p={1}>
        <Text>a</Text>
      </Box>,
      ui.box({ border: "rounded", p: 1 }, [ui.text("a")]),
    );
    assert.deepEqual(
      <Row gap={1}>
        <Text>a</Text>
      </Row>,
      ui.row({ gap: 1 }, [ui.text("a")]),
    );
    assert.deepEqual(
      <Column gap={1}>
        <Text>a</Text>
      </Column>,
      ui.column({ gap: 1 }, [ui.text("a")]),
    );
    assert.deepEqual(
      <Grid columns={2}>
        <Text>a</Text>
        <Text>b</Text>
      </Grid>,
      ui.grid({ columns: 2 }, ui.text("a"), ui.text("b")),
    );
    assert.deepEqual(
      <HStack>
        <Text>a</Text>
        <Text>b</Text>
      </HStack>,
      ui.hstack({}, [ui.text("a"), ui.text("b")]),
    );
    assert.deepEqual(
      <VStack>
        <Text>a</Text>
      </VStack>,
      ui.vstack({}, [ui.text("a")]),
    );
    assert.deepEqual(
      <SpacedVStack gap={2}>
        <Text>a</Text>
      </SpacedVStack>,
      ui.spacedVStack(2, [ui.text("a")]),
    );
    assert.deepEqual(
      <SpacedHStack gap={2}>
        <Text>a</Text>
      </SpacedHStack>,
      ui.spacedHStack(2, [ui.text("a")]),
    );
    assert.deepEqual(
      <Layers>
        <Text>a</Text>
      </Layers>,
      ui.layers({}, [ui.text("a")]),
    );
    assert.deepEqual(
      <FocusZone id="fz">
        <Text>a</Text>
      </FocusZone>,
      ui.focusZone({ id: "fz" }, [ui.text("a")]),
    );
    assert.deepEqual(
      <FocusTrap id="ft" active>
        <Text>a</Text>
      </FocusTrap>,
      ui.focusTrap({ id: "ft", active: true }, [ui.text("a")]),
    );

    const onResize = () => {};
    assert.deepEqual(
      <SplitPane id="split" direction="horizontal" sizes={[100]} onResize={onResize}>
        <ResizablePanel defaultSize={100}>
          <Text>a</Text>
        </ResizablePanel>
      </SplitPane>,
      ui.splitPane({ id: "split", direction: "horizontal", sizes: [100], onResize }, [
        ui.resizablePanel({ defaultSize: 100 }, [ui.text("a")]),
      ]),
    );

    assert.deepEqual(
      <PanelGroup id="group" direction="horizontal">
        <ResizablePanel defaultSize={30}>
          <Text>a</Text>
        </ResizablePanel>
      </PanelGroup>,
      ui.panelGroup({ id: "group", direction: "horizontal" }, [
        ui.resizablePanel({ defaultSize: 30 }, [ui.text("a")]),
      ]),
    );

    assert.deepEqual(
      <Panel title="Panel">
        <Text>a</Text>
      </Panel>,
      ui.panel({ title: "Panel" }, [ui.text("a")]),
    );
    assert.deepEqual(
      <Form gap={2}>
        <Text>a</Text>
      </Form>,
      ui.form({ gap: 2 }, [ui.text("a")]),
    );
    assert.deepEqual(
      <Actions>
        <Button id="ok" label="OK" />
      </Actions>,
      ui.actions({}, [ui.button({ id: "ok", label: "OK" })]),
    );
    assert.deepEqual(
      <Center>
        <Text>a</Text>
      </Center>,
      ui.center(ui.text("a"), {}),
    );
    assert.deepEqual(<Page body={<Text>a</Text>} />, ui.page({ body: ui.text("a") }));

    assert.deepEqual(
      <AppShell header={<Text>h</Text>} body={<Text>b</Text>} footer={<Text>f</Text>} />,
      ui.appShell({ header: ui.text("h"), body: ui.text("b"), footer: ui.text("f") }),
    );

    assert.deepEqual(
      <Card title="Card">
        <Text>a</Text>
      </Card>,
      ui.card({ title: "Card" }, [ui.text("a")]),
    );
    assert.deepEqual(
      <Toolbar>
        <Button id="ok" label="OK" />
      </Toolbar>,
      ui.toolbar({}, [ui.button({ id: "ok", label: "OK" })]),
    );
    assert.deepEqual(
      <StatusBar left={[<Text key="l">L</Text>]} right={[<Text key="r">R</Text>]} />,
      ui.statusBar({ left: [ui.text("L", { key: "l" })], right: [ui.text("R", { key: "r" })] }),
    );
    assert.deepEqual(<Header title="H" subtitle="S" />, ui.header({ title: "H", subtitle: "S" }));
    assert.deepEqual(
      replaceFunctions(<Sidebar items={[{ id: "one", label: "One" }]} selected="one" />),
      replaceFunctions(ui.sidebar({ items: [{ id: "one", label: "One" }], selected: "one" })),
    );
    assert.deepEqual(
      <MasterDetail master={<Text>m</Text>} detail={<Text>d</Text>} />,
      ui.masterDetail({ master: ui.text("m"), detail: ui.text("d") }),
    );
  });

  test("display and leaf components match ui.*", () => {
    assert.deepEqual(
      <Text variant="heading">hello</Text>,
      ui.text("hello", { variant: "heading" }),
    );
    assert.deepEqual(
      <Field label="Name">
        <Input id="name" value="" />
      </Field>,
      ui.field({ label: "Name", children: ui.input({ id: "name", value: "" }) }),
    );
    assert.deepEqual(<Spacer size={2} />, ui.spacer({ size: 2 }));
    assert.deepEqual(<Divider char="-" />, ui.divider({ char: "-" }));
    assert.deepEqual(<Icon icon="status.check" />, ui.icon("status.check"));
    assert.deepEqual(<Spinner variant="dots" />, ui.spinner({ variant: "dots" }));
    assert.deepEqual(<Progress value={0.5} />, ui.progress(0.5));
    assert.deepEqual(<Skeleton width={10} />, ui.skeleton(10));
    assert.deepEqual(<RichText spans={[{ text: "hi" }]} />, ui.richText([{ text: "hi" }]));
    assert.deepEqual(<Kbd keys="ctrl+s" />, ui.kbd("ctrl+s"));
    assert.deepEqual(<Badge text="New" />, ui.badge("New"));
    assert.deepEqual(<Status status="online" />, ui.status("online"));
    assert.deepEqual(<Tag text="alpha" />, ui.tag("alpha"));
    assert.deepEqual(<Gauge value={0.4} />, ui.gauge(0.4));
    assert.deepEqual(<Empty title="Nothing" />, ui.empty("Nothing"));
    assert.deepEqual(<ErrorDisplay message="Boom" />, ui.errorDisplay("Boom"));

    const fallback = () => ui.text("fallback");
    assert.deepEqual(
      <ErrorBoundary fallback={fallback}>
        <Text>risky</Text>
      </ErrorBoundary>,
      ui.errorBoundary({ children: ui.text("risky"), fallback }),
    );

    assert.deepEqual(
      <Callout message="Heads up" variant="info" />,
      ui.callout("Heads up", { variant: "info" }),
    );
    assert.deepEqual(
      <Link url="https://example.com" label="Docs" />,
      ui.link({ url: "https://example.com", label: "Docs" }),
    );

    const draw = () => {};
    assert.deepEqual(
      <Canvas width={10} height={4} draw={draw} />,
      ui.canvas({ width: 10, height: 4, draw }),
    );
    assert.deepEqual(
      <Image src={new Uint8Array([1, 2])} width={2} height={1} />,
      ui.image({ src: new Uint8Array([1, 2]), width: 2, height: 1 }),
    );
    assert.deepEqual(
      <LineChart width={10} height={4} series={[{ data: [1, 2], color: "green" }]} />,
      ui.lineChart({ width: 10, height: 4, series: [{ data: [1, 2], color: "green" }] }),
    );
    assert.deepEqual(
      <Scatter width={10} height={4} points={[{ x: 1, y: 2 }]} />,
      ui.scatter({ width: 10, height: 4, points: [{ x: 1, y: 2 }] }),
    );
    assert.deepEqual(
      <Heatmap width={10} height={4} data={[[1, 2]]} />,
      ui.heatmap({ width: 10, height: 4, data: [[1, 2]] }),
    );
    assert.deepEqual(<Sparkline data={[1, 2, 3]} />, ui.sparkline([1, 2, 3]));
    assert.deepEqual(
      <BarChart data={[{ label: "A", value: 1 }]} />,
      ui.barChart([{ label: "A", value: 1 }]),
    );
    assert.deepEqual(
      <MiniChart values={[{ label: "A", value: 1 }]} />,
      ui.miniChart([{ label: "A", value: 1 }]),
    );
  });

  test("interactive, data, routing, and advanced components match ui.*", () => {
    assert.deepEqual(
      <Button id="x" label="OK" intent="primary" />,
      ui.button({ id: "x", label: "OK", intent: "primary" }),
    );
    assert.deepEqual(<Input id="name" value="Alice" />, ui.input({ id: "name", value: "Alice" }));
    assert.deepEqual(
      <Textarea id="notes" value="hello" />,
      ui.textarea({ id: "notes", value: "hello" }),
    );
    const onSliderChange = () => {};
    assert.deepEqual(
      <Slider id="s" value={10} onChange={onSliderChange} />,
      ui.slider({ id: "s", value: 10, onChange: onSliderChange }),
    );

    const renderItem = (value: string): VNode => ui.text(value);
    assert.deepEqual(
      <VirtualList id="list" items={["a"]} renderItem={renderItem} />,
      ui.virtualList({ id: "list", items: ["a"], renderItem }),
    );

    const onConfirm = () => {};
    assert.deepEqual(
      <Dialog
        id="d"
        title="Confirm"
        message="Proceed"
        actions={[{ label: "OK", intent: "primary", onPress: onConfirm }]}
      />,
      ui.dialog({
        id: "d",
        title: "Confirm",
        message: "Proceed",
        actions: [{ label: "OK", intent: "primary", onPress: onConfirm }],
      }),
    );
    assert.deepEqual(
      <Modal id="m" content={<Text>Body</Text>} />,
      ui.modal({ id: "m", content: ui.text("Body") }),
    );
    assert.deepEqual(
      <Dropdown id="dd" anchorId="anchor" items={[{ id: "one", label: "One" }]} />,
      ui.dropdown({ id: "dd", anchorId: "anchor", items: [{ id: "one", label: "One" }] }),
    );
    assert.deepEqual(
      <Layer id="layer" content={<Text>x</Text>} />,
      ui.layer({ id: "layer", content: ui.text("x") }),
    );

    const getRowKey = (row: { id: string }) => row.id;
    assert.deepEqual(
      <Table
        id="tbl"
        columns={[{ key: "id", header: "ID" }]}
        data={[{ id: "1" }]}
        getRowKey={getRowKey}
      />,
      ui.table({
        id: "tbl",
        columns: [{ key: "id", header: "ID" }],
        data: [{ id: "1" }],
        getRowKey,
      }),
    );

    const renderNode = (_node: { id: string }, _depth: number, _state: NodeState): VNode =>
      ui.text("node");
    const onToggle = () => {};
    const getKey = (node: { id: string }) => node.id;
    assert.deepEqual(
      <Tree
        id="tree"
        data={[{ id: "root" }]}
        getKey={getKey}
        expanded={[]}
        onToggle={onToggle}
        renderNode={renderNode}
      />,
      ui.tree({ id: "tree", data: [{ id: "root" }], getKey, expanded: [], onToggle, renderNode }),
    );

    assert.deepEqual(
      <Select id="sel" value="a" options={[{ value: "a", label: "A" }]} />,
      ui.select({ id: "sel", value: "a", options: [{ value: "a", label: "A" }] }),
    );
    assert.deepEqual(
      <Checkbox id="chk" checked label="Check" />,
      ui.checkbox({ id: "chk", checked: true, label: "Check" }),
    );
    assert.deepEqual(
      <RadioGroup id="rg" value="a" options={[{ value: "a", label: "A" }]} />,
      ui.radioGroup({ id: "rg", value: "a", options: [{ value: "a", label: "A" }] }),
    );

    const onTabChange = () => {};
    assert.deepEqual(
      replaceFunctions(
        <Tabs
          id="tabs"
          tabs={[{ key: "one", label: "One", content: <Text>1</Text> }]}
          activeTab="one"
          onChange={onTabChange}
        />,
      ),
      replaceFunctions(
        ui.tabs({
          id: "tabs",
          tabs: [{ key: "one", label: "One", content: ui.text("1") }],
          activeTab: "one",
          onChange: onTabChange,
        }),
      ),
    );

    const onAccordionChange = () => {};
    assert.deepEqual(
      replaceFunctions(
        <Accordion
          id="acc"
          items={[{ key: "one", title: "One", content: <Text>1</Text> }]}
          expanded={[]}
          onChange={onAccordionChange}
        />,
      ),
      replaceFunctions(
        ui.accordion({
          id: "acc",
          items: [{ key: "one", title: "One", content: ui.text("1") }],
          expanded: [],
          onChange: onAccordionChange,
        }),
      ),
    );

    assert.deepEqual(
      replaceFunctions(<Breadcrumb items={[{ label: "Home" }, { label: "Settings" }]} />),
      replaceFunctions(ui.breadcrumb({ items: [{ label: "Home" }, { label: "Settings" }] })),
    );

    const onPageChange = () => {};
    assert.deepEqual(
      replaceFunctions(<Pagination id="p" page={1} totalPages={3} onChange={onPageChange} />),
      replaceFunctions(ui.pagination({ id: "p", page: 1, totalPages: 3, onChange: onPageChange })),
    );

    assert.deepEqual(<FocusAnnouncer emptyText="None" />, ui.focusAnnouncer({ emptyText: "None" }));

    const bindings: readonly RegisteredBinding[] = [
      { sequence: "ctrl+s", mode: "default", description: "Save" },
    ];
    assert.deepEqual(
      <KeybindingHelp bindings={bindings} title="Keys" />,
      ui.keybindingHelp(bindings, { title: "Keys" }),
    );

    const routes: readonly RouteDefinition<unknown>[] = [
      { id: "home", title: "Home", screen: () => ui.text("home") },
      { id: "settings", title: "Settings", screen: () => ui.text("settings") },
    ];

    const router: RouterApi = {
      navigate: () => {},
      replace: () => {},
      back: () => {},
      currentRoute: () => ({ id: "home", params: {} }),
      canGoBack: () => false,
      history: () => [{ id: "home", params: {} }],
    };

    assert.deepEqual(
      replaceFunctions(<RouterBreadcrumb router={router} routes={routes} />),
      replaceFunctions(ui.routerBreadcrumb(router, routes, {})),
    );
    assert.deepEqual(
      replaceFunctions(<RouterTabs router={router} routes={routes} />),
      replaceFunctions(ui.routerTabs(router, routes, {})),
    );

    const onQueryChange = () => {};
    const onCommandSelect = () => {};
    const onPaletteClose = () => {};
    const commandSources = [{ id: "s", name: "Source", getItems: async () => [] }] as const;
    assert.deepEqual(
      <CommandPalette
        id="cmd"
        open
        query=""
        sources={commandSources}
        selectedIndex={0}
        onQueryChange={onQueryChange}
        onSelect={onCommandSelect}
        onClose={onPaletteClose}
      />,
      ui.commandPalette({
        id: "cmd",
        open: true,
        query: "",
        sources: commandSources,
        selectedIndex: 0,
        onQueryChange,
        onSelect: onCommandSelect,
        onClose: onPaletteClose,
      }),
    );

    const pickerRoot = {
      name: "src",
      path: "/src",
      type: "directory" as const,
      children: [] as const,
    };
    const onPickerSelect = () => {};
    const onPickerToggle = () => {};
    const onPickerOpen = () => {};
    assert.deepEqual(
      <FilePicker
        id="picker"
        rootPath="/"
        data={pickerRoot}
        expandedPaths={[]}
        onSelect={onPickerSelect}
        onToggle={onPickerToggle}
        onOpen={onPickerOpen}
      />,
      ui.filePicker({
        id: "picker",
        rootPath: "/",
        data: pickerRoot,
        expandedPaths: [],
        onSelect: onPickerSelect,
        onToggle: onPickerToggle,
        onOpen: onPickerOpen,
      }),
    );

    const onExplorerToggle = () => {};
    const onExplorerSelect = () => {};
    const onExplorerActivate = () => {};
    assert.deepEqual(
      <FileTreeExplorer
        id="explorer"
        data={pickerRoot}
        expanded={[]}
        onToggle={onExplorerToggle}
        onSelect={onExplorerSelect}
        onActivate={onExplorerActivate}
      />,
      ui.fileTreeExplorer({
        id: "explorer",
        data: pickerRoot,
        expanded: [],
        onToggle: onExplorerToggle,
        onSelect: onExplorerSelect,
        onActivate: onExplorerActivate,
      }),
    );

    const cursor = { line: 0, column: 0 };
    const onEditorChange = () => {};
    const onSelectionChange = () => {};
    const onEditorScroll = () => {};
    assert.deepEqual(
      <CodeEditor
        id="editor"
        lines={["line"]}
        cursor={cursor}
        selection={null}
        scrollTop={0}
        scrollLeft={0}
        onChange={onEditorChange}
        onSelectionChange={onSelectionChange}
        onScroll={onEditorScroll}
      />,
      ui.codeEditor({
        id: "editor",
        lines: ["line"],
        cursor,
        selection: null,
        scrollTop: 0,
        scrollLeft: 0,
        onChange: onEditorChange,
        onSelectionChange,
        onScroll: onEditorScroll,
      }),
    );

    const onDiffScroll = () => {};
    assert.deepEqual(
      <DiffViewer
        id="diff"
        diff={{ oldPath: "a", newPath: "a", status: "modified", hunks: [] }}
        mode="unified"
        scrollTop={0}
        onScroll={onDiffScroll}
      />,
      ui.diffViewer({
        id: "diff",
        diff: { oldPath: "a", newPath: "a", status: "modified", hunks: [] },
        mode: "unified",
        scrollTop: 0,
        onScroll: onDiffScroll,
      }),
    );

    const onAllow = () => {};
    const onDeny = () => {};
    const onClose = () => {};
    assert.deepEqual(
      <ToolApprovalDialog
        id="approval"
        request={{ toolId: "tool", toolName: "tool", riskLevel: "low" }}
        open
        onAllow={onAllow}
        onDeny={onDeny}
        onClose={onClose}
      />,
      ui.toolApprovalDialog({
        id: "approval",
        request: { toolId: "tool", toolName: "tool", riskLevel: "low" },
        open: true,
        onAllow,
        onDeny,
        onClose,
      }),
    );

    const onLogsScroll = () => {};
    assert.deepEqual(
      <LogsConsole id="logs" entries={[]} scrollTop={0} onScroll={onLogsScroll} />,
      ui.logsConsole({ id: "logs", entries: [], scrollTop: 0, onScroll: onLogsScroll }),
    );

    const onDismiss = () => {};
    assert.deepEqual(
      <ToastContainer
        toasts={[{ id: "t1", message: "Saved", type: "success" }]}
        onDismiss={onDismiss}
      />,
      ui.toastContainer({ toasts: [{ id: "t1", message: "Saved", type: "success" }], onDismiss }),
    );

    assert.deepEqual(
      <Fragment>
        <Text>a</Text>
        <Text>b</Text>
      </Fragment>,
      ui.column({ gap: 0 }, [ui.text("a"), ui.text("b")]),
    );
  });
});
