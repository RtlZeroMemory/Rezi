import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import { Newline, Text } from "../index.js";
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

describe("<Newline>", () => {
  test("splits <Text> into multiple lines", () => {
    const vnode = renderToVNode(
      <Text>
        Hello
        <Newline />
        World
      </Text>,
    );

    assert.equal(vnode.kind, "column");
    assert.equal(vnode.children.length, 2);
    assert.equal(vnode.children[0]?.kind, "text");
    assert.equal(vnode.children[0]?.text, "Hello");
    assert.equal(vnode.children[1]?.kind, "text");
    assert.equal(vnode.children[1]?.text, "World");
  });

  test("count=2 produces a blank line", () => {
    const vnode = renderToVNode(
      <Text>
        A<Newline count={2} />B
      </Text>,
    );

    assert.equal(vnode.kind, "column");
    assert.equal(vnode.children.length, 3);
    assert.equal(vnode.children[0]?.kind, "text");
    assert.equal(vnode.children[0]?.text, "A");
    assert.equal(vnode.children[1]?.kind, "text");
    assert.equal(vnode.children[1]?.text, "");
    assert.equal(vnode.children[2]?.kind, "text");
    assert.equal(vnode.children[2]?.text, "B");
  });
});
