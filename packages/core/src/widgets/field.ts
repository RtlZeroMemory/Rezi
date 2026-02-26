/**
 * packages/core/src/widgets/field.ts — Field wrapper widget utilities.
 *
 * Why: Provides a wrapper component that displays a label, error message,
 * and optional hint text around a form input. This is a structural widget
 * that helps maintain consistent form field layout.
 *
 * @see docs/widgets/field.md (GitHub issue #119)
 */

import { rgb } from "./style.js";
import type { FieldProps, VNode } from "./types.js";

/** Character used to indicate required fields. */
export const REQUIRED_INDICATOR = "*";

/** Default styles for field label. */
export const FIELD_LABEL_STYLE = Object.freeze({
  bold: true,
});

/** Default styles for field error. */
export const FIELD_ERROR_STYLE = Object.freeze({
  fg: rgb(255, 0, 0),
});

/** Default styles for field hint. */
export const FIELD_HINT_STYLE = Object.freeze({
  dim: true,
});

/**
 * Build the label text for a field.
 *
 * @param label - Field label
 * @param required - Whether the field is required
 * @returns Label text with optional required indicator
 */
export function buildFieldLabel(label: string, required?: boolean): string {
  if (required) {
    return `${label} ${REQUIRED_INDICATOR}`;
  }
  return label;
}

/**
 * Check if a field should display an error.
 *
 * @param error - Error message (if any)
 * @returns True if error should be displayed
 */
export function shouldShowError(error: string | undefined): boolean {
  return error !== undefined && error !== "";
}

/**
 * Create a VNode for a field wrapper.
 * This creates the structure: column(label, children, error?, hint?)
 *
 * @param props - Field properties
 * @returns VNode representing the field wrapper
 */
export function createFieldVNode(props: FieldProps): VNode {
  // Single child wrapped in array for consistency
  const children: VNode[] = [props.children];

  return {
    kind: "field",
    props,
    children: Object.freeze(children),
  };
}
