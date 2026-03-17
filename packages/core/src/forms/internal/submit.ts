import type { FieldBooleanValue, FormState, UseFormOptions, ValidationResult } from "../types.js";
import { isValidationClean, mergeValidationErrors } from "../validation.js";
import { formatErrorForDev, warnDev } from "./dev.js";
import { cloneInitialValues, createInitialState, isPromiseLike } from "./state.js";
import { clampStepIndex } from "./wizard.js";

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

function markAllFieldsTouched<T extends Record<string, unknown>>(
  values: T,
): Partial<Record<keyof T, FieldBooleanValue>> {
  const allTouched: Partial<Record<keyof T, FieldBooleanValue>> = {};
  const keys = Object.keys(values) as (keyof T)[];
  for (const key of keys) {
    const value = values[key];
    allTouched[key] = Array.isArray(value) ? value.map(() => true) : true;
  }
  return allTouched;
}

export function createResetAction<T extends Record<string, unknown>>(options: {
  formOptions: UseFormOptions<T>;
  asyncValidatorRef: AsyncValidatorRef<T>;
  submittingRef: { current: boolean };
  fieldArrayKeysRef: { current: Partial<Record<keyof T, string[]>> };
  updateFormState: UpdateFormState<T>;
}): () => void {
  return (): void => {
    options.submittingRef.current = false;
    options.asyncValidatorRef.current?.cancel();
    options.fieldArrayKeysRef.current = {};
    options.updateFormState(createInitialState(options.formOptions));
  };
}

export function createSubmitAction<T extends Record<string, unknown>>(options: {
  formOptions: UseFormOptions<T>;
  hasWizard: boolean;
  stepCount: number;
  stateRef: { current: FormState<T> };
  submittingRef: { current: boolean };
  asyncValidatorRef: AsyncValidatorRef<T>;
  updateFormState: UpdateFormState<T>;
  runSyncValidationFiltered: (
    values: T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => ValidationResult<T>;
  runAsyncValidationFiltered: (
    values: T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => Promise<ValidationResult<T>>;
  nextStep: () => boolean;
  reset: () => void;
}): () => void {
  return (): void => {
    const snapshot = options.stateRef.current;
    if (snapshot.disabled || snapshot.isSubmitting || options.submittingRef.current) {
      return;
    }

    const submitStepIndex = options.hasWizard
      ? clampStepIndex(snapshot.currentStep, options.stepCount)
      : 0;
    const submitIsLastStep = !options.hasWizard || submitStepIndex === options.stepCount - 1;
    if (options.hasWizard && !submitIsLastStep) {
      options.nextStep();
      return;
    }
    options.asyncValidatorRef.current?.cancel();

    const allTouched = markAllFieldsTouched(snapshot.values);
    const syncErrors = options.runSyncValidationFiltered(snapshot.values, snapshot);

    options.updateFormState((prev) => ({
      ...prev,
      touched: allTouched,
      errors: syncErrors,
      submitError: undefined,
      submitCount: prev.submitCount + 1,
    }));

    if (!isValidationClean(syncErrors)) {
      options.submittingRef.current = false;
      return;
    }
    const submitValues = cloneInitialValues(snapshot.values);
    const failSubmit = (error: unknown): void => {
      if (typeof options.formOptions.onSubmitError === "function") {
        try {
          options.formOptions.onSubmitError(error);
        } catch (callbackError) {
          warnDev(
            `[rezi] useForm: onSubmitError callback threw: ${formatErrorForDev(callbackError)}`,
          );
        }
      } else {
        warnDev(`[rezi] useForm: submit failed: ${formatErrorForDev(error)}`);
      }
      options.updateFormState((prev) => ({
        ...prev,
        isSubmitting: false,
        submitError: error,
      }));
    };

    const finishSuccessfulSubmit = (): void => {
      if (options.formOptions.resetOnSubmit) {
        options.reset();
        return;
      }
      options.updateFormState((prev) => ({
        ...prev,
        isSubmitting: false,
        submitError: undefined,
      }));
    };

    const runSubmitCallback = async (): Promise<void> => {
      let submitResult: void | Promise<void>;
      try {
        submitResult = options.formOptions.onSubmit(submitValues);
      } catch (error) {
        options.submittingRef.current = false;
        failSubmit(error);
        return;
      }

      if (!isPromiseLike<void>(submitResult)) {
        options.submittingRef.current = false;
        finishSuccessfulSubmit();
        return;
      }

      options.submittingRef.current = true;
      if (!options.stateRef.current.isSubmitting) {
        options.updateFormState((prev) => ({
          ...prev,
          isSubmitting: true,
        }));
      }

      try {
        await submitResult;
      } catch (error) {
        options.submittingRef.current = false;
        failSubmit(error);
        return;
      }

      options.submittingRef.current = false;
      finishSuccessfulSubmit();
    };

    if (!options.formOptions.validateAsync) {
      void runSubmitCallback();
      return;
    }

    options.submittingRef.current = true;
    options.updateFormState((prev) => ({
      ...prev,
      isSubmitting: true,
    }));

    void (async () => {
      try {
        const asyncErrors = await options.runAsyncValidationFiltered(submitValues, snapshot);
        const allErrors = mergeValidationErrors(syncErrors, asyncErrors);
        if (!isValidationClean(allErrors)) {
          options.submittingRef.current = false;
          options.updateFormState((prev) => ({
            ...prev,
            isSubmitting: false,
            errors: allErrors,
            submitError: undefined,
          }));
          return;
        }
        await runSubmitCallback();
      } catch (error) {
        options.submittingRef.current = false;
        options.updateFormState((prev) => ({
          ...prev,
          isSubmitting: false,
          submitError: error,
        }));
      }
    })();
  };
}
