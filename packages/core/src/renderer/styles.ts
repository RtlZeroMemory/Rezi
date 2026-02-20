/**
 * packages/core/src/renderer/styles.ts — Renderer style utilities.
 *
 * Why: Provides style computation for widget rendering, including focus
 * and disabled visual states. Deterministic style mapping ensures
 * consistent visual output across renders.
 *
 * @see docs/styling/style-props.md
 * @see docs/styling/focus-styles.md
 */

import type { Rgb, TextStyle } from "../index.js";
import { type Theme, resolveColor } from "../theme/theme.js";

/** Disabled widget foreground color (gray). */
const DISABLED_FG: Rgb = Object.freeze({ r: 128, g: 128, b: 128 });

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseHexColor(value: string): Rgb | null {
  const raw = value.startsWith("#") ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    const parsed = Number.parseInt(raw, 16);
    return Object.freeze({
      r: (parsed >> 16) & 0xff,
      g: (parsed >> 8) & 0xff,
      b: parsed & 0xff,
    });
  }
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    const r = Number.parseInt(raw[0] ?? "0", 16);
    const g = Number.parseInt(raw[1] ?? "0", 16);
    const b = Number.parseInt(raw[2] ?? "0", 16);
    return Object.freeze({
      r: (r << 4) | r,
      g: (g << 4) | g,
      b: (b << 4) | b,
    });
  }
  return null;
}

function resolveStyleColor(theme: Theme, value: unknown): unknown {
  if (typeof value !== "string") return value;
  const parsedHex = parseHexColor(value);
  if (parsedHex) return parsedHex;
  return resolveColor(theme, value);
}

/**
 * Coerce unknown value to TextStyle if object-shaped.
 * Relies on drawlist builder for validation.
 */
export function asTextStyle(v: unknown, theme?: Theme): TextStyle | undefined {
  /* Renderer is not responsible for validating user-provided style objects.
   * Accept object-shaped values and rely on the drawlist builder's deterministic encoding. */
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
 *   - Focused: underline + bold for clear indication while maintaining readability
 *   - Disabled: gray foreground
 */
export function getButtonLabelStyle(state: ButtonVisualState): TextStyle | undefined {
  // Deterministic mapping:
  // - Focused: underline + bold (more readable than inverse)
  // - Disabled: deterministic fg color override (engine v1 has no "dim" attr)
  if (state.disabled) return { fg: DISABLED_FG };
  if (state.focused) return { underline: true, bold: true };
  return undefined;
}
