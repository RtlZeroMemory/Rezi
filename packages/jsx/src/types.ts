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
import type { JsxChildren, JsxTextChildren } from "./children.js";

export type ComponentFunction<P = never> = (props: P) => VNode;

export type JsxElement = VNode;

export type JsxElementType = string | ComponentFunction;

export interface ReziElementChildrenAttribute {
  children: unknown;
}

export interface ReziIntrinsicAttributes {
  key?: string;
}

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

type WithOptionalKey<P extends { key?: string }> = Omit<P, "key"> & {
  key?: string;
};

export type WithContainerChildren<P extends { key?: string }> = WithOptionalKey<P> & {
  children?: JsxChildren;
};

export type WithTextChildren<P extends { key?: string }> = WithOptionalKey<P> & {
  children?: JsxTextChildren;
};

export type LeafProps<P extends { key?: string }> = WithOptionalKey<P> & {
  children?: never;
};

export type WithSingleChild<P extends { key?: string; children: VNode }> = Omit<
  P,
  "key" | "children"
> & {
  key?: string;
  children: VNode;
};

export type BoxJsxProps = WithContainerChildren<BoxProps>;
export type RowJsxProps = WithContainerChildren<RowProps>;
export type ColumnJsxProps = WithContainerChildren<ColumnProps>;
export type GridJsxProps = WithContainerChildren<GridPropsWithOptionalKey>;
export type HStackJsxProps = WithContainerChildren<RowProps>;
export type VStackJsxProps = WithContainerChildren<ColumnProps>;
export type LayersJsxProps = WithContainerChildren<LayersProps>;
export type FocusZoneJsxProps = WithContainerChildren<FocusZoneProps>;
export type FocusTrapJsxProps = WithContainerChildren<FocusTrapProps>;
export type SplitPaneJsxProps = WithContainerChildren<SplitPaneProps>;
export type PanelGroupJsxProps = WithContainerChildren<PanelGroupProps>;
export type ResizablePanelJsxProps = WithContainerChildren<ResizablePanelProps>;

export type TextJsxProps = WithTextChildren<TextProps>;

export type FieldJsxProps = WithSingleChild<FieldProps>;

export type SpacerJsxProps = LeafProps<SpacerProps>;
export type DividerJsxProps = LeafProps<DividerProps>;
export type IconJsxProps = LeafProps<IconProps>;
export type SpinnerJsxProps = LeafProps<SpinnerProps>;
export type ProgressJsxProps = LeafProps<ProgressProps>;
export type SkeletonJsxProps = LeafProps<SkeletonProps>;
export type RichTextJsxProps = LeafProps<RichTextProps>;
export type KbdJsxProps = LeafProps<KbdProps>;
export type BadgeJsxProps = LeafProps<BadgeProps>;
export type StatusJsxProps = LeafProps<StatusProps>;
export type TagJsxProps = LeafProps<TagProps>;
export type GaugeJsxProps = LeafProps<GaugeProps>;
export type EmptyJsxProps = LeafProps<EmptyProps>;
export type ErrorDisplayJsxProps = LeafProps<ErrorDisplayProps>;
export type CalloutJsxProps = LeafProps<CalloutProps>;
export type LinkJsxProps = LeafProps<LinkProps>;
export type CanvasJsxProps = LeafProps<CanvasProps>;
export type ImageJsxProps = LeafProps<ImageProps>;
export type LineChartJsxProps = LeafProps<LineChartProps>;
export type ScatterJsxProps = LeafProps<ScatterProps>;
export type HeatmapJsxProps = LeafProps<HeatmapProps>;
export type SparklineJsxProps = LeafProps<SparklineProps>;
export type BarChartJsxProps = LeafProps<BarChartProps>;
export type MiniChartJsxProps = LeafProps<MiniChartProps>;
export type ButtonJsxProps = LeafProps<ButtonProps>;
export type InputJsxProps = LeafProps<InputProps>;
export type SliderJsxProps = LeafProps<SliderProps>;
export type ModalJsxProps = LeafProps<ModalProps>;
export type DropdownJsxProps = LeafProps<DropdownProps>;
export type LayerJsxProps = LeafProps<LayerProps>;
export type SelectJsxProps = LeafProps<SelectProps>;
export type CheckboxJsxProps = LeafProps<CheckboxProps>;
export type RadioGroupJsxProps = LeafProps<RadioGroupProps>;
export type TabsJsxProps = LeafProps<TabsProps>;
export type AccordionJsxProps = LeafProps<AccordionProps>;
export type BreadcrumbJsxProps = LeafProps<BreadcrumbProps>;
export type PaginationJsxProps = LeafProps<PaginationProps>;
export type CommandPaletteJsxProps = LeafProps<CommandPaletteProps>;
export type FilePickerJsxProps = LeafProps<FilePickerProps>;
export type FileTreeExplorerJsxProps = LeafProps<FileTreeExplorerProps>;
export type CodeEditorJsxProps = LeafProps<CodeEditorProps>;
export type DiffViewerJsxProps = LeafProps<DiffViewerProps>;
export type ToolApprovalDialogJsxProps = LeafProps<ToolApprovalDialogProps>;
export type LogsConsoleJsxProps = LeafProps<LogsConsoleProps>;
export type ToastContainerJsxProps = LeafProps<ToastContainerProps>;

export type TableJsxProps<T = unknown> = LeafProps<TableProps<T>>;
export type TreeJsxProps<T = unknown> = LeafProps<TreeProps<T>>;
export type VirtualListJsxProps<T = unknown> = LeafProps<VirtualListProps<T>>;

/**
 * Intrinsic element map for lowercase JSX tags (for example: `<box />`).
 * This keeps intrinsic usage type-safe and blocks unknown tag names at compile time.
 */
export interface ReziIntrinsicElements {
  box: BoxJsxProps;
  row: RowJsxProps;
  column: ColumnJsxProps;
  grid: GridJsxProps;
  hstack: HStackJsxProps;
  vstack: VStackJsxProps;
  layers: LayersJsxProps;
  focusZone: FocusZoneJsxProps;
  focusTrap: FocusTrapJsxProps;
  splitPane: SplitPaneJsxProps;
  panelGroup: PanelGroupJsxProps;
  resizablePanel: ResizablePanelJsxProps;
  text: TextJsxProps;
  field: FieldJsxProps;
  spacer: SpacerJsxProps;
  divider: DividerJsxProps;
  icon: IconJsxProps;
  spinner: SpinnerJsxProps;
  progress: ProgressJsxProps;
  skeleton: SkeletonJsxProps;
  richText: RichTextJsxProps;
  kbd: KbdJsxProps;
  badge: BadgeJsxProps;
  status: StatusJsxProps;
  tag: TagJsxProps;
  gauge: GaugeJsxProps;
  empty: EmptyJsxProps;
  errorDisplay: ErrorDisplayJsxProps;
  callout: CalloutJsxProps;
  link: LinkJsxProps;
  canvas: CanvasJsxProps;
  image: ImageJsxProps;
  lineChart: LineChartJsxProps;
  scatter: ScatterJsxProps;
  heatmap: HeatmapJsxProps;
  sparkline: SparklineJsxProps;
  barChart: BarChartJsxProps;
  miniChart: MiniChartJsxProps;
  button: ButtonJsxProps;
  input: InputJsxProps;
  slider: SliderJsxProps;
  virtualList: VirtualListJsxProps;
  modal: ModalJsxProps;
  dropdown: DropdownJsxProps;
  layer: LayerJsxProps;
  table: TableJsxProps;
  tree: TreeJsxProps;
  select: SelectJsxProps;
  checkbox: CheckboxJsxProps;
  radioGroup: RadioGroupJsxProps;
  tabs: TabsJsxProps;
  accordion: AccordionJsxProps;
  breadcrumb: BreadcrumbJsxProps;
  pagination: PaginationJsxProps;
  commandPalette: CommandPaletteJsxProps;
  filePicker: FilePickerJsxProps;
  fileTreeExplorer: FileTreeExplorerJsxProps;
  codeEditor: CodeEditorJsxProps;
  diffViewer: DiffViewerJsxProps;
  toolApprovalDialog: ToolApprovalDialogJsxProps;
  logsConsole: LogsConsoleJsxProps;
  toastContainer: ToastContainerJsxProps;
  fragment: { key?: string; children?: JsxChildren };
}

export type ReziIntrinsicElementName = keyof ReziIntrinsicElements;
