/**
 * packages/core/src/forms/validation.ts — Form validation utilities.
 *
 * Why: Provides validation execution for forms including synchronous validation,
 * asynchronous validation with debouncing, and field-level validation helpers.
 *
 * @see docs/recipes/form-validation.md (GitHub issue #119)
 */

import type { ValidationResult } from "./types.js";

/** Default debounce delay for async validation in milliseconds. */
export const DEFAULT_ASYNC_DEBOUNCE_MS = 300;

/**
 * Execute synchronous validation on form values.
 *
 * @param values - Current form values
 * @param validate - Sync validation function
 * @returns Errors object with field keys and error messages
 */
export function runSyncValidation<T extends Record<string, unknown>>(
  values: T,
  validate: ((values: T) => ValidationResult<T>) | undefined,
): ValidationResult<T> {
  if (!validate) {
    return {};
  }
  return validate(values);
}

/**
 * Execute field-level validation from a form validator.
 *
 * @param values - Current form values
 * @param field - Field to validate
 * @param validate - Full form validation function
 * @returns Error message for the field, or undefined if valid
 */
export function runFieldValidation<T extends Record<string, unknown>>(
  values: T,
  field: keyof T,
  validate: ((values: T) => ValidationResult<T>) | undefined,
): ValidationResult<T>[keyof T] | undefined {
  if (!validate) {
    return undefined;
  }
  const errors = validate(values);
  return errors[field];
}

/**
 * Merge sync and async validation errors.
 * Async errors take precedence over sync errors for the same field.
 *
 * @param syncErrors - Errors from sync validation
 * @param asyncErrors - Errors from async validation
 * @returns Merged errors object
 */
export function mergeValidationErrors<T extends Record<string, unknown>>(
  syncErrors: ValidationResult<T>,
  asyncErrors: ValidationResult<T>,
): ValidationResult<T> {
  return { ...syncErrors, ...asyncErrors };
}

/**
 * Check if validation result has any errors.
 *
 * @param errors - Validation errors object
 * @returns True if there are no errors
 */
export function isValidationClean<T extends Record<string, unknown>>(
  errors: ValidationResult<T>,
): boolean {
  const keys = Object.keys(errors) as (keyof T)[];
  for (const key of keys) {
    const value = errors[key];
    if (value === undefined || value === "") {
      continue;
    }

    if (typeof value === "string") {
      return false;
    }

    for (const item of value) {
      if (item !== undefined && item !== "") {
        return false;
      }
    }
  }
  return true;
}

/**
 * Create a debounced async validation runner.
 * Returns a function that delays validation execution and cancels pending calls.
 *
 * @param validateAsync - Async validation function
 * @param debounceMs - Debounce delay in milliseconds
 * @param onResult - Callback when validation completes
 * @returns Object with run and cancel methods
 */
export function createDebouncedAsyncValidator<T extends Record<string, unknown>>(
  validateAsync: (values: T) => Promise<ValidationResult<T>>,
  debounceMs: number,
  onResult: (errors: ValidationResult<T>) => void,
): Readonly<{
  run: (values: T) => void;
  cancel: () => void;
}> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  // Monotonic token used to ignore stale debounced callbacks and in-flight promises.
  let token = 0;

  return Object.freeze({
    run(values: T): void {
      // Cancel any pending validation
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      cancelled = false;
      token++;
      const myToken = token;

      timeoutId = setTimeout(() => {
        if (cancelled || myToken !== token) return;

        validateAsync(values)
          .then((errors) => {
            if (!cancelled && myToken === token) {
              onResult(errors);
            }
          })
          .catch(() => {
            // Swallow async validation errors - form remains valid
            if (!cancelled && myToken === token) {
              onResult({});
            }
          });
      }, debounceMs);
    },

    cancel(): void {
      cancelled = true;
      token++;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    },
  });
}

/**
 * Run async validation immediately (without debounce).
 * Used during form submission.
 *
 * @param values - Current form values
 * @param validateAsync - Async validation function
 * @returns Promise resolving to errors object
 */
export async function runAsyncValidation<T extends Record<string, unknown>>(
  values: T,
  validateAsync: ((values: T) => Promise<ValidationResult<T>>) | undefined,
): Promise<ValidationResult<T>> {
  if (!validateAsync) {
    return {};
  }

  try {
    return await validateAsync(values);
  } catch {
    // Async validation errors are swallowed - form remains valid
    return {};
  }
}
