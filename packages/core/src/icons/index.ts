/**
 * packages/core/src/icons/index.ts — Icon system exports.
 */

export {
  // Icon definitions
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
} from "./registry.js";

export { resolveIconGlyph, type ResolvedIconGlyph } from "./resolveGlyph.js";
