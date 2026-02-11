import { type VNode, ui } from "@rezi-ui/core";
import { assert, describe, test } from "@rezi-ui/testkit";
import type React from "react";
import { Static, Text } from "../index.js";
import reconciler, {
  createRootContainer,
  updateRootContainer,
  type HostRoot,
} from "../reconciler.js";

function createHarness() {
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

  return {
    update(element: React.ReactNode) {
      updateRootContainer(container, element);
    },
    getLast(): VNode {
      return last ?? ui.text("");
    },
  };
}

describe("<Static>", () => {
  test("accumulates static output across updates", () => {
    const h = createHarness();

    const render = (items: number[]) => (
      <>
        <Static items={items}>{(item, i) => <Text key={String(i)}>{String(item)}</Text>}</Static>
        <Text>dyn</Text>
      </>
    );

    h.update(render([1]));
    const first = h.getLast();

    assert.equal(first.kind, "column");
    assert.equal(first.children.length, 2);
    assert.equal(first.children[0]?.kind, "column");
    assert.equal(first.children[0]?.children[0]?.kind, "text");
    assert.equal(first.children[0]?.children[0]?.text, "1");
    assert.equal(first.children[1]?.kind, "text");
    assert.equal(first.children[1]?.text, "dyn");

    h.update(render([1, 2]));
    const second = h.getLast();

    assert.equal(second.kind, "column");
    assert.equal(second.children.length, 3);
    assert.equal(second.children[0]?.kind, "column");
    assert.equal(second.children[0]?.children[0]?.kind, "text");
    assert.equal(second.children[0]?.children[0]?.text, "1");
    assert.equal(second.children[1]?.kind, "column");
    assert.equal(second.children[1]?.children[0]?.kind, "text");
    assert.equal(second.children[1]?.children[0]?.text, "2");
    assert.equal(second.children[2]?.kind, "text");
    assert.equal(second.children[2]?.text, "dyn");
  });
});
