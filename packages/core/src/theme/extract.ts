import type { Theme } from "./theme.js";
import type { ColorTokens } from "./tokens.js";

export function getColorTokens(theme: Theme): ColorTokens {
  return theme.definition.colors;
}
