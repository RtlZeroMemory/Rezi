/**
 * packages/core/src/theme/defaultTheme.ts — Internal default compiled theme.
 */

import { darkTheme } from "./presets.js";
import { compileTheme } from "./theme.js";

export const defaultTheme = compileTheme(darkTheme);
