/**
 * packages/core/src/layout/validateProps.ts — Widget props validation.
 *
 * Why: Validates widget props before layout, ensuring all values are within
 * expected ranges and types. Returns structured fatal errors for invalid props
 * rather than throwing, enabling deterministic error reporting.
 *
 * Validation rules:
 *   - Numeric props must be int32 >= 0 (pad, gap, size)
 *   - Padding props accept int32 >= 0 OR spacing keys ("sm", "md", etc.)
 *   - Margin props accept signed int32 OR spacing keys ("sm", "md", etc.)
 *   - String props must be non-empty where required (id)
 *   - Enum props must be valid values (align, border)
 *   - Boolean props default to false if undefined
 *
 * @see docs/guide/layout.md
 */

export type { InvalidPropsFatal, LayoutResult } from "./validate/shared.js";
export type { ValidatedLayoutConstraints } from "./validate/layoutConstraints.js";
export type { ValidatedSpacingProps } from "./validate/spacing.js";
export type {
  ValidatedBoxProps,
  ValidatedButtonProps,
  ValidatedCheckboxProps,
  ValidatedInputProps,
  ValidatedRadioGroupProps,
  ValidatedSelectOption,
  ValidatedSelectProps,
  ValidatedSliderProps,
  ValidatedSpacerProps,
  ValidatedStackProps,
  ValidatedTextProps,
} from "./validate/interactive.js";

export {
  validateBoxProps,
  validateButtonProps,
  validateCheckboxProps,
  validateInputProps,
  validateRadioGroupProps,
  validateSelectProps,
  validateSliderProps,
  validateSpacerProps,
  validateStackProps,
  validateTextProps,
} from "./validate/interactive.js";
