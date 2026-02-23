import { assert, describe, test } from "@rezi-ui/testkit";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = coerceToLegacyTheme(darkTheme);

function firstDrawText(
  ops: readonly DrawOp[],
  match: (text: string) => boolean,
): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && match(op.text));
}

describe("input recipe rendering", () => {
  test("uses recipe colors with semantic-token themes", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [ui.input("name", "", { placeholder: "Name" })]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const fill = ops.find((op) => op.kind === "fillRect");
    assert.ok(fill !== undefined, "input should fill recipe background");
    if (!fill || fill.kind !== "fillRect") return;
    assert.deepEqual(fill.style?.bg, dsTheme.colors["bg.elevated"]);

    const border = firstDrawText(ops, (text) => text.includes("┌"));
    assert.ok(border !== undefined, "input should render recipe border");
    if (!border || border.kind !== "drawText") return;
    assert.deepEqual(border.style?.fg, dsTheme.colors["border.default"]);
  });

  test("keeps legacy fallback path for non-semantic themes", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [ui.input("legacy", "", { placeholder: "Name" })]),
      { viewport: { cols: 40, rows: 5 }, theme: defaultTheme },
    );
    assert.equal(
      ops.some((op) => op.kind === "fillRect"),
      false,
      "legacy input should not fill recipe background",
    );
    assert.equal(
      ops.some((op) => op.kind === "drawText" && /[┌┐└┘]/.test(op.text)),
      false,
      "legacy input should not render recipe border",
    );
  });

  test("textarea renders placeholder when value is empty", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.textarea({ id: "ta", value: "", placeholder: "Enter text..." }),
      ]),
      { viewport: { cols: 40, rows: 6 }, theme: defaultTheme },
    );
    const text = firstDrawText(ops, (s) => s.includes("Enter text..."));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.equal(text.text.includes("Enter text..."), true);
  });

  test("increases left padding when dsSize is lg", () => {
    const mdOps = renderOps(
      ui.column({ width: 20, items: "stretch" }, [ui.input("i-md", "", { placeholder: "Name" })]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const lgOps = renderOps(
      ui.column({ width: 20, items: "stretch" }, [
        ui.input({ id: "i-lg", value: "", placeholder: "Name", dsSize: "lg" }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const mdText = firstDrawText(mdOps, (text) => text.includes("Name"));
    const lgText = firstDrawText(lgOps, (text) => text.includes("Name"));
    assert.ok(mdText && mdText.kind === "drawText");
    assert.ok(lgText && lgText.kind === "drawText");
    if (!mdText || mdText.kind !== "drawText" || !lgText || lgText.kind !== "drawText") return;
    assert.ok(lgText.x > mdText.x, "lg input should indent text more than md");
  });

  test("uses disabled recipe colors", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.input({ id: "disabled", value: "hello", disabled: true }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const fill = ops.find((op) => op.kind === "fillRect");
    assert.ok(fill !== undefined);
    if (!fill || fill.kind !== "fillRect") return;
    assert.deepEqual(fill.style?.bg, dsTheme.colors["disabled.bg"]);

    const text = firstDrawText(ops, (s) => s.includes("hello"));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.deepEqual(text.style?.fg, dsTheme.colors["disabled.fg"]);
  });

  test("uses focused recipe border color", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [ui.input("focus-input", "hello")]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme, focusedId: "focus-input" },
    );
    const focusBorder = firstDrawText(ops, (text) => text.includes("┏"));
    assert.ok(
      focusBorder && focusBorder.kind === "drawText",
      "focused input should use heavy border",
    );
    if (!focusBorder || focusBorder.kind !== "drawText") return;
    assert.deepEqual(focusBorder.style?.fg, dsTheme.colors["accent.primary"]);
    assert.equal(focusBorder.style?.bold, true);
  });
});
