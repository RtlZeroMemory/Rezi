import * as assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTestRenderer } from "../../testing/renderer.js";
import { coerceToLegacyTheme } from "../../theme/interop.js";
import { darkTheme } from "../../theme/presets.js";
import type { VNode } from "../../widgets/types.js";
import { ui } from "../../widgets/ui.js";

const theme = coerceToLegacyTheme(darkTheme);
const viewport = { cols: 40, rows: 6 };

function renderText(vnode: VNode): string {
  const renderer = createTestRenderer({ viewport, theme });
  return renderer.render(vnode).toText();
}

describe("design system rendering", () => {
  it("uses recipe styling for button even when a manual style override is provided", () => {
    const renderer = createTestRenderer({ viewport, theme });
    const result = renderer.render(
      ui.button({
        id: "btn",
        label: "Save",
        style: { fg: theme.colors.fg },
      }),
    );
    const node = result.findById("btn");
    assert.ok(node, "button should render");
    assert.ok(
      result.ops.some(
        (op) =>
          op.kind === "fillRect" &&
          op.x === node.rect.x &&
          op.y === node.rect.y &&
          op.w === node.rect.w &&
          op.h === node.rect.h,
      ),
      "button should still fill recipe background",
    );
  });

  it("does not truncate short button labels due to recipe padding", () => {
    assert.ok(renderText(ui.button("b-ok", "OK")).includes("OK"));
    assert.ok(renderText(ui.button("b-save", "Save")).includes("Save"));
  });

  it("honors `px` overrides when button recipe styling is active", () => {
    const renderer = createTestRenderer({ viewport: { cols: 20, rows: 3 }, theme });
    const result = renderer.render(
      ui.column({ width: 20, gap: 0, items: "stretch" }, [
        ui.button({ id: "b-recipe", label: "Save", dsVariant: "soft" }),
        ui.button({ id: "b-recipe-px0", label: "Save", dsVariant: "soft", px: 0 }),
      ]),
    );
    const [line1, line2] = result.toText().split("\n");
    assert.match(line1 ?? "", /^ {2}Save/);
    assert.match(line2 ?? "", /^Save/);
  });

  it("renders input with recipe border/background when stretched", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 5 }, theme });
    const result = renderer.render(
      ui.row({ height: 3, items: "stretch" }, [ui.input("name", "", { placeholder: "Name" })]),
    );
    const input = result.findById("name");
    assert.ok(input, "input should render");
    const text = result.toText();
    assert.ok(text.includes("┌"), "input should render border");
  });

  it("uses recipe styling for input even when a manual style override is provided", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 5 }, theme });
    const result = renderer.render(
      ui.row({ height: 3, items: "stretch" }, [
        ui.input({ id: "name", value: "", placeholder: "Name", style: { fg: theme.colors.fg } }),
      ]),
    );
    const input = result.findById("name");
    assert.ok(input, "input should render");
    assert.ok(result.toText().includes("┌"), "input should render border even with style override");
  });

  it("does not overwrite borders when input height is too small for framed rendering", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 4 }, theme });
    const result = renderer.render(
      ui.row({ height: 2, items: "stretch" }, [ui.input("i", "Hello")]),
    );
    const text = result.toText();
    assert.ok(text.includes("Hello"), "input should render value text");
    assert.ok(!text.includes("┌") && !text.includes("└"), "input should not draw a broken border");
  });

  it("renders checkbox via recipe path", () => {
    const renderer = createTestRenderer({ viewport, theme });
    const result = renderer.render(ui.checkbox({ id: "cb", checked: true, label: "Option" }));
    assert.ok(result.findById("cb"), "checkbox should render");
    assert.ok(result.toText().includes("[x]"), "checkbox indicator should render");
  });

  it("renders select trigger with recipe padding and caret", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 5 }, theme });
    const result = renderer.render(
      ui.row({ height: 3, items: "stretch" }, [
        ui.select({
          id: "sel",
          value: "a",
          options: [{ value: "a", label: "Alpha" }],
        }),
      ]),
    );
    assert.ok(result.findById("sel"), "select should render");
    const text = result.toText();
    assert.ok(text.includes("▼"), "select should render indicator");
    assert.ok(text.includes("Alpha"), "select should render selected label");
  });

  it("renders progress using recipe path", () => {
    const renderer = createTestRenderer({ viewport, theme });
    const result = renderer.render(ui.progress(0.5, { dsTone: "warning", showPercent: true }));
    assert.ok(result.toText().includes("50%"), "progress should render percent text");
  });

  it("renders callout with recipe styling", () => {
    const renderer = createTestRenderer({ viewport: { cols: 50, rows: 6 }, theme });
    const result = renderer.render(
      ui.callout("Message", { variant: "warning", title: "Heads up" }),
    );
    assert.ok(result.toText().includes("Heads up"));
    assert.ok(result.toText().includes("Message"));
  });

  it("maps button intent primary to solid primary styling props", () => {
    const vnode = ui.button({ id: "b", label: "Save", intent: "primary" });
    if (vnode.kind !== "button") throw new Error("expected button vnode");
    assert.equal(vnode.props.dsVariant, "solid");
    assert.equal(vnode.props.dsTone, "primary");
  });

  it("maps button intent secondary to soft default styling props", () => {
    const vnode = ui.button({ id: "b2", label: "Cancel", intent: "secondary" });
    if (vnode.kind !== "button") throw new Error("expected button vnode");
    assert.equal(vnode.props.dsVariant, "soft");
    assert.equal(vnode.props.dsTone, "default");
  });

  it("applies box preset defaults", () => {
    const vnode = ui.box({ preset: "card" }, [ui.text("content")]);
    if (vnode.kind !== "box") throw new Error("expected box vnode");
    assert.equal(vnode.props.border, "rounded");
  });

  it("keeps explicit dsVariant over intent mapping", () => {
    const vnode = ui.button({
      id: "b3",
      label: "Custom",
      intent: "primary",
      dsVariant: "ghost",
    });
    if (vnode.kind !== "button") throw new Error("expected button vnode");
    assert.equal(vnode.props.dsVariant, "ghost");
  });
});
