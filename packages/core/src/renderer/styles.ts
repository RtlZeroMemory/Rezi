/**
 * packages/core/src/renderer/styles.ts — Renderer style utilities.
 */

import { type Theme, resolveColor } from "../theme/theme.js";
import { rgb, type TextStyle } from "../widgets/style.js";

/** Disabled widget foreground color (gray). */
const DISABLED_FG = rgb(128, 128, 128);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function resolveStyleColor(theme: Theme, value: unknown): unknown {
  if (typeof value === "string") {
    return resolveColor(theme, value);
  }
  return value;
}

/**
 * Coerce unknown value to TextStyle if object-shaped.
 */
export function asTextStyle(v: unknown, theme?: Theme): TextStyle | undefined {
  if (!isObject(v)) return undefined;
  const style = v as TextStyle;
  if (!theme) return style;

  const resolvedFg = resolveStyleColor(theme, style.fg) as TextStyle["fg"];
  const resolvedBg = resolveStyleColor(theme, style.bg) as TextStyle["bg"];
  const resolvedUnderlineColor = resolveStyleColor(theme, style.underlineColor) as
    | TextStyle["underlineColor"]
    | undefined;

  if (
    resolvedFg === style.fg &&
    resolvedBg === style.bg &&
    resolvedUnderlineColor === style.underlineColor
  ) {
    return style;
  }

  return {
    ...style,
    ...(resolvedFg === undefined ? {} : { fg: resolvedFg }),
    ...(resolvedBg === undefined ? {} : { bg: resolvedBg }),
    ...(resolvedUnderlineColor === undefined ? {} : { underlineColor: resolvedUnderlineColor }),
  };
}

/** Visual state for button/input styling. */
export type ButtonVisualState = Readonly<{ focused: boolean; disabled: boolean }>;

/**
 * Compute text style for button/input label based on visual state.
 */
export function getButtonLabelStyle(state: ButtonVisualState): TextStyle | undefined {
  if (state.disabled) return { fg: DISABLED_FG };
  if (state.focused) return { underline: true, bold: true };
  return undefined;
}
