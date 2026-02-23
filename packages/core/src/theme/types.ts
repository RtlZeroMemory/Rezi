import type { Rgb } from "../widgets/style.js";

export type ThemeColors = Readonly<{
  primary: Rgb;
  secondary: Rgb;
  success: Rgb;
  danger: Rgb;
  warning: Rgb;
  info: Rgb;
  muted: Rgb;
  bg: Rgb;
  fg: Rgb;
  border: Rgb;
  [key: string]: Rgb;
}>;

export type ThemeSpacing = readonly number[];

export type Theme = Readonly<{
  colors: ThemeColors;
  spacing: ThemeSpacing;
}>;
