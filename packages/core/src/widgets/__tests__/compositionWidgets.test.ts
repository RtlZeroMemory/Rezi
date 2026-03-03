import { assert, describe, test } from "@rezi-ui/testkit";
import { visibilityConstraints, widthConstraints } from "../../constraints/helpers.js";
import { createTestRenderer } from "../../testing/renderer.js";
import { ui } from "../ui.js";

describe("composition widgets", () => {
  test("each composition helper returns a renderable vnode", () => {
    const nodes = [
      ui.appShell({ body: ui.text("body") }),
      ui.card("Card", [ui.text("Body")]),
      ui.toolbar([ui.button({ id: "a", label: "Action" })]),
      ui.statusBar({ left: [ui.text("left")], right: [ui.text("right")] }),
      ui.header({ title: "Header", actions: [ui.button({ id: "h-act", label: "Run" })] }),
      ui.sidebar({
        id: "nav",
        items: [
          { id: "overview", label: "Overview" },
          { id: "settings", label: "Settings" },
        ],
        selected: "overview",
      }),
      ui.masterDetail({
        master: ui.text("master"),
        detail: ui.text("detail"),
      }),
    ];

    for (const node of nodes) {
      assert.equal(typeof node.kind, "string");
    }
  });

  test("ui.appShell renders without error", () => {
    const renderer = createTestRenderer({ viewport: { cols: 80, rows: 20 } });
    const result = renderer.render(ui.appShell({ body: ui.text("content") }));
    assert.ok(result.toText().includes("content"));
  });

  test("ui.appShell forwards layout constraints and sidebar constraint widths", () => {
    const shellDisplay = visibilityConstraints.viewportWidthAtLeast(100);
    const shellWidth = widthConstraints.percentOfParent(0.9);
    const railWidth = widthConstraints.clampedPercentOfParent({ ratio: 0.25, min: 18, max: 30 });

    const node = ui.appShell({
      body: ui.text("content"),
      display: shellDisplay,
      width: shellWidth,
      sidebar: {
        content: ui.text("nav"),
        width: railWidth,
      },
    });

    assert.equal(node.kind, "column");
    if (node.kind !== "column") return;
    assert.equal(node.props.display, shellDisplay);
    assert.equal(node.props.width, shellWidth);

    assert.equal(node.children.length, 1);
    const bodyFrame = node.children[0];
    assert.equal(bodyFrame?.kind, "box");
    if (bodyFrame?.kind !== "box") return;

    const shellRow = bodyFrame.children[0];
    assert.equal(shellRow?.kind, "row");
    if (shellRow?.kind !== "row") return;

    const sidebarBox = shellRow.children[0];
    assert.equal(sidebarBox?.kind, "box");
    if (sidebarBox?.kind !== "box") return;
    assert.equal(sidebarBox.props.width, railWidth);
  });

  test("ui.card title overload includes title and body", () => {
    const renderer = createTestRenderer({ viewport: { cols: 60, rows: 10 } });
    const result = renderer.render(ui.card("Title", [ui.text("body")]));
    const text = result.toText();
    assert.ok(text.includes("Title"));
    assert.ok(text.includes("body"));
  });

  test("ui.statusBar renders left and right content", () => {
    const renderer = createTestRenderer({ viewport: { cols: 60, rows: 5 } });
    const result = renderer.render(
      ui.statusBar({
        left: [ui.text("left")],
        right: [ui.text("right")],
      }),
    );
    const text = result.toText();
    assert.ok(text.includes("left"));
    assert.ok(text.includes("right"));
  });
});
