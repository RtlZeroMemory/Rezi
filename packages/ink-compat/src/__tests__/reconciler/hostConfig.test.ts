import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { hostConfig } from "../../reconciler/hostConfig.js";
import { reconciler } from "../../reconciler/reconciler.js";
import { createHostContainer } from "../../reconciler/types.js";

/**
 * Internal reconciler unit tests intentionally bypass the render harness so we can
 * assert host tree identity and hostConfig mutation semantics directly.
 */

function commitSync(container: unknown, element: React.ReactNode): void {
  if (typeof reconciler.updateContainerSync === "function") {
    reconciler.updateContainerSync(element, container, null, null);
    reconciler.flushSyncWork?.();
    reconciler.flushPassiveEffects?.();
    return;
  }

  reconciler.updateContainer(element, container, null, () => {});
}

function createReactRoot() {
  const rootNode = createHostContainer();
  const root = reconciler.createContainer(
    rootNode,
    0,
    null,
    false,
    null,
    "",
    () => {},
    null,
    null,
    null,
  );

  return { rootNode, root };
}

test("renders nested host tree from React elements", () => {
  const { rootNode, root } = createReactRoot();

  commitSync(
    root,
    React.createElement(
      "ink-box",
      { id: "outer" },
      React.createElement("ink-text", { color: "green" }, "Hello"),
      React.createElement(
        "ink-box",
        { id: "inner" },
        React.createElement("ink-text", null, "World"),
      ),
    ),
  );

  assert.equal(rootNode.children.length, 1);
  const outer = rootNode.children[0]!;
  assert.equal(outer.type, "ink-box");
  assert.equal(outer.children.length, 2);

  const textNode = outer.children[0]!;
  assert.equal(textNode.type, "ink-text");
  assert.equal(textNode.children.length, 1);
  assert.equal(textNode.children[0]?.textContent, "Hello");

  const inner = outer.children[1]!;
  assert.equal(inner.type, "ink-box");
  assert.equal(inner.children[0]?.type, "ink-text");
  assert.equal(inner.children[0]?.children[0]?.textContent, "World");
});

test("commit update updates node props and text", () => {
  const { rootNode, root } = createReactRoot();

  commitSync(root, React.createElement("ink-text", { color: "red" }, "Old"));
  const node = rootNode.children[0]!;

  commitSync(root, React.createElement("ink-text", { color: "blue" }, "New"));
  const nodeAfter = rootNode.children[0]!;

  assert.strictEqual(node, nodeAfter, "should be same instance (in-place update)");
  assert.equal(nodeAfter.props["color"], "blue");
  assert.equal(nodeAfter.children[0]?.textContent, "New");
});

test("prepareUpdate performs shallow comparison without children/ref", () => {
  const instance = {
    type: "ink-box",
    props: {},
    children: [],
    parent: null,
    textContent: null,
  } as any;

  assert.equal(
    hostConfig.prepareUpdate(
      instance,
      "ink-box",
      { id: "a", children: [1], ref: {} },
      { id: "a", children: [2], ref: null },
    ),
    false,
  );
  assert.equal(hostConfig.prepareUpdate(instance, "ink-box", { id: "a" }, { id: "b" }), true);
  assert.equal(hostConfig.prepareUpdate(instance, "ink-box", { id: "a" }, { id: "a", x: 1 }), true);
});
