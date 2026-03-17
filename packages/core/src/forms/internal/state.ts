import type {
  FieldBooleanValue,
  FieldErrorValue,
  FormState,
  UseFormOptions,
  ValidationResult,
} from "../types.js";
import { runAsyncValidation, runSyncValidation } from "../validation.js";
import { DEV_MODE, warnDev } from "./dev.js";
import { clampStepIndex } from "./wizard.js";

export type FieldOverrides<T extends Record<string, unknown>> = Partial<Record<keyof T, boolean>>;
type TextBindableValue = string | null | undefined;

type UpdateFormState<T extends Record<string, unknown>> = (
  nextState: FormState<T> | ((prev: FormState<T>) => FormState<T>),
) => void;

type AsyncValidatorSource<T extends Record<string, unknown>> = Pick<
  FormState<T>,
  "disabled" | "fieldDisabled"
>;

type EditabilitySource<T extends Record<string, unknown>> = Pick<
  FormState<T>,
  "disabled" | "fieldDisabled" | "readOnly" | "fieldReadOnly"
>;

export function cloneInitialValues<T extends Record<string, unknown>>(values: T): T {
  return structuredClone(values);
}

export function createInitialState<T extends Record<string, unknown>>(
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

export function computeFieldDirty<T extends Record<string, unknown>>(
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

export function hasTruthyBooleanValue(value: FieldBooleanValue | undefined): boolean {
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

export function toInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function isTextBindableValue(value: unknown): value is TextBindableValue {
  return value === null || value === undefined || typeof value === "string";
}

export function toFieldErrorString(value: FieldErrorValue | undefined): string | undefined {
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

export function isPromiseLike<TValue>(value: unknown): value is PromiseLike<TValue> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function computeIsDirty<T extends Record<string, unknown>>(
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

export function normalizeBooleanArray(
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

export function normalizeErrorArray(
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

export function resolveFieldOverride<T extends Record<string, unknown>>(
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

export function setFieldOverride<T extends Record<string, unknown>>(
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

export function createFormStateAccessors<T extends Record<string, unknown>>(options: {
  stateRef: { current: FormState<T> };
  initialValuesRef: { current: T };
  validateRef: { current: UseFormOptions<T>["validate"] };
  validateAsync: UseFormOptions<T>["validateAsync"];
  nonTextBindingWarningsRef: { current: Set<string> };
}): Readonly<{
  isFieldDisabledInternal: (field: keyof T, source?: AsyncValidatorSource<T>) => boolean;
  isFieldReadOnlyInternal: (
    field: keyof T,
    source?: Pick<FormState<T>, "readOnly" | "fieldReadOnly">,
  ) => boolean;
  isFieldEditableInternal: (field: keyof T, source?: EditabilitySource<T>) => boolean;
  filterDisabledValidationErrors: (
    errors: ValidationResult<T>,
    source?: AsyncValidatorSource<T>,
  ) => ValidationResult<T>;
  runSyncValidationFiltered: (values: T, source?: AsyncValidatorSource<T>) => ValidationResult<T>;
  runAsyncValidationFiltered: (
    values: T,
    source?: AsyncValidatorSource<T>,
  ) => Promise<ValidationResult<T>>;
  warnUnsupportedTextBinding: (field: keyof T) => void;
  canBindFieldAsText: (field: keyof T, values: T) => boolean;
}> {
  const isFieldDisabledInternal = (
    field: keyof T,
    source: AsyncValidatorSource<T> = options.stateRef.current,
  ): boolean => resolveFieldOverride(field, source.disabled, source.fieldDisabled);

  const isFieldReadOnlyInternal = (
    field: keyof T,
    source: Pick<FormState<T>, "readOnly" | "fieldReadOnly"> = options.stateRef.current,
  ): boolean => resolveFieldOverride(field, source.readOnly, source.fieldReadOnly);

  const isFieldEditableInternal = (
    field: keyof T,
    source: EditabilitySource<T> = options.stateRef.current,
  ): boolean => !isFieldDisabledInternal(field, source) && !isFieldReadOnlyInternal(field, source);

  const filterDisabledValidationErrors = (
    errors: ValidationResult<T>,
    source: AsyncValidatorSource<T> = options.stateRef.current,
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
    source: AsyncValidatorSource<T> = options.stateRef.current,
  ): ValidationResult<T> =>
    filterDisabledValidationErrors(runSyncValidation(values, options.validateRef.current), source);

  const runAsyncValidationFiltered = async (
    values: T,
    source: AsyncValidatorSource<T> = options.stateRef.current,
  ): Promise<ValidationResult<T>> =>
    filterDisabledValidationErrors(await runAsyncValidation(values, options.validateAsync), source);

  const warnUnsupportedTextBinding = (field: keyof T): void => {
    if (!DEV_MODE) return;
    const fieldKey = String(field);
    if (options.nonTextBindingWarningsRef.current.has(fieldKey)) return;
    options.nonTextBindingWarningsRef.current.add(fieldKey);
    warnDev(
      `[rezi] useForm: bind/field only support string-compatible fields; "${fieldKey}" is not safely bindable to ui.input().`,
    );
  };

  const canBindFieldAsText = (field: keyof T, values: T): boolean =>
    isTextBindableValue(values[field]) &&
    isTextBindableValue(options.initialValuesRef.current[field]);

  return Object.freeze({
    isFieldDisabledInternal,
    isFieldReadOnlyInternal,
    isFieldEditableInternal,
    filterDisabledValidationErrors,
    runSyncValidationFiltered,
    runAsyncValidationFiltered,
    warnUnsupportedTextBinding,
    canBindFieldAsText,
  });
}

export function createFormFlagActions<T extends Record<string, unknown>>(options: {
  updateFormState: UpdateFormState<T>;
  filterDisabledValidationErrors: (
    errors: ValidationResult<T>,
    source?: AsyncValidatorSource<T>,
  ) => ValidationResult<T>;
}): Readonly<{
  setDisabled: (disabled: boolean) => void;
  setReadOnly: (readOnly: boolean) => void;
  setFieldDisabled: <K extends keyof T>(field: K, disabled: boolean | undefined) => void;
  setFieldReadOnly: <K extends keyof T>(field: K, readOnly: boolean | undefined) => void;
}> {
  const setDisabled = (disabled: boolean): void => {
    options.updateFormState((prev) => {
      const nextState = {
        ...prev,
        disabled,
      };
      return {
        ...nextState,
        errors: options.filterDisabledValidationErrors(prev.errors, nextState),
      };
    });
  };

  const setReadOnly = (readOnly: boolean): void => {
    options.updateFormState((prev) => ({
      ...prev,
      readOnly,
    }));
  };

  const setFieldDisabled = <K extends keyof T>(field: K, disabled: boolean | undefined): void => {
    options.updateFormState((prev) => {
      const nextState = {
        ...prev,
        fieldDisabled: setFieldOverride(prev.fieldDisabled, field, disabled),
      };
      return {
        ...nextState,
        errors: options.filterDisabledValidationErrors(prev.errors, nextState),
      };
    });
  };

  const setFieldReadOnly = <K extends keyof T>(field: K, readOnly: boolean | undefined): void => {
    options.updateFormState((prev) => ({
      ...prev,
      fieldReadOnly: setFieldOverride(prev.fieldReadOnly, field, readOnly),
    }));
  };

  return Object.freeze({
    setDisabled,
    setReadOnly,
    setFieldDisabled,
    setFieldReadOnly,
  });
}
