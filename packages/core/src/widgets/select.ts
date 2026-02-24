/**
 * packages/core/src/widgets/select.ts — Select dropdown widget utilities.
 *
 * Why: Provides utilities for creating and managing select dropdown widgets.
 * Handles keyboard navigation (ArrowUp/Down, Enter), option rendering, and
 * value selection.
 *
 * @see docs/widgets/select.md (GitHub issue #119)
 */

import type { SelectOption, SelectProps, VNode } from "./types.js";

/** Character for dropdown indicator (collapsed). */
export const SELECT_INDICATOR_CLOSED = "▼";

/** Character for dropdown indicator (expanded). */
export const SELECT_INDICATOR_OPEN = "▲";

/** Default placeholder text. */
export const DEFAULT_PLACEHOLDER = "Select...";

/**
 * Get the display label for the currently selected option.
 *
 * @param value - Current selected value
 * @param options - Available options
 * @param placeholder - Placeholder text when no selection
 * @returns Display text for the select
 */
export function getSelectDisplayText(
  value: string,
  options: readonly SelectOption[],
  placeholder?: string,
): string {
  if (value === "") {
    const emptyOption = options.find((opt) => opt.value === "");
    if (!emptyOption) {
      return placeholder ?? DEFAULT_PLACEHOLDER;
    }
    return emptyOption.label;
  }

  if (!value) {
    return placeholder ?? DEFAULT_PLACEHOLDER;
  }

  const option = options.find((opt) => opt.value === value);
  return option?.label ?? value;
}

/**
 * Find the index of an option by value.
 *
 * @param value - Value to find
 * @param options - Options array
 * @returns Index of the option, or -1 if not found
 */
export function findOptionIndex(value: string, options: readonly SelectOption[]): number {
  return options.findIndex((opt) => opt.value === value);
}

/**
 * Get the next selectable option index (for ArrowDown).
 * Skips disabled options.
 *
 * @param currentIndex - Current selected index
 * @param options - Available options
 * @param wrapAround - Whether to wrap from last to first
 * @returns Next selectable index, or current if none found
 */
export function getNextOptionIndex(
  currentIndex: number,
  options: readonly SelectOption[],
  wrapAround = true,
): number {
  const len = options.length;
  if (len === 0) return -1;

  let index = currentIndex + 1;
  let iterations = 0;

  while (iterations < len) {
    if (index >= len) {
      if (wrapAround) {
        index = 0;
      } else {
        return currentIndex;
      }
    }

    const opt = options[index];
    if (opt && !opt.disabled) {
      return index;
    }

    index++;
    iterations++;
  }

  return currentIndex;
}

/**
 * Get the previous selectable option index (for ArrowUp).
 * Skips disabled options.
 *
 * @param currentIndex - Current selected index
 * @param options - Available options
 * @param wrapAround - Whether to wrap from first to last
 * @returns Previous selectable index, or current if none found
 */
export function getPrevOptionIndex(
  currentIndex: number,
  options: readonly SelectOption[],
  wrapAround = true,
): number {
  const len = options.length;
  if (len === 0) return -1;

  let index = currentIndex - 1;
  let iterations = 0;

  while (iterations < len) {
    if (index < 0) {
      if (wrapAround) {
        index = len - 1;
      } else {
        return currentIndex;
      }
    }

    const opt = options[index];
    if (opt && !opt.disabled) {
      return index;
    }

    index--;
    iterations++;
  }

  return currentIndex;
}

/**
 * Create a VNode for a select widget.
 *
 * @param props - Select properties
 * @returns VNode representing the select
 */
export function createSelectVNode(props: SelectProps): VNode {
  return {
    kind: "select",
    props,
  };
}
