import type {
  AccordionProps,
  AppShellOptions,
  BadgeProps,
  BarChartProps,
  BoxProps,
  BreadcrumbProps,
  ButtonProps,
  CalloutProps,
  CardOptions,
  CheckboxProps,
  CodeEditorProps,
  CommandPaletteProps,
  DialogProps,
  DiffViewerProps,
  DividerProps,
  DropdownProps,
  EmptyProps,
  ErrorBoundaryProps,
  ErrorDisplayProps,
  FieldProps,
  FilePickerProps,
  FileTreeExplorerProps,
  FocusAnnouncerProps,
  GaugeProps,
  HeaderOptions,
  IconProps,
  InputProps,
  KbdProps,
  LayerProps,
  LayersProps,
  LogsConsoleProps,
  MasterDetailOptions,
  MiniChartProps,
  ModalProps,
  PageOptions,
  PaginationProps,
  PanelGroupProps,
  ProgressProps,
  RadioGroupProps,
  ResizablePanelProps,
  RichTextProps,
  RouterBreadcrumbProps,
  RouterTabsProps,
  SelectProps,
  SidebarOptions,
  SkeletonProps,
  SliderProps,
  SpacerProps,
  SparklineProps,
  SpinnerProps,
  SplitPaneProps,
  StatusBarOptions,
  StatusProps,
  TableProps,
  TabsProps,
  TagProps,
  TextProps,
  TextareaProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  ToolbarOptions,
  TreeProps,
  VNode,
  VirtualListProps,
} from "@rezi-ui/core";
import { ui } from "@rezi-ui/core";
import { type JsxChildren, normalizeContainerChildren, normalizeTextChildren } from "./children.js";
import type {
  AccordionJsxProps,
  ActionsJsxProps,
  ActionsOptions,
  AppShellJsxProps,
  BadgeJsxProps,
  BarChartJsxProps,
  BoxJsxProps,
  BreadcrumbJsxProps,
  ButtonJsxProps,
  CalloutJsxProps,
  CanvasJsxProps,
  CardJsxProps,
  CenterJsxProps,
  CenterOptions,
  CheckboxJsxProps,
  CodeEditorJsxProps,
  ColumnJsxProps,
  CommandPaletteJsxProps,
  DialogJsxProps,
  DiffViewerJsxProps,
  DividerJsxProps,
  DropdownJsxProps,
  EmptyJsxProps,
  ErrorBoundaryJsxProps,
  ErrorDisplayJsxProps,
  FieldJsxProps,
  FilePickerJsxProps,
  FileTreeExplorerJsxProps,
  FocusAnnouncerJsxProps,
  FocusTrapJsxProps,
  FocusZoneJsxProps,
  FormJsxProps,
  FormOptions,
  GaugeJsxProps,
  GridJsxProps,
  HStackJsxProps,
  HeaderJsxProps,
  HeatmapJsxProps,
  IconJsxProps,
  ImageJsxProps,
  InputJsxProps,
  KbdJsxProps,
  KeybindingHelpJsxProps,
  KeybindingHelpOptions,
  LayerJsxProps,
  LayersJsxProps,
  LineChartJsxProps,
  LinkJsxProps,
  LogsConsoleJsxProps,
  MasterDetailJsxProps,
  MiniChartJsxProps,
  ModalJsxProps,
  PageJsxProps,
  PaginationJsxProps,
  PanelGroupJsxProps,
  PanelJsxProps,
  PanelOptions,
  ProgressJsxProps,
  RadioGroupJsxProps,
  ResizablePanelJsxProps,
  RichTextJsxProps,
  RouterBreadcrumbJsxProps,
  RouterTabsJsxProps,
  RowJsxProps,
  ScatterJsxProps,
  SelectJsxProps,
  SidebarJsxProps,
  SkeletonJsxProps,
  SliderJsxProps,
  SpacedHStackJsxProps,
  SpacedVStackJsxProps,
  SpacerJsxProps,
  SparklineJsxProps,
  SpinnerJsxProps,
  SplitPaneJsxProps,
  StatusBarJsxProps,
  StatusJsxProps,
  TableJsxProps,
  TabsJsxProps,
  TagJsxProps,
  TextJsxProps,
  TextareaJsxProps,
  ToastContainerJsxProps,
  ToolApprovalDialogJsxProps,
  ToolbarJsxProps,
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

function withVNodeKey<N extends VNode>(vnode: N, key: string | undefined): N {
  if (key === undefined) {
    return vnode;
  }
  return {
    ...vnode,
    props: {
      ...(vnode.props as Record<string, unknown>),
      key,
    },
  } as N;
}

export function Box(props: BoxJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.box(withOptionalKey<BoxProps>(rest, key), normalizeContainerChildren(children));
}

export function Row(props: RowJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.row(withOptionalKey<RowProps>(rest, key), normalizeContainerChildren(children));
}

export function Column(props: ColumnJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.column(withOptionalKey<ColumnProps>(rest, key), normalizeContainerChildren(children));
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

export function SpacedVStack(props: SpacedVStackJsxProps): VNode {
  const { children, key, gap } = props;
  const normalized = normalizeContainerChildren(children);
  return withVNodeKey(
    gap === undefined ? ui.spacedVStack(normalized) : ui.spacedVStack(gap, normalized),
    key,
  );
}

export function SpacedHStack(props: SpacedHStackJsxProps): VNode {
  const { children, key, gap } = props;
  const normalized = normalizeContainerChildren(children);
  return withVNodeKey(
    gap === undefined ? ui.spacedHStack(normalized) : ui.spacedHStack(gap, normalized),
    key,
  );
}

export function Layers(props: LayersJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.layers(withOptionalKey<LayersProps>(rest, key), normalizeContainerChildren(children));
}

export function FocusZone(props: FocusZoneJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.focusZone(
    withOptionalKey<FocusZoneProps>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function FocusTrap(props: FocusTrapJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.focusTrap(
    withOptionalKey<FocusTrapProps>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function SplitPane(props: SplitPaneJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.splitPane(
    withOptionalKey<SplitPaneProps>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function PanelGroup(props: PanelGroupJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.panelGroup(
    withOptionalKey<PanelGroupProps>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function ResizablePanel(props: ResizablePanelJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.resizablePanel(
    withOptionalKey<ResizablePanelProps>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function Panel(props: PanelJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.panel(withOptionalKey<PanelOptions>(rest, key), normalizeContainerChildren(children));
}

export function Form(props: FormJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.form(withOptionalKey<FormOptions>(rest, key), normalizeContainerChildren(children));
}

export function Actions(props: ActionsJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.actions(
    withOptionalKey<ActionsOptions>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function Center(props: CenterJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.center(children, withOptionalKey<CenterOptions>(rest, key));
}

export function Page(props: PageJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.page(withOptionalKey<PageOptions>(rest, key));
}

export function AppShell(props: AppShellJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.appShell(withOptionalKey<AppShellOptions>(rest, key));
}

export function Card(props: CardJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.card(withOptionalKey<CardOptions>(rest, key), normalizeContainerChildren(children));
}

export function Toolbar(props: ToolbarJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.toolbar(
    withOptionalKey<ToolbarOptions>(rest, key),
    normalizeContainerChildren(children),
  );
}

export function StatusBar(props: StatusBarJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.statusBar(withOptionalKey<StatusBarOptions>(rest, key));
}

export function Header(props: HeaderJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.header(withOptionalKey<HeaderOptions>(rest, key));
}

export function Sidebar(props: SidebarJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.sidebar(withOptionalKey<SidebarOptions>(rest, key));
}

export function MasterDetail(props: MasterDetailJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.masterDetail(withOptionalKey<MasterDetailOptions>(rest, key));
}

export function Text(props: TextJsxProps): VNode {
  const { children, key, ...rest } = props;
  const content = normalizeTextChildren(children);
  if (key === undefined && Object.keys(rest).length === 0) {
    return ui.text(content);
  }
  return ui.text(content, withOptionalKey<TextProps>(rest, key));
}

export function Field(props: FieldJsxProps): VNode {
  const { children, key, ...rest } = props;
  return ui.field(withOptionalKey<FieldProps>({ ...rest, children }, key));
}

export function Spacer(props: SpacerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.spacer(withOptionalKey<SpacerProps>(rest, key));
}

export function Divider(props: DividerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.divider(withOptionalKey<DividerProps>(rest, key));
}

export function Icon(props: IconJsxProps): VNode {
  const { key, children: _children, icon, ...rest } = props;
  return ui.icon(icon, withOptionalKey<Omit<IconProps, "icon">>(rest, key));
}

export function Spinner(props: SpinnerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.spinner(withOptionalKey<SpinnerProps>(rest, key));
}

export function Progress(props: ProgressJsxProps): VNode {
  const { key, children: _children, value, ...rest } = props;
  return ui.progress(value, withOptionalKey<Omit<ProgressProps, "value">>(rest, key));
}

export function Skeleton(props: SkeletonJsxProps): VNode {
  const { key, children: _children, width, ...rest } = props;
  return ui.skeleton(width, withOptionalKey<Omit<SkeletonProps, "width">>(rest, key));
}

export function RichText(props: RichTextJsxProps): VNode {
  const { key, children: _children, spans, ...rest } = props;
  return ui.richText(spans, withOptionalKey<Omit<RichTextProps, "spans">>(rest, key));
}

export function Kbd(props: KbdJsxProps): VNode {
  const { key, children: _children, keys, ...rest } = props;
  return ui.kbd(keys, withOptionalKey<Omit<KbdProps, "keys">>(rest, key));
}

export function Badge(props: BadgeJsxProps): VNode {
  const { key, children: _children, text, ...rest } = props;
  return ui.badge(text, withOptionalKey<Omit<BadgeProps, "text">>(rest, key));
}

export function Status(props: StatusJsxProps): VNode {
  const { key, children: _children, status, ...rest } = props;
  return ui.status(status, withOptionalKey<Omit<StatusProps, "status">>(rest, key));
}

export function Tag(props: TagJsxProps): VNode {
  const { key, children: _children, text, ...rest } = props;
  return ui.tag(text, withOptionalKey<Omit<TagProps, "text">>(rest, key));
}

export function Gauge(props: GaugeJsxProps): VNode {
  const { key, children: _children, value, ...rest } = props;
  return ui.gauge(value, withOptionalKey<Omit<GaugeProps, "value">>(rest, key));
}

export function Empty(props: EmptyJsxProps): VNode {
  const { key, children: _children, title, ...rest } = props;
  return ui.empty(title, withOptionalKey<Omit<EmptyProps, "title">>(rest, key));
}

export function ErrorDisplay(props: ErrorDisplayJsxProps): VNode {
  const { key, children: _children, message, ...rest } = props;
  return ui.errorDisplay(message, withOptionalKey<Omit<ErrorDisplayProps, "message">>(rest, key));
}

export function ErrorBoundary(props: ErrorBoundaryJsxProps): VNode {
  const { key, children, fallback } = props;
  return ui.errorBoundary(withOptionalKey<ErrorBoundaryProps>({ children, fallback }, key));
}

export function Callout(props: CalloutJsxProps): VNode {
  const { key, children: _children, message, ...rest } = props;
  return ui.callout(message, withOptionalKey<Omit<CalloutProps, "message">>(rest, key));
}

export function Link(props: LinkJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.link(withOptionalKey<LinkProps>(rest, key));
}

export function Canvas(props: CanvasJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.canvas(withOptionalKey<CanvasProps>(rest, key));
}

export function Image(props: ImageJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.image(withOptionalKey<ImageProps>(rest, key));
}

export function LineChart(props: LineChartJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.lineChart(withOptionalKey<LineChartProps>(rest, key));
}

export function Scatter(props: ScatterJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.scatter(withOptionalKey<ScatterProps>(rest, key));
}

export function Heatmap(props: HeatmapJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.heatmap(withOptionalKey<HeatmapProps>(rest, key));
}

export function Sparkline(props: SparklineJsxProps): VNode {
  const { key, children: _children, data, ...rest } = props;
  return ui.sparkline(data, withOptionalKey<Omit<SparklineProps, "data">>(rest, key));
}

export function BarChart(props: BarChartJsxProps): VNode {
  const { key, children: _children, data, ...rest } = props;
  return ui.barChart(data, withOptionalKey<Omit<BarChartProps, "data">>(rest, key));
}

export function MiniChart(props: MiniChartJsxProps): VNode {
  const { key, children: _children, values, ...rest } = props;
  return ui.miniChart(values, withOptionalKey<Omit<MiniChartProps, "values">>(rest, key));
}

export function Button(props: ButtonJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.button(withOptionalKey<ButtonProps>(rest, key));
}

export function Input(props: InputJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.input(withOptionalKey<InputProps>(rest, key));
}

export function Textarea(props: TextareaJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.textarea(withOptionalKey<TextareaProps>(rest, key));
}

export function Slider(props: SliderJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.slider(withOptionalKey<SliderProps>(rest, key));
}

export function VirtualList<T = unknown>(props: VirtualListJsxProps<T>): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.virtualList(withOptionalKey<VirtualListProps<T>>(rest, key));
}

export function Dialog(props: DialogJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.dialog(withOptionalKey<DialogProps>(rest, key));
}

export function Modal(props: ModalJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.modal(withOptionalKey<ModalProps>(rest, key));
}

export function Dropdown(props: DropdownJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.dropdown(withOptionalKey<DropdownProps>(rest, key));
}

export function Layer(props: LayerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.layer(withOptionalKey<LayerProps>(rest, key));
}

export function Table<T = unknown>(props: TableJsxProps<T>): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.table(withOptionalKey<TableProps<T>>(rest, key));
}

export function Tree<T = unknown>(props: TreeJsxProps<T>): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.tree(withOptionalKey<TreeProps<T>>(rest, key));
}

export function Select(props: SelectJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.select(withOptionalKey<SelectProps>(rest, key));
}

export function Checkbox(props: CheckboxJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.checkbox(withOptionalKey<CheckboxProps>(rest, key));
}

export function RadioGroup(props: RadioGroupJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.radioGroup(withOptionalKey<RadioGroupProps>(rest, key));
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

export function FocusAnnouncer(props: FocusAnnouncerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.focusAnnouncer(withOptionalKey<FocusAnnouncerProps>(rest, key));
}

export function KeybindingHelp(props: KeybindingHelpJsxProps): VNode {
  const { key, children: _children, bindings, ...rest } = props;
  return ui.keybindingHelp(bindings, withOptionalKey<KeybindingHelpOptions>(rest, key));
}

export function RouterBreadcrumb<S = unknown>(props: RouterBreadcrumbJsxProps<S>): VNode {
  const { key, children: _children, router, routes, ...rest } = props;
  return ui.routerBreadcrumb(router, routes, withOptionalKey<RouterBreadcrumbProps>(rest, key));
}

export function RouterTabs<S = unknown>(props: RouterTabsJsxProps<S>): VNode {
  const { key, children: _children, router, routes, ...rest } = props;
  return ui.routerTabs(router, routes, withOptionalKey<RouterTabsProps>(rest, key));
}

export function CommandPalette(props: CommandPaletteJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.commandPalette(withOptionalKey<CommandPaletteProps>(rest, key));
}

export function FilePicker(props: FilePickerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.filePicker(withOptionalKey<FilePickerProps>(rest, key));
}

export function FileTreeExplorer(props: FileTreeExplorerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.fileTreeExplorer(withOptionalKey<FileTreeExplorerProps>(rest, key));
}

export function CodeEditor(props: CodeEditorJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.codeEditor(withOptionalKey<CodeEditorProps>(rest, key));
}

export function DiffViewer(props: DiffViewerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.diffViewer(withOptionalKey<DiffViewerProps>(rest, key));
}

export function ToolApprovalDialog(props: ToolApprovalDialogJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.toolApprovalDialog(withOptionalKey<ToolApprovalDialogProps>(rest, key));
}

export function LogsConsole(props: LogsConsoleJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.logsConsole(withOptionalKey<LogsConsoleProps>(rest, key));
}

export function ToastContainer(props: ToastContainerJsxProps): VNode {
  const { key, children: _children, ...rest } = props;
  return ui.toastContainer(withOptionalKey<ToastContainerProps>(rest, key));
}

export function Fragment(props: { children?: JsxChildren; key?: string }): VNode {
  return ui.column(
    withOptionalKey<ColumnProps>({ gap: 0 }, props.key),
    normalizeContainerChildren(props.children),
  );
}
