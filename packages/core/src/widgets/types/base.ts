import type { EasingInput } from "../../animation/types.js";
import type { FocusConfig } from "../../focus/styles.js";
import type { SpacingValue } from "../../layout/spacing-scale.js";
import type { DisplayConstraint, LayoutConstraints, SizeConstraint } from "../../layout/types.js";
import type { InstanceId } from "../../runtime/instance.js";
import type { ThemeOverrides } from "../../theme/extend.js";
import type { ThemeDefinition } from "../../theme/tokens.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { TextStyle } from "../style.js";
import type { VNode } from "../types.js";

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

export type ScopedThemeOverride = ThemeDefinition | ThemeOverrides;

export type ThemedProps = Readonly<{
  key?: string;
  /** Partial theme overrides applied to children. */
  theme: ThemeOverrides;
}>;

export type FragmentProps = Readonly<{
  key?: string;
}>;

type DisplayableProps = Readonly<{
  /** Conditional layout visibility. false (or expr <= 0) hides this node. */
  display?: DisplayConstraint;
}>;

/**
 * Text display variants with predefined styling.
 */
export type TextVariant = "body" | "heading" | "caption" | "code" | "label";

/** Properties that can be animated via widget transition props. */
export type TransitionProperty = "position" | "size" | "opacity";

/** Declarative transition settings for render-time widget animation. */
export type TransitionSpec = Readonly<{
  /** Transition duration in milliseconds. */
  duration?: number;
  /** Easing curve for interpolation. */
  easing?: EasingInput;
  /**
   * Transitioned properties. Defaults to `"all"` when omitted.
   * Phase 1 implementation supports `"position"` (x/y).
   */
  properties?: "all" | readonly TransitionProperty[];
}>;

export type ExitAnimationState = Readonly<{
  instanceId: InstanceId;
  startMs: number;
  durationMs: number;
  easing: (t: number) => number;
  properties: "all" | readonly TransitionProperty[];
}>;

/** Props for text widget. key is for reconciliation; style for visual appearance. */
export type TextProps = Readonly<{
  id?: string;
  key?: string;
  style?: TextStyle;
  /** Text variant with predefined styling */
  variant?: TextVariant;
  /** How to handle text that exceeds available width. Defaults to "clip". */
  textOverflow?: "clip" | "ellipsis" | "middle" | "start";
  /** Maximum width for overflow handling (in cells) */
  maxWidth?: SizeConstraint;
  /** When true, text wraps to multiple lines instead of single-line truncation. */
  wrap?: boolean;
}> &
  DisplayableProps;

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
      /** Shadow density: "light", "medium", "dense" (default: "light") */
      density?: "light" | "medium" | "dense";
    }>;

export type BoxPreset = "card" | "surface" | "well" | "elevated";

export type BoxBorderSideStyles = Readonly<{
  top?: TextStyle;
  right?: TextStyle;
  bottom?: TextStyle;
  left?: TextStyle;
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
    /** Style preset. Applied before explicit border/style props. */
    preset?: BoxPreset;
    /** Border style. */
    border?: "none" | "single" | "double" | "rounded" | "heavy" | "dashed" | "heavy-dashed";
    /**
     * Render individual border sides. Defaults to true when `border` is not "none".
     * Matches per-side border toggles used by terminal UI libraries.
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
     * When `borderStyle` is not set, this also styles the border.
     */
    style?: TextStyle;
    /**
     * Optional style applied only to the box border and title.
     * When set, decouples border appearance from child content:
     * `style` controls children/fill, `borderStyle` controls the border.
     * When not set, `style` applies to both (backward compatible).
     */
    borderStyle?: TextStyle;
    /** Optional per-edge border style overrides. */
    borderStyleSides?: BoxBorderSideStyles;
    /**
     * Style inherited by descendants when they do not override their own style.
     * Unlike `style`, this does not force container background fill.
     */
    inheritStyle?: TextStyle;
    /** Child overflow behavior. Defaults to "visible". */
    overflow?: Overflow;
    /** Horizontal scroll offset in cells. Clamped by layout metadata bounds. */
    scrollX?: number;
    /** Vertical scroll offset in cells. Clamped by layout metadata bounds. */
    scrollY?: number;
    /** Scrollbar glyph variant for overflow: "scroll" (default: "minimal"). */
    scrollbarVariant?: "minimal" | "classic" | "modern" | "dots" | "thin";
    /** Optional style override for rendered scrollbars. */
    scrollbarStyle?: TextStyle;
    /** Optional scoped theme override for this container subtree. */
    theme?: ScopedThemeOverride;
    /** Surface opacity in [0..1]. Defaults to 1. */
    opacity?: number;
    /** Gap between box children when laid out by the synthetic inner column. */
    gap?: SpacingValue;
    /** Optional declarative transition settings for this container. */
    transition?: TransitionSpec;
    /** Optional declarative exit transition before unmount removal. */
    exitTransition?: TransitionSpec;
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
    /** Render children in reverse order while preserving original child arrays. */
    reverse?: boolean;
    align?: Align;
    justify?: JustifyContent;
    items?: AlignItems;
    /**
     * Optional style applied to the stack surface.
     * When `bg` is provided, the renderer fills the stack rect.
     */
    style?: TextStyle;
    /**
     * Style inherited by descendants when they do not override their own style.
     * Unlike `style`, this does not force stack background fill.
     */
    inheritStyle?: TextStyle;
    /** Child overflow behavior. Defaults to "visible". */
    overflow?: Overflow;
    /** Horizontal scroll offset in cells. Clamped by layout metadata bounds. */
    scrollX?: number;
    /** Vertical scroll offset in cells. Clamped by layout metadata bounds. */
    scrollY?: number;
    /** Scrollbar glyph variant for overflow: "scroll" (default: "minimal"). */
    scrollbarVariant?: "minimal" | "classic" | "modern" | "dots" | "thin";
    /** Optional style override for rendered scrollbars. */
    scrollbarStyle?: TextStyle;
    /** Optional scoped theme override for this container subtree. */
    theme?: ScopedThemeOverride;
    /** Optional declarative transition settings for this container. */
    transition?: TransitionSpec;
    /** Optional declarative exit transition before unmount removal. */
    exitTransition?: TransitionSpec;
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

export type GridProps = Readonly<
  {
    id?: string;
    key?: string;
    columns: number | string;
    rows?: number | string;
    gap?: number;
    rowGap?: number;
    columnGap?: number;
    theme?: ScopedThemeOverride;
    transition?: TransitionSpec;
    exitTransition?: TransitionSpec;
  } & LayoutConstraints
>;

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
  /** Design system: color tone. */
  dsTone?: WidgetTone;
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
  /** Design system: visual variant. */
  dsVariant?: WidgetVariant;
  /** Design system: color tone. */
  dsTone?: WidgetTone;
  /** Design system: size preset. */
  dsSize?: WidgetSize;
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
  /** Optional forced width in cells. */
  width?: SizeConstraint;
  /** Optional forced height in rows. */
  height?: SizeConstraint;
  /** Label before the gauge */
  label?: string;
  /** Display variant */
  variant?: "linear" | "compact";
  /** Color thresholds for value ranges */
  thresholds?: readonly { value: number; variant: BadgeVariant }[];
  /** Optional style override */
  style?: TextStyle;
}> &
  DisplayableProps;

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
 * Error payload passed to `errorBoundary` fallbacks.
 */
export type ErrorBoundaryError = Readonly<{
  /** Runtime error code for the trapped boundary failure. */
  code: "ZRUI_USER_CODE_THROW";
  /** Friendly error message (for display in fallbacks). */
  message: string;
  /** Full detail string emitted by runtime error reporting. */
  detail: string;
  /** Optional stack trace when available. */
  stack?: string;
  /** Retry this boundary subtree on the next commit turn. */
  retry: () => void;
}>;

/**
 * Props for error boundary container widget.
 * Isolates subtree render failures and renders a fallback instead of faulting the app.
 */
export type ErrorBoundaryProps = Readonly<{
  key?: string;
  /** Risky subtree to protect. */
  children: VNode;
  /** Fallback renderer invoked when the protected subtree throws. */
  fallback: (error: ErrorBoundaryError) => VNode;
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

export type GraphicsBlitter = "auto" | "braille" | "sextant" | "quadrant" | "halfblock" | "ascii";

export type CanvasPoint = Readonly<{
  x: number;
  y: number;
}>;

export type CanvasContext = Readonly<{
  readonly width: number;
  readonly height: number;
  line: (x0: number, y0: number, x1: number, y1: number, color: string) => void;
  polyline: (points: readonly CanvasPoint[], color: string) => void;
  fillRect: (x: number, y: number, w: number, h: number, color: string) => void;
  strokeRect: (x: number, y: number, w: number, h: number, color: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, radius: number, color: string) => void;
  circle: (cx: number, cy: number, radius: number, color: string) => void;
  arc: (
    cx: number,
    cy: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    color: string,
  ) => void;
  fillCircle: (cx: number, cy: number, radius: number, color: string) => void;
  fillTriangle: (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
  ) => void;
  setPixel: (x: number, y: number, color: string) => void;
  text: (x: number, y: number, str: string, color?: string) => void;
  clear: (color?: string) => void;
}>;

export type LinkProps = Readonly<{
  id?: string;
  key?: string;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  /** URL to open in terminal hyperlink-capable renderers. */
  url: string;
  /** Link label text. Defaults to url. */
  label?: string;
  /** Optional text style for the link. */
  style?: TextStyle;
  /** Optional local press handler. */
  onPress?: () => void;
  /** Disabled links are rendered but not focusable/pressable. */
  disabled?: boolean;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
}> &
  DisplayableProps;

export type CanvasProps = Readonly<{
  id?: string;
  key?: string;
  /** Width in terminal columns. */
  width?: SizeConstraint;
  /** Height in terminal rows. */
  height?: SizeConstraint;
  /** Drawing callback, called every frame with a fresh context. */
  draw: (ctx: CanvasContext) => void;
  /** Preferred blitter. */
  blitter?: GraphicsBlitter;
}> &
  DisplayableProps;

export type ImageFit = "fill" | "contain" | "cover";
export type ImageProtocol = "auto" | "kitty" | "sixel" | "iterm2" | "blitter";

export type ImageProps = Readonly<{
  id?: string;
  key?: string;
  /** Image bytes (PNG or RGBA payload). */
  src: Uint8Array;
  /** Optional source width in pixels (recommended for raw RGBA inputs). */
  sourceWidth?: number;
  /** Optional source height in pixels (recommended for raw RGBA inputs). */
  sourceHeight?: number;
  /** Width in terminal columns. */
  width?: SizeConstraint;
  /** Height in terminal rows. */
  height?: SizeConstraint;
  /** Fit mode (default: contain). */
  fit?: ImageFit;
  /** Alt text for unsupported terminals or decode failures. */
  alt?: string;
  /** Preferred image protocol. */
  protocol?: ImageProtocol;
  /** Z-layer for compositing. */
  zLayer?: -1 | 0 | 1;
  /** Stable image id for protocol-level caching. */
  imageId?: number;
}> &
  DisplayableProps;

export type LineChartSeries = Readonly<{
  data: readonly number[];
  color: string;
  label?: string;
}>;

export type ChartAxis = Readonly<{
  label?: string;
  min?: number;
  max?: number;
}>;

export type LineChartProps = Readonly<{
  id?: string;
  key?: string;
  width?: SizeConstraint;
  height?: SizeConstraint;
  series: readonly LineChartSeries[];
  axes?: Readonly<{ x?: ChartAxis; y?: ChartAxis }>;
  blitter?: Exclude<GraphicsBlitter, "ascii">;
  showLegend?: boolean;
}> &
  DisplayableProps;

export type ScatterPoint = Readonly<{
  x: number;
  y: number;
  color?: string;
}>;

export type ScatterProps = Readonly<{
  id?: string;
  key?: string;
  width?: SizeConstraint;
  height?: SizeConstraint;
  points: readonly ScatterPoint[];
  axes?: Readonly<{ x?: ChartAxis; y?: ChartAxis }>;
  color?: string;
  blitter?: Exclude<GraphicsBlitter, "ascii">;
}> &
  DisplayableProps;

export type HeatmapColorScale = "viridis" | "plasma" | "inferno" | "magma" | "turbo" | "grayscale";

export type HeatmapProps = Readonly<{
  id?: string;
  key?: string;
  width?: SizeConstraint;
  height?: SizeConstraint;
  /** 2D value matrix [row][col]. */
  data: readonly (readonly number[])[];
  colorScale?: HeatmapColorScale;
  min?: number;
  max?: number;
}> &
  DisplayableProps;

/**
 * Props for sparkline widget.
 * Mini inline chart using block characters.
 */
export type SparklineProps = Readonly<{
  key?: string;
  /** Data points (will be normalized to 0-1 range) */
  data: readonly number[];
  /** Display width in cells (default: data.length) */
  width?: SizeConstraint;
  /** Display height in rows (default: 1) */
  height?: SizeConstraint;
  /** Minimum value for scaling (default: auto) */
  min?: number;
  /** Maximum value for scaling (default: auto) */
  max?: number;
  /** Enables sub-cell rendering when supported. */
  highRes?: boolean;
  /** Blitter for highRes mode. */
  blitter?: Exclude<GraphicsBlitter, "auto" | "ascii">;
  /** Optional style override */
  style?: TextStyle;
}> &
  DisplayableProps;

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
  /** Optional forced width in cells. */
  width?: SizeConstraint;
  /** Optional forced height in rows. */
  height?: SizeConstraint;
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
  /** Enables sub-cell rendering when supported. */
  highRes?: boolean;
  /** Blitter for highRes mode. */
  blitter?: Exclude<GraphicsBlitter, "auto" | "ascii">;
  /** Optional style override */
  style?: TextStyle;
}> &
  DisplayableProps;

/**
 * Props for mini chart widget.
 * Compact multi-value display.
 */
export type MiniChartProps = Readonly<{
  key?: string;
  /** Optional forced width in cells. */
  width?: SizeConstraint;
  /** Optional forced height in rows. */
  height?: SizeConstraint;
  /** Chart values (2-4 values recommended) */
  values: readonly { label: string; value: number; max?: number }[];
  /** Display variant */
  variant?: "bars" | "pills";
  /** Optional style override */
  style?: TextStyle;
}> &
  DisplayableProps;

export type ButtonIntent = "primary" | "secondary" | "danger" | "success" | "warning" | "link";

/** Props for button widget. id is required for focus/routing; label is display text. */
export type ButtonProps = Readonly<{
  id: string;
  key?: string;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  label: string;
  disabled?: boolean;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /**
   * Horizontal padding in cells.
   * - Legacy/manual path default: 1
   * - Recipe path: derived from `dsSize` unless overridden by `px`
   */
  px?: number;
  /** Optional style applied to the button label (merged with focus/disabled state). */
  style?: TextStyle;
  /** Optional style applied while the button is pressed. */
  pressedStyle?: TextStyle;
  /** Optional callback invoked when the button is activated. */
  onPress?: () => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /**
   * Design system: visual variant.
   * - "solid": Accent background, inverse text (primary CTA)
   * - "soft": Subtle background, accent text (secondary)
   * - "outline": Border, no fill (tertiary)
   * - "ghost": No background or border (minimal)
   * @default "soft"
   */
  dsVariant?: WidgetVariant;
  /**
   * Design system: color tone.
   * @default "default"
   */
  dsTone?: WidgetTone;
  /**
   * Design system: size preset.
   * @default "md"
   */
  dsSize?: WidgetSize;
  /** Shorthand for dsVariant + dsTone. Overridden by explicit dsVariant/dsTone. */
  intent?: ButtonIntent;
}>;

/** Props for input widget. id is required; value is controlled by app state. */
export type InputProps = Readonly<{
  id: string;
  key?: string;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  value: string;
  disabled?: boolean;
  /** Keep the input focusable/selectable while preventing edits. */
  readOnly?: boolean;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional style applied to the input value (merged with focus/disabled state). */
  style?: TextStyle;
  /** Optional callback invoked on input edits (docs/18). */
  onInput?: (value: string, cursor: number) => void;
  /** Optional callback invoked when the input loses focus. */
  onBlur?: () => void;
  /** Internal multiline mode used by ui.textarea(). */
  multiline?: boolean;
  /** Visible line count when multiline mode is enabled (default: 3). */
  rows?: number;
  /** Wrap long lines in multiline mode (default: true). */
  wordWrap?: boolean;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
  /**
   * Design system: size preset.
   * @default "md"
   */
  dsSize?: WidgetSize;
  /**
   * Design system: placeholder text displayed when value is empty.
   */
  placeholder?: string;
}>;

/** Props for ui.textarea(). Multi-line controlled text input. */
export type TextareaProps = Readonly<{
  id: string;
  key?: string;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  value: string;
  disabled?: boolean;
  /** Keep the textarea focusable/selectable while preventing edits. */
  readOnly?: boolean;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Visible line count (default: 3). */
  rows?: number;
  /** Wrap long lines (default: true). */
  wordWrap?: boolean;
  /** Placeholder text shown when value is empty. */
  placeholder?: string;
  /** Optional style applied to the textarea value (merged with focus/disabled state). */
  style?: TextStyle;
  /** Optional callback invoked on input edits. */
  onInput?: (value: string, cursor: number) => void;
  /** Optional callback invoked when the textarea loses focus. */
  onBlur?: () => void;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
}>;

/** Props for focus announcer widget. Renders a live summary for the focused element. */
export type FocusAnnouncerProps = Readonly<{
  key?: string;
  /** Optional fallback text when no widget is focused. */
  emptyText?: string;
  /** Optional style applied to the announcement line. */
  style?: TextStyle;
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

/** Context passed to custom virtual-list measurement callbacks. */
export type VirtualListMeasureItemHeightCtx = Readonly<{
  /** Available content width in terminal cells for this item. */
  width: number;
  /** Estimated height used for initial windowing before correction. */
  estimatedHeight: number;
  /** Rendered VNode returned by `renderItem`. */
  vnode: VNode;
}>;

/** Props for virtualList widget. Efficiently renders large datasets with windowed virtualization. */
export type VirtualListProps<T = unknown> = Readonly<{
  id: string;
  key?: string;
  /** Opt out of Tab focus order while keeping id-based routing available. */
  focusable?: boolean;
  /** Optional semantic label used for accessibility/debug announcements. */
  accessibleLabel?: string;
  items: readonly T[];
  /**
   * Exact item height specification (fixed or callback).
   * Use this for fixed-height or precomputed variable-height rows.
   */
  itemHeight?: ItemHeightSpec<T>;
  /**
   * Estimated item height used for variable-height virtualization.
   * When provided, visible items are measured and cached to correct offsets.
   */
  estimateItemHeight?: ItemHeightSpec<T>;
  /**
   * Optional custom measurement callback for estimate mode.
   * Return the measured height in cells for the rendered VNode.
   */
  measureItemHeight?: (item: T, index: number, ctx: VirtualListMeasureItemHeightCtx) => number;
  /** Number of items to render outside the visible viewport (default: 3) */
  overscan?: number;
  renderItem: (item: T, index: number, focused: boolean) => VNode;
  onScroll?: (scrollTop: number, visibleRange: [number, number]) => void;
  onSelect?: (item: T, index: number) => void;
  /** Enable keyboard navigation with arrow keys, page up/down, home/end (default: true) */
  keyboardNavigation?: boolean;
  /** Wrap selection from last item to first and vice versa (default: false) */
  wrapAround?: boolean;
  /**
   * Mouse wheel scroll direction (default: "traditional").
   * - "traditional": wheel down moves the viewport down
   * - "natural": wheel down moves content down (trackpad-style)
   */
  scrollDirection?: "natural" | "traditional";
  /** Optional style override for the selected/focused row highlight. */
  selectionStyle?: TextStyle;
  /** Optional focus appearance configuration. */
  focusConfig?: FocusConfig;
}> &
  LayoutConstraints;
