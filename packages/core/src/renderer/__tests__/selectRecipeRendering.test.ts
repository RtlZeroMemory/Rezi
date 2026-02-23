import { assert, describe, test } from "@rezi-ui/testkit";
import { defaultTheme } from "../../theme/defaultTheme.js";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { ui } from "../../widgets/ui.js";
import { type DrawOp, renderOps } from "./recipeRendering.test-utils.js";

const dsTheme = coerceToLegacyTheme(darkTheme);
const options = [{ value: "a", label: "Alpha" }] as const;

function firstDrawText(
  ops: readonly DrawOp[],
  match: (text: string) => boolean,
): DrawOp | undefined {
  return ops.find((op) => op.kind === "drawText" && match(op.text));
}

describe("select recipe rendering", () => {
  test("uses recipe colors in default state with semantic-token themes", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [ui.select({ id: "sel", value: "a", options })]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const fill = ops.find((op) => op.kind === "fillRect");
    assert.ok(fill !== undefined, "select should fill recipe background");
    if (!fill || fill.kind !== "fillRect") return;
    assert.deepEqual(fill.style?.bg, dsTheme.colors["bg.elevated"]);

    const text = firstDrawText(ops, (s) => s.includes("Alpha"));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.deepEqual(text.style?.fg, dsTheme.colors["fg.primary"]);
  });

  test("uses focused recipe text styling when focused", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.select({ id: "sel-focus", value: "a", options }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme, focusedId: "sel-focus" },
    );
    const text = firstDrawText(ops, (s) => s.includes("Alpha"));
    assert.ok(text && text.kind === "drawText", "focused select should render selected text");
    if (!text || text.kind !== "drawText") return;
    assert.equal(text.style?.bold, true);
    assert.equal(text.style?.underline, true);
  });

  test("uses disabled recipe text colors", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [
        ui.select({ id: "sel-disabled", value: "a", options, disabled: true }),
      ]),
      { viewport: { cols: 40, rows: 5 }, theme: dsTheme },
    );
    const text = firstDrawText(ops, (s) => s.includes("Alpha"));
    assert.ok(text && text.kind === "drawText");
    if (!text || text.kind !== "drawText") return;
    assert.deepEqual(text.style?.fg, dsTheme.colors["disabled.fg"]);
  });

  test("keeps legacy fallback when semantic tokens are absent", () => {
    const ops = renderOps(
      ui.row({ height: 3, items: "stretch" }, [ui.select({ id: "legacy", value: "a", options })]),
      { viewport: { cols: 40, rows: 5 }, theme: defaultTheme },
    );
    assert.equal(
      ops.some((op) => op.kind === "fillRect"),
      false,
      "legacy select should not fill recipe background",
    );
    assert.equal(
      ops.some((op) => op.kind === "drawText" && /[┌┐└┘]/.test(op.text)),
      false,
      "legacy select should not draw recipe border",
    );
    assert.equal(
      ops.some(
        (op) => op.kind === "drawText" && op.text.includes("Alpha") && op.text.includes("▼"),
      ),
      true,
      "legacy select should render inline caret text",
    );
  });
});
