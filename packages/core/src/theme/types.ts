import type { Rgb24 } from "../widgets/style.js";

export type ThemeColors = Readonly<{
  primary: Rgb24;
  secondary: Rgb24;
  success: Rgb24;
  danger: Rgb24;
  warning: Rgb24;
  info: Rgb24;
  muted: Rgb24;
  bg: Rgb24;
  fg: Rgb24;
  border: Rgb24;
  [key: string]: Rgb24;
}>;

export type ThemeSpacing = readonly number[];

export type Theme = Readonly<{
  colors: ThemeColors;
  spacing: ThemeSpacing;
}>;
