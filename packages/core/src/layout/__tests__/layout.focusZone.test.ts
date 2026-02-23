import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { ui } from "../../widgets/ui.js";
import { layout, measure } from "../layout.js";

function mustLayout(vnode: VNode, maxW: number, maxH: number) {
  const res = layout(vnode, 0, 0, maxW, maxH, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

describe("focusZone/focusTrap layout transparency", () => {
  test("focusZone with a single row child keeps horizontal child layout", () => {
    const vnode = ui.focusZone({ id: "zone-row" }, [
      ui.row({ gap: 1 }, [ui.button({ id: "a", label: "A" }), ui.button({ id: "b", label: "B" })]),
    ]);

    const laidOut = mustLayout(vnode, 30, 5);
    const row = laidOut.children[0];
    assert.equal(row?.vnode.kind, "row");
    if (!row || row.vnode.kind !== "row") return;

    const first = row.children[0];
    const second = row.children[1];
    assert.ok(first && second, "row children should exist");
    if (!first || !second) return;

    assert.equal(first.rect.y, second.rect.y);
    assert.equal(second.rect.x > first.rect.x, true);
  });

  test("focusZone with a single column child keeps vertical child layout", () => {
    const vnode = ui.focusZone({ id: "zone-col" }, [
      ui.column({ gap: 0 }, [
        ui.button({ id: "a2", label: "A2" }),
        ui.button({ id: "b2", label: "B2" }),
      ]),
    ]);

    const laidOut = mustLayout(vnode, 30, 8);
    const column = laidOut.children[0];
    assert.equal(column?.vnode.kind, "column");
    if (!column || column.vnode.kind !== "column") return;

    const first = column.children[0];
    const second = column.children[1];
    assert.ok(first && second, "column children should exist");
    if (!first || !second) return;

    assert.equal(first.rect.x, second.rect.x);
    assert.equal(second.rect.y > first.rect.y, true);
  });

  test("focusZone with zero children measures to {w:0,h:0}", () => {
    const vnode = ui.focusZone({ id: "zone-empty" }, []);
    const measured = measure(vnode, 40, 10, "column");
    assert.equal(measured.ok, true);
    if (!measured.ok) return;
    assert.deepEqual(measured.value, { w: 0, h: 0 });
  });

  test("focusZone with multiple direct children keeps legacy column fallback", () => {
    const vnode = ui.focusZone({ id: "zone-legacy" }, [
      ui.button({ id: "legacy-a", label: "A" }),
      ui.button({ id: "legacy-b", label: "B" }),
    ]);

    const laidOut = mustLayout(vnode, 20, 8);
    const first = laidOut.children[0];
    const second = laidOut.children[1];
    assert.ok(first && second, "legacy fallback should lay out both direct children");
    if (!first || !second) return;

    assert.equal(second.rect.y > first.rect.y, true);
  });

  test("focusTrap with a single child is layout-transparent", () => {
    const vnode = ui.focusTrap({ id: "trap-row", active: true }, [
      ui.row({ gap: 1 }, [
        ui.button({ id: "trap-a", label: "A" }),
        ui.button({ id: "trap-b", label: "B" }),
      ]),
    ]);

    const laidOut = mustLayout(vnode, 30, 6);
    const row = laidOut.children[0];
    assert.equal(row?.vnode.kind, "row");
    if (!row || row.vnode.kind !== "row") return;

    const first = row.children[0];
    const second = row.children[1];
    assert.ok(first && second, "row children should exist");
    if (!first || !second) return;

    assert.equal(first.rect.y, second.rect.y);
    assert.equal(second.rect.x > first.rect.x, true);
  });
});
