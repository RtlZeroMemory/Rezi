/**
 * packages/core/src/forms/useForm.ts — Form management hook.
 *
 * Why: Provides a React-like form management hook for Rezi widgets.
 * Manages form values, validation, touched/dirty state, submission,
 * dynamic array fields, wizard navigation, and disabled/read-only behavior.
 *
 * @see docs/recipes/form-validation.md (GitHub issue #119)
 */

import type { WidgetContext } from "../widgets/composition.js";
import { ui } from "../widgets/ui.js";
import type {
  ArrayFieldItem,
  ArrayFieldName,
  FieldBooleanValue,
  FieldErrorValue,
  FormState,
  FormWizardStep,
  UseFieldArrayReturn,
  UseFormBindOptions,
  UseFormFieldOptions,
  UseFormInputBinding,
  UseFormOptions,
  UseFormReturn,
  ValidationResult,
} from "./types.js";
import {
  DEFAULT_ASYNC_DEBOUNCE_MS,
  createDebouncedAsyncValidator,
  isValidationClean,
  mergeValidationErrors,
  runAsyncValidation,
  runFieldValidation,
  runSyncValidation,
} from "./validation.js";

type FieldOverrides<T extends Record<string, unknown>> = Partial<Record<keyof T, boolean>>;

function cloneInitialValues<T extends Record<string, unknown>>(values: T): T {
  return structuredClone(values);
}

/**
 * Clamp step index to available wizard range.
 */
function clampStepIndex(stepIndex: number, stepCount: number): number {
  if (stepCount <= 0) {
    return 0;
  }
  if (stepIndex < 0) {
    return 0;
  }
  if (stepIndex >= stepCount) {
    return stepCount - 1;
  }
  return stepIndex;
}

/**
 * Create initial form state from options.
 */
function createInitialState<T extends Record<string, unknown>>(
  options: UseFormOptions<T>,
): FormState<T> {
  const stepCount = options.wizard?.steps.length ?? 0;
  const initialStep = clampStepIndex(options.wizard?.initialStep ?? 0, stepCount);

  return {
    values: cloneInitialValues(options.initialValues),
    errors: {},
    touched: {},
    dirty: {},
    isSubmitting: false,
    submitCount: 0,
    disabled: options.disabled ?? false,
    readOnly: options.readOnly ?? false,
    fieldDisabled: {
      ...(options.fieldDisabled ?? {}),
    } as Partial<Record<keyof T, boolean>>,
    fieldReadOnly: {
      ...(options.fieldReadOnly ?? {}),
    } as Partial<Record<keyof T, boolean>>,
    currentStep: initialStep,
  };
}

/**
 * Compute dirty array flags by position.
 */
function computeArrayFieldDirty(
  currentValue: ReadonlyArray<unknown>,
  initialValue: ReadonlyArray<unknown>,
): FieldBooleanValue {
  if (currentValue.length !== initialValue.length) {
    return true;
  }

  const dirty: boolean[] = [];
  for (let i = 0; i < currentValue.length; i++) {
    dirty.push(!Object.is(currentValue[i], initialValue[i]));
  }
  return dirty;
}

/**
 * Compute dirty status for a field by comparing current value to initial.
 */
function computeFieldDirty<T extends Record<string, unknown>>(
  field: keyof T,
  currentValue: T[keyof T],
  initialValues: T,
): FieldBooleanValue {
  const initialValue = initialValues[field];
  if (Array.isArray(currentValue) && Array.isArray(initialValue)) {
    return computeArrayFieldDirty(currentValue, initialValue);
  }
  return !Object.is(currentValue, initialValue);
}

/**
 * Check if a field-level dirty/touched flag contains any true value.
 */
function hasTruthyBooleanValue(value: FieldBooleanValue | undefined): boolean {
  if (value === true) {
    return true;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  for (const item of value) {
    if (item === true) {
      return true;
    }
  }
  return false;
}

function toInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function toFieldErrorString(value: FieldErrorValue | undefined): string | undefined {
  if (typeof value === "string") {
    return value.length > 0 ? value : undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  for (const item of value) {
    if (item !== undefined && item.length > 0) {
      return item;
    }
  }
  return undefined;
}

/**
 * Compute overall dirty status from dirty map.
 */
function computeIsDirty<T extends Record<string, unknown>>(
  dirty: Partial<Record<keyof T, FieldBooleanValue>>,
): boolean {
  const keys = Object.keys(dirty) as (keyof T)[];
  for (const key of keys) {
    if (hasTruthyBooleanValue(dirty[key])) {
      return true;
    }
  }
  return false;
}

/**
 * Normalize per-field boolean map value to an array.
 */
function normalizeBooleanArray(
  value: FieldBooleanValue | undefined,
  size: number,
  defaultValue: boolean,
): boolean[] {
  if (Array.isArray(value)) {
    const next = value.slice(0, size);
    while (next.length < size) {
      next.push(defaultValue);
    }
    return next;
  }

  if (value === true || value === false) {
    return Array.from({ length: size }, () => value);
  }

  return Array.from({ length: size }, () => defaultValue);
}

/**
 * Normalize per-field error map value to an array.
 */
function normalizeErrorArray(
  value: FieldErrorValue | undefined,
  size: number,
): Array<string | undefined> {
  if (Array.isArray(value)) {
    const next = value.slice(0, size);
    while (next.length < size) {
      next.push(undefined);
    }
    return next;
  }

  return Array.from({ length: size }, () => undefined);
}

function removeAtIndex<TValue>(value: ReadonlyArray<TValue>, index: number): TValue[] {
  const next = [...value];
  next.splice(index, 1);
  return next;
}

function moveIndex<TValue>(value: ReadonlyArray<TValue>, from: number, to: number): TValue[] {
  const next = [...value];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return next;
  }
  next.splice(to, 0, moved);
  return next;
}

/**
 * Merge per-step errors into global error state.
 */
function mergeStepErrors<T extends Record<string, unknown>>(
  prevErrors: ValidationResult<T>,
  stepFields: ReadonlyArray<keyof T>,
  stepErrors: ValidationResult<T>,
): ValidationResult<T> {
  const nextErrors: ValidationResult<T> = { ...prevErrors };

  for (const field of stepFields) {
    nextErrors[field] = undefined;
  }

  const stepErrorKeys = Object.keys(stepErrors) as (keyof T)[];
  for (const field of stepErrorKeys) {
    nextErrors[field] = stepErrors[field];
  }

  return nextErrors;
}

/**
 * Pick a subset of validation errors by field list.
 */
function pickValidationFields<T extends Record<string, unknown>>(
  errors: ValidationResult<T>,
  fields: ReadonlyArray<keyof T>,
): ValidationResult<T> {
  const selected: ValidationResult<T> = {};
  for (const field of fields) {
    const value = errors[field];
    if (value !== undefined) {
      selected[field] = value;
    }
  }
  return selected;
}

function resolveFieldOverride<T extends Record<string, unknown>>(
  field: keyof T,
  formFlag: boolean,
  fieldOverrides: FieldOverrides<T>,
): boolean {
  const override = fieldOverrides[field];
  if (override === undefined) {
    return formFlag;
  }
  return override;
}

function setFieldOverride<T extends Record<string, unknown>>(
  fieldOverrides: FieldOverrides<T>,
  field: keyof T,
  value: boolean | undefined,
): FieldOverrides<T> {
  const next = { ...fieldOverrides };
  if (value === undefined) {
    delete next[field];
  } else {
    next[field] = value;
  }
  return next;
}

function markFieldsTouched<T extends Record<string, unknown>>(
  prevTouched: Partial<Record<keyof T, FieldBooleanValue>>,
  values: T,
  fields: ReadonlyArray<keyof T>,
): Partial<Record<keyof T, FieldBooleanValue>> {
  const nextTouched: Partial<Record<keyof T, FieldBooleanValue>> = { ...prevTouched };
  for (const field of fields) {
    const value = values[field];
    if (Array.isArray(value)) {
      nextTouched[field] = value.map(() => true);
    } else {
      nextTouched[field] = true;
    }
  }
  return nextTouched;
}

function getArrayFieldValues<T extends Record<string, unknown>, K extends ArrayFieldName<T>>(
  values: T,
  field: K,
): Array<ArrayFieldItem<T, K>> {
  const raw = values[field];
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...(raw as Array<ArrayFieldItem<T, K>>)];
}

function nextFieldArrayKey(field: string, counterRef: { current: number }): string {
  const next = counterRef.current;
  counterRef.current += 1;
  return `${field}_${next}`;
}

/**
 * Form management hook for Rezi widgets.
 */
export function useForm<T extends Record<string, unknown>, State = void>(
  ctx: WidgetContext<State>,
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  // Store form state using widget's useState hook
  const [state, setState] = ctx.useState<FormState<T>>(() => createInitialState(options));

  // Store initial values in a ref for dirty comparison
  const initialValuesRef = ctx.useRef<T>(cloneInitialValues(options.initialValues));

  // Store async validator reference
  const asyncValidatorRef = ctx.useRef<
    ReturnType<typeof createDebouncedAsyncValidator<T>> | undefined
  >(undefined);

  // Ref to safely pass values from setState callback to async validation
  const pendingAsyncValuesRef = ctx.useRef<T | null>(null);
  const submittingRef = ctx.useRef(false);
  const validateRef = ctx.useRef(options.validate);
  validateRef.current = options.validate;

  // Stable key tracking for array fields
  const fieldArrayKeysRef = ctx.useRef<Partial<Record<keyof T, string[]>>>({});
  const fieldArrayKeyCounterRef = ctx.useRef<number>(0);

  const wizardSteps = options.wizard?.steps ?? [];
  const stepCount = wizardSteps.length;
  const hasWizard = stepCount > 0;
  const currentStep = hasWizard ? clampStepIndex(state.currentStep, stepCount) : 0;
  const isFirstStep = !hasWizard || currentStep === 0;
  const isLastStep = !hasWizard || currentStep === stepCount - 1;

  const isFieldDisabledInternal = (
    field: keyof T,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = state,
  ): boolean => resolveFieldOverride(field, source.disabled, source.fieldDisabled);

  const isFieldReadOnlyInternal = (
    field: keyof T,
    source: Pick<FormState<T>, "readOnly" | "fieldReadOnly"> = state,
  ): boolean => resolveFieldOverride(field, source.readOnly, source.fieldReadOnly);

  const isFieldEditableInternal = (
    field: keyof T,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled" | "readOnly" | "fieldReadOnly"> = state,
  ): boolean => !isFieldDisabledInternal(field, source) && !isFieldReadOnlyInternal(field, source);

  const filterDisabledValidationErrors = (
    errors: ValidationResult<T>,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = state,
  ): ValidationResult<T> => {
    const keys = Object.keys(errors) as (keyof T)[];
    if (keys.length === 0) {
      return errors;
    }

    const nextErrors: ValidationResult<T> = { ...errors };
    for (const key of keys) {
      if (isFieldDisabledInternal(key, source)) {
        nextErrors[key] = undefined;
      }
    }
    return nextErrors;
  };

  const runSyncValidationFiltered = (
    values: T,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = state,
  ): ValidationResult<T> =>
    filterDisabledValidationErrors(runSyncValidation(values, validateRef.current), source);

  const runAsyncValidationFiltered = async (
    values: T,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = state,
  ): Promise<ValidationResult<T>> =>
    filterDisabledValidationErrors(await runAsyncValidation(values, options.validateAsync), source);

  const getStep = (stepIndex: number): FormWizardStep<T> | undefined => {
    if (!hasWizard) {
      return undefined;
    }
    const resolvedStep = clampStepIndex(stepIndex, stepCount);
    return wizardSteps[resolvedStep];
  };

  const getStepFields = (step: FormWizardStep<T> | undefined, values: T): Array<keyof T> => {
    if (step?.fields && step.fields.length > 0) {
      return [...step.fields];
    }
    return Object.keys(values) as Array<keyof T>;
  };

  const runWizardStepValidation = (
    values: T,
    stepIndex: number,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = state,
  ): ValidationResult<T> => {
    const step = getStep(stepIndex);
    if (!step) {
      return {};
    }

    const stepFields = getStepFields(step, values);
    const syncStepErrors = pickValidationFields(
      runSyncValidationFiltered(values, source),
      stepFields,
    );

    if (!step.validate) {
      return syncStepErrors;
    }

    const customStepErrors = filterDisabledValidationErrors(
      pickValidationFields(step.validate(values), stepFields),
      source,
    );
    return mergeValidationErrors(syncStepErrors, customStepErrors);
  };

  const ensureFieldArrayKeys = (field: keyof T, length: number): string[] => {
    const existing = [...(fieldArrayKeysRef.current[field] ?? [])];

    if (existing.length > length) {
      existing.length = length;
    }
    while (existing.length < length) {
      existing.push(nextFieldArrayKey(String(field), fieldArrayKeyCounterRef));
    }

    fieldArrayKeysRef.current[field] = existing;
    return existing;
  };

  const appendFieldArrayKey = (field: keyof T): void => {
    const existing = [...(fieldArrayKeysRef.current[field] ?? [])];
    existing.push(nextFieldArrayKey(String(field), fieldArrayKeyCounterRef));
    fieldArrayKeysRef.current[field] = existing;
  };

  const removeFieldArrayKey = (field: keyof T, index: number): void => {
    const existing = [...(fieldArrayKeysRef.current[field] ?? [])];
    if (index < 0 || index >= existing.length) {
      return;
    }
    existing.splice(index, 1);
    fieldArrayKeysRef.current[field] = existing;
  };

  const moveFieldArrayKey = (field: keyof T, from: number, to: number): void => {
    const existing = [...(fieldArrayKeysRef.current[field] ?? [])];
    if (from < 0 || to < 0 || from >= existing.length || to >= existing.length || from === to) {
      return;
    }
    const [moved] = existing.splice(from, 1);
    if (moved === undefined) {
      return;
    }
    existing.splice(to, 0, moved);
    fieldArrayKeysRef.current[field] = existing;
  };

  // Initialize or update async validator when options change
  ctx.useEffect(() => {
    if (options.validateAsync) {
      asyncValidatorRef.current = createDebouncedAsyncValidator(
        options.validateAsync,
        options.validateAsyncDebounce ?? DEFAULT_ASYNC_DEBOUNCE_MS,
        (asyncErrors) => {
          setState((prev) => ({
            ...prev,
            errors: mergeValidationErrors(
              runSyncValidationFiltered(prev.values, prev),
              filterDisabledValidationErrors(asyncErrors, prev),
            ),
          }));
        },
      );

      return () => {
        asyncValidatorRef.current?.cancel();
      };
    }
    return undefined;
  }, [options.validateAsync, options.validateAsyncDebounce]);

  // Compute derived state
  const isValid = isValidationClean(state.errors);
  const isDirty = computeIsDirty(state.dirty);

  /**
   * Validate form and update errors.
   */
  const validateForm = (): ValidationResult<T> => {
    const errors = runSyncValidationFiltered(state.values, state);
    setState((prev) => ({
      ...prev,
      errors,
    }));
    return errors;
  };

  /**
   * Validate a single field.
   */
  const validateField = (field: keyof T): FieldErrorValue | undefined => {
    if (isFieldDisabledInternal(field, state)) {
      setState((prev) => ({
        ...prev,
        errors: {
          ...prev.errors,
          [field]: undefined,
        },
      }));
      return undefined;
    }

    const error = runFieldValidation(state.values, field, options.validate);
    setState((prev) => ({
      ...prev,
      errors: {
        ...prev.errors,
        [field]: error,
      },
    }));
    return error;
  };

  /**
   * Set a specific field's value.
   */
  const setFieldValue = (field: keyof T, value: T[keyof T]): void => {
    pendingAsyncValuesRef.current = null;

    const newDirty = computeFieldDirty(field, value, initialValuesRef.current);

    setState((prev) => {
      if (!isFieldEditableInternal(field, prev)) {
        return prev;
      }

      const newValues = { ...prev.values, [field]: value };
      // Store in ref for async validation (safe handoff from callback)
      pendingAsyncValuesRef.current = newValues;
      let newErrors = prev.errors;

      // Run validation on change if enabled
      if (options.validateOnChange) {
        newErrors = runSyncValidationFiltered(newValues, prev);
      }

      return {
        ...prev,
        values: newValues,
        errors: newErrors,
        dirty: {
          ...prev.dirty,
          [field]: newDirty,
        },
      };
    });

    // Trigger async validation if configured
    const asyncValues = pendingAsyncValuesRef.current;
    pendingAsyncValuesRef.current = null; // Clear to avoid stale data
    if (options.validateOnChange && asyncValidatorRef.current && asyncValues) {
      asyncValidatorRef.current.run(asyncValues);
    }
  };

  /**
   * Set a specific field's error.
   */
  const setFieldError = (field: keyof T, error: FieldErrorValue | undefined): void => {
    setState((prev) => ({
      ...prev,
      errors: {
        ...prev.errors,
        [field]: error,
      },
    }));
  };

  /**
   * Mark a field as touched.
   */
  const setFieldTouched = (field: keyof T, touched: boolean): void => {
    setState((prev) => ({
      ...prev,
      touched: {
        ...prev.touched,
        [field]: touched,
      },
    }));
  };

  /**
   * Handle change for a specific field.
   */
  const handleChange =
    (field: keyof T) =>
    (value: T[keyof T]): void => {
      setFieldValue(field, value);
    };

  /**
   * Handle blur for a specific field.
   */
  const handleBlur = (field: keyof T) => (): void => {
    if (isFieldDisabledInternal(field, state)) {
      return;
    }

    setFieldTouched(field, true);

    // Run validation on blur if enabled (default: true)
    const validateOnBlur = options.validateOnBlur ?? true;
    if (validateOnBlur) {
      const errors = runSyncValidationFiltered(state.values, state);
      setState((prev) => ({
        ...prev,
        touched: {
          ...prev.touched,
          [field]: true,
        },
        errors,
      }));

      // Trigger async validation
      if (asyncValidatorRef.current) {
        asyncValidatorRef.current.run(state.values);
      }
    }
  };

  const bind = <K extends keyof T>(
    field: K,
    options?: UseFormBindOptions,
  ): UseFormInputBinding => ({
    id: options?.id ?? ctx.id(String(field)),
    value: toInputValue(state.values[field]),
    disabled: !isFieldEditableInternal(field, state),
    onInput: (value: string) => {
      setFieldValue(field, value as unknown as T[keyof T]);
    },
    onBlur: handleBlur(field),
  });

  const field = <K extends keyof T>(fieldName: K, options?: UseFormFieldOptions) => {
    const inputOverrides = {
      ...(options?.disabled !== undefined ? { disabled: options.disabled } : {}),
      ...(options?.style !== undefined ? { style: options.style } : {}),
    };
    const inputBinding = bind(
      fieldName,
      options?.id === undefined ? undefined : { id: options.id },
    );
    const touched = hasTruthyBooleanValue(state.touched[fieldName]);
    const derivedError = touched ? toFieldErrorString(state.errors[fieldName]) : undefined;
    const resolvedError = options?.error ?? derivedError;

    return ui.field({
      ...(options?.key !== undefined ? { key: options.key } : {}),
      label: options?.label ?? String(fieldName),
      ...(options?.required !== undefined ? { required: options.required } : {}),
      ...(options?.hint !== undefined ? { hint: options.hint } : {}),
      ...(resolvedError !== undefined ? { error: resolvedError } : {}),
      children: ui.input({
        ...inputBinding,
        ...inputOverrides,
      }),
    });
  };

  /**
   * Set or clear form-level disabled state.
   */
  const setDisabled = (disabled: boolean): void => {
    setState((prev) => ({
      ...prev,
      disabled,
    }));
  };

  /**
   * Set or clear form-level readOnly state.
   */
  const setReadOnly = (readOnly: boolean): void => {
    setState((prev) => ({
      ...prev,
      readOnly,
    }));
  };

  /**
   * Set or clear field-level disabled override.
   */
  const setFieldDisabled = (field: keyof T, disabled: boolean | undefined): void => {
    setState((prev) => ({
      ...prev,
      fieldDisabled: setFieldOverride(prev.fieldDisabled, field, disabled),
    }));
  };

  /**
   * Set or clear field-level readOnly override.
   */
  const setFieldReadOnly = (field: keyof T, readOnly: boolean | undefined): void => {
    setState((prev) => ({
      ...prev,
      fieldReadOnly: setFieldOverride(prev.fieldReadOnly, field, readOnly),
    }));
  };

  /**
   * Dynamic array helper for array-valued fields.
   */
  const useFieldArray = <K extends ArrayFieldName<T>>(field: K): UseFieldArrayReturn<T, K> => {
    const fieldKey = field as keyof T;
    const values = getArrayFieldValues(state.values, field);
    const keys = ensureFieldArrayKeys(fieldKey, values.length);

    const append = (item: ArrayFieldItem<T, K>): void => {
      pendingAsyncValuesRef.current = null;

      setState((prev) => {
        if (!isFieldEditableInternal(fieldKey, prev)) {
          return prev;
        }

        const currentValues = getArrayFieldValues(prev.values, field);
        const nextValuesArray = [...currentValues, item];
        const nextValues = {
          ...prev.values,
          [field]: nextValuesArray as unknown as T[K],
        };
        pendingAsyncValuesRef.current = nextValues;

        const nextTouched = [
          ...normalizeBooleanArray(prev.touched[fieldKey], currentValues.length, false),
          false,
        ];
        const previousDirty = normalizeBooleanArray(
          prev.dirty[fieldKey],
          currentValues.length,
          false,
        );
        const initialArray = Array.isArray(initialValuesRef.current[fieldKey])
          ? (initialValuesRef.current[fieldKey] as ReadonlyArray<unknown>)
          : [];
        const appendedDirty = !Object.is(item as unknown, initialArray[nextValuesArray.length - 1]);
        const nextDirty = [...previousDirty, appendedDirty];

        let nextErrors = prev.errors;
        if (options.validateOnChange) {
          nextErrors = runSyncValidationFiltered(nextValues, prev);
        } else {
          const currentErrors = normalizeErrorArray(prev.errors[fieldKey], currentValues.length);
          nextErrors = {
            ...prev.errors,
            [fieldKey]: [...currentErrors, undefined],
          };
        }

        appendFieldArrayKey(fieldKey);

        return {
          ...prev,
          values: nextValues,
          errors: nextErrors,
          touched: {
            ...prev.touched,
            [fieldKey]: nextTouched,
          },
          dirty: {
            ...prev.dirty,
            [fieldKey]: nextDirty,
          },
        };
      });

      const asyncValues = pendingAsyncValuesRef.current;
      pendingAsyncValuesRef.current = null;
      if (options.validateOnChange && asyncValidatorRef.current && asyncValues) {
        asyncValidatorRef.current.run(asyncValues);
      }
    };

    const remove = (index: number): void => {
      pendingAsyncValuesRef.current = null;

      setState((prev) => {
        if (!isFieldEditableInternal(fieldKey, prev)) {
          return prev;
        }

        const currentValues = getArrayFieldValues(prev.values, field);
        if (index < 0 || index >= currentValues.length) {
          return prev;
        }

        const nextValuesArray = removeAtIndex(currentValues, index);
        const nextValues = {
          ...prev.values,
          [field]: nextValuesArray as unknown as T[K],
        };
        pendingAsyncValuesRef.current = nextValues;

        const nextTouched = removeAtIndex(
          normalizeBooleanArray(prev.touched[fieldKey], currentValues.length, false),
          index,
        );
        const nextDirty = removeAtIndex(
          normalizeBooleanArray(prev.dirty[fieldKey], currentValues.length, false),
          index,
        );

        let nextErrors = prev.errors;
        if (options.validateOnChange) {
          nextErrors = runSyncValidationFiltered(nextValues, prev);
        } else {
          const nextErrorArray = removeAtIndex(
            normalizeErrorArray(prev.errors[fieldKey], currentValues.length),
            index,
          );
          nextErrors = {
            ...prev.errors,
            [fieldKey]: nextErrorArray,
          };
        }

        removeFieldArrayKey(fieldKey, index);

        return {
          ...prev,
          values: nextValues,
          errors: nextErrors,
          touched: {
            ...prev.touched,
            [fieldKey]: nextTouched,
          },
          dirty: {
            ...prev.dirty,
            [fieldKey]: nextDirty,
          },
        };
      });

      const asyncValues = pendingAsyncValuesRef.current;
      pendingAsyncValuesRef.current = null;
      if (options.validateOnChange && asyncValidatorRef.current && asyncValues) {
        asyncValidatorRef.current.run(asyncValues);
      }
    };

    const move = (from: number, to: number): void => {
      pendingAsyncValuesRef.current = null;

      setState((prev) => {
        if (!isFieldEditableInternal(fieldKey, prev)) {
          return prev;
        }

        const currentValues = getArrayFieldValues(prev.values, field);
        if (
          from < 0 ||
          to < 0 ||
          from >= currentValues.length ||
          to >= currentValues.length ||
          from === to
        ) {
          return prev;
        }

        const nextValuesArray = moveIndex(currentValues, from, to);
        const nextValues = {
          ...prev.values,
          [field]: nextValuesArray as unknown as T[K],
        };
        pendingAsyncValuesRef.current = nextValues;

        const nextTouched = moveIndex(
          normalizeBooleanArray(prev.touched[fieldKey], currentValues.length, false),
          from,
          to,
        );
        const nextDirty = moveIndex(
          normalizeBooleanArray(prev.dirty[fieldKey], currentValues.length, false),
          from,
          to,
        );
        const nextErrorArray = moveIndex(
          normalizeErrorArray(prev.errors[fieldKey], currentValues.length),
          from,
          to,
        );

        let nextErrors = {
          ...prev.errors,
          [fieldKey]: nextErrorArray,
        } as ValidationResult<T>;
        if (options.validateOnChange) {
          nextErrors = runSyncValidationFiltered(nextValues, prev);
        }

        moveFieldArrayKey(fieldKey, from, to);

        return {
          ...prev,
          values: nextValues,
          errors: nextErrors,
          touched: {
            ...prev.touched,
            [fieldKey]: nextTouched,
          },
          dirty: {
            ...prev.dirty,
            [fieldKey]: nextDirty,
          },
        };
      });

      const asyncValues = pendingAsyncValuesRef.current;
      pendingAsyncValuesRef.current = null;
      if (options.validateOnChange && asyncValidatorRef.current && asyncValues) {
        asyncValidatorRef.current.run(asyncValues);
      }
    };

    return Object.freeze({
      values,
      keys,
      append,
      remove,
      move,
    });
  };

  /**
   * Advance wizard by one step when current step validates cleanly.
   */
  const nextStep = (): boolean => {
    if (!hasWizard) {
      return true;
    }

    let didAdvance = false;
    setState((prev) => {
      const prevStep = clampStepIndex(prev.currentStep, stepCount);
      if (prevStep >= stepCount - 1) {
        didAdvance = true;
        return prev;
      }

      const step = getStep(prevStep);
      const stepFields = getStepFields(step, prev.values);
      const stepErrors = runWizardStepValidation(prev.values, prevStep, prev);

      if (!isValidationClean(stepErrors)) {
        didAdvance = false;
        return {
          ...prev,
          touched: markFieldsTouched(prev.touched, prev.values, stepFields),
          errors: mergeStepErrors(prev.errors, stepFields, stepErrors),
        };
      }

      didAdvance = true;
      return {
        ...prev,
        currentStep: clampStepIndex(prevStep + 1, stepCount),
      };
    });

    return didAdvance;
  };

  /**
   * Navigate to previous wizard step without validation.
   */
  const previousStep = (): void => {
    if (!hasWizard) {
      return;
    }
    setState((prev) => ({
      ...prev,
      currentStep: clampStepIndex(prev.currentStep - 1, stepCount),
    }));
  };

  /**
   * Navigate to a specific wizard step with validation gates on forward moves.
   */
  const goToStep = (stepIndex: number): boolean => {
    if (!hasWizard) {
      return false;
    }

    const targetStep = clampStepIndex(stepIndex, stepCount);
    if (targetStep === currentStep) {
      return true;
    }

    if (targetStep < currentStep) {
      setState((prev) => ({
        ...prev,
        currentStep: targetStep,
      }));
      return true;
    }

    for (let step = currentStep; step < targetStep; step++) {
      const stepDef = getStep(step);
      const stepFields = getStepFields(stepDef, state.values);
      const stepErrors = runWizardStepValidation(state.values, step, state);
      if (!isValidationClean(stepErrors)) {
        setState((prev) => ({
          ...prev,
          touched: markFieldsTouched(prev.touched, prev.values, stepFields),
          errors: mergeStepErrors(prev.errors, stepFields, stepErrors),
        }));
        return false;
      }
    }

    setState((prev) => ({
      ...prev,
      currentStep: targetStep,
    }));
    return true;
  };

  /**
   * Reset form to initial state.
   */
  const reset = (): void => {
    submittingRef.current = false;
    asyncValidatorRef.current?.cancel();
    fieldArrayKeysRef.current = {};
    setState(createInitialState(options));
  };

  /**
   * Handle form submission.
   */
  const handleSubmit = (): void => {
    // Don't submit if disabled or already submitting
    if (state.disabled || state.isSubmitting || submittingRef.current) {
      return;
    }

    // In wizard mode, submit action advances steps until the last step.
    if (hasWizard && !isLastStep) {
      nextStep();
      return;
    }
    submittingRef.current = true;

    // Mark all fields as touched
    const allTouched: Partial<Record<keyof T, FieldBooleanValue>> = {};
    const keys = Object.keys(state.values) as (keyof T)[];
    for (const key of keys) {
      const value = state.values[key];
      allTouched[key] = Array.isArray(value) ? value.map(() => true) : true;
    }

    // Run sync validation
    const syncErrors = runSyncValidationFiltered(state.values, state);

    // Update state with touched and sync errors
    setState((prev) => ({
      ...prev,
      touched: allTouched,
      errors: syncErrors,
      submitCount: prev.submitCount + 1,
    }));

    // If sync validation fails, don't submit
    if (!isValidationClean(syncErrors)) {
      submittingRef.current = false;
      return;
    }

    // Set submitting state
    setState((prev) => ({
      ...prev,
      isSubmitting: true,
    }));

    // Run async validation and submit
    const submitAsync = async (): Promise<void> => {
      try {
        const asyncErrors = await runAsyncValidationFiltered(state.values, state);

        const allErrors = mergeValidationErrors(syncErrors, asyncErrors);

        if (!isValidationClean(allErrors)) {
          // Async validation failed
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            errors: allErrors,
          }));
          return;
        }

        // Call onSubmit
        await Promise.resolve(options.onSubmit(state.values));

        // Reset if configured
        if (options.resetOnSubmit) {
          reset();
        } else {
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
          }));
        }
      } catch {
        // Submission error - stop submitting
        setState((prev) => ({
          ...prev,
          isSubmitting: false,
        }));
      } finally {
        submittingRef.current = false;
      }
    };

    // Execute async submission
    void submitAsync();
  };

  return Object.freeze({
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    dirty: state.dirty,
    isValid,
    isDirty,
    isSubmitting: state.isSubmitting,
    submitCount: state.submitCount,
    disabled: state.disabled,
    readOnly: state.readOnly,
    currentStep,
    stepCount,
    hasWizard,
    isFirstStep,
    isLastStep,
    handleChange,
    handleBlur,
    bind,
    field,
    handleSubmit,
    reset,
    setFieldValue,
    setFieldError,
    setFieldTouched,
    validateField,
    validateForm,
    setDisabled,
    setReadOnly,
    setFieldDisabled,
    setFieldReadOnly,
    isFieldDisabled: (field: keyof T) => isFieldDisabledInternal(field, state),
    isFieldReadOnly: (field: keyof T) => isFieldReadOnlyInternal(field, state),
    useFieldArray,
    nextStep,
    previousStep,
    goToStep,
  });
}
