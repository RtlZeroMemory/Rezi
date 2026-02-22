/**
 * packages/core/src/ui/recipes.ts — Style recipes for all widget families.
 *
 * Why: Centralizes style computation so widgets never specify raw colors.
 * Each recipe takes design tokens (theme, variant, state, size, tone)
 * and returns TextStyle objects ready for the drawlist builder.
 *
 * Performance: All functions are pure and allocation-light. Frozen objects
 * are returned for common paths. No closures or maps created per call.
 *
 * @see docs/design-system.md
 */

import type { ColorTokens, ThemeDefinition } from "../theme/tokens.js";
import type { Rgb, TextStyle } from "../widgets/style.js";
import {
  type BorderVariant,
  type Density,
  type ElevationLevel,
  type TypographyRole,
  type WidgetSize,
  type WidgetState,
  type WidgetTone,
  type WidgetVariant,
  resolveBorderVariant,
  resolveDensityGap,
  resolveSize,
  resolveSurface,
  resolveToneColor,
  resolveToneFg,
  resolveTypography,
} from "./designTokens.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Blend two colors by a factor (0 = a, 1 = b). */
function blendRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/** Lighten or darken a color toward white/black. */
function adjustBrightness(color: Rgb, amount: number): Rgb {
  const target = amount > 0 ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };
  return blendRgb(color, target, Math.abs(amount));
}

// ---------------------------------------------------------------------------
// Button recipe
// ---------------------------------------------------------------------------

export type ButtonRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  state?: WidgetState;
  density?: Density;
}>;

export type ButtonRecipeResult = Readonly<{
  /** Style for the button label text */
  label: TextStyle;
  /** Style for the button background fill (if solid/soft) */
  bg: TextStyle;
  /** Horizontal padding */
  px: number;
  /** Border variant to use */
  border: BorderVariant;
  /** Border style overrides */
  borderStyle: TextStyle | undefined;
}>;

export function buttonRecipe(
  colors: ColorTokens,
  params: ButtonRecipeParams = {},
): ButtonRecipeResult {
  const variant = params.variant ?? "soft";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size);

  const accentColor = resolveToneColor(colors, tone);

  // Disabled overrides everything
  if (state === "disabled") {
    return {
      label: { fg: colors.disabled.fg },
      bg: { bg: colors.disabled.bg },
      px: spacing.px,
      border: variant === "outline" ? "single" : "none",
      borderStyle: variant === "outline" ? { fg: colors.disabled.fg } : undefined,
    };
  }

  // Loading shows muted
  if (state === "loading") {
    return {
      label: { fg: colors.fg.muted, dim: true },
      bg: { bg: colors.bg.subtle },
      px: spacing.px,
      border: "none",
      borderStyle: undefined,
    };
  }

  // Focus adds underline + bold
  const focusAttrs: TextStyle = state === "focus" ? { underline: true, bold: true } : {};

  // Pressed adds dim
  const pressedAttrs: TextStyle = state === "pressed" ? { dim: true } : {};

  switch (variant) {
    case "solid": {
      const bg = state === "pressed" ? adjustBrightness(accentColor, -0.15) : accentColor;
      return {
        label: { fg: colors.fg.inverse, ...focusAttrs, ...pressedAttrs },
        bg: { bg },
        px: spacing.px,
        border: "none",
        borderStyle: undefined,
      };
    }

    case "soft": {
      const bgColor =
        state === "focus" || state === "active-item" ? colors.bg.subtle : colors.bg.elevated;
      return {
        label: { fg: accentColor, ...focusAttrs, ...pressedAttrs },
        bg: { bg: bgColor },
        px: spacing.px,
        border: "none",
        borderStyle: undefined,
      };
    }

    case "outline": {
      const borderColor = state === "focus" ? accentColor : colors.border.default;
      return {
        label: { fg: colors.fg.primary, ...focusAttrs, ...pressedAttrs },
        bg: { bg: colors.bg.base },
        px: spacing.px,
        border: state === "focus" ? "heavy" : "single",
        borderStyle: { fg: borderColor },
      };
    }

    case "ghost": {
      return {
        label: { fg: colors.fg.secondary, ...focusAttrs, ...pressedAttrs },
        bg: state === "active-item" || state === "focus" ? { bg: colors.bg.subtle } : {},
        px: spacing.px,
        border: "none",
        borderStyle: undefined,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Input recipe
// ---------------------------------------------------------------------------

export type InputRecipeParams = Readonly<{
  state?: WidgetState;
  size?: WidgetSize;
  density?: Density;
}>;

export type InputRecipeResult = Readonly<{
  /** Style for input text */
  text: TextStyle;
  /** Style for placeholder text */
  placeholder: TextStyle;
  /** Style for the input background */
  bg: TextStyle;
  /** Border variant */
  border: BorderVariant;
  /** Border style */
  borderStyle: TextStyle;
  /** Horizontal padding */
  px: number;
}>;

export function inputRecipe(
  colors: ColorTokens,
  params: InputRecipeParams = {},
): InputRecipeResult {
  const state = params.state ?? "default";
  const size = params.size ?? "md";
  const spacing = resolveSize(size);

  if (state === "disabled") {
    return {
      text: { fg: colors.disabled.fg },
      placeholder: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      border: "single",
      borderStyle: { fg: colors.disabled.fg },
      px: spacing.px,
    };
  }

  if (state === "error") {
    return {
      text: { fg: colors.fg.primary },
      placeholder: { fg: colors.fg.muted },
      bg: { bg: colors.bg.elevated },
      border: "single",
      borderStyle: { fg: colors.error },
      px: spacing.px,
    };
  }

  if (state === "focus") {
    return {
      text: { fg: colors.fg.primary },
      placeholder: { fg: colors.fg.muted },
      bg: { bg: colors.bg.elevated },
      border: "heavy",
      borderStyle: { fg: colors.accent.primary, bold: true },
      px: spacing.px,
    };
  }

  return {
    text: { fg: colors.fg.primary },
    placeholder: { fg: colors.fg.muted },
    bg: { bg: colors.bg.elevated },
    border: "single",
    borderStyle: { fg: colors.border.default },
    px: spacing.px,
  };
}

// ---------------------------------------------------------------------------
// Surface recipe
// ---------------------------------------------------------------------------

export type SurfaceRecipeParams = Readonly<{
  elevation?: ElevationLevel;
  focused?: boolean;
}>;

export type SurfaceRecipeResult = Readonly<{
  /** Style for the surface background */
  bg: TextStyle;
  /** Border variant */
  border: BorderVariant;
  /** Border style */
  borderStyle: TextStyle | undefined;
  /** Whether to show shadow */
  shadow: boolean;
}>;

export function surfaceRecipe(
  colors: ColorTokens,
  params: SurfaceRecipeParams = {},
): SurfaceRecipeResult {
  const elevation = params.elevation ?? 1;
  const focused = params.focused ?? false;
  const surface = resolveSurface(colors, elevation);
  const borderVariant = resolveBorderVariant(elevation, focused);

  let borderStyle: TextStyle | undefined;
  if (surface.border !== null) {
    borderStyle = focused ? { fg: colors.accent.primary, bold: true } : { fg: surface.border };
  }

  return {
    bg: { bg: surface.bg },
    border: borderVariant,
    borderStyle,
    shadow: surface.shadow,
  };
}

// ---------------------------------------------------------------------------
// Select recipe
// ---------------------------------------------------------------------------

export type SelectRecipeParams = Readonly<{
  state?: WidgetState;
  size?: WidgetSize;
}>;

export type SelectRecipeResult = Readonly<{
  /** Style for the select trigger */
  trigger: TextStyle;
  /** Style for the select trigger background */
  triggerBg: TextStyle;
  /** Style for option items */
  option: TextStyle;
  /** Style for the selected/active option */
  activeOption: TextStyle;
  /** Border variant for the trigger */
  border: BorderVariant;
  /** Border style for the trigger */
  borderStyle: TextStyle;
  /** Horizontal padding */
  px: number;
}>;

export function selectRecipe(
  colors: ColorTokens,
  params: SelectRecipeParams = {},
): SelectRecipeResult {
  const state = params.state ?? "default";
  const size = params.size ?? "md";
  const spacing = resolveSize(size);

  if (state === "disabled") {
    return {
      trigger: { fg: colors.disabled.fg },
      triggerBg: { bg: colors.disabled.bg },
      option: { fg: colors.disabled.fg },
      activeOption: { fg: colors.disabled.fg },
      border: "single",
      borderStyle: { fg: colors.disabled.fg },
      px: spacing.px,
    };
  }

  const isFocused = state === "focus";
  return {
    trigger: isFocused
      ? { fg: colors.fg.primary, underline: true, bold: true }
      : { fg: colors.fg.primary },
    triggerBg: { bg: colors.bg.elevated },
    option: { fg: colors.fg.primary },
    activeOption: { fg: colors.selected.fg, bg: colors.selected.bg, bold: true },
    border: isFocused ? "heavy" : "single",
    borderStyle: isFocused ? { fg: colors.accent.primary } : { fg: colors.border.default },
    px: spacing.px,
  };
}

// ---------------------------------------------------------------------------
// Table recipe
// ---------------------------------------------------------------------------

export type TableRecipeParams = Readonly<{
  state?: "header" | "row" | "selectedRow" | "focusedRow" | "stripe";
  density?: Density;
}>;

export type TableRecipeResult = Readonly<{
  /** Style for the cell content */
  cell: TextStyle;
  /** Style for the cell background */
  bg: TextStyle;
}>;

export function tableRecipe(
  colors: ColorTokens,
  params: TableRecipeParams = {},
): TableRecipeResult {
  const state = params.state ?? "row";

  switch (state) {
    case "header":
      return {
        cell: { fg: colors.fg.secondary, bold: true },
        bg: { bg: colors.bg.elevated },
      };
    case "row":
      return {
        cell: { fg: colors.fg.primary },
        bg: { bg: colors.bg.base },
      };
    case "stripe":
      return {
        cell: { fg: colors.fg.primary },
        bg: { bg: colors.bg.subtle },
      };
    case "selectedRow":
      return {
        cell: { fg: colors.selected.fg, bold: true },
        bg: { bg: colors.selected.bg },
      };
    case "focusedRow":
      return {
        cell: { fg: colors.fg.primary, bold: true },
        bg: { bg: colors.focus.bg },
      };
  }
}

// ---------------------------------------------------------------------------
// Modal recipe
// ---------------------------------------------------------------------------

export type ModalRecipeParams = Readonly<{
  focused?: boolean;
}>;

export type ModalRecipeResult = Readonly<{
  /** Style for the modal frame background */
  frame: TextStyle;
  /** Style for the backdrop */
  backdrop: TextStyle;
  /** Border variant */
  border: BorderVariant;
  /** Border style */
  borderStyle: TextStyle;
  /** Whether to show shadow */
  shadow: boolean;
  /** Style for the modal title */
  title: TextStyle;
}>;

export function modalRecipe(
  colors: ColorTokens,
  params: ModalRecipeParams = {},
): ModalRecipeResult {
  const focused = params.focused ?? true;

  return {
    frame: { bg: colors.bg.overlay },
    backdrop: { bg: colors.bg.base, dim: true },
    border: focused ? "heavy" : "rounded",
    borderStyle: focused ? { fg: colors.accent.primary, bold: true } : { fg: colors.border.strong },
    shadow: true,
    title: { fg: colors.fg.primary, bold: true },
  };
}

// ---------------------------------------------------------------------------
// Badge recipe
// ---------------------------------------------------------------------------

export type BadgeRecipeParams = Readonly<{
  tone?: WidgetTone | "info";
}>;

export type BadgeRecipeResult = Readonly<{
  /** Style for the badge text */
  text: TextStyle;
}>;

export function badgeRecipe(
  colors: ColorTokens,
  params: BadgeRecipeParams = {},
): BadgeRecipeResult {
  const tone = params.tone ?? "default";

  let fg: Rgb;
  switch (tone) {
    case "danger":
      fg = colors.error;
      break;
    case "success":
      fg = colors.success;
      break;
    case "warning":
      fg = colors.warning;
      break;
    case "info":
      fg = colors.info;
      break;
    case "default":
    case "primary":
      fg = colors.accent.primary;
      break;
  }

  return {
    text: { fg, bold: true },
  };
}

// ---------------------------------------------------------------------------
// Text recipe
// ---------------------------------------------------------------------------

export type TextRecipeParams = Readonly<{
  role?: TypographyRole;
}>;

export type TextRecipeResult = Readonly<{
  style: TextStyle;
}>;

export function textRecipe(colors: ColorTokens, params: TextRecipeParams = {}): TextRecipeResult {
  const role = params.role ?? "body";
  const typo = resolveTypography(colors, role);
  return { style: typo };
}

// ---------------------------------------------------------------------------
// Divider recipe
// ---------------------------------------------------------------------------

export type DividerRecipeResult = Readonly<{
  style: TextStyle;
}>;

export function dividerRecipe(colors: ColorTokens): DividerRecipeResult {
  return {
    style: { fg: colors.border.subtle },
  };
}

// ---------------------------------------------------------------------------
// Checkbox recipe
// ---------------------------------------------------------------------------

export type CheckboxRecipeParams = Readonly<{
  state?: WidgetState;
  checked?: boolean;
}>;

export type CheckboxRecipeResult = Readonly<{
  /** Style for the checkbox indicator */
  indicator: TextStyle;
  /** Style for the label */
  label: TextStyle;
}>;

export function checkboxRecipe(
  colors: ColorTokens,
  params: CheckboxRecipeParams = {},
): CheckboxRecipeResult {
  const state = params.state ?? "default";
  const checked = params.checked ?? false;

  if (state === "disabled") {
    return {
      indicator: { fg: colors.disabled.fg },
      label: { fg: colors.disabled.fg },
    };
  }

  const isFocused = state === "focus";
  return {
    indicator: {
      fg: checked ? colors.accent.primary : colors.fg.secondary,
      bold: isFocused,
    },
    label: {
      fg: colors.fg.primary,
      bold: isFocused,
    },
  };
}

// ---------------------------------------------------------------------------
// Progress recipe
// ---------------------------------------------------------------------------

export type ProgressRecipeParams = Readonly<{
  tone?: WidgetTone;
}>;

export type ProgressRecipeResult = Readonly<{
  /** Style for the filled portion */
  filled: TextStyle;
  /** Style for the unfilled track */
  track: TextStyle;
}>;

export function progressRecipe(
  colors: ColorTokens,
  params: ProgressRecipeParams = {},
): ProgressRecipeResult {
  const tone = params.tone ?? "primary";
  const accentColor = resolveToneColor(colors, tone);

  return {
    filled: { fg: accentColor },
    track: { fg: colors.border.subtle },
  };
}

// ---------------------------------------------------------------------------
// Callout recipe
// ---------------------------------------------------------------------------

export type CalloutRecipeParams = Readonly<{
  tone?: WidgetTone | "info";
}>;

export type CalloutRecipeResult = Readonly<{
  /** Style for the callout text */
  text: TextStyle;
  /** Style for the callout border */
  borderStyle: TextStyle;
  /** Style for the callout background */
  bg: TextStyle;
}>;

export function calloutRecipe(
  colors: ColorTokens,
  params: CalloutRecipeParams = {},
): CalloutRecipeResult {
  const tone = params.tone ?? "info";

  let accentColor: Rgb;
  switch (tone) {
    case "danger":
      accentColor = colors.error;
      break;
    case "success":
      accentColor = colors.success;
      break;
    case "warning":
      accentColor = colors.warning;
      break;
    case "info":
      accentColor = colors.info;
      break;
    case "default":
    case "primary":
      accentColor = colors.accent.primary;
      break;
  }

  return {
    text: { fg: colors.fg.primary },
    borderStyle: { fg: accentColor },
    bg: { bg: colors.bg.elevated },
  };
}

// ---------------------------------------------------------------------------
// Scrollbar recipe
// ---------------------------------------------------------------------------

export type ScrollbarRecipeResult = Readonly<{
  track: TextStyle;
  thumb: TextStyle;
}>;

export function scrollbarRecipe(colors: ColorTokens): ScrollbarRecipeResult {
  return {
    track: { fg: colors.border.subtle },
    thumb: { fg: colors.fg.muted },
  };
}

// ---------------------------------------------------------------------------
// Public recipe namespace
// ---------------------------------------------------------------------------

/**
 * Recipe namespace — the primary API for computing widget styles
 * from design tokens. All recipes take a ColorTokens set (from ThemeDefinition)
 * and return TextStyle objects.
 *
 * @example
 * ```typescript
 * const colors = darkTheme.colors;
 * const btn = recipe.button(colors, { variant: "solid", tone: "primary", state: "focus" });
 * // btn.label: { fg: ..., underline: true, bold: true }
 * // btn.bg: { bg: ... }
 * ```
 */
export const recipe = {
  button: buttonRecipe,
  input: inputRecipe,
  surface: surfaceRecipe,
  select: selectRecipe,
  table: tableRecipe,
  modal: modalRecipe,
  badge: badgeRecipe,
  text: textRecipe,
  divider: dividerRecipe,
  checkbox: checkboxRecipe,
  progress: progressRecipe,
  callout: calloutRecipe,
  scrollbar: scrollbarRecipe,
} as const;
