/**
 * packages/core/src/forms/types.ts — Form management type definitions.
 *
 * Why: Defines types for the form system including useForm options and return
 * types, field state tracking, validation configuration, and error handling.
 *
 * @see docs/recipes/form-validation.md (GitHub issue #119)
 */

/**
 * Error value for a single form field.
 * Array fields can carry per-item error messages.
 */
export type FieldErrorValue = string | ReadonlyArray<string | undefined>;

/**
 * Boolean state value for a field.
 * Array fields can carry per-item flags.
 */
export type FieldBooleanValue = boolean | ReadonlyArray<boolean>;

/**
 * Keys in a form values object whose value is an array.
 */
export type ArrayFieldName<T extends Record<string, unknown>> = {
  [K in keyof T]-?: T[K] extends ReadonlyArray<unknown> ? K : never;
}[keyof T];

/**
 * Item type for an array field.
 */
export type ArrayFieldItem<
  T extends Record<string, unknown>,
  K extends ArrayFieldName<T>,
> = T[K] extends ReadonlyArray<infer Item> ? Item : never;

/**
 * Step definition for multi-step form wizard support.
 */
export type FormWizardStep<T extends Record<string, unknown>> = Readonly<{
  /** Unique step identifier. */
  id: string;

  /** Fields validated by this step. Defaults to all fields when omitted. */
  fields?: ReadonlyArray<keyof T>;

  /** Optional step-scoped validation. */
  validate?: (values: T) => ValidationResult<T>;
}>;

/**
 * Wizard configuration.
 */
export type FormWizardOptions<T extends Record<string, unknown>> = Readonly<{
  /** Ordered steps in the wizard. */
  steps: ReadonlyArray<FormWizardStep<T>>;

  /** Initial step index (0-based). Default: 0. */
  initialStep?: number;
}>;

/**
 * Options for configuring the useForm hook.
 */
export type UseFormOptions<T extends Record<string, unknown>> = Readonly<{
  /** Initial values for all form fields. */
  initialValues: T;

  /** Synchronous validation function. Returns errors for invalid fields. */
  validate?: (values: T) => Partial<Record<keyof T, string>>;

  /** Whether to run validation on every value change. Default: false. */
  validateOnChange?: boolean;

  /** Whether to run validation when a field loses focus. Default: true. */
  validateOnBlur?: boolean;

  /** Callback invoked when form is submitted with valid values. */
  onSubmit: (values: T) => void | Promise<void>;

  /** Whether to reset form to initial values after successful submit. Default: false. */
  resetOnSubmit?: boolean;

  /** Asynchronous validation function (e.g., server-side checks). */
  validateAsync?: (values: T) => Promise<ValidationResult<T>>;

  /** Debounce delay in ms for async validation. Default: 300. */
  validateAsyncDebounce?: number;

  /** Form-level disabled flag. Default: false. */
  disabled?: boolean;

  /** Form-level read-only flag. Default: false. */
  readOnly?: boolean;

  /** Field-level disabled overrides (override wins over form-level). */
  fieldDisabled?: Partial<Record<keyof T, boolean>>;

  /** Field-level read-only overrides (override wins over form-level). */
  fieldReadOnly?: Partial<Record<keyof T, boolean>>;

  /** Optional multi-step wizard configuration. */
  wizard?: FormWizardOptions<T>;
}>;

/**
 * Dynamic field array helper return type.
 */
export type UseFieldArrayReturn<
  T extends Record<string, unknown>,
  K extends ArrayFieldName<T>,
> = Readonly<{
  /** Current array items. */
  values: ReadonlyArray<ArrayFieldItem<T, K>>;

  /** Stable keys for each array item. */
  keys: ReadonlyArray<string>;

  /** Append an item to the end of the array. */
  append: (item: ArrayFieldItem<T, K>) => void;

  /** Remove an item by index. */
  remove: (index: number) => void;

  /** Move item from index A to index B. */
  move: (from: number, to: number) => void;
}>;

/**
 * Return type of the useForm hook.
 */
export type UseFormReturn<T extends Record<string, unknown>> = Readonly<{
  /** Current form field values. */
  values: T;

  /** Validation errors keyed by field name. */
  errors: ValidationResult<T>;

  /** Fields that have been focused and then blurred. */
  touched: Partial<Record<keyof T, FieldBooleanValue>>;

  /** Fields that have been modified from initial values. */
  dirty: Partial<Record<keyof T, FieldBooleanValue>>;

  /** True if the form has no validation errors. */
  isValid: boolean;

  /** True if any field has been modified from initial values. */
  isDirty: boolean;

  /** True if form submission is in progress. */
  isSubmitting: boolean;

  /** Number of times handleSubmit has been called. */
  submitCount: number;

  /** Form-level disabled flag. */
  disabled: boolean;

  /** Form-level read-only flag. */
  readOnly: boolean;

  /** Current wizard step index (0-based). */
  currentStep: number;

  /** Number of configured wizard steps. */
  stepCount: number;

  /** True when wizard support is configured. */
  hasWizard: boolean;

  /** True when current wizard step is the first step. */
  isFirstStep: boolean;

  /** True when current wizard step is the last step. */
  isLastStep: boolean;

  /**
   * Returns a change handler for a specific field.
   * Use with input onInput callbacks.
   */
  handleChange: (field: keyof T) => (value: T[keyof T]) => void;

  /**
   * Returns a blur handler for a specific field.
   * Marks field as touched and may trigger validation.
   */
  handleBlur: (field: keyof T) => () => void;

  /**
   * Submits the form if validation passes.
   * Runs both sync and async validation before calling onSubmit.
   */
  handleSubmit: () => void;

  /** Resets form to initial values and clears all state. */
  reset: () => void;

  /** Sets a specific field's value programmatically. */
  setFieldValue: (field: keyof T, value: T[keyof T]) => void;

  /** Sets a specific field's error programmatically. */
  setFieldError: (field: keyof T, error: FieldErrorValue | undefined) => void;

  /** Marks a specific field as touched or untouched. */
  setFieldTouched: (field: keyof T, touched: boolean) => void;

  /** Validates a single field and returns its error (if any). */
  validateField: (field: keyof T) => FieldErrorValue | undefined;

  /** Validates all fields and returns errors object. */
  validateForm: () => ValidationResult<T>;

  /** Set or clear form-level disabled state. */
  setDisabled: (disabled: boolean) => void;

  /** Set or clear form-level read-only state. */
  setReadOnly: (readOnly: boolean) => void;

  /** Set or clear field-level disabled override. */
  setFieldDisabled: (field: keyof T, disabled: boolean | undefined) => void;

  /** Set or clear field-level read-only override. */
  setFieldReadOnly: (field: keyof T, readOnly: boolean | undefined) => void;

  /** Check effective disabled state for a field. */
  isFieldDisabled: (field: keyof T) => boolean;

  /** Check effective read-only state for a field. */
  isFieldReadOnly: (field: keyof T) => boolean;

  /** Dynamic array helpers for an array-valued field. */
  useFieldArray: <K extends ArrayFieldName<T>>(field: K) => UseFieldArrayReturn<T, K>;

  /** Advance to next wizard step when current step is valid. */
  nextStep: () => boolean;

  /** Navigate to previous wizard step without re-validation. */
  previousStep: () => void;

  /** Navigate to a specific wizard step with forward validation gating. */
  goToStep: (stepIndex: number) => boolean;
}>;

/**
 * Internal form state managed by useForm.
 */
export type FormState<T extends Record<string, unknown>> = {
  values: T;
  errors: ValidationResult<T>;
  touched: Partial<Record<keyof T, FieldBooleanValue>>;
  dirty: Partial<Record<keyof T, FieldBooleanValue>>;
  isSubmitting: boolean;
  submitCount: number;
  disabled: boolean;
  readOnly: boolean;
  fieldDisabled: Partial<Record<keyof T, boolean>>;
  fieldReadOnly: Partial<Record<keyof T, boolean>>;
  currentStep: number;
};

/**
 * Validation result from sync or async validators.
 */
export type ValidationResult<T extends Record<string, unknown>> = Partial<
  Record<keyof T, FieldErrorValue>
>;

/**
 * Context passed to validation functions.
 */
export type ValidationContext<T extends Record<string, unknown>> = Readonly<{
  values: T;
  touched: Partial<Record<keyof T, boolean>>;
  dirty: Partial<Record<keyof T, boolean>>;
}>;
