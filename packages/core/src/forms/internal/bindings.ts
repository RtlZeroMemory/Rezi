import type { WidgetContext } from "../../widgets/composition.js";
import { ui } from "../../widgets/ui.js";
import type {
  FieldErrorValue,
  FormState,
  UseFormBindOptions,
  UseFormFieldOptions,
  UseFormInputBinding,
  UseFormOptions,
  UseFormTextFieldName,
  ValidationResult,
} from "../types.js";
import { runFieldValidation } from "../validation.js";
import {
  computeFieldDirty,
  hasTruthyBooleanValue,
  toFieldErrorString,
  toInputValue,
} from "./state.js";

type UpdateFormState<T extends Record<string, unknown>> = (
  nextState: FormState<T> | ((prev: FormState<T>) => FormState<T>),
) => void;

type AsyncValidatorRef<T extends Record<string, unknown>> = {
  current:
    | Readonly<{
        run: (values: T) => void;
        cancel: () => void;
      }>
    | undefined;
};

export function createFieldBindings<T extends Record<string, unknown>, State>(options: {
  ctx: Pick<WidgetContext<State>, "id">;
  state: FormState<T>;
  stateRef: { current: FormState<T> };
  initialValuesRef: { current: T };
  pendingAsyncValuesRef: { current: T | null };
  asyncValidatorRef: AsyncValidatorRef<T>;
  validate: UseFormOptions<T>["validate"];
  validateOnBlur: boolean | undefined;
  validateOnChange: boolean | undefined;
  updateFormState: UpdateFormState<T>;
  isFieldDisabledInternal: (
    field: keyof T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => boolean;
  isFieldReadOnlyInternal: (
    field: keyof T,
    source?: Pick<FormState<T>, "readOnly" | "fieldReadOnly">,
  ) => boolean;
  isFieldEditableInternal: (
    field: keyof T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled" | "readOnly" | "fieldReadOnly">,
  ) => boolean;
  runSyncValidationFiltered: (
    values: T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => ValidationResult<T>;
  canBindFieldAsText: (field: keyof T, values: T) => boolean;
  warnUnsupportedTextBinding: (field: keyof T) => void;
}): Readonly<{
  validateForm: () => ValidationResult<T>;
  validateField: <K extends keyof T>(field: K) => ValidationResult<T>[K] | undefined;
  setFieldValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setFieldError: <K extends keyof T>(field: K, error: FieldErrorValue | undefined) => void;
  setFieldTouched: <K extends keyof T>(field: K, touched: boolean) => void;
  handleChange: <K extends keyof T>(field: K) => (value: T[K]) => void;
  handleBlur: <K extends keyof T>(field: K) => () => void;
  bind: <K extends UseFormTextFieldName<T>>(
    field: K,
    bindOptions?: UseFormBindOptions,
  ) => UseFormInputBinding;
  field: <K extends UseFormTextFieldName<T>>(
    fieldName: K,
    fieldOptions?: UseFormFieldOptions,
  ) => ReturnType<typeof ui.field>;
}> {
  const validateForm = (): ValidationResult<T> => {
    const snapshot = options.stateRef.current;
    const errors = options.runSyncValidationFiltered(snapshot.values, snapshot);
    options.updateFormState((prev) => ({
      ...prev,
      errors,
    }));
    return errors;
  };

  const validateField = <K extends keyof T>(field: K): ValidationResult<T>[K] | undefined => {
    const snapshot = options.stateRef.current;
    if (options.isFieldDisabledInternal(field, snapshot)) {
      options.updateFormState((prev) => ({
        ...prev,
        errors: {
          ...prev.errors,
          [field]: undefined,
        },
      }));
      return undefined;
    }

    const error = runFieldValidation(snapshot.values, field, options.validate);
    options.updateFormState((prev) => ({
      ...prev,
      errors: {
        ...prev.errors,
        [field]: error,
      },
    }));
    return error as ValidationResult<T>[K] | undefined;
  };

  const setFieldValue = <K extends keyof T>(field: K, value: T[K]): void => {
    options.pendingAsyncValuesRef.current = null;

    const newDirty = computeFieldDirty(field, value, options.initialValuesRef.current);

    options.updateFormState((prev) => {
      if (prev.isSubmitting || !options.isFieldEditableInternal(field, prev)) {
        return prev;
      }

      const newValues = { ...prev.values, [field]: value };
      options.pendingAsyncValuesRef.current = newValues;
      let newErrors = prev.errors;

      if (options.validateOnChange) {
        newErrors = options.runSyncValidationFiltered(newValues, prev);
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

    const asyncValues = options.pendingAsyncValuesRef.current;
    options.pendingAsyncValuesRef.current = null;
    if (options.validateOnChange && options.asyncValidatorRef.current && asyncValues) {
      options.asyncValidatorRef.current.run(asyncValues);
    }
  };

  const setFieldError = <K extends keyof T>(field: K, error: FieldErrorValue | undefined): void => {
    options.updateFormState((prev) => ({
      ...prev,
      errors: {
        ...prev.errors,
        [field]: error,
      },
    }));
  };

  const setFieldTouched = <K extends keyof T>(field: K, touched: boolean): void => {
    options.updateFormState((prev) => ({
      ...prev,
      touched: {
        ...prev.touched,
        [field]: touched,
      },
    }));
  };

  const handleChange =
    <K extends keyof T>(field: K) =>
    (value: T[K]): void => {
      setFieldValue(field, value);
    };

  const handleBlur =
    <K extends keyof T>(field: K) =>
    (): void => {
      const snapshot = options.stateRef.current;
      if (options.isFieldDisabledInternal(field, snapshot)) {
        return;
      }

      const shouldValidateOnBlur = options.validateOnBlur ?? true;
      if (!shouldValidateOnBlur) {
        setFieldTouched(field, true);
        return;
      }

      const errors = options.runSyncValidationFiltered(snapshot.values, snapshot);
      options.updateFormState((prev) => ({
        ...prev,
        touched: {
          ...prev.touched,
          [field]: true,
        },
        errors,
      }));

      if (options.asyncValidatorRef.current) {
        options.asyncValidatorRef.current.run(snapshot.values);
      }
    };

  const bind = <K extends UseFormTextFieldName<T>>(
    field: K,
    bindOptions?: UseFormBindOptions,
  ): UseFormInputBinding => {
    const snapshot = options.stateRef.current;
    const disabled = options.isFieldDisabledInternal(field, snapshot);
    const readOnly = !disabled && options.isFieldReadOnlyInternal(field, snapshot);
    const textBindable = options.canBindFieldAsText(field, snapshot.values);
    if (!textBindable) {
      options.warnUnsupportedTextBinding(field);
    }
    return {
      id: bindOptions?.id ?? options.ctx.id(String(field)),
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
    fieldOptions?: UseFormFieldOptions,
  ) => {
    const { key, label, required, hint, error, ...inputOverrides } = fieldOptions ?? {};
    const inputBinding = bind(
      fieldName,
      inputOverrides.id === undefined ? undefined : { id: inputOverrides.id },
    );
    const touched = hasTruthyBooleanValue(options.state.touched[fieldName]);
    const derivedError = touched ? toFieldErrorString(options.state.errors[fieldName]) : undefined;
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

  return Object.freeze({
    validateForm,
    validateField,
    setFieldValue,
    setFieldError,
    setFieldTouched,
    handleChange,
    handleBlur,
    bind,
    field,
  });
}
