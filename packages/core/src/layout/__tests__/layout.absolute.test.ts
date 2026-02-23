import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { createTestRenderer } from "../../testing/renderer.js";

function mustRow(children: readonly ReturnType<typeof ui.box>[]) {
  const renderer = createTestRenderer({ viewport: { cols: 40, rows: 10 } });
  return renderer.render(ui.row({ width: 40, height: 10, gap: 0 }, children));
}

function findRootRect(out: ReturnType<typeof mustRow>): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const root = out.nodes.find((node) => node.path.length === 0);
  if (!root) assert.fail("root not found in layout tree");
  return root.rect;
}

function findChildRect(
  out: ReturnType<typeof mustRow>,
  childId: string,
): { x: number; y: number; w: number; h: number } {
  const hit = out.findById(childId);
  if (!hit) assert.fail("child not found in layout tree");
  return hit.rect;
}

function captureRenderError(vnode: ReturnType<typeof ui.row>): string {
  const renderer = createTestRenderer({ viewport: { cols: 40, rows: 10 } });
  try {
    renderer.render(vnode);
    assert.fail("expected render to throw");
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  return "";
}

describe("layout absolute positioning", () => {
  test("absolute child does not affect flow sizing", () => {
    const flow = ui.box({ id: "flow", border: "none", width: 5, height: 2 }, []);
    const abs = ui.box(
      { id: "abs", border: "none", position: "absolute", top: 0, left: 0, width: 3, height: 3 },
      [],
    );
    const out = mustRow([flow, abs]);
    assert.deepEqual(findRootRect(out), { x: 0, y: 0, w: 40, h: 10 });
    assert.deepEqual(findChildRect(out, "flow"), { x: 0, y: 0, w: 5, h: 2 });
    assert.deepEqual(findChildRect(out, "abs"), { x: 0, y: 0, w: 3, h: 3 });
  });

  test("top/left offsets are relative to parent content origin", () => {
    const abs = ui.box(
      { id: "abs", border: "none", position: "absolute", top: 2, left: 3, width: 4, height: 2 },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 3, y: 2, w: 4, h: 2 });
  });

  test("bottom/right anchors child to bottom-right corner", () => {
    const abs = ui.box(
      { id: "abs", border: "none", position: "absolute", bottom: 0, right: 0, width: 3, height: 2 },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 37, y: 8, w: 3, h: 2 });
  });

  test("top+bottom stretches full height when height is not explicit", () => {
    const abs = ui.box(
      { id: "abs", border: "none", position: "absolute", top: 0, bottom: 0, width: 3 },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 0, y: 0, w: 3, h: 10 });
  });

  test("left+right stretches full width when width is not explicit", () => {
    const abs = ui.box(
      { id: "abs", border: "none", position: "absolute", left: 0, right: 0, height: 2 },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 0, y: 0, w: 40, h: 2 });
  });

  test("explicit width/height take precedence for absolute children", () => {
    const abs = ui.box(
      {
        id: "abs",
        border: "none",
        position: "absolute",
        top: 1,
        left: 2,
        right: 0,
        bottom: 0,
        width: 7,
        height: 4,
      },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 2, y: 1, w: 7, h: 4 });
  });

  test('absolute width/height support "%" constraints', () => {
    const abs = ui.box(
      {
        id: "abs",
        border: "none",
        position: "absolute",
        top: 0,
        left: 0,
        width: "50%",
        height: "30%",
      },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 0, y: 0, w: 20, h: 3 });
  });

  test('absolute width/height support "full" constraints', () => {
    const abs = ui.box(
      { id: "abs", border: "none", position: "absolute", width: "full", height: "full" },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, "abs"), { x: 0, y: 0, w: 40, h: 10 });
  });

  test("invalid position value propagates layout error", () => {
    const malformed = ui.box({ border: "none", width: 3, height: 2 }, []);
    (malformed.props as { position?: unknown }).position = "absoulte";
    const message = captureRenderError(ui.row({ width: 40, height: 10, gap: 0 }, [malformed]));
    assert.ok(message.includes("ZRUI_INVALID_PROPS"));
    assert.ok(message.includes("box.position"));
  });

  test("invalid absolute offsets propagate layout error", () => {
    const malformed = ui.box({ border: "none", width: 3, height: 2 }, []);
    const props = malformed.props as { position?: unknown; top?: unknown };
    props.position = "absolute";
    props.top = "bad";
    const message = captureRenderError(ui.row({ width: 40, height: 10, gap: 0 }, [malformed]));
    assert.ok(message.includes("ZRUI_INVALID_PROPS"));
    assert.ok(message.includes("box.top"));
  });
});
