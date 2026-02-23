import { assert, describe, test } from "@rezi-ui/testkit";
import { ui } from "../../index.js";
import { layout } from "../layout.js";

function mustRow(children: readonly ReturnType<typeof ui.box>[]) {
  const tree = ui.row({ width: 40, height: 10, gap: 0 }, children);
  const res = layout(tree, 0, 0, 40, 10, "row");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function findChildRect(
  out: ReturnType<typeof mustRow>,
  child: ReturnType<typeof ui.box>,
): { x: number; y: number; w: number; h: number } {
  const hit = out.children.find((c) => c.vnode === child);
  if (!hit) assert.fail("child not found in layout tree");
  return hit.rect;
}

describe("layout absolute positioning", () => {
  test("absolute child does not affect flow sizing", () => {
    const flow = ui.box({ border: "none", width: 5, height: 2 }, []);
    const abs = ui.box(
      { border: "none", position: "absolute", top: 0, left: 0, width: 3, height: 3 },
      [],
    );
    const out = mustRow([flow, abs]);
    assert.deepEqual(out.rect, { x: 0, y: 0, w: 40, h: 10 });
    assert.deepEqual(findChildRect(out, flow), { x: 0, y: 0, w: 5, h: 2 });
    assert.deepEqual(findChildRect(out, abs), { x: 0, y: 0, w: 3, h: 3 });
  });

  test("top/left offsets are relative to parent content origin", () => {
    const abs = ui.box(
      { border: "none", position: "absolute", top: 2, left: 3, width: 4, height: 2 },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, abs), { x: 3, y: 2, w: 4, h: 2 });
  });

  test("bottom/right anchors child to bottom-right corner", () => {
    const abs = ui.box(
      { border: "none", position: "absolute", bottom: 0, right: 0, width: 3, height: 2 },
      [],
    );
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, abs), { x: 37, y: 8, w: 3, h: 2 });
  });

  test("top+bottom stretches full height when height is not explicit", () => {
    const abs = ui.box({ border: "none", position: "absolute", top: 0, bottom: 0, width: 3 }, []);
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, abs), { x: 0, y: 0, w: 3, h: 10 });
  });

  test("left+right stretches full width when width is not explicit", () => {
    const abs = ui.box({ border: "none", position: "absolute", left: 0, right: 0, height: 2 }, []);
    const out = mustRow([abs]);
    assert.deepEqual(findChildRect(out, abs), { x: 0, y: 0, w: 40, h: 2 });
  });

  test("explicit width/height take precedence for absolute children", () => {
    const abs = ui.box(
      {
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
    assert.deepEqual(findChildRect(out, abs), { x: 2, y: 1, w: 7, h: 4 });
  });

  test("invalid position value propagates layout error", () => {
    const malformed = ui.box({ border: "none", width: 3, height: 2 }, []);
    (malformed.props as { position?: unknown }).position = "absoulte";
    const res = layout(ui.row({ width: 40, height: 10, gap: 0 }, [malformed]), 0, 0, 40, 10, "row");
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
    assert.ok(res.fatal.detail.includes("box.position"));
  });

  test("invalid absolute offsets propagate layout error", () => {
    const malformed = ui.box({ border: "none", width: 3, height: 2 }, []);
    const props = malformed.props as { position?: unknown; top?: unknown };
    props.position = "absolute";
    props.top = "bad";

    const res = layout(ui.row({ width: 40, height: 10, gap: 0 }, [malformed]), 0, 0, 40, 10, "row");
    assert.equal(res.ok, false);
    if (res.ok) return;
    assert.equal(res.fatal.code, "ZRUI_INVALID_PROPS");
    assert.ok(res.fatal.detail.includes("box.top"));
  });
});
