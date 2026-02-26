import { assert, describe, test } from "@rezi-ui/testkit";
import { contrastRatio } from "../contrast.js";
import {
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
} from "../presets.js";

type PresetCase = Readonly<{
  name: string;
  fg: number;
  bg: number;
}>;

const AA_MIN = 4.5;
const AAA_MIN = 7;

function assertApprox(actual: number, expected: number, epsilon: number, label: string): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${label}: expected ${expected}, got ${actual} (epsilon ${epsilon})`,
  );
}

function formatRatio(ratio: number): string {
  return ratio.toFixed(3);
}

describe("theme contrast", () => {
  test("white on white ratio is 1", () => {
    const white = (255 << 16) | (255 << 8) | 255;
    assert.equal(contrastRatio(white, white), 1);
  });

  test("black on black ratio is 1", () => {
    const black = (0 << 16) | (0 << 8) | 0;
    assert.equal(contrastRatio(black, black), 1);
  });

  test("black on white ratio is 21", () => {
    const black = (0 << 16) | (0 << 8) | 0;
    const white = (255 << 16) | (255 << 8) | 255;
    assert.equal(contrastRatio(black, white), 21);
  });

  test("contrast ratio is symmetric for fg and bg order", () => {
    const fg = (12 << 16) | (90 << 8) | 200;
    const bg = (230 << 16) | (180 << 8) | 40;
    assert.equal(contrastRatio(fg, bg), contrastRatio(bg, fg));
  });

  test("known failing pair (#777777 on #ffffff) is below AA", () => {
    const ratio = contrastRatio((119 << 16) | (119 << 8) | 119, (255 << 16) | (255 << 8) | 255);
    assertApprox(ratio, 4.478089453577214, 1e-12, "known failing pair ratio");
    assert.ok(ratio < AA_MIN, `expected < ${AA_MIN}, got ${formatRatio(ratio)}`);
  });

  test("near-threshold passing pair (#767676 on #ffffff) meets AA", () => {
    const ratio = contrastRatio((118 << 16) | (118 << 8) | 118, (255 << 16) | (255 << 8) | 255);
    assertApprox(ratio, 4.542224959605253, 1e-12, "near-threshold passing pair ratio");
    assert.ok(ratio >= AA_MIN, `expected >= ${AA_MIN}, got ${formatRatio(ratio)}`);
  });

  test("mid-gray pair (#595959 on #ffffff) has expected ratio", () => {
    const ratio = contrastRatio((89 << 16) | (89 << 8) | 89, (255 << 16) | (255 << 8) | 255);
    assertApprox(ratio, 7.004729208035935, 1e-12, "mid-gray pair ratio");
  });

  const presetCases: readonly PresetCase[] = [
    { name: "dark", fg: darkTheme.colors.fg.primary, bg: darkTheme.colors.bg.base },
    { name: "light", fg: lightTheme.colors.fg.primary, bg: lightTheme.colors.bg.base },
    { name: "dimmed", fg: dimmedTheme.colors.fg.primary, bg: dimmedTheme.colors.bg.base },
    {
      name: "high-contrast",
      fg: highContrastTheme.colors.fg.primary,
      bg: highContrastTheme.colors.bg.base,
    },
    { name: "nord", fg: nordTheme.colors.fg.primary, bg: nordTheme.colors.bg.base },
    { name: "dracula", fg: draculaTheme.colors.fg.primary, bg: draculaTheme.colors.bg.base },
  ];

  for (const preset of presetCases) {
    test(`preset ${preset.name} primary fg/bg passes AA`, () => {
      const ratio = contrastRatio(preset.fg, preset.bg);
      assert.ok(
        ratio >= AA_MIN,
        `Theme "${preset.name}" fails AA: primary fg/bg contrast ${formatRatio(ratio)} < ${AA_MIN}`,
      );
    });
  }

  test("high-contrast primary fg/bg passes AAA", () => {
    const ratio = contrastRatio(
      highContrastTheme.colors.fg.primary,
      highContrastTheme.colors.bg.base,
    );
    assert.ok(
      ratio >= AAA_MIN,
      `Theme "high-contrast" fails AAA: primary fg/bg contrast ${formatRatio(ratio)} < ${AAA_MIN}`,
    );
  });
});
