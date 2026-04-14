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

  test("ui.appShell renders header, sidebar, body, and footer in distinct visible regions", () => {
    const renderer = createTestRenderer({ viewport: { cols: 80, rows: 20 } });
    const result = renderer.render(
      ui.appShell({
        header: ui.text("Header"),
        sidebar: { content: ui.text("Nav"), width: 18 },
        body: ui.text("Body"),
        footer: ui.text("Footer"),
      }),
    );

    const header = result.findText("Header");
    const nav = result.findText("Nav");
    const body = result.findText("Body");
    const footer = result.findText("Footer");

    assert.ok(header);
    assert.ok(nav);
    assert.ok(body);
    assert.ok(footer);
    if (!header || !nav || !body || !footer) return;

    assert.equal(header.rect.y < body.rect.y, true);
    assert.equal(nav.rect.x < body.rect.x, true);
    assert.equal(footer.rect.y > body.rect.y, true);
  });

  test("ui.appShell sidebar shifts the body region to the right", () => {
    const renderer = createTestRenderer({ viewport: { cols: 80, rows: 20 } });
    const withSidebar = renderer.render(
      ui.appShell({
        sidebar: { content: ui.text("Nav"), width: 18 },
        body: ui.text("Body"),
      }),
    );
    const withoutSidebar = renderer.render(ui.appShell({ body: ui.text("Body") }));

    const withSidebarBody = withSidebar.findText("Body");
    const withoutSidebarBody = withoutSidebar.findText("Body");

    assert.ok(withSidebarBody);
    assert.ok(withoutSidebarBody);
    if (!withSidebarBody || !withoutSidebarBody) return;

    assert.equal(withSidebarBody.rect.x > withoutSidebarBody.rect.x, true);
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

  test("ui.appShell respects a fixed numeric sidebar width in layout", () => {
    const renderer = createTestRenderer({ viewport: { cols: 80, rows: 20 } });
    const result = renderer.render(
      ui.appShell({
        sidebar: { content: ui.text("Nav"), width: 18 },
        body: ui.text("Body"),
      }),
    );

    const sidebarBox = result.nodes.find(
      (node) => node.kind === "box" && node.props["width"] === 18,
    );
    assert.ok(sidebarBox);
    if (!sidebarBox) return;

    assert.equal(sidebarBox.rect.w, 18);
  });

  test("constraint helpers format exponent inputs as trimmed decimal literals", () => {
    const width = widthConstraints.clampedPercentOfParent({
      ratio: 1e-7,
      min: 2.5e-7,
      max: 1e-6,
    });

    assert.equal(width.source, "clamp(0.00000025, parent.w * 0.0000001, 0.000001)");
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
