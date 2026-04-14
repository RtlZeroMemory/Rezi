import { assert, describe, test } from "@rezi-ui/testkit";
import { createTestRenderer } from "../../testing/index.js";
import { ui } from "../ui.js";

describe("indicator widgets - visible behavior", () => {
  test("spinner advances its visible frame while keeping the label", () => {
    const renderer = createTestRenderer({ viewport: { cols: 24, rows: 4 } });
    const tick0 = renderer.render(ui.spinner({ variant: "line", label: "Loading" }), { tick: 0 }).toText();
    const tick125 = renderer
      .render(ui.spinner({ variant: "line", label: "Loading" }), { tick: 125 })
      .toText();

    assert.equal(tick0.includes("Loading"), true);
    assert.equal(tick125.includes("Loading"), true);
    assert.notEqual(tick0, tick125);
  });

  test("progress renders minimal and block variants with visible percentage output", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 4 } });
    const minimal = renderer
      .render(ui.progress(0.42, { label: "Build", showPercent: true, variant: "minimal" }))
      .toText();
    const blocks = renderer
      .render(ui.progress(0.42, { label: "Build", showPercent: true, variant: "blocks", width: 10 }))
      .toText();

    assert.equal(minimal.includes("Build"), true);
    assert.equal(minimal.includes("42%"), true);
    assert.equal(minimal.includes("["), false);
    assert.equal(blocks.includes("Build"), true);
    assert.equal(blocks.includes("42%"), true);
    assert.equal(blocks.includes("["), true);
  });

  test("gauge renders linear and compact variants with distinct visible meter styles", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 4 } });
    const linear = renderer.render(ui.gauge(0.62, { label: "CPU" })).toText();
    const compact = renderer.render(ui.gauge(0.62, { label: "CPU", variant: "compact" })).toText();

    assert.equal(linear.includes("CPU"), true);
    assert.equal(linear.includes("62%"), true);
    assert.equal(linear.includes("["), true);
    assert.equal(compact.includes("CPU"), true);
    assert.equal(compact.includes("62%"), true);
    assert.equal(compact.includes("["), false);
  });

  test("skeleton renders circle and rect placeholders as distinct visible shapes", () => {
    const renderer = createTestRenderer({ viewport: { cols: 20, rows: 4 } });
    const circle = renderer.render(ui.skeleton(6, { variant: "circle", height: 3 })).toText();
    const rect = renderer.render(ui.skeleton(6, { variant: "rect", height: 2 })).toText();

    assert.equal(circle.includes("(░░)"), true);
    assert.equal(rect.includes("░░░░░░"), true);
    assert.equal(rect.includes("▒▒▒▒▒▒"), true);
  });

  test("status hides its label when showLabel is false", () => {
    const renderer = createTestRenderer({ viewport: { cols: 20, rows: 4 } });
    const withLabel = renderer.render(ui.status("busy", { label: "Ada" })).toText();
    const withoutLabel = renderer.render(ui.status("busy", { label: "Ada", showLabel: false })).toText();

    assert.equal(withLabel.includes("Ada"), true);
    assert.equal(withoutLabel.trim(), "●");
  });

  test("badge, tag, and richText render their visible text contracts", () => {
    const renderer = createTestRenderer({ viewport: { cols: 30, rows: 6 } });
    const badge = renderer.render(ui.badge("New", { variant: "info" })).toText();
    const tag = renderer.render(ui.tag("filter:open", { removable: true })).toText();
    const richText = renderer
      .render(
        ui.richText([
          { text: "Error: ", style: { bold: true } },
          { text: "File missing" },
        ]),
      )
      .toText();

    assert.equal(badge.trim(), "( New )");
    assert.equal(tag.includes("filter:open"), true);
    assert.equal(tag.includes("×"), true);
    assert.equal(richText.trim(), "Error: File missing");
  });
});
