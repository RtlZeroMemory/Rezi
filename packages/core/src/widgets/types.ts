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

import type { SpacingValue } from "../layout/spacing-scale.js";
import type { LayoutConstraints } from "../layout/types.js";
import type { Theme } from "../theme/theme.js";
import type { ThemeDefinition } from "../theme/tokens.js";
import type { TextStyle } from "./style.js";

/** Cross-axis alignment for stack layouts. */
export type Align = "start" | "center" | "end" | "stretch";
export type Overflow = "visible" | "hidden" | "scroll";

/**
 * Spacing props for padding and margin.
 * Accepts either a number (cells) or a spacing key ("xs", "sm", "md", "lg", "xl", "2xl").
 */
export type SpacingProps = Readonly<{
  /** All sides padding */
  p?: SpacingValue;
  /** Horizontal padding */
  px?: SpacingValue;
  /** Vertical padding */
  py?: SpacingValue;
  /** Top padding */
  pt?: SpacingValue;
  /** Bottom padding */
  pb?: SpacingValue;
  /** Left padding */
  pl?: SpacingValue;
  /** Right padding */
  pr?: SpacingValue;
  /** All sides margin */
  m?: SpacingValue;
  /** Horizontal margin */
  mx?: SpacingValue;
  /** Vertical margin */
  my?: SpacingValue;
  /** Top margin */
  mt?: SpacingValue;
  /** Right margin */
  mr?: SpacingValue;
  /** Bottom margin */
  mb?: SpacingValue;
  /** Left margin */
  ml?: SpacingValue;
}>;

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export type ScopedThemeOverride =
  | Theme
  | ThemeDefinition
  | Readonly<{
      colors?: DeepPartial<Theme["colors"]> | DeepPartial<ThemeDefinition["colors"]>;
      spacing?: Theme["spacing"];
    }>;

/**
 * Text display variants with predefined styling.
 */
export type TextVariant = "body" | "heading" | "caption" | "code" | "label";

/** Props for text widget. key is for reconciliation; style for visual appearance. */
export type TextProps = Readonly<{
  id?: string;
  key?: string;
  style?: TextStyle;
  /** Text variant with predefined styling */
  variant?: TextVariant;
  /** How to handle text that exceeds available width. Defaults to "clip". */
  textOverflow?: "clip" | "ellipsis" | "middle";
  /** Maximum width for overflow handling (in cells) */
  maxWidth?: number;
}>;

/**
 * Shadow configuration for box widgets.
 */
export type BoxShadow =
  | boolean
  | Readonly<{
      /** Horizontal offset (default: 1) */
      offsetX?: number;
      /** Vertical offset (default: 1) */
      offsetY?: number;
      /** Shadow density: "light", "medium", "dense" (default: "medium") */
      density?: "light" | "medium" | "dense";
    }>;

/** Props for box container. border defaults to "single". */
export type BoxProps = Readonly<
  {
    id?: string;
    key?: string;
    title?: string;
    /** Alignment of title within the top border. */
    titleAlign?: "left" | "center" | "right";
    /**
     * @deprecated Use `p`/`px`/`py`/`pt`/`pr`/`pb`/`pl` instead. Will be removed in v2.0.
     */
    pad?: SpacingValue;
    /** Border style. */
    border?: "none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed";
    /**
     * Render individual border sides. Defaults to true when `border` is not "none".
     * Mirrors Ink-style per-side border toggles.
     */
    borderTop?: boolean;
    borderRight?: boolean;
    borderBottom?: boolean;
    borderLeft?: boolean;
    /**
     * Enable shadow effect for depth.
     * Pass `true` for default shadow, or an object for custom configuration.
     */
    shadow?: BoxShadow;
    /**
     * Optional style applied to the box surface (for borders and background fill).
     * When `bg` is provided, the renderer fills the box rect.
     */
    style?: TextStyle;
    /** Child overflow behavior. Defaults to "visible". */
    overflow?: Overflow;
    /** Horizontal scroll offset in cells. Clamped by layout metadata bounds. */
    scrollX?: number;
    /** Vertical scroll offset in cells. Clamped by layout metadata bounds. */
    scrollY?: number;
    /** Optional scoped theme override for this container subtree. */
    theme?: ScopedThemeOverride;
  } & SpacingProps &
    LayoutConstraints
>;

/** Props for row/column stack layouts. pad is internal, gap is between children. */
export type JustifyContent = "start" | "end" | "center" | "between" | "around" | "evenly";

export type AlignItems = "start" | "end" | "center" | "stretch";

export type StackProps = Readonly<
  {
    id?: string;
    key?: string;
    /**
     * @deprecated Use `p`/`px`/`py`/`pt`/`pr`/`pb`/`pl` instead. Will be removed in v2.0.
     */
    pad?: SpacingValue;
    /** Gap between children. Accepts number or spacing key. */
    gap?: SpacingValue;
    align?: Align;
    justify?: JustifyContent;
    items?: AlignItems;
    /**
     * Optional style applied to the stack surface.
     * When `bg` is provided, the renderer fills the stack rect.
     */
    style?: TextStyle;
    /** Child overflow behavior. Defaults to "visible". */
    overflow?: Overflow;
    /** Horizontal scroll offset in cells. Clamped by layout metadata bounds. */
    scrollX?: number;
    /** Vertical scroll offset in cells. Clamped by layout metadata bounds. */
    scrollY?: number;
    /** Optional scoped theme override for this container subtree. */
    theme?: ScopedThemeOverride;
  } & SpacingProps &
    LayoutConstraints
>;

/** Props for horizontal stacks. `wrap` controls line breaking (default: false). */
export type RowProps = StackProps &
  Readonly<{
    wrap?: boolean;
  }>;

/** Props for vertical stacks. `wrap` controls line breaking (default: false). */
export type ColumnProps = StackProps &
  Readonly<{
    wrap?: boolean;
  }>;

export type GridProps = {
  columns: number | string;
  rows?: number | string;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
};

/** Props for spacer element. size is in cells along stack axis. */
export type SpacerProps = Readonly<{
  key?: string;
  size?: number;
  flex?: number;
}>;

export type DividerProps = Readonly<{
  key?: string;
  direction?: "horizontal" | "vertical";
  char?: string;
  label?: string;
  color?: string;
}>;

/**
 * Props for icon widget.
 * Icons are single-character glyphs from the icon registry.
 */
export type IconProps = Readonly<{
  key?: string;
  /** Icon path (e.g., "status.check", "arrow.right", "ui.search") */
  icon: string;
  /** Optional style for the icon */
  style?: TextStyle;
  /** Use ASCII fallback instead of Unicode/Nerd Font character */
  fallback?: boolean;
}>;

/**
 * Props for spinner widget.
 * Animated loading indicator driven by tick events.
 */
export type SpinnerProps = Readonly<{
  key?: string;
  /** Spinner animation variant */
  variant?: "dots" | "line" | "circle" | "bounce" | "pulse" | "arrows" | "dots2";
  /** Optional style for the spinner */
  style?: TextStyle;
  /** Optional label text after spinner */
  label?: string;
}>;

/**
 * Progress bar variant styles.
 */
export type ProgressVariant = "bar" | "blocks" | "minimal";

/**
 * Props for progress bar widget.
 * Displays completion progress with customizable appearance.
 */
export type ProgressProps = Readonly<{
  key?: string;
  /** Progress value from 0 to 1 */
  value: number;
  /** Display width in cells (default: fills available space) */
  width?: number;
  /** Visual variant */
  variant?: ProgressVariant;
  /** Show percentage label */
  showPercent?: boolean;
  /** Optional label before the bar */
  label?: string;
  /** Style for filled portion */
  style?: TextStyle;
  /** Style for track/unfilled portion */
  trackStyle?: TextStyle;
}>;

/**
 * Skeleton variant styles.
 */
export type SkeletonVariant = "text" | "rect" | "circle";

/**
 * Props for skeleton loading widget.
 * Placeholder for content that is loading.
 */
export type SkeletonProps = Readonly<{
  key?: string;
  /** Width in cells */
  width: number;
  /** Height in rows (default: 1) */
  height?: number;
  /** Visual variant */
  variant?: SkeletonVariant;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * A span of styled text within a richText widget.
 */
export type RichTextSpan = Readonly<{
  /** Text content */
  text: string;
  /** Optional style for this span */
  style?: TextStyle;
}>;

/**
 * Props for rich text widget with multiple styled spans.
 */
export type RichTextProps = Readonly<{
  key?: string;
  /** Array of styled text spans */
  spans: readonly RichTextSpan[];
}>;

/**
 * Props for keyboard shortcut display widget.
 */
export type KbdProps = Readonly<{
  key?: string;
  /** Key or keys to display (e.g., "Ctrl+S" or ["Ctrl", "S"]) */
  keys: string | readonly string[];
  /** Separator between keys (default: "+") */
  separator?: string;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Badge visual variants.
 */
export type BadgeVariant = "default" | "success" | "warning" | "error" | "info";

/**
 * Props for badge widget.
 */
export type BadgeProps = Readonly<{
  key?: string;
  /** Badge text */
  text: string;
  /** Visual variant */
  variant?: BadgeVariant;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Status indicator types.
 */
export type StatusType = "online" | "offline" | "away" | "busy" | "unknown";

/**
 * Props for status indicator widget.
 * Shows a colored dot with optional label.
 */
export type StatusProps = Readonly<{
  key?: string;
  /** Status type determines color */
  status: StatusType;
  /** Optional label after the indicator */
  label?: string;
  /** Show the label text (default: true if label provided) */
  showLabel?: boolean;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for tag widget.
 * Inline label with background color.
 */
export type TagProps = Readonly<{
  key?: string;
  /** Tag text */
  text: string;
  /** Tag color variant */
  variant?: BadgeVariant;
  /** Make tag removable (shows x) */
  removable?: boolean;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for gauge widget.
 * Compact progress display with label.
 */
export type GaugeProps = Readonly<{
  key?: string;
  /** Value from 0 to 1 */
  value: number;
  /** Label before the gauge */
  label?: string;
  /** Display variant */
  variant?: "linear" | "compact";
  /** Color thresholds for value ranges */
  thresholds?: readonly { value: number; variant: BadgeVariant }[];
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for empty state widget.
 * Displays a centered placeholder when content is empty.
 */
export type EmptyProps = Readonly<{
  key?: string;
  /** Icon path to display (e.g., "ui.search", "file.folder") */
  icon?: string;
  /** Main title text */
  title: string;
  /** Optional description text */
  description?: string;
  /** Optional action button or other widget */
  action?: VNode;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for error display widget.
 * Shows error information with optional stack trace and retry action.
 */
export type ErrorDisplayProps = Readonly<{
  key?: string;
  /** Error title (default: "Error") */
  title?: string;
  /** Error message to display */
  message: string;
  /** Optional stack trace */
  stack?: string;
  /** Show stack trace (default: false) */
  showStack?: boolean;
  /** Callback for retry action */
  onRetry?: () => void;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for callout/alert widget.
 * Highlighted message box for important information.
 */
export type CalloutProps = Readonly<{
  key?: string;
  /** Callout variant determines styling */
  variant?: "info" | "success" | "warning" | "error";
  /** Optional title */
  title?: string;
  /** Message content */
  message: string;
  /** Optional icon override */
  icon?: string;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for sparkline widget.
 * Mini inline chart using block characters.
 */
export type SparklineProps = Readonly<{
  key?: string;
  /** Data points (will be normalized to 0-1 range) */
  data: readonly number[];
  /** Display width in cells (default: data.length) */
  width?: number;
  /** Minimum value for scaling (default: auto) */
  min?: number;
  /** Maximum value for scaling (default: auto) */
  max?: number;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Single item in a bar chart.
 */
export type BarChartItem = Readonly<{
  /** Item label */
  label: string;
  /** Item value */
  value: number;
  /** Optional color variant */
  variant?: BadgeVariant;
}>;

/**
 * Props for bar chart widget.
 * Horizontal or vertical bar chart.
 */
export type BarChartProps = Readonly<{
  key?: string;
  /** Data items to display */
  data: readonly BarChartItem[];
  /** Chart orientation (default: "horizontal") */
  orientation?: "horizontal" | "vertical";
  /** Show value labels (default: true) */
  showValues?: boolean;
  /** Show item labels (default: true) */
  showLabels?: boolean;
  /** Maximum bar length in cells */
  maxBarLength?: number;
  /** Optional style override */
  style?: TextStyle;
}>;

/**
 * Props for mini chart widget.
 * Compact multi-value display.
 */
export type MiniChartProps = Readonly<{
  key?: string;
  /** Chart values (2-4 values recommended) */
  values: readonly { label: string; value: number; max?: number }[];
  /** Display variant */
  variant?: "bars" | "pills";
  /** Optional style override */
  style?: TextStyle;
}>;

/** Props for button widget. id is required for focus/routing; label is display text. */
export type ButtonProps = Readonly<{
  id: string;
  key?: string;
  label: string;
  disabled?: boolean;
  /** Horizontal padding in cells (default: 1). */
  px?: number;
  /** Optional style applied to the button label (merged with focus/disabled state). */
  style?: TextStyle;
  /** Optional callback invoked when the button is activated. */
  onPress?: () => void;
}>;

/** Props for input widget. id is required; value is controlled by app state. */
export type InputProps = Readonly<{
  id: string;
  key?: string;
  value: string;
  disabled?: boolean;
  /** Optional style applied to the input value (merged with focus/disabled state). */
  style?: TextStyle;
  /** Optional callback invoked on input edits (docs/18). */
  onInput?: (value: string, cursor: number) => void;
  /** Optional callback invoked when the input loses focus. */
  onBlur?: () => void;
}>;

/** Navigation mode for focus zones. */
export type FocusZoneNavigation = "linear" | "grid" | "none";

/** Props for focus zone container. Groups focusable widgets for TAB navigation. */
export type FocusZoneProps = Readonly<{
  id: string;
  key?: string;
  tabIndex?: number; // Zone order (default: 0)
  navigation?: FocusZoneNavigation; // Default: "linear"
  columns?: number; // For grid mode (default: 1)
  wrapAround?: boolean; // Default: true
  onEnter?: () => void;
  onExit?: () => void;
}>;

/** Props for focus trap container. Contains focus within its boundaries when active. */
export type FocusTrapProps = Readonly<{
  id: string;
  key?: string;
  active: boolean;
  returnFocusTo?: string;
  initialFocus?: string;
}>;

/** Height specification for virtual list items: fixed number or callback for variable heights. */
export type ItemHeightSpec<T> = number | ((item: T, index: number) => number);

/** Props for virtualList widget. Efficiently renders large datasets with windowed virtualization. */
export type VirtualListProps<T = unknown> = Readonly<{
  id: string;
  key?: string;
  items: readonly T[];
  itemHeight: ItemHeightSpec<T>;
  /** Number of items to render outside the visible viewport (default: 3) */
  overscan?: number;
  renderItem: (item: T, index: number, focused: boolean) => VNode;
  onScroll?: (scrollTop: number, visibleRange: [number, number]) => void;
  onSelect?: (item: T, index: number) => void;
  /** Enable keyboard navigation with arrow keys, page up/down, home/end (default: true) */
  keyboardNavigation?: boolean;
  /** Wrap selection from last item to first and vice versa (default: false) */
  wrapAround?: boolean;
}>;

/* ========== Layer System (GitHub issue #117) ========== */

/** Backdrop style presets for modals and overlays. */
export type BackdropStyle = "none" | "dim" | "opaque";

/** Shared frame/surface styling for overlay widgets. */
export type OverlayFrameStyle = Readonly<{
  /** Surface background color. */
  background?: NonNullable<TextStyle["bg"]>;
  /** Default text/icon color for overlay content. */
  foreground?: NonNullable<TextStyle["fg"]>;
  /** Border color for framed overlays. */
  border?: NonNullable<TextStyle["fg"]>;
}>;

/** Extended modal backdrop config (preset-compatible). */
export type ModalBackdrop =
  | BackdropStyle
  | Readonly<{
      /** Backdrop variant (default: "dim"). */
      variant?: BackdropStyle;
      /** Optional dim-pattern character (default: "░", dim variant only). */
      pattern?: string;
      /** Optional backdrop foreground color. */
      foreground?: NonNullable<TextStyle["fg"]>;
      /** Optional backdrop background color. */
      background?: NonNullable<TextStyle["bg"]>;
    }>;

/** Position for dropdown relative to anchor. */
export type DropdownPosition =
  | "below-start"
  | "below-center"
  | "below-end"
  | "above-start"
  | "above-center"
  | "above-end";

/** Props for layers container. Stacks children with later items on top. */
export type LayersProps = Readonly<{
  key?: string;
}>;

/** Props for modal overlay. Centered with optional backdrop and focus trap. */
export type ModalProps = Readonly<{
  id: string;
  key?: string;
  /** Optional title rendered in modal header. */
  title?: string;
  /** Main content of the modal. */
  content: VNode;
  /** Action buttons rendered in modal footer. */
  actions?: readonly VNode[];
  /** Modal width in cells, or "auto" to fit content. */
  width?: number | "auto";
  /** Maximum width constraint. */
  maxWidth?: number;
  /** Frame/surface colors for modal body and border. */
  frameStyle?: OverlayFrameStyle;
  /** Backdrop style/config (default: "dim"). */
  backdrop?: ModalBackdrop;
  /** Close when backdrop is clicked (default: true). */
  closeOnBackdrop?: boolean;
  /** Close when ESC is pressed (default: true). */
  closeOnEscape?: boolean;
  /** Callback when modal should close. */
  onClose?: () => void;
  /** ID of element to focus when modal opens. */
  initialFocus?: string;
  /** ID of element to return focus to when modal closes. */
  returnFocusTo?: string;
}>;

/** Dropdown menu item. */
export type DropdownItem = Readonly<{
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  /** Render as a divider instead of a selectable item. */
  divider?: boolean;
}>;

/** Props for dropdown menu. Positioned relative to an anchor element. */
export type DropdownProps = Readonly<{
  id: string;
  key?: string;
  /** ID of the anchor element to position relative to. */
  anchorId: string;
  /** Position relative to anchor (default: "below-start"). */
  position?: DropdownPosition;
  /** Frame/surface colors for dropdown background, text, and border. */
  frameStyle?: OverlayFrameStyle;
  /** Menu items to render. */
  items: readonly DropdownItem[];
  /** Callback when an item is selected. */
  onSelect?: (item: DropdownItem) => void;
  /** Callback when dropdown should close. */
  onClose?: () => void;
}>;

/** Props for a layer in the layer stack. */
export type LayerProps = Readonly<{
  id: string;
  key?: string;
  /**
   * Z-index for layer ordering (higher = on top). Default is insertion order.
   * Values are truncated to integers and clamped to `±9,007,199,253` for deterministic ordering.
   */
  zIndex?: number;
  /** Frame/surface colors for the layer container. */
  frameStyle?: OverlayFrameStyle;
  /** Backdrop to render behind content. */
  backdrop?: BackdropStyle;
  /** Whether layer blocks input to lower layers. */
  modal?: boolean;
  /** Whether layer should close on ESC key (default: true). */
  closeOnEscape?: boolean;
  /** Callback when layer should close. */
  onClose?: () => void;
  /** Content to render in the layer. */
  content: VNode;
}>;

/* ========== Table Widget (GitHub issue #118) ========== */

/** Overflow behavior for table header/cell text. */
export type TableColumnOverflow = "clip" | "ellipsis" | "middle";

/** Row stripe styling for table body backgrounds. */
export type TableStripeStyle = Readonly<{
  /** Background color for odd body rows (0-based index: 1, 3, 5, ...). */
  odd?: NonNullable<TextStyle["bg"]>;
  /** Background color for even body rows (0-based index: 0, 2, 4, ...). */
  even?: NonNullable<TextStyle["bg"]>;
}>;

/** Border glyph variants supported by table borders. */
export type TableBorderVariant =
  | "single"
  | "double"
  | "rounded"
  | "heavy"
  | "dashed"
  | "heavy-dashed";

/** Border styling options for tables. */
export type TableBorderStyle = Readonly<{
  /** Border glyph variant (default: "single"). */
  variant?: TableBorderVariant;
  /** Border foreground color override. */
  color?: NonNullable<TextStyle["fg"]>;
}>;

/** Column definition for table widget. */
export type TableColumn<T = unknown> = Readonly<{
  /** Unique column identifier. */
  key: string;
  /** Column header text. */
  header: string;
  /** Fixed width in cells. */
  width?: number;
  /** Minimum width in cells. */
  minWidth?: number;
  /** Maximum width in cells. */
  maxWidth?: number;
  /** Flex factor for distributing remaining space. */
  flex?: number;
  /** Custom render function for cell content. */
  render?: (value: unknown, row: T, index: number) => VNode;
  /** Cell content alignment. */
  align?: "left" | "center" | "right";
  /** Overflow handling for this column (default: "ellipsis"). */
  overflow?: TableColumnOverflow;
  /** Whether column is sortable. */
  sortable?: boolean;
}>;

/** Props for table widget. */
export type TableProps<T = unknown> = Readonly<{
  id: string;
  key?: string;
  /** Column definitions. */
  columns: readonly TableColumn<T>[];
  /** Row data array. */
  data: readonly T[];
  /** Function to get unique key for each row. */
  getRowKey: (row: T, index: number) => string;
  /** Height of each row in cells (default: 1). */
  rowHeight?: number;
  /** Height of header row in cells (default: 1). */
  headerHeight?: number;
  /** Currently selected row keys. */
  selection?: readonly string[];
  /** Selection mode (default: "none"). */
  selectionMode?: "none" | "single" | "multi";
  /** Callback when selection changes. */
  onSelectionChange?: (keys: readonly string[]) => void;
  /** Currently sorted column key. */
  sortColumn?: string;
  /** Sort direction. */
  sortDirection?: "asc" | "desc";
  /** Callback when sort changes. */
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Callback when row is pressed (Enter key or click). */
  onRowPress?: (row: T, index: number) => void;
  /** Callback when row is double-pressed (double-click). */
  onRowDoublePress?: (row: T, index: number) => void;
  /** Enable virtualization for large datasets (default: true). */
  virtualized?: boolean;
  /** Number of rows to render outside viewport (default: 3). */
  overscan?: number;
  /** Legacy stripe toggle. */
  stripedRows?: boolean;
  /** Stripe background styling for body rows. */
  stripeStyle?: TableStripeStyle;
  /** Show header row (default: true). */
  showHeader?: boolean;
  /** Legacy border toggle. */
  border?: "none" | "single";
  /** Border styling for rendered table frame. */
  borderStyle?: TableBorderStyle;
}>;

/* ========== Form Widgets (GitHub issue #119) ========== */

/** Option for select and radio group widgets. */
export type SelectOption = Readonly<{
  /** Option value used in form state. */
  value: string;
  /** Display label for the option. */
  label: string;
  /** Whether this option is disabled. */
  disabled?: boolean;
}>;

/** Props for field wrapper widget. Wraps an input with label, error, and hint. */
export type FieldProps = Readonly<{
  key?: string;
  /** Field label displayed above the input. */
  label: string;
  /** Error message to display below the input. */
  error?: string;
  /** Whether the field is required (shows asterisk). */
  required?: boolean;
  /** Help text displayed below the input. */
  hint?: string;
  /** The wrapped input widget. */
  children: VNode;
}>;

/** Props for select dropdown widget. */
export type SelectProps = Readonly<{
  id: string;
  key?: string;
  /** Currently selected value. */
  value: string;
  /** Available options. */
  options: readonly SelectOption[];
  /** Callback when selection changes. */
  onChange?: (value: string) => void;
  /** Whether the select is disabled. */
  disabled?: boolean;
  /** Placeholder text when no value is selected. */
  placeholder?: string;
}>;

/** Props for slider widget. */
export type SliderProps = Readonly<{
  id: string;
  key?: string;
  /** Current slider value. */
  value: number;
  /** Minimum value (default: 0). */
  min?: number;
  /** Maximum value (default: 100). */
  max?: number;
  /** Step increment for keyboard changes (default: 1). */
  step?: number;
  /** Optional fixed track width in cells (default: fills available width). */
  width?: number;
  /** Optional label shown before the track. */
  label?: string;
  /** Show numeric value text (default: true). */
  showValue?: boolean;
  /** Callback when value changes. */
  onChange?: (value: number) => void;
  /** Whether the slider is disabled. */
  disabled?: boolean;
  /** Whether the slider is read-only (focusable but non-editable). */
  readOnly?: boolean;
  /** Optional style applied to label/value text. */
  style?: TextStyle;
}>;

/** Props for checkbox widget. */
export type CheckboxProps = Readonly<{
  id: string;
  key?: string;
  /** Whether the checkbox is checked. */
  checked: boolean;
  /** Label displayed next to the checkbox. */
  label?: string;
  /** Callback when checked state changes. */
  onChange?: (checked: boolean) => void;
  /** Whether the checkbox is disabled. */
  disabled?: boolean;
}>;

/** Props for radio group widget. */
export type RadioGroupProps = Readonly<{
  id: string;
  key?: string;
  /** Currently selected value. */
  value: string;
  /** Available options. */
  options: readonly SelectOption[];
  /** Callback when selection changes. */
  onChange?: (value: string) => void;
  /** Layout direction. */
  direction?: "horizontal" | "vertical";
  /** Whether the radio group is disabled. */
  disabled?: boolean;
}>;

/* ========== Navigation Widgets ========== */

/** Tabs visual style variant. */
export type TabsVariant = "line" | "enclosed" | "pills";

/** Tabs bar position relative to content. */
export type TabsPosition = "top" | "bottom";

/** Tab item descriptor. */
export type TabsItem = Readonly<{
  key: string;
  label: string;
  content: VNode;
}>;

/** Props for tabs widget. */
export type TabsProps = Readonly<{
  id: string;
  key?: string;
  tabs: readonly TabsItem[];
  activeTab: string;
  onChange: (key: string) => void;
  variant?: TabsVariant;
  position?: TabsPosition;
}>;

/** Accordion item descriptor. */
export type AccordionItem = Readonly<{
  key: string;
  title: string;
  content: VNode;
}>;

/** Props for accordion widget. */
export type AccordionProps = Readonly<{
  id: string;
  key?: string;
  items: readonly AccordionItem[];
  expanded: readonly string[];
  onChange: (expanded: readonly string[]) => void;
  allowMultiple?: boolean;
}>;

/** Breadcrumb item descriptor. */
export type BreadcrumbItem = Readonly<{
  label: string;
  onPress?: () => void;
}>;

/** Props for breadcrumb widget. */
export type BreadcrumbProps = Readonly<{
  id?: string;
  key?: string;
  items: readonly BreadcrumbItem[];
  separator?: string;
}>;

/** Props for pagination widget. */
export type PaginationProps = Readonly<{
  id: string;
  key?: string;
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  showFirstLast?: boolean;
}>;

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
  /** Keyboard shortcut hint. */
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
  /** Frame/surface colors for palette background, text, and border. */
  frameStyle?: OverlayFrameStyle;
  /** Callback when query changes. */
  onQueryChange: (query: string) => void;
  /** Callback when item is selected. */
  onSelect: (item: CommandItem) => void;
  /** Callback when palette should close. */
  onClose: () => void;
  /** Callback when selection index changes. */
  onSelectionChange?: (index: number) => void;
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
  onToggle: (path: string, expanded: boolean) => void;
  /** Callback when file is opened (double-click / Enter). */
  onOpen: (path: string) => void;
  /** Callback when selection changes (multi-select). */
  onSelectionChange?: (paths: readonly string[]) => void;
}>;

/** Props for FileTreeExplorer widget. Tree view of files with expand/collapse. */
export type FileTreeExplorerProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
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
  /** Indentation per level (default: 2). */
  indentSize?: number;
  /** Callback when node expand state changes. */
  onToggle: (node: FileNode, expanded: boolean) => void;
  /** Callback when node is selected. */
  onSelect: (node: FileNode) => void;
  /** Callback when node is activated (Enter / double-click). */
  onActivate: (node: FileNode) => void;
  /** Callback for context menu (right-click / Menu key). */
  onContextMenu?: (node: FileNode) => void;
  /** Custom node renderer. */
  renderNode?: (node: FileNode, depth: number, state: FileNodeState) => VNode;
}>;

/* ---------- SplitPane & ResizablePanels Widgets ---------- */

/** Direction for split pane layout. */
export type SplitDirection = "horizontal" | "vertical";

/** Props for SplitPane widget. Draggable divider between panels. */
export type SplitPaneProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
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
  onResize: (sizes: readonly number[]) => void;
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

/** Props for CodeEditor widget. Multiline text editing with selections. */
export type CodeEditorProps = Readonly<{
  /** REQUIRED - Interactive widget identifier. */
  id: string;
  key?: string;
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
}>;

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
}>;

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
  /** Tool request being approved. */
  request: ToolRequest;
  /** Visible state. */
  open: boolean;
  /** Focused action button. */
  focusedAction?: "allow" | "deny" | "allowSession";
  /** Callback when allowed. */
  onAllow: () => void;
  /** Callback when denied. */
  onDeny: () => void;
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
  /** Callback when scroll position changes. */
  onScroll: (scrollTop: number) => void;
  /** Callback when entry expand state changes. */
  onEntryToggle?: (entryId: string, expanded: boolean) => void;
  /** Callback to clear logs. */
  onClear?: () => void;
}>;

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
  /** Frame/surface colors for toast backgrounds, text, and borders. */
  frameStyle?: OverlayFrameStyle;
  /** Callback when toast is dismissed. */
  onDismiss: (id: string) => void;
}>;

/* ========== Tree Widget (GitHub issue #122) ========== */

/** State information for a tree node during rendering. */
export type NodeState = Readonly<{
  /** Whether the node is expanded. */
  expanded: boolean;
  /** Whether the node is selected. */
  selected: boolean;
  /** Whether the node is focused. */
  focused: boolean;
  /** Whether the node is loading children. */
  loading: boolean;
  /** Depth level in the tree (0 = root). */
  depth: number;
  /** Whether this is the first sibling. */
  isFirst: boolean;
  /** Whether this is the last sibling. */
  isLast: boolean;
  /** Whether the node has children (or could have). */
  hasChildren: boolean;
}>;

/** Props for tree widget. */
export type TreeProps<T = unknown> = Readonly<{
  id: string;
  key?: string;
  /** Root node(s). Can be a single root or array of roots. */
  data: T | readonly T[];
  /** Function to get unique key for each node. */
  getKey: (node: T) => string;
  /** Function to get children of a node (undefined = leaf node). */
  getChildren?: (node: T) => readonly T[] | undefined;
  /** Function to check if node has children (for lazy loading). */
  hasChildren?: (node: T) => boolean;
  /** Set of expanded node keys. */
  expanded: readonly string[];
  /** Currently selected node key. */
  selected?: string;
  /** Callback when node expand/collapse state changes. */
  onToggle: (node: T, expanded: boolean) => void;
  /** Callback when node is selected. */
  onSelect?: (node: T) => void;
  /** Callback when node is activated (Enter key or double-click). */
  onActivate?: (node: T) => void;
  /** Custom render function for node content. */
  renderNode: (node: T, depth: number, state: NodeState) => VNode;
  /** Function to load children asynchronously. */
  loadChildren?: (node: T) => Promise<readonly T[]>;
  /** Indentation per depth level in cells (default: 2). */
  indentSize?: number;
  /** Show tree lines (├── └── │). */
  showLines?: boolean;
}>;

export type VNode =
  | Readonly<{ kind: "text"; text: string; props: TextProps }>
  | Readonly<{ kind: "box"; props: BoxProps; children: readonly VNode[] }>
  | Readonly<{ kind: "row"; props: RowProps; children: readonly VNode[] }>
  | Readonly<{ kind: "column"; props: ColumnProps; children: readonly VNode[] }>
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
  | Readonly<{ kind: "callout"; props: CalloutProps }>
  // Data visualization widgets (Phase 9)
  | Readonly<{ kind: "sparkline"; props: SparklineProps }>
  | Readonly<{ kind: "barChart"; props: BarChartProps }>
  | Readonly<{ kind: "miniChart"; props: MiniChartProps }>
  | Readonly<{ kind: "button"; props: ButtonProps }>
  | Readonly<{ kind: "input"; props: InputProps }>
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
