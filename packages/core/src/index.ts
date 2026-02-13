/**
 * @rezi-ui/core
 *
 * Runtime-agnostic TypeScript core for Rezi.
 * This package MUST NOT use Node-specific APIs (Buffer, worker_threads, node:* imports).
 *
 * @see docs/guide/concepts.md
 * @see docs/dev/repo-layout.md
 */

// =============================================================================
// Re-exports from modules
// =============================================================================

export {
  // ABI version pins
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,
  ZR_EVENT_BATCH_VERSION_V1,
  ZR_UNICODE_VERSION_MAJOR,
  ZR_UNICODE_VERSION_MINOR,
  ZR_UNICODE_VERSION_PATCH,
  ZRDL_MAGIC,
  ZREV_MAGIC,
  // Cursor shape constants (v2+)
  ZR_CURSOR_SHAPE_BLOCK,
  ZR_CURSOR_SHAPE_UNDERLINE,
  ZR_CURSOR_SHAPE_BAR,
  type CursorShape,
  // ZrResult enum
  ZrResult,
  // Error types
  ZrUiError,
  type ZrUiErrorCode,
} from "./abi.js";

// =============================================================================
// Version surface (locked) + text measurement pin
// =============================================================================

import {
  ZR_DRAWLIST_VERSION_V1,
  ZR_DRAWLIST_VERSION_V2,
  ZR_ENGINE_ABI_MAJOR,
  ZR_ENGINE_ABI_MINOR,
  ZR_ENGINE_ABI_PATCH,
  ZR_EVENT_BATCH_VERSION_V1,
  ZR_UNICODE_VERSION_MAJOR,
  ZR_UNICODE_VERSION_MINOR,
  ZR_UNICODE_VERSION_PATCH,
} from "./abi.js";

export {
  ZRUI_TEXT_MEASURE_VERSION,
  measureTextCells,
  truncateWithEllipsis,
  truncateMiddle,
  clearTextMeasureCache,
  getTextMeasureCacheSize,
} from "./layout/textMeasure.js";

export const ZR_ENGINE_ABI = {
  major: ZR_ENGINE_ABI_MAJOR,
  minor: ZR_ENGINE_ABI_MINOR,
  patch: ZR_ENGINE_ABI_PATCH,
} as const;

export const ZR_UNICODE_VERSION = {
  major: ZR_UNICODE_VERSION_MAJOR,
  minor: ZR_UNICODE_VERSION_MINOR,
  patch: ZR_UNICODE_VERSION_PATCH,
} as const;

export const ZR_DRAWLIST_VERSION: 1 = ZR_DRAWLIST_VERSION_V1;
export const ZR_EVENT_BATCH_VERSION: 1 = ZR_EVENT_BATCH_VERSION_V1;

export {
  BACKEND_DRAWLIST_V2_MARKER,
  BACKEND_FPS_CAP_MARKER,
  BACKEND_MAX_EVENT_BYTES_MARKER,
  FRAME_ACCEPTED_ACK_MARKER,
  type BackendEventBatch,
  type RuntimeBackend,
} from "./backend.js";

export type {
  ZrevKeyAction,
  ZrevMouseKind,
  ZrevEvent,
  UiEvent,
} from "./events.js";

export type { ParseError, ParseErrorCode, ParseResult } from "./protocol/types.js";
export { parseEventBatchV1, type ParseEventBatchV1Opts } from "./protocol/zrev_v1.js";

export type { DrawApi } from "./drawApi.js";

// =============================================================================
// Widgets (MVP)
// =============================================================================

export type {
  Align,
  AlignItems,
  BackdropStyle,
  BadgeProps,
  BadgeVariant,
  BarChartItem,
  BarChartProps,
  BoxProps,
  BoxShadow,
  ButtonProps,
  CalloutProps,
  CheckboxProps,
  DividerProps,
  DropdownItem,
  DropdownPosition,
  DropdownProps,
  EmptyProps,
  ErrorDisplayProps,
  FieldProps,
  GaugeProps,
  IconProps,
  InputProps,
  ItemHeightSpec,
  JustifyContent,
  KbdProps,
  LayerProps,
  LayersProps,
  MiniChartProps,
  ModalProps,
  NodeState,
  ProgressProps,
  ProgressVariant,
  RadioGroupProps,
  RichTextProps,
  RichTextSpan,
  SelectOption,
  SelectProps,
  SliderProps,
  SkeletonProps,
  SkeletonVariant,
  SpacerProps,
  SpacingProps,
  SparklineProps,
  SpinnerProps,
  StatusProps,
  StatusType,
  StackProps,
  TagProps,
  TableBorderStyle,
  TableBorderVariant,
  TableColumn,
  TableColumnOverflow,
  TableProps,
  TableStripeStyle,
  TextProps,
  TextVariant,
  TreeProps,
  VirtualListProps,
  VNode,
  // Advanced widgets (GitHub issue #136)
  CommandPaletteProps,
  CommandSource,
  CommandItem,
  FilePickerProps,
  FileTreeExplorerProps,
  FileNode,
  FileNodeState,
  SplitPaneProps,
  SplitDirection,
  PanelGroupProps,
  ResizablePanelProps,
  CodeEditorProps,
  CursorPosition,
  EditorSelection,
  SearchMatch,
  DiffViewerProps,
  DiffData,
  DiffHunk,
  DiffLine,
  ToolApprovalDialogProps,
  ToolRequest,
  ToolFileChange,
  LogsConsoleProps,
  LogEntry,
  LogLevel,
  TokenCount,
  ToastContainerProps,
  Toast,
  ToastAction,
  ToastPosition,
} from "./widgets/types.js";
export { ui } from "./widgets/ui.js";

// =============================================================================
// Widget Composition API (GitHub issue #116)
// =============================================================================

export {
  defineWidget,
  createWidgetContext,
  isCompositeVNode,
  getCompositeMeta,
  scopedId,
  type CompositeRenderResult,
  type CompositeVNode,
  type CompositeWidgetMeta,
  type DefineWidgetOptions,
  type WidgetContext,
  type WidgetFactory,
  type WidgetPropsBase,
} from "./widgets/composition.js";

// =============================================================================
// Instance Registry (for composite widgets)
// =============================================================================

export {
  createCompositeInstanceRegistry,
  createHookContext,
  gcUnmountedInstances,
  runPendingEffects,
  type CompositeInstanceRegistry,
  type CompositeInstanceState,
  type EffectCleanup,
  type EffectState,
  type HookContext,
  type HookState,
  type RefState,
} from "./runtime/instances.js";

// =============================================================================
// Layer System (GitHub issue #117)
// =============================================================================

export {
  closeTopmostLayer,
  createLayerRegistry,
  createLayerStackState,
  getBackdrops,
  getTopmostLayerId,
  hitTestLayers,
  popLayer,
  pushLayer,
  type BackdropConfig,
  type Layer,
  type LayerHitTestResult,
  type LayerInput,
  type LayerRegistry,
  type LayerStackState,
} from "./runtime/layers.js";

export {
  calculateAnchorPosition,
  calculateCenteredPosition,
  calculateModalSize,
  createAnchorLookup,
  type AnchorLookup,
  type CenterOptions,
  type ModalSizeOptions,
  type PositionOptions,
  type PositionResult,
  type Viewport,
} from "./layout/positioning.js";

export {
  routeDropdownKey,
  routeLayerEscape,
  type DropdownRoutingCtx,
  type DropdownRoutingResult,
  type LayerRoutingCtx,
  type LayerRoutingResult,
} from "./runtime/router.js";
export {
  computeVisibleRange,
  ensureVisible,
  getItemHeight,
  getItemOffset,
  getTotalHeight,
  clampScrollTop,
  type VisibleRangeResult,
} from "./widgets/virtualList.js";
export { rgb, type Rgb, type TextStyle } from "./widgets/style.js";

// =============================================================================
// Spacing Scale
// =============================================================================

export {
  SPACING_SCALE,
  isSpacingKey,
  resolveSpacingValue,
  resolveSpacingWithDefault,
  type SpacingKey,
  type SpacingValue,
} from "./layout/spacing-scale.js";

// =============================================================================
// Theme
// =============================================================================

export {
  // Legacy theme system
  createTheme,
  defaultTheme,
  resolveColor,
  resolveSpacing,
  type Theme,
  type ThemeColors,
  type ThemeSpacing,
  // New semantic token system
  color,
  createColorTokens,
  createThemeDefinition,
  type AccentTokens,
  type BgTokens,
  type BorderTokens,
  type ColorTokens,
  type DisabledTokens,
  type FgTokens,
  type FocusTokens,
  type SelectedTokens,
  type ThemeDefinition,
  // Theme presets
  darkTheme,
  lightTheme,
  dimmedTheme,
  highContrastTheme,
  nordTheme,
  draculaTheme,
  themePresets,
  type ThemePresetName,
  // Resolution utilities
  resolveColorToken,
  tryResolveColorToken,
  resolveColorOrRgb,
  isValidColorPath,
  type ColorPath,
  type ResolveColorResult,
} from "./theme/index.js";

// =============================================================================
// Widget Utilities
// =============================================================================

export { each, type EachOptions } from "./widgets/collections.js";
export { match, maybe, show, when } from "./widgets/conditionals.js";
export { styled } from "./widgets/styled.js";
export { extendStyle, mergeStyles, styleWhen, styles } from "./widgets/styleUtils.js";
export {
  alertDialog,
  confirmDialog,
  promptDialog,
  type AlertDialogProps,
  type ConfirmDialogProps,
  type PromptDialogProps,
} from "./widgets/dialogs/index.js";
export { debug, inspect } from "./debug/debug.js";

// =============================================================================
// Drawlist Builder (ZRDL v1 + v2)
// =============================================================================

export { createDrawlistBuilderV1, type DrawlistBuilderV1Opts } from "./drawlist/index.js";
export { createDrawlistBuilderV2, type DrawlistBuilderV2Opts } from "./drawlist/index.js";
export type {
  CursorState,
  DrawlistBuildError,
  DrawlistBuildErrorCode,
  DrawlistBuildResult,
  DrawlistBuilderV1,
  DrawlistBuilderV2,
} from "./drawlist/index.js";

// =============================================================================
// Border & Shadow
// =============================================================================

export {
  // Border glyph sets
  SINGLE,
  DOUBLE,
  ROUNDED,
  HEAVY,
  DASHED,
  HEAVY_DASHED,
  getBorderGlyphs,
  isBorderStyle,
  type BorderStyle,
  type BorderGlyphSet,
  type BorderGlyphs,
} from "./renderer/boxGlyphs.js";

export {
  // Shadow rendering
  DEFAULT_SHADOW,
  SHADOW_LIGHT,
  SHADOW_MEDIUM,
  SHADOW_DENSE,
  createShadowConfig,
  renderShadow,
  getRectWithShadow,
  type ShadowConfig,
  type ShadowDensity,
} from "./renderer/shadow.js";

export {
  // Scrollbar system
  SCROLLBAR_MINIMAL,
  SCROLLBAR_CLASSIC,
  SCROLLBAR_MODERN,
  SCROLLBAR_DOTS,
  SCROLLBAR_THIN,
  SCROLLBAR_CONFIGS,
  getScrollbarGlyphs,
  calculateThumb,
  renderVerticalScrollbar,
  renderHorizontalScrollbar,
  type ScrollbarGlyphSet,
  type ScrollbarConfig,
  type ScrollbarVariant,
  type ScrollbarState,
} from "./renderer/scrollbar.js";

export {
  // Focus styling system
  FOCUS_RING_SINGLE,
  FOCUS_RING_DOUBLE,
  FOCUS_RING_ROUNDED,
  FOCUS_RING_HEAVY,
  FOCUS_RING_DASHED,
  FOCUS_RING_DOTTED,
  FOCUS_BRACKETS_SQUARE,
  FOCUS_BRACKETS_ANGLE,
  FOCUS_BRACKETS_DOUBLE_ANGLE,
  FOCUS_BRACKETS_CHEVRON,
  FOCUS_ARROW_STANDARD,
  FOCUS_ARROW_TRIANGLE,
  FOCUS_DOT,
  FOCUS_CARET,
  CURSOR_CHARS,
  KEYBOARD_HINTS,
  DEFAULT_FOCUS_CONFIGS,
  getFocusRingGlyphs,
  formatKeyboardHint,
  shouldShowFocusRing,
  getDefaultFocusConfig,
  type FocusRingGlyphSet,
  type FocusIndicatorType,
  type FocusRingVariant,
  type FocusConfig,
  type FocusAnimation,
  type FocusBracketSet,
  type FocusArrowSet,
  type CursorLineStyle,
  type CursorLineConfig,
  type KeyboardHintConfig,
  type FocusState,
} from "./focus/styles.js";

// =============================================================================
// Icons
// =============================================================================

export {
  // Icon registries
  FILE_ICONS,
  STATUS_ICONS,
  ARROW_ICONS,
  GIT_ICONS,
  UI_ICONS,
  SPINNER_FRAMES,
  icons,
  // Resolution
  resolveIcon,
  getIconChar,
  getSpinnerFrame,
  // Types
  type IconDefinition,
  type IconCategory,
  type IconPath,
  type FileIconName,
  type StatusIconName,
  type ArrowIconName,
  type GitIconName,
  type UiIconName,
  type SpinnerVariant,
} from "./icons/index.js";

// =============================================================================
// Terminal Capabilities
// =============================================================================

export {
  COLOR_MODE_UNKNOWN,
  COLOR_MODE_16,
  COLOR_MODE_256,
  COLOR_MODE_RGB,
  DEFAULT_TERMINAL_CAPS,
  supportsCursorProtocol,
  supportsCursorShaping,
  getBestColorMode,
  type ColorMode,
  type TerminalCaps,
} from "./terminalCaps.js";

// =============================================================================
// Cursor State API (v2)
// =============================================================================

export {
  createCursorStateCollector,
  computeInputCursorPosition,
  CURSOR_DEFAULTS,
  type CursorRequest,
  type CursorStateCollector,
} from "./cursor/index.js";

// =============================================================================
// Virtual List State
// =============================================================================

export {
  createVirtualListStateStore,
  type VirtualListLocalState,
  type VirtualListLocalStatePatch,
  type VirtualListStateStore,
} from "./runtime/localState.js";

export {
  routeVirtualListKey,
  routeVirtualListWheel,
  type VirtualListRoutingCtx,
  type VirtualListRoutingResult,
  type VirtualListWheelCtx,
} from "./runtime/router.js";

// =============================================================================
// Table Widget (GitHub issue #118)
// =============================================================================

export {
  alignCellText,
  clearSelection,
  computeSelection,
  distributeColumnWidths,
  extractRowKeys,
  getRowIndex,
  getRowKeyAtIndex,
  getSortIndicator,
  selectAll,
  SORT_INDICATOR_ASC,
  SORT_INDICATOR_DESC,
  toggleSort,
  type CellAlign,
  type ColumnWidthResult,
  type SelectionResult,
  type SortDirection,
  type SortResult,
  type TableSelectionMode,
} from "./widgets/table.js";

export {
  createTableStateStore,
  type TableLocalState,
  type TableLocalStatePatch,
  type TableStateStore,
} from "./runtime/localState.js";

export {
  routeTableKey,
  type TableRoutingCtx,
  type TableRoutingResult,
} from "./runtime/router.js";

// =============================================================================
// Tree Widget (GitHub issue #122)
// =============================================================================

export {
  collapseNode,
  computeNodeState,
  createLoadingState,
  expandAllSiblings,
  expandNode,
  EXPAND_INDICATORS,
  findFirstChildIndex,
  findNextSiblingIndex,
  findNodeIndex,
  findParentIndex,
  findPrevSiblingIndex,
  flattenTree,
  getExpandIndicator,
  getTreeLinePrefix,
  getTotalVisibleNodes,
  toggleExpanded,
  TREE_CHARS,
  type FlattenedNode,
  type LoadingState,
} from "./widgets/tree.js";

export {
  createTreeStateStore,
  type TreeLocalState,
  type TreeLocalStatePatch,
  type TreeStateStore,
} from "./runtime/localState.js";

export {
  routeTreeKey,
  type TreeRoutingCtx,
  type TreeRoutingResult,
} from "./runtime/router.js";

// =============================================================================
// Form System (GitHub issue #119)
// =============================================================================

export {
  useForm,
  createDebouncedAsyncValidator,
  DEFAULT_ASYNC_DEBOUNCE_MS,
  isValidationClean,
  mergeValidationErrors,
  runAsyncValidation,
  runFieldValidation,
  runSyncValidation,
  bind,
  bindChecked,
  bindSelect,
  bindTransform,
  type FormState,
  type UseFormOptions,
  type UseFormReturn,
  type ValidationContext,
  type ValidationResult,
} from "./forms/index.js";

export {
  buildFieldLabel,
  FIELD_ERROR_STYLE,
  FIELD_HINT_STYLE,
  FIELD_LABEL_STYLE,
  REQUIRED_INDICATOR,
  shouldShowError,
} from "./widgets/field.js";

export {
  DEFAULT_PLACEHOLDER,
  findOptionIndex,
  getNextOptionIndex,
  getPrevOptionIndex,
  getSelectDisplayText,
  SELECT_INDICATOR_CLOSED,
  SELECT_INDICATOR_OPEN,
} from "./widgets/select.js";

export {
  buildCheckboxText,
  CHECKBOX_CHECKED,
  CHECKBOX_DISABLED_CHECKED,
  CHECKBOX_DISABLED_UNCHECKED,
  CHECKBOX_UNCHECKED,
  getCheckboxIndicator,
  toggleCheckbox,
} from "./widgets/checkbox.js";

export {
  buildRadioOptionText,
  findSelectedIndex,
  getNextRadioIndex,
  getPrevRadioIndex,
  getRadioIndicator,
  RADIO_DISABLED_SELECTED,
  RADIO_DISABLED_UNSELECTED,
  RADIO_SELECTED,
  RADIO_UNSELECTED,
  selectRadioAtIndex,
} from "./widgets/radioGroup.js";

// =============================================================================
// Binary Safety Utilities
// =============================================================================

export { BinaryReader } from "./binary/reader.js";

export { BinaryWriter } from "./binary/writer.js";

export {
  ZrBinaryError,
  type ZrBinaryErrorCode,
  type ZrBinaryErrorInit,
} from "./binary/parseError.js";

// =============================================================================
// Keybindings
// =============================================================================

export type {
  KeyBinding,
  KeyContext,
  KeySequence,
  ModeDefinition,
  Modifiers,
  ParsedKey,
} from "./keybindings/index.js";

export {
  CHORD_TIMEOUT_MS,
  DEFAULT_MODE,
  parseKeySequence,
} from "./keybindings/index.js";

export type { BindingMap, ModeBindingMap } from "./keybindings/index.js";

// =============================================================================
// App Types
// =============================================================================

import type { DrawApi } from "./drawApi.js";
import type { UiEvent } from "./events.js";
import type { BindingMap, KeyContext, ModeBindingMap } from "./keybindings/index.js";
import type { Rect } from "./layout/types.js";
import type { Theme } from "./theme/theme.js";
import type { ThemeDefinition } from "./theme/tokens.js";
import type { VNode } from "./widgets/types.js";

export type ViewFn<S> = (state: Readonly<S>) => VNode;
export type DrawFn = (g: DrawApi) => void;
export type EventHandler = (ev: UiEvent) => void;
export type AppRenderMetrics = Readonly<{ renderTime: number }>;
export type AppLayoutSnapshot = Readonly<{ idRects: ReadonlyMap<string, Rect> }>;

export type AppConfig = Readonly<{
  fpsCap?: number;
  maxEventBytes?: number;
  maxDrawlistBytes?: number;
  /** Enable v2 cursor protocol for native terminal cursor in Input widgets */
  useV2Cursor?: boolean;
  /**
   * Validate drawlist command parameters in the builder (default: true).
   * Disable for performance when inputs are already trusted.
   */
  drawlistValidateParams?: boolean;
  /**
   * Reuse drawlist output buffers across frames (default: true in app runtime).
   * Safe when the runtime enforces a single in-flight frame.
   */
  drawlistReuseOutputBuffer?: boolean;
  /**
   * Cache UTF-8 encoded strings across frames. 0 disables (default: 1024).
   */
  drawlistEncodedStringCacheCap?: number;
  /**
   * Maximum frames that can be in-flight (pending backend ack) simultaneously.
   * Higher values reduce latency by pipelining but increase memory usage.
   * Default: 1 (no pipelining). Max: 4.
   */
  maxFramesInFlight?: number;
  /**
   * @internal Called after a frame is rendered/submitted.
   */
  internal_onRender?: (metrics: AppRenderMetrics) => void;
  /**
   * @internal Called with the latest widget id->rect layout snapshot.
   */
  internal_onLayout?: (snapshot: AppLayoutSnapshot) => void;
}>;

export interface App<S> {
  view(fn: ViewFn<S>): void;
  draw(fn: DrawFn): void;
  onEvent(handler: EventHandler): () => void;
  update(updater: S | ((prev: Readonly<S>) => S)): void;
  setTheme(theme: Theme | ThemeDefinition): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  dispose(): void;

  /* --- Keybinding API --- */

  /**
   * Register keybindings in the default mode.
   *
   * @example
   * ```ts
   * app.keys({
   *   "ctrl+s": (ctx) => ctx.update(save),
   *   "ctrl+q": () => app.stop(),
   *   "g g": (ctx) => ctx.update(scrollToTop),
   * });
   * ```
   */
  keys(bindings: BindingMap<KeyContext<S>>): void;

  /**
   * Register multiple keybinding modes (e.g., Vim-like normal/insert).
   *
   * @example
   * ```ts
   * app.modes({
   *   normal: {
   *     "i": () => app.setMode("insert"),
   *     "j": (ctx) => ctx.update(moveCursorDown),
   *   },
   *   insert: {
   *     "escape": () => app.setMode("normal"),
   *   },
   * });
   * app.setMode("normal");
   * ```
   */
  modes(modes: ModeBindingMap<KeyContext<S>>): void;

  /**
   * Switch to a different keybinding mode.
   *
   * @param modeName - Name of the mode to switch to
   */
  setMode(modeName: string): void;

  /**
   * Get the current keybinding mode name.
   *
   * @returns Current mode name (default: "default")
   */
  getMode(): string;
}

// =============================================================================
// Advanced Widgets (GitHub issue #136)
// =============================================================================

// Toast/Notifications
export {
  addToast,
  DEFAULT_DURATION,
  DEFAULT_MAX_VISIBLE,
  filterExpiredToasts,
  getToastX,
  getToastY,
  getVisibleToasts,
  removeToast,
  TOAST_COLORS,
  TOAST_HEIGHT,
  TOAST_ICONS,
  updateToastProgress,
} from "./widgets/toast.js";

// CommandPalette
export {
  clampIndex,
  computeHighlights,
  computeNextIndex,
  DEFAULT_MAX_VISIBLE as PALETTE_DEFAULT_MAX_VISIBLE,
  filterItems,
  fuzzyScore,
  getFilteredItems,
  PALETTE_COLORS,
  PALETTE_WIDTH,
  sortByScore,
} from "./widgets/commandPalette.js";

// CodeEditor
export {
  computeAutoIndent,
  dedentLines,
  DEFAULT_TAB_SIZE,
  deleteCharAfter,
  deleteCharBefore,
  deleteRange,
  ensureCursorVisible,
  getSelectedText,
  indentLines,
  insertText,
  MAX_UNDO_STACK,
  moveCursor,
  moveCursorByWord,
  normalizeSelection,
  UNDO_GROUP_WINDOW,
  UndoStack,
  type EditAction,
  type EditResult,
} from "./widgets/codeEditor.js";

// DiffViewer
export {
  computeIntraLineHighlights,
  DEFAULT_CONTEXT_LINES,
  DIFF_COLORS,
  flattenHunks,
  getHunkScrollPosition,
  navigateHunk,
  parseUnifiedDiff,
  type FlattenedDiffLine,
} from "./widgets/diffViewer.js";

// SplitPane
export {
  collapsePanel,
  computePanelSizes,
  DEFAULT_DIVIDER_SIZE,
  DIVIDER_COLOR,
  DIVIDER_HIT_EXPAND,
  expandPanel,
  handleDividerDrag,
  hitTestDivider,
  sizesToPercentages,
  type PanelSizes,
} from "./widgets/splitPane.js";

// LogsConsole
export {
  addEntry,
  applyFilters,
  computeAutoScrollPosition,
  filterByLevel,
  filterBySource,
  formatCost,
  formatDuration,
  formatTimestamp,
  formatTokenCount,
  LEVEL_COLORS,
  LEVEL_PRIORITY,
  MAX_LOG_ENTRIES,
  searchEntries,
} from "./widgets/logsConsole.js";

// =============================================================================
// App Factory
// =============================================================================

/**
 * Create a Rezi application instance.
 *
 * @param opts - Application options
 * @returns An App instance
 *
 * @example
 * ```ts
 * const app = createApp({
 *   backend: createNodeBackend(),
 *   initialState: { count: 0 },
 * });
 *
 * app.view((state) =>
 *   ui.column({ p: 1 }, [
 *     ui.text(`Count: ${state.count}`),
 *     ui.button({ id: "inc", label: "+1" }),
 *   ])
 * );
 *
 * await app.start();
 * ```
 */
export { createApp } from "./app/createApp.js";

// =============================================================================
// Debug Trace System
// =============================================================================

export {
  // Controller
  createDebugController,
  type CreateDebugControllerOptions,
  type DebugBackend,
  type DebugController,
  type DebugErrorHandler,
  type DebugEventType,
  type DebugRecordHandler,
  // Types
  type DebugCategory,
  type DebugConfig,
  type DebugParseError,
  type DebugParseErrorCode,
  type DebugParseResult,
  type DebugPayload,
  type DebugQuery,
  type DebugQueryResult,
  type DebugRecord,
  type DebugRecordHeader,
  type DebugSeverity,
  type DebugStats,
  type DrawlistRecord,
  type ErrorRecord,
  type EventRecord,
  type FrameRecord,
  type PerfPhase,
  type PerfRecord,
  // Frame Inspector
  createFrameInspector,
  type FrameDiff,
  type FrameFieldChange,
  type FrameInspector,
  type FrameSnapshot,
  // Event Trace
  createEventTrace,
  type EventTrace,
  type EventTraceFilter,
  type EventTraceRecord,
  // Error Aggregator
  createErrorAggregator,
  type AggregatedError,
  type ErrorAggregator,
  type ErrorHandler as DebugErrorAggregatorHandler,
  // State Timeline
  createStateTimeline,
  diffState,
  type StateChange,
  type StateTimeline,
  // Constants
  DEBUG_CAT_ALL,
  DEBUG_CAT_DRAWLIST,
  DEBUG_CAT_ERROR,
  DEBUG_CAT_EVENT,
  DEBUG_CAT_FRAME,
  DEBUG_CAT_NONE,
  DEBUG_CAT_PERF,
  DEBUG_CAT_STATE,
  DEBUG_SEV_ERROR,
  DEBUG_SEV_INFO,
  DEBUG_SEV_TRACE,
  DEBUG_SEV_WARN,
  // Parsers
  parseDrawlistRecord,
  parseErrorRecord,
  parseEventRecord,
  parseFrameRecord,
  parsePayload,
  parsePerfRecord,
  parseQueryResult,
  parseRecordHeader,
  parseStats,
  // Mapping functions
  categoriesToMask,
  categoryFromNum,
  categoryToNum,
  isCategoryInMask,
  maskToCategories,
  perfPhaseFromNum,
  severityFromNum,
  severityToNum,
} from "./debug/index.js";

// =============================================================================
// Debug Panel Widget
// =============================================================================

export {
  debugPanel,
  errorBadge,
  fpsCounter,
  type DebugPanelPosition,
  type DebugPanelProps,
} from "./widgets/debugPanel.js";

// =============================================================================
// Perf Instrumentation
// =============================================================================

export {
  PERF_ENABLED,
  PERF_PHASES,
  perfMarkEnd,
  perfMarkStart,
  perfRecord,
  perfReset,
  perfSnapshot,
  type InstrumentationPhase,
  type PerfSnapshot,
  type PerfToken,
  type PhaseStats,
} from "./perf/index.js";
