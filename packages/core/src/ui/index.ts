/**
 * packages/core/src/ui/index.ts — Design system public exports.
 *
 * Exports capability detection, design tokens, and style recipes.
 *
 * @see docs/design-system.md
 */

// Capability tier detection
export {
  getCapabilityTier,
  resolveCapabilityContext,
  DEFAULT_CAPABILITY_CONTEXT,
  rgbTo256,
  type CapabilityTier,
  type CapabilityContext,
} from "./capabilities.js";

// Extended design tokens
export {
  resolveTypography,
  resolveSurface,
  resolveSize,
  resolveToneColor,
  resolveToneFg,
  resolveDensityGap,
  resolveDensityPadding,
  resolveBorderVariant,
  type TypographyRole,
  type TypographyStyle,
  type ElevationLevel,
  type SurfaceStyle,
  type WidgetSize,
  type SizeSpacing,
  type WidgetVariant,
  type WidgetTone,
  type WidgetState,
  type Density,
  type BorderVariant,
} from "./designTokens.js";

// Style recipes
export {
  recipe,
  buttonRecipe,
  inputRecipe,
  surfaceRecipe,
  selectRecipe,
  tableRecipe,
  modalRecipe,
  badgeRecipe,
  textRecipe,
  dividerRecipe,
  checkboxRecipe,
  progressRecipe,
  calloutRecipe,
  scrollbarRecipe,
  type ButtonRecipeParams,
  type ButtonRecipeResult,
  type InputRecipeParams,
  type InputRecipeResult,
  type SurfaceRecipeParams,
  type SurfaceRecipeResult,
  type SelectRecipeParams,
  type SelectRecipeResult,
  type TableRecipeParams,
  type TableRecipeResult,
  type ModalRecipeParams,
  type ModalRecipeResult,
  type BadgeRecipeParams,
  type BadgeRecipeResult,
  type TextRecipeParams,
  type TextRecipeResult,
  type DividerRecipeResult,
  type CheckboxRecipeParams,
  type CheckboxRecipeResult,
  type ProgressRecipeParams,
  type ProgressRecipeResult,
  type CalloutRecipeParams,
  type CalloutRecipeResult,
  type ScrollbarRecipeResult,
} from "./recipes.js";
