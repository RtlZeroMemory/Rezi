/**
 * packages/core/src/forms/bind.ts — Simple binding helpers.
 */

import type { StateUpdater } from "../app/updateQueue.js";
import type { CheckboxProps, InputProps, SelectProps } from "../widgets/types.js";

type Updater<S> = (update: StateUpdater<S>) => void;

function parseFieldPath(field: string): readonly string[] {
  const segments = field.split(".").filter((segment) => segment.length > 0);
  return Object.freeze(segments);
}

function getFieldValue<S extends Record<string, unknown>>(
  state: S,
  field: keyof S | string,
): unknown {
  if (typeof field !== "string") {
    return state[field];
  }

  const path = parseFieldPath(field);
  if (path.length === 0) {
    return undefined;
  }

  let current: unknown = state;
  for (const segment of path) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function setField<S extends Record<string, unknown>>(
  prev: Readonly<S>,
  field: keyof S | string,
  value: unknown,
): S {
  if (typeof field !== "string") {
    return { ...(prev as S), [field]: value } as S;
  }

  const path = parseFieldPath(field);
  if (path.length === 0) {
    return prev as S;
  }

  const root = { ...(prev as Record<string, unknown>) };
  let target: Record<string, unknown> = root;
  let source: unknown = prev;

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (segment === undefined) continue;

    const sourceChild =
      source !== null && typeof source === "object"
        ? (source as Record<string, unknown>)[segment]
        : undefined;

    const nextTarget =
      sourceChild !== null && typeof sourceChild === "object" && !Array.isArray(sourceChild)
        ? { ...(sourceChild as Record<string, unknown>) }
        : {};

    target[segment] = nextTarget;
    target = nextTarget;
    source = sourceChild;
  }

  const leaf = path[path.length - 1];
  if (leaf !== undefined) {
    target[leaf] = value;
  }

  return root as S;
}

function toInputValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function bind<S extends Record<string, unknown>, K extends keyof S>(
  state: S,
  field: K | string,
  update: Updater<S>,
): Pick<InputProps, "value" | "onInput"> {
  return {
    value: toInputValue(getFieldValue(state, field)),
    onInput: (value: string) => {
      update((prev) => setField(prev, field, value));
    },
  };
}

export function bindTransform<S extends Record<string, unknown>, K extends keyof S>(
  state: S,
  field: K | string,
  update: Updater<S>,
  transform: {
    get: (value: unknown) => string;
    set: (value: string) => unknown;
  },
): Pick<InputProps, "value" | "onInput"> {
  const currentValue = getFieldValue(state, field);
  return {
    value: transform.get(currentValue),
    onInput: (value: string) => {
      const next = transform.set(value);
      update((prev) => setField(prev, field, next));
    },
  };
}

export function bindChecked<S extends Record<string, unknown>, K extends keyof S>(
  state: S,
  field: K | string,
  update: Updater<S>,
): Pick<CheckboxProps, "checked" | "onChange"> {
  return {
    checked: Boolean(getFieldValue(state, field)),
    onChange: (checked: boolean) => {
      update((prev) => setField(prev, field, checked));
    },
  };
}

export function bindSelect<S extends Record<string, unknown>, K extends keyof S>(
  state: S,
  field: K | string,
  update: Updater<S>,
): Pick<SelectProps, "value" | "onChange"> {
  return {
    value: toInputValue(getFieldValue(state, field)),
    onChange: (value: string) => {
      update((prev) => setField(prev, field, value));
    },
  };
}
