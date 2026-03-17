import type {
  FieldBooleanValue,
  FormState,
  FormWizardStep,
  UseFormOptions,
  ValidationResult,
} from "../types.js";
import { isValidationClean, mergeValidationErrors } from "../validation.js";

type UpdateFormState<T extends Record<string, unknown>> = (
  nextState: FormState<T> | ((prev: FormState<T>) => FormState<T>),
) => void;

type WizardSource<T extends Record<string, unknown>> = Pick<
  FormState<T>,
  "disabled" | "fieldDisabled" | "errors"
>;

type WizardTransitionSource<T extends Record<string, unknown>> = Pick<
  FormState<T>,
  "disabled" | "fieldDisabled" | "errors" | "touched"
>;

export type WizardTransitionStep<T extends Record<string, unknown>> = Readonly<{
  stepIndex: number;
  fields: Array<keyof T>;
}>;

export function clampStepIndex(stepIndex: number, stepCount: number): number {
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

function getStep<T extends Record<string, unknown>>(
  wizardSteps: ReadonlyArray<FormWizardStep<T>>,
  stepIndex: number,
): FormWizardStep<T> | undefined {
  if (wizardSteps.length === 0) {
    return undefined;
  }
  const resolvedStep = clampStepIndex(stepIndex, wizardSteps.length);
  return wizardSteps[resolvedStep];
}

export function getStepFields<T extends Record<string, unknown>>(
  step: FormWizardStep<T> | undefined,
  values: T,
): Array<keyof T> {
  if (step?.fields && step.fields.length > 0) {
    return [...step.fields];
  }
  return Object.keys(values) as Array<keyof T>;
}

export function getWizardTransitionSteps<T extends Record<string, unknown>>(
  wizardSteps: ReadonlyArray<FormWizardStep<T>>,
  fromStep: number,
  toStepExclusive: number,
  values: T,
): ReadonlyArray<WizardTransitionStep<T>> {
  const steps: Array<WizardTransitionStep<T>> = [];
  for (let stepIndex = fromStep; stepIndex < toStepExclusive; stepIndex++) {
    steps.push(
      Object.freeze({
        stepIndex,
        fields: getStepFields(getStep(wizardSteps, stepIndex), values),
      }),
    );
  }
  return Object.freeze(steps);
}

export function mergeStepErrors<T extends Record<string, unknown>>(
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

export function pickValidationFields<T extends Record<string, unknown>>(
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

export function clearValidationFields<T extends Record<string, unknown>>(
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

export function markFieldsTouched<T extends Record<string, unknown>>(
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

export function runWizardStepValidation<T extends Record<string, unknown>>(options: {
  values: T;
  stepIndex: number;
  wizardSteps: ReadonlyArray<FormWizardStep<T>>;
  source: WizardSource<T>;
  runSyncValidationFiltered: (
    values: T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => ValidationResult<T>;
  filterDisabledValidationErrors: (
    errors: ValidationResult<T>,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => ValidationResult<T>;
}): ValidationResult<T> {
  const step = getStep(options.wizardSteps, options.stepIndex);
  if (!step) {
    return {};
  }

  const stepFields = getStepFields(step, options.values);
  const syncStepErrors = pickValidationFields(
    options.runSyncValidationFiltered(options.values, options.source),
    stepFields,
  );

  if (!step.validate) {
    return mergeValidationErrors(
      syncStepErrors,
      pickValidationFields(
        options.filterDisabledValidationErrors(options.source.errors, options.source),
        stepFields,
      ),
    );
  }

  const customStepErrors = options.filterDisabledValidationErrors(
    pickValidationFields(step.validate(options.values), stepFields),
    options.source,
  );
  return mergeValidationErrors(
    mergeValidationErrors(syncStepErrors, customStepErrors),
    pickValidationFields(
      options.filterDisabledValidationErrors(options.source.errors, options.source),
      stepFields,
    ),
  );
}

export function resolveWizardTransition<T extends Record<string, unknown>>(options: {
  values: T;
  transitionSteps: ReadonlyArray<WizardTransitionStep<T>>;
  source: WizardTransitionSource<T>;
  asyncErrors?: ValidationResult<T>;
  runWizardStepValidation: (
    values: T,
    stepIndex: number,
    source: WizardSource<T>,
  ) => ValidationResult<T>;
}): Readonly<{
  blockedFields: ReadonlyArray<keyof T>;
  mergedErrors: ValidationResult<T>;
  touched: Partial<Record<keyof T, FieldBooleanValue>>;
}> | null {
  let mergedErrors = options.source.errors as ValidationResult<T>;
  for (const transitionStep of options.transitionSteps) {
    const baseStepErrors = options.runWizardStepValidation(
      options.values,
      transitionStep.stepIndex,
      {
        ...options.source,
        errors: mergedErrors,
      },
    );
    const stepErrors =
      options.asyncErrors === undefined
        ? baseStepErrors
        : mergeValidationErrors(
            baseStepErrors,
            pickValidationFields(options.asyncErrors, transitionStep.fields),
          );
    if (!isValidationClean(stepErrors)) {
      return Object.freeze({
        blockedFields: transitionStep.fields,
        mergedErrors: mergeStepErrors(mergedErrors, transitionStep.fields, stepErrors),
        touched: markFieldsTouched(options.source.touched, options.values, transitionStep.fields),
      });
    }
    mergedErrors = clearValidationFields(mergedErrors, transitionStep.fields);
  }
  return null;
}

export function createWizardActions<T extends Record<string, unknown>>(options: {
  hasWizard: boolean;
  stepCount: number;
  wizardSteps: ReadonlyArray<FormWizardStep<T>>;
  validateAsync: UseFormOptions<T>["validateAsync"];
  stateRef: { current: FormState<T> };
  updateFormState: UpdateFormState<T>;
  runAsyncValidationFiltered: (
    values: T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => Promise<ValidationResult<T>>;
  runWizardStepValidation: (
    values: T,
    stepIndex: number,
    source: WizardSource<T>,
  ) => ValidationResult<T>;
}): Readonly<{
  nextStep: () => boolean;
  previousStep: () => void;
  goToStep: (stepIndex: number) => boolean;
}> {
  const nextStep = (): boolean => {
    if (!options.hasWizard) {
      return true;
    }
    const snapshot = options.stateRef.current;
    const currentStepIndex = clampStepIndex(snapshot.currentStep, options.stepCount);
    if (currentStepIndex >= options.stepCount - 1) {
      return true;
    }

    const targetStep = clampStepIndex(currentStepIndex + 1, options.stepCount);
    const transitionSteps = getWizardTransitionSteps(
      options.wizardSteps,
      currentStepIndex,
      targetStep,
      snapshot.values,
    );
    const blocked = resolveWizardTransition({
      values: snapshot.values,
      transitionSteps,
      source: snapshot,
      runWizardStepValidation: options.runWizardStepValidation,
    });
    if (blocked) {
      options.updateFormState((prev) => ({
        ...prev,
        touched: blocked.touched,
        errors: blocked.mergedErrors,
      }));
      return false;
    }

    if (!options.validateAsync) {
      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      options.updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
      }));
      return true;
    }

    void (async () => {
      let asyncErrors: ValidationResult<T>;
      try {
        asyncErrors = await options.runAsyncValidationFiltered(snapshot.values, snapshot);
      } catch (error) {
        if (
          options.stateRef.current.values !== snapshot.values ||
          clampStepIndex(options.stateRef.current.currentStep, options.stepCount) !==
            currentStepIndex
        ) {
          return;
        }
        options.updateFormState((prev) => ({
          ...prev,
          submitError: error,
        }));
        return;
      }

      if (
        options.stateRef.current.values !== snapshot.values ||
        clampStepIndex(options.stateRef.current.currentStep, options.stepCount) !== currentStepIndex
      ) {
        return;
      }

      const asyncBlocked = resolveWizardTransition({
        values: snapshot.values,
        transitionSteps,
        source: options.stateRef.current,
        asyncErrors,
        runWizardStepValidation: options.runWizardStepValidation,
      });
      if (asyncBlocked) {
        options.updateFormState((prev) => ({
          ...prev,
          touched: asyncBlocked.touched,
          errors: asyncBlocked.mergedErrors,
          submitError: undefined,
        }));
        return;
      }

      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      options.updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
        submitError: undefined,
      }));
    })();

    return false;
  };

  const previousStep = (): void => {
    if (!options.hasWizard) {
      return;
    }
    options.updateFormState((prev) => ({
      ...prev,
      currentStep: clampStepIndex(prev.currentStep - 1, options.stepCount),
    }));
  };

  const goToStep = (stepIndex: number): boolean => {
    if (!options.hasWizard) {
      return false;
    }
    const snapshot = options.stateRef.current;
    const currentStepIndex = clampStepIndex(snapshot.currentStep, options.stepCount);
    const targetStep = clampStepIndex(stepIndex, options.stepCount);
    if (targetStep === currentStepIndex) {
      return true;
    }

    if (targetStep < currentStepIndex) {
      options.updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
      }));
      return true;
    }

    const transitionSteps = getWizardTransitionSteps(
      options.wizardSteps,
      currentStepIndex,
      targetStep,
      snapshot.values,
    );
    const blocked = resolveWizardTransition({
      values: snapshot.values,
      transitionSteps,
      source: snapshot,
      runWizardStepValidation: options.runWizardStepValidation,
    });
    if (blocked) {
      options.updateFormState((prev) => ({
        ...prev,
        touched: blocked.touched,
        errors: blocked.mergedErrors,
      }));
      return false;
    }

    if (!options.validateAsync) {
      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      options.updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
      }));
      return true;
    }

    void (async () => {
      let asyncErrors: ValidationResult<T>;
      try {
        asyncErrors = await options.runAsyncValidationFiltered(snapshot.values, snapshot);
      } catch (error) {
        if (
          options.stateRef.current.values !== snapshot.values ||
          clampStepIndex(options.stateRef.current.currentStep, options.stepCount) !==
            currentStepIndex
        ) {
          return;
        }
        options.updateFormState((prev) => ({
          ...prev,
          submitError: error,
        }));
        return;
      }

      if (
        options.stateRef.current.values !== snapshot.values ||
        clampStepIndex(options.stateRef.current.currentStep, options.stepCount) !== currentStepIndex
      ) {
        return;
      }

      const asyncBlocked = resolveWizardTransition({
        values: snapshot.values,
        transitionSteps,
        source: options.stateRef.current,
        asyncErrors,
        runWizardStepValidation: options.runWizardStepValidation,
      });
      if (asyncBlocked) {
        options.updateFormState((prev) => ({
          ...prev,
          touched: asyncBlocked.touched,
          errors: asyncBlocked.mergedErrors,
          submitError: undefined,
        }));
        return;
      }

      const traversedFields = transitionSteps.flatMap((step) => step.fields);
      options.updateFormState((prev) => ({
        ...prev,
        currentStep: targetStep,
        errors: clearValidationFields(prev.errors, traversedFields),
        submitError: undefined,
      }));
    })();
    return false;
  };

  return Object.freeze({
    nextStep,
    previousStep,
    goToStep,
  });
}
