import { assert, describe, test } from "@rezi-ui/testkit";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = coerceToLegacyTheme(darkTheme);

function findTextOp(ops: readonly DrawOp[], text: string): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && op.text === text);
}

describe("checkbox recipe rendering", () => {
  test("uses recipe colors with semantic-token themes", () => {
    const ops = renderOps(ui.checkbox({ id: "cb", checked: false, label: "Option" }), {
      viewport: { cols: 40, rows: 3 },
      theme: dsTheme,
    });
    const indicator = findTextOp(ops, "[ ]");
    const label = findTextOp(ops, "Option");
    assert.ok(indicator && indicator.kind === "drawText");
    assert.ok(label && label.kind === "drawText");
    if (!indicator || indicator.kind !== "drawText" || !label || label.kind !== "drawText") return;
    assert.deepEqual(indicator.style?.fg, dsTheme.colors["fg.secondary"]);
    assert.deepEqual(label.style?.fg, dsTheme.colors["fg.primary"]);
  });

  test("renders checked indicator with selected recipe style", () => {
    const uncheckedOps = renderOps(ui.checkbox({ id: "u", checked: false, label: "U" }), {
      viewport: { cols: 30, rows: 2 },
      theme: dsTheme,
    });
    const checkedOps = renderOps(ui.checkbox({ id: "c", checked: true, label: "C" }), {
      viewport: { cols: 30, rows: 2 },
      theme: dsTheme,
    });
    const unchecked = findTextOp(uncheckedOps, "[ ]");
    const checked = findTextOp(checkedOps, "[x]");
    assert.ok(unchecked && unchecked.kind === "drawText");
    assert.ok(checked && checked.kind === "drawText");
    if (!unchecked || unchecked.kind !== "drawText" || !checked || checked.kind !== "drawText")
      return;
    assert.notDeepEqual(checked.style?.fg, unchecked.style?.fg);
    assert.deepEqual(checked.style?.fg, dsTheme.colors["accent.primary"]);
  });

  test("uses disabled recipe colors", () => {
    const ops = renderOps(
      ui.checkbox({ id: "d", checked: true, label: "Disabled", disabled: true }),
      {
        viewport: { cols: 40, rows: 2 },
        theme: dsTheme,
      },
    );
    const indicator = findTextOp(ops, "[x]");
    const label = findTextOp(ops, "Disabled");
    assert.ok(indicator && indicator.kind === "drawText");
    assert.ok(label && label.kind === "drawText");
    if (!indicator || indicator.kind !== "drawText" || !label || label.kind !== "drawText") return;
    assert.deepEqual(indicator.style?.fg, dsTheme.colors["disabled.fg"]);
    assert.deepEqual(label.style?.fg, dsTheme.colors["disabled.fg"]);
  });

  test("uses focus recipe styling when focused", () => {
    const ops = renderOps(ui.checkbox({ id: "f", checked: false, label: "Focus me" }), {
      viewport: { cols: 40, rows: 2 },
      theme: dsTheme,
      focusedId: "f",
    });
    const indicator = findTextOp(ops, "[ ]");
    const label = findTextOp(ops, "Focus me");
    assert.ok(indicator && indicator.kind === "drawText");
    assert.ok(label && label.kind === "drawText");
    if (!indicator || indicator.kind !== "drawText" || !label || label.kind !== "drawText") return;
    assert.equal(indicator.style?.bold, true);
    assert.equal(label.style?.bold, true);
  });
});
