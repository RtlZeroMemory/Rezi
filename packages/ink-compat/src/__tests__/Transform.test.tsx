import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import { Text, Transform } from "../index.js";
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
});
