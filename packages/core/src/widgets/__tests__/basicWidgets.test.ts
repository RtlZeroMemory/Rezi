import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../ui.js";

describe("ui.basic widgets - VNode construction", () => {
  test("text creates kind and supports style overload", () => {
    const vnode = ui.text("Hello", { style: { bold: true }, textOverflow: "ellipsis" });
    assert.equal(vnode.kind, "text");
    assert.equal(vnode.text, "Hello");
    assert.deepEqual(vnode.props, { style: { bold: true }, textOverflow: "ellipsis" });
  });

  test("text accepts empty content with default props", () => {
    const vnode = ui.text("");
    assert.equal(vnode.kind, "text");
    assert.equal(vnode.text, "");
    assert.deepEqual(vnode.props, {});
  });

  test("divider creates kind and forwards props", () => {
    const vnode = ui.divider({
      direction: "vertical",
      char: "|",
      label: "Split",
      color: "muted",
    });
    assert.equal(vnode.kind, "divider");
    assert.deepEqual(vnode.props, {
      direction: "vertical",
      char: "|",
      label: "Split",
      color: "muted",
    });
  });

  test("divider defaults to empty props", () => {
    const vnode = ui.divider();
    assert.equal(vnode.kind, "divider");
    assert.deepEqual(vnode.props, {});
  });

  test("spacer creates kind and forwards props", () => {
    const vnode = ui.spacer({ size: 3, flex: 2 });
    assert.equal(vnode.kind, "spacer");
    assert.deepEqual(vnode.props, { size: 3, flex: 2 });
  });

  test("spacer defaults to empty props", () => {
    const vnode = ui.spacer();
    assert.equal(vnode.kind, "spacer");
    assert.deepEqual(vnode.props, {});
  });

  test("richText creates kind and spans props", () => {
    const spans = [{ text: "A" }, { text: "B", style: { bold: true } }] as const;
    const vnode = ui.richText(spans);
    assert.equal(vnode.kind, "richText");
    assert.deepEqual(vnode.props, { spans });
  });

  test("richText accepts empty spans", () => {
    const vnode = ui.richText([]);
    assert.equal(vnode.kind, "richText");
    assert.deepEqual(vnode.props, { spans: [] });
  });

  test("badge creates kind and forwards props", () => {
    const vnode = ui.badge("Alpha", { variant: "info", style: { bold: true } });
    assert.equal(vnode.kind, "badge");
    assert.deepEqual(vnode.props, { text: "Alpha", variant: "info", style: { bold: true } });
  });

  test("badge keeps default variant undefined and allows empty text", () => {
    const vnode = ui.badge("");
    assert.equal(vnode.kind, "badge");
    assert.deepEqual(vnode.props, { text: "" });
  });

  test("spinner creates kind and forwards variant/label/style", () => {
    const vnode = ui.spinner({ variant: "dots2", label: "Loading", style: { italic: true } });
    assert.equal(vnode.kind, "spinner");
    assert.deepEqual(vnode.props, { variant: "dots2", label: "Loading", style: { italic: true } });
  });

  test("spinner defaults to empty props", () => {
    const vnode = ui.spinner();
    assert.equal(vnode.kind, "spinner");
    assert.deepEqual(vnode.props, {});
  });

  test("progress creates kind and forwards value/options", () => {
    const vnode = ui.progress(0.6, {
      width: 12,
      variant: "blocks",
      showPercent: true,
      label: "Build",
      style: { bold: true },
      trackStyle: { dim: true },
    });
    assert.equal(vnode.kind, "progress");
    assert.deepEqual(vnode.props, {
      value: 0.6,
      width: 12,
      variant: "blocks",
      showPercent: true,
      label: "Build",
      style: { bold: true },
      trackStyle: { dim: true },
    });
  });

  test("progress accepts zero value with no optionals", () => {
    const vnode = ui.progress(0);
    assert.equal(vnode.kind, "progress");
    assert.deepEqual(vnode.props, { value: 0 });
  });

  test("progress preserves boundary and non-finite values", () => {
    assert.deepEqual(ui.progress(1).props, { value: 1 });
    assert.deepEqual(ui.progress(-1).props, { value: -1 });
    assert.deepEqual(ui.progress(Number.POSITIVE_INFINITY).props, {
      value: Number.POSITIVE_INFINITY,
    });
    assert.deepEqual(ui.progress(Number.NaN).props, { value: Number.NaN });
  });

  test("skeleton creates kind and forwards width/props", () => {
    const vnode = ui.skeleton(10, { height: 2, variant: "rect", style: { dim: true } });
    assert.equal(vnode.kind, "skeleton");
    assert.deepEqual(vnode.props, { width: 10, height: 2, variant: "rect", style: { dim: true } });
  });

  test("skeleton accepts zero width", () => {
    const vnode = ui.skeleton(0);
    assert.equal(vnode.kind, "skeleton");
    assert.deepEqual(vnode.props, { width: 0 });
  });

  test("icon creates kind and forwards icon path/options", () => {
    const vnode = ui.icon("status.check", { fallback: true, style: { bold: true } });
    assert.equal(vnode.kind, "icon");
    assert.deepEqual(vnode.props, { icon: "status.check", fallback: true, style: { bold: true } });
  });

  test("icon accepts empty icon path", () => {
    const vnode = ui.icon("");
    assert.equal(vnode.kind, "icon");
    assert.deepEqual(vnode.props, { icon: "" });
  });

  test("kbd creates kind and forwards keys/options", () => {
    const vnode = ui.kbd(["Ctrl", "S"], { separator: "+", style: { bold: true } });
    assert.equal(vnode.kind, "kbd");
    assert.deepEqual(vnode.props, {
      keys: ["Ctrl", "S"],
      separator: "+",
      style: { bold: true },
    });
  });

  test("kbd accepts string key form with defaults", () => {
    const vnode = ui.kbd("Ctrl+P");
    assert.equal(vnode.kind, "kbd");
    assert.deepEqual(vnode.props, { keys: "Ctrl+P" });
  });

  test("keybindingHelp builds a formatted shortcut list", () => {
    const vnode = ui.keybindingHelp(
      [
        { sequence: "ctrl+k ctrl+c", description: "Comment line", mode: "normal" },
        { sequence: "g g", mode: "normal" },
      ],
      { title: "Help", showMode: true, sort: false },
    );

    assert.equal(vnode.kind, "column");
    assert.deepEqual(vnode.props, { gap: 1 });

    const header = vnode.children[0];
    assert.ok(header);
    if (!header) return;
    assert.equal(header.kind, "text");
    if (header.kind !== "text") return;
    assert.equal(header.text, "Help");

    const rows = vnode.children[2];
    assert.ok(rows);
    if (!rows) return;
    assert.equal(rows.kind, "column");
    if (rows.kind !== "column") return;
    assert.equal(rows.children.length, 2);

    const firstRow = rows.children[0];
    assert.ok(firstRow);
    if (!firstRow) return;
    assert.equal(firstRow.kind, "row");
    if (firstRow.kind !== "row") return;
    const firstShortcut = firstRow.children[0];
    assert.ok(firstShortcut);
    if (!firstShortcut) return;
    assert.equal(firstShortcut.kind, "kbd");
    if (firstShortcut.kind !== "kbd") return;
    assert.deepEqual(firstShortcut.props, { keys: ["ctrl+k", "ctrl+c"], separator: " " });

    const secondRow = rows.children[1];
    assert.ok(secondRow);
    if (!secondRow) return;
    assert.equal(secondRow.kind, "row");
    if (secondRow.kind !== "row") return;
    const description = secondRow.children[2];
    assert.ok(description);
    if (!description) return;
    assert.equal(description.kind, "text");
    if (description.kind !== "text") return;
    assert.equal(description.text, "No description");
  });

  test("keybindingHelp renders empty state text when no bindings exist", () => {
    const vnode = ui.keybindingHelp([], { emptyText: "Nothing bound" });
    assert.equal(vnode.kind, "column");
    const emptyNode = vnode.children[2];
    assert.ok(emptyNode);
    if (!emptyNode) return;
    assert.equal(emptyNode.kind, "text");
    if (emptyNode.kind !== "text") return;
    assert.equal(emptyNode.text, "Nothing bound");
  });

  test("status creates kind and forwards status/options", () => {
    const vnode = ui.status("away", { label: "AFK", showLabel: true, style: { italic: true } });
    assert.equal(vnode.kind, "status");
    assert.deepEqual(vnode.props, {
      status: "away",
      label: "AFK",
      showLabel: true,
      style: { italic: true },
    });
  });

  test("status keeps default showLabel undefined", () => {
    const vnode = ui.status("online");
    assert.equal(vnode.kind, "status");
    assert.deepEqual(vnode.props, { status: "online" });
  });

  test("tag creates kind and forwards text/options", () => {
    const vnode = ui.tag("API", { variant: "warning", removable: true, style: { bold: true } });
    assert.equal(vnode.kind, "tag");
    assert.deepEqual(vnode.props, {
      text: "API",
      variant: "warning",
      removable: true,
      style: { bold: true },
    });
  });

  test("tag allows empty text", () => {
    const vnode = ui.tag("");
    assert.equal(vnode.kind, "tag");
    assert.deepEqual(vnode.props, { text: "" });
  });

  test("gauge creates kind and forwards value/options", () => {
    const vnode = ui.gauge(0.4, {
      label: "CPU",
      variant: "compact",
      thresholds: [
        { value: 0.8, variant: "warning" },
        { value: 0.95, variant: "error" },
      ],
      style: { bold: true },
    });
    assert.equal(vnode.kind, "gauge");
    assert.deepEqual(vnode.props, {
      value: 0.4,
      label: "CPU",
      variant: "compact",
      thresholds: [
        { value: 0.8, variant: "warning" },
        { value: 0.95, variant: "error" },
      ],
      style: { bold: true },
    });
  });

  test("gauge accepts zero value with defaults", () => {
    const vnode = ui.gauge(0);
    assert.equal(vnode.kind, "gauge");
    assert.deepEqual(vnode.props, { value: 0 });
  });

  test("gauge preserves boundary and non-finite values", () => {
    assert.deepEqual(ui.gauge(1).props, { value: 1 });
    assert.deepEqual(ui.gauge(-1).props, { value: -1 });
    assert.deepEqual(ui.gauge(Number.POSITIVE_INFINITY).props, {
      value: Number.POSITIVE_INFINITY,
    });
    assert.deepEqual(ui.gauge(Number.NaN).props, { value: Number.NaN });
  });

  test("empty creates kind and forwards title/options", () => {
    const action = ui.button("retry", "Retry");
    const vnode = ui.empty("No items", {
      icon: "ui.search",
      description: "Try a different filter",
      action,
      style: { dim: true },
    });
    assert.equal(vnode.kind, "empty");
    assert.deepEqual(vnode.props, {
      title: "No items",
      icon: "ui.search",
      description: "Try a different filter",
      action,
      style: { dim: true },
    });
  });

  test("empty allows empty title", () => {
    const vnode = ui.empty("");
    assert.equal(vnode.kind, "empty");
    assert.deepEqual(vnode.props, { title: "" });
  });

  test("errorDisplay creates kind and forwards message/options", () => {
    const onRetry = () => undefined;
    const vnode = ui.errorDisplay("Failed", {
      title: "Oops",
      stack: "line1\nline2",
      showStack: true,
      onRetry,
      style: { bold: true },
    });
    assert.equal(vnode.kind, "errorDisplay");
    assert.deepEqual(vnode.props, {
      message: "Failed",
      title: "Oops",
      stack: "line1\nline2",
      showStack: true,
      onRetry,
      style: { bold: true },
    });
  });

  test("errorDisplay keeps optional defaults undefined", () => {
    const vnode = ui.errorDisplay("");
    assert.equal(vnode.kind, "errorDisplay");
    assert.deepEqual(vnode.props, { message: "" });
  });

  test("callout creates kind and forwards message/options", () => {
    const vnode = ui.callout("Action required", {
      variant: "warning",
      title: "Heads up",
      icon: "status.warning",
      style: { bold: true },
    });
    assert.equal(vnode.kind, "callout");
    assert.deepEqual(vnode.props, {
      message: "Action required",
      variant: "warning",
      title: "Heads up",
      icon: "status.warning",
      style: { bold: true },
    });
  });

  test("callout keeps variant undefined by default", () => {
    const vnode = ui.callout("");
    assert.equal(vnode.kind, "callout");
    assert.deepEqual(vnode.props, { message: "" });
  });

  test("sparkline creates kind and forwards data/options", () => {
    const data = [1, 3, 2, 4] as const;
    const vnode = ui.sparkline(data, { width: 6, min: 0, max: 5, style: { italic: true } });
    assert.equal(vnode.kind, "sparkline");
    assert.deepEqual(vnode.props, {
      data,
      width: 6,
      min: 0,
      max: 5,
      style: { italic: true },
    });
  });

  test("sparkline accepts empty data", () => {
    const vnode = ui.sparkline([]);
    assert.equal(vnode.kind, "sparkline");
    assert.deepEqual(vnode.props, { data: [] });
  });

  test("barChart creates kind and forwards data/options", () => {
    const data = [{ label: "A", value: 2, variant: "info" }] as const;
    const vnode = ui.barChart(data, {
      orientation: "vertical",
      showValues: false,
      showLabels: false,
      maxBarLength: 8,
      style: { bold: true },
    });
    assert.equal(vnode.kind, "barChart");
    assert.deepEqual(vnode.props, {
      data,
      orientation: "vertical",
      showValues: false,
      showLabels: false,
      maxBarLength: 8,
      style: { bold: true },
    });
  });

  test("barChart accepts empty data", () => {
    const vnode = ui.barChart([]);
    assert.equal(vnode.kind, "barChart");
    assert.deepEqual(vnode.props, { data: [] });
  });

  test("miniChart creates kind and forwards values/options", () => {
    const values = [
      { label: "CPU", value: 42, max: 100 },
      { label: "MEM", value: 77, max: 100 },
    ] as const;
    const vnode = ui.miniChart(values, { variant: "pills", style: { italic: true } });
    assert.equal(vnode.kind, "miniChart");
    assert.deepEqual(vnode.props, {
      values,
      variant: "pills",
      style: { italic: true },
    });
  });

  test("miniChart accepts empty values", () => {
    const vnode = ui.miniChart([]);
    assert.equal(vnode.kind, "miniChart");
    assert.deepEqual(vnode.props, { values: [] });
  });
});
