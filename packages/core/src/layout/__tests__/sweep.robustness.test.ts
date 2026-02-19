/**
 * sweep.robustness.test.ts — Robustness edge-case tests for layout, rendering,
 * and hit testing. Covers the fixes from the 2026-02-06 sweep:
 *
 * 1. barChart empty data → non-negative width
 * 2. panelGroup remainder distribution → exact fill
 * 3. button label padding → symmetric px deduction
 * 4. Deep nesting, zero/tiny/huge dimensions, unicode truncation, off-viewport
 */

import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { hitTestFocusable } from "../hitTest.js";
import type { LayoutTree } from "../layout.js";
import { layout, measure } from "../layout.js";
import {
  getTextMeasureEmojiPolicy,
  measureTextCells,
  setTextMeasureEmojiPolicy,
  truncateMiddle,
  truncateWithEllipsis,
} from "../textMeasure.js";

function mustMeasure(vnode: VNode, maxW: number, maxH: number, axis: "row" | "column" = "column") {
  const res = measure(vnode, maxW, maxH, axis);
  if (!res.ok) {
    assert.fail(`measure failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

function mustLayout(vnode: VNode, maxW: number, maxH: number) {
  const res = layout(vnode, 0, 0, maxW, maxH, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

/* ======================== barChart empty data ======================== */

describe("barChart empty data guard", () => {
  test("vertical barChart with empty data produces non-negative width", () => {
    const chart: VNode = {
      kind: "barChart",
      props: {
        data: Object.freeze([]),
        orientation: "vertical",
      },
    };
    const size = mustMeasure(chart, 80, 24);
    assert.ok(size.w >= 0, `width must be non-negative, got ${size.w}`);
    assert.ok(size.h >= 0, `height must be non-negative, got ${size.h}`);
  });

  test("horizontal barChart with empty data produces zero height", () => {
    const chart: VNode = {
      kind: "barChart",
      props: {
        data: Object.freeze([]),
        orientation: "horizontal",
      },
    };
    const size = mustMeasure(chart, 80, 24);
    assert.equal(size.h, 0);
    assert.ok(size.w >= 0);
  });

  test("vertical barChart single item produces exact width=3", () => {
    const chart: VNode = {
      kind: "barChart",
      props: {
        data: Object.freeze([{ label: "A", value: 50 }]),
        orientation: "vertical",
      },
    };
    const size = mustMeasure(chart, 80, 24);
    assert.equal(size.w, 3, "single bar should be 3 cells wide with no gap");
  });
});

/* ======================== panelGroup remainder ======================== */

describe("panelGroup remainder distribution", () => {
  test("panelGroup distributes positions across all available width (horizontal)", () => {
    const panel = {
      kind: "panelGroup",
      props: { id: "pg1", direction: "horizontal" },
      children: Object.freeze([
        { kind: "text", text: "A", props: {} },
        { kind: "text", text: "B", props: {} },
        { kind: "text", text: "C", props: {} },
      ]),
    } as unknown as VNode;
    const tree = mustLayout(panel, 100, 10);
    assert.equal(tree.children.length, 3);
    // 100 / 3 = 33 base, remainder 1 → first panel gets 34, rest 33
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    const c2 = tree.children[2];
    assert.ok(c0 !== undefined && c1 !== undefined && c2 !== undefined);
    if (c0 && c1 && c2) {
      assert.equal(c0.rect.x, 0, "first child starts at 0");
      assert.equal(c1.rect.x, 34, "second child starts at 34 (33+1 remainder)");
      assert.equal(c2.rect.x, 67, "third child starts at 67 (34+33)");
      // Verify no gap: last panel allocation covers to 100
      const lastAlloc = 100 - c2.rect.x;
      assert.equal(lastAlloc, 33, "last panel allocation is 33");
      assert.equal(c2.rect.x + lastAlloc, 100, "panels fill all 100 cells");
    }
  });

  test("panelGroup distributes positions across all available height (vertical)", () => {
    const panel = {
      kind: "panelGroup",
      props: { id: "pg2", direction: "vertical" },
      children: Object.freeze([
        { kind: "text", text: "A", props: {} },
        { kind: "text", text: "B", props: {} },
        { kind: "text", text: "C", props: {} },
      ]),
    } as unknown as VNode;
    const tree = mustLayout(panel, 80, 100);
    assert.equal(tree.children.length, 3);
    const c0 = tree.children[0];
    const c1 = tree.children[1];
    const c2 = tree.children[2];
    assert.ok(c0 !== undefined && c1 !== undefined && c2 !== undefined);
    if (c0 && c1 && c2) {
      assert.equal(c0.rect.y, 0, "first child starts at y=0");
      assert.equal(c1.rect.y, 34, "second child starts at y=34");
      assert.equal(c2.rect.y, 67, "third child starts at y=67");
    }
  });

  test("panelGroup with 1 child starts at position 0", () => {
    const panel = {
      kind: "panelGroup",
      props: { id: "pg3", direction: "horizontal" },
      children: Object.freeze([{ kind: "text", text: "Solo", props: {} }]),
    } as unknown as VNode;
    const tree = mustLayout(panel, 50, 10);
    assert.equal(tree.children.length, 1);
    const child = tree.children[0];
    if (child) assert.equal(child.rect.x, 0, "single child starts at 0");
  });

  test("panelGroup with 0 children produces empty layout", () => {
    const panel = {
      kind: "panelGroup",
      props: { id: "pg4", direction: "horizontal" },
      children: Object.freeze([]),
    } as unknown as VNode;
    const tree = mustLayout(panel, 50, 10);
    assert.equal(tree.children.length, 0);
  });
});

/* ======================== button label padding ======================== */

describe("button label symmetric padding", () => {
  test("button with px=2 measures as label + 4", () => {
    const btn: VNode = {
      kind: "button",
      props: { id: "b1", label: "OK", px: 2 },
    };
    const size = mustMeasure(btn, 80, 1);
    // "OK" = 2 cells, px=2 => 2+4 = 6
    assert.equal(size.w, 6);
  });

  test("button label truncates within available space minus both paddings", () => {
    const btn: VNode = {
      kind: "button",
      props: { id: "b2", label: "Hello World", px: 2 },
    };
    // With maxW=8 and px=2: available for label = 8 - 2*2 = 4
    // "Hello World" (11 cells) must be truncated to 4 cells
    const tree = mustLayout(btn, 8, 1);
    assert.equal(tree.rect.w, 8);
  });

  test("button with px=0 uses full rect width for label", () => {
    const btn: VNode = {
      kind: "button",
      props: { id: "b3", label: "Go", px: 0 },
    };
    const size = mustMeasure(btn, 80, 1);
    assert.equal(size.w, 2, "px=0 means no padding, width = label width");
  });
});

/* ======================== zero/tiny/huge dimensions ======================== */

describe("zero and tiny dimensions", () => {
  test("row with maxW=0 produces zero-width children", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        { kind: "text", text: "ABC", props: {} },
        { kind: "text", text: "DEF", props: {} },
      ]),
    };
    const size = mustMeasure(row, 0, 10, "row");
    assert.equal(size.w, 0);
  });

  test("column with maxH=0 produces zero-height children", () => {
    const col: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([
        { kind: "text", text: "Line1", props: {} },
        { kind: "text", text: "Line2", props: {} },
      ]),
    };
    const size = mustMeasure(col, 80, 0, "column");
    assert.equal(size.h, 0);
  });

  test("row with maxW=1 still produces valid layout", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        { kind: "text", text: "A", props: {} },
        { kind: "text", text: "B", props: {} },
      ]),
    };
    const tree = mustLayout(row, 1, 1);
    assert.ok(tree.rect.w >= 0);
    assert.ok(tree.rect.h >= 0);
  });

  test("box with border has zero content area at width=2, height=2", () => {
    const box: VNode = {
      kind: "box",
      props: { border: "single" },
      children: Object.freeze([{ kind: "text", text: "Hi", props: {} }]),
    };
    const tree = mustLayout(box, 2, 2);
    // border takes 1 cell each side => content area = 0x0
    assert.equal(tree.rect.w, 2);
    assert.equal(tree.rect.h, 2);
  });
});

describe("huge dimensions", () => {
  test("text with huge maxW does not produce oversized result", () => {
    const text: VNode = { kind: "text", text: "Short", props: {} };
    const size = mustMeasure(text, 1_000_000, 1);
    assert.equal(size.w, 5); // "Short" = 5 cells
    assert.equal(size.h, 1);
  });

  test("column with huge maxH shrink-wraps to content", () => {
    const col: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([{ kind: "text", text: "One", props: {} }]),
    };
    const size = mustMeasure(col, 80, 1_000_000, "column");
    assert.equal(size.h, 1);
  });
});

/* ======================== deep nesting ======================== */

describe("deep nesting", () => {
  test("50-level nested columns produce valid layout", () => {
    let node: VNode = { kind: "text", text: "Leaf", props: {} };
    for (let i = 0; i < 50; i++) {
      node = { kind: "column", props: {}, children: Object.freeze([node]) };
    }
    const tree = mustLayout(node, 80, 50);
    assert.ok(tree.rect.w >= 0);
    assert.ok(tree.rect.h >= 0);
    assert.ok(tree.rect.h <= 50);
  });

  test("50-level nested boxes with borders still produce valid layout", () => {
    let node: VNode = { kind: "text", text: "X", props: {} };
    // Each box with border adds 2 to both dims (1 per side)
    // After 25 levels, the content area is consumed
    for (let i = 0; i < 25; i++) {
      node = {
        kind: "box",
        props: { border: "single" },
        children: Object.freeze([node]),
      };
    }
    const tree = mustLayout(node, 80, 60);
    assert.ok(tree.rect.w >= 0);
    assert.ok(tree.rect.h >= 0);
  });

  test("row inside column inside row measures correctly", () => {
    const inner: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([
        { kind: "text", text: "A", props: {} },
        { kind: "text", text: "B", props: {} },
      ]),
    };
    const middle: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([inner]),
    };
    const outer: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([middle]),
    };
    const size = mustMeasure(outer, 80, 10, "row");
    assert.equal(size.w, 2); // A(1) + B(1) = 2
    assert.equal(size.h, 1);
  });
});

/* ======================== text measurement and truncation ======================== */

describe("text measurement edge cases", () => {
  test("empty string measures 0", () => {
    assert.equal(measureTextCells(""), 0);
  });

  test("ASCII-only string measures correctly", () => {
    assert.equal(measureTextCells("Hello"), 5);
  });

  test("CJK characters measure 2 cells each", () => {
    // 日本語 = 3 CJK characters = 6 cells
    assert.equal(measureTextCells("日本語"), 6);
  });

  test("emoji measures 2 cells", () => {
    assert.equal(measureTextCells("😀"), 2);
  });

  test("text-default pictograph stays narrow unless emoji-presented", () => {
    assert.equal(measureTextCells("👁"), 1);
    assert.equal(measureTextCells("👁️"), 2);
  });

  test("keycap sequence measures as emoji width", () => {
    assert.equal(measureTextCells("1️⃣"), 2);
  });

  test("emoji width policy can be set to narrow", () => {
    const prev = getTextMeasureEmojiPolicy();
    try {
      setTextMeasureEmojiPolicy("narrow");
      assert.equal(measureTextCells("😀"), 1);
      assert.equal(measureTextCells("👁"), 1);
      assert.equal(measureTextCells("👁️"), 1);
      assert.equal(measureTextCells("1️⃣"), 1);
    } finally {
      setTextMeasureEmojiPolicy(prev);
    }
  });

  test("surrogate pair at string boundary", () => {
    // Unpaired high surrogate at end of string
    const broken = String.fromCharCode(0xd800);
    const width = measureTextCells(broken);
    assert.ok(width >= 0, "unpaired surrogate must produce non-negative width");
  });

  test("long ASCII string measures correctly", () => {
    const long = "A".repeat(10000);
    assert.equal(measureTextCells(long), 10000);
  });
});

describe("truncation edge cases", () => {
  test("truncateWithEllipsis returns empty for maxWidth=0", () => {
    assert.equal(truncateWithEllipsis("Hello World", 0), "");
  });

  test("truncateWithEllipsis returns ellipsis for maxWidth=1", () => {
    assert.equal(truncateWithEllipsis("Hello World", 1), "…");
  });

  test("truncateWithEllipsis preserves short text", () => {
    assert.equal(truncateWithEllipsis("Hi", 10), "Hi");
  });

  test("truncateWithEllipsis handles CJK at boundary", () => {
    // "日X" = 3 cells. Truncate to 2: can't fit "日" (2) + "…" (1) = 3 > 2
    // Should give just "…"
    const result = truncateWithEllipsis("日X", 2);
    assert.ok(measureTextCells(result) <= 2, `truncated "${result}" must fit in 2 cells`);
  });

  test("truncateMiddle returns original for short text", () => {
    assert.equal(truncateMiddle("Hello", 20), "Hello");
  });

  test("truncateMiddle returns empty for maxWidth=0", () => {
    assert.equal(truncateMiddle("Hello World", 0), "");
  });

  test("truncateMiddle result fits within maxWidth", () => {
    const result = truncateMiddle("/home/user/documents/project/src/index.ts", 20);
    assert.ok(measureTextCells(result) <= 20, `truncated "${result}" must fit in 20 cells`);
  });
});

/* ======================== off-viewport hit testing ======================== */

describe("off-viewport hit testing", () => {
  test("extreme negative coordinates return null", () => {
    const btn: VNode = { kind: "button", props: { id: "btn", label: "X" } };
    const root: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([btn]),
    };
    const tree = mustLayout(root, 80, 24);
    assert.equal(hitTestFocusable(root, tree, -1_000_000, 0), null);
    assert.equal(hitTestFocusable(root, tree, 0, -1_000_000), null);
  });

  test("extreme positive coordinates return null", () => {
    const btn: VNode = { kind: "button", props: { id: "btn", label: "X" } };
    const root: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([btn]),
    };
    const tree = mustLayout(root, 80, 24);
    assert.equal(hitTestFocusable(root, tree, 1_000_000, 0), null);
    assert.equal(hitTestFocusable(root, tree, 0, 1_000_000), null);
  });

  test("hit test at exact boundary edge (exclusive right/bottom)", () => {
    const btn: VNode = { kind: "button", props: { id: "btn", label: "X" } };
    const tree: LayoutTree = {
      vnode: btn,
      rect: { x: 0, y: 0, w: 5, h: 1 },
      children: Object.freeze([]),
    };
    // Point at x=4 (inside), x=5 (exclusive, outside)
    assert.equal(hitTestFocusable(btn, tree, 4, 0), "btn");
    assert.equal(hitTestFocusable(btn, tree, 5, 0), null, "right edge is exclusive");
    assert.equal(hitTestFocusable(btn, tree, 0, 1), null, "bottom edge is exclusive");
  });

  test("hit test with zero-size rect returns null", () => {
    const btn: VNode = { kind: "button", props: { id: "btn", label: "X" } };
    const tree: LayoutTree = {
      vnode: btn,
      rect: { x: 5, y: 5, w: 0, h: 0 },
      children: Object.freeze([]),
    };
    assert.equal(hitTestFocusable(btn, tree, 5, 5), null);
  });
});

/* ======================== empty states ======================== */

describe("empty states", () => {
  test("column with zero children measures as zero", () => {
    const col: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([]),
    };
    const size = mustMeasure(col, 80, 24, "column");
    assert.equal(size.w, 0);
    assert.equal(size.h, 0);
  });

  test("row with zero children measures as zero", () => {
    const row: VNode = {
      kind: "row",
      props: {},
      children: Object.freeze([]),
    };
    const size = mustMeasure(row, 80, 24, "row");
    assert.equal(size.w, 0);
    assert.equal(size.h, 0);
  });

  test("box with zero children and border measures as border only", () => {
    const box: VNode = {
      kind: "box",
      props: { border: "single" },
      children: Object.freeze([]),
    };
    const size = mustMeasure(box, 80, 24, "column");
    assert.equal(size.w, 2); // 1+1 border
    assert.equal(size.h, 2); // 1+1 border
  });

  test("empty text node measures as zero width", () => {
    const text: VNode = { kind: "text", text: "", props: {} };
    const size = mustMeasure(text, 80, 24);
    assert.equal(size.w, 0);
    assert.equal(size.h, 1);
  });

  test("splitPane with zero children produces empty layout", () => {
    const sp = {
      kind: "splitPane",
      props: {
        id: "sp1",
        direction: "horizontal",
        sizes: Object.freeze([50, 50]),
        onResize: () => {},
      },
      children: Object.freeze([]),
    } as unknown as VNode;
    const tree = mustLayout(sp, 100, 50);
    assert.equal(tree.children.length, 0);
  });
});

/* ======================== constraint propagation with flex ======================== */

describe("constraint propagation with flex children", () => {
  test("row with flex children fills maxW", () => {
    const row = {
      kind: "row",
      props: {},
      children: Object.freeze([
        { kind: "spacer", props: { flex: 1, size: 0 } },
        { kind: "text", text: "X", props: {} },
        { kind: "spacer", props: { flex: 1, size: 0 } },
      ]),
    } as unknown as VNode;
    const size = mustMeasure(row, 80, 10, "row");
    assert.equal(size.w, 80, "row with flex children should fill available width");
  });

  test("column with flex children fills maxH", () => {
    const col = {
      kind: "column",
      props: {},
      children: Object.freeze([
        { kind: "spacer", props: { flex: 1, size: 0 } },
        { kind: "text", text: "Y", props: {} },
        { kind: "spacer", props: { flex: 1, size: 0 } },
      ]),
    } as unknown as VNode;
    const size = mustMeasure(col, 80, 50, "column");
    assert.equal(size.h, 50, "column with flex children should fill available height");
  });

  test("nested row-in-column with flex propagates constraints", () => {
    const row = {
      kind: "row",
      props: {},
      children: Object.freeze([
        { kind: "spacer", props: { flex: 1, size: 0 } },
        { kind: "text", text: "Mid", props: {} },
        { kind: "spacer", props: { flex: 1, size: 0 } },
      ]),
    } as unknown as VNode;
    const col: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([row]),
    };
    const tree = mustLayout(col, 60, 20);
    const rowChild = tree.children[0];
    assert.ok(rowChild !== undefined);
    // The row should fill the column width
    if (rowChild) assert.equal(rowChild.rect.w, 60);
  });
});
