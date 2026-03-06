import { getColorTokens } from "../../theme/extract.js";
import type { ColorTokens } from "../../theme/tokens.js";
import type { WidgetSize, WidgetTone, WidgetVariant } from "../../ui/designTokens.js";
import type { TextStyle } from "../../widgets/style.js";

export { getColorTokens };

export function readWidgetVariant(value: unknown): WidgetVariant | undefined {
  if (value === "solid" || value === "soft" || value === "outline" || value === "ghost") {
    return value;
  }
  return undefined;
}

export function readWidgetTone(value: unknown): WidgetTone | undefined {
  if (
    value === "default" ||
    value === "primary" ||
    value === "danger" ||
    value === "success" ||
    value === "warning"
  ) {
    return value;
  }
  return undefined;
}

export function readWidgetSize(value: unknown): WidgetSize | undefined {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  return undefined;
}

export function resolveWidgetFocusStyle(
  colorTokens: ColorTokens,
  focused: boolean,
  disabled: boolean,
  focusIndicator: Readonly<{ bold: boolean; underline: boolean; focusRingColor?: number }>,
): TextStyle | undefined {
  if (!focused || disabled) return undefined;
  return {
    ...(focusIndicator.underline ? { underline: true } : {}),
    ...(focusIndicator.bold ? { bold: true } : {}),
    fg: focusIndicator.focusRingColor ?? colorTokens.focus.ring,
  };
}
