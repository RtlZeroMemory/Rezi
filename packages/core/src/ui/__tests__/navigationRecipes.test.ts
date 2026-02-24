import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { darkTheme, lightTheme } from "../../theme/presets.js";
import {
  accordionRecipe,
  breadcrumbRecipe,
  paginationRecipe,
  recipe,
  tabsRecipe,
} from "../recipes.js";

const darkColors = darkTheme.colors;
const lightColors = lightTheme.colors;

describe("tabsRecipe", () => {
  it("maps active and focus states deterministically", () => {
    const active = tabsRecipe(darkColors, {
      variant: "soft",
      tone: "primary",
      state: "active-item",
      size: "md",
    });
    assert.deepEqual(active.item.fg, darkColors.accent.primary);
    assert.equal(active.item.bold, true);
    assert.deepEqual(active.bg.bg, darkColors.bg.subtle);

    const focused = tabsRecipe(darkColors, { variant: "outline", state: "focus" });
    assert.equal(focused.border, "heavy");
    assert.equal(focused.item.underline, true);
    assert.equal(focused.item.bold, true);
  });

  it("resolves disabled and light-theme styles", () => {
    const disabled = tabsRecipe(darkColors, { state: "disabled", variant: "outline" });
    assert.deepEqual(disabled.item.fg, darkColors.disabled.fg);
    assert.equal(disabled.border, "single");

    const light = tabsRecipe(lightColors, { variant: "solid", state: "active-item" });
    assert.deepEqual(light.bg.bg, lightColors.accent.primary);
    assert.deepEqual(light.item.fg, lightColors.fg.inverse);
  });
});

describe("accordionRecipe", () => {
  it("styles expanded/focused headers with semantic tokens", () => {
    const expanded = accordionRecipe(darkColors, {
      variant: "outline",
      tone: "warning",
      state: "selected",
    });
    assert.deepEqual(expanded.header.fg, darkColors.warning);
    assert.equal(expanded.header.bold, true);
    assert.equal(expanded.border, "heavy");

    const focused = accordionRecipe(darkColors, { state: "focus" });
    assert.equal(focused.header.underline, true);
  });

  it("resolves disabled and light-theme styles", () => {
    const disabled = accordionRecipe(darkColors, { state: "disabled", variant: "outline" });
    assert.deepEqual(disabled.header.fg, darkColors.disabled.fg);
    assert.deepEqual(disabled.bg.bg, darkColors.disabled.bg);

    const light = accordionRecipe(lightColors, { variant: "solid", state: "selected" });
    assert.deepEqual(light.header.fg, lightColors.fg.inverse);
  });
});

describe("breadcrumbRecipe", () => {
  it("styles clickable and current crumbs with consistent separators", () => {
    const clickable = breadcrumbRecipe(darkColors, {
      tone: "primary",
      variant: "ghost",
      state: "default",
    });
    assert.deepEqual(clickable.item.fg, darkColors.accent.primary);
    assert.deepEqual(clickable.separator.fg, darkColors.fg.muted);

    const current = breadcrumbRecipe(darkColors, { state: "selected" });
    assert.deepEqual(current.item.fg, darkColors.fg.primary);
    assert.equal(current.item.bold, true);
  });
});

describe("paginationRecipe", () => {
  it("maps control states and supports custom spacing overrides", () => {
    const active = paginationRecipe(darkColors, {
      variant: "outline",
      state: "active-item",
      spacing: { xs: 1, sm: 4, md: 6, lg: 8, xl: 10, "2xl": 12 },
    });
    assert.deepEqual(active.control.fg, darkColors.accent.primary);
    assert.equal(active.control.bold, true);
    assert.equal(active.border, "heavy");
    assert.equal(active.px, 6);

    const disabled = paginationRecipe(darkColors, {
      variant: "outline",
      state: "disabled",
    });
    assert.deepEqual(disabled.control.fg, darkColors.disabled.fg);
  });

  it("resolves light-theme controls", () => {
    const focused = paginationRecipe(lightColors, {
      variant: "solid",
      tone: "danger",
      state: "focus",
    });
    assert.deepEqual(focused.bg.bg, lightColors.error);
    assert.deepEqual(focused.control.fg, lightColors.fg.inverse);
  });
});

describe("navigation recipe namespace", () => {
  it("exposes navigation recipe functions", () => {
    assert.equal(recipe.tabs, tabsRecipe);
    assert.equal(recipe.accordion, accordionRecipe);
    assert.equal(recipe.breadcrumb, breadcrumbRecipe);
    assert.equal(recipe.pagination, paginationRecipe);
  });
});
