import type { VNode } from "@rezi-ui/core";
import {
  Accordion,
  Badge,
  BarChart,
  Box,
  Breadcrumb,
  Button,
  Callout,
  Canvas,
  Checkbox,
  CodeEditor,
  Column,
  CommandPalette,
  DiffViewer,
  Divider,
  Dropdown,
  Empty,
  ErrorDisplay,
  Field,
  FilePicker,
  FileTreeExplorer,
  FocusTrap,
  FocusZone,
  Fragment,
  Gauge,
  Grid,
  HStack,
  Heatmap,
  Icon,
  Image,
  Input,
  Kbd,
  Layer,
  Layers,
  LineChart,
  Link,
  LogsConsole,
  MiniChart,
  Modal,
  Pagination,
  PanelGroup,
  Progress,
  RadioGroup,
  ResizablePanel,
  RichText,
  Row,
  Scatter,
  Select,
  Skeleton,
  Slider,
  Spacer,
  Sparkline,
  Spinner,
  SplitPane,
  Status,
  Table,
  Tabs,
  Tag,
  Text,
  ToastContainer,
  ToolApprovalDialog,
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
    layers: asIntrinsic(Layers),
    focusZone: asIntrinsic(FocusZone),
    focusTrap: asIntrinsic(FocusTrap),
    splitPane: asIntrinsic(SplitPane),
    panelGroup: asIntrinsic(PanelGroup),
    resizablePanel: asIntrinsic(ResizablePanel),
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
    slider: asIntrinsic(Slider),
    virtualList: asIntrinsic(VirtualList),
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
