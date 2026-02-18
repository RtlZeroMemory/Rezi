/**
 * packages/core/src/forms/index.ts — Form system exports.
 *
 * @see docs/recipes/form-validation.md (GitHub issue #119)
 */

export type {
  ArrayFieldItem,
  ArrayFieldName,
  FieldBooleanValue,
  FieldErrorValue,
  FormState,
  FormWizardOptions,
  FormWizardStep,
  UseFieldArrayReturn,
  UseFormOptions,
  UseFormReturn,
  ValidationContext,
  ValidationResult,
} from "./types.js";

export { useForm } from "./useForm.js";

export {
  createDebouncedAsyncValidator,
  DEFAULT_ASYNC_DEBOUNCE_MS,
  isValidationClean,
  mergeValidationErrors,
  runAsyncValidation,
  runFieldValidation,
  runSyncValidation,
} from "./validation.js";

export { bind, bindChecked, bindSelect, bindTransform } from "./bind.js";
