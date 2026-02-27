import { assert, describe, test } from "@rezi-ui/testkit";
import { parseInternedStrings } from "../../__tests__/drawlistDecode.js";
import type { RuntimeBreadcrumbSnapshot } from "../../app/runtimeBreadcrumbs.js";
import { type VNode, ZR_CURSOR_SHAPE_BAR, createDrawlistBuilder } from "../../index.js";
import { layout } from "../../layout/layout.js";
import { renderToDrawlist } from "../../renderer/renderToDrawlist.js";
import { commitVNodeTree } from "../../runtime/commit.js";
import { createInstanceIdAllocator } from "../../runtime/instance.js";
import { inspectorOverlay } from "../inspectorOverlay.js";

function renderStrings(
  vnode: VNode,
  viewport: Readonly<{ cols: number; rows: number }> = { cols: 100, rows: 30 },
): readonly string[] {
  const allocator = createInstanceIdAllocator(1);
  const commitRes = commitVNodeTree(null, vnode, { allocator });
  assert.equal(commitRes.ok, true, "commit should succeed");
  if (!commitRes.ok) return Object.freeze([]);

  const layoutRes = layout(
    commitRes.value.root.vnode,
    0,
    0,
    viewport.cols,
    viewport.rows,
    "column",
  );
  assert.equal(layoutRes.ok, true, "layout should succeed");
  if (!layoutRes.ok) return Object.freeze([]);

  const builder = createDrawlistBuilder();
  renderToDrawlist({
    tree: commitRes.value.root,
    layout: layoutRes.value,
    viewport,
    focusState: Object.freeze({ focusedId: null }),
    builder,
  });
  const built = builder.build();
  assert.equal(built.ok, true, "drawlist build should succeed");
  if (!built.ok) return Object.freeze([]);

  return parseInternedStrings(built.bytes);
}

describe("inspectorOverlay render shape", () => {
  test("renders focus/cursor/damage/frame/event sections", () => {
    const snapshot: RuntimeBreadcrumbSnapshot = Object.freeze({
      focus: Object.freeze({
        focusedId: "input.name",
        activeZoneId: "zone.editor",
        activeTrapId: "trap.modal",
        announcement: "Email input — Required — Invalid format",
      }),
      cursor: Object.freeze({
        visible: true,
        x: 12,
        y: 4,
        shape: ZR_CURSOR_SHAPE_BAR,
        blink: true,
      }),
      damage: Object.freeze({
        mode: "incremental",
        rectCount: 3,
        area: 48,
      }),
      frame: Object.freeze({
        tick: 17,
        commit: true,
        layout: false,
        incremental: true,
        renderTimeMs: 1.75,
      }),
      event: Object.freeze({
        kind: "key",
        path: "keybindings",
      }),
      lastAction: Object.freeze({
        id: "save.btn",
        action: "press",
      }),
    });

    const strings = renderStrings(
      inspectorOverlay({
        snapshot,
        frameTiming: {
          damageRects: 4,
          damageCells: 52,
          drawlistBytes: 2048,
          diffBytesEmitted: 512,
          usDrawlist: 101,
          usDiff: 22,
          usWrite: 7,
        },
        title: "Inspector",
        hotkeyHint: "ctrl+shift+i",
      }),
    );

    assert.equal(strings.includes("inspector overlay"), true);
    assert.equal(strings.includes("focus: id=input.name zone=zone.editor trap=trap.modal"), true);
    assert.equal(
      strings.includes("focus_announcement: Email input — Required — Invalid format"),
      true,
    );
    assert.equal(
      strings.includes(
        `cursor: (12,4) shape=${String(ZR_CURSOR_SHAPE_BAR)} blink=${String("yes")}`,
      ),
      true,
    );
    assert.equal(strings.includes("damage: mode=incremental rects=4 cells=52"), true);
    assert.equal(
      strings.includes("frame: tick=17 commit=yes layout=no incremental=yes render_ms=1.75"),
      true,
    );
    assert.equal(strings.includes("bytes: drawlist=2048 diff=512"), true);
    assert.equal(strings.includes("timing_us: drawlist=101 diff=22 write=7"), true);
    assert.equal(strings.includes("event: kind=key path=keybindings"), true);
    assert.equal(strings.includes("action: save.btn.press"), true);
    assert.equal(strings.includes("toggle: ctrl+shift+i"), true);
  });

  test("renders explicit fallback rows when snapshot is unavailable", () => {
    const strings = renderStrings(
      inspectorOverlay({
        snapshot: null,
        title: "Inspector",
      }),
    );

    assert.equal(strings.includes("focus: id=<none> zone=<none> trap=<none>"), true);
    assert.equal(strings.includes("focus_announcement: <none>"), true);
    assert.equal(strings.includes("cursor: n/a"), true);
    assert.equal(strings.includes("damage: mode=none rects=n/a cells=n/a"), true);
    assert.equal(strings.includes("event: kind=<none> path=<none>"), true);
    assert.equal(strings.includes("action: <none>"), true);
  });
});
