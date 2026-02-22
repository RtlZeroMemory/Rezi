import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestRenderer } from "../../testing/renderer.js";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import { ui } from "../../widgets/ui.js";

const theme = coerceToLegacyTheme(darkTheme);
const viewport = { cols: 40, rows: 5 };

function renderButtonText(vnode: ReturnType<typeof ui.button>): string {
  const renderer = createTestRenderer({ viewport, theme });
  return renderer.render(vnode).toText();
}

describe("design system rendering", () => {
  it("renders DS button output differently from legacy button output", () => {
    const dsText = renderButtonText(
      ui.button({
        id: "btn-ds",
        label: "Compare",
        dsVariant: "solid",
        dsTone: "primary",
        dsSize: "lg",
      }),
    );
    const legacyText = renderButtonText(
      ui.button({
        id: "btn-legacy",
        label: "Compare",
        px: 0,
      }),
    );
    assert.notEqual(dsText, legacyText);
  });

  it("renders a button with dsVariant=solid", () => {
    const renderer = createTestRenderer({
      viewport,
      theme,
    });
    const result = renderer.render(
      ui.button({
        id: "btn",
        label: "Click Me",
        dsVariant: "solid",
        dsTone: "primary",
        dsSize: "md",
      }),
    );
    const btn = result.findById("btn");
    assert.ok(btn, "button should be found by id");
    const text = result.toText();
    // Label may be truncated depending on layout width, but should contain "Click"
    assert.ok(text.includes("Click"), "button label should be visible (possibly truncated)");
  });

  it("renders a button with dsVariant=outline", () => {
    const renderer = createTestRenderer({
      viewport,
      theme,
    });
    const result = renderer.render(
      ui.button({
        id: "btn-outline",
        label: "Outline",
        dsVariant: "outline",
        dsTone: "danger",
      }),
    );
    const btn = result.findById("btn-outline");
    assert.ok(btn, "outline button should be found");
  });

  it("renders a button with dsVariant=ghost", () => {
    const renderer = createTestRenderer({
      viewport,
      theme,
    });
    const result = renderer.render(
      ui.button({
        id: "btn-ghost",
        label: "Ghost",
        dsVariant: "ghost",
      }),
    );
    const btn = result.findById("btn-ghost");
    assert.ok(btn, "ghost button should be found");
  });

  it("renders buttons without ds props using legacy path", () => {
    const renderer = createTestRenderer({
      viewport,
      theme,
    });
    const result = renderer.render(
      ui.button({
        id: "btn-legacy",
        label: "Legacy",
        px: 2,
      }),
    );
    const btn = result.findById("btn-legacy");
    assert.ok(btn, "legacy button should be found");
    const text = result.toText();
    assert.ok(text.includes("Legacy"), "legacy button label should be visible");
  });

  it("falls back to legacy rendering when dsVariant is invalid at runtime", () => {
    const legacyText = renderButtonText(
      ui.button({
        id: "legacy-safe",
        label: "Legacy",
      }),
    );

    const invalidDsText = renderButtonText(
      ui.button({
        id: "invalid-ds",
        label: "Legacy",
        // Simulate JS/untyped input; renderer must guard and avoid crashing.
        dsVariant: "not-a-variant" as unknown as "solid",
      }),
    );

    assert.equal(invalidDsText, legacyText);
  });

  it("applies DS outline border styling when button is stretched to multiple rows", () => {
    const renderer = createTestRenderer({
      viewport: { cols: 40, rows: 6 },
      theme,
    });
    const result = renderer.render(
      ui.row({ height: 3, align: "stretch" }, [
        ui.button({
          id: "outline-stretch",
          label: "Outline",
          dsVariant: "outline",
          dsTone: "primary",
        }),
      ]),
    );
    const text = result.toText();
    assert.ok(text.includes("┌"), "outline button should draw a top border");
    assert.ok(text.includes("└"), "outline button should draw a bottom border");
  });

  it("renders a column of DS buttons", () => {
    const renderer = createTestRenderer({
      viewport: { cols: 40, rows: 10 },
      theme,
    });
    const result = renderer.render(
      ui.column({ gap: 1 }, [
        ui.button({ id: "solid", label: "Solid", dsVariant: "solid", dsTone: "primary" }),
        ui.button({ id: "soft", label: "Soft", dsVariant: "soft", dsTone: "default" }),
        ui.button({ id: "outline", label: "Outline", dsVariant: "outline", dsTone: "danger" }),
        ui.button({ id: "ghost", label: "Ghost", dsVariant: "ghost" }),
      ]),
    );

    assert.ok(result.findById("solid"));
    assert.ok(result.findById("soft"));
    assert.ok(result.findById("outline"));
    assert.ok(result.findById("ghost"));
  });
});
