import type { FocusConfig, FocusIndicatorType } from "../../../focus/styles.js";
import type { Theme } from "../../../theme/theme.js";
import { asTextStyle } from "../../styles.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle } from "../textStyle.js";
import { getColorTokens } from "../themeTokens.js";

const VALID_FOCUS_INDICATORS: ReadonlySet<FocusIndicatorType> = new Set<FocusIndicatorType>([
  "ring",
  "underline",
  "background",
  "bracket",
  "arrow",
  "dot",
  "caret",
  "none",
]);

type FocusConfigShape = Readonly<{
  indicator?: unknown;
  style?: unknown;
  contentStyle?: unknown;
}>;

export type FocusIndicatorDecoration = Readonly<{
  prefix: string;
  suffix: string;
  style: ResolvedTextStyle;
}>;

export function readFocusConfig(raw: unknown): FocusConfig | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  return raw as FocusConfig;
}

export function readFocusIndicator(
  config: FocusConfig | undefined,
): FocusIndicatorType | undefined {
  const raw = (config as FocusConfigShape | undefined)?.indicator;
  if (typeof raw !== "string") return undefined;
  if (!VALID_FOCUS_INDICATORS.has(raw as FocusIndicatorType)) return undefined;
  return raw as FocusIndicatorType;
}

export function focusIndicatorEnabled(config: FocusConfig | undefined): boolean {
  return readFocusIndicator(config) !== "none";
}

export function resolveFocusIndicatorStyle(
  baseStyle: ResolvedTextStyle,
  theme: Theme,
  config: FocusConfig | undefined,
  fallback: ResolvedTextStyle | undefined = undefined,
): ResolvedTextStyle {
  let out = fallback ? mergeTextStyle(baseStyle, fallback) : baseStyle;
  const override = asTextStyle((config as FocusConfigShape | undefined)?.style, theme);
  if (override) {
    out = mergeTextStyle(out, override);
  } else {
    const colorTokens = getColorTokens(theme);
    out = mergeTextStyle(out, {
      ...(out.fg === undefined
        ? { fg: theme.focusIndicator.focusRingColor ?? colorTokens.focus.ring }
        : {}),
      ...(theme.focusIndicator.underline ? { underline: true } : {}),
      ...(theme.focusIndicator.bold ? { bold: true } : {}),
    });
  }
  return out;
}

export function resolveFocusedContentStyle(
  baseStyle: ResolvedTextStyle,
  theme: Theme,
  config: FocusConfig | undefined,
  fallback: ResolvedTextStyle | undefined = undefined,
): ResolvedTextStyle {
  let out = fallback ? mergeTextStyle(baseStyle, fallback) : baseStyle;
  out = mergeTextStyle(out, {
    ...(theme.focusIndicator.underline ? { underline: true } : {}),
    ...(theme.focusIndicator.bold ? { bold: true } : {}),
  });
  const override = asTextStyle((config as FocusConfigShape | undefined)?.contentStyle, theme);
  if (override) out = mergeTextStyle(out, override);
  return out;
}

export function resolveFocusIndicatorDecoration(
  baseStyle: ResolvedTextStyle,
  theme: Theme,
  config: FocusConfig | undefined,
): FocusIndicatorDecoration | undefined {
  const indicator = readFocusIndicator(config);
  if (indicator !== "bracket" && indicator !== "arrow") return undefined;

  let style = baseStyle;
  const colorTokens = getColorTokens(theme);
  style = mergeTextStyle(style, {
    fg: theme.focusIndicator.focusRingColor ?? colorTokens.focus.ring,
    ...(theme.focusIndicator.bold ? { bold: true } : {}),
  });
  const override = asTextStyle((config as FocusConfigShape | undefined)?.style, theme);
  if (override) {
    style = mergeTextStyle(style, override);
  }

  return indicator === "bracket"
    ? { prefix: "[", suffix: "]", style }
    : { prefix: "▸ ", suffix: "", style };
}
