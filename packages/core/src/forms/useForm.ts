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
  UseFormTextFieldName,
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

const NODE_ENV =
  (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ??
  "development";
const DEV_MODE = NODE_ENV !== "production";

function warnDev(message: string): void {
  if (!DEV_MODE) return;
  const c = (globalThis as { console?: { warn?: (msg: string) => void } }).console;
  c?.warn?.(message);
}

function formatErrorForDev(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  try {
    return String(error);
  } catch {
    return "[unstringifiable thrown value]";
  }
}

type FieldOverrides<T extends Record<string, unknown>> = Partial<Record<keyof T, boolean>>;
type TextBindableValue = string | null | undefined;

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

  if (DEV_MODE) {
    const valueKeys = new Set(Object.keys(options.initialValues));
    if (options.fieldDisabled) {
      for (const key of Object.keys(options.fieldDisabled)) {
        if (!valueKeys.has(key)) {
          warnDev(`[rezi] useForm: fieldDisabled key "${key}" does not exist in initialValues`);
        }
      }
    }
    if (options.fieldReadOnly) {
      for (const key of Object.keys(options.fieldReadOnly)) {
        if (!valueKeys.has(key)) {
          warnDev(`[rezi] useForm: fieldReadOnly key "${key}" does not exist in initialValues`);
        }
      }
    }
  }

  return {
    values: cloneInitialValues(options.initialValues),
    errors: {},
    touched: {},
    dirty: {},
    isSubmitting: false,
    submitError: undefined,
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

function isTextBindableValue(value: unknown): value is TextBindableValue {
  return value === null || value === undefined || typeof value === "string";
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

function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
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

function clearValidationFields<T extends Record<string, unknown>>(
  errors: ValidationResult<T>,
  fields: ReadonlyArray<keyof T>,
): ValidationResult<T> {
  if (fields.length === 0) {
    return errors;
  }
  const nextErrors: ValidationResult<T> = { ...errors };
  for (const field of fields) {
    nextErrors[field] = undefined;
  }
  return nextErrors;
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
  const nextTouched: Partial<Record<keyof T, FieldBooleanValue>> = {
    ...prevTouched,
  };
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
  const stateRef = ctx.useRef(state);
  stateRef.current = state;

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
  const nonTextBindingWarningsRef = ctx.useRef<Set<string>>(new Set());

  // Stable key tracking for array fields
  const fieldArrayKeysRef = ctx.useRef<Partial<Record<keyof T, string[]>>>({});
  const fieldArrayKeyCounterRef = ctx.useRef<number>(0);

  const updateFormState = (
    nextState: FormState<T> | ((prev: FormState<T>) => FormState<T>),
  ): void => {
    setState((prev) => {
      const resolved =
        typeof nextState === "function"
          ? (nextState as (prev: FormState<T>) => FormState<T>)(prev)
          : nextState;
      stateRef.current = resolved;
      return resolved;
    });
  };

  const wizardSteps = options.wizard?.steps ?? [];
  const stepCount = wizardSteps.length;
  const hasWizard = stepCount > 0;
  const currentStep = hasWizard ? clampStepIndex(state.currentStep, stepCount) : 0;
  const isFirstStep = !hasWizard || currentStep === 0;
  const isLastStep = !hasWizard || currentStep === stepCount - 1;

  const isFieldDisabledInternal = (
    field: keyof T,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = stateRef.current,
  ): boolean => resolveFieldOverride(field, source.disabled, source.fieldDisabled);

  const isFieldReadOnlyInternal = (
    field: keyof T,
    source: Pick<FormState<T>, "readOnly" | "fieldReadOnly"> = stateRef.current,
  ): boolean => resolveFieldOverride(field, source.readOnly, source.fieldReadOnly);

  const isFieldEditableInternal = (
    field: keyof T,
    source: Pick<
      FormState<T>,
      "disabled" | "fieldDisabled" | "readOnly" | "fieldReadOnly"
    > = stateRef.current,
  ): boolean => !isFieldDisabledInternal(field, source) && !isFieldReadOnlyInternal(field, source);

  const filterDisabledValidationErrors = (
    errors: ValidationResult<T>,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = stateRef.current,
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
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = stateRef.current,
  ): ValidationResult<T> =>
    filterDisabledValidationErrors(runSyncValidation(values, validateRef.current), source);

  const runAsyncValidationFiltered = async (
    values: T,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled"> = stateRef.current,
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

  const getWizardTransitionSteps = (
    fromStep: number,
    toStepExclusive: number,
    values: T,
  ): ReadonlyArray<Readonly<{ stepIndex: number; fields: Array<keyof T> }>> => {
    const steps: Array<Readonly<{ stepIndex: number; fields: Array<keyof T> }>> = [];
    for (let stepIndex = fromStep; stepIndex < toStepExclusive; stepIndex++) {
      steps.push(
        Object.freeze({
          stepIndex,
          fields: getStepFields(getStep(stepIndex), values),
        }),
      );
    }
    return Object.freeze(steps);
  };

  const runWizardStepValidation = (
    values: T,
    stepIndex: number,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled" | "errors"> = stateRef.current,
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
      return mergeValidationErrors(
        syncStepErrors,
        pickValidationFields(filterDisabledValidationErrors(source.errors, source), stepFields),
      );
    }

    const customStepErrors = filterDisabledValidationErrors(
      pickValidationFields(step.validate(values), stepFields),
      source,
    );
    return mergeValidationErrors(
      mergeValidationErrors(syncStepErrors, customStepErrors),
      pickValidationFields(filterDisabledValidationErrors(source.errors, source), stepFields),
    );
  };

  const resolveWizardTransition = (
    values: T,
    transitionSteps: ReadonlyArray<Readonly<{ stepIndex: number; fields: Array<keyof T> }>>,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled" | "errors" | "touched">,
    asyncErrors?: ValidationResult<T>,
  ): Readonly<{
    blockedFields: ReadonlyArray<keyof T>;
    mergedErrors: ValidationResult<T>;
    touched: Partial<Record<keyof T, FieldBooleanValue>>;
  }> | null => {
    let mergedErrors = source.errors as ValidationResult<T>;
    for (const transitionStep of transitionSteps) {
      const baseStepErrors = runWizardStepValidation(values, transitionStep.stepIndex, {
        ...source,
        errors: mergedErrors,
      });
      const stepErrors =
        asyncErrors === undefined
          ? baseStepErrors
          : mergeValidationErrors(
              baseStepErrors,
              pickValidationFields(asyncErrors, transitionStep.fields),
            );
      if (!isValidationClean(stepErrors)) {
        return Object.freeze({
          blockedFields: transitionStep.fields,
          mergedErrors: mergeStepErrors(mergedErrors, transitionStep.fields, stepErrors),
          touched: markFieldsTouched(source.touched, values, transitionStep.fields),
        });
      }
      mergedErrors = clearValidationFields(mergedErrors, transitionStep.fields);
    }
    return null;
  };

  const warnUnsupportedTextBinding = (field: keyof T): void => {
    if (!DEV_MODE) return;
    const fieldKey = String(field);
    if (nonTextBindingWarningsRef.current.has(fieldKey)) return;
    nonTextBindingWarningsRef.current.add(fieldKey);
    warnDev(
      `[rezi] useForm: bind/field only support string-compatible fields; "${fieldKey}" is not safely bindable to ui.input().`,
    );
  };

  const canBindFieldAsText = (field: keyof T, values: T): boolean =>
    isTextBindableValue(values[field]) && isTextBindableValue(initialValuesRef.current[field]);

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
          updateFormState((prev) => ({
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
    const snapshot = stateRef.current;
    const errors = runSyncValidationFiltered(snapshot.values, snapshot);
    updateFormState((prev) => ({
      ...prev,
      errors,
    }));
    return errors;
  };

  /**
   * Validate a single field.
   */
  const validateField = <K extends keyof T>(field: K): ValidationResult<T>[K] | undefined => {
    const snapshot = stateRef.current;
    if (isFieldDisabledInternal(field, snapshot)) {
      updateFormState((prev) => ({
        ...prev,
        errors: {
          ...prev.errors,
          [field]: undefined,
        },
      }));
      return undefined;
    }

    const error = runFieldValidation(snapshot.values, field, options.validate);
    updateFormState((prev) => ({
      ...prev,
      errors: {
        ...prev.errors,
        [field]: error,
      },
    }));
    return error as ValidationResult<T>[K] | undefined;
  };

  /**
   * Set a specific field's value.
   */
  const setFieldValue = <K extends keyof T>(field: K, value: T[K]): void => {
    pendingAsyncValuesRef.current = null;

    const newDirty = computeFieldDirty(field, value, initialValuesRef.current);

    updateFormState((prev) => {
      if (prev.isSubmitting || !isFieldEditableInternal(field, prev)) {
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
        submitError: undefined,
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
  const setFieldError = <K extends keyof T>(field: K, error: FieldErrorValue | undefined): void => {
    updateFormState((prev) => ({
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
  const setFieldTouched = <K extends keyof T>(field: K, touched: boolean): void => {
    updateFormState((prev) => ({
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
    <K extends keyof T>(field: K) =>
    (value: T[K]): void => {
      setFieldValue(field, value);
    };

  /**
   * Handle blur for a specific field.
   */
  const handleBlur =
    <K extends keyof T>(field: K) =>
    (): void => {
      const snapshot = stateRef.current;
      if (isFieldDisabledInternal(field, snapshot)) {
        return;
      }

      // Run validation on blur if enabled (default: true)
      const validateOnBlur = options.validateOnBlur ?? true;
      if (!validateOnBlur) {
        setFieldTouched(field, true);
        return;
      }

      const errors = runSyncValidationFiltered(snapshot.values, snapshot);
      updateFormState((prev) => ({
        ...prev,
        touched: {
          ...prev.touched,
          [field]: true,
        },
        errors,
      }));

      if (asyncValidatorRef.current) {
        asyncValidatorRef.current.run(snapshot.values);
      }
    };

  const bind = <K extends UseFormTextFieldName<T>>(
    field: K,
    options?: UseFormBindOptions,
  ): UseFormInputBinding => {
    const snapshot = stateRef.current;
    const disabled = isFieldDisabledInternal(field, snapshot);
    const readOnly = !disabled && isFieldReadOnlyInternal(field, snapshot);
    const textBindable = canBindFieldAsText(field, snapshot.values);
    if (!textBindable) {
      warnUnsupportedTextBinding(field);
    }

    return {
      id: options?.id ?? ctx.id(String(field)),
      value: toInputValue(snapshot.values[field]),
      disabled,
      readOnly,
      onInput: (value: string) => {
        if (!textBindable) return;
        setFieldValue(field, value as T[K]);
      },
      onBlur: handleBlur(field),
    };
  };

  const field = <K extends UseFormTextFieldName<T>>(
    fieldName: K,
    options?: UseFormFieldOptions,
  ) => {
    const { key, label, required, hint, error, ...inputOverrides } = options ?? {};
    const inputBinding = bind(
      fieldName,
      inputOverrides.id === undefined ? undefined : { id: inputOverrides.id },
    );
    const touched = hasTruthyBooleanValue(state.touched[fieldName]);
    const derivedError = touched ? toFieldErrorString(state.errors[fieldName]) : undefined;
    const resolvedError = error ?? derivedError;

    return ui.field({
      ...(key !== undefined ? { key } : {}),
      label: label ?? String(fieldName),
      ...(required !== undefined ? { required } : {}),
      ...(hint !== undefined ? { hint } : {}),
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
    updateFormState((prev) => {
      const nextState = {
        ...prev,
        disabled,
      };
      return {
        ...nextState,
        errors: filterDisabledValidationErrors(prev.errors, nextState),
      };
    });
  };

  /**
   * Set or clear form-level readOnly state.
   */
  const setReadOnly = (readOnly: boolean): void => {
    updateFormState((prev) => ({
      ...prev,
      readOnly,
    }));
  };

  /**
   * Set or clear field-level disabled override.
   */
  const setFieldDisabled = <K extends keyof T>(field: K, disabled: boolean | undefined): void => {
    updateFormState((prev) => {
      const nextState = {
        ...prev,
        fieldDisabled: setFieldOverride(prev.fieldDisabled, field, disabled),
      };
      return {
        ...nextState,
        errors: filterDisabledValidationErrors(prev.errors, nextState),
      };
    });
  };

  /**
   * Set or clear field-level readOnly override.
   */
  const setFieldReadOnly = <K extends keyof T>(field: K, readOnly: boolean | undefined): void => {
    updateFormState((prev) => ({
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

      updateFormState((prev) => {
        if (prev.isSubmitting || !isFieldEditableInternal(fieldKey, prev)) {
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
          submitError: undefined,
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

      updateFormState((prev) => {
        if (prev.isSubmitting || !isFieldEditableInternal(fieldKey, prev)) {
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
          submitError: undefined,
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

      updateFormState((prev) => {
        if (prev.isSubmitting || !isFieldEditableInternal(fieldKey, prev)) {
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
          submitError: undefined,
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
    const snapshot = stateRef.current;
    const currentStepIndex = clampStepIndex(snapshot.currentStep, stepCount);
    if (currentStepIndex >= stepCount - 1) {
      return true;
    }

    const targetStep = clampStepIndex(currentStepIndex + 1, stepCount);
    const transitionSteps = getWizardTransitionSteps(currentStepIndex, targetStep, snapshot.values);
    const blocked = resolveWizardTransition(snapshot.values, transitionSteps, snapshot);
    if (blocked) {
      updateFormState((prev) => ({
        ...prev,
        touched: blocked.touched,
        errors: blocked.mergedErrors,
      }));
      return false;
    }

    if (!options.validateAsync) {
      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
      }));
      return true;
    }

    void (async () => {
      let asyncErrors: ValidationResult<T>;
      try {
        asyncErrors = await runAsyncValidationFiltered(snapshot.values, snapshot);
      } catch (error) {
        if (
          stateRef.current.values !== snapshot.values ||
          clampStepIndex(stateRef.current.currentStep, stepCount) !== currentStepIndex
        ) {
          return;
        }
        updateFormState((prev) => ({
          ...prev,
          submitError: error,
        }));
        return;
      }

      if (
        stateRef.current.values !== snapshot.values ||
        clampStepIndex(stateRef.current.currentStep, stepCount) !== currentStepIndex
      ) {
        return;
      }

      const asyncBlocked = resolveWizardTransition(
        snapshot.values,
        transitionSteps,
        stateRef.current,
        asyncErrors,
      );
      if (asyncBlocked) {
        updateFormState((prev) => ({
          ...prev,
          touched: asyncBlocked.touched,
          errors: asyncBlocked.mergedErrors,
          submitError: undefined,
        }));
        return;
      }

      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
        submitError: undefined,
      }));
    })();

    return false;
  };

  /**
   * Navigate to previous wizard step without validation.
   */
  const previousStep = (): void => {
    if (!hasWizard) {
      return;
    }
    updateFormState((prev) => ({
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
    const snapshot = stateRef.current;
    const currentStepIndex = clampStepIndex(snapshot.currentStep, stepCount);
    const targetStep = clampStepIndex(stepIndex, stepCount);
    if (targetStep === currentStepIndex) {
      return true;
    }

    if (targetStep < currentStepIndex) {
      updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
      }));
      return true;
    }

    const transitionSteps = getWizardTransitionSteps(currentStepIndex, targetStep, snapshot.values);
    const blocked = resolveWizardTransition(snapshot.values, transitionSteps, snapshot);
    if (blocked) {
      updateFormState((prev) => ({
        ...prev,
        touched: blocked.touched,
        errors: blocked.mergedErrors,
      }));
      return false;
    }

    if (!options.validateAsync) {
      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
      }));
      return true;
    }

    void (async () => {
      let asyncErrors: ValidationResult<T>;
      try {
        asyncErrors = await runAsyncValidationFiltered(snapshot.values, snapshot);
      } catch (error) {
        if (
          stateRef.current.values !== snapshot.values ||
          clampStepIndex(stateRef.current.currentStep, stepCount) !== currentStepIndex
        ) {
          return;
        }
        updateFormState((prev) => ({
          ...prev,
          submitError: error,
        }));
        return;
      }

      if (
        stateRef.current.values !== snapshot.values ||
        clampStepIndex(stateRef.current.currentStep, stepCount) !== currentStepIndex
      ) {
        return;
      }

      const asyncBlocked = resolveWizardTransition(
        snapshot.values,
        transitionSteps,
        stateRef.current,
        asyncErrors,
      );
      if (asyncBlocked) {
        updateFormState((prev) => ({
          ...prev,
          touched: asyncBlocked.touched,
          errors: asyncBlocked.mergedErrors,
          submitError: undefined,
        }));
        return;
      }

      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
        submitError: undefined,
      }));
    })();
    return false;
  };

  /**
   * Reset form to initial state.
   */
  const reset = (): void => {
    submittingRef.current = false;
    asyncValidatorRef.current?.cancel();
    fieldArrayKeysRef.current = {};
    updateFormState(createInitialState(options));
  };

  /**
   * Handle form submission.
   */
  const handleSubmit = (): void => {
    const snapshot = stateRef.current;
    // Don't submit if disabled or already submitting
    if (snapshot.disabled || snapshot.isSubmitting || submittingRef.current) {
      return;
    }

    // In wizard mode, submit action advances steps until the last step.
    const submitStepIndex = hasWizard ? clampStepIndex(snapshot.currentStep, stepCount) : 0;
    const submitIsLastStep = !hasWizard || submitStepIndex === stepCount - 1;
    if (hasWizard && !submitIsLastStep) {
      nextStep();
      return;
    }
    asyncValidatorRef.current?.cancel();

    // Mark all fields as touched
    const allTouched: Partial<Record<keyof T, FieldBooleanValue>> = {};
    const keys = Object.keys(snapshot.values) as (keyof T)[];
    for (const key of keys) {
      const value = snapshot.values[key];
      allTouched[key] = Array.isArray(value) ? value.map(() => true) : true;
    }

    // Run sync validation
    const syncErrors = runSyncValidationFiltered(snapshot.values, snapshot);

    // Update state with touched and sync errors
    updateFormState((prev) => ({
      ...prev,
      touched: allTouched,
      errors: syncErrors,
      submitError: undefined,
      submitCount: prev.submitCount + 1,
    }));

    // If sync validation fails, don't submit
    if (!isValidationClean(syncErrors)) {
      submittingRef.current = false;
      return;
    }
    const submitValues = cloneInitialValues(snapshot.values);

    const failSubmit = (error: unknown): void => {
      if (typeof options.onSubmitError === "function") {
        try {
          options.onSubmitError(error);
        } catch (callbackError) {
          warnDev(
            `[rezi] useForm: onSubmitError callback threw: ${formatErrorForDev(callbackError)}`,
          );
        }
      } else {
        warnDev(`[rezi] useForm: submit failed: ${formatErrorForDev(error)}`);
      }
      updateFormState((prev) => ({
        ...prev,
        isSubmitting: false,
        submitError: error,
      }));
    };

    const finishSuccessfulSubmit = (): void => {
      if (options.resetOnSubmit) {
        reset();
        return;
      }
      updateFormState((prev) => ({
        ...prev,
        isSubmitting: false,
        submitError: undefined,
      }));
    };

    const runSubmitCallback = async (): Promise<void> => {
      let submitResult: void | Promise<void>;
      try {
        submitResult = options.onSubmit(submitValues);
      } catch (error) {
        submittingRef.current = false;
        failSubmit(error);
        return;
      }

      if (!isPromiseLike<void>(submitResult)) {
        submittingRef.current = false;
        finishSuccessfulSubmit();
        return;
      }

      submittingRef.current = true;
      if (!stateRef.current.isSubmitting) {
        updateFormState((prev) => ({
          ...prev,
          isSubmitting: true,
        }));
      }

      try {
        await submitResult;
      } catch (error) {
        submittingRef.current = false;
        failSubmit(error);
        return;
      }

      submittingRef.current = false;
      finishSuccessfulSubmit();
    };

    if (!options.validateAsync) {
      void runSubmitCallback();
      return;
    }

    submittingRef.current = true;
    updateFormState((prev) => ({
      ...prev,
      isSubmitting: true,
    }));

    void (async () => {
      try {
        const asyncErrors = await runAsyncValidationFiltered(submitValues, snapshot);
        const allErrors = mergeValidationErrors(syncErrors, asyncErrors);
        if (!isValidationClean(allErrors)) {
          submittingRef.current = false;
          updateFormState((prev) => ({
            ...prev,
            isSubmitting: false,
            errors: allErrors,
            submitError: undefined,
          }));
          return;
        }
        await runSubmitCallback();
      } catch (error) {
        submittingRef.current = false;
        updateFormState((prev) => ({
          ...prev,
          isSubmitting: false,
          submitError: error,
        }));
      }
    })();
  };

  return Object.freeze({
    values: state.values,
    errors: state.errors,
    touched: state.touched,
    dirty: state.dirty,
    isValid,
    isDirty,
    isSubmitting: state.isSubmitting,
    submitError: state.submitError,
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
    isFieldDisabled: <K extends keyof T>(field: K) =>
      isFieldDisabledInternal(field, stateRef.current),
    isFieldReadOnly: <K extends keyof T>(field: K) =>
      isFieldReadOnlyInternal(field, stateRef.current),
    useFieldArray,
    nextStep,
    previousStep,
    goToStep,
  });
}
