import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { darkTheme, lightTheme } from "../../theme/presets.js";
import { resolveSize } from "../designTokens.js";
import {
  dropdownRecipe,
  kbdRecipe,
  recipe,
  sidebarRecipe,
  toolbarRecipe,
  treeRecipe,
} from "../recipes.js";

const darkColors = darkTheme.colors;
const lightColors = lightTheme.colors;

describe("resolveSize override", () => {
  it("uses theme spacing tokens when provided", () => {
    const spacing = { xs: 1, sm: 3, md: 5, lg: 7, xl: 9, "2xl": 11 } as const;
    assert.deepEqual(resolveSize("md"), { px: 2, py: 0 });
    assert.deepEqual(resolveSize("sm", spacing), { px: 1, py: 0 });
    assert.deepEqual(resolveSize("md", spacing), { px: 3, py: 0 });
    assert.deepEqual(resolveSize("lg", spacing), { px: 5, py: 1 });
  });
});

describe("kbdRecipe", () => {
  it("maps default/focus/disabled states", () => {
    const base = kbdRecipe(darkColors, { variant: "outline", tone: "primary" });
    assert.deepEqual(base.key.fg, darkColors.accent.primary);
    assert.deepEqual(base.bg.bg, darkColors.bg.elevated);
    assert.equal(base.border, "single");

    const focus = kbdRecipe(darkColors, { state: "focus" });
    assert.equal(focus.key.underline, true);
    assert.equal(focus.key.bold, true);

    const disabled = kbdRecipe(darkColors, { state: "disabled" });
    assert.deepEqual(disabled.key.fg, darkColors.disabled.fg);
    assert.deepEqual(disabled.bg.bg, darkColors.disabled.bg);
  });
});

describe("dropdownRecipe", () => {
  it("styles active and disabled menu rows", () => {
    const active = dropdownRecipe(darkColors, {
      variant: "soft",
      tone: "success",
      state: "active-item",
      size: "lg",
    });
    assert.deepEqual(active.bg.bg, darkColors.success);
    assert.deepEqual(active.item.fg, darkColors.fg.inverse);
    assert.equal(active.item.bold, true);
    assert.equal(active.px, 3);

    const disabled = dropdownRecipe(darkColors, { state: "disabled" });
    assert.deepEqual(disabled.item.fg, darkColors.disabled.fg);
    assert.deepEqual(disabled.shortcut.fg, darkColors.disabled.fg);
  });
});

describe("treeRecipe", () => {
  it("styles default/selected/focused nodes", () => {
    const base = treeRecipe(darkColors, { variant: "ghost", state: "default" });
    assert.deepEqual(base.node.fg, darkColors.fg.primary);
    assert.deepEqual(base.prefix.fg, darkColors.fg.muted);

    const selected = treeRecipe(darkColors, { state: "selected" });
    assert.deepEqual(selected.bg.bg, darkColors.selected.bg);
    assert.deepEqual(selected.node.fg, darkColors.selected.fg);
    assert.equal(selected.node.bold, true);

    const focused = treeRecipe(darkColors, { tone: "warning", state: "focus" });
    assert.deepEqual(focused.node.fg, darkColors.warning);
    assert.equal(focused.node.underline, true);
  });

  it("resolves light-theme selected colors", () => {
    const selected = treeRecipe(lightColors, { state: "selected" });
    assert.deepEqual(selected.bg.bg, lightColors.selected.bg);
    assert.deepEqual(selected.node.fg, lightColors.selected.fg);
  });
});

describe("sidebarRecipe and toolbarRecipe", () => {
  it("returns deterministic container defaults", () => {
    const sidebar = sidebarRecipe(darkColors, { variant: "outline", state: "focus" });
    assert.equal(sidebar.border, "heavy");
    assert.deepEqual(sidebar.borderStyle?.fg, darkColors.accent.primary);
    assert.equal(sidebar.item.underline, true);

    const toolbar = toolbarRecipe(darkColors, { variant: "ghost", state: "active-item" });
    assert.equal(toolbar.border, "none");
    assert.deepEqual(toolbar.item.fg, darkColors.accent.primary);
    assert.equal(toolbar.item.bold, true);
  });
});

describe("additional recipe namespace", () => {
  it("exposes additional recipe functions", () => {
    assert.equal(recipe.kbd, kbdRecipe);
    assert.equal(recipe.sidebar, sidebarRecipe);
    assert.equal(recipe.toolbar, toolbarRecipe);
    assert.equal(recipe.dropdown, dropdownRecipe);
    assert.equal(recipe.tree, treeRecipe);
  });
});
