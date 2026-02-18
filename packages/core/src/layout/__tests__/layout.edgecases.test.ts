import { assert, describe, test } from "@rezi-ui/testkit";
import type { VNode } from "../../index.js";
import { hitTestFocusable } from "../hitTest.js";
import type { LayoutTree } from "../layout.js";
import { layout, measure } from "../layout.js";

function mustLayout(vnode: VNode, maxW: number, maxH: number) {
  const res = layout(vnode, 0, 0, maxW, maxH, "column");
  if (!res.ok) {
    assert.fail(`layout failed: ${res.fatal.code}: ${res.fatal.detail}`);
  }
  return res.value;
}

describe("layout edge cases", () => {
  test("leaf widgets clamp to available height=0", () => {
    const nodes: readonly VNode[] = Object.freeze([
      {
        kind: "select",
        props: { id: "select-0", value: "", options: Object.freeze([]) },
      },
      {
        kind: "checkbox",
        props: { id: "checkbox-0", checked: false, label: "Check" },
      },
      {
        kind: "slider",
        props: { id: "slider-0", value: 5, min: 0, max: 10 },
      },
      {
        kind: "radioGroup",
        props: {
          id: "radio-0",
          value: "a",
          options: Object.freeze([
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ]),
          direction: "vertical",
        },
      },
      {
        kind: "sparkline",
        props: { data: Object.freeze([1, 2, 3, 4]) },
      },
      {
        kind: "miniChart",
        props: { values: Object.freeze([{ label: "CPU", value: 0.5 }]) },
      },
    ]);

    for (const vnode of nodes) {
      const tree = mustLayout(vnode, 12, 0);
      assert.equal(tree.rect.h, 0, `${vnode.kind} should clamp to 0 height`);

      if (
        vnode.kind === "select" ||
        vnode.kind === "checkbox" ||
        vnode.kind === "slider" ||
        vnode.kind === "radioGroup"
      ) {
        const hit = hitTestFocusable(vnode, tree, 0, 0);
        assert.equal(hit, null, `${vnode.kind} with zero height should not be hit-testable`);
      }
    }
  });

  test("overflowed column child does not remain hit-testable outside viewport", () => {
    const tree: VNode = {
      kind: "column",
      props: { gap: 0 },
      children: Object.freeze([
        { kind: "text", text: "Header", props: {} },
        {
          kind: "select",
          props: {
            id: "hidden-select",
            value: "",
            options: Object.freeze([{ value: "a", label: "A" }]),
          },
        },
      ]),
    };

    const laidOut = mustLayout(tree, 20, 1);
    const hiddenSelect = laidOut.children[1];
    assert.ok(hiddenSelect !== undefined, "expected second child");
    if (!hiddenSelect) return;

    assert.equal(hiddenSelect.rect.h, 0, "second child should receive zero height");
    assert.equal(
      hitTestFocusable(tree, laidOut, hiddenSelect.rect.x, hiddenSelect.rect.y),
      null,
      "overflowed child should not capture hits",
    );
  });

  test("row overflow metadata clamps scrollX and shifts children", () => {
    const tree: VNode = {
      kind: "row",
      props: { width: 5, overflow: "scroll", scrollX: 99 },
      children: Object.freeze<readonly VNode[]>([
        {
          kind: "box",
          props: { border: "none", mr: -4 },
          children: Object.freeze<readonly VNode[]>([
            { kind: "text", text: "123456789", props: {} },
          ]),
        },
      ]),
    };

    const laidOut = mustLayout(tree, 5, 2);
    assert.deepEqual(laidOut.meta, {
      scrollX: 4,
      scrollY: 0,
      contentWidth: 9,
      contentHeight: 1,
      viewportWidth: 5,
      viewportHeight: 1,
    });
    assert.deepEqual(laidOut.children[0]?.rect, { x: -4, y: 0, w: 9, h: 1 });
  });

  test("column overflow metadata clamps scrollY and shifts children", () => {
    const tree: VNode = {
      kind: "column",
      props: { height: 3, overflow: "scroll", scrollY: 99 },
      children: Object.freeze<readonly VNode[]>([
        {
          kind: "box",
          props: { border: "none", mb: -1 },
          children: Object.freeze<readonly VNode[]>([
            { kind: "text", text: "a", props: {} },
            { kind: "text", text: "b", props: {} },
            { kind: "text", text: "c", props: {} },
            { kind: "text", text: "d", props: {} },
          ]),
        },
      ]),
    };

    const laidOut = mustLayout(tree, 6, 3);
    assert.deepEqual(laidOut.meta, {
      scrollX: 0,
      scrollY: 1,
      contentWidth: 1,
      contentHeight: 4,
      viewportWidth: 1,
      viewportHeight: 3,
    });
    assert.deepEqual(laidOut.children[0]?.rect, { x: 0, y: -1, w: 1, h: 4 });
  });

  test("box overflow metadata clamps both axes and shifts children", () => {
    const tree: VNode = {
      kind: "box",
      props: { border: "none", width: 5, height: 3, overflow: "scroll", scrollX: 99, scrollY: 99 },
      children: Object.freeze<readonly VNode[]>([
        {
          kind: "box",
          props: { border: "none", mr: -4, mb: -1 },
          children: Object.freeze<readonly VNode[]>([
            { kind: "text", text: "123456789", props: {} },
            { kind: "text", text: "line2", props: {} },
            { kind: "text", text: "line3", props: {} },
            { kind: "text", text: "line4", props: {} },
          ]),
        },
      ]),
    };

    const laidOut = mustLayout(tree, 5, 3);
    assert.deepEqual(laidOut.meta, {
      scrollX: 4,
      scrollY: 1,
      contentWidth: 9,
      contentHeight: 4,
      viewportWidth: 5,
      viewportHeight: 3,
    });
    assert.deepEqual(laidOut.children[0]?.rect, { x: -4, y: -1, w: 9, h: 4 });
  });

  test("scroll clamp uses content-origin extent when children start after origin", () => {
    const tree: VNode = {
      kind: "row",
      props: { width: 5, overflow: "scroll", scrollX: 99 },
      children: Object.freeze<readonly VNode[]>([
        {
          kind: "box",
          props: { border: "none", ml: 2, mr: -8 },
          children: Object.freeze<readonly VNode[]>([
            { kind: "text", text: "123456789", props: {} },
          ]),
        },
      ]),
    };

    const laidOut = mustLayout(tree, 5, 2);
    assert.deepEqual(laidOut.meta, {
      scrollX: 6,
      scrollY: 0,
      contentWidth: 11,
      contentHeight: 1,
      viewportWidth: 5,
      viewportHeight: 1,
    });
    assert.deepEqual(laidOut.children[0]?.rect, { x: -4, y: 0, w: 9, h: 1 });
  });

  test("button fractional px is handled deterministically", () => {
    const button: VNode = {
      kind: "button",
      props: { id: "btn", label: "OK", px: 1.7 },
    };

    const laidOut = mustLayout(button, 20, 1);
    assert.equal(laidOut.rect.w, 4, "fractional px should be truncated before measurement");
    assert.equal(laidOut.rect.h, 1);
  });

  test("field without child does not throw during measure/layout", () => {
    const malformedField = {
      kind: "field",
      props: { label: "Name" },
      children: Object.freeze([]),
    } as unknown as VNode;

    const measured = measure(malformedField, 20, 5, "column");
    assert.equal(measured.ok, true, "measure should not throw or fatal");
    if (!measured.ok) return;
    assert.deepEqual(measured.value, { w: 0, h: 2 });

    const laidOut = layout(malformedField, 0, 0, 20, 5, "column");
    assert.equal(laidOut.ok, true, "layout should not throw or fatal");
    if (!laidOut.ok) return;
    assert.equal(laidOut.value.children.length, 0);
    assert.deepEqual(laidOut.value.rect, { x: 0, y: 0, w: 0, h: 2 });
  });

  test("row/column tolerate sparse children arrays without throwing", () => {
    const sparseRow = {
      kind: "row",
      props: {},
      children: Object.freeze([{ kind: "text", text: "A", props: {} }, undefined]),
    } as unknown as VNode;
    const rowLayout = layout(sparseRow, 0, 0, 10, 5, "row");
    assert.equal(rowLayout.ok, true, "row with sparse children should not throw");
    if (rowLayout.ok) {
      assert.equal(rowLayout.value.children.length, 1);
      assert.equal(rowLayout.value.children[0]?.rect.w, 1);
    }

    const sparseColumn = {
      kind: "column",
      props: {},
      children: Object.freeze([{ kind: "text", text: "B", props: {} }, undefined]),
    } as unknown as VNode;
    const columnLayout = layout(sparseColumn, 0, 0, 10, 5, "column");
    assert.equal(columnLayout.ok, true, "column with sparse children should not throw");
    if (columnLayout.ok) {
      assert.equal(columnLayout.value.children.length, 1);
      assert.equal(columnLayout.value.children[0]?.rect.h, 1);
    }
  });

  test("sparse children do not consume justify/gap slots", () => {
    const sparseRow = {
      kind: "row",
      props: { width: 10, gap: 1, justify: "end" },
      children: Object.freeze([{ kind: "text", text: "A", props: {} }, undefined]),
    } as unknown as VNode;
    const rowLayout = layout(sparseRow, 0, 0, 10, 3, "row");
    assert.equal(rowLayout.ok, true, "row with sparse children should layout");
    if (rowLayout.ok) {
      assert.equal(rowLayout.value.children.length, 1);
      assert.deepEqual(rowLayout.value.children[0]?.rect, { x: 9, y: 0, w: 1, h: 1 });
    }

    const sparseColumn = {
      kind: "column",
      props: { height: 10, gap: 1, justify: "end" },
      children: Object.freeze([{ kind: "text", text: "B", props: {} }, undefined]),
    } as unknown as VNode;
    const columnLayout = layout(sparseColumn, 0, 0, 3, 10, "column");
    assert.equal(columnLayout.ok, true, "column with sparse children should layout");
    if (columnLayout.ok) {
      assert.equal(columnLayout.value.children.length, 1);
      assert.deepEqual(columnLayout.value.children[0]?.rect, { x: 0, y: 9, w: 1, h: 1 });
    }
  });

  test("sparse children do not consume flex/percent constraint slots", () => {
    const sparseFlexRow = {
      kind: "row",
      props: { width: 10, gap: 1 },
      children: Object.freeze([
        { kind: "box", props: { border: "none", flex: 1 }, children: Object.freeze([]) },
        undefined,
        { kind: "box", props: { border: "none", flex: 1 }, children: Object.freeze([]) },
      ]),
    } as unknown as VNode;
    const rowLayout = layout(sparseFlexRow, 0, 0, 10, 3, "row");
    assert.equal(rowLayout.ok, true, "row constraint pass with sparse children should layout");
    if (rowLayout.ok) {
      assert.equal(rowLayout.value.children.length, 2);
      assert.deepEqual(rowLayout.value.children[0]?.rect, { x: 0, y: 0, w: 5, h: 0 });
      assert.deepEqual(rowLayout.value.children[1]?.rect, { x: 6, y: 0, w: 4, h: 0 });
    }

    const sparsePercentColumn = {
      kind: "column",
      props: { height: 10, gap: 1 },
      children: Object.freeze([
        { kind: "box", props: { border: "none", height: "50%" }, children: Object.freeze([]) },
        undefined,
        { kind: "box", props: { border: "none", height: "50%" }, children: Object.freeze([]) },
      ]),
    } as unknown as VNode;
    const columnLayout = layout(sparsePercentColumn, 0, 0, 3, 10, "column");
    assert.equal(
      columnLayout.ok,
      true,
      "column constraint pass with sparse children should layout",
    );
    if (columnLayout.ok) {
      assert.equal(columnLayout.value.children.length, 2);
      assert.deepEqual(columnLayout.value.children[0]?.rect, { x: 0, y: 0, w: 0, h: 5 });
      assert.deepEqual(columnLayout.value.children[1]?.rect, { x: 0, y: 6, w: 0, h: 4 });
    }
  });

  test("hit testing respects ancestor clip bounds", () => {
    const child: VNode = { kind: "button", props: { id: "clipped-btn", label: "Click" } };
    const root: VNode = {
      kind: "column",
      props: {},
      children: Object.freeze([child]),
    };

    const clippedLayout: LayoutTree = {
      vnode: root,
      rect: { x: 0, y: 0, w: 3, h: 1 },
      children: Object.freeze([
        {
          vnode: child,
          rect: { x: 2, y: 0, w: 6, h: 1 },
          children: Object.freeze([]),
        },
      ]),
    };

    assert.equal(hitTestFocusable(root, clippedLayout, 2, 0), "clipped-btn");
    assert.equal(
      hitTestFocusable(root, clippedLayout, 4, 0),
      null,
      "point outside ancestor clip must not hit child overflow",
    );
    assert.equal(
      hitTestFocusable(root, clippedLayout, -1, 0),
      null,
      "off-viewport negative coordinates must not hit",
    );
  });

  test("commandPalette clamps malformed maxVisible deterministically", () => {
    const malformed = {
      kind: "commandPalette",
      props: { id: "cp", open: true, query: "", selectedIndex: 0, maxVisible: -9 },
    } as unknown as VNode;

    const laidOut = layout(malformed, 0, 0, 12, 2, "column");
    assert.equal(laidOut.ok, true);
    if (!laidOut.ok) return;
    assert.deepEqual(laidOut.value.rect, { x: 0, y: 0, w: 12, h: 2 });
  });

  test("toastContainer tolerates malformed position without throwing", () => {
    const malformed = {
      kind: "toastContainer",
      props: {
        toasts: "not-an-array",
        position: 42,
        maxVisible: 3,
      },
    } as unknown as VNode;

    const laidOut = layout(malformed, 0, 0, 20, 6, "column");
    assert.equal(laidOut.ok, true);
    if (!laidOut.ok) return;
    assert.deepEqual(laidOut.value.rect, { x: 0, y: 0, w: 20, h: 6 });
  });

  test("modal width:'auto' measures content and actions", () => {
    const modal: VNode = {
      kind: "modal",
      props: {
        id: "m-auto",
        width: "auto",
        content: { kind: "text", text: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", props: {} }, // 30 cols
        actions: Object.freeze([{ kind: "button", props: { id: "ok", label: "OK" } }]),
      },
    };
    const tree: VNode = { kind: "layers", props: {}, children: Object.freeze([modal]) };
    const laidOut = mustLayout(tree, 80, 25);
    const modalLayout = laidOut.children[0];
    assert.ok(modalLayout !== undefined, "expected modal layout node");
    if (!modalLayout) return;
    assert.equal(modalLayout.rect.w, 32);
  });

  test("modal width:'auto' respects maxWidth", () => {
    const modal: VNode = {
      kind: "modal",
      props: {
        id: "m-auto-maxw",
        width: "auto",
        maxWidth: 20,
        content: { kind: "text", text: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", props: {} }, // 30 cols
        actions: Object.freeze([{ kind: "button", props: { id: "ok", label: "OK" } }]),
      },
    };
    const tree: VNode = { kind: "layers", props: {}, children: Object.freeze([modal]) };
    const laidOut = mustLayout(tree, 80, 25);
    const modalLayout = laidOut.children[0];
    assert.ok(modalLayout !== undefined, "expected modal layout node");
    if (!modalLayout) return;
    assert.equal(modalLayout.rect.w, 20);
  });

  test("layer frame border insets content layout by one cell", () => {
    const layer: VNode = {
      kind: "layer",
      props: {
        id: "layer-border-inset",
        frameStyle: { border: { r: 120, g: 121, b: 122 } },
        content: { kind: "text", text: "edge", props: {} },
      },
    };
    const laidOut = mustLayout(layer, 20, 6);
    assert.deepEqual(laidOut.rect, { x: 0, y: 0, w: 20, h: 6 });
    const content = laidOut.children[0];
    assert.ok(content !== undefined, "expected layer content");
    if (!content) return;
    assert.deepEqual(content.rect, { x: 1, y: 1, w: 18, h: 4 });
  });
});
