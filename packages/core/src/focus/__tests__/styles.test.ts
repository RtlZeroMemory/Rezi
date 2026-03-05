import { assert, describe, test } from "@rezi-ui/testkit";
import {
  FOCUS_RING_DASHED,
  FOCUS_RING_DOTTED,
  FOCUS_RING_DOUBLE,
  FOCUS_RING_HEAVY,
  FOCUS_RING_ROUNDED,
  FOCUS_RING_SINGLE,
  formatKeyboardHint,
  getDefaultFocusConfig,
  getFocusRingGlyphs,
  shouldShowFocusRing,
} from "../styles.js";

describe("focus styles", () => {
  test("returns glyph set for each ring variant", () => {
    assert.equal(getFocusRingGlyphs("single"), FOCUS_RING_SINGLE);
    assert.equal(getFocusRingGlyphs("double"), FOCUS_RING_DOUBLE);
    assert.equal(getFocusRingGlyphs("rounded"), FOCUS_RING_ROUNDED);
    assert.equal(getFocusRingGlyphs("heavy"), FOCUS_RING_HEAVY);
    assert.equal(getFocusRingGlyphs("dashed"), FOCUS_RING_DASHED);
    assert.equal(getFocusRingGlyphs("dotted"), FOCUS_RING_DOTTED);
  });

  test("formats keyboard hints with the requested wrapper", () => {
    assert.equal(formatKeyboardHint("Enter", "bracket"), "[Enter]");
    assert.equal(formatKeyboardHint("Enter", "parenthesis"), "(Enter)");
    assert.equal(formatKeyboardHint("Enter", "plain"), "Enter");
  });

  test("shows focus ring for focused keyboard navigation states unless disabled", () => {
    const focused = {
      isFocused: true,
      isInFocusPath: true,
      isKeyboardNavigation: true,
      showFocusRing: false,
    } as const;
    const unfocused = {
      isFocused: false,
      isInFocusPath: false,
      isKeyboardNavigation: true,
      showFocusRing: true,
    } as const;

    assert.equal(shouldShowFocusRing(focused), true);
    assert.equal(shouldShowFocusRing(focused, { indicator: "none" }), false);
    assert.equal(shouldShowFocusRing(unfocused), false);
  });

  test("returns widget defaults and fallback focus config", () => {
    const button = getDefaultFocusConfig("button");
    assert.equal(button.indicator, "bracket");
    assert.equal(button.showHint, true);

    const unknown = getDefaultFocusConfig("not-a-widget");
    assert.equal(unknown.indicator, "ring");
    assert.equal(unknown.ringVariant, "single");
  });
});
