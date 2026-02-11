import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import { Box, Spacer, Text } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

function renderToVNode(element: React.ReactNode): VNode {
  let last: VNode | null = null;

  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit(vnode) {
      last = vnode;
    },
  };

  const container = createRootContainer(root);
  updateRootContainer(container, element);

  return last ?? ui.text("");
}

describe("reconciler: host tree -> Rezi VNode", () => {
  test("<Text> renders ui.text with style", () => {
    const vnode = renderToVNode(<Text color="redBright">hi</Text>);
    assert.equal(vnode.kind, "text");
    assert.equal(vnode.text, "hi");
    assert.deepEqual(vnode.props.style?.fg, { r: 255, g: 0, b: 0 });
  });

  test("nested <Text> produces richText spans", () => {
    const vnode = renderToVNode(
      <Text>
        <Text bold>hi</Text> there
      </Text>,
    );

    assert.equal(vnode.kind, "richText");
    const spans = vnode.props.spans;
    assert.equal(spans.length, 2);
    assert.deepEqual(spans[0], { text: "hi", style: { bold: true } });
    assert.deepEqual(spans[1], { text: " there" });
  });

  test("<Text> parses ANSI SGR color sequences into richText spans", () => {
    const vnode = renderToVNode(<Text>{"\u001b[31mRED\u001b[0m plain"}</Text>);
    assert.equal(vnode.kind, "richText");
    const spans = vnode.props.spans;
    assert.equal(spans.length, 2);
    assert.deepEqual(spans[0], { text: "RED", style: { fg: { r: 128, g: 0, b: 0 } } });
    assert.deepEqual(spans[1], { text: " plain" });
  });

  test("<Text> supports ANSI 256-color foreground (38;5;n)", () => {
    const vnode = renderToVNode(<Text>{"\u001b[38;5;74mA\u001b[39mB"}</Text>);
    assert.equal(vnode.kind, "richText");
    const spans = vnode.props.spans;
    assert.equal(spans.length, 2);
    assert.deepEqual(spans[0], { text: "A", style: { fg: { r: 95, g: 175, b: 215 } } });
    assert.deepEqual(spans[1], { text: "B" });
  });

  test("<Box flexDirection> maps to ui.row/ui.column", () => {
    const row = renderToVNode(
      <Box flexDirection="row">
        <Text>A</Text>
      </Box>,
    );
    assert.equal(row.kind, "row");

    const col = renderToVNode(
      <Box flexDirection="column">
        <Text>A</Text>
      </Box>,
    );
    assert.equal(col.kind, "column");
  });

  test("<Box borderStyle> wraps stack in ui.box", () => {
    const vnode = renderToVNode(
      <Box borderStyle="round">
        <Text>X</Text>
      </Box>,
    );

    assert.equal(vnode.kind, "box");
    assert.equal(vnode.props.border, "rounded");
    assert.equal(vnode.children.length, 1);
    assert.equal(vnode.children[0]?.kind, "row");
  });

  test("<Spacer> maps to ui.spacer({flex:1})", () => {
    const vnode = renderToVNode(
      <Box flexDirection="row">
        <Text>L</Text>
        <Spacer />
        <Text>R</Text>
      </Box>,
    );

    assert.equal(vnode.kind, "row");
    assert.equal(vnode.children.length, 3);
    assert.equal(vnode.children[1]?.kind, "spacer");
    assert.equal(vnode.children[1]?.props.flex, 1);
  });
});
