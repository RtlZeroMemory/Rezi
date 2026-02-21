import { assert, describe, matchesSnapshot, test } from "@rezi-ui/testkit";
import { ui } from "../../widgets/ui.js";
import { createTestRenderer } from "../renderer.js";

describe("createTestRenderer", () => {
  test("renders widgets with semantic query helpers", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 8 } });

    const result = renderer.render(
      ui.column({}, [ui.text("Hello"), ui.button({ id: "submit", label: "Submit" })]),
    );

    const textNode = result.findText("Hello");
    assert.notEqual(textNode, null);
    assert.equal(textNode?.kind, "text");

    const submitButton = result.findById("submit");
    assert.notEqual(submitButton, null);
    assert.equal(submitButton?.kind, "button");
    assert.equal(submitButton?.props.label, "Submit");

    const buttons = result.findAll("button");
    assert.equal(buttons.length, 1);

    const screen = result.toText();
    assert.equal(screen.includes("Hello"), true);
    assert.equal(screen.includes("Submit"), true);
  });

  test("supports repeated renders without manual commit/layout plumbing", () => {
    const renderer = createTestRenderer({ viewport: { cols: 24, rows: 6 } });

    const first = renderer.render(ui.text("Count: 1"));
    const second = renderer.render(ui.text("Count: 2"));

    assert.equal(first.toText().includes("Count: 1"), true);
    assert.equal(second.toText().includes("Count: 2"), true);
  });

  test("render focusedId:null overrides renderer default focus", () => {
    const renderer = createTestRenderer({
      viewport: { cols: 24, rows: 6 },
      focusedId: "submit",
    });

    const focused = renderer.render(ui.button({ id: "submit", label: "Submit" }));
    assert.equal(focused.focusedId, "submit");

    const cleared = renderer.render(ui.button({ id: "submit", label: "Submit" }), {
      focusedId: null,
    });
    assert.equal(cleared.focusedId, null);
  });

  test("toText snapshots frame output", () => {
    const renderer = createTestRenderer({ viewport: { cols: 20, rows: 6 } });
    const frame = renderer.render(
      ui.column({}, [ui.text("Snapshot"), ui.button({ id: "ok", label: "OK" })]),
    );

    matchesSnapshot(frame.toText(), "test-renderer-basic");
  });
});
