import { assert, describe, test } from "@rezi-ui/testkit";
import { computeDropdownGeometry } from "../dropdownGeometry.js";
import type { Rect } from "../types.js";
import type { DropdownProps } from "../../widgets/types.js";

function dropdownProps(items: DropdownProps["items"]): DropdownProps {
  return {
    id: "menu",
    anchorId: "anchor",
    position: "below-start",
    items,
  };
}

describe("dropdownGeometry", () => {
  test("clamps dropdown height to viewport and budgets width for scrollbar", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `item-${String(i)}`,
      label: "item",
    }));
    const props = dropdownProps(items);
    const anchor: Rect = { x: 0, y: 0, w: 1, h: 1 };
    const viewport = { cols: 40, rows: 20 };

    const rect = computeDropdownGeometry(props, anchor, viewport);
    assert.ok(rect);
    if (!rect) return;

    assert.equal(rect.h <= viewport.rows, true);
    assert.equal(rect.h, 20);
    assert.equal(rect.w, 7);
  });

  test("preserves original dimensions when viewport is large enough", () => {
    const props = dropdownProps([
      { id: "a", label: "alpha", shortcut: "Ctrl+X" },
      { id: "b", label: "alpha", shortcut: "Ctrl+X" },
      { id: "c", label: "alpha", shortcut: "Ctrl+X" },
      { id: "d", label: "alpha", shortcut: "Ctrl+X" },
      { id: "e", label: "alpha", shortcut: "Ctrl+X" },
    ]);
    const anchor: Rect = { x: 5, y: 5, w: 2, h: 1 };
    const viewport = { cols: 40, rows: 40 };

    const rect = computeDropdownGeometry(props, anchor, viewport);
    assert.ok(rect);
    if (!rect) return;

    assert.equal(rect.w, 14);
    assert.equal(rect.h, 7);
  });

  test("returns minimum size geometry for empty item lists", () => {
    const props = dropdownProps([]);
    const anchor: Rect = { x: 3, y: 2, w: 4, h: 1 };
    const viewport = { cols: 40, rows: 20 };

    const rect = computeDropdownGeometry(props, anchor, viewport);
    assert.ok(rect);
    if (!rect) return;

    assert.equal(rect.w, 3);
    assert.equal(rect.h, 2);
  });
});
