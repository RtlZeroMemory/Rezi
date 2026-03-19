import { assert, describe, test } from "@rezi-ui/testkit";
import { darkTheme } from "../../theme/presets.js";
import { compileTheme } from "../../theme/theme.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = compileTheme(darkTheme);

function findTextOp(ops: readonly DrawOp[], text: string): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && op.text.includes(text));
}

describe("radioGroup recipe rendering", () => {
  test("renders disabled options with disabled recipe colors", () => {
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
        theme: dsTheme,
      },
    );

    const label = findTextOp(ops, "Pro");
    assert.ok(label && label.kind === "drawText");
    if (!label || label.kind !== "drawText") return;

    const indicator = ops.find(
      (op): op is Extract<DrawOp, { kind: "drawText" }> =>
        op.kind === "drawText" && op.text === "(o)" && op.y === label.y,
    );
    assert.ok(indicator, "disabled selected option indicator should render");
    if (!indicator) return;

    assert.deepEqual(indicator.style?.fg, dsTheme.colors["disabled.fg"]);
    assert.deepEqual(label.style?.fg, dsTheme.colors["disabled.fg"]);
  });
});
