/**
 * packages/core/src/ui/designTokens.ts — Extended design tokens.
 *
 * Why: Provides typography roles, elevation levels, and spacing presets
 * that build on top of the base token system in theme/tokens.ts.
 * These are the "design system layer" that widgets and recipes consume.
 *
 * @see docs/design-system.md
 */

import { type ColorTokens, DEFAULT_THEME_SPACING, type ThemeDefinition } from "../theme/tokens.js";
import type { Rgb, TextStyle } from "../widgets/style.js";

// ---------------------------------------------------------------------------
// Typography roles
// ---------------------------------------------------------------------------

/**
 * Typography role names.
 */
export type TypographyRole = "title" | "subtitle" | "body" | "caption" | "code" | "label" | "muted";

/**
 * Resolved typography style: TextStyle attributes for a given role.
 */
export type TypographyStyle = Readonly<{
  fg: Rgb;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
}>;

/**
 * Resolve a typography role to a TextStyle using theme colors.
 */
export function resolveTypography(colors: ColorTokens, role: TypographyRole): TypographyStyle {
  switch (role) {
    case "title":
      return { fg: colors.fg.primary, bold: true };
    case "subtitle":
      return { fg: colors.fg.secondary, bold: true };
    case "body":
      return { fg: colors.fg.primary };
    case "caption":
      return { fg: colors.fg.secondary, dim: true };
    case "code":
      return { fg: colors.accent.tertiary };
    case "label":
      return { fg: colors.fg.primary, bold: true };
    case "muted":
      return { fg: colors.fg.muted, dim: true };
  }
}

// ---------------------------------------------------------------------------
// Elevation levels
// ---------------------------------------------------------------------------

/**
 * Elevation level for surfaces.
 * 0 = base, 1 = card/panel, 2 = dropdown/overlay, 3 = modal.
 */
export type ElevationLevel = 0 | 1 | 2 | 3;

/**
 * Resolved surface style for a given elevation.
 */
export type SurfaceStyle = Readonly<{
  /** Background color for this surface level */
  bg: Rgb;
  /** Border color (none for level 0) */
  border: Rgb | null;
  /** Whether to render a shadow */
  shadow: boolean;
}>;

/**
 * Resolve a surface style for a given elevation level.
 */
export function resolveSurface(colors: ColorTokens, level: ElevationLevel): SurfaceStyle {
  switch (level) {
    case 0:
      return { bg: colors.bg.base, border: null, shadow: false };
    case 1:
      return { bg: colors.bg.elevated, border: colors.border.subtle, shadow: false };
    case 2:
      return { bg: colors.bg.overlay, border: colors.border.default, shadow: false };
    case 3:
      return { bg: colors.bg.overlay, border: colors.border.strong, shadow: true };
  }
}

// ---------------------------------------------------------------------------
// Widget sizes
// ---------------------------------------------------------------------------

/**
 * Size variant for interactive widgets.
 */
export type WidgetSize = "sm" | "md" | "lg";

/**
 * Resolved spacing for a given widget size.
 */
export type SizeSpacing = Readonly<{
  /** Horizontal padding (cells) */
  px: number;
  /** Vertical padding (cells) */
  py: number;
}>;

type SizeSpacingInput = ThemeDefinition["spacing"] | readonly number[] | undefined;

function resolveSpacingToken(input: unknown, fallback: number): number {
  if (typeof input !== "number" || !Number.isFinite(input) || input < 0) {
    return fallback;
  }
  return Math.trunc(input);
}

function isLegacySpacingInput(spacing: SizeSpacingInput): spacing is readonly number[] {
  return Array.isArray(spacing);
}

/**
 * Resolve spacing for a widget size.
 * If theme spacing tokens are provided, widget spacing derives from that scale.
 */
export function resolveSize(size: WidgetSize, spacing?: SizeSpacingInput): SizeSpacing {
  let semanticSpacing: ThemeDefinition["spacing"] | undefined;
  let legacySpacing: readonly number[] | undefined;
  if (isLegacySpacingInput(spacing)) {
    legacySpacing = spacing;
  } else {
    semanticSpacing = spacing;
  }
  const legacyIsSemanticScale = (legacySpacing?.length ?? 0) >= 7;
  const legacySmIndex = legacyIsSemanticScale ? 2 : 1;
  const legacyMdIndex = legacyIsSemanticScale ? 3 : 2;
  const legacyLgIndex = legacyIsSemanticScale ? 4 : 3;

  const smPx = resolveSpacingToken(
    semanticSpacing?.sm ?? legacySpacing?.[legacySmIndex],
    DEFAULT_THEME_SPACING.sm,
  );
  const mdPx = resolveSpacingToken(
    semanticSpacing?.md ?? legacySpacing?.[legacyMdIndex],
    DEFAULT_THEME_SPACING.md,
  );
  const lgPx = resolveSpacingToken(
    semanticSpacing?.lg ?? legacySpacing?.[legacyLgIndex],
    DEFAULT_THEME_SPACING.lg,
  );

  switch (size) {
    case "sm":
      return { px: smPx, py: 0 };
    case "md":
      return { px: mdPx, py: 0 };
    case "lg":
      return { px: lgPx, py: 1 };
  }
}

// ---------------------------------------------------------------------------
// Visual variants
// ---------------------------------------------------------------------------

/**
 * Visual variant for interactive widgets.
 */
export type WidgetVariant = "solid" | "soft" | "outline" | "ghost";

/**
 * Tone modifier for widget variants.
 */
export type WidgetTone = "default" | "primary" | "danger" | "success" | "warning";

/**
 * Resolve the accent color for a given tone.
 */
export function resolveToneColor(colors: ColorTokens, tone: WidgetTone): Rgb {
  switch (tone) {
    case "default":
    case "primary":
      return colors.accent.primary;
    case "danger":
      return colors.error;
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
  }
}

/**
 * Resolve foreground color for text on a tone-colored background.
 */
export function resolveToneFg(colors: ColorTokens, tone: WidgetTone): Rgb {
  return colors.fg.inverse;
}

// ---------------------------------------------------------------------------
// Widget states
// ---------------------------------------------------------------------------

/**
 * Interactive widget state.
 */
export type WidgetState =
  | "default"
  | "active-item"
  | "focus"
  | "pressed"
  | "disabled"
  | "loading"
  | "error"
  | "selected";

// ---------------------------------------------------------------------------
// Density
// ---------------------------------------------------------------------------

/**
 * Density setting for layout.
 */
export type Density = "compact" | "comfortable";

/**
 * Resolve gap size for a density setting.
 */
export function resolveDensityGap(density: Density): number {
  return density === "compact" ? 0 : 1;
}

/**
 * Resolve padding for a density setting.
 */
export function resolveDensityPadding(density: Density): number {
  return density === "compact" ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Border style helpers
// ---------------------------------------------------------------------------

/**
 * Border variant for surfaces and containers.
 */
export type BorderVariant = "none" | "single" | "rounded" | "double" | "heavy" | "dashed";

/**
 * Resolve border variant for a given elevation and focus state.
 */
export function resolveBorderVariant(elevation: ElevationLevel, focused: boolean): BorderVariant {
  if (focused) return "heavy";
  switch (elevation) {
    case 0:
      return "none";
    case 1:
      return "rounded";
    case 2:
      return "single";
    case 3:
      return "rounded";
  }
}
