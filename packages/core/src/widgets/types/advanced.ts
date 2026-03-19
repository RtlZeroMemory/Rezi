import type { FocusConfig } from "../../focus/styles.js";
import type { LayoutConstraints } from "../../layout/types.js";
import type { TextStyle } from "../style.js";
import type { VNode } from "../types.js";
import type { OverlayFrameStyle } from "./overlaysShell.js";

/* ========== Advanced Widgets (GitHub issue #136) ========== */

/* ---------- CommandPalette Widget ---------- */

/** Source of commands for CommandPalette. */
export type CommandSource = Readonly<{
  /** Source identifier. */
  id: string;
  /** Source display name. */
  name: string;
  /** Prefix trigger (e.g., ">" for commands, "@" for symbols). */
  prefix?: string;
  /** Sync or async item provider. */
  getItems: (query: string) => readonly CommandItem[] | Promise<readonly CommandItem[]>;
  /** Priority for sorting (higher = first). */
  priority?: number;
}>;

/** Item in CommandPalette. */
export type CommandItem = Readonly<{
  /** Unique item identifier. */
  id: string;
  /** Display label. */
  label: string;
  /** Secondary description. */
  description?: string;
  /** Shortcut label shown with the item; enabled shortcuts are active only for the open topmost palette. */
  shortcut?: string;
  /** Icon character (single cell). */
  icon?: string;
  /** Source ID this item came from. */
  sourceId: string;
  /** Payload for onSelect. */
  data?: unknown;
  /** Whether item is disabled. */
  disabled?: boolean;
}>;

/** Props for CommandPalette widget. Quick-access command execution and navigation. */
export type CommandPaletteProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Visible state. */
  open: boolean;
  /** Current search query. */
  query: string;
  /** Command sources. */
  sources: readonly CommandSource[];
  /** Selected item index. */
  selectedIndex: number;
  /** Loading state for async sources. */
  loading?: boolean;
  /** Placeholder text. */
  placeholder?: string;
  /** Maximum visible items (default: 10). */
  maxVisible?: number;
  /** Palette width in cells (default: 60). */
  width?: number;
  /** Frame/surface colors for palette background, text, and border. */
  frameStyle?: OverlayFrameStyle;
  /** Optional style override for selected result row highlighting. */
  selectionStyle?: TextStyle;
  /** Callback when query changes. */
  onChange: (query: string) => void;
  /** Callback when item is selected. */
  onSelect: (item: CommandItem) => void;
  /** Callback when palette should close. */
  onClose: () => void;
  /** Callback when selection index changes. */
  onSelectionChange?: (index: number) => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
}>;

/* ---------- FilePicker & FileTreeExplorer Widgets ---------- */

/** Node in file tree. */
export type FileNode = Readonly<{
  /** File/directory name. */
  name: string;
  /** Full path. */
  path: string;
  /** Node type. */
  type: "file" | "directory";
  /** Child nodes (for directories). */
  children?: readonly FileNode[];
  /** Git status indicator. */
  status?: "modified" | "staged" | "untracked" | "deleted" | "renamed";
}>;

/** State information for a file tree node during rendering. */
export type FileNodeState = Readonly<{
  /** Whether the node is expanded. */
  expanded: boolean;
  /** Whether the node is selected. */
  selected: boolean;
  /** Whether the node is focused. */
  focused: boolean;
  /** Depth level in the tree (0 = root). */
  depth: number;
  /** Whether this is the first sibling. */
  isFirst: boolean;
  /** Whether this is the last sibling. */
  isLast: boolean;
  /** Whether the node has children. */
  hasChildren: boolean;
}>;

/** Props for FilePicker widget. Browse and select workspace files. */
export type FilePickerProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Root path for file browsing. */
  rootPath: string;
  /** File tree data to render (provided by app/runtime; core does not read the filesystem). */
  data: FileNode | readonly FileNode[];
  /** Currently selected file path. */
  selectedPath?: string;
  /** Expanded directory paths. */
  expandedPaths: readonly string[];
  /** Files with modified state. */
  modifiedPaths?: readonly string[];
  /** Files with staged state. */
  stagedPaths?: readonly string[];
  /** Optional style override for selected rows. */
  selectionStyle?: TextStyle;
  /** Filter pattern (glob). */
  filter?: string;
  /** Show hidden files. */
  showHidden?: boolean;
  /** Allow multiple selection. */
  multiSelect?: boolean;
  /** Selected paths for multi-select. */
  selection?: readonly string[];
  /** Callback when file is selected. */
  onSelect: (path: string) => void;
  /** Callback when directory expand state changes. */
  onChange: (path: string, expanded: boolean) => void;
  /** Callback when file is opened (double-click / Enter). */
  onPress: (path: string) => void;
  /** Callback when selection changes (multi-select). */
  onSelectionChange?: (paths: readonly string[]) => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
}> &
  LayoutConstraints;

/** Props for FileTreeExplorer widget. Tree view of files with expand/collapse. */
export type FileTreeExplorerProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** File tree data. */
  data: FileNode | readonly FileNode[];
  /** Expanded node paths. */
  expanded: readonly string[];
  /** Selected node path. */
  selected?: string;
  /** Focused node path (for keyboard nav). */
  focused?: string;
  /** Show file icons. */
  showIcons?: boolean;
  /** Show git status indicators. */
  showStatus?: boolean;
  /** Optional style override for selected rows. */
  selectionStyle?: TextStyle;
  /** Indentation per level (default: 2). */
  indentSize?: number;
  /** Callback when node expand state changes. */
  onChange: (node: FileNode, expanded: boolean) => void;
  /** Callback when node is selected. */
  onSelect: (node: FileNode) => void;
  /** Callback when node is activated (Enter / double-click). */
  onPress: (node: FileNode) => void;
  /** Callback for context menu (right-click / Menu key). */
  onContextMenu?: (node: FileNode) => void;
  /** Custom node renderer. */
  renderNode?: (node: FileNode, depth: number, state: FileNodeState) => VNode;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
}> &
  LayoutConstraints;

/* ---------- SplitPane & ResizablePanels Widgets ---------- */

/** Direction for split pane layout. */
export type SplitDirection = "horizontal" | "vertical";

/** Props for SplitPane widget. Draggable divider between panels. */
export type SplitPaneProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Split direction. */
  direction: SplitDirection;
  /** Panel sizes (percentages 0-100 or absolute cells). */
  sizes: readonly number[];
  /** Size mode. */
  sizeMode?: "percent" | "absolute";
  /** Minimum panel sizes. */
  minSizes?: readonly number[];
  /** Maximum panel sizes. */
  maxSizes?: readonly number[];
  /** Divider size in cells (default: 1). */
  dividerSize?: number;
  /** Allow collapsing panels. */
  collapsible?: boolean;
  /** Collapsed panel indices. */
  collapsed?: readonly number[];
  /** Callback when sizes change from dragging. */
  onChange: (sizes: readonly number[]) => void;
  /** Callback when panel collapse state changes. */
  onCollapse?: (index: number, collapsed: boolean) => void;
}>;

/** Props for ResizablePanel widget. Panel within SplitPane/PanelGroup. */
export type ResizablePanelProps = Readonly<{
  key?: string;
  /** Initial size (percent or cells based on parent sizeMode). */
  defaultSize?: number;
  /** Minimum size. */
  minSize?: number;
  /** Maximum size. */
  maxSize?: number;
  /** Whether panel can be collapsed. */
  collapsible?: boolean;
}>;

/** Props for PanelGroup widget. Container for resizable panels. */
export type PanelGroupProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Layout direction. */
  direction: SplitDirection;
}>;

/* ---------- CodeEditor Widget ---------- */

/** Cursor position in CodeEditor. */
export type CursorPosition = Readonly<{
  /** Line number (0-indexed). */
  line: number;
  /** Column number (0-indexed, in characters not cells). */
  column: number;
}>;

/** Selection range in CodeEditor. */
export type EditorSelection = Readonly<{
  /** Selection anchor (start). */
  anchor: CursorPosition;
  /** Selection active end (cursor position). */
  active: CursorPosition;
}>;

/** Search match in CodeEditor. */
export type SearchMatch = Readonly<{
  /** Line number of match. */
  line: number;
  /** Start column of match. */
  startColumn: number;
  /** End column of match. */
  endColumn: number;
}>;

/** Diagnostic severity for CodeEditor inline markers. */
export type CodeEditorDiagnosticSeverity = "error" | "warning" | "info" | "hint";

/** Inline diagnostic range rendered in CodeEditor. */
export type CodeEditorDiagnostic = Readonly<{
  /** 0-based line index. */
  line: number;
  /** 0-based start column. */
  startColumn: number;
  /** 0-based end column (exclusive). */
  endColumn: number;
  /** Severity bucket controlling underline color. */
  severity: CodeEditorDiagnosticSeverity;
  /** Optional diagnostic message. */
  message?: string;
}>;

/** Built-in syntax language presets for CodeEditor tokenization. */
export type CodeEditorSyntaxLanguage =
  | "plain"
  | "typescript"
  | "javascript"
  | "json"
  | "go"
  | "rust"
  | "c"
  | "cpp"
  | "c++"
  | "csharp"
  | "c#"
  | "java"
  | "python"
  | "bash";

/** Semantic token buckets produced by CodeEditor syntax tokenizers. */
export type CodeEditorSyntaxTokenKind =
  | "plain"
  | "keyword"
  | "type"
  | "string"
  | "number"
  | "comment"
  | "operator"
  | "punctuation"
  | "function"
  | "variable";

/** Single syntax token emitted by a CodeEditor line tokenizer. */
export type CodeEditorSyntaxToken = Readonly<{
  /** Token text (must map back to the source line). */
  text: string;
  /** Semantic token kind used for style mapping. */
  kind: CodeEditorSyntaxTokenKind;
}>;

/** Context passed to custom CodeEditor line tokenizers. */
export type CodeEditorTokenizeContext = Readonly<{
  /** Active syntax language preset. */
  language: CodeEditorSyntaxLanguage;
  /** 0-based document line index. */
  lineNumber: number;
}>;

/** Optional custom per-line tokenizer for CodeEditor. */
export type CodeEditorLineTokenizer = (
  line: string,
  context: CodeEditorTokenizeContext,
) => readonly CodeEditorSyntaxToken[];

/** Props for CodeEditor widget. Multiline text editing with selections. */
export type CodeEditorProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Document content (lines). */
  lines: readonly string[];
  /** Cursor position. */
  cursor: CursorPosition;
  /** Selection (null if no selection). */
  selection: EditorSelection | null;
  /** Scroll position (lines from top). */
  scrollTop: number;
  /** Horizontal scroll position (columns from left). */
  scrollLeft: number;
  /** Tab size in spaces (default: 2). */
  tabSize?: number;
  /** Insert spaces instead of tabs (default: true). */
  insertSpaces?: boolean;
  /** Show line numbers (default: true). */
  lineNumbers?: boolean;
  /** Wrap long lines (default: false). */
  wordWrap?: boolean;
  /** Read-only mode. */
  readOnly?: boolean;
  /** Search query. */
  searchQuery?: string;
  /** Search match positions. */
  searchMatches?: readonly SearchMatch[];
  /** Currently highlighted match index. */
  currentMatchIndex?: number;
  /** Optional diagnostics rendered as styled underlines. */
  diagnostics?: readonly CodeEditorDiagnostic[];
  /** Built-in syntax language preset (default: "plain"). */
  syntaxLanguage?: CodeEditorSyntaxLanguage;
  /** Optional custom tokenizer for per-line syntax highlighting. */
  tokenizeLine?: CodeEditorLineTokenizer;
  /** Render a visible highlighted cursor cell (default: true). */
  highlightActiveCursorCell?: boolean;
  /** Callback when content changes. */
  onChange: (lines: readonly string[], cursor: CursorPosition) => void;
  /** Callback when selection changes. */
  onSelectionChange: (selection: EditorSelection | null) => void;
  /** Callback when scroll position changes. */
  onScroll: (scrollTop: number, scrollLeft: number) => void;
  /** Callback for undo action. */
  onUndo?: () => void;
  /** Callback for redo action. */
  onRedo?: () => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Scrollbar glyph variant (default: "minimal"). */
  scrollbarVariant?: "minimal" | "classic" | "modern" | "dots" | "thin";
  /** Optional style override for rendered scrollbar. */
  scrollbarStyle?: TextStyle;
}> &
  LayoutConstraints;

/* ---------- DiffViewer Widget ---------- */

/** Line in a diff hunk. */
export type DiffLine = Readonly<{
  /** Line type. */
  type: "context" | "add" | "delete";
  /** Line content. */
  content: string;
  /** Original line number (for context and delete). */
  oldLineNumber?: number;
  /** New line number (for context and add). */
  newLineNumber?: number;
  /** Intra-line change highlights as [start, end] pairs. */
  highlights?: readonly (readonly [number, number])[];
}>;

/** Diff hunk containing a group of changes. */
export type DiffHunk = Readonly<{
  /** Original line range start. */
  oldStart: number;
  /** Original line count. */
  oldCount: number;
  /** New line range start. */
  newStart: number;
  /** New line count. */
  newCount: number;
  /** Header text (e.g., function name). */
  header?: string;
  /** Diff lines in this hunk. */
  lines: readonly DiffLine[];
}>;

/** Complete diff data for a file. */
export type DiffData = Readonly<{
  /** Original file path. */
  oldPath: string;
  /** New file path. */
  newPath: string;
  /** Diff hunks. */
  hunks: readonly DiffHunk[];
  /** Binary file flag. */
  isBinary?: boolean;
  /** File change status. */
  status: "added" | "deleted" | "modified" | "renamed" | "copied";
}>;

/** Props for DiffViewer widget. Show unified or side-by-side diffs. */
export type DiffViewerProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Diff data to display. */
  diff: DiffData;
  /** View mode. */
  mode: "unified" | "sideBySide";
  /** Scroll position (lines from top). */
  scrollTop: number;
  /** Expanded hunk indices (collapsed by default if > threshold). */
  expandedHunks?: readonly number[];
  /** Currently focused hunk index. */
  focusedHunk?: number;
  /** Show line numbers. */
  lineNumbers?: boolean;
  /** Context lines around changes (default: 3). */
  contextLines?: number;
  /** Optional style override for focused hunk header. */
  focusedHunkStyle?: TextStyle;
  /** Callback when scroll position changes. */
  onScroll: (scrollTop: number) => void;
  /** Callback when hunk expand state changes. */
  onHunkToggle?: (hunkIndex: number, expanded: boolean) => void;
  /** Callback to stage a hunk. */
  onStageHunk?: (hunkIndex: number) => void;
  /** Callback to unstage a hunk. */
  onUnstageHunk?: (hunkIndex: number) => void;
  /** Callback to apply a hunk. */
  onApplyHunk?: (hunkIndex: number) => void;
  /** Callback to revert a hunk. */
  onRevertHunk?: (hunkIndex: number) => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Scrollbar glyph variant (default: "minimal"). */
  scrollbarVariant?: "minimal" | "classic" | "modern" | "dots" | "thin";
  /** Optional style override for rendered scrollbar. */
  scrollbarStyle?: TextStyle;
}> &
  LayoutConstraints;

/* ---------- ToolApprovalDialog Widget ---------- */

/** File change in a tool request. */
export type ToolFileChange = Readonly<{
  /** File path. */
  path: string;
  /** Type of change. */
  changeType: "create" | "modify" | "delete" | "rename";
  /** Preview of changes (first N lines). */
  preview?: string;
  /** Old path for renames. */
  oldPath?: string;
}>;

/** Tool request being approved. */
export type ToolRequest = Readonly<{
  /** Tool identifier. */
  toolId: string;
  /** Tool display name. */
  toolName: string;
  /** Tool description. */
  description?: string;
  /** Command to execute (if CLI tool). */
  command?: string;
  /** Files that will be modified. */
  fileChanges?: readonly ToolFileChange[];
  /** Risk level. */
  riskLevel: "low" | "medium" | "high";
  /** Additional context/arguments. */
  args?: Record<string, unknown>;
}>;

/** Props for ToolApprovalDialog widget. Modal for reviewing tool execution. */
export type ToolApprovalDialogProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Tool request being approved. */
  request: ToolRequest;
  /** Visible state. */
  open: boolean;
  /** Dialog width in cells (default: 50). */
  width?: number;
  /** Dialog height in cells (default: 15). */
  height?: number;
  /** Focused action button. */
  focusedAction?: "allow" | "deny" | "allowSession";
  /** Callback when an allow/deny action is pressed. */
  onPress: (action: "allow" | "deny") => void;
  /** Callback when allowed for session. */
  onAllowForSession?: () => void;
  /** Callback when dialog should close. */
  onClose: () => void;
}>;

/* ---------- LogsConsole Widget ---------- */

/** Log severity level. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** Token usage count. */
export type TokenCount = Readonly<{
  /** Input tokens. */
  input: number;
  /** Output tokens. */
  output: number;
  /** Total tokens. */
  total: number;
}>;

/** Log entry in LogsConsole. */
export type LogEntry = Readonly<{
  /** Unique entry identifier. */
  id: string;
  /** Timestamp (Unix ms). */
  timestamp: number;
  /** Log level. */
  level: LogLevel;
  /** Source/category. */
  source: string;
  /** Log message. */
  message: string;
  /** Expandable details. */
  details?: string;
  /** Token count (for LLM responses). */
  tokens?: TokenCount;
  /** Duration in milliseconds. */
  durationMs?: number;
  /** Cost in cents. */
  costCents?: number;
}>;

/** Props for LogsConsole widget. Streaming tool output and events. */
export type LogsConsoleProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** Log entries. */
  entries: readonly LogEntry[];
  /** Auto-scroll to bottom (default: true). */
  autoScroll?: boolean;
  /** Filter by log level. */
  levelFilter?: readonly LogLevel[];
  /** Filter by source. */
  sourceFilter?: readonly string[];
  /** Search query. */
  searchQuery?: string;
  /** Scroll position (entries from top). */
  scrollTop: number;
  /** Show timestamps (default: true). */
  showTimestamps?: boolean;
  /** Show source labels (default: true). */
  showSource?: boolean;
  /** Expanded entry IDs. */
  expandedEntries?: readonly string[];
  /** Optional style override for focused-console ring. */
  focusedStyle?: TextStyle;
  /** Callback when scroll position changes. */
  onScroll: (scrollTop: number) => void;
  /** Callback when entry expand state changes. */
  onChange?: (entryId: string, expanded: boolean) => void;
  /** Callback to clear logs. */
  onPress?: () => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /** Scrollbar glyph variant (default: "minimal"). */
  scrollbarVariant?: "minimal" | "classic" | "modern" | "dots" | "thin";
  /** Optional style override for rendered scrollbar. */
  scrollbarStyle?: TextStyle;
}> &
  LayoutConstraints;

/* ---------- Toast/Notifications Widget ---------- */

/** Position for toast container. */
export type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Action button in a toast. */
export type ToastAction = Readonly<{
  /** Action button label. */
  label: string;
  /** Callback when action is clicked. */
  onAction: () => void;
}>;

/** Toast notification. */
export type Toast = Readonly<{
  /** Unique toast identifier. */
  id: string;
  /** Message text. */
  message: string;
  /** Toast type. */
  type: "info" | "success" | "warning" | "error";
  /** Auto-dismiss duration in ms (0 = persistent, default: 3000). */
  duration?: number;
  /** Action button. */
  action?: ToastAction;
  /** Progress indicator (0-100). */
  progress?: number;
}>;

/** Props for ToastContainer widget. Non-blocking feedback messages. */
export type ToastContainerProps = Readonly<{
  key?: string;
  /** Active toasts. */
  toasts: readonly Toast[];
  /** Position on screen (default: "bottom-right"). */
  position?: ToastPosition;
  /** Maximum visible toasts (default: 5). */
  maxVisible?: number;
  /** Toast container width in cells (default: 40). */
  width?: number;
  /** Frame/surface colors for toast backgrounds, text, and borders. */
  frameStyle?: OverlayFrameStyle;
  /** Callback when toast is dismissed. */
  onClose: (id: string) => void;
}>;
