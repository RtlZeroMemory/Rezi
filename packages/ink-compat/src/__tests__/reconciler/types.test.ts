import assert from "node:assert/strict";
import test from "node:test";

import {
  appendChild,
  createHostContainer,
  createHostNode,
  insertBefore,
  removeChild,
  setNodeProps,
  setNodeTextContent,
} from "../../reconciler/types.js";

/**
 * Internal reconciler structure tests intentionally exercise low-level helpers
 * directly (without the higher-level render harness) to catch tree mutation bugs.
 */

test("appendChild attaches child and sets parent for host node", () => {
  const parent = createHostNode("ink-box", {});
  const child = createHostNode("ink-text", {});

  appendChild(parent, child);

  assert.equal(parent.children.length, 1);
  assert.equal(parent.children[0], child);
  assert.equal(child.parent, parent);
});

test("appendChild to container keeps parent null", () => {
  const container = createHostContainer();
  const child = createHostNode("ink-box", {});

  appendChild(container, child);

  assert.equal(container.children.length, 1);
  assert.equal(child.parent, null);
});

test("removeChild detaches existing child", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", {});
  const childB = createHostNode("ink-text", {});

  appendChild(parent, childA);
  appendChild(parent, childB);

  removeChild(parent, childA);

  assert.deepEqual(parent.children, [childB]);
  assert.equal(childA.parent, null);
  assert.equal(childB.parent, parent);
});

test("insertBefore inserts in front of target child", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", { id: "a" });
  const childB = createHostNode("ink-text", { id: "b" });
  const childC = createHostNode("ink-text", { id: "c" });

  appendChild(parent, childA);
  appendChild(parent, childC);

  insertBefore(parent, childB, childC);

  assert.deepEqual(parent.children, [childA, childB, childC]);
  assert.equal(childB.parent, parent);
});

test("insertBefore throws when target is missing", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", { id: "a" });
  const childB = createHostNode("ink-text", { id: "b" });
  const missing = createHostNode("ink-text", { id: "missing" });

  appendChild(parent, childA);
  assert.throws(() => insertBefore(parent, childB, missing), /ZRUI_INSERT_BEFORE_TARGET_MISSING/);
  assert.deepEqual(parent.children, [childA]);
});

test("appendChild moves existing child without duplication", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", { id: "a" });
  const childB = createHostNode("ink-text", { id: "b" });

  appendChild(parent, childA);
  appendChild(parent, childB);
  appendChild(parent, childA);

  assert.deepEqual(parent.children, [childB, childA]);
  assert.equal(parent.children.filter((child) => child === childA).length, 1);
});

test("insertBefore moves existing child without duplication", () => {
  const parent = createHostNode("ink-box", {});
  const childA = createHostNode("ink-text", { id: "a" });
  const childB = createHostNode("ink-text", { id: "b" });
  const childC = createHostNode("ink-text", { id: "c" });

  appendChild(parent, childA);
  appendChild(parent, childB);
  appendChild(parent, childC);
  insertBefore(parent, childC, childA);

  assert.deepEqual(parent.children, [childC, childA, childB]);
  assert.equal(parent.children.filter((child) => child === childC).length, 1);
});

test("appendChild detaches from previous non-container parent", () => {
  const parentA = createHostNode("ink-box", { id: "a" });
  const parentB = createHostNode("ink-box", { id: "b" });
  const child = createHostNode("ink-text", { id: "x" });

  appendChild(parentA, child);
  appendChild(parentB, child);

  assert.deepEqual(parentA.children, []);
  assert.deepEqual(parentB.children, [child]);
  assert.equal(child.parent, parentB);
});

test("container ANSI subtree flag tracks deep leaf add/remove", () => {
  const container = createHostContainer();
  const outer = createHostNode("ink-box", {});
  const inner = createHostNode("ink-box", {});
  const text = createHostNode("ink-text", {});

  setNodeTextContent(text, "plain \u001b[31mred\u001b[0m");
  appendChild(inner, text);
  appendChild(outer, inner);
  appendChild(container, outer);

  assert.equal(container.__inkSubtreeHasAnsiSgr, true);

  removeChild(inner, text);
  assert.equal(container.__inkSubtreeHasAnsiSgr, false);
});

test("container static subtree flag tracks prop updates and removal", () => {
  const container = createHostContainer();
  const dynamicBox = createHostNode("ink-box", {});
  appendChild(container, dynamicBox);
  assert.equal(container.__inkSubtreeHasStatic, false);

  setNodeProps(dynamicBox, { __inkStatic: true });
  assert.equal(container.__inkSubtreeHasStatic, true);

  setNodeProps(dynamicBox, {});
  assert.equal(container.__inkSubtreeHasStatic, false);

  const staticChild = createHostNode("ink-box", { __inkStatic: true });
  appendChild(container, staticChild);
  assert.equal(container.__inkSubtreeHasStatic, true);
  removeChild(container, staticChild);
  assert.equal(container.__inkSubtreeHasStatic, false);
});
