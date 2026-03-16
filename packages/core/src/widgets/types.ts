/**
 * packages/core/src/widgets/types.ts — Widget VNode type definitions.
 *
 * Why: Defines the VNode discriminated union and widget props types that form
 * the public API for building terminal UI. VNodes are the declarative tree
 * structure returned by view functions.
 *
 * Widget types (MVP):
 *   - text: Display text content
 *   - box: Container with optional border and padding
 *   - row: Horizontal stack layout
 *   - column: Vertical stack layout
 *   - spacer: Fixed-size spacing element
 *   - button: Focusable button with press action
 *   - input: Focusable text input field
 *
 * @see docs/widgets/index.md
 */

export type {
  Align,
  Overflow,
  SpacingProps,
  ScopedThemeOverride,
  ThemedProps,
  FragmentProps,
  TextVariant,
  TransitionProperty,
  TransitionSpec,
  ExitAnimationState,
  TextProps,
  BoxShadow,
  BoxPreset,
  BoxBorderSideStyles,
  BoxProps,
  JustifyContent,
  AlignItems,
  StackProps,
  RowProps,
  ColumnProps,
  GridProps,
  SpacerProps,
  DividerProps,
  IconProps,
  SpinnerProps,
  ProgressVariant,
  ProgressProps,
  SkeletonVariant,
  SkeletonProps,
  RichTextSpan,
  RichTextProps,
  KbdProps,
  BadgeVariant,
  BadgeProps,
  StatusType,
  StatusProps,
  TagProps,
  GaugeProps,
  EmptyProps,
  ErrorDisplayProps,
  ErrorBoundaryError,
  ErrorBoundaryProps,
  CalloutProps,
  GraphicsBlitter,
  CanvasPoint,
  CanvasContext,
  LinkProps,
  CanvasProps,
  ImageFit,
  ImageProtocol,
  ImageProps,
  LineChartSeries,
  ChartAxis,
  LineChartProps,
  ScatterPoint,
  ScatterProps,
  HeatmapColorScale,
  HeatmapProps,
  SparklineProps,
  BarChartItem,
  BarChartProps,
  MiniChartProps,
  ButtonIntent,
  ButtonProps,
  InputProps,
  TextareaProps,
  FocusAnnouncerProps,
  FocusZoneNavigation,
  FocusZoneProps,
  FocusTrapProps,
  ItemHeightSpec,
  VirtualListMeasureItemHeightCtx,
  VirtualListProps,
} from "./types/base.js";
export type {
  BackdropStyle,
  OverlayFrameStyle,
  ModalBackdrop,
  DropdownPosition,
  LayersProps,
  ModalProps,
  DialogActionIntent,
  DialogAction,
  DialogProps,
  AppShellSidebar,
  AppShellOptions,
  PageOptions,
  CardOptions,
  ToolbarOptions,
  StatusBarOptions,
  HeaderOptions,
  SidebarItem,
  SidebarOptions,
  MasterDetailOptions,
  DropdownItem,
  DropdownProps,
  LayerProps,
} from "./types/overlaysShell.js";
export type {
  TableColumnOverflow,
  TableStripeStyle,
  TableBorderVariant,
  TableBorderStyle,
  TableColumn,
  TableProps,
} from "./types/table.js";
export type {
  SelectOption,
  FieldProps,
  SelectProps,
  SliderProps,
  CheckboxProps,
  RadioGroupProps,
} from "./types/forms.js";
export type {
  TabsVariant,
  TabsPosition,
  TabsItem,
  TabsProps,
  AccordionItem,
  AccordionProps,
  BreadcrumbItem,
  BreadcrumbProps,
  PaginationProps,
} from "./types/navigation.js";
export type {
  CommandSource,
  CommandItem,
  CommandPaletteProps,
  FileNode,
  FileNodeState,
  FilePickerProps,
  FileTreeExplorerProps,
  SplitDirection,
  SplitPaneProps,
  ResizablePanelProps,
  PanelGroupProps,
  CursorPosition,
  EditorSelection,
  SearchMatch,
  CodeEditorDiagnosticSeverity,
  CodeEditorDiagnostic,
  CodeEditorSyntaxLanguage,
  CodeEditorSyntaxTokenKind,
  CodeEditorSyntaxToken,
  CodeEditorTokenizeContext,
  CodeEditorLineTokenizer,
  CodeEditorProps,
  DiffLine,
  DiffHunk,
  DiffData,
  DiffViewerProps,
  ToolFileChange,
  ToolRequest,
  ToolApprovalDialogProps,
  LogLevel,
  TokenCount,
  LogEntry,
  LogsConsoleProps,
  ToastPosition,
  ToastAction,
  Toast,
  ToastContainerProps,
} from "./types/advanced.js";
export type { NodeState, TreeProps } from "./types/tree.js";

import type {
  CodeEditorProps,
  CommandPaletteProps,
  DiffViewerProps,
  FilePickerProps,
  FileTreeExplorerProps,
  LogsConsoleProps,
  PanelGroupProps,
  ResizablePanelProps,
  SplitPaneProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
} from "./types/advanced.js";
import type {
  BadgeProps,
  BarChartProps,
  BoxProps,
  ButtonProps,
  CalloutProps,
  CanvasProps,
  ColumnProps,
  DividerProps,
  EmptyProps,
  ErrorBoundaryProps,
  ErrorDisplayProps,
  FocusAnnouncerProps,
  FocusTrapProps,
  FocusZoneProps,
  FragmentProps,
  GaugeProps,
  GridProps,
  HeatmapProps,
  IconProps,
  ImageProps,
  InputProps,
  KbdProps,
  LineChartProps,
  LinkProps,
  MiniChartProps,
  ProgressProps,
  RichTextProps,
  RowProps,
  ScatterProps,
  SkeletonProps,
  SpacerProps,
  SparklineProps,
  SpinnerProps,
  StatusProps,
  TagProps,
  TextProps,
  TextareaProps,
  ThemedProps,
  VirtualListProps,
} from "./types/base.js";
import type {
  CheckboxProps,
  FieldProps,
  RadioGroupProps,
  SelectProps,
  SliderProps,
} from "./types/forms.js";
import type {
  AccordionProps,
  BreadcrumbProps,
  PaginationProps,
  TabsProps,
} from "./types/navigation.js";
import type { DropdownProps, LayerProps, LayersProps, ModalProps } from "./types/overlaysShell.js";
import type { TableProps } from "./types/table.js";
import type { TreeProps } from "./types/tree.js";

export type VNode =
  | Readonly<{ kind: "text"; text: string; props: TextProps }>
  | Readonly<{ kind: "fragment"; props: FragmentProps; children: readonly VNode[] }>
  | Readonly<{ kind: "box"; props: BoxProps; children: readonly VNode[] }>
  | Readonly<{ kind: "fragment"; props: Readonly<{ key?: string }>; children: readonly VNode[] }>
  | Readonly<{ kind: "row"; props: RowProps; children: readonly VNode[] }>
  | Readonly<{ kind: "column"; props: ColumnProps; children: readonly VNode[] }>
  | Readonly<{ kind: "themed"; props: ThemedProps; children: readonly VNode[] }>
  | Readonly<{ kind: "grid"; props: GridProps; children: readonly VNode[] }>
  | Readonly<{ kind: "spacer"; props: SpacerProps }>
  | Readonly<{ kind: "divider"; props: DividerProps }>
  | Readonly<{ kind: "icon"; props: IconProps }>
  | Readonly<{ kind: "spinner"; props: SpinnerProps }>
  | Readonly<{ kind: "progress"; props: ProgressProps }>
  | Readonly<{ kind: "skeleton"; props: SkeletonProps }>
  | Readonly<{ kind: "richText"; props: RichTextProps }>
  | Readonly<{ kind: "kbd"; props: KbdProps }>
  | Readonly<{ kind: "badge"; props: BadgeProps }>
  | Readonly<{ kind: "status"; props: StatusProps }>
  | Readonly<{ kind: "tag"; props: TagProps }>
  | Readonly<{ kind: "gauge"; props: GaugeProps }>
  | Readonly<{ kind: "empty"; props: EmptyProps }>
  | Readonly<{ kind: "errorDisplay"; props: ErrorDisplayProps }>
  | Readonly<{ kind: "errorBoundary"; props: ErrorBoundaryProps }>
  | Readonly<{ kind: "callout"; props: CalloutProps }>
  // Data visualization widgets (Phase 9)
  | Readonly<{ kind: "sparkline"; props: SparklineProps }>
  | Readonly<{ kind: "barChart"; props: BarChartProps }>
  | Readonly<{ kind: "miniChart"; props: MiniChartProps }>
  | Readonly<{ kind: "link"; props: LinkProps }>
  | Readonly<{ kind: "canvas"; props: CanvasProps }>
  | Readonly<{ kind: "image"; props: ImageProps }>
  | Readonly<{ kind: "lineChart"; props: LineChartProps }>
  | Readonly<{ kind: "scatter"; props: ScatterProps }>
  | Readonly<{ kind: "heatmap"; props: HeatmapProps }>
  | Readonly<{ kind: "button"; props: ButtonProps }>
  | Readonly<{ kind: "input"; props: InputProps }>
  | Readonly<{ kind: "focusAnnouncer"; props: FocusAnnouncerProps }>
  | Readonly<{ kind: "slider"; props: SliderProps }>
  | Readonly<{ kind: "focusZone"; props: FocusZoneProps; children: readonly VNode[] }>
  | Readonly<{ kind: "focusTrap"; props: FocusTrapProps; children: readonly VNode[] }>
  | Readonly<{ kind: "virtualList"; props: VirtualListProps<unknown> }>
  | Readonly<{ kind: "layers"; props: LayersProps; children: readonly VNode[] }>
  | Readonly<{ kind: "modal"; props: ModalProps }>
  | Readonly<{ kind: "dropdown"; props: DropdownProps }>
  | Readonly<{ kind: "layer"; props: LayerProps }>
  | Readonly<{ kind: "table"; props: TableProps<unknown> }>
  | Readonly<{ kind: "tree"; props: TreeProps<unknown> }>
  | Readonly<{ kind: "field"; props: FieldProps; children: readonly VNode[] }>
  | Readonly<{ kind: "select"; props: SelectProps }>
  | Readonly<{ kind: "checkbox"; props: CheckboxProps }>
  | Readonly<{ kind: "radioGroup"; props: RadioGroupProps }>
  | Readonly<{ kind: "tabs"; props: TabsProps; children: readonly VNode[] }>
  | Readonly<{ kind: "accordion"; props: AccordionProps; children: readonly VNode[] }>
  | Readonly<{ kind: "breadcrumb"; props: BreadcrumbProps; children: readonly VNode[] }>
  | Readonly<{ kind: "pagination"; props: PaginationProps; children: readonly VNode[] }>
  // Advanced widgets (GitHub issue #136)
  | Readonly<{ kind: "commandPalette"; props: CommandPaletteProps }>
  | Readonly<{ kind: "filePicker"; props: FilePickerProps }>
  | Readonly<{ kind: "fileTreeExplorer"; props: FileTreeExplorerProps }>
  | Readonly<{
      kind: "splitPane";
      props: SplitPaneProps;
      children: readonly VNode[];
    }>
  | Readonly<{
      kind: "panelGroup";
      props: PanelGroupProps;
      children: readonly VNode[];
    }>
  | Readonly<{
      kind: "resizablePanel";
      props: ResizablePanelProps;
      children: readonly VNode[];
    }>
  | Readonly<{ kind: "codeEditor"; props: CodeEditorProps }>
  | Readonly<{ kind: "diffViewer"; props: DiffViewerProps }>
  | Readonly<{ kind: "toolApprovalDialog"; props: ToolApprovalDialogProps }>
  | Readonly<{ kind: "logsConsole"; props: LogsConsoleProps }>
  | Readonly<{ kind: "toastContainer"; props: ToastContainerProps }>;
