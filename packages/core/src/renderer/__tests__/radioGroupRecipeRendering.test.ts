import { assert, describe, test } from "@rezi-ui/testkit";
import {
  darkTheme,
  dimmedTheme,
  draculaTheme,
  highContrastTheme,
  lightTheme,
  nordTheme,
} from "../../theme/presets.js";
import { compileTheme } from "../../theme/theme.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const DS_THEMES = [
  ["dark", compileTheme(darkTheme)],
  ["light", compileTheme(lightTheme)],
  ["dimmed", compileTheme(dimmedTheme)],
  ["high-contrast", compileTheme(highContrastTheme)],
  ["nord", compileTheme(nordTheme)],
  ["dracula", compileTheme(draculaTheme)],
] as const;

function findTextOp(ops: readonly DrawOp[], text: string): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && op.text.includes(text));
}

describe("radioGroup recipe rendering", () => {
  test("renders disabled options with disabled recipe colors", () => {
    for (const [name, theme] of DS_THEMES) {
      const ops = renderOps(
        ui.radioGroup({
          id: "plans",
          value: "pro",
          options: [
            { value: "free", label: "Free" },
            { value: "pro", label: "Pro", disabled: true },
            { value: "enterprise", label: "Enterprise" },
          ],
        }),
        {
          viewport: { cols: 40, rows: 4 },
          theme,
        },
      );

      const label = findTextOp(ops, "Pro");
      assert.ok(label && label.kind === "drawText", `${name} theme should render disabled label`);
      if (!label || label.kind !== "drawText") continue;

      const indicator = ops.find(
        (op): op is Extract<DrawOp, { kind: "drawText" }> =>
          op.kind === "drawText" && op.text === "(o)" && op.y === label.y,
      );
      assert.ok(indicator, `${name} theme should render disabled selected indicator`);
      if (!indicator) continue;

      assert.deepEqual(indicator.style?.fg, theme.colors["disabled.fg"]);
      assert.deepEqual(label.style?.fg, theme.colors["disabled.fg"]);
    }
  });
});
