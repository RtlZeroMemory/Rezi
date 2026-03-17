import type {
  ArrayFieldItem,
  ArrayFieldName,
  FormState,
  UseFieldArrayReturn,
  ValidationResult,
} from "../types.js";
import { computeFieldDirty, normalizeBooleanArray, normalizeErrorArray } from "./state.js";

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

type FieldArrayKeysRef<T extends Record<string, unknown>> = {
  current: Partial<Record<keyof T, string[]>>;
};

type CounterRef = { current: number };

export function getArrayFieldValues<T extends Record<string, unknown>, K extends ArrayFieldName<T>>(
  values: T,
  field: K,
): Array<ArrayFieldItem<T, K>> {
  const raw = values[field];
  if (!Array.isArray(raw)) {
    return [];
  }
  return [...(raw as Array<ArrayFieldItem<T, K>>)];
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

function nextFieldArrayKey(field: string, counterRef: CounterRef): string {
  const next = counterRef.current;
  counterRef.current += 1;
  return `${field}_${next}`;
}

function ensureFieldArrayKeys<T extends Record<string, unknown>>(
  field: keyof T,
  length: number,
  fieldArrayKeysRef: FieldArrayKeysRef<T>,
  fieldArrayKeyCounterRef: CounterRef,
): string[] {
  const existing = [...(fieldArrayKeysRef.current[field] ?? [])];

  if (existing.length > length) {
    existing.length = length;
  }
  while (existing.length < length) {
    existing.push(nextFieldArrayKey(String(field), fieldArrayKeyCounterRef));
  }

  fieldArrayKeysRef.current[field] = existing;
  return existing;
}

function appendFieldArrayKey<T extends Record<string, unknown>>(
  field: keyof T,
  fieldArrayKeysRef: FieldArrayKeysRef<T>,
  fieldArrayKeyCounterRef: CounterRef,
): void {
  const existing = [...(fieldArrayKeysRef.current[field] ?? [])];
  existing.push(nextFieldArrayKey(String(field), fieldArrayKeyCounterRef));
  fieldArrayKeysRef.current[field] = existing;
}

function removeFieldArrayKey<T extends Record<string, unknown>>(
  field: keyof T,
  index: number,
  fieldArrayKeysRef: FieldArrayKeysRef<T>,
): void {
  const existing = [...(fieldArrayKeysRef.current[field] ?? [])];
  if (index < 0 || index >= existing.length) {
    return;
  }
  existing.splice(index, 1);
  fieldArrayKeysRef.current[field] = existing;
}

function moveFieldArrayKey<T extends Record<string, unknown>>(
  field: keyof T,
  from: number,
  to: number,
  fieldArrayKeysRef: FieldArrayKeysRef<T>,
): void {
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
}

export function createFieldArrayApi<T extends Record<string, unknown>>(options: {
  state: FormState<T>;
  validateOnChange: boolean | undefined;
  initialValuesRef: { current: T };
  fieldArrayKeysRef: FieldArrayKeysRef<T>;
  fieldArrayKeyCounterRef: CounterRef;
  pendingAsyncValuesRef: { current: T | null };
  asyncValidatorRef: AsyncValidatorRef<T>;
  updateFormState: UpdateFormState<T>;
  isFieldEditableInternal: (
    field: keyof T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled" | "readOnly" | "fieldReadOnly">,
  ) => boolean;
  runSyncValidationFiltered: (
    values: T,
    source?: Pick<FormState<T>, "disabled" | "fieldDisabled">,
  ) => ValidationResult<T>;
}): Readonly<{
  useFieldArray: <K extends ArrayFieldName<T>>(field: K) => UseFieldArrayReturn<T, K>;
}> {
  const useFieldArray = <K extends ArrayFieldName<T>>(field: K): UseFieldArrayReturn<T, K> => {
    const fieldKey = field as keyof T;
    const values = getArrayFieldValues(options.state.values, field);
    const keys = ensureFieldArrayKeys(
      fieldKey,
      values.length,
      options.fieldArrayKeysRef,
      options.fieldArrayKeyCounterRef,
    );

    const append = (item: ArrayFieldItem<T, K>): void => {
      options.pendingAsyncValuesRef.current = null;

      options.updateFormState((prev) => {
        if (prev.isSubmitting || !options.isFieldEditableInternal(fieldKey, prev)) {
          return prev;
        }

        const currentValues = getArrayFieldValues(prev.values, field);
        const nextValuesArray = [...currentValues, item];
        const nextValues = {
          ...prev.values,
          [field]: nextValuesArray as unknown as T[K],
        };
        options.pendingAsyncValuesRef.current = nextValues;

        const nextTouched = [
          ...normalizeBooleanArray(prev.touched[fieldKey], currentValues.length, false),
          false,
        ];
        const previousDirty = normalizeBooleanArray(
          prev.dirty[fieldKey],
          currentValues.length,
          false,
        );
        const initialArray = Array.isArray(options.initialValuesRef.current[fieldKey])
          ? (options.initialValuesRef.current[fieldKey] as ReadonlyArray<unknown>)
          : [];
        const appendedDirty = !Object.is(item as unknown, initialArray[nextValuesArray.length - 1]);
        const nextDirty = [...previousDirty, appendedDirty];

        let nextErrors = prev.errors;
        if (options.validateOnChange) {
          nextErrors = options.runSyncValidationFiltered(nextValues, prev);
        } else {
          const currentErrors = normalizeErrorArray(prev.errors[fieldKey], currentValues.length);
          nextErrors = {
            ...prev.errors,
            [fieldKey]: [...currentErrors, undefined],
          };
        }

        appendFieldArrayKey(fieldKey, options.fieldArrayKeysRef, options.fieldArrayKeyCounterRef);

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

      const asyncValues = options.pendingAsyncValuesRef.current;
      options.pendingAsyncValuesRef.current = null;
      if (options.validateOnChange && options.asyncValidatorRef.current && asyncValues) {
        options.asyncValidatorRef.current.run(asyncValues);
      }
    };

    const remove = (index: number): void => {
      options.pendingAsyncValuesRef.current = null;

      options.updateFormState((prev) => {
        if (prev.isSubmitting || !options.isFieldEditableInternal(fieldKey, prev)) {
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
        options.pendingAsyncValuesRef.current = nextValues;

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
          nextErrors = options.runSyncValidationFiltered(nextValues, prev);
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

        removeFieldArrayKey(fieldKey, index, options.fieldArrayKeysRef);

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

      const asyncValues = options.pendingAsyncValuesRef.current;
      options.pendingAsyncValuesRef.current = null;
      if (options.validateOnChange && options.asyncValidatorRef.current && asyncValues) {
        options.asyncValidatorRef.current.run(asyncValues);
      }
    };

    const move = (from: number, to: number): void => {
      options.pendingAsyncValuesRef.current = null;

      options.updateFormState((prev) => {
        if (prev.isSubmitting || !options.isFieldEditableInternal(fieldKey, prev)) {
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
        options.pendingAsyncValuesRef.current = nextValues;

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
          nextErrors = options.runSyncValidationFiltered(nextValues, prev);
        }

        moveFieldArrayKey(fieldKey, from, to, options.fieldArrayKeysRef);

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

      const asyncValues = options.pendingAsyncValuesRef.current;
      options.pendingAsyncValuesRef.current = null;
      if (options.validateOnChange && options.asyncValidatorRef.current && asyncValues) {
        options.asyncValidatorRef.current.run(asyncValues);
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

  return Object.freeze({
    useFieldArray,
  });
}
