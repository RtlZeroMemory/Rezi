import assert from "node:assert/strict";
import test from "node:test";

import {
  type InkHostContainer,
  type InkHostNode,
  appendChild,
  createHostContainer,
  createHostNode,
} from "../../reconciler/types.js";
import {
  translateDynamicTree,
  translateStaticTree,
  translateTree,
} from "../../translation/propsToVNode.js";

function textLeaf(value: string): InkHostNode {
  const leaf = createHostNode("ink-text", {});
  leaf.textContent = value;
  return leaf;
}

function textNode(value: string, props: Record<string, unknown> = {}): InkHostNode {
  const node = createHostNode("ink-text", props);
  appendChild(node, textLeaf(value));
  return node;
}

function boxNode(props: Record<string, unknown> = {}, children: InkHostNode[] = []): InkHostNode {
  const box = createHostNode("ink-box", props);
  for (const child of children) {
    appendChild(box, child);
  }
  return box;
}

function containerWith(node: InkHostNode): InkHostContainer {
  const container = createHostContainer();
  appendChild(container, node);
  return container;
}

test("simple <Box> translates to row (default direction)", () => {
  const node = boxNode({}, [textNode("A"), textNode("B")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "row");
  assert.equal(vnode.props.gap, 0);
  assert.equal(vnode.props.flexShrink, 1);
  assert.equal(vnode.children.length, 2);
});

test("row direction maps to ui.row", () => {
  const node = boxNode({ flexDirection: "row" }, [textNode("L"), textNode("R")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "row");
  assert.equal(vnode.props.gap, 0);
  assert.equal(vnode.children.length, 2);
});

test("bordered box maps border style", () => {
  const node = boxNode({ borderStyle: "round" }, [textNode("Content")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "box");
  assert.equal(vnode.props.border, "rounded");
});

test("bordered box maps per-edge border styles", () => {
  const node = boxNode(
    {
      borderStyle: "single",
      borderTopColor: "red",
      borderRightColor: "green",
      borderBottomColor: "blue",
      borderLeftColor: "yellow",
      borderTopDimColor: true,
      borderLeftDimColor: true,
    },
    [textNode("Content")],
  );
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "box");
  assert.deepEqual(vnode.props.borderStyleSides.top, { fg: { r: 205, g: 0, b: 0 }, dim: true });
  assert.deepEqual(vnode.props.borderStyleSides.right, { fg: { r: 0, g: 205, b: 0 } });
  assert.deepEqual(vnode.props.borderStyleSides.bottom, { fg: { r: 0, g: 0, b: 238 } });
  assert.deepEqual(vnode.props.borderStyleSides.left, { fg: { r: 205, g: 205, b: 0 }, dim: true });
});

test("bordered row box nests ui.row inside ui.box", () => {
  const node = boxNode({ borderStyle: "round", flexDirection: "row" }, [
    textNode("A"),
    textNode("B"),
  ]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "box");
  assert.equal(vnode.children.length, 1);
  assert.equal(vnode.children[0]?.kind, "row");
  assert.equal(vnode.children[0]?.children.length, 2);
});

test("arrow border style falls back to single", () => {
  const node = boxNode({ borderStyle: "arrow" }, [textNode("Content")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "box");
  assert.equal(vnode.props.border, "single");
});

test("background-only box explicitly disables default borders", () => {
  const node = boxNode({ backgroundColor: "#1c1c1c" }, [textNode("Content")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "box");
  assert.equal(vnode.props.border, "none");
  assert.deepEqual(vnode.props.style, { bg: { r: 28, g: 28, b: 28 } });
});

test("background-only row box keeps row layout without implicit border", () => {
  const node = boxNode({ backgroundColor: "#1c1c1c", flexDirection: "row" }, [
    textNode("A"),
    textNode("B"),
  ]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "box");
  assert.equal(vnode.props.border, "none");
  assert.equal(vnode.children[0]?.kind, "row");
  assert.equal(vnode.children[0]?.children.length, 2);
});

test("styled text maps to text style", () => {
  const node = textNode("Hello", { color: "green", bold: true });
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "text");
  assert.equal(vnode.text, "Hello");
  assert.deepEqual(vnode.props.style, { fg: { r: 0, g: 205, b: 0 }, bold: true });
});

test("nested text produces richText spans", () => {
  const parent = createHostNode("ink-text", { color: "green" });
  const child = createHostNode("ink-text", { bold: true });
  appendChild(child, textLeaf("World"));
  appendChild(parent, textLeaf("Hello "));
  appendChild(parent, child);

  const vnode = translateTree(containerWith(parent)) as any;

  assert.equal(vnode.kind, "richText");
  assert.equal(vnode.props.spans.length, 2);
  assert.equal(vnode.props.spans[0]?.text, "Hello ");
  assert.equal(vnode.props.spans[1]?.text, "World");
  assert.equal(vnode.props.spans[1]?.style?.bold, true);
});

test("styled multiline text splits into stacked line nodes", () => {
  const parent = createHostNode("ink-text", { color: "green" });
  const child = createHostNode("ink-text", { bold: true });
  appendChild(child, textLeaf("Logo\nMark"));
  appendChild(parent, textLeaf("Gemini "));
  appendChild(parent, child);

  const vnode = translateTree(containerWith(parent)) as any;

  assert.equal(vnode.kind, "column");
  assert.equal(vnode.props.gap, 0);
  assert.equal(vnode.children.length, 2);
  assert.equal(vnode.children[0]?.kind, "richText");
  assert.equal(vnode.children[1]?.kind, "text");
  assert.equal(vnode.children[0]?.props.spans[0]?.text, "Gemini ");
  assert.equal(vnode.children[0]?.props.spans[1]?.text, "Logo");
  assert.equal(vnode.children[0]?.props.spans[1]?.style?.bold, true);
  assert.equal(vnode.children[1]?.text, "Mark");
  assert.equal(vnode.children[1]?.props.style?.bold, true);
});

test("ANSI SGR sequences map to richText styles", () => {
  const node = createHostNode("ink-text", {});
  appendChild(node, textLeaf("\u001b[31mRed\u001b[0m plain \u001b[7mInv\u001b[27m"));

  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "richText");
  assert.equal(vnode.props.spans.length, 3);
  assert.equal(vnode.props.spans[0]?.text, "Red");
  assert.deepEqual(vnode.props.spans[0]?.style?.fg, { r: 205, g: 0, b: 0 });
  assert.equal(vnode.props.spans[1]?.text, " plain ");
  assert.equal("inverse" in (vnode.props.spans[1]?.style ?? {}), false);
  assert.equal(vnode.props.spans[2]?.text, "Inv");
  assert.equal(vnode.props.spans[2]?.style?.inverse, true);
});

test("ANSI reset restores parent style", () => {
  const node = createHostNode("ink-text", { color: "green" });
  appendChild(node, textLeaf("A\u001b[31mB\u001b[39mC"));

  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "richText");
  assert.equal(vnode.props.spans.length, 3);
  assert.equal(vnode.props.spans[0]?.text, "A");
  assert.deepEqual(vnode.props.spans[0]?.style?.fg, { r: 0, g: 205, b: 0 });
  assert.equal(vnode.props.spans[1]?.text, "B");
  assert.deepEqual(vnode.props.spans[1]?.style?.fg, { r: 205, g: 0, b: 0 });
  assert.equal(vnode.props.spans[2]?.text, "C");
  assert.deepEqual(vnode.props.spans[2]?.style?.fg, { r: 0, g: 205, b: 0 });
});

test("ANSI truecolor maps to RGB style", () => {
  const node = createHostNode("ink-text", {});
  appendChild(node, textLeaf("\u001b[38;2;120;80;200mC\u001b[0m"));

  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "richText");
  assert.equal(vnode.props.spans.length, 1);
  assert.equal(vnode.props.spans[0]?.text, "C");
  assert.deepEqual(vnode.props.spans[0]?.style?.fg, { r: 120, g: 80, b: 200 });
});

test("ANSI truecolor colon form maps to RGB style", () => {
  const node = createHostNode("ink-text", {});
  appendChild(node, textLeaf("\u001b[38:2::255:120:40mX\u001b[0m"));

  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "richText");
  assert.equal(vnode.props.spans.length, 1);
  assert.equal(vnode.props.spans[0]?.text, "X");
  assert.deepEqual(vnode.props.spans[0]?.style?.fg, { r: 255, g: 120, b: 40 });
});

test("spacer virtual node maps to ui.spacer", () => {
  const spacer = createHostNode("ink-virtual", { __inkType: "spacer" });
  const vnode = translateTree(containerWith(spacer)) as any;

  assert.equal(vnode.kind, "spacer");
  assert.equal(vnode.props.flex, 1);
});

test("newline inside text inserts newline characters", () => {
  const node = createHostNode("ink-text", {});
  appendChild(node, textLeaf("A"));
  appendChild(node, createHostNode("ink-virtual", { __inkType: "newline", count: 1 }));
  appendChild(node, textLeaf("B"));

  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "column");
  assert.equal(vnode.props.gap, 0);
  assert.equal(vnode.children.length, 2);
  assert.equal(vnode.children[0]?.kind, "text");
  assert.equal(vnode.children[1]?.kind, "text");
  assert.equal(vnode.children[0]?.text, "A");
  assert.equal(vnode.children[1]?.text, "B");
});

test("newline count=0 does not insert line breaks", () => {
  const node = createHostNode("ink-text", {});
  appendChild(node, textLeaf("A"));
  appendChild(node, createHostNode("ink-virtual", { __inkType: "newline", count: 0 }));
  appendChild(node, textLeaf("B"));

  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "text");
  assert.equal(vnode.text, "AB");
});

test("display none elides node", () => {
  const container = createHostContainer();
  appendChild(container, boxNode({ display: "none" }, [textNode("Hidden")]));
  const vnode = translateTree(container) as any;

  assert.equal(vnode.kind, "text");
  assert.equal(vnode.text, "");
});

test("flexShrink defaults to 1 when not set", () => {
  const node = boxNode({ flexGrow: 2 }, [textNode("X")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.props.flex, 2);
  assert.equal(vnode.props.flexShrink, 1);
});

test("percent dimensions map to native percent strings or markers", () => {
  const node = boxNode(
    {
      width: "100%",
      height: "50%",
      minWidth: "25%",
      minHeight: "75%",
      flexBasis: "40%",
    },
    [textNode("Body")],
  );
  const vnode = translateTree(containerWith(node)) as any;

  // width, height, flexBasis: passed as native percent strings (layout engine resolves them)
  assert.equal(vnode.props.width, "100%");
  assert.equal(vnode.props.height, "50%");
  assert.equal(vnode.props.flexBasis, "40%");
  // minWidth, minHeight: still use markers (layout engine only accepts numbers)
  assert.equal(vnode.props.__inkPercentMinWidth, 25);
  assert.equal(vnode.props.__inkPercentMinHeight, 75);
});

test("wrap-reverse is approximated as wrap + reverse", () => {
  const node = boxNode({ flexDirection: "row", flexWrap: "wrap-reverse" }, [
    textNode("A"),
    textNode("B"),
  ]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "row");
  assert.equal(vnode.props.wrap, true);
  assert.equal(vnode.props.reverse, true);
});

test("absolute position maps to layout props", () => {
  const node = boxNode({ position: "absolute", top: 1, right: 2, bottom: 3, left: 4 }, [
    textNode("A"),
  ]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.props.position, "absolute");
  assert.equal(vnode.props.top, 1);
  assert.equal(vnode.props.right, 2);
  assert.equal(vnode.props.bottom, 3);
  assert.equal(vnode.props.left, 4);
});

test("accessibility labels map on Box and Text", () => {
  const box = boxNode({ "aria-label": "Container" }, [textNode("A")]);
  const boxVNode = translateTree(containerWith(box)) as any;
  assert.equal(boxVNode.props.accessibilityLabel, "Container");

  const text = textNode("Hello", { accessibilityLabel: "Greeting" });
  const textVNode = translateTree(containerWith(text)) as any;
  assert.equal(textVNode.props.accessibilityLabel, "Greeting");
});

test("flexGrow is always forwarded even inside auto-height column parents", () => {
  // In the default Ink chain (flexShrink defaults to 1), column children
  // still participate in main-axis resolution, so flexGrow is forwarded.
  const node = boxNode({ flexDirection: "column" }, [
    boxNode({ flexDirection: "column", flexGrow: 1 }, [textNode("Inner")]),
  ]);
  const vnode = translateTree(containerWith(node)) as any;
  const child = vnode.children[0];

  assert.equal(vnode.kind, "column");
  assert.equal(child?.kind, "column");
  assert.equal(child?.props.flex, 1);
});

test("flexGrow is skipped for column children when parent main size is auto", () => {
  const node = boxNode({ flexDirection: "column", flexShrink: 0 }, [
    boxNode({ flexDirection: "column", flexGrow: 1 }, [textNode("Inner")]),
  ]);
  const vnode = translateTree(containerWith(node)) as any;
  const child = vnode.children[0];

  assert.equal(vnode.kind, "column");
  assert.equal(child?.kind, "column");
  assert.equal(child?.props.flex, undefined);
});

test("flexGrow is skipped for row children when parent main size is auto", () => {
  const node = boxNode({ flexDirection: "column", flexShrink: 0 }, [
    boxNode({ flexDirection: "row", flexGrow: 1 }, [textNode("Inner")]),
  ]);
  const vnode = translateTree(containerWith(node)) as any;
  const child = vnode.children[0];

  assert.equal(vnode.kind, "column");
  assert.equal(child?.kind, "row");
  assert.equal(child?.props.flex, undefined);
});

test("flexGrow is preserved under root overflow-hidden column", () => {
  const node = boxNode({ flexDirection: "column", overflow: "hidden" }, [
    boxNode({ flexDirection: "column", flexGrow: 1 }, [textNode("Inner")]),
    textNode("Footer"),
  ]);
  const vnode = translateTree(containerWith(node)) as any;
  const child = vnode.children[0];

  assert.equal(vnode.kind, "column");
  assert.equal(vnode.props.overflow, "hidden");
  assert.equal(child?.kind, "column");
  assert.equal(child?.props.flex, 1);
});

// Regression: flexGrow must propagate through intermediate columns in a
// definite-height chain (root overflow:hidden > column > column with flexGrow).
// This is the exact pattern Gemini CLI uses for its main content area.
test("flexGrow propagates through nested definite column chain", () => {
  // root: overflow:hidden column (definite via coercion)
  //   └─ intermediate column (no explicit height, inherits definiteness)
  //       ├─ child with flexGrow:1 (should receive flex:1)
  //       └─ text "Footer"
  const node = boxNode({ flexDirection: "column", overflow: "hidden" }, [
    boxNode({ flexDirection: "column" }, [
      boxNode({ flexDirection: "column", flexGrow: 1 }, [textNode("Content")]),
      textNode("Footer"),
    ]),
  ]);
  const vnode = translateTree(containerWith(node)) as any;

  // root column → intermediate column → flexGrow child
  const intermediate = vnode.children[0];
  assert.equal(intermediate?.kind, "column", "intermediate should be a column");

  const growChild = intermediate?.children?.[0];
  assert.equal(growChild?.kind, "column", "grow child should be a column");
  assert.equal(
    growChild?.props.flex,
    1,
    "flexGrow should propagate through intermediate definite column",
  );
});

test("forced flex compat skips non-overflow column containers", () => {
  const node = boxNode({ flexDirection: "column", overflow: "hidden" }, [
    boxNode({ flexDirection: "column", width: 40, flexGrow: 0, flexShrink: 0 }, [textNode("Body")]),
  ]);
  const vnode = translateTree(containerWith(node)) as any;
  const child = vnode.children[0];

  assert.equal(child?.kind, "column");
  assert.equal(child?.props.flex, 0);
});

test("forced flex compat applies for overflow/clip column containers", () => {
  const node = boxNode({ flexDirection: "column", overflow: "hidden" }, [
    boxNode(
      {
        flexDirection: "column",
        width: 40,
        flexGrow: 0,
        flexShrink: 0,
        overflow: "hidden",
      },
      [textNode("Body")],
    ),
  ]);
  const vnode = translateTree(containerWith(node)) as any;
  const child = vnode.children[0];

  assert.equal(child?.kind, "column");
  assert.equal(child?.props.flex, 1);
});

test("padding and margin shorthands map correctly", () => {
  const node = boxNode({ paddingX: 2, paddingY: 1, marginTop: 3, marginLeft: 4 }, [textNode("X")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.props.px, 2);
  assert.equal(vnode.props.py, 1);
  assert.equal(vnode.props.mt, 3);
  assert.equal(vnode.props.ml, 4);
});

test("alignment values are translated", () => {
  const node = boxNode(
    { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
    [textNode("A"), textNode("B")],
  );
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "row");
  assert.equal(vnode.props.items, "end");
  assert.equal(vnode.props.justify, "between");
  assert.equal("align" in vnode.props, false);
});

test("scroll overflow maps scroll props and scrollbar style", () => {
  const node = boxNode(
    {
      overflowX: "hidden",
      overflowY: "scroll",
      scrollLeft: 2.7,
      scrollTop: 5.9,
      scrollbarThumbColor: "#123456",
    },
    [textNode("Body")],
  );
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.props.overflow, "scroll");
  assert.equal(vnode.props.scrollX, 2);
  assert.equal(vnode.props.scrollY, 5);
  assert.deepEqual(vnode.props.scrollbarStyle, { fg: { r: 18, g: 52, b: 86 } });
});

test("hidden overflow stays hidden without scroll axis", () => {
  const node = boxNode({ overflow: "hidden", overflowX: "hidden" }, [textNode("Body")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.props.overflow, "hidden");
  assert.equal("scrollX" in vnode.props, false);
  assert.equal("scrollY" in vnode.props, false);
});

test("static box renders as plain column", () => {
  const node = boxNode({ __inkStatic: true }, [textNode("A"), textNode("B")]);
  const vnode = translateTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "column");
  assert.equal(vnode.props.gap, 0);
  assert.equal("position" in vnode.props, false);
  assert.equal(vnode.children.length, 2);
});

test("dynamic translation skips static subtrees", () => {
  const node = boxNode({}, [
    textNode("Dynamic"),
    boxNode({ __inkStatic: true }, [textNode("Static")]),
  ]);
  const vnode = translateDynamicTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "row");
  assert.equal(vnode.children.length, 1);
  assert.equal(vnode.children[0]?.kind, "text");
  assert.equal(vnode.children[0]?.text, "Dynamic");
});

test("static translation extracts static output regardless declaration order", () => {
  const node = boxNode({}, [
    textNode("Dynamic"),
    boxNode({ __inkStatic: true }, [textNode("Static")]),
  ]);
  const vnode = translateStaticTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "column");
  assert.equal(vnode.children.length, 1);
  assert.equal(vnode.children[0]?.kind, "text");
  assert.equal(vnode.children[0]?.text, "Static");
});

test("static translation preserves static style props except absolute positioning", () => {
  const node = boxNode(
    {
      __inkStatic: true,
      marginTop: 2,
      paddingX: 3,
      width: 40,
      position: "absolute",
      top: 1,
      left: 2,
    },
    [textNode("Static")],
  );
  const vnode = translateStaticTree(containerWith(node)) as any;

  assert.equal(vnode.kind, "column");
  assert.equal(vnode.props.mt, 2);
  assert.equal(vnode.props.px, 3);
  assert.equal(vnode.props.width, 40);
  assert.equal("position" in vnode.props, false);
  assert.equal("top" in vnode.props, false);
  assert.equal("left" in vnode.props, false);
});
