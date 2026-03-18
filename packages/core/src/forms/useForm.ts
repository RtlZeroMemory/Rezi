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
import { createFieldArrayApi } from "./internal/arrayState.js";
import { createFieldBindings } from "./internal/bindings.js";
import {
  cloneInitialValues,
  computeIsDirty,
  createFormFlagActions,
  createFormStateAccessors,
  createInitialState,
} from "./internal/state.js";
import { createResetAction, createSubmitAction } from "./internal/submit.js";
import { clampStepIndex, createWizardActions, runWizardStepValidation } from "./internal/wizard.js";
import type { FormState, UseFormOptions, UseFormReturn, ValidationResult } from "./types.js";
import {
  DEFAULT_ASYNC_DEBOUNCE_MS,
  createDebouncedAsyncValidator,
  isValidationClean,
  mergeValidationErrors,
} from "./validation.js";

/**
 * Form management hook for Rezi widgets.
 */
export function useForm<T extends Record<string, unknown>, State = void>(
  ctx: WidgetContext<State>,
  options: UseFormOptions<T>,
): UseFormReturn<T> {
  const [state, setState] = ctx.useState<FormState<T>>(() => createInitialState(options));
  const stateRef = ctx.useRef(state);
  stateRef.current = state;

  const initialValuesRef = ctx.useRef<T>(cloneInitialValues(options.initialValues));

  const asyncValidatorRef = ctx.useRef<
    ReturnType<typeof createDebouncedAsyncValidator<T>> | undefined
  >(undefined);

  const pendingAsyncValuesRef = ctx.useRef<T | null>(null);
  const submittingRef = ctx.useRef(false);
  const submitAttemptRef = ctx.useRef(0);
  const validateRef = ctx.useRef(options.validate);
  validateRef.current = options.validate;
  const nonTextBindingWarningsRef = ctx.useRef<Set<string>>(new Set());

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

  const {
    isFieldDisabledInternal,
    isFieldReadOnlyInternal,
    isFieldEditableInternal,
    filterDisabledValidationErrors,
    runSyncValidationFiltered,
    runAsyncValidationFiltered,
    warnUnsupportedTextBinding,
    canBindFieldAsText,
  } = createFormStateAccessors({
    stateRef,
    initialValuesRef,
    validateRef,
    validateAsync: options.validateAsync,
    nonTextBindingWarningsRef,
  });

  const runWizardStepValidationForState = (
    values: T,
    stepIndex: number,
    source: Pick<FormState<T>, "disabled" | "fieldDisabled" | "errors"> = stateRef.current,
  ): ValidationResult<T> =>
    runWizardStepValidation({
      values,
      stepIndex,
      wizardSteps,
      source,
      runSyncValidationFiltered,
      filterDisabledValidationErrors,
    });

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

  const isValid = isValidationClean(state.errors);
  const isDirty = computeIsDirty(state.dirty);

  const {
    validateForm,
    validateField,
    setFieldValue,
    setFieldError,
    setFieldTouched,
    handleChange,
    handleBlur,
    bind,
    field,
  } = createFieldBindings({
    ctx,
    state,
    stateRef,
    initialValuesRef,
    pendingAsyncValuesRef,
    asyncValidatorRef,
    validate: options.validate,
    validateOnBlur: options.validateOnBlur,
    validateOnChange: options.validateOnChange,
    updateFormState,
    isFieldDisabledInternal,
    isFieldReadOnlyInternal,
    isFieldEditableInternal,
    runSyncValidationFiltered,
    canBindFieldAsText,
    warnUnsupportedTextBinding,
  });

  const { setDisabled, setReadOnly, setFieldDisabled, setFieldReadOnly } = createFormFlagActions({
    updateFormState,
    filterDisabledValidationErrors,
  });

  const { useFieldArray } = createFieldArrayApi({
    state,
    validateOnChange: options.validateOnChange,
    initialValuesRef,
    fieldArrayKeysRef,
    fieldArrayKeyCounterRef,
    pendingAsyncValuesRef,
    asyncValidatorRef,
    updateFormState,
    isFieldEditableInternal,
    runSyncValidationFiltered,
  });

  const { nextStep, previousStep, goToStep } = createWizardActions({
    hasWizard,
    stepCount,
    wizardSteps,
    validateAsync: options.validateAsync,
    stateRef,
    updateFormState,
    runAsyncValidationFiltered,
    runWizardStepValidation: runWizardStepValidationForState,
  });

  const reset = createResetAction({
    formOptions: options,
    asyncValidatorRef,
    attemptRef: submitAttemptRef,
    submittingRef,
    fieldArrayKeysRef,
    updateFormState,
  });

  const handleSubmit = createSubmitAction({
    formOptions: options,
    hasWizard,
    stepCount,
    stateRef,
    submittingRef,
    asyncValidatorRef,
    attemptRef: submitAttemptRef,
    updateFormState,
    runSyncValidationFiltered,
    runAsyncValidationFiltered,
    nextStep,
    reset,
  });

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
    isFieldDisabled: <K extends keyof T>(fieldName: K) =>
      isFieldDisabledInternal(fieldName, stateRef.current),
    isFieldReadOnly: <K extends keyof T>(fieldName: K) =>
      isFieldReadOnlyInternal(fieldName, stateRef.current),
    useFieldArray,
    nextStep,
    previousStep,
    goToStep,
  });
}
