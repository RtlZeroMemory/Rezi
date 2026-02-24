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

import { blendRgb } from "../theme/blend.js";
import type { ColorTokens, ThemeSpacingTokens } from "../theme/tokens.js";
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
  spacing?: ThemeSpacingTokens | readonly number[];
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
  const density = params.density ?? "comfortable";
  const spacing = resolveSize(size, params.spacing);
  const px = density === "compact" ? Math.max(0, spacing.px - 1) : spacing.px;

  const accentColor = resolveToneColor(colors, tone);

  // Disabled overrides everything
  if (state === "disabled") {
    return {
      label: { fg: colors.disabled.fg },
      bg: { bg: colors.disabled.bg },
      px,
      border: variant === "outline" ? "single" : "none",
      borderStyle: variant === "outline" ? { fg: colors.disabled.fg } : undefined,
    };
  }

  // Loading shows muted
  if (state === "loading") {
    return {
      label: { fg: colors.fg.muted, dim: true },
      bg: { bg: colors.bg.subtle },
      px,
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
        px,
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
        px,
        border: "none",
        borderStyle: undefined,
      };
    }

    case "outline": {
      const borderColor = state === "focus" ? accentColor : colors.border.default;
      return {
        label: { fg: colors.fg.primary, ...focusAttrs, ...pressedAttrs },
        bg: { bg: colors.bg.base },
        px,
        border: state === "focus" ? "heavy" : "single",
        borderStyle: { fg: borderColor },
      };
    }

    case "ghost": {
      const fg = tone === "default" ? colors.fg.secondary : accentColor;
      return {
        label: { fg, ...focusAttrs, ...pressedAttrs },
        bg: state === "active-item" || state === "focus" ? { bg: colors.bg.subtle } : {},
        px,
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
  spacing?: ThemeSpacingTokens | readonly number[];
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
  const density = params.density ?? "comfortable";
  const spacing = resolveSize(size, params.spacing);
  const px = density === "compact" ? Math.max(0, spacing.px - 1) : spacing.px;

  if (state === "disabled") {
    return {
      text: { fg: colors.disabled.fg },
      placeholder: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      border: "single",
      borderStyle: { fg: colors.disabled.fg },
      px,
    };
  }

  if (state === "error") {
    return {
      text: { fg: colors.fg.primary },
      placeholder: { fg: colors.fg.muted },
      bg: { bg: colors.bg.elevated },
      border: "single",
      borderStyle: { fg: colors.error },
      px,
    };
  }

  if (state === "focus") {
    return {
      text: { fg: colors.fg.primary },
      placeholder: { fg: colors.fg.muted },
      bg: { bg: colors.bg.elevated },
      border: "heavy",
      borderStyle: { fg: colors.accent.primary, bold: true },
      px,
    };
  }

  return {
    text: { fg: colors.fg.primary },
    placeholder: { fg: colors.fg.muted },
    bg: { bg: colors.bg.elevated },
    border: "single",
    borderStyle: { fg: colors.border.default },
    px,
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
  spacing?: ThemeSpacingTokens | readonly number[];
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
  const spacing = resolveSize(size, params.spacing);

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

  if (state === "error") {
    return {
      trigger: { fg: colors.fg.primary },
      triggerBg: { bg: colors.bg.elevated },
      option: { fg: colors.fg.primary },
      activeOption: { fg: colors.selected.fg, bg: colors.selected.bg, bold: true },
      border: "single",
      borderStyle: { fg: colors.error },
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
// Tabs recipe
// ---------------------------------------------------------------------------

export type TabsRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "pressed" | "disabled" | "selected";
}>;

export type TabsRecipeResult = Readonly<{
  item: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
}>;

export function tabsRecipe(colors: ColorTokens, params: TabsRecipeParams = {}): TabsRecipeResult {
  const variant = params.variant ?? "soft";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const active = state === "active-item" || state === "selected";
  const focused = state === "focus";
  const pressed = state === "pressed";
  const accentColor = resolveToneColor(colors, tone);

  if (state === "disabled") {
    return {
      item: { fg: colors.disabled.fg },
      bg: { bg: colors.disabled.bg },
      border: variant === "outline" ? "single" : "none",
      borderStyle: variant === "outline" ? { fg: colors.disabled.fg } : undefined,
      px: spacing.px,
    };
  }

  const focusAttrs: TextStyle = focused ? { underline: true, bold: true } : {};
  const pressAttrs: TextStyle = pressed ? { dim: true } : {};

  switch (variant) {
    case "solid":
      return {
        item: {
          fg: colors.fg.inverse,
          ...(active || focused ? { bold: true } : {}),
          ...focusAttrs,
          ...pressAttrs,
        },
        bg: { bg: active || focused ? accentColor : colors.bg.subtle },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "outline":
      return {
        item: {
          fg: active || focused ? accentColor : colors.fg.secondary,
          ...(active || focused ? { bold: true } : {}),
          ...focusAttrs,
          ...pressAttrs,
        },
        bg: { bg: colors.bg.base },
        border: active || focused ? "heavy" : "single",
        borderStyle: { fg: active || focused ? accentColor : colors.border.default },
        px: spacing.px,
      };
    case "ghost":
      return {
        item: {
          fg: active || focused ? accentColor : colors.fg.secondary,
          ...(active || focused ? { bold: true } : {}),
          ...focusAttrs,
          ...pressAttrs,
        },
        bg: active || focused ? { bg: colors.bg.subtle } : {},
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "soft":
      return {
        item: {
          fg: active || focused ? accentColor : colors.fg.primary,
          ...(active || focused ? { bold: true } : {}),
          ...focusAttrs,
          ...pressAttrs,
        },
        bg: { bg: active || focused ? colors.bg.subtle : colors.bg.elevated },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
  }
}

// ---------------------------------------------------------------------------
// Accordion recipe
// ---------------------------------------------------------------------------

export type AccordionRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled" | "selected";
}>;

export type AccordionRecipeResult = Readonly<{
  header: TextStyle;
  content: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
}>;

export function accordionRecipe(
  colors: ColorTokens,
  params: AccordionRecipeParams = {},
): AccordionRecipeResult {
  const variant = params.variant ?? "soft";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const active = state === "active-item" || state === "selected";
  const focused = state === "focus";
  const accentColor = resolveToneColor(colors, tone);

  if (state === "disabled") {
    return {
      header: { fg: colors.disabled.fg },
      content: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      border: variant === "outline" ? "single" : "none",
      borderStyle: variant === "outline" ? { fg: colors.disabled.fg } : undefined,
      px: spacing.px,
    };
  }

  const headerStyle: TextStyle = {
    fg: active || focused ? accentColor : colors.fg.primary,
    ...(active || focused ? { bold: true } : {}),
    ...(focused ? { underline: true } : {}),
  };

  switch (variant) {
    case "solid":
      return {
        header: { ...headerStyle, fg: colors.fg.inverse },
        content: { fg: colors.fg.primary },
        bg: { bg: active || focused ? accentColor : colors.bg.subtle },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "outline":
      return {
        header: headerStyle,
        content: { fg: colors.fg.primary },
        bg: { bg: colors.bg.base },
        border: active || focused ? "heavy" : "single",
        borderStyle: { fg: active || focused ? accentColor : colors.border.default },
        px: spacing.px,
      };
    case "ghost":
      return {
        header: {
          ...headerStyle,
          fg: active || focused ? accentColor : colors.fg.secondary,
        },
        content: { fg: colors.fg.primary },
        bg: active || focused ? { bg: colors.bg.subtle } : {},
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "soft":
      return {
        header: headerStyle,
        content: { fg: colors.fg.primary },
        bg: { bg: active || focused ? colors.bg.subtle : colors.bg.elevated },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
  }
}

// ---------------------------------------------------------------------------
// Breadcrumb recipe
// ---------------------------------------------------------------------------

export type BreadcrumbRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled" | "selected";
}>;

export type BreadcrumbRecipeResult = Readonly<{
  item: TextStyle;
  separator: TextStyle;
  bg: TextStyle;
  px: number;
}>;

export function breadcrumbRecipe(
  colors: ColorTokens,
  params: BreadcrumbRecipeParams = {},
): BreadcrumbRecipeResult {
  const variant = params.variant ?? "ghost";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);
  const active = state === "active-item" || state === "selected";
  const focused = state === "focus";

  if (state === "disabled") {
    return {
      item: { fg: colors.disabled.fg },
      separator: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      px: spacing.px,
    };
  }

  const itemStyle: TextStyle = {
    fg: active ? colors.fg.primary : accentColor,
    ...(active || focused ? { bold: true } : {}),
    ...(focused ? { underline: true } : {}),
  };
  const bg =
    variant === "solid"
      ? { bg: active || focused ? accentColor : colors.bg.subtle }
      : variant === "soft"
        ? { bg: active || focused ? colors.bg.subtle : colors.bg.elevated }
        : active || focused
          ? { bg: colors.bg.subtle }
          : {};
  return {
    item: variant === "solid" ? { ...itemStyle, fg: colors.fg.inverse } : itemStyle,
    separator: { fg: colors.fg.muted, dim: true },
    bg,
    px: spacing.px,
  };
}

// ---------------------------------------------------------------------------
// Pagination recipe
// ---------------------------------------------------------------------------

export type PaginationRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled" | "selected";
}>;

export type PaginationRecipeResult = Readonly<{
  control: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
}>;

export function paginationRecipe(
  colors: ColorTokens,
  params: PaginationRecipeParams = {},
): PaginationRecipeResult {
  const variant = params.variant ?? "soft";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);
  const active = state === "active-item" || state === "selected";
  const focused = state === "focus";

  if (state === "disabled") {
    return {
      control: { fg: colors.disabled.fg },
      bg: { bg: colors.disabled.bg },
      border: variant === "outline" ? "single" : "none",
      borderStyle: variant === "outline" ? { fg: colors.disabled.fg } : undefined,
      px: spacing.px,
    };
  }

  const controlStyle: TextStyle = {
    fg: active || focused ? accentColor : colors.fg.primary,
    ...(active || focused ? { bold: true } : {}),
    ...(focused ? { underline: true } : {}),
  };

  switch (variant) {
    case "solid":
      return {
        control: { ...controlStyle, fg: colors.fg.inverse },
        bg: { bg: active || focused ? accentColor : colors.bg.subtle },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "outline":
      return {
        control: controlStyle,
        bg: { bg: colors.bg.base },
        border: active || focused ? "heavy" : "single",
        borderStyle: { fg: active || focused ? accentColor : colors.border.default },
        px: spacing.px,
      };
    case "ghost":
      return {
        control: {
          ...controlStyle,
          fg: active || focused ? accentColor : colors.fg.secondary,
        },
        bg: active || focused ? { bg: colors.bg.subtle } : {},
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "soft":
      return {
        control: controlStyle,
        bg: { bg: active || focused ? colors.bg.subtle : colors.bg.elevated },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
  }
}

// ---------------------------------------------------------------------------
// Kbd recipe
// ---------------------------------------------------------------------------

export type KbdRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "focus" | "disabled";
}>;

export type KbdRecipeResult = Readonly<{
  key: TextStyle;
  separator: TextStyle;
  bracket: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
}>;

export function kbdRecipe(colors: ColorTokens, params: KbdRecipeParams = {}): KbdRecipeResult {
  const variant = params.variant ?? "outline";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);

  if (state === "disabled") {
    return {
      key: { fg: colors.disabled.fg, bold: false },
      separator: { fg: colors.disabled.fg, dim: true },
      bracket: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      border: "single",
      borderStyle: { fg: colors.disabled.fg },
      px: spacing.px,
    };
  }

  const focused = state === "focus";
  const keyStyle: TextStyle = {
    fg: accentColor,
    bold: true,
    ...(focused ? { underline: true } : {}),
  };

  switch (variant) {
    case "solid":
      return {
        key: { ...keyStyle, fg: colors.fg.inverse },
        separator: { fg: colors.fg.inverse, dim: true },
        bracket: { fg: colors.fg.inverse, dim: true },
        bg: { bg: accentColor },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "ghost":
      return {
        key: { ...keyStyle, fg: colors.fg.primary },
        separator: { fg: colors.fg.muted },
        bracket: { fg: colors.fg.muted },
        bg: {},
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "soft":
      return {
        key: keyStyle,
        separator: { fg: colors.fg.muted },
        bracket: { fg: colors.fg.muted },
        bg: { bg: colors.bg.subtle },
        border: "none",
        borderStyle: undefined,
        px: spacing.px,
      };
    case "outline":
      return {
        key: keyStyle,
        separator: { fg: colors.fg.muted },
        bracket: { fg: colors.fg.muted },
        bg: { bg: colors.bg.elevated },
        border: focused ? "heavy" : "single",
        borderStyle: focused ? { fg: accentColor } : { fg: colors.border.default },
        px: spacing.px,
      };
  }
}

// ---------------------------------------------------------------------------
// Sidebar recipe
// ---------------------------------------------------------------------------

export type SidebarRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled" | "selected";
}>;

export type SidebarRecipeResult = Readonly<{
  item: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
  gap: number;
}>;

export function sidebarRecipe(
  colors: ColorTokens,
  params: SidebarRecipeParams = {},
): SidebarRecipeResult {
  const variant = params.variant ?? "soft";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);
  const active = state === "active-item" || state === "selected";
  const focused = state === "focus";

  if (state === "disabled") {
    return {
      item: { fg: colors.disabled.fg },
      bg: { bg: colors.disabled.bg },
      border: "single",
      borderStyle: { fg: colors.disabled.fg },
      px: spacing.px,
      gap: resolveDensityGap("compact"),
    };
  }

  const item: TextStyle = {
    fg: active || focused ? accentColor : colors.fg.primary,
    ...(active || focused ? { bold: true } : {}),
    ...(focused ? { underline: true } : {}),
  };
  return {
    item: variant === "solid" ? { ...item, fg: colors.fg.inverse } : item,
    bg:
      variant === "solid"
        ? { bg: active || focused ? accentColor : colors.bg.subtle }
        : variant === "ghost"
          ? active || focused
            ? { bg: colors.bg.subtle }
            : {}
          : { bg: active || focused ? colors.bg.subtle : colors.bg.elevated },
    border: variant === "outline" ? (focused ? "heavy" : "single") : "rounded",
    borderStyle:
      variant === "outline"
        ? { fg: focused ? accentColor : colors.border.default }
        : { fg: colors.border.subtle },
    px: spacing.px,
    gap: resolveDensityGap(size === "sm" ? "compact" : "comfortable"),
  };
}

// ---------------------------------------------------------------------------
// Toolbar recipe
// ---------------------------------------------------------------------------

export type ToolbarRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled" | "selected";
}>;

export type ToolbarRecipeResult = Readonly<{
  item: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
  gap: number;
}>;

export function toolbarRecipe(
  colors: ColorTokens,
  params: ToolbarRecipeParams = {},
): ToolbarRecipeResult {
  const variant = params.variant ?? "ghost";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);
  const active = state === "active-item" || state === "selected";
  const focused = state === "focus";

  if (state === "disabled") {
    return {
      item: { fg: colors.disabled.fg },
      bg: { bg: colors.disabled.bg },
      border: "none",
      borderStyle: undefined,
      px: spacing.px,
      gap: resolveDensityGap("compact"),
    };
  }

  const item: TextStyle = {
    fg: active || focused ? accentColor : colors.fg.secondary,
    ...(active || focused ? { bold: true } : {}),
    ...(focused ? { underline: true } : {}),
  };

  return {
    item: variant === "solid" ? { ...item, fg: colors.fg.inverse } : item,
    bg:
      variant === "solid"
        ? { bg: active || focused ? accentColor : colors.bg.subtle }
        : variant === "soft"
          ? { bg: active || focused ? colors.bg.subtle : colors.bg.elevated }
          : active || focused
            ? { bg: colors.bg.subtle }
            : {},
    border: variant === "outline" && focused ? "single" : "none",
    borderStyle: variant === "outline" && focused ? { fg: accentColor } : undefined,
    px: spacing.px,
    gap: resolveDensityGap(size === "sm" ? "compact" : "comfortable"),
  };
}

// ---------------------------------------------------------------------------
// Dropdown recipe
// ---------------------------------------------------------------------------

export type DropdownRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled";
}>;

export type DropdownRecipeResult = Readonly<{
  item: TextStyle;
  shortcut: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle;
  px: number;
}>;

export function dropdownRecipe(
  colors: ColorTokens,
  params: DropdownRecipeParams = {},
): DropdownRecipeResult {
  const variant = params.variant ?? "soft";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);

  if (state === "disabled") {
    return {
      item: { fg: colors.disabled.fg },
      shortcut: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      border: "single",
      borderStyle: { fg: colors.disabled.fg },
      px: spacing.px,
    };
  }

  if (state === "active-item") {
    return {
      item: { fg: colors.fg.inverse, bg: accentColor, bold: true },
      shortcut: { fg: colors.fg.inverse, bg: accentColor, dim: true },
      bg: { bg: accentColor },
      border: "single",
      borderStyle: { fg: accentColor },
      px: spacing.px,
    };
  }

  if (state === "focus") {
    return {
      item: { fg: colors.fg.primary, underline: true, bold: true },
      shortcut: { fg: colors.fg.muted },
      bg: { bg: colors.bg.overlay },
      border: "heavy",
      borderStyle: { fg: accentColor, bold: true },
      px: spacing.px,
    };
  }

  const baseBg =
    variant === "solid"
      ? accentColor
      : variant === "ghost"
        ? colors.bg.base
        : variant === "outline"
          ? colors.bg.base
          : colors.bg.overlay;
  return {
    item: {
      fg: variant === "solid" ? colors.fg.inverse : colors.fg.primary,
    },
    shortcut: {
      fg: variant === "solid" ? colors.fg.inverse : colors.fg.muted,
      dim: variant !== "solid",
    },
    bg: { bg: baseBg },
    border: "single",
    borderStyle: {
      fg: variant === "outline" ? colors.border.default : colors.border.strong,
    },
    px: spacing.px,
  };
}

// ---------------------------------------------------------------------------
// Tree recipe
// ---------------------------------------------------------------------------

export type TreeRecipeParams = Readonly<{
  variant?: WidgetVariant;
  tone?: WidgetTone;
  size?: WidgetSize;
  spacing?: ThemeSpacingTokens;
  state?: "default" | "active-item" | "focus" | "disabled" | "selected";
}>;

export type TreeRecipeResult = Readonly<{
  node: TextStyle;
  prefix: TextStyle;
  bg: TextStyle;
  border: BorderVariant;
  borderStyle: TextStyle | undefined;
  px: number;
}>;

export function treeRecipe(colors: ColorTokens, params: TreeRecipeParams = {}): TreeRecipeResult {
  const variant = params.variant ?? "ghost";
  const tone = params.tone ?? "default";
  const size = params.size ?? "md";
  const state = params.state ?? "default";
  const spacing = resolveSize(size, params.spacing);
  const accentColor = resolveToneColor(colors, tone);
  const selected = state === "selected" || state === "active-item";

  if (state === "disabled") {
    return {
      node: { fg: colors.disabled.fg },
      prefix: { fg: colors.disabled.fg, dim: true },
      bg: { bg: colors.disabled.bg },
      border: "none",
      borderStyle: undefined,
      px: spacing.px,
    };
  }

  if (state === "focus") {
    return {
      node: { fg: accentColor, underline: true, bold: true },
      prefix: { fg: accentColor, dim: true },
      bg: { bg: colors.focus.bg },
      border: "none",
      borderStyle: undefined,
      px: spacing.px,
    };
  }

  if (selected) {
    return {
      node: {
        fg: colors.selected.fg,
        bg: colors.selected.bg,
        bold: true,
      },
      prefix: {
        fg: variant === "solid" ? colors.selected.fg : colors.fg.muted,
        ...(variant === "solid" ? { bg: colors.selected.bg } : {}),
      },
      bg: { bg: colors.selected.bg },
      border: "none",
      borderStyle: undefined,
      px: spacing.px,
    };
  }

  return {
    node: {
      fg: variant === "solid" ? colors.fg.inverse : colors.fg.primary,
    },
    prefix: { fg: colors.fg.muted },
    bg:
      variant === "solid"
        ? { bg: accentColor }
        : variant === "soft"
          ? { bg: colors.bg.subtle }
          : {},
    border: "none",
    borderStyle: undefined,
    px: spacing.px,
  };
}

// ---------------------------------------------------------------------------
// Table recipe
// ---------------------------------------------------------------------------

export type TableRecipeParams = Readonly<{
  state?: "header" | "row" | "selectedRow" | "focusedRow" | "stripe";
  size?: WidgetSize;
  tone?: WidgetTone;
  density?: Density;
  spacing?: ThemeSpacingTokens | readonly number[];
}>;

export type TableRecipeResult = Readonly<{
  /** Style for the cell content */
  cell: TextStyle;
  /** Style for the cell background */
  bg: TextStyle;
  /** Horizontal padding used by table rows/cells */
  px: number;
}>;

export function tableRecipe(
  colors: ColorTokens,
  params: TableRecipeParams = {},
): TableRecipeResult {
  const state = params.state ?? "row";
  const size = params.size ?? "md";
  const tone = params.tone ?? "default";
  const density = params.density ?? "comfortable";
  const spacing = resolveSize(size, params.spacing);
  const px = density === "compact" ? Math.max(0, spacing.px - 1) : spacing.px;
  const headerToneFg = tone === "default" ? colors.fg.secondary : resolveToneColor(colors, tone);

  switch (state) {
    case "header":
      return {
        cell: { fg: headerToneFg, bold: true },
        bg: { bg: colors.bg.elevated },
        px,
      };
    case "row":
      return {
        cell: { fg: colors.fg.primary },
        bg: { bg: colors.bg.base },
        px,
      };
    case "stripe":
      return {
        cell: { fg: colors.fg.primary },
        bg: { bg: colors.bg.subtle },
        px,
      };
    case "selectedRow":
      return {
        cell: { fg: colors.selected.fg, bold: true },
        bg: { bg: colors.selected.bg },
        px,
      };
    case "focusedRow":
      return {
        cell: { fg: colors.fg.primary, bold: true },
        bg: { bg: colors.focus.bg },
        px,
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
  /** Style for the badge background */
  bg: TextStyle;
}>;

export function badgeRecipe(
  colors: ColorTokens,
  params: BadgeRecipeParams = {},
): BadgeRecipeResult {
  const tone = params.tone ?? "default";
  const resolvedTone: WidgetTone = tone === "info" ? "primary" : tone;

  let color: Rgb;
  switch (tone) {
    case "danger":
      color = colors.error;
      break;
    case "success":
      color = colors.success;
      break;
    case "warning":
      color = colors.warning;
      break;
    case "info":
      color = colors.info;
      break;
    case "default":
    case "primary":
      color = colors.accent.primary;
      break;
  }

  return {
    text: { fg: resolveToneFg(colors, resolvedTone), bold: true },
    bg: { bg: color },
  };
}

// ---------------------------------------------------------------------------
// Tag recipe
// ---------------------------------------------------------------------------

export type TagRecipeParams = Readonly<{
  tone?: WidgetTone | "info";
}>;

export type TagRecipeResult = Readonly<{
  /** Style for the tag text */
  text: TextStyle;
  /** Style for the tag background */
  bg: TextStyle;
}>;

export function tagRecipe(colors: ColorTokens, params: TagRecipeParams = {}): TagRecipeResult {
  const tone = params.tone ?? "default";
  const resolvedTone: WidgetTone = tone === "info" ? "primary" : tone;

  let bg: Rgb;
  switch (tone) {
    case "danger":
      bg = colors.error;
      break;
    case "success":
      bg = colors.success;
      break;
    case "warning":
      bg = colors.warning;
      break;
    case "info":
      bg = colors.info;
      break;
    case "primary":
      bg = colors.accent.primary;
      break;
    case "default":
      bg = colors.accent.secondary;
      break;
  }

  return {
    text: { fg: resolveToneFg(colors, resolvedTone), bold: true },
    bg: { bg },
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
  tone?: WidgetTone;
  size?: WidgetSize;
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
  const tone = params.tone ?? "default";
  const large = params.size === "lg";
  const selected = checked || state === "selected";
  const selectedColor = resolveToneColor(colors, tone);

  if (state === "disabled") {
    return {
      indicator: { fg: colors.disabled.fg },
      label: { fg: colors.disabled.fg },
    };
  }

  const isFocused = state === "focus";
  return {
    indicator: {
      fg: selected ? selectedColor : colors.fg.secondary,
      bold: isFocused || large,
    },
    label: {
      fg: colors.fg.primary,
      bold: isFocused || large,
    },
  };
}

// ---------------------------------------------------------------------------
// Slider recipe
// ---------------------------------------------------------------------------

export type SliderRecipeParams = Readonly<{
  state?: "default" | "focus" | "disabled" | "readonly";
}>;

export type SliderRecipeResult = Readonly<{
  track: TextStyle;
  filled: TextStyle;
  thumb: TextStyle;
}>;

export function sliderRecipe(
  colors: ColorTokens,
  params: SliderRecipeParams = {},
): SliderRecipeResult {
  const state = params.state ?? "default";

  if (state === "disabled") {
    return {
      track: { fg: colors.disabled.fg },
      filled: { fg: colors.disabled.fg },
      thumb: { fg: colors.disabled.fg },
    };
  }

  if (state === "readonly") {
    return {
      track: { fg: colors.border.subtle, dim: true },
      filled: { fg: colors.accent.primary, dim: true },
      thumb: { fg: colors.accent.primary, dim: true },
    };
  }

  const focused = state === "focus";
  return {
    track: { fg: colors.border.subtle },
    filled: focused ? { fg: colors.accent.primary, bold: true } : { fg: colors.accent.primary },
    thumb: focused ? { fg: colors.accent.primary, bold: true } : { fg: colors.accent.primary },
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
  tabs: tabsRecipe,
  accordion: accordionRecipe,
  breadcrumb: breadcrumbRecipe,
  pagination: paginationRecipe,
  kbd: kbdRecipe,
  sidebar: sidebarRecipe,
  toolbar: toolbarRecipe,
  dropdown: dropdownRecipe,
  tree: treeRecipe,
  table: tableRecipe,
  modal: modalRecipe,
  badge: badgeRecipe,
  tag: tagRecipe,
  text: textRecipe,
  divider: dividerRecipe,
  checkbox: checkboxRecipe,
  slider: sliderRecipe,
  progress: progressRecipe,
  callout: calloutRecipe,
  scrollbar: scrollbarRecipe,
} as const;
