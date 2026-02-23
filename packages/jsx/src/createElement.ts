import type { VNode } from "@rezi-ui/core";
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
} from "./components.js";
import type { ComponentFunction, JsxElementType, ReziIntrinsicElementName } from "./types.js";

type IntrinsicFactory = (props: Record<string, unknown>) => VNode;

function asIntrinsic(component: ComponentFunction): IntrinsicFactory {
  return component as unknown as IntrinsicFactory;
}

const intrinsicFactories: Readonly<Record<ReziIntrinsicElementName, IntrinsicFactory>> =
  Object.freeze({
    box: asIntrinsic(Box),
    row: asIntrinsic(Row),
    column: asIntrinsic(Column),
    grid: asIntrinsic(Grid),
    hstack: asIntrinsic(HStack),
    vstack: asIntrinsic(VStack),
    spacedVStack: asIntrinsic(SpacedVStack),
    spacedHStack: asIntrinsic(SpacedHStack),
    layers: asIntrinsic(Layers),
    focusZone: asIntrinsic(FocusZone),
    focusTrap: asIntrinsic(FocusTrap),
    splitPane: asIntrinsic(SplitPane),
    panelGroup: asIntrinsic(PanelGroup),
    resizablePanel: asIntrinsic(ResizablePanel),
    panel: asIntrinsic(Panel),
    form: asIntrinsic(Form),
    actions: asIntrinsic(Actions),
    center: asIntrinsic(Center),
    page: asIntrinsic(Page),
    appShell: asIntrinsic(AppShell),
    card: asIntrinsic(Card),
    toolbar: asIntrinsic(Toolbar),
    statusBar: asIntrinsic(StatusBar),
    header: asIntrinsic(Header),
    sidebar: asIntrinsic(Sidebar),
    masterDetail: asIntrinsic(MasterDetail),
    text: asIntrinsic(Text),
    field: asIntrinsic(Field),
    spacer: asIntrinsic(Spacer),
    divider: asIntrinsic(Divider),
    icon: asIntrinsic(Icon),
    spinner: asIntrinsic(Spinner),
    progress: asIntrinsic(Progress),
    skeleton: asIntrinsic(Skeleton),
    richText: asIntrinsic(RichText),
    kbd: asIntrinsic(Kbd),
    badge: asIntrinsic(Badge),
    status: asIntrinsic(Status),
    tag: asIntrinsic(Tag),
    gauge: asIntrinsic(Gauge),
    empty: asIntrinsic(Empty),
    errorDisplay: asIntrinsic(ErrorDisplay),
    errorBoundary: asIntrinsic(ErrorBoundary),
    callout: asIntrinsic(Callout),
    link: asIntrinsic(Link),
    canvas: asIntrinsic(Canvas),
    image: asIntrinsic(Image),
    lineChart: asIntrinsic(LineChart),
    scatter: asIntrinsic(Scatter),
    heatmap: asIntrinsic(Heatmap),
    sparkline: asIntrinsic(Sparkline),
    barChart: asIntrinsic(BarChart),
    miniChart: asIntrinsic(MiniChart),
    button: asIntrinsic(Button),
    input: asIntrinsic(Input),
    textarea: asIntrinsic(Textarea),
    slider: asIntrinsic(Slider),
    virtualList: asIntrinsic(VirtualList),
    dialog: asIntrinsic(Dialog),
    modal: asIntrinsic(Modal),
    dropdown: asIntrinsic(Dropdown),
    layer: asIntrinsic(Layer),
    table: asIntrinsic(Table),
    tree: asIntrinsic(Tree),
    select: asIntrinsic(Select),
    checkbox: asIntrinsic(Checkbox),
    radioGroup: asIntrinsic(RadioGroup),
    tabs: asIntrinsic(Tabs),
    accordion: asIntrinsic(Accordion),
    breadcrumb: asIntrinsic(Breadcrumb),
    pagination: asIntrinsic(Pagination),
    focusAnnouncer: asIntrinsic(FocusAnnouncer),
    keybindingHelp: asIntrinsic(KeybindingHelp),
    routerBreadcrumb: asIntrinsic(RouterBreadcrumb),
    routerTabs: asIntrinsic(RouterTabs),
    commandPalette: asIntrinsic(CommandPalette),
    filePicker: asIntrinsic(FilePicker),
    fileTreeExplorer: asIntrinsic(FileTreeExplorer),
    codeEditor: asIntrinsic(CodeEditor),
    diffViewer: asIntrinsic(DiffViewer),
    toolApprovalDialog: asIntrinsic(ToolApprovalDialog),
    logsConsole: asIntrinsic(LogsConsole),
    toastContainer: asIntrinsic(ToastContainer),
    fragment: asIntrinsic(Fragment),
  });

function isIntrinsicElementName(value: string): value is ReziIntrinsicElementName {
  return Object.hasOwn(intrinsicFactories, value);
}

function normalizeProps(
  props: Readonly<Record<string, unknown>> | null | undefined,
  key: string | undefined,
): Record<string, unknown> {
  if (props === null || props === undefined) {
    return key === undefined ? {} : { key };
  }

  if (key === undefined) {
    return { ...props };
  }

  return { ...props, key };
}

/**
 * Create a Rezi VNode from JSX runtime inputs.
 */
export function createElement(
  type: JsxElementType,
  props: Readonly<Record<string, unknown>> | null,
  key?: string,
): VNode {
  const normalizedProps = normalizeProps(props, key);

  if (typeof type === "function") {
    return (type as (props: Record<string, unknown>) => VNode)(normalizedProps);
  }

  if (!isIntrinsicElementName(type)) {
    throw new Error(`Unknown JSX element type: ${type}`);
  }

  return intrinsicFactories[type](normalizedProps);
}

/**
 * Classic JSX factory function alias.
 */
export const h = createElement;
