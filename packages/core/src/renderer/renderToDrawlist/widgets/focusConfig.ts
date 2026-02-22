import type { FocusConfig, FocusIndicatorType } from "../../../focus/styles.js";
import type { Theme } from "../../../theme/theme.js";
import { asTextStyle } from "../../styles.js";
import type { ResolvedTextStyle } from "../textStyle.js";
import { mergeTextStyle } from "../textStyle.js";

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
  if (override) out = mergeTextStyle(out, override);
  return out;
}

export function resolveFocusedContentStyle(
  baseStyle: ResolvedTextStyle,
  theme: Theme,
  config: FocusConfig | undefined,
  fallback: ResolvedTextStyle | undefined = undefined,
): ResolvedTextStyle {
  let out = fallback ? mergeTextStyle(baseStyle, fallback) : baseStyle;
  const override = asTextStyle((config as FocusConfigShape | undefined)?.contentStyle, theme);
  if (override) out = mergeTextStyle(out, override);
  return out;
}
