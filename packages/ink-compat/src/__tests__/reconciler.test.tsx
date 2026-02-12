import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import { Box, Spacer, Text } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

function renderToVNode(
  element: React.ReactNode,
  options: Readonly<{ terminalWidth?: number }> = {},
): VNode {
  let last: VNode | null = null;

  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    ...(typeof options.terminalWidth === "number" ? { internal_terminalWidth: options.terminalWidth } : {}),
    onCommit(vnode) {
      last = vnode;
    },
  };

  const container = createRootContainer(root);
  updateRootContainer(container, element);

  return last ?? ui.text("");
}

function expectText(vnode: VNode): string {
  assert.equal(vnode.kind, "text");
  return vnode.text;
}

function firstTextInSubtree(vnode: VNode): string | null {
  if (vnode.kind === "text") return vnode.text;
  if ("children" in vnode && Array.isArray(vnode.children)) {
    for (const child of vnode.children) {
      if (!child) continue;
      const text = firstTextInSubtree(child);
      if (text !== null) return text;
    }
  }
  return null;
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

  test("<Text wrap='wrap'> wraps at terminal width fallback", () => {
    const vnode = renderToVNode(<Text wrap="wrap">abcdef</Text>, { terminalWidth: 4 });
    assert.equal(vnode.kind, "column");
    assert.equal(vnode.children.length, 2);
    assert.equal(expectText(vnode.children[0] as VNode), "abcd");
    assert.equal(expectText(vnode.children[1] as VNode), "ef");
  });

  test("<Text wrap='truncate-*'> applies Ink truncate variants", () => {
    const end = renderToVNode(<Text wrap="truncate">abcdefgh</Text>, { terminalWidth: 5 });
    const middle = renderToVNode(<Text wrap="truncate-middle">abcdefgh</Text>, { terminalWidth: 5 });
    const start = renderToVNode(<Text wrap="truncate-start">abcdefgh</Text>, { terminalWidth: 5 });

    assert.equal(expectText(end), "abcd…");
    assert.equal(expectText(middle), "ab…gh");
    assert.equal(expectText(start), "…efgh");
  });

  test("Text width resolves from nearest Box width minus border/padding insets", () => {
    const vnode = renderToVNode(
      <Box width={10} borderStyle="single" paddingX={1}>
        <Text wrap="truncate">abcdefghij</Text>
      </Box>,
      { terminalWidth: 40 },
    );

    assert.equal(vnode.kind, "box");
    const content = vnode.children[0];
    assert.ok(content);
    assert.equal(firstTextInSubtree(content as VNode), "abcde…");
  });
});
