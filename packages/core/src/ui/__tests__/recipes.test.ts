import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { darkTheme, lightTheme } from "../../theme/presets.js";
import { DEFAULT_THEME_SPACING, createThemeDefinition } from "../../theme/tokens.js";
import {
  badgeRecipe,
  buttonRecipe,
  calloutRecipe,
  checkboxRecipe,
  dividerRecipe,
  inputRecipe,
  modalRecipe,
  progressRecipe,
  recipe,
  scrollbarRecipe,
  selectRecipe,
  surfaceRecipe,
  tableRecipe,
  textRecipe,
} from "../recipes.js";

const darkColors = darkTheme.colors;
const lightColors = lightTheme.colors;

describe("buttonRecipe", () => {
  it("resolves default dark-theme styling", () => {
    const result = buttonRecipe(darkColors);
    assert.deepEqual(result.label.fg, darkColors.accent.primary);
    assert.deepEqual(result.bg.bg, darkColors.bg.elevated);
    assert.equal(result.px, 2);
    assert.equal(result.border, "none");
  });

  it("solid variant uses inverse text over tone background", () => {
    const result = buttonRecipe(darkColors, { variant: "solid", tone: "danger" });
    assert.deepEqual(result.label.fg, darkColors.fg.inverse);
    assert.deepEqual(result.bg.bg, darkColors.error);
  });

  it("outline variant uses single border and default border color", () => {
    const result = buttonRecipe(darkColors, { variant: "outline" });
    assert.equal(result.border, "single");
    assert.deepEqual(result.borderStyle, { fg: darkColors.border.default });
  });

  it("ghost variant has no background fill in default state", () => {
    const result = buttonRecipe(darkColors, { variant: "ghost" });
    assert.equal(result.bg.bg, undefined);
  });

  it("ghost variant uses tone color for non-default tones", () => {
    const result = buttonRecipe(darkColors, { variant: "ghost", tone: "danger" });
    assert.deepEqual(result.label.fg, darkColors.error);
  });

  it("disabled state overrides with disabled tokens", () => {
    const result = buttonRecipe(darkColors, { state: "disabled", variant: "outline" });
    assert.deepEqual(result.label.fg, darkColors.disabled.fg);
    assert.deepEqual(result.bg.bg, darkColors.disabled.bg);
    assert.deepEqual(result.borderStyle, { fg: darkColors.disabled.fg });
  });

  it("focus and pressed states add expected text attributes", () => {
    const focused = buttonRecipe(darkColors, { state: "focus" });
    assert.equal(focused.label.underline, true);
    assert.equal(focused.label.bold, true);

    const pressed = buttonRecipe(darkColors, { variant: "solid", state: "pressed" });
    assert.equal(pressed.label.dim, true);
  });

  it("size presets map to deterministic horizontal padding", () => {
    assert.equal(buttonRecipe(darkColors, { size: "sm" }).px, 1);
    assert.equal(buttonRecipe(darkColors, { size: "md" }).px, 2);
    assert.equal(buttonRecipe(darkColors, { size: "lg" }).px, 3);
  });

  it("compact density reduces horizontal padding", () => {
    const compact = buttonRecipe(darkColors, { size: "md", density: "compact" });
    const comfortable = buttonRecipe(darkColors, { size: "md", density: "comfortable" });
    assert.equal(compact.px < comfortable.px, true);
  });

  it("lg size maps to theme spacing token when provided", () => {
    const spacing = Object.freeze({ ...DEFAULT_THEME_SPACING, lg: 9 });
    const customTheme = Object.freeze({
      ...createThemeDefinition("custom", darkColors),
      spacing,
    });
    const result = buttonRecipe(customTheme.colors, {
      size: "lg",
      spacing: customTheme.spacing,
    });
    assert.equal(result.px, 9);
  });

  it("resolves light-theme styling", () => {
    const result = buttonRecipe(lightColors, { variant: "solid", tone: "primary" });
    assert.deepEqual(result.label.fg, lightColors.fg.inverse);
    assert.deepEqual(result.bg.bg, lightColors.accent.primary);
  });
});

describe("inputRecipe", () => {
  it("resolves default dark-theme styling", () => {
    const result = inputRecipe(darkColors);
    assert.deepEqual(result.text.fg, darkColors.fg.primary);
    assert.deepEqual(result.placeholder.fg, darkColors.fg.muted);
    assert.deepEqual(result.bg.bg, darkColors.bg.elevated);
    assert.equal(result.border, "single");
    assert.deepEqual(result.borderStyle.fg, darkColors.border.default);
    assert.equal(result.px, 2);
  });

  it("focus state uses heavy border with accent color", () => {
    const result = inputRecipe(darkColors, { state: "focus" });
    assert.equal(result.border, "heavy");
    assert.deepEqual(result.borderStyle.fg, darkColors.accent.primary);
    assert.equal(result.borderStyle.bold, true);
  });

  it("error and disabled states use semantic tokens", () => {
    const error = inputRecipe(darkColors, { state: "error" });
    assert.deepEqual(error.borderStyle.fg, darkColors.error);

    const disabled = inputRecipe(darkColors, { state: "disabled" });
    assert.deepEqual(disabled.text.fg, darkColors.disabled.fg);
    assert.deepEqual(disabled.bg.bg, darkColors.disabled.bg);
  });

  it("resolves light-theme styling", () => {
    const result = inputRecipe(lightColors);
    assert.deepEqual(result.text.fg, lightColors.fg.primary);
    assert.deepEqual(result.borderStyle.fg, lightColors.border.default);
  });

  it("compact density reduces horizontal padding", () => {
    const compact = inputRecipe(darkColors, { density: "compact" });
    const comfortable = inputRecipe(darkColors, { density: "comfortable" });
    assert.equal(compact.px < comfortable.px, true);
  });
});

describe("surfaceRecipe", () => {
  it("maps elevations to deterministic backgrounds and borders", () => {
    const base = surfaceRecipe(darkColors, { elevation: 0 });
    assert.deepEqual(base.bg.bg, darkColors.bg.base);
    assert.equal(base.border, "none");
    assert.equal(base.shadow, false);

    const level1 = surfaceRecipe(darkColors, { elevation: 1 });
    assert.deepEqual(level1.bg.bg, darkColors.bg.elevated);
    assert.equal(level1.border, "rounded");
    assert.deepEqual(level1.borderStyle, { fg: darkColors.border.subtle });

    const level3 = surfaceRecipe(darkColors, { elevation: 3 });
    assert.deepEqual(level3.bg.bg, darkColors.bg.overlay);
    assert.equal(level3.shadow, true);
  });

  it("focused surface upgrades border styling", () => {
    const result = surfaceRecipe(darkColors, { elevation: 2, focused: true });
    assert.equal(result.border, "heavy");
    assert.deepEqual(result.borderStyle, { fg: darkColors.accent.primary, bold: true });
  });

  it("resolves light-theme styling", () => {
    const result = surfaceRecipe(lightColors, { elevation: 1 });
    assert.deepEqual(result.bg.bg, lightColors.bg.elevated);
  });
});

describe("selectRecipe", () => {
  it("resolves default dark-theme styling", () => {
    const result = selectRecipe(darkColors);
    assert.deepEqual(result.trigger.fg, darkColors.fg.primary);
    assert.deepEqual(result.triggerBg.bg, darkColors.bg.elevated);
    assert.deepEqual(result.activeOption.bg, darkColors.selected.bg);
    assert.deepEqual(result.activeOption.fg, darkColors.selected.fg);
    assert.equal(result.border, "single");
    assert.deepEqual(result.borderStyle.fg, darkColors.border.default);
    assert.equal(result.px, 2);
  });

  it("focus and disabled states resolve deterministically", () => {
    const focused = selectRecipe(darkColors, { state: "focus" });
    assert.equal(focused.trigger.underline, true);
    assert.equal(focused.trigger.bold, true);
    assert.equal(focused.border, "heavy");
    assert.deepEqual(focused.borderStyle.fg, darkColors.accent.primary);

    const disabled = selectRecipe(darkColors, { state: "disabled" });
    assert.deepEqual(disabled.trigger.fg, darkColors.disabled.fg);
    assert.deepEqual(disabled.triggerBg.bg, darkColors.disabled.bg);
  });

  it("resolves light-theme styling", () => {
    const result = selectRecipe(lightColors);
    assert.deepEqual(result.option.fg, lightColors.fg.primary);
  });
});

describe("tableRecipe", () => {
  it("resolves row-state styles using semantic tokens", () => {
    const header = tableRecipe(darkColors, { state: "header" });
    assert.deepEqual(header.cell.fg, darkColors.fg.secondary);
    assert.deepEqual(header.bg.bg, darkColors.bg.elevated);

    const selected = tableRecipe(darkColors, { state: "selectedRow" });
    assert.deepEqual(selected.cell.fg, darkColors.selected.fg);
    assert.deepEqual(selected.bg.bg, darkColors.selected.bg);

    const stripe = tableRecipe(darkColors, { state: "stripe" });
    assert.deepEqual(stripe.bg.bg, darkColors.bg.subtle);
  });

  it("resolves light-theme styling", () => {
    const result = tableRecipe(lightColors, { state: "header" });
    assert.deepEqual(result.cell.fg, lightColors.fg.secondary);
  });

  it("header tone uses accent color for non-default tone", () => {
    const result = tableRecipe(darkColors, { state: "header", tone: "danger" });
    assert.deepEqual(result.cell.fg, darkColors.error);
  });

  it("compact density reduces horizontal padding", () => {
    const compact = tableRecipe(darkColors, { density: "compact" });
    const comfortable = tableRecipe(darkColors, { density: "comfortable" });
    assert.equal(compact.px < comfortable.px, true);
  });
});

describe("modalRecipe", () => {
  it("focused modal uses accent border and shadow", () => {
    const result = modalRecipe(darkColors, { focused: true });
    assert.deepEqual(result.frame.bg, darkColors.bg.overlay);
    assert.deepEqual(result.backdrop.bg, darkColors.bg.base);
    assert.equal(result.backdrop.dim, true);
    assert.equal(result.border, "heavy");
    assert.deepEqual(result.borderStyle, { fg: darkColors.accent.primary, bold: true });
    assert.equal(result.shadow, true);
    assert.deepEqual(result.title.fg, darkColors.fg.primary);
  });

  it("unfocused modal downgrades border variant", () => {
    const result = modalRecipe(darkColors, { focused: false });
    assert.equal(result.border, "rounded");
    assert.deepEqual(result.borderStyle, { fg: darkColors.border.strong });
  });

  it("resolves light-theme styling", () => {
    const result = modalRecipe(lightColors);
    assert.deepEqual(result.title.fg, lightColors.fg.primary);
  });
});

describe("badgeRecipe", () => {
  it("maps tones to semantic backgrounds with contrasting text", () => {
    assert.deepEqual(badgeRecipe(darkColors, { tone: "default" }).bg.bg, darkColors.accent.primary);
    assert.deepEqual(badgeRecipe(darkColors, { tone: "danger" }).bg.bg, darkColors.error);
    assert.deepEqual(badgeRecipe(darkColors, { tone: "info" }).bg.bg, darkColors.info);
    assert.deepEqual(badgeRecipe(darkColors, { tone: "info" }).text.fg, darkColors.fg.inverse);
  });

  it("resolves light-theme styling", () => {
    const result = badgeRecipe(lightColors, { tone: "success" });
    assert.deepEqual(result.text.fg, lightColors.fg.inverse);
  });
});

describe("textRecipe", () => {
  it("maps roles to typography token outputs", () => {
    const title = textRecipe(darkColors, { role: "title" });
    assert.deepEqual(title.style.fg, darkColors.fg.primary);
    assert.equal(title.style.bold, true);

    const caption = textRecipe(darkColors, { role: "caption" });
    assert.deepEqual(caption.style.fg, darkColors.fg.secondary);
    assert.equal(caption.style.dim, true);
  });

  it("resolves light-theme styling", () => {
    const result = textRecipe(lightColors, { role: "muted" });
    assert.deepEqual(result.style.fg, lightColors.fg.muted);
  });
});

describe("dividerRecipe", () => {
  it("uses subtle border color", () => {
    assert.deepEqual(dividerRecipe(darkColors).style.fg, darkColors.border.subtle);
  });

  it("resolves light-theme styling", () => {
    assert.deepEqual(dividerRecipe(lightColors).style.fg, lightColors.border.subtle);
  });
});

describe("checkboxRecipe", () => {
  it("resolves checked/unchecked/disabled styles", () => {
    const checked = checkboxRecipe(darkColors, { checked: true });
    assert.deepEqual(checked.indicator.fg, darkColors.accent.primary);

    const unchecked = checkboxRecipe(darkColors, { checked: false });
    assert.deepEqual(unchecked.indicator.fg, darkColors.fg.secondary);

    const disabled = checkboxRecipe(darkColors, { state: "disabled" });
    assert.deepEqual(disabled.indicator.fg, darkColors.disabled.fg);
    assert.deepEqual(disabled.label.fg, darkColors.disabled.fg);
  });

  it("resolves light-theme styling", () => {
    const result = checkboxRecipe(lightColors, { checked: true });
    assert.deepEqual(result.indicator.fg, lightColors.accent.primary);
  });
});

describe("progressRecipe", () => {
  it("maps tone and track colors deterministically", () => {
    const primary = progressRecipe(darkColors, { tone: "primary" });
    assert.deepEqual(primary.filled.fg, darkColors.accent.primary);
    assert.deepEqual(primary.track.fg, darkColors.border.subtle);

    const danger = progressRecipe(darkColors, { tone: "danger" });
    assert.deepEqual(danger.filled.fg, darkColors.error);
  });

  it("resolves light-theme styling", () => {
    const result = progressRecipe(lightColors, { tone: "warning" });
    assert.deepEqual(result.filled.fg, lightColors.warning);
  });
});

describe("calloutRecipe", () => {
  it("maps callout tones to semantic border colors", () => {
    const info = calloutRecipe(darkColors, { tone: "info" });
    assert.deepEqual(info.borderStyle.fg, darkColors.info);
    assert.deepEqual(info.bg.bg, darkColors.bg.elevated);
    assert.deepEqual(info.text.fg, darkColors.fg.primary);

    const success = calloutRecipe(darkColors, { tone: "success" });
    assert.deepEqual(success.borderStyle.fg, darkColors.success);
  });

  it("resolves light-theme styling", () => {
    const result = calloutRecipe(lightColors, { tone: "warning" });
    assert.deepEqual(result.borderStyle.fg, lightColors.warning);
  });
});

describe("scrollbarRecipe", () => {
  it("returns deterministic track/thumb styles", () => {
    const result = scrollbarRecipe(darkColors);
    assert.deepEqual(result.track.fg, darkColors.border.subtle);
    assert.deepEqual(result.thumb.fg, darkColors.fg.muted);
  });

  it("resolves light-theme styling", () => {
    const result = scrollbarRecipe(lightColors);
    assert.deepEqual(result.track.fg, lightColors.border.subtle);
    assert.deepEqual(result.thumb.fg, lightColors.fg.muted);
  });
});

describe("recipe namespace", () => {
  it("exposes all 13 recipe functions", () => {
    assert.equal(typeof recipe.button, "function");
    assert.equal(typeof recipe.input, "function");
    assert.equal(typeof recipe.surface, "function");
    assert.equal(typeof recipe.select, "function");
    assert.equal(typeof recipe.table, "function");
    assert.equal(typeof recipe.modal, "function");
    assert.equal(typeof recipe.badge, "function");
    assert.equal(typeof recipe.text, "function");
    assert.equal(typeof recipe.divider, "function");
    assert.equal(typeof recipe.checkbox, "function");
    assert.equal(typeof recipe.progress, "function");
    assert.equal(typeof recipe.callout, "function");
    assert.equal(typeof recipe.scrollbar, "function");
  });
});
