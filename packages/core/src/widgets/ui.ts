/**
 * packages/core/src/widgets/ui.ts — Widget factory functions.
 *
 * Why: Provides a convenient API for building VNode trees without manually
 * constructing discriminated union objects. Each function returns a properly
 * typed VNode for the corresponding widget.
 *
 * @see docs/widgets/index.md
 */

import type { TextStyle } from "./style.js";
import type {
  BadgeProps,
  BarChartItem,
  BarChartProps,
  BoxProps,
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
  FocusTrapProps,
  FocusZoneProps,
  GaugeProps,
  IconProps,
  InputProps,
  KbdProps,
  LayerProps,
  LayersProps,
  LogsConsoleProps,
  MiniChartProps,
  ModalProps,
  PanelGroupProps,
  ProgressProps,
  RadioGroupProps,
  ResizablePanelProps,
  RichTextProps,
  RichTextSpan,
  SelectProps,
  SkeletonProps,
  SpacerProps,
  SparklineProps,
  SpinnerProps,
  SplitPaneProps,
  StackProps,
  StatusProps,
  TableProps,
  TagProps,
  TextProps,
  ToastContainerProps,
  ToolApprovalDialogProps,
  TreeProps,
  VNode,
  VirtualListProps,
} from "./types.js";

type UiChild = VNode | false | null | undefined;

function filterChildren(children: readonly UiChild[]): readonly VNode[] {
  const out: VNode[] = [];
  for (const c of children) {
    if (c !== false && c !== null && c !== undefined) out.push(c);
  }
  return out;
}

function isTextProps(v: TextStyle | TextProps): v is TextProps {
  return typeof v === "object" && v !== null && ("style" in v || "id" in v || "key" in v);
}

function text(content: string): VNode;
function text(content: string, style: TextStyle): VNode;
function text(content: string, props: TextProps): VNode;
function text(content: string, styleOrProps?: TextStyle | TextProps): VNode {
  if (styleOrProps === undefined) return { kind: "text", text: content, props: {} };
  if (isTextProps(styleOrProps)) return { kind: "text", text: content, props: styleOrProps };
  return { kind: "text", text: content, props: { style: styleOrProps } };
}

function box(props: BoxProps = {}, children: readonly UiChild[] = []): VNode {
  return { kind: "box", props, children: filterChildren(children) };
}

function row(props: StackProps = {}, children: readonly UiChild[] = []): VNode {
  return { kind: "row", props, children: filterChildren(children) };
}

function column(props: StackProps = {}, children: readonly UiChild[] = []): VNode {
  return { kind: "column", props, children: filterChildren(children) };
}

function vstack(gap: number, children: readonly UiChild[]): VNode;
function vstack(children: readonly UiChild[]): VNode;
function vstack(gapOrChildren: number | readonly UiChild[], children?: readonly UiChild[]): VNode {
  if (typeof gapOrChildren === "number") {
    return {
      kind: "column",
      props: { gap: gapOrChildren },
      children: filterChildren(children ?? []),
    };
  }
  return { kind: "column", props: { gap: 1 }, children: filterChildren(gapOrChildren) };
}

function hstack(gap: number, children: readonly UiChild[]): VNode;
function hstack(children: readonly UiChild[]): VNode;
function hstack(gapOrChildren: number | readonly UiChild[], children?: readonly UiChild[]): VNode {
  if (typeof gapOrChildren === "number") {
    return { kind: "row", props: { gap: gapOrChildren }, children: filterChildren(children ?? []) };
  }
  return { kind: "row", props: { gap: 1 }, children: filterChildren(gapOrChildren) };
}

function spacer(props: SpacerProps = {}): VNode {
  return { kind: "spacer", props };
}

function divider(props: DividerProps = {}): VNode {
  return { kind: "divider", props };
}

/**
 * Create an icon widget.
 *
 * @param iconPath - Icon path (e.g., "status.check", "arrow.right")
 * @param props - Optional icon props
 *
 * @example
 * ```ts
 * ui.icon("status.check")
 * ui.icon("arrow.right", { style: { fg: { r: 0, g: 255, b: 0 } } })
 * ui.icon("ui.search", { fallback: true })
 * ```
 */
function icon(iconPath: string, props: Omit<IconProps, "icon"> = {}): VNode {
  return { kind: "icon", props: { icon: iconPath, ...props } };
}

/**
 * Create a spinner widget (animated loading indicator).
 *
 * @param props - Spinner props
 *
 * @example
 * ```ts
 * ui.spinner()
 * ui.spinner({ variant: "dots", label: "Loading..." })
 * ```
 */
function spinner(props: SpinnerProps = {}): VNode {
  return { kind: "spinner", props };
}

/**
 * Create a progress bar widget.
 *
 * @param value - Progress value from 0 to 1
 * @param props - Optional progress bar props
 *
 * @example
 * ```ts
 * ui.progress(0.75)
 * ui.progress(0.5, { variant: "blocks", showPercent: true })
 * ui.progress(0.3, { label: "Downloading:", width: 20 })
 * ```
 */
function progress(value: number, props: Omit<ProgressProps, "value"> = {}): VNode {
  return { kind: "progress", props: { value, ...props } };
}

/**
 * Create a skeleton loading placeholder.
 *
 * @param width - Width in cells
 * @param props - Optional skeleton props
 *
 * @example
 * ```ts
 * ui.skeleton(20)
 * ui.skeleton(10, { height: 3, variant: "rect" })
 * ```
 */
function skeleton(width: number, props: Omit<SkeletonProps, "width"> = {}): VNode {
  return { kind: "skeleton", props: { width, ...props } };
}

/**
 * Create a rich text widget with multiple styled spans.
 *
 * @param spans - Array of text spans with optional styles
 *
 * @example
 * ```ts
 * ui.richText([
 *   { text: "Error: ", style: { fg: { r: 255, g: 0, b: 0 }, bold: true } },
 *   { text: "File not found" },
 * ])
 * ```
 */
function richText(spans: readonly RichTextSpan[]): VNode {
  return { kind: "richText", props: { spans } };
}

/**
 * Create a keyboard shortcut display widget.
 *
 * @param keys - Key or keys to display
 * @param props - Optional kbd props
 *
 * @example
 * ```ts
 * ui.kbd("Ctrl+S")
 * ui.kbd(["Ctrl", "Shift", "P"])
 * ui.kbd("Cmd+K", { separator: " " })
 * ```
 */
function kbd(keys: string | readonly string[], props: Omit<KbdProps, "keys"> = {}): VNode {
  return { kind: "kbd", props: { keys, ...props } };
}

/**
 * Create a badge widget.
 *
 * @param text - Badge text
 * @param props - Optional badge props
 *
 * @example
 * ```ts
 * ui.badge("New")
 * ui.badge("Error", { variant: "error" })
 * ui.badge("3", { variant: "info" })
 * ```
 */
function badge(text: string, props: Omit<BadgeProps, "text"> = {}): VNode {
  return { kind: "badge", props: { text, ...props } };
}

/**
 * Create a status indicator widget.
 *
 * @param status - Status type (online, offline, away, busy, unknown)
 * @param props - Optional status props
 *
 * @example
 * ```ts
 * ui.status("online")
 * ui.status("busy", { label: "In a meeting" })
 * ui.status("away", { showLabel: true })
 * ```
 */
function status(status: StatusProps["status"], props: Omit<StatusProps, "status"> = {}): VNode {
  return { kind: "status", props: { status, ...props } };
}

/**
 * Create a tag widget.
 *
 * @param text - Tag text
 * @param props - Optional tag props
 *
 * @example
 * ```ts
 * ui.tag("TypeScript")
 * ui.tag("Bug", { variant: "error" })
 * ui.tag("Feature", { variant: "info", removable: true })
 * ```
 */
function tag(text: string, props: Omit<TagProps, "text"> = {}): VNode {
  return { kind: "tag", props: { text, ...props } };
}

/**
 * Create a gauge widget.
 *
 * @param value - Value from 0 to 1
 * @param props - Optional gauge props
 *
 * @example
 * ```ts
 * ui.gauge(0.75)
 * ui.gauge(0.42, { label: "CPU" })
 * ui.gauge(0.9, {
 *   label: "Memory",
 *   thresholds: [
 *     { value: 0.8, variant: "warning" },
 *     { value: 0.95, variant: "error" }
 *   ]
 * })
 * ```
 */
function gauge(value: number, props: Omit<GaugeProps, "value"> = {}): VNode {
  return { kind: "gauge", props: { value, ...props } };
}

/**
 * Create an empty state widget.
 *
 * @param title - Main title text
 * @param props - Optional empty state props
 *
 * @example
 * ```ts
 * ui.empty("No results")
 * ui.empty("No messages", {
 *   icon: "ui.mail",
 *   description: "Messages will appear here",
 *   action: ui.button("compose", "Compose")
 * })
 * ```
 */
function empty(title: string, props: Omit<EmptyProps, "title"> = {}): VNode {
  return { kind: "empty", props: { title, ...props } };
}

/**
 * Create an error display widget.
 *
 * @param message - Error message
 * @param props - Optional error display props
 *
 * @example
 * ```ts
 * ui.errorDisplay("Failed to load data")
 * ui.errorDisplay("Connection failed", {
 *   title: "Network Error",
 *   onRetry: () => refetch()
 * })
 * ui.errorDisplay("Unexpected error", {
 *   stack: error.stack,
 *   showStack: true
 * })
 * ```
 */
function errorDisplay(message: string, props: Omit<ErrorDisplayProps, "message"> = {}): VNode {
  return { kind: "errorDisplay", props: { message, ...props } };
}

/**
 * Create a callout/alert widget.
 *
 * @param message - Callout message
 * @param props - Optional callout props
 *
 * @example
 * ```ts
 * ui.callout("This action cannot be undone", { variant: "warning" })
 * ui.callout("Changes saved successfully", { variant: "success" })
 * ui.callout("New feature available", {
 *   variant: "info",
 *   title: "What's New"
 * })
 * ```
 */
function callout(message: string, props: Omit<CalloutProps, "message"> = {}): VNode {
  return { kind: "callout", props: { message, ...props } };
}

/**
 * Create a sparkline widget (mini inline chart using block characters).
 *
 * @param data - Array of numeric data points
 * @param props - Optional sparkline props
 *
 * @example
 * ```ts
 * ui.sparkline([10, 20, 15, 30, 25])
 * ui.sparkline(cpuHistory, { width: 10 })
 * ui.sparkline(prices, { min: 0, max: 100 })
 * ```
 */
function sparkline(data: readonly number[], props: Omit<SparklineProps, "data"> = {}): VNode {
  return { kind: "sparkline", props: { data, ...props } };
}

/**
 * Create a bar chart widget.
 *
 * @param data - Array of bar chart items
 * @param props - Optional bar chart props
 *
 * @example
 * ```ts
 * ui.barChart([
 *   { label: "TypeScript", value: 60 },
 *   { label: "JavaScript", value: 30 },
 *   { label: "Python", value: 10 },
 * ])
 * ui.barChart(stats, { orientation: "vertical", showValues: true })
 * ```
 */
function barChart(data: readonly BarChartItem[], props: Omit<BarChartProps, "data"> = {}): VNode {
  return { kind: "barChart", props: { data, ...props } };
}

/**
 * Create a mini chart widget for compact multi-value display.
 *
 * @param values - Array of labeled values
 * @param props - Optional mini chart props
 *
 * @example
 * ```ts
 * ui.miniChart([
 *   { label: "CPU", value: 42, max: 100 },
 *   { label: "MEM", value: 78, max: 100 },
 * ])
 * ui.miniChart(metrics, { variant: "pills" })
 * ```
 */
function miniChart(
  values: readonly { label: string; value: number; max?: number }[],
  props: Omit<MiniChartProps, "values"> = {},
): VNode {
  return { kind: "miniChart", props: { values, ...props } };
}

function button(id: string, label: string): VNode;
function button(id: string, label: string, props: Omit<ButtonProps, "id" | "label">): VNode;
function button(props: ButtonProps): VNode;
function button(
  idOrProps: string | ButtonProps,
  label?: string,
  props?: Omit<ButtonProps, "id" | "label">,
): VNode {
  if (typeof idOrProps === "string") {
    return { kind: "button", props: { id: idOrProps, label: label ?? "", ...(props ?? {}) } };
  }
  return { kind: "button", props: idOrProps };
}

function input(id: string, value: string): VNode;
function input(id: string, value: string, props: Omit<InputProps, "id" | "value">): VNode;
function input(props: InputProps): VNode;
function input(
  idOrProps: string | InputProps,
  value?: string,
  props?: Omit<InputProps, "id" | "value">,
): VNode {
  if (typeof idOrProps === "string") {
    return { kind: "input", props: { id: idOrProps, value: value ?? "", ...(props ?? {}) } };
  }
  return { kind: "input", props: idOrProps };
}

function focusZone(props: FocusZoneProps, children: readonly UiChild[] = []): VNode {
  return { kind: "focusZone", props, children: filterChildren(children) };
}

function focusTrap(props: FocusTrapProps, children: readonly UiChild[] = []): VNode {
  return { kind: "focusTrap", props, children: filterChildren(children) };
}

function virtualList<T>(props: VirtualListProps<T>): VNode {
  return { kind: "virtualList", props: props as VirtualListProps<unknown> };
}

/**
 * Widget factory functions for building VNode trees.
 *
 * @example
 * ```ts
 * ui.column({ p: 1 }, [
 *   ui.text("Hello"),
 *   ui.button({ id: "ok", label: "OK" }),
 * ])
 * ```
 */
export const ui = {
  text,
  box,
  row,
  column,
  vstack,
  hstack,
  spacer,
  divider,
  icon,
  spinner,
  progress,
  skeleton,
  richText,
  kbd,
  badge,
  status,
  tag,
  gauge,
  empty,
  errorDisplay,
  callout,
  sparkline,
  barChart,
  miniChart,
  button,
  input,
  focusZone,
  focusTrap,
  virtualList,

  /**
   * Create a layers container for stacking overlays.
   * Later children render on top (higher z-order).
   *
   * @example
   * ```ts
   * ui.layers([
   *   MainContent(),
   *   state.showModal && ui.modal({ ... }),
   * ])
   * ```
   */
  layers(children: readonly UiChild[]): VNode {
    return { kind: "layers", props: {}, children: filterChildren(children) };
  },

  /**
   * Create a modal overlay.
   * Renders centered with optional backdrop and focus trap.
   *
   * @example
   * ```ts
   * ui.modal({
   *   id: "confirm",
   *   title: "Confirm Action",
   *   content: ui.text("Are you sure?"),
   *   actions: [
   *     ui.button({ id: "yes", label: "Yes" }),
   *     ui.button({ id: "no", label: "No" }),
   *   ],
   *   onClose: () => app.update({ showModal: false }),
   * })
   * ```
   */
  modal(props: ModalProps): VNode {
    return { kind: "modal", props };
  },

  /**
   * Create a dropdown menu positioned relative to an anchor.
   * Automatically flips when near screen edge.
   *
   * @example
   * ```ts
   * ui.dropdown({
   *   id: "file-menu",
   *   anchorId: "file-button",
   *   position: "below-start",
   *   items: [
   *     { id: "new", label: "New", shortcut: "Ctrl+N" },
   *     { id: "open", label: "Open", shortcut: "Ctrl+O" },
   *     { id: "divider", label: "", divider: true },
   *     { id: "exit", label: "Exit" },
   *   ],
   *   onSelect: (item) => handleAction(item.id),
   *   onClose: () => app.update({ menuOpen: false }),
   * })
   * ```
   */
  dropdown(props: DropdownProps): VNode {
    return { kind: "dropdown", props };
  },

  /**
   * Create a generic layer in the layer stack.
   * Use for custom overlays that need z-order control.
   *
   * @example
   * ```ts
   * ui.layer({
   *   id: "tooltip",
   *   content: ui.text("Tooltip text"),
   *   zIndex: 100,
   * })
   * ```
   */
  layer(props: LayerProps): VNode {
    return { kind: "layer", props };
  },

  /**
   * Create a table widget for displaying tabular data.
   * Supports sorting, selection, and virtualization for large datasets.
   *
   * @example
   * ```ts
   * ui.table({
   *   id: "files",
   *   columns: [
   *     { key: "name", header: "Name", flex: 1, sortable: true },
   *     { key: "size", header: "Size", width: 10, align: "right" },
   *     { key: "actions", header: "", width: 8, render: (_, row) =>
   *       ui.button({ id: `del-${row.id}`, label: "Del" }) },
   *   ],
   *   data: files,
   *   getRowKey: (f) => f.id,
   *   selection: state.selected,
   *   selectionMode: "multi",
   *   onSelectionChange: (keys) => app.update({ selected: keys }),
   *   sortColumn: state.sortCol,
   *   sortDirection: state.sortDir,
   *   onSort: (col, dir) => app.update({ sortCol: col, sortDir: dir }),
   * })
   * ```
   */
  table<T>(props: TableProps<T>): VNode {
    return { kind: "table", props: props as TableProps<unknown> };
  },

  /**
   * Create a tree widget for displaying hierarchical data.
   * Supports expand/collapse, selection, and lazy loading.
   *
   * @example
   * ```ts
   * ui.tree<FileNode>({
   *   id: "file-tree",
   *   data: fileSystem,
   *   getKey: (n) => n.path,
   *   getChildren: (n) => n.children,
   *   hasChildren: (n) => n.type === "directory",
   *   expanded: state.expandedPaths,
   *   selected: state.selectedPath,
   *   onToggle: (node, exp) => app.update(s => ({
   *     expandedPaths: exp
   *       ? [...s.expandedPaths, node.path]
   *       : s.expandedPaths.filter(p => p !== node.path)
   *   })),
   *   onSelect: (n) => app.update({ selectedPath: n.path }),
   *   onActivate: (n) => n.type === "file" && openFile(n.path),
   *   renderNode: (node, depth, state) => ui.row({ gap: 1 }, [
   *     ui.text(state.expanded ? "▼" : state.hasChildren ? "▶" : " "),
   *     ui.text(node.type === "directory" ? "📁" : "📄"),
   *     ui.text(node.name),
   *   ]),
   *   showLines: true,
   * })
   * ```
   */
  tree<T>(props: TreeProps<T>): VNode {
    return { kind: "tree", props: props as TreeProps<unknown> };
  },

  /* ========== Form Widgets (GitHub issue #119) ========== */

  /**
   * Create a field wrapper for form inputs.
   * Displays label, error message, and optional hint.
   *
   * @example
   * ```ts
   * ui.field({
   *   label: "Username",
   *   required: true,
   *   error: form.touched.username && form.errors.username,
   *   hint: "Enter your email address",
   *   children: ui.input({
   *     id: "username",
   *     value: form.values.username,
   *   }),
   * })
   * ```
   */
  field(props: FieldProps): VNode {
    return { kind: "field", props, children: Object.freeze([props.children]) };
  },

  /**
   * Create a select dropdown widget.
   * Supports keyboard navigation with ArrowUp/Down and Enter.
   *
   * @example
   * ```ts
   * ui.select({
   *   id: "country",
   *   value: form.values.country,
   *   options: [
   *     { value: "us", label: "United States" },
   *     { value: "uk", label: "United Kingdom" },
   *     { value: "ca", label: "Canada" },
   *   ],
   *   onChange: form.handleChange("country"),
   *   placeholder: "Select a country...",
   * })
   * ```
   */
  select(props: SelectProps): VNode {
    return { kind: "select", props };
  },

  /**
   * Create a checkbox widget.
   * Toggles with Space key.
   *
   * @example
   * ```ts
   * ui.checkbox({
   *   id: "remember",
   *   checked: form.values.remember,
   *   label: "Remember me",
   *   onChange: (c) => form.setFieldValue("remember", c),
   * })
   * ```
   */
  checkbox(props: CheckboxProps): VNode {
    return { kind: "checkbox", props };
  },

  /**
   * Create a radio group widget.
   * Supports keyboard navigation with ArrowUp/Down for selection.
   *
   * @example
   * ```ts
   * ui.radioGroup({
   *   id: "plan",
   *   value: form.values.plan,
   *   options: [
   *     { value: "free", label: "Free" },
   *     { value: "pro", label: "Pro" },
   *     { value: "enterprise", label: "Enterprise" },
   *   ],
   *   onChange: form.handleChange("plan"),
   *   direction: "vertical",
   * })
   * ```
   */
  radioGroup(props: RadioGroupProps): VNode {
    return { kind: "radioGroup", props };
  },

  /* ========== Advanced Widgets (GitHub issue #136) ========== */

  /**
   * Create a command palette widget for quick-access command execution.
   * Supports search, keyboard navigation, and multiple command sources.
   *
   * @example
   * ```ts
   * ui.commandPalette({
   *   id: "cmd-palette",
   *   open: state.paletteOpen,
   *   query: state.query,
   *   sources: [
   *     { id: "cmds", name: "Commands", prefix: ">", getItems: getCommands },
   *     { id: "files", name: "Files", getItems: searchFiles },
   *   ],
   *   selectedIndex: state.selectedIndex,
   *   onQueryChange: (q) => app.update({ query: q }),
   *   onSelect: (item) => executeCommand(item),
   *   onClose: () => app.update({ paletteOpen: false }),
   * })
   * ```
   */
  commandPalette(props: CommandPaletteProps): VNode {
    return { kind: "commandPalette", props };
  },

  /**
   * Create a file picker widget for browsing workspace files.
   * Supports expand/collapse, multi-select, and git status indicators.
   *
   * @example
   * ```ts
   * ui.filePicker({
   *   id: "file-picker",
   *   rootPath: "/workspace",
   *   data: fileTree,
   *   selectedPath: state.selectedFile,
   *   expandedPaths: state.expanded,
   *   modifiedPaths: state.gitModified,
   *   onSelect: (path) => app.update({ selectedFile: path }),
   *   onToggle: (path, exp) => toggleExpanded(path, exp),
   *   onOpen: (path) => openFile(path),
   * })
   * ```
   */
  filePicker(props: FilePickerProps): VNode {
    return { kind: "filePicker", props };
  },

  /**
   * Create a file tree explorer widget.
   * Provides tree view with expand/collapse and custom node rendering.
   *
   * @example
   * ```ts
   * ui.fileTreeExplorer({
   *   id: "explorer",
   *   data: fileTree,
   *   expanded: state.expanded,
   *   selected: state.selected,
   *   showIcons: true,
   *   showStatus: true,
   *   onToggle: (node, exp) => toggleNode(node, exp),
   *   onSelect: (node) => selectNode(node),
   *   onActivate: (node) => openNode(node),
   * })
   * ```
   */
  fileTreeExplorer(props: FileTreeExplorerProps): VNode {
    return { kind: "fileTreeExplorer", props };
  },

  /**
   * Create a split pane widget with draggable dividers.
   * Supports horizontal/vertical splits with resize constraints.
   *
   * @example
   * ```ts
   * ui.splitPane({
   *   id: "main-split",
   *   direction: "horizontal",
   *   sizes: [25, 50, 25],
   *   minSizes: [20, 30, 20],
   *   onResize: (sizes) => app.update({ panelSizes: sizes }),
   * }, [
   *   FileExplorer(),
   *   Editor(),
   *   LogsPanel(),
   * ])
   * ```
   */
  splitPane(props: SplitPaneProps, children: readonly VNode[] = []): VNode {
    return { kind: "splitPane", props, children };
  },

  /**
   * Create a panel group container for resizable panels.
   * Manages layout and resize state for child panels.
   *
   * @example
   * ```ts
   * ui.panelGroup({
   *   id: "panel-group",
   *   direction: "horizontal",
   * }, [
   *   ui.resizablePanel({ defaultSize: 25 }, [Sidebar()]),
   *   ui.resizablePanel({ defaultSize: 75, minSize: 50 }, [Content()]),
   * ])
   * ```
   */
  panelGroup(props: PanelGroupProps, children: readonly VNode[] = []): VNode {
    return { kind: "panelGroup", props, children };
  },

  /**
   * Create a resizable panel within a panel group.
   * Specifies size constraints for the panel.
   *
   * @example
   * ```ts
   * ui.resizablePanel({
   *   defaultSize: 30,
   *   minSize: 20,
   *   maxSize: 50,
   *   collapsible: true,
   * }, [PanelContent()])
   * ```
   */
  resizablePanel(props: ResizablePanelProps = {}, children: readonly VNode[] = []): VNode {
    return { kind: "resizablePanel", props, children };
  },

  /**
   * Create a code editor widget for multiline text editing.
   * Supports selections, keyboard navigation, and undo/redo.
   *
   * @example
   * ```ts
   * ui.codeEditor({
   *   id: "editor",
   *   lines: state.lines,
   *   cursor: state.cursor,
   *   selection: state.selection,
   *   scrollTop: state.scrollTop,
   *   scrollLeft: state.scrollLeft,
   *   lineNumbers: true,
   *   tabSize: 2,
   *   onChange: (lines, cursor) => app.update({ lines, cursor }),
   *   onSelectionChange: (sel) => app.update({ selection: sel }),
   *   onScroll: (top, left) => app.update({ scrollTop: top, scrollLeft: left }),
   * })
   * ```
   */
  codeEditor(props: CodeEditorProps): VNode {
    return { kind: "codeEditor", props };
  },

  /**
   * Create a diff viewer widget for displaying file changes.
   * Supports unified and side-by-side modes with hunk staging.
   *
   * @example
   * ```ts
   * ui.diffViewer({
   *   id: "diff",
   *   diff: fileDiff,
   *   mode: "unified",
   *   scrollTop: state.scrollTop,
   *   lineNumbers: true,
   *   contextLines: 3,
   *   onScroll: (top) => app.update({ scrollTop: top }),
   *   onStageHunk: (i) => stageHunk(i),
   *   onRevertHunk: (i) => revertHunk(i),
   * })
   * ```
   */
  diffViewer(props: DiffViewerProps): VNode {
    return { kind: "diffViewer", props };
  },

  /**
   * Create a tool approval dialog for reviewing tool execution.
   * Shows tool details, risk level, and approval actions.
   *
   * @example
   * ```ts
   * ui.toolApprovalDialog({
   *   id: "approval",
   *   open: state.pendingApproval !== null,
   *   request: state.pendingApproval,
   *   onAllow: () => executeTool(state.pendingApproval),
   *   onDeny: () => app.update({ pendingApproval: null }),
   *   onAllowForSession: () => allowForSession(state.pendingApproval),
   *   onClose: () => app.update({ pendingApproval: null }),
   * })
   * ```
   */
  toolApprovalDialog(props: ToolApprovalDialogProps): VNode {
    return { kind: "toolApprovalDialog", props };
  },

  /**
   * Create a logs console widget for streaming output.
   * Supports filtering, auto-scroll, and expandable entries.
   *
   * @example
   * ```ts
   * ui.logsConsole({
   *   id: "logs",
   *   entries: state.logs,
   *   autoScroll: true,
   *   levelFilter: ["info", "warn", "error"],
   *   scrollTop: state.logsScrollTop,
   *   showTimestamps: true,
   *   onScroll: (top) => app.update({ logsScrollTop: top }),
   *   onClear: () => app.update({ logs: [] }),
   * })
   * ```
   */
  logsConsole(props: LogsConsoleProps): VNode {
    return { kind: "logsConsole", props };
  },

  /**
   * Create a toast container for non-blocking notifications.
   * Manages toast stack and auto-dismiss.
   *
   * @example
   * ```ts
   * ui.toastContainer({
   *   toasts: state.toasts,
   *   position: "bottom-right",
   *   maxVisible: 5,
   *   onDismiss: (id) => app.update(s => ({
   *     toasts: s.toasts.filter(t => t.id !== id)
   *   })),
   * })
   * ```
   */
  toastContainer(props: ToastContainerProps): VNode {
    return { kind: "toastContainer", props };
  },
} as const;
