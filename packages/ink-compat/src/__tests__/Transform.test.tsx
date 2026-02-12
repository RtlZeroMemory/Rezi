import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import AccessibilityContext from "../context/AccessibilityContext.js";
import { Text, Transform } from "../index.js";
import { createRootContainer, type HostElement, updateRootContainer, type HostRoot } from "../reconciler.js";

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

function renderToRoot(element: React.ReactNode): HostRoot {
  const root: HostRoot = {
    kind: "root",
    children: [],
    staticVNodes: [],
    onCommit() {},
  };

  const container = createRootContainer(root);
  updateRootContainer(container, element);
  return root;
}

function asElement(node: HostRoot["children"][number] | undefined): HostElement {
  assert.ok(node !== undefined);
  assert.equal(node.kind, "element");
  return node;
}

describe("<Transform>", () => {
  test("applies transform to flattened text (best-effort)", () => {
    const vnode = renderToVNode(
      <Text>
        <Transform transform={(s) => s.toUpperCase()}>hi</Transform>
      </Text>,
    );

    assert.equal(vnode.kind, "text");
    assert.equal(vnode.text, "HI");
  });

  test("transform sees per-line index", () => {
    const vnode = renderToVNode(
      <Text>
        <Transform transform={(s, i) => `${i}:${s}`}>a{"\n"}b</Transform>
      </Text>,
    );

    assert.equal(vnode.kind, "column");
    assert.equal(vnode.children.length, 2);
    assert.equal(vnode.children[0]?.kind, "text");
    assert.equal(vnode.children[0]?.text, "0:a");
    assert.equal(vnode.children[1]?.kind, "text");
    assert.equal(vnode.children[1]?.text, "1:b");
  });

  test("transform ANSI SGR output is parsed into styled text", () => {
    const vnode = renderToVNode(
      <Text>
        <Transform transform={(s) => `\u001b[38;5;74m${s}\u001b[0m plain`}>X</Transform>
      </Text>,
    );

    assert.equal(vnode.kind, "richText");
    const spans = vnode.props.spans;
    assert.equal(spans.length, 2);
    assert.deepEqual(spans[0], { text: "X", style: { fg: { r: 95, g: 175, b: 215 } } });
    assert.deepEqual(spans[1], { text: " plain" });
  });

  test("uses default row text style for host node", () => {
    const root = renderToRoot(<Transform transform={(s) => s}>x</Transform>);
    const node = asElement(root.children[0]);
    assert.deepEqual(node.style, { flexGrow: 0, flexShrink: 1, flexDirection: "row" });
  });

  test("accessibilityLabel only overrides output when screen reader mode is enabled", () => {
    const srVNode = renderToVNode(
      <AccessibilityContext.Provider value={true}>
        <Transform accessibilityLabel="screen-reader" transform={(s) => s}>
          visual
        </Transform>
      </AccessibilityContext.Provider>,
    );
    assert.equal(srVNode.kind, "text");
    assert.equal(srVNode.text, "screen-reader");

    const nonSrVNode = renderToVNode(
      <Transform accessibilityLabel="screen-reader" transform={(s) => s}>
        visual
      </Transform>,
    );
    assert.equal(nonSrVNode.kind, "text");
    assert.equal(nonSrVNode.text, "visual");
  });
});
