import { assert, describe, test } from "@rezi-ui/testkit";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { selectRecipe } from "../../ui/recipes.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = coerceToLegacyTheme(darkTheme);
function firstDrawText(
  ops: readonly DrawOp[],
  match: (text: string) => boolean,
): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && match(op.text));
}

describe("slider/badge/tag recipe rendering", () => {
  test("slider uses recipe track/filled/thumb colors with semantic-token themes", () => {
    const ops = renderOps(ui.slider({ id: "s1", value: 50, min: 0, max: 100, width: 10 }), {
      viewport: { cols: 40, rows: 3 },
      theme: dsTheme,
    });

    const filled = firstDrawText(ops, (text) => text.includes("█"));
    const thumb = firstDrawText(ops, (text) => text.includes("●"));
    const track = firstDrawText(ops, (text) => text.includes("░"));
    assert.ok(filled && filled.kind === "drawText");
    assert.ok(thumb && thumb.kind === "drawText");
    assert.ok(track && track.kind === "drawText");
    if (
      !filled ||
      filled.kind !== "drawText" ||
      !thumb ||
      thumb.kind !== "drawText" ||
      !track ||
      track.kind !== "drawText"
    )
      return;

    assert.deepEqual(filled.style?.fg, dsTheme.colors["accent.primary"]);
    assert.deepEqual(thumb.style?.fg, dsTheme.colors["accent.primary"]);
    assert.deepEqual(track.style?.fg, dsTheme.colors["border.subtle"]);
  });

  test("badge uses recipe colors with semantic-token themes", () => {
    const ops = renderOps(ui.badge("Info", { variant: "info" }), {
      viewport: { cols: 24, rows: 2 },
      theme: dsTheme,
    });
    const text = firstDrawText(ops, (s) => s.includes("Info"));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.ok(text.text.includes("( Info )"));
    assert.deepEqual(text.style?.fg, dsTheme.colors.info);
    assert.notEqual(text.style?.bg, dsTheme.colors.info);
    assert.equal(text.style?.bold, true);
  });

  test("tag uses recipe colors with semantic-token themes", () => {
    const ops = renderOps(ui.tag("Release", { variant: "success" }), {
      viewport: { cols: 24, rows: 2 },
      theme: dsTheme,
    });
    const text = firstDrawText(ops, (s) => s.includes("Release"));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.ok(text.text.includes("( Release )"));
    assert.deepEqual(text.style?.fg, dsTheme.colors.success);
    assert.notEqual(text.style?.bg, dsTheme.colors.success);
    assert.equal(text.style?.bold, true);
  });
});

describe("select recipe error rendering", () => {
  test("select error state recipe returns error border color", () => {
    const result = selectRecipe(darkTheme.colors, { state: "error" });
    assert.deepEqual(result.borderStyle.fg, darkTheme.colors.error);
  });
});
