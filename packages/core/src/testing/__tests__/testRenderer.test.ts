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

  test("findById exposes layout rect for element measurement", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 10 } });

    const result = renderer.render(
      ui.column({}, [
        ui.button({ id: "top", label: "Top" }),
        ui.button({ id: "bottom", label: "Bottom" }),
      ]),
    );

    const top = result.findById("top");
    assert.notEqual(top, null);
    assert.equal(typeof top?.rect.x, "number");
    assert.equal(typeof top?.rect.y, "number");
    assert.equal(typeof top?.rect.w, "number");
    assert.equal(typeof top?.rect.h, "number");
    assert.ok((top?.rect.w ?? 0) > 0);
    assert.ok((top?.rect.h ?? 0) > 0);

    const bottom = result.findById("bottom");
    assert.notEqual(bottom, null);
    assert.ok((bottom?.rect.y ?? 0) >= (top?.rect.y ?? 0) + (top?.rect.h ?? 0));
  });

  test("query rect origins are clamped to the viewport while raw layout keeps scroll offsets", () => {
    const viewport = { cols: 5, rows: 3 };
    const renderer = createTestRenderer({ viewport });

    const result = renderer.render(
      ui.column(
        { id: "scroll", width: 5, height: 3, overflow: "scroll", scrollX: 99, scrollY: 99 },
        [
          ui.box({ id: "oversized", border: "none", mr: -4, mb: -1 }, [
            ui.text("123456789"),
            ui.text("line2"),
            ui.text("line3"),
            ui.text("line4"),
          ]),
        ],
      ),
    );

    for (const node of result.nodes) {
      assert.ok(node.rect.x >= 0, `${node.kind} x should be inside viewport`);
      assert.ok(node.rect.y >= 0, `${node.kind} y should be inside viewport`);
      assert.ok(node.rect.w >= 0, `${node.kind} width should be non-negative`);
      assert.ok(node.rect.h >= 0, `${node.kind} height should be non-negative`);
    }

    assert.deepEqual(result.findById("oversized")?.rect, { x: 0, y: 0, w: 9, h: 4 });

    let rawOversizedX: number | null = null;
    let rawOversizedY: number | null = null;
    result.forEachLayoutNode((rect, props) => {
      if (props.id === "oversized") {
        rawOversizedX = rect.x;
        rawOversizedY = rect.y;
      }
    });
    assert.notEqual(rawOversizedX, null);
    assert.notEqual(rawOversizedY, null);
    assert.ok((rawOversizedX ?? 0) < 0);
    assert.ok((rawOversizedY ?? 0) < 0);
  });

  test("trace callback receives render timing and detail payload", () => {
    const events: unknown[] = [];
    const renderer = createTestRenderer({
      viewport: { cols: 30, rows: 6 },
      traceDetail: true,
      trace: (event) => {
        events.push(event);
      },
    });

    renderer.render(ui.column({}, [ui.text("Hello trace"), ui.button({ id: "ok", label: "OK" })]));

    assert.equal(events.length, 1);
    const first = events[0] as {
      timings?: { totalMs?: number };
      nodeCount?: number;
      opCount?: number;
      text?: string;
      detailIncluded?: boolean;
      nodes?: readonly unknown[];
      ops?: readonly unknown[];
    };
    assert.ok((first.timings?.totalMs ?? -1) >= 0);
    assert.ok((first.nodeCount ?? 0) > 0);
    assert.ok((first.opCount ?? 0) > 0);
    assert.equal(first.detailIncluded, true);
    assert.equal(Array.isArray(first.nodes), true);
    assert.equal(Array.isArray(first.ops), true);
    assert.equal((first.text ?? "").includes("Hello trace"), true);
  });

  test("runtime mode keeps query helpers and lazy text access", () => {
    const renderer = createTestRenderer({ viewport: { cols: 30, rows: 6 }, mode: "runtime" });
    const result = renderer.render(
      ui.column({}, [ui.text("Runtime Mode"), ui.button({ id: "submit", label: "Submit" })]),
    );

    let visited = 0;
    result.forEachLayoutNode(() => {
      visited += 1;
    });
    assert.ok(visited > 0);
    assert.equal(result.toText().includes("Runtime Mode"), true);
    assert.notEqual(result.findText("Runtime Mode"), null);
    assert.equal(result.findById("submit")?.kind, "button");
    assert.equal(result.findAll("button").length, 1);
  });

  test("findAll supports textarea kind alias", () => {
    const renderer = createTestRenderer({ viewport: { cols: 40, rows: 8 } });
    const result = renderer.render(
      ui.column({}, [
        ui.input({ id: "single", value: "single" }),
        ui.textarea({ id: "multi", value: "line1\nline2", rows: 2 }),
      ]),
    );

    const textareas = result.findAll("textarea");
    assert.equal(textareas.length, 1);
    assert.equal(textareas[0]?.id, "multi");
    assert.equal(textareas[0]?.kind, "input");
  });
});
