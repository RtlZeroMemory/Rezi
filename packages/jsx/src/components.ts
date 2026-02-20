import type {
  AccordionProps,
  BadgeProps,
  BarChartProps,
  BoxProps,
  BreadcrumbProps,
  ButtonProps,
  CalloutProps,
  CheckboxProps,
  CodeEditorProps,
  CommandPaletteProps,
  DiffViewerProps,
  DividerProps,
  DropdownProps,
  EmptyProps,
  ErrorDisplayProps,
  FieldProps,
  FilePickerProps,
  FileTreeExplorerProps,
  GaugeProps,
  IconProps,
  InputProps,
  KbdProps,
  LayerProps,
  LayersProps,
  LogsConsoleProps,
  MiniChartProps,
  ModalProps,
  PaginationProps,
  PanelGroupProps,
  ProgressProps,
  RadioGroupProps,
  ResizablePanelProps,
  RichTextProps,
  SelectProps,
  SkeletonProps,
  SliderProps,
  SpacerProps,
  SparklineProps,
  SpinnerProps,
  SplitPaneProps,
  StatusProps,
  TableProps,
  TabsProps,
  TagProps,
  TextProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  TreeProps,
  VNode,
  VirtualListProps,
} from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { type JsxChildren, normalizeContainerChildren, normalizeTextChildren } from "./children.js";
import type {
  AccordionJsxProps,
  BadgeJsxProps,
  BarChartJsxProps,
  BoxJsxProps,
  BreadcrumbJsxProps,
  ButtonJsxProps,
  CalloutJsxProps,
  CanvasJsxProps,
  CheckboxJsxProps,
  CodeEditorJsxProps,
  ColumnJsxProps,
  CommandPaletteJsxProps,
  DiffViewerJsxProps,
  DividerJsxProps,
  DropdownJsxProps,
  EmptyJsxProps,
  ErrorDisplayJsxProps,
  FieldJsxProps,
  FilePickerJsxProps,
  FileTreeExplorerJsxProps,
  FocusTrapJsxProps,
  FocusZoneJsxProps,
  GaugeJsxProps,
  GridJsxProps,
  HStackJsxProps,
  HeatmapJsxProps,
  IconJsxProps,
  ImageJsxProps,
  InputJsxProps,
  KbdJsxProps,
  LayerJsxProps,
  LayersJsxProps,
  LineChartJsxProps,
  LinkJsxProps,
  LogsConsoleJsxProps,
  MiniChartJsxProps,
  ModalJsxProps,
  PaginationJsxProps,
  PanelGroupJsxProps,
  ProgressJsxProps,
  RadioGroupJsxProps,
  ResizablePanelJsxProps,
  RichTextJsxProps,
  RowJsxProps,
  ScatterJsxProps,
  SelectJsxProps,
  SkeletonJsxProps,
  SliderJsxProps,
  SpacerJsxProps,
  SparklineJsxProps,
  SpinnerJsxProps,
  SplitPaneJsxProps,
  StatusJsxProps,
  TableJsxProps,
  TabsJsxProps,
  TagJsxProps,
  TextJsxProps,
  ToastContainerJsxProps,
  ToolApprovalDialogJsxProps,
  TreeJsxProps,
  VStackJsxProps,
  VirtualListJsxProps,
} from "./types.js";

type FocusZoneProps = Extract<VNode, { kind: "focusZone" }>["props"];
type FocusTrapProps = Extract<VNode, { kind: "focusTrap" }>["props"];
type RowProps = Extract<VNode, { kind: "row" }>["props"];
type ColumnProps = Extract<VNode, { kind: "column" }>["props"];
type GridProps = Extract<VNode, { kind: "grid" }>["props"];
type LinkProps = Extract<VNode, { kind: "link" }>["props"];
type CanvasProps = Extract<VNode, { kind: "canvas" }>["props"];
type ImageProps = Extract<VNode, { kind: "image" }>["props"];
type LineChartProps = Extract<VNode, { kind: "lineChart" }>["props"];
type ScatterProps = Extract<VNode, { kind: "scatter" }>["props"];
type HeatmapProps = Extract<VNode, { kind: "heatmap" }>["props"];
type GridPropsWithOptionalKey = GridProps & { key?: string };

function withOptionalKey<P extends { key?: string }>(
  props: Omit<P, "key">,
  key: string | undefined,
): P {
  if (key === undefined) {
    return props as P;
  }
  return { ...props, key } as P;
}

export function Box(props: BoxJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "box",
    props: withOptionalKey<BoxProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function Row(props: RowJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "row",
    props: withOptionalKey<RowProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function Column(props: ColumnJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "column",
    props: withOptionalKey<ColumnProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function Grid(props: GridJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.grid(
    withOptionalKey<GridPropsWithOptionalKey>(rest, key),
    ...normalizeContainerChildren(children),
  );
}

export function HStack(props: HStackJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.hstack(withOptionalKey<RowProps>(rest, key), normalizeContainerChildren(children));
}

export function VStack(props: VStackJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.vstack(withOptionalKey<ColumnProps>(rest, key), normalizeContainerChildren(children));
}

export function Layers(props: LayersJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "layers",
    props: withOptionalKey<LayersProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function FocusZone(props: FocusZoneJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "focusZone",
    props: withOptionalKey<FocusZoneProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function FocusTrap(props: FocusTrapJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "focusTrap",
    props: withOptionalKey<FocusTrapProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function SplitPane(props: SplitPaneJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "splitPane",
    props: withOptionalKey<SplitPaneProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function PanelGroup(props: PanelGroupJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "panelGroup",
    props: withOptionalKey<PanelGroupProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function ResizablePanel(props: ResizablePanelJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "resizablePanel",
    props: withOptionalKey<ResizablePanelProps>(rest, key),
    children: normalizeContainerChildren(children),
  };
}

export function Text(props: TextJsxProps): VNode {
  const { children, key, ...rest } = props;
  return {
    kind: "text",
    text: normalizeTextChildren(children),
    props: withOptionalKey<TextProps>(rest, key),
  };
}

export function Field(props: FieldJsxProps): VNode {
  const { children, key, ...rest } = props;
  const fieldChildren: readonly VNode[] = Object.freeze([children]);
  return {
    kind: "field",
    props: withOptionalKey<FieldProps>({ ...rest, children }, key),
    children: fieldChildren,
  };
}

export function Spacer(props: SpacerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "spacer",
    props: withOptionalKey<SpacerProps>(rest, key),
  };
}

export function Divider(props: DividerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "divider",
    props: withOptionalKey<DividerProps>(rest, key),
  };
}

export function Icon(props: IconJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "icon",
    props: withOptionalKey<IconProps>(rest, key),
  };
}

export function Spinner(props: SpinnerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "spinner",
    props: withOptionalKey<SpinnerProps>(rest, key),
  };
}

export function Progress(props: ProgressJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "progress",
    props: withOptionalKey<ProgressProps>(rest, key),
  };
}

export function Skeleton(props: SkeletonJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "skeleton",
    props: withOptionalKey<SkeletonProps>(rest, key),
  };
}

export function RichText(props: RichTextJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "richText",
    props: withOptionalKey<RichTextProps>(rest, key),
  };
}

export function Kbd(props: KbdJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "kbd",
    props: withOptionalKey<KbdProps>(rest, key),
  };
}

export function Badge(props: BadgeJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "badge",
    props: withOptionalKey<BadgeProps>(rest, key),
  };
}

export function Status(props: StatusJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "status",
    props: withOptionalKey<StatusProps>(rest, key),
  };
}

export function Tag(props: TagJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "tag",
    props: withOptionalKey<TagProps>(rest, key),
  };
}

export function Gauge(props: GaugeJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "gauge",
    props: withOptionalKey<GaugeProps>(rest, key),
  };
}

export function Empty(props: EmptyJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "empty",
    props: withOptionalKey<EmptyProps>(rest, key),
  };
}

export function ErrorDisplay(props: ErrorDisplayJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "errorDisplay",
    props: withOptionalKey<ErrorDisplayProps>(rest, key),
  };
}

export function Callout(props: CalloutJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "callout",
    props: withOptionalKey<CalloutProps>(rest, key),
  };
}

export function Link(props: LinkJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "link",
    props: withOptionalKey<LinkProps>(rest, key),
  };
}

export function Canvas(props: CanvasJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "canvas",
    props: withOptionalKey<CanvasProps>(rest, key),
  };
}

export function Image(props: ImageJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "image",
    props: withOptionalKey<ImageProps>(rest, key),
  };
}

export function LineChart(props: LineChartJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "lineChart",
    props: withOptionalKey<LineChartProps>(rest, key),
  };
}

export function Scatter(props: ScatterJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "scatter",
    props: withOptionalKey<ScatterProps>(rest, key),
  };
}

export function Heatmap(props: HeatmapJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "heatmap",
    props: withOptionalKey<HeatmapProps>(rest, key),
  };
}

export function Sparkline(props: SparklineJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "sparkline",
    props: withOptionalKey<SparklineProps>(rest, key),
  };
}

export function BarChart(props: BarChartJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "barChart",
    props: withOptionalKey<BarChartProps>(rest, key),
  };
}

export function MiniChart(props: MiniChartJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "miniChart",
    props: withOptionalKey<MiniChartProps>(rest, key),
  };
}

export function Button(props: ButtonJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "button",
    props: withOptionalKey<ButtonProps>(rest, key),
  };
}

export function Input(props: InputJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "input",
    props: withOptionalKey<InputProps>(rest, key),
  };
}

export function Slider(props: SliderJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.slider(withOptionalKey<SliderProps>(rest, key));
}

export function VirtualList<T = unknown>(props: VirtualListJsxProps<T>): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "virtualList",
    props: withOptionalKey<VirtualListProps<T>>(rest, key) as VirtualListProps<unknown>,
  };
}

export function Modal(props: ModalJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "modal",
    props: withOptionalKey<ModalProps>(rest, key),
  };
}

export function Dropdown(props: DropdownJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "dropdown",
    props: withOptionalKey<DropdownProps>(rest, key),
  };
}

export function Layer(props: LayerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "layer",
    props: withOptionalKey<LayerProps>(rest, key),
  };
}

export function Table<T = unknown>(props: TableJsxProps<T>): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "table",
    props: withOptionalKey<TableProps<T>>(rest, key) as TableProps<unknown>,
  };
}

export function Tree<T = unknown>(props: TreeJsxProps<T>): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "tree",
    props: withOptionalKey<TreeProps<T>>(rest, key) as TreeProps<unknown>,
  };
}

export function Select(props: SelectJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "select",
    props: withOptionalKey<SelectProps>(rest, key),
  };
}

export function Checkbox(props: CheckboxJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "checkbox",
    props: withOptionalKey<CheckboxProps>(rest, key),
  };
}

export function RadioGroup(props: RadioGroupJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "radioGroup",
    props: withOptionalKey<RadioGroupProps>(rest, key),
  };
}

export function Tabs(props: TabsJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.tabs(withOptionalKey<TabsProps>(rest, key));
}

export function Accordion(props: AccordionJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.accordion(withOptionalKey<AccordionProps>(rest, key));
}

export function Breadcrumb(props: BreadcrumbJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.breadcrumb(withOptionalKey<BreadcrumbProps>(rest, key));
}

export function Pagination(props: PaginationJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.pagination(withOptionalKey<PaginationProps>(rest, key));
}

export function CommandPalette(props: CommandPaletteJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "commandPalette",
    props: withOptionalKey<CommandPaletteProps>(rest, key),
  };
}

export function FilePicker(props: FilePickerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "filePicker",
    props: withOptionalKey<FilePickerProps>(rest, key),
  };
}

export function FileTreeExplorer(props: FileTreeExplorerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "fileTreeExplorer",
    props: withOptionalKey<FileTreeExplorerProps>(rest, key),
  };
}

export function CodeEditor(props: CodeEditorJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "codeEditor",
    props: withOptionalKey<CodeEditorProps>(rest, key),
  };
}

export function DiffViewer(props: DiffViewerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "diffViewer",
    props: withOptionalKey<DiffViewerProps>(rest, key),
  };
}

export function ToolApprovalDialog(props: ToolApprovalDialogJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "toolApprovalDialog",
    props: withOptionalKey<ToolApprovalDialogProps>(rest, key),
  };
}

export function LogsConsole(props: LogsConsoleJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "logsConsole",
    props: withOptionalKey<LogsConsoleProps>(rest, key),
  };
}

export function ToastContainer(props: ToastContainerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return {
    kind: "toastContainer",
    props: withOptionalKey<ToastContainerProps>(rest, key),
  };
}

export function Fragment(props: { children?: JsxChildren; key?: string }): VNode {
  return {
    kind: "column",
    props: withOptionalKey<ColumnProps>({}, props.key),
    children: normalizeContainerChildren(props.children),
  };
}
