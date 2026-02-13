import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../ui.js";

describe("container widgets - VNode construction", () => {
  test("box, row, and column filter falsy children", () => {
    const child = ui.text("A");

    const box = ui.box({}, [child, null, undefined, false]);
    assert.equal(box.kind, "box");
    assert.equal(box.children.length, 1);
    assert.equal(box.children[0]?.kind, "text");

    const row = ui.row({ gap: 1 }, [child, null, false]);
    assert.equal(row.kind, "row");
    assert.equal(row.children.length, 1);

    const column = ui.column({ gap: 2 }, [child, undefined, false]);
    assert.equal(column.kind, "column");
    assert.equal(column.children.length, 1);
    assert.deepEqual(column.props, { gap: 2 });
  });

  test("focusZone and focusTrap create expected VNodes", () => {
    const node = ui.text("inside");

    const zone = ui.focusZone({ id: "zone-1", navigation: "grid", columns: 2 }, [node]);
    assert.equal(zone.kind, "focusZone");
    assert.deepEqual(zone.props, { id: "zone-1", navigation: "grid", columns: 2 });
    assert.equal(zone.children.length, 1);

    const trap = ui.focusTrap({ id: "trap-1", active: true, initialFocus: "btn-1" }, [node]);
    assert.equal(trap.kind, "focusTrap");
    assert.deepEqual(trap.props, { id: "trap-1", active: true, initialFocus: "btn-1" });
    assert.equal(trap.children.length, 1);
  });

  test("layers, modal, and layer create expected VNodes", () => {
    const modal = ui.modal({
      id: "confirm",
      title: "Confirm",
      content: ui.text("Proceed?"),
      actions: [ui.button("ok", "OK")],
      closeOnEscape: true,
      closeOnBackdrop: true,
    });
    assert.equal(modal.kind, "modal");
    assert.equal(modal.props.id, "confirm");
    assert.equal(modal.props.title, "Confirm");
    assert.equal(modal.props.actions?.length, 1);

    const layer = ui.layer({
      id: "layer-1",
      zIndex: 10,
      modal: true,
      content: ui.text("overlay"),
      closeOnEscape: false,
    });
    assert.equal(layer.kind, "layer");
    assert.deepEqual(layer.props, {
      id: "layer-1",
      zIndex: 10,
      modal: true,
      content: ui.text("overlay"),
      closeOnEscape: false,
    });

    const layers = ui.layers([ui.text("base"), null, modal, false, layer]);
    assert.equal(layers.kind, "layers");
    assert.equal(layers.children.length, 3);
  });

  test("modal and layer preserve frameStyle and extended modal backdrop config", () => {
    const modal = ui.modal({
      id: "styled-modal",
      title: "Styled",
      content: ui.text("Body"),
      frameStyle: {
        background: { r: 20, g: 22, b: 24 },
        foreground: { r: 220, g: 222, b: 224 },
        border: { r: 120, g: 122, b: 124 },
      },
      backdrop: {
        variant: "dim",
        pattern: "#",
        foreground: { r: 60, g: 70, b: 80 },
        background: { r: 4, g: 5, b: 6 },
      },
    });
    assert.equal(modal.kind, "modal");
    assert.deepEqual(modal.props.backdrop, {
      variant: "dim",
      pattern: "#",
      foreground: { r: 60, g: 70, b: 80 },
      background: { r: 4, g: 5, b: 6 },
    });
    assert.deepEqual(modal.props.frameStyle, {
      background: { r: 20, g: 22, b: 24 },
      foreground: { r: 220, g: 222, b: 224 },
      border: { r: 120, g: 122, b: 124 },
    });

    const layer = ui.layer({
      id: "styled-layer",
      content: ui.text("overlay"),
      frameStyle: {
        background: { r: 10, g: 11, b: 12 },
        foreground: { r: 230, g: 231, b: 232 },
        border: { r: 90, g: 91, b: 92 },
      },
    });
    assert.equal(layer.kind, "layer");
    assert.deepEqual(layer.props.frameStyle, {
      background: { r: 10, g: 11, b: 12 },
      foreground: { r: 230, g: 231, b: 232 },
      border: { r: 90, g: 91, b: 92 },
    });
  });

  test("splitPane, panelGroup, and resizablePanel create expected VNodes", () => {
    const left = ui.text("Left");
    const right = ui.text("Right");

    const split = ui.splitPane(
      {
        id: "split",
        direction: "horizontal",
        sizes: [50, 50],
        onResize: () => undefined,
        minSizes: [20, 20],
      },
      [left, right],
    );
    assert.equal(split.kind, "splitPane");
    assert.equal(split.children.length, 2);
    assert.equal(split.props.id, "split");

    const group = ui.panelGroup(
      {
        id: "group",
        direction: "vertical",
      },
      [ui.resizablePanel({ defaultSize: 30 }, [left]), ui.resizablePanel({}, [right])],
    );
    assert.equal(group.kind, "panelGroup");
    assert.equal(group.children.length, 2);
    assert.deepEqual(group.props, {
      id: "group",
      direction: "vertical",
    });

    const panel = ui.resizablePanel({ minSize: 10, maxSize: 70, collapsible: true }, [left]);
    assert.equal(panel.kind, "resizablePanel");
    assert.equal(panel.children.length, 1);
    assert.deepEqual(panel.props, { minSize: 10, maxSize: 70, collapsible: true });
  });

  test("resizablePanel defaults to empty props and children", () => {
    const panel = ui.resizablePanel();
    assert.equal(panel.kind, "resizablePanel");
    assert.deepEqual(panel.props, {});
    assert.deepEqual(panel.children, []);
  });
});
